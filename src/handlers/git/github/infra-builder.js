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
import { LAYOUT_VERSION } from "../../../core/path-builder.js";
import { createDebugger } from "../../../lib/debug.js";
import { decodeBase64Utf8 } from "../../../lib/base64.js";
import { getPagesHtml, getRepoReadme } from "./pages-template.js";
import { fetchAccountContext, canWriteWorkflows, dropWorkflowItems } from "./permissions.js";
import {
  apiFetch,
  getCommitHistory,
  getContents,
  listDirectory,
  createBlob,
} from "./api-client.js";
import { DEFAULT_THEME, getThemePalette } from "../../../core/theme-engine.js";
import { computeSnapshot, configFromSettings } from "../../../core/gamification.js";
import { buildPublishPlan } from "../../../core/gamification-publisher.js";
import { REFRESH_BADGES_SCRIPT } from "../../../vendor/refresh-badges-source.js";

const dbg = createDebugger("GitHubInfra");

// token → Promise<Set<string>|null>. One GET /user per token per service-worker
// lifetime; scope grants cannot change under a live token without a reconnect,
// which also produces a new token string.
const _scopesByToken = new Map();

function _getScopes(token) {
  if (!_scopesByToken.has(token)) {
    _scopesByToken.set(
      token,
      fetchAccountContext(token)
        .then((ctx) => ctx.scopes)
        .catch(() => null),
    );
  }
  return _scopesByToken.get(token);
}

let _warnedNoWorkflowScope = false;

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
 * @returns {Promise<{items: object[], gamification: {badgesPublished: boolean, workflowPublished: boolean}|null}>}
 *   `items` are tree items (path / mode / type / content, or sha:null to delete).
 *   `gamification` is what the caller must persist *after* the commit lands —
 *   recording it before would leave the badges orphaned in the repository if
 *   the push failed, with nothing left to tell a later commit to remove them.
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
  const dynamic = await _buildDynamicFiles(owner, repo, branch, token, settings, indexMetaOverride);
  items.push(...dynamic.items);

  // Bootstrap files — only on first commit so they never re-dirty the tree
  if (isNewRepo) {
    items.push(...(await _buildBootstrapFiles(owner, repo, token, settings)));
  }

  let gamification = dynamic.gamification;

  // A token without the `workflow` scope cannot touch anything under
  // .github/workflows/ — GitHub rejects the whole push over the one file, a 422
  // that would cost the user the solve riding in the same commit. Drop the
  // workflow items (writes and deletions alike) and let everything else land.
  // Unknown scopes (fine-grained PAT, GitHub App) fail open: the push itself
  // stays the real check, exactly as the option-hiding helpers do.
  if (items.some((i) => typeof i?.path === "string" && i.path.startsWith(".github/workflows/"))) {
    if (!canWriteWorkflows(await _getScopes(token))) {
      const gated = dropWorkflowItems(items, gamification, settings);
      items.length = 0;
      items.push(...gated.items);
      gamification = gated.gamification;
      if (!_warnedNoWorkflowScope) {
        _warnedNoWorkflowScope = true;
        dbg.warn(
          `buildInfraFiles(): token lacks the \`workflow\` scope — skipped ${gated.dropped.join(", ")}. ` +
            "Reconnect GitHub to let CodeLedger manage the Pages deploy workflow.",
        );
      }
    }
  }

  dbg.log(`buildInfraFiles(): ${items.length} infra file(s) (isNewRepo=${isNewRepo})`);
  return { items, gamification };
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
  return existing.slice(0, si) + newBlock + existing.slice(ei + STATS_END.length);
}

/** Decode GitHub's base64-encoded file content (handles line-wrapped base64). */
function _decodeContent(encoded) {
  try {
    return decodeBase64Utf8(encoded);
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

// How long a recorded Pages URL is trusted before it is re-read from the API.
const PAGES_URL_RECHECK_MS = 24 * 60 * 60 * 1000;

/**
 * The Pages URL to build badges and README links against, re-checked against
 * `GET /repos/{owner}/{repo}/pages` at most once a day.
 *
 * `github_pages_url` was previously written once at onboarding and never again,
 * so it silently rotted the moment the site's address changed — a user who
 * later put a custom domain on the Pages site kept a README full of badge URLs
 * pointing at the old address, which in the observed case was an unrelated SPA
 * answering every path with HTML. The nightly refresh then faithfully
 * regenerated the broken block from the stale URL baked into badges/config.json.
 *
 * Only a URL GitHub itself returned is recorded (same rule as onboarding). A
 * 404 means Pages is no longer enabled, so the stored URL is cleared and the
 * badges fall back to repo-relative paths. Any other failure keeps the stored
 * value and leaves the recheck timestamp unstamped so the next build retries.
 *
 * @returns {Promise<string>} "" when no Pages site is known to exist
 */
async function _refreshPagesUrl(owner, repo, token, settings) {
  const stored = settings?.github_pages_url || "";
  const last = Number(settings?.github_pages_url_checked_at) || 0;
  if (Date.now() - last < PAGES_URL_RECHECK_MS) return stored;

  let fresh;
  try {
    const pages = await apiFetch(`/repos/${owner}/${repo}/pages`, token);
    let url = typeof pages?.html_url === "string" ? pages.html_url : "";
    // GitHub reports `http://` for a custom domain until HTTPS is enforced;
    // once it is, address the badges over HTTPS so the README never mixes
    // schemes.
    if (url && pages?.https_enforced) url = url.replace(/^http:\/\//, "https://");
    fresh = url || stored;
  } catch (err) {
    if (err?.status !== 404) return stored;
    // 404 = Pages is not enabled on this repo, so whatever URL was stored no
    // longer serves anything.
    fresh = "";
  }

  const patch = { github_pages_url_checked_at: Date.now() };
  if (fresh !== stored) {
    patch.github_pages_url = fresh;
    dbg.log(`_refreshPagesUrl(): Pages URL changed "${stored}" → "${fresh}"`);
  }
  await Storage.updateSettings(patch).catch(() => {});
  // Piggyback on the daily live read (not just on change): a homepage left
  // stale before this sync existed would otherwise never be corrected, because
  // the settings URL has long since caught up and `fresh === stored` forever.
  await _syncRepoHomepage(owner, repo, token, fresh, stored);
  return fresh;
}

const _normalizeUrl = (u) =>
  String(u || "")
    .replace(/\/+$/, "")
    .toLowerCase();

/**
 * Decide whether the repository homepage should be rewritten to `fresh`.
 * Pure so the guard is testable: only a homepage CodeLedger plausibly wrote is
 * replaced — empty, the previously stored Pages URL, or the generic
 * `{owner}.github.io[/{repo}]` address. A homepage the user typed themselves is
 * never touched.
 *
 * @param {string} current  Homepage currently on the repository
 * @param {string} fresh    The Pages URL GitHub reports now ("" = Pages off)
 * @param {string} stored   The Pages URL last recorded in settings
 * @param {string} owner
 * @param {string} repo
 * @returns {boolean}
 */
export function homepageNeedsSync(current, fresh, stored, owner, repo) {
  if (_normalizeUrl(current) === _normalizeUrl(fresh)) return false;
  if (!current) return true;
  if (stored && _normalizeUrl(current) === _normalizeUrl(stored)) return true;
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const generic = new RegExp(`^https?://${esc(owner)}\\.github\\.io(/${esc(repo)})?/?$`, "i");
  return generic.test(current);
}

/**
 * Keep the repository homepage (the "About" website link) in step with the
 * Pages URL. Onboarding writes it once with the address GitHub reported at
 * creation time; when the user later puts a custom domain on the site, GitHub
 * updates `html_url` but not the homepage, so the repo's public link keeps
 * pointing at the retired `{owner}.github.io` address. Failures are logged and
 * swallowed — the homepage is cosmetic and must never cost the commit.
 */
async function _syncRepoHomepage(owner, repo, token, fresh, stored) {
  let current;
  try {
    const info = await apiFetch(`/repos/${owner}/${repo}`, token);
    current = typeof info?.homepage === "string" ? info.homepage : "";
  } catch (_) {
    return; // cannot read the current homepage — do not overwrite blind
  }
  if (!homepageNeedsSync(current, fresh, stored, owner, repo)) return;
  try {
    await apiFetch(`/repos/${owner}/${repo}`, token, {
      method: "PATCH",
      body: JSON.stringify({ homepage: fresh }),
    });
    dbg.log(`_syncRepoHomepage(): homepage "${current}" → "${fresh}"`);
  } catch (err) {
    dbg.warn(`_syncRepoHomepage(): PATCH failed — ${err?.message || err}`);
  }
}

async function _buildDynamicFiles(owner, repo, branch, token, settings, indexMetaOverride = null) {
  const theme = await Storage.getTheme().catch(() => null);
  const pagesTheme = _buildPagesTheme(theme);
  // Use caller-supplied meta when available (e.g. REFRESH_INFRA passes fresh local data).
  // Avoids the one-commit-lag where README is generated from the OLD repo index.json.
  const indexMeta =
    indexMetaOverride ?? (await _readIndexMeta(owner, repo, token).catch(() => null));

  const items = [];

  if (settings?.github_pages !== false) {
    const pageHtml = await _buildPagesContent(owner, repo, token, pagesTheme, settings);
    items.push({
      path: "index.html",
      mode: "100644",
      type: "blob",
      content: pageHtml,
    });
  }

  // ── README: read-before-write so user content outside the markers is kept ──
  // Empty when no Pages site is known, so the README links to the repository
  // rather than to a guessed `{owner}.github.io` address. That guess is a 404
  // for anyone who never enabled Pages, and cannot be anything else for a
  // private repository on a free plan, where Pages is not offered at all.
  const pagesUrl = await _refreshPagesUrl(owner, repo, token, settings);
  const newStatsBlock = getRepoReadme(owner, repo, pagesUrl, pagesTheme, settings, indexMeta);
  let currentText = null;
  let merged = newStatsBlock;
  let readmeReadable = true;
  try {
    const existing = await getContents(owner, repo, "README.md", token);
    currentText = existing?.content ? _decodeContent(existing.content) : null;
    if (currentText) merged = _mergeReadme(currentText, newStatsBlock);
  } catch (err) {
    // Only a 404 proves there is no README to preserve. Any other failure
    // (network drop, 5xx, 403) means the file may exist but could not be read
    // — a "fresh" write would then destroy whatever the user wrote outside the
    // markers. Skip the README this commit; the next one merges normally.
    readmeReadable = err?.status === 404;
  }

  // ── Gamification badges ───────────────────────────────────────────────────
  // Runs against the merged README rather than the stored one, so the badge
  // block and the stats block are reconciled in a single write instead of
  // fighting over the file across two commits.
  //
  // The badges get the Pages URL only when Pages is known to be serving them —
  // the freshly re-checked one from above, never a guess. With no URL,
  // `badgeMarkdown` addresses them relative to the repository, which needs no
  // Pages site at all.
  const badgeBase = settings?.github_pages === false ? "" : pagesUrl;
  const gami = await _buildGamificationFiles(owner, repo, branch, settings, merged, badgeBase);
  if (gami) {
    items.push(...gami.items);
    if (typeof gami.readme === "string") merged = gami.readme;
  }

  if (!readmeReadable) {
    dbg.error("_buildDynamicFiles(): README read failed (non-404) — skipping README this commit");
  } else if (merged !== currentText) {
    items.push({ path: "README.md", mode: "100644", type: "blob", content: merged });
    dbg.log("_buildDynamicFiles(): README updated");
  } else {
    dbg.log("_buildDynamicFiles(): README unchanged — skipping");
  }

  // ── deploy-pages.yml: keep current so existing repos get path-filter fix ──
  try {
    const existing = await getContents(owner, repo, ".github/workflows/deploy-pages.yml", token);
    const currentText = existing?.content ? _decodeContent(existing.content) : null;
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

  return { items, gamification: gami ? gami.state : null };
}

/**
 * Badge SVGs, the refresh config, and the scheduled workflow — or the deletions
 * that remove them once the user switches the feature off.
 *
 * Returns null when the feature has never published anything and is switched
 * off, which is the common case for anyone who does not want it: no snapshot is
 * computed and no extra files touch the tree.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {Record<string, any>} settings
 * @param {string} readme  README the rest of this build already merged
 * @param {string} pagesUrl  "" when no Pages site is known — badges then use
 *   repository-relative paths rather than a URL that would 404
 * @returns {Promise<{items: object[], readme: string|undefined, state: {badgesPublished: boolean, workflowPublished: boolean}}|null>}
 */
async function _buildGamificationFiles(owner, repo, branch, settings, readme, pagesUrl) {
  try {
    // No `.catch(() => [])` here: a transient IndexedDB failure must skip this
    // build (the outer catch treats badges as decoration), not masquerade as an
    // empty library — that path computed an all-zero snapshot and committed it,
    // which is exactly the "badges suddenly show 0" report.
    const problems = await Storage.getAllProblems();
    const { vacations } = await Storage.getGamificationState().catch(() => ({ vacations: [] }));
    const snapshot = computeSnapshot(problems, {
      config: configFromSettings(settings),
      vacations,
      streakFloorDay: settings?.installDay || undefined,
    });

    const plan = buildPublishPlan({
      snapshot,
      settings,
      vacations,
      readme,
      pagesUrl,
      username: owner,
      repo,
      branch,
      repoPrivate: settings?.github_repo_private === true,
      refreshScript: REFRESH_BADGES_SCRIPT,
    });

    if (plan.intent === "idle") return null;

    const items = [];
    let nextReadme;
    for (const file of plan.files) {
      if (file.path === "README.md") {
        nextReadme = file.content;
        continue; // folded into the single README write above
      }
      items.push({ path: file.path, mode: "100644", type: "blob", content: file.content });
    }
    for (const path of plan.deletes) {
      items.push({ path, mode: "100644", type: "blob", sha: null });
    }

    dbg.log(
      `_buildGamificationFiles(): ${plan.intent} — ${items.length} item(s), ` +
        `streak ${snapshot.currentStreak}d`,
    );

    return {
      items,
      readme: nextReadme,
      state: {
        badgesPublished: plan.badgesPublished,
        // Mirrors the same condition buildPublishPlan used, so a later revoke
        // knows whether there is a workflow to remove.
        workflowPublished: plan.files.some((f) =>
          f.path.startsWith(".github/workflows/codeledger"),
        ),
      },
    };
  } catch (e) {
    // Badges are decoration. A failure here must never cost the user a commit
    // that carries their solution.
    dbg.warn("_buildGamificationFiles(): skipped (non-fatal):", e?.message);
    return null;
  }
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
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
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
      dbg.warn(`_buildBootstrapFiles(): skipping image ${assetPath}:`, e?.message);
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
      const commits = await getCommitHistory(owner, repo, { per_page: 20 }, token);
      const list = Array.isArray(commits) ? commits : [];
      const verified = list.filter((c) => c?.commit?.verification?.verified).length;
      commitSummary = { total: list.length, verified };
      commitList = list.slice(0, 20).map((c) => ({
        sha: c.sha,
        url: c.html_url || `https://github.com/${owner}/${repo}/commit/${c.sha}`,
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
      .filter((e) => e.type === "file" && /\.(png|jpe?g|svg|gif|webp)$/i.test(e.name))
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
    // The contents API inlines files only up to 1 MB — above that it returns
    // `content: ""` with `encoding: "none"`. A full index.json crosses 1 MB
    // easily, and treating that as "no stats" is what baked zeros into the
    // README shields. The blob endpoint serves the same object up to 100 MB.
    let b64 = file?.content;
    if (!b64 && file?.sha) {
      const blob = await apiFetch(`/repos/${owner}/${repo}/git/blobs/${file.sha}`, token);
      b64 = blob?.content;
    }
    if (!b64) return null;
    const parsed = JSON.parse(decodeBase64Utf8(b64));
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
