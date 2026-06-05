/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * infra-builder.js — Repository infrastructure file generator.
 *
 * Two categories of infra files:
 *
 *   Bootstrap files  — written once when the repo is created (LICENSE,
 *                      .gitignore, .codeledger/config.json). Content is
 *                      stable so they never needlessly re-dirty a commit.
 *
 *   Dynamic files    — regenerated on every commit so stats stay current
 *                      (index.html GitHub Pages dashboard, README.md).
 *
 * `buildInfraFiles` is the public entry point called by index.js:
 *   - new repo  → returns bootstrap + dynamic files
 *   - existing  → returns dynamic files only
 *
 * @ts-check
 */

import { Storage } from "../../../core/storage.js";
import { CONSTANTS } from "../../../core/constants.js";
import { LAYOUT_VERSION } from "../../../core/path-builder.js";
import { createDebugger } from "../../../lib/debug.js";
import { getPagesHtml, getRepoReadme } from "./pages-template.js";
import {
  getCommitHistory,
  getContents,
  listDirectory,
  createBlob,
} from "./api-client.js";
import { DEFAULT_THEME, getThemePalette } from "../../../core/theme-engine.js";

const dbg = createDebugger("GitHubInfra");

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Return tree items for repository infrastructure.
 *
 * @param {string}  owner
 * @param {string}  repo
 * @param {string}  branch
 * @param {string}  token
 * @param {object}  settings   Extension settings object
 * @param {boolean} isNewRepo  True when the repo was just created
 * @returns {Promise<object[]>} Tree items (path / mode / type / content)
 */
export async function buildInfraFiles(
  owner,
  repo,
  branch,
  token,
  settings,
  isNewRepo = false,
  indexMetaOverride = null,
) {
  const items = [];

  // Dynamic files — always up to date
  const dynamic = await _buildDynamicFiles(
    owner,
    repo,
    token,
    settings,
    indexMetaOverride,
  );
  items.push(...dynamic);

  // Bootstrap files — only on first commit so they never re-dirty the tree
  if (isNewRepo) {
    items.push(...(await _buildBootstrapFiles(owner, repo, token, settings)));
  }

  dbg.log(
    `buildInfraFiles(): ${items.length} infra file(s) (isNewRepo=${isNewRepo})`,
  );
  return items;
}

// ── Dynamic files (index.html + README.md + deploy workflow) ─────────────────

const STATS_START = "<!-- CODELEDGER_AUTO_GENERATED_START -->";
const STATS_END = "<!-- CODELEDGER_AUTO_GENERATED_END -->";

/**
 * Merge the auto-generated stats block into an existing README.
 * Preserves any content the user wrote outside the CodeLedger markers.
 * If markers are absent (new repo or user removed them), returns the full block.
 */
function _mergeReadme(existing, newBlock) {
  const si = existing.indexOf(STATS_START);
  const ei = existing.indexOf(STATS_END);
  if (si === -1 || ei === -1 || ei < si) return newBlock;
  return (
    existing.slice(0, si) + newBlock + existing.slice(ei + STATS_END.length)
  );
}

/** Decode GitHub's base64-encoded file content (handles line-wrapped base64). */
function _decodeContent(encoded) {
  try {
    return atob(encoded.replace(/\n/g, ""));
  } catch (_) {
    return null;
  }
}

/** The deploy-pages workflow written to the user's repo (kept up-to-date on every infra build). */
const DEPLOY_PAGES_YML = `name: Deploy GitHub Pages

on:
  push:
    branches: [main]
    # Only re-deploy when site content actually changes.
    # README-only commits (e.g. from external stats bots) are skipped,
    # preventing the tug-of-war where two workflows fight over README.md.
    paths:
      - "index.html"
      - "index.json"
      - "problems/**"
      - "chats/**"

# Cancel any queued/running build when a newer commit arrives.
concurrency:
  group: pages
  cancel-in-progress: true

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;

async function _buildDynamicFiles(
  owner,
  repo,
  token,
  settings,
  indexMetaOverride = null,
) {
  const theme = await Storage.getTheme().catch(() => null);
  const pagesTheme = _buildPagesTheme(theme);
  // Use caller-supplied meta when available (e.g. REFRESH_INFRA passes fresh local data).
  // Avoids the one-commit-lag where README is generated from the OLD repo index.json.
  const indexMeta =
    indexMetaOverride ??
    (await _readIndexMeta(owner, repo, token).catch(() => null));

  const items = [];

  if (settings?.github_pages !== false) {
    const pageHtml = await _buildPagesContent(
      owner,
      repo,
      token,
      pagesTheme,
      settings,
    );
    items.push({
      path: "index.html",
      mode: "100644",
      type: "blob",
      content: pageHtml,
    });
  }

  // ── README: read-before-write so user content outside the markers is kept ──
  const pagesUrl =
    settings?.github_pages_url || `https://${owner}.github.io/${repo}/`;
  const newStatsBlock = getRepoReadme(
    owner,
    repo,
    pagesUrl,
    pagesTheme,
    settings,
    indexMeta,
  );
  try {
    const existing = await getContents(owner, repo, "README.md", token);
    const currentText = existing?.content
      ? _decodeContent(existing.content)
      : null;
    const merged = currentText
      ? _mergeReadme(currentText, newStatsBlock)
      : newStatsBlock;
    if (merged !== currentText) {
      items.push({
        path: "README.md",
        mode: "100644",
        type: "blob",
        content: merged,
      });
      dbg.log("_buildDynamicFiles(): README updated (stats section changed)");
    } else {
      dbg.log("_buildDynamicFiles(): README unchanged — skipping");
    }
  } catch (_) {
    // 404 or network error — write fresh
    items.push({
      path: "README.md",
      mode: "100644",
      type: "blob",
      content: newStatsBlock,
    });
  }

  // ── deploy-pages.yml: keep current so existing repos get path-filter fix ──
  try {
    const existing = await getContents(
      owner,
      repo,
      ".github/workflows/deploy-pages.yml",
      token,
    );
    const currentText = existing?.content
      ? _decodeContent(existing.content)
      : null;
    if (currentText !== DEPLOY_PAGES_YML) {
      items.push({
        path: ".github/workflows/deploy-pages.yml",
        mode: "100644",
        type: "blob",
        content: DEPLOY_PAGES_YML,
      });
      dbg.log("_buildDynamicFiles(): deploy-pages.yml updated");
    }
  } catch (_) {
    // Not present — will be created by bootstrap or skip (non-fatal)
  }

  // ── update-stats.yml: delete if present — it commits README changes that
  //    conflict with CodeLedger's own per-commit README management. ──────────
  try {
    await getContents(owner, repo, ".github/workflows/update-stats.yml", token);
    // File exists — mark for deletion by committing a null-sha blob
    items.push({
      path: ".github/workflows/update-stats.yml",
      mode: "100644",
      type: "blob",
      sha: null,
    });
    dbg.log("_buildDynamicFiles(): scheduling update-stats.yml for deletion");
  } catch (_) {
    // Not present — nothing to do
  }

  return items;
}

// ── Bootstrap files (LICENSE / .gitignore / config / images) ─────────────────

async function _buildBootstrapFiles(owner, repo, token, settings) {
  const year = new Date().getFullYear();

  const items = [
    {
      // GitHub Pages deploy workflow — cancel-in-progress prevents wasted builds
      // when CodeLedger commits multiple times in quick succession.
      // Pairs with build_type:"workflow" set by enablePages() in api-client.js.
      path: ".github/workflows/deploy-pages.yml",
      mode: "100644",
      type: "blob",
      content: `name: Deploy GitHub Pages

on:
  push:
    branches: [main]

# Cancel any queued/running build when a newer commit arrives.
# This prevents wasted builds from rapid consecutive CodeLedger commits.
concurrency:
  group: pages
  cancel-in-progress: true

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`,
    },
    {
      path: "LICENSE",
      mode: "100644",
      type: "blob",
      content: `Copyright ${year} CodeLedger contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`,
    },
    {
      path: ".gitignore",
      mode: "100644",
      type: "blob",
      content: `node_modules/
.env
.env.local
dist/
build/
*.log
.DS_Store
`,
    },
    {
      // Stable JSON — no timestamps, so content never changes after creation
      path: ".codeledger/config.json",
      mode: "100644",
      type: "blob",
      content: JSON.stringify(
        {
          version: "1.0",
          extension: "CodeLedger",
          layoutVersion: LAYOUT_VERSION,
          description: "Managed by the CodeLedger browser extension",
        },
        null,
        2,
      ),
    },
  ];

  // Commit extension branding images as binary blobs
  const imageAssets = [
    "assets/images/logo.png",
    "assets/images/icon-transparent.png",
    "assets/images/icon-dark-bg.png",
  ];
  for (const assetPath of imageAssets) {
    try {
      const url =
        typeof chrome !== "undefined" && chrome.runtime?.getURL
          ? chrome.runtime.getURL(assetPath)
          : null;
      if (!url) continue;
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.byteLength; i++)
        binary += String.fromCharCode(bytes[i]);
      const b64 = btoa(binary);
      const blob = await createBlob(owner, repo, b64, token);
      items.push({
        path: assetPath,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      });
      dbg.log(`_buildBootstrapFiles(): added image ${assetPath}`);
    } catch (e) {
      dbg.warn(
        `_buildBootstrapFiles(): skipping image ${assetPath}:`,
        e?.message,
      );
    }
  }

  return items;
}

// ── GitHub Pages builder ──────────────────────────────────────────────────────

async function _buildPagesContent(owner, repo, token, pagesTheme, settings) {
  let commitSummary = null;
  let commitList = [];
  let reportImages = [];

  // Commit verification summary (opt-in)
  if (settings?.pages_show_verification) {
    try {
      const commits = await getCommitHistory(
        owner,
        repo,
        { per_page: 20 },
        token,
      );
      const list = Array.isArray(commits) ? commits : [];
      const verified = list.filter(
        (c) => c?.commit?.verification?.verified,
      ).length;
      commitSummary = { total: list.length, verified };
      commitList = list.slice(0, 20).map((c) => ({
        sha: c.sha,
        url:
          c.html_url || `https://github.com/${owner}/${repo}/commit/${c.sha}`,
        message: c.commit?.message?.split("\n")[0] || "",
        author: c.author?.login || c.commit?.author?.name || "",
        verified: !!c.commit?.verification?.verified,
      }));
    } catch (e) {
      dbg.warn("Failed to fetch commit summary:", e.message);
    }
  }

  // Report images — listed from the directory, not from commit history
  try {
    const entries = await listDirectory(owner, repo, "report-images", token);
    reportImages = entries
      .filter(
        (e) => e.type === "file" && /\.(png|jpe?g|svg|gif|webp)$/i.test(e.name),
      )
      .map((e) => e.path);
  } catch (_) {}

  return getPagesHtml({
    theme: pagesTheme,
    settings,
    commitSummary,
    reportImages,
    commitList,
    owner,
    repo,
  });
}

// ── Pages theme helper ────────────────────────────────────────────────────────

function _buildPagesTheme(theme = null) {
  const base = { ...DEFAULT_THEME, ...(theme || {}) };
  const dark = getThemePalette({ ...base, mode: "dark" });
  const light = getThemePalette({ ...base, mode: "light" });

  return {
    mode: base.mode || "dark",
    preset: base.preset || "material-dark",
    dark: {
      bg: dark["bg-primary"],
      surface: dark["bg-secondary"] || dark["bg-primary"],
      border: dark["border-color"] || "rgba(255,255,255,.08)",
      text: dark["text-primary"],
      muted: dark["text-muted"] || dark["text-secondary"],
      accent: dark["primary-color"],
    },
    light: {
      bg: light["bg-primary"],
      surface: light["bg-secondary"] || light["bg-primary"],
      border: light["border-color"] || "rgba(15,23,42,.12)",
      text: light["text-primary"],
      muted: light["text-muted"] || light["text-secondary"],
      accent: light["primary-color"],
    },
  };
}

// ── index.json meta reader ────────────────────────────────────────────────────

async function _readIndexMeta(owner, repo, token) {
  try {
    const file = await getContents(owner, repo, "index.json", token);
    if (!file?.content) return null;
    const parsed = JSON.parse(atob(file.content.replace(/\n/g, "")));
    return {
      stats: parsed.stats || null,
      summary: parsed.meta?.summary || null,
      updatedAt: parsed.updatedAt || null,
      problems: (parsed.problems || []).slice(0, 10),
    };
  } catch (_) {
    return null;
  }
}

// ── Repository topics ─────────────────────────────────────────────────────────

const DEFAULT_TOPICS = [
  "code-ledger",
  "dsa",
  "leetcode",
  "algorithms",
  "dynamic-programming",
  "graphs",
  "trees",
  "arrays",
  "hashing",
  "greedy",
];

/**
 * Merge default topics with user-configured extras.
 * GitHub allows at most 20 topics per repo.
 */
export function resolveRepoTopics(settings = {}) {
  const extras = String(settings.github_repo_topics_extra || "")
    .split(",")
    .map(_normalizeTopic)
    .filter(Boolean);

  return [...new Set([...DEFAULT_TOPICS, ...extras])].slice(0, 20);
}

function _normalizeTopic(t) {
  return String(t || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
