#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Imports all accepted LeetCode submissions into a GitHub repository.
 *
 * Usage:
 *   node leetcode-importer.js --github-token=TOKEN --repo=owner/repo
 *   node leetcode-importer.js --github-token=TOKEN --repo=owner/repo --cookie=LEETCODE_SESSION=...
 *   node leetcode-importer.js --github-token=TOKEN --repo=owner/repo --headless=false
 */

import puppeteer from "puppeteer";
import { Octokit } from "octokit";
import { parseArgs } from "node:util";

// ── GraphQL queries ────────────────────────────────────────────────────────────

const SUBMISSION_DETAIL_QUERY = `
  query submissionDetails($submissionId: Int!) {
    submissionDetails(submissionId: $submissionId) {
      runtime
      runtimeDisplay
      runtimePercentile
      memory
      memoryDisplay
      memoryPercentile
      code
      timestamp
      statusCode
      lang {
        name
        verboseName
      }
      question {
        questionId
        titleSlug
        title
        difficulty
      }
    }
  }
`;

const QUESTION_QUERY = `
  query questionData($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      questionId
      questionFrontendId
      title
      titleSlug
      content
      difficulty
      acRate
      likes
      dislikes
      topicTags { name slug }
      similarQuestionList { title titleSlug difficulty isPaidOnly }
      hints
    }
  }
`;

// ── Utilities ──────────────────────────────────────────────────────────────────

const LANG_EXT = {
  python: "py", python3: "py", cpp: "cpp", "c++": "cpp",
  c: "c", java: "java", javascript: "js", typescript: "ts",
  ruby: "rb", golang: "go", go: "go", swift: "swift",
  kotlin: "kt", scala: "scala", rust: "rs", php: "php",
  csharp: "cs", "c#": "cs", dart: "dart",
  mysql: "sql", postgresql: "sql", bash: "sh",
};

function langExt(name = "") {
  return LANG_EXT[name.toLowerCase().replace(/\s+/g, "")] || "txt";
}

function waitForEnter() {
  return new Promise((resolve) => {
    process.stdin.setRawMode(false);
    process.stdin.resume();
    process.stdout.write("Press ENTER after logging in to LeetCode...\n");
    process.stdin.once("data", () => {
      process.stdin.pause();
      resolve();
    });
  });
}

// ── LeetCode fetch helpers (run inside Puppeteer page context) ────────────────

async function fetchAllSubmissions(page) {
  // Try the REST submissions dump first (fastest, returns up to 2000)
  try {
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/submissions/?offset=0&limit=2000", {
        credentials: "include",
      });
      return r.ok ? r.json() : null;
    });
    const list = res?.submissions_dump || res?.submissions;
    if (list?.length) return list;
  } catch (_) {}

  // Fallback: GraphQL recentAcSubmissionList (authenticated endpoint)
  try {
    const res = await page.evaluate(async () => {
      const q = `
        query recentAcSubmissions {
          recentAcSubmissionList(limit: 2000) {
            id title titleSlug lang timestamp
          }
        }
      `;
      const r = await fetch("/graphql", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, variables: {} }),
      });
      return r.ok ? r.json() : null;
    });
    const list = res?.data?.recentAcSubmissionList;
    if (list?.length) return list.map((s) => ({ ...s, status_display: "Accepted" }));
  } catch (_) {}

  throw new Error(
    "Unable to fetch submissions from LeetCode — make sure you are logged in.",
  );
}

async function gql(page, query, variables) {
  return page.evaluate(
    async (q, v) => {
      const r = await fetch("/graphql", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ query: q, variables: v }),
      });
      return r.ok ? r.json() : null;
    },
    query,
    variables,
  );
}

// ── GitHub helpers ────────────────────────────────────────────────────────────

async function ensureRepo(octokit, owner, repoName) {
  try {
    await octokit.request("GET /repos/{owner}/{repo}", {
      owner,
      repo: repoName,
    });
    console.log(`Repository ${owner}/${repoName} exists.`);
  } catch {
    console.log(`Creating repository ${owner}/${repoName}...`);
    await octokit.request("POST /user/repos", {
      name: repoName,
      description: "DSA solutions imported via CodeLedger",
      private: false,
      auto_init: true,
    });
    // Give GitHub a moment to initialize the default branch
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function getHeadSha(octokit, owner, repoName, branch) {
  try {
    const ref = await octokit.request(
      "GET /repos/{owner}/{repo}/git/ref/heads/{branch}",
      { owner, repo: repoName, branch },
    );
    return { commitSha: ref.data.object.sha, isNew: false };
  } catch {
    // Empty repo — no branch yet. Create an initial empty commit.
    const blob = await octokit.request(
      "POST /repos/{owner}/{repo}/git/blobs",
      { owner, repo: repoName, content: "", encoding: "utf-8" },
    );
    const tree = await octokit.request(
      "POST /repos/{owner}/{repo}/git/trees",
      { owner, repo: repoName, tree: [{ path: ".gitkeep", mode: "100644", type: "blob", sha: blob.data.sha }] },
    );
    const commit = await octokit.request(
      "POST /repos/{owner}/{repo}/git/commits",
      { owner, repo: repoName, message: "chore: initial commit", tree: tree.data.sha, parents: [] },
    );
    await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
      owner,
      repo: repoName,
      ref: `refs/heads/${branch}`,
      sha: commit.data.sha,
    });
    return { commitSha: commit.data.sha, isNew: true };
  }
}

async function atomicCommit(octokit, owner, repoName, branch, files, message, parentSha) {
  // Get current tree SHA from the parent commit
  const parentCommit = await octokit.request(
    "GET /repos/{owner}/{repo}/git/commits/{commit_sha}",
    { owner, repo: repoName, commit_sha: parentSha },
  );
  const baseTreeSha = parentCommit.data.tree.sha;

  const treeItems = files.map((f) => ({
    path: f.path,
    mode: "100644",
    type: "blob",
    content: f.content,
  }));

  const treeRes = await octokit.request(
    "POST /repos/{owner}/{repo}/git/trees",
    { owner, repo: repoName, base_tree: baseTreeSha, tree: treeItems },
  );

  const commitRes = await octokit.request(
    "POST /repos/{owner}/{repo}/git/commits",
    { owner, repo: repoName, message, tree: treeRes.data.sha, parents: [parentSha] },
  );

  await octokit.request(
    "PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}",
    { owner, repo: repoName, branch, sha: commitRes.data.sha },
  );

  return commitRes.data.sha;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const { values } = parseArgs({
    options: {
      "github-token": { type: "string" },
      repo:           { type: "string" },
      cookie:         { type: "string" },
      headless:       { type: "boolean", short: "H", default: true },
    },
  });

  const githubToken = values["github-token"] || process.env.GITHUB_TOKEN;
  const repo        = values.repo || process.env.LEETCODE_REPO;
  const cookie      = values.cookie;
  const headless    = values.headless;

  if (!githubToken || !repo) {
    console.error(
      "Usage: node leetcode-importer.js --github-token=TOKEN --repo=owner/repo [--cookie=SESSION_COOKIE] [--no-headless]",
    );
    process.exit(1);
  }

  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    console.error("--repo must be in owner/repo format.");
    process.exit(1);
  }

  // ── Puppeteer ────────────────────────────────────────────────────────────
  const browser = await puppeteer.launch({ headless });
  const page    = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  if (cookie) {
    const [nameValue] = cookie.split(";");
    const eqIdx = nameValue.indexOf("=");
    const name  = nameValue.slice(0, eqIdx).trim();
    const value = nameValue.slice(eqIdx + 1).trim();
    await page.setCookie({ name, value, domain: ".leetcode.com", path: "/" });
  }

  await page.goto("https://leetcode.com", { waitUntil: "networkidle2" });

  const loggedIn = await page.evaluate(
    () =>
      !!document.querySelector('[data-e2e-locator="nav-user-avatar"]') ||
      !!document.querySelector('a[href^="/profile/"]') ||
      !!document.querySelector('img[alt="profile"]'),
  );

  if (!loggedIn) {
    await page.goto("https://leetcode.com/accounts/login", { waitUntil: "networkidle2" });
    await waitForEnter();
    await page.goto("https://leetcode.com", { waitUntil: "networkidle2" });
  }

  // ── Fetch submissions ─────────────────────────────────────────────────────
  console.log("Fetching submission list (this may take a moment)...");
  const raw = await fetchAllSubmissions(page);

  const normalized = raw.map((s) => ({
    id:        s.id || s.submission_id,
    titleSlug: s.title_slug || s.titleSlug,
    status:    s.status_display || s.statusDisplay || s.status || "",
    lang:      s.lang || s.langName || "",
    timestamp: Number(s.timestamp || 0),
  })).filter((s) => s.id && s.titleSlug);

  const accepted = normalized.filter((s) => /accepted/i.test(s.status));

  // Dedupe: keep most-recent accepted per (slug, lang) pair
  const deduped = new Map();
  for (const s of accepted) {
    const key = `${s.titleSlug}::${s.lang}`;
    const existing = deduped.get(key);
    if (!existing || s.timestamp > existing.timestamp) deduped.set(key, s);
  }

  const picks = Array.from(deduped.values());
  console.log(`Found ${picks.length} unique accepted submissions to import.`);
  if (!picks.length) {
    await browser.close();
    return;
  }

  // ── Build file tree ───────────────────────────────────────────────────────
  const files = [];

  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    process.stdout.write(`[${i + 1}/${picks.length}] ${p.titleSlug}... `);

    try {
      const detailRes = await gql(page, SUBMISSION_DETAIL_QUERY, { submissionId: Number(p.id) });
      const detail    = detailRes?.data?.submissionDetails;
      if (!detail?.code) { console.log("no code, skipping"); continue; }

      const questionRes = await gql(page, QUESTION_QUERY, { titleSlug: p.titleSlug });
      const question    = questionRes?.data?.question;

      const langVerbose = detail.lang?.verboseName || detail.lang?.name || p.lang || "Solution";
      const ext         = langExt(detail.lang?.name || p.lang);
      const topic       = question?.topicTags?.[0]?.name || "Uncategorized";
      const title       = question?.title || p.titleSlug;
      const base        = `topics/${topic}/${p.titleSlug}/`;

      files.push({
        path:    `${base}${langVerbose.replace(/\s+/g, "_")}.${ext}`,
        content: detail.code,
      });

      if (question?.content) {
        const stats = [
          detail.runtimeDisplay  ? `- Runtime: ${detail.runtimeDisplay}${detail.runtimePercentile ? ` (beats ${detail.runtimePercentile.toFixed(1)}%)` : ""}` : "",
          detail.memoryDisplay   ? `- Memory: ${detail.memoryDisplay}${detail.memoryPercentile   ? ` (beats ${detail.memoryPercentile.toFixed(1)}%)`  : ""}` : "",
        ].filter(Boolean).join("\n");

        const similar = (question.similarQuestionList || [])
          .filter((q) => !q.isPaidOnly)
          .slice(0, 5)
          .map((q) => `- [${q.title}](https://leetcode.com/problems/${q.titleSlug}/) — ${q.difficulty}`)
          .join("\n");

        files.push({
          path: `${base}README.md`,
          content: [
            `# ${question.questionFrontendId ? `[${question.questionFrontendId}] ` : ""}${title}`,
            "",
            `**Difficulty:** ${question.difficulty || "?"}  |  **Acceptance:** ${question.acRate ? question.acRate.toFixed(1) + "%" : "?"}`,
            "",
            `**Tags:** ${(question.topicTags || []).map((t) => `\`${t.name}\``).join(", ") || "—"}`,
            "",
            "## Problem",
            "",
            question.content
              .replace(/<[^>]+>/g, "")
              .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
              .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
              .replace(/\n{3,}/g, "\n\n")
              .trim(),
            "",
            stats ? `## My Submission\n\n${stats}\n` : "",
            similar ? `## Similar Problems\n\n${similar}\n` : "",
          ].filter(Boolean).join("\n"),
        });
      }

      console.log(`done (${langVerbose})`);
    } catch (e) {
      console.log(`failed: ${e.message || e}`);
    }
  }

  await browser.close();

  if (!files.length) {
    console.log("No files to commit.");
    return;
  }

  // ── GitHub commit ─────────────────────────────────────────────────────────
  const octokit = new Octokit({ auth: githubToken });
  const authUser = await octokit.request("GET /user");
  const authedLogin = authUser.data.login;

  if (owner !== authedLogin) {
    console.error(`Token owner is ${authedLogin} but --repo owner is ${owner}. Aborting.`);
    process.exit(1);
  }

  await ensureRepo(octokit, owner, repoName);

  const branch = "main";
  const { commitSha: headSha } = await getHeadSha(octokit, owner, repoName, branch);

  console.log(`\nCommitting ${files.length} files to ${owner}/${repoName}@${branch}...`);
  const newSha = await atomicCommit(
    octokit,
    owner,
    repoName,
    branch,
    files,
    `chore: import ${picks.length} solutions from LeetCode profile`,
    headSha,
  );
  console.log(`Committed: ${newSha}`);

  // Update index.json
  try {
    const indexContent = JSON.stringify(
      {
        importedAt:  new Date().toISOString(),
        totalFiles:  files.length,
        source:      "leetcode",
        files:       files.map((f) => f.path),
      },
      null,
      2,
    );

    await atomicCommit(
      octokit,
      owner,
      repoName,
      branch,
      [{ path: "index.json", content: indexContent }],
      `chore: update index.json (${files.length} imported files)`,
      newSha,
    );
    console.log("index.json updated.");
  } catch (e) {
    console.warn("Failed to update index.json:", e.message || e);
  }

  console.log("\nImport complete!");
}

run().catch((err) => {
  console.error("Importer failed:", err);
  process.exit(1);
});
