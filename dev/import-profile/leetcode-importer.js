#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import puppeteer from "puppeteer";
import { Octokit } from "octokit";
import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";

const SUBMISSIONS_API = "/api/submissions/";

const SUBMISSION_DETAIL_QUERY = `
  query submissionDetails($submissionId: Int!) {
    submissionDetails(submissionId: $submissionId) {
      runtime
      runtimeDisplay
      runtimePercentile
      memory
      memoryDisplay
      code
      timestamp
      statusCode
      statusDisplay
      lang {
        name
        verboseName
      }
      question {
        questionId
        titleSlug
        title
      }
    }
  }
`;

const QUESTION_QUERY = `
  query questionData($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      questionId
      title
      titleSlug
      content
      difficulty
      topicTags { name slug }
      hints
    }
  }
`;

function waitForEnter() {
  return new Promise((resolve) => {
    process.stdin.setRawMode(false);
    process.stdin.resume();
    console.log("Press ENTER after you finish logging into LeetCode...");
    process.stdin.once("data", () => resolve());
  });
}

function mapLangToExt(lang) {
  if (!lang) return "txt";
  const n = lang.toLowerCase();
  if (n.includes("python")) return "py";
  if (n.includes("c++") || n === "cpp") return "cpp";
  if (n.includes("c#") || n === "csharp") return "cs";
  if (n.includes("java")) return "java";
  if (n.includes("javascript") || n === "js") return "js";
  if (n.includes("typescript") || n === "ts") return "ts";
  if (n.includes("ruby")) return "rb";
  if (n.includes("go")) return "go";
  return "txt";
}

async function fetchAllSubmissions(page) {
  // Best-effort: try REST submissions API which returns a big dump
  try {
    const res = await page.evaluate(async (apiPath) => {
      const r = await fetch(`${apiPath}?offset=0&limit=2000`, {
        credentials: "include",
      });
      return r.ok ? r.json() : { ok: false };
    }, SUBMISSIONS_API);

    if (res && (res.submissions_dump || res.submissions)) {
      return res.submissions_dump || res.submissions;
    }
  } catch (e) {
    // ignore and fall through to GraphQL approach
  }

  // Fallback: try GraphQL to probe recent submissions via the user's profile endpoint
  try {
    const graphqlRes = await page.evaluate(async () => {
      const q = `query recentSubmissions { recentSubmissionList { submissions { id titleSlug title timestamp statusDisplay lang } } }`;
      const r = await fetch("/graphql", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, variables: {} }),
      });
      return r.ok ? r.json() : { ok: false };
    });
    if (graphqlRes && graphqlRes.data && graphqlRes.data.recentSubmissionList) {
      return graphqlRes.data.recentSubmissionList.submissions;
    }
  } catch (e) {
    // ignore
  }

  throw new Error(
    "Unable to fetch submissions from LeetCode. Ensure you are logged in.",
  );
}

async function fetchSubmissionDetail(page, submissionId) {
  const res = await page.evaluate(
    async (query, variables) => {
      const r = await fetch("/graphql", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      return r.ok ? r.json() : null;
    },
    SUBMISSION_DETAIL_QUERY,
    { submissionId: Number(submissionId) },
  );

  return res?.data?.submissionDetails || null;
}

async function fetchQuestion(page, titleSlug) {
  const res = await page.evaluate(
    async (query, variables) => {
      const r = await fetch("/graphql", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      return r.ok ? r.json() : null;
    },
    QUESTION_QUERY,
    { titleSlug },
  );

  return res?.data?.question || null;
}

async function run() {
  const parsed = parseArgs({
    options: {
      "github-token": { type: "string" },
      repo: { type: "string" },
      cookie: { type: "string" },
      headless: { type: "boolean", short: "h" },
      username: { type: "string" },
    },
  });
  const githubToken = parsed.values["github-token"] || process.env.GITHUB_TOKEN;
  const repo = parsed.values.repo;
  const cookie = parsed.values.cookie;
  const headless =
    parsed.values.headless !== undefined ? parsed.values.headless : true;

  if (!githubToken) {
    console.error(
      "Missing GitHub token. Provide --github-token or set GITHUB_TOKEN env var.",
    );
    process.exit(1);
  }
  if (!repo) {
    console.error("Missing --repo argument (format: owner/repo).");
    process.exit(1);
  }

  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    console.error("--repo must be in owner/repo format");
    process.exit(1);
  }

  const browser = await puppeteer.launch({ headless });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });

  if (cookie) {
    // Accept cookie format 'LEETCODE_SESSION=...; path=/; domain=.leetcode.com'
    const [nameValue] = cookie.split(";");
    const [name, value] = nameValue.split("=");
    await page.setCookie({
      name: name.trim(),
      value: value.trim(),
      domain: ".leetcode.com",
      path: "/",
    });
  }

  await page.goto("https://leetcode.com", { waitUntil: "networkidle2" });

  // Check login state
  const loggedIn = await page.evaluate(
    () =>
      !!document.querySelector('a[href^="/profile/"]') ||
      !!document.querySelector('img[alt="profile"]'),
  );
  if (!loggedIn) {
    console.log("Not logged in to LeetCode. Opening login page.");
    await page.goto("https://leetcode.com/accounts/login", {
      waitUntil: "networkidle2",
    });
    console.log("Please log in in the opened browser tab.");
    await waitForEnter();
    await page.goto("https://leetcode.com", { waitUntil: "networkidle2" });
  }

  console.log("Fetching submissions (this may take a moment)...");
  const submissions = await fetchAllSubmissions(page);

  // Normalize submission objects
  const normalized = submissions
    .map((s) => ({
      id: s.id || s.submission_id || s.submissionId || s["submission_id"],
      title:
        s.title || s.titleSlug || s.title_slug || s.questionTitle || s.title,
      titleSlug:
        s.title_slug ||
        s.titleSlug ||
        s.titleSlug ||
        s.questionSlug ||
        s.titleSlug,
      status:
        s.status_display || s.statusDisplay || s.status || s.status_display,
      lang: s.lang || s.langName || s.language || s.lang,
      timestamp: s.timestamp || s.time || s.submission_time || 0,
    }))
    .filter(Boolean);

  // Keep only accepted submissions and dedupe by (titleSlug, lang)
  const accepted = normalized.filter((s) => /accepted/i.test(s.status));
  const deduped = new Map();
  for (const s of accepted) {
    const key = `${s.titleSlug}::${s.lang || "unknown"}`;
    const existing = deduped.get(key);
    if (!existing || (s.timestamp && s.timestamp > existing.timestamp)) {
      deduped.set(key, s);
    }
  }

  const picks = Array.from(deduped.values());
  console.log(`Found ${picks.length} unique accepted submissions to import.`);

  // Collect files to commit
  const files = [];

  for (const p of picks) {
    try {
      const detail = await fetchSubmissionDetail(page, p.id);
      const question = await fetchQuestion(page, p.titleSlug);

      const code = detail?.code || detail?.codeText || "";
      const langVerbose = detail?.lang?.verboseName || p.lang || "Solution";
      const ext = mapLangToExt(detail?.lang?.name || p.lang);
      const topic =
        (question?.topicTags &&
          question.topicTags[0] &&
          question.topicTags[0].name) ||
        "Uncategorized";
      const basePath = `topics/${topic}/${p.titleSlug}/`;

      files.push({
        path: `${basePath}${langVerbose.replace(/\s+/g, "_")}.${ext}`,
        content: code || "// (no code available)",
      });
      if (question?.content)
        files.push({
          path: `${basePath}README.html`,
          content: `<!-- imported from LeetCode -->\n${question.content}`,
        });

      console.log(`Prepared ${p.titleSlug} (${langVerbose})`);
    } catch (e) {
      console.warn(
        `Skipping ${p.titleSlug}: failed to fetch details`,
        e.message || e,
      );
    }
  }

  if (!files.length) {
    console.log("No files prepared to commit. Exiting.");
    await browser.close();
    process.exit(0);
  }

  // Commit to GitHub via Octokit
  const octokit = new Octokit({ auth: githubToken });
  const authUser = await octokit.request("GET /user");
  const authedLogin = authUser.data.login;

  // If repo doesn't exist and owner === authedLogin, create it.
  let repoExists = true;
  try {
    await octokit.request("GET /repos/{owner}/{repo}", {
      owner,
      repo: repoName,
    });
  } catch (e) {
    repoExists = false;
  }

  if (!repoExists) {
    if (owner === authedLogin) {
      console.log(
        `Repository ${owner}/${repoName} not found — creating under your account.`,
      );
      await octokit.request("POST /user/repos", {
        name: repoName,
        description: "Imported DSA solutions via CodeLedger importer",
        private: false,
      });
      // wait shortly
      await new Promise((r) => setTimeout(r, 1500));
    } else {
      console.error(
        `Repository ${owner}/${repoName} not found and cannot be created for owner ${owner}. Aborting.`,
      );
      process.exit(1);
    }
  }

  const branch = "main";

  // Get latest commit SHA
  const refRes = await octokit.request(
    "GET /repos/{owner}/{repo}/git/ref/heads/{branch}",
    { owner, repo: repoName, branch },
  );
  const latestCommitSha = refRes.data.object.sha;

  const commitObj = await octokit.request(
    "GET /repos/{owner}/{repo}/git/commits/{commit_sha}",
    { owner, repo: repoName, commit_sha: latestCommitSha },
  );
  const baseTreeSha = commitObj.data.tree.sha;

  // Create tree
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

  const message = `chore: import ${files.length} files from LeetCode profile`;
  const commitRes = await octokit.request(
    "POST /repos/{owner}/{repo}/git/commits",
    {
      owner,
      repo: repoName,
      message,
      tree: treeRes.data.sha,
      parents: [latestCommitSha],
    },
  );

  await octokit.request("PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}", {
    owner,
    repo: repoName,
    branch,
    sha: commitRes.data.sha,
  });

  console.log(
    `Imported ${files.length} files into ${owner}/${repoName} on branch ${branch}`,
  );

  // Optionally update index.json
  try {
    let indexObj = { stats: { total: files.length }, problems: [] };
    try {
      const idx = await octokit.request(
        "GET /repos/{owner}/{repo}/contents/{path}",
        { owner, repo: repoName, path: "index.json", ref: branch },
      );
      if (idx.data && idx.data.content) {
        indexObj =
          JSON.parse(
            Buffer.from(idx.data.content, "base64").toString("utf8"),
          ) || indexObj;
      }
    } catch (e) {
      // no existing index.json
    }

    // Add simple problem entries
    for (const f of files) {
      indexObj.problems.push({
        path: f.path,
        importedAt: new Date().toISOString(),
      });
    }
    indexObj.stats.total = indexObj.problems.length;

    // Commit updated index.json
    const idxTree = [
      {
        path: "index.json",
        mode: "100644",
        type: "blob",
        content: JSON.stringify(indexObj, null, 2),
      },
    ];
    const treeRes2 = await octokit.request(
      "POST /repos/{owner}/{repo}/git/trees",
      { owner, repo: repoName, base_tree: treeRes.data.sha, tree: idxTree },
    );
    const commit2 = await octokit.request(
      "POST /repos/{owner}/{repo}/git/commits",
      {
        owner,
        repo: repoName,
        message: `chore: update index.json (${files.length} imported)`,
        tree: treeRes2.data.sha,
        parents: [commitRes.data.sha],
      },
    );
    await octokit.request(
      "PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}",
      { owner, repo: repoName, branch, sha: commit2.data.sha },
    );
    console.log("index.json updated");
  } catch (e) {
    console.warn("Failed to update index.json:", e.message || e);
  }

  await browser.close();
}

run().catch((err) => {
  console.error("Importer failed:", err);
  process.exit(1);
});
import puppeteer from "puppeteer";
import { Octokit } from "octokit";
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";

const { values } = parseArgs({
  options: {
    "github-token": { type: "string" },
    repo: { type: "string" },
    cookie: { type: "string" },
  },
});

async function main() {
  if (!values["github-token"] || !values.repo) {
    console.error(
      "Usage: node leetcode-importer.js --github-token=TOKEN --repo=owner/repo [--cookie=STRING]",
    );
    process.exit(1);
  }

  console.log("Automated Profile Import for LeetCode...");

  const browser = await puppeteer.launch({ headless: !!values.cookie });
  const page = await browser.newPage();

  if (values.cookie) {
    await page.setCookie({
      name: "LEETCODE_SESSION",
      value: values.cookie,
      domain: ".leetcode.com",
    });
  }

  await page.goto("https://leetcode.com", { waitUntil: "networkidle2" });

  // 1. Fetch user submissions via graphql
  console.log("Fetching submission list...");
  // Logic simplified for code generation

  // 2. Format structure
  console.log("Building local structure...");

  // 3. Commit to GitHub via Octokit Tree API
  const [owner, name] = values.repo.split("/");
  const octokit = new Octokit({ auth: values["github-token"] });

  console.log(`Checking repo: ${owner}/${name}`);
  // Single atomic commit...

  console.log("Import complete! (Simulated)");
  await browser.close();
}

main();
