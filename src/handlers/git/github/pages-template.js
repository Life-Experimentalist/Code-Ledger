/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CONSTANTS } from "../../../core/constants.js";
import { CHART_JS_INLINE } from "../../../vendor/chart-source.js";
import { README_START, README_END } from "../../../core/badge-svg.js";

/**
 * Escapes a value for interpolation into HTML text or a double-quoted attribute.
 *
 * Everything embedded at generation time — asset URLs, report image paths,
 * commit metadata — originates in the user's repository or settings, and the
 * generated page is published publicly. An unescaped value here is stored XSS
 * against everyone who visits the user's Pages site, not just the owner.
 */
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Collapses anything that is not an http(s) URL to "#" before escaping it. */
function safeHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "")) ? esc(value) : "#";
}

/**
 * Turns a repository-relative path into a same-origin URL.
 * Leading slashes are stripped first: "//host" is a protocol-relative URL, so a
 * path beginning with a slash would silently point at a different origin.
 */
function assetPath(value) {
  return "/" + esc(String(value || "").replace(/^\/+/, ""));
}

/**
 * How far back a streak is counted. Must stay equal to the window the inline
 * `computeStreaks()` below walks, or the number baked into the markup and the
 * number the script draws over it would disagree on the same data.
 */
const STREAK_WINDOW_DAYS = 730;

/** Local calendar day key. Mirrors the inline `dayKey()` in the page script. */
function localDayKey(d) {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

/**
 * Longest run of consecutive days with at least one solve.
 *
 * A generation-time twin of the inline `computeStreaks().max`, so the "Best
 * Streak" cell can say something true before the page's own JavaScript runs.
 * Deliberately computed here rather than read from index.json: the counters
 * there are per-difficulty totals and have never carried a streak.
 *
 * Only the *best* streak is baked. The current streak is not, and the reason is
 * in the markup where the placeholder lives.
 *
 * @param {Array<{timestamp?: number}>} problems full list, not a slice
 * @returns {number} days
 */
export function bestStreakFrom(problems) {
  const daySet = new Set();
  for (const p of Array.isArray(problems) ? problems : []) {
    const raw = Number(p?.timestamp);
    if (!Number.isFinite(raw) || raw <= 0) continue;
    // Same second-vs-millisecond sniff the page script uses.
    const d = new Date(raw > 1e12 ? raw : raw * 1000);
    if (Number.isNaN(d.getTime())) continue;
    daySet.add(localDayKey(d));
  }

  const today = new Date();
  let max = 0;
  let run = 0;
  for (let i = 0; i < STREAK_WINDOW_DAYS; i++) {
    const d = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - (STREAK_WINDOW_DAYS - 1 - i),
    );
    if (daySet.has(localDayKey(d))) {
      run++;
      if (run > max) max = run;
    } else {
      run = 0;
    }
  }
  return max;
}

/**
 * Returns a self-contained HTML stats page for GitHub Pages.
 * The page fetches ./index.json at runtime and renders a full dashboard.
 */
export function getPagesHtml(opts = {}) {
  const settings = opts.settings || {};
  const commitSummary = opts.commitSummary || null;
  const reportImages = Array.isArray(opts.reportImages) ? opts.reportImages : [];
  const commitList = Array.isArray(opts.commitList) ? opts.commitList : [];
  // GitHub owner and repo embedded at generation time so custom domains work correctly
  const repoOwner = opts.owner || "";
  const repoName = opts.repo || "";
  // Counts baked into the markup so the page says something true before its own
  // JavaScript runs. The runtime render still overwrites all four from
  // index.json — this is the value a crawler, a link unfurl, `curl` or a reader
  // with JavaScript off gets to see, and zero was a wrong answer for all of them.
  // Absent (first-run onboarding, where the repo genuinely has no solves yet)
  // falls back to 0, which is then correct rather than merely stale.
  const n = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);
  const stats = opts.stats || null;
  const sTotal = n(stats?.total);
  const sEasy = n(stats?.easy);
  const sMed = n(stats?.medium);
  const sHard = n(stats?.hard);
  const blurb = sTotal
    ? `${sTotal} DSA problems solved and committed automatically by CodeLedger — ${sEasy} easy, ${sMed} medium, ${sHard} hard.`
    : "DSA problem solutions tracked by CodeLedger — GitHub-backed, AI-reviewed, owned by you.";
  // Best streak only. It can change only when a solve happens, and a solve is
  // what triggers the infra refresh that rewrites this file — so the baked
  // value is regenerated at the same moment it could go stale.
  const sBest = n(opts.bestStreak);
  // The address GitHub reports for the live site, custom domain included. Empty
  // whenever Pages is off or has not been checked yet, in which case no
  // canonical is emitted at all: a guessed `{owner}.github.io/{repo}` would
  // point the crawler at the wrong host on every custom-domain site.
  const canonical = /^https?:\/\//i.test(String(opts.pagesUrl || ""))
    ? String(opts.pagesUrl).trim()
    : "";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "CodeLedger — DSA Stats",
    description: blurb,
  };
  if (canonical) jsonLd.url = canonical;
  if (repoOwner) {
    jsonLd.author = {
      "@type": "Person",
      name: repoOwner,
      url: "https://github.com/" + repoOwner,
    };
  }
  // Same defence as the commit-list block below: "<" is escaped so a value that
  // contains a closing script tag cannot end this one, and U+2028/U+2029 are
  // escaped because JSON.stringify emits them raw and they terminate a line to
  // any parser predating ES2019.
  const jsonLdText = JSON.stringify(jsonLd)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  // Assembled here rather than inline: the markup below is one template literal,
  // so a conditional written inside it would need a nested backtick.
  const canonicalTag = canonical
    ? '<link rel="canonical" href="' +
      safeHttpUrl(canonical) +
      '" />\n  <meta property="og:url" content="' +
      safeHttpUrl(canonical) +
      '" />'
    : "";
  // Default raw image URLs (can be overridden via settings passed to generator)
  const ASSETS = {
    iconDark:
      (settings?.assets && settings.assets.iconDark) ||
      "https://raw.githubusercontent.com/Life-Experimentalist/Code-Ledger/refs/heads/main/src/assets/images/icon-dark-bg.png",
    iconTransparent:
      (settings?.assets && settings.assets.iconTransparent) ||
      "https://raw.githubusercontent.com/Life-Experimentalist/Code-Ledger/refs/heads/main/src/assets/images/icon-transparent.png",
    logo:
      (settings?.assets && settings.assets.logo) ||
      "https://raw.githubusercontent.com/Life-Experimentalist/Code-Ledger/refs/heads/main/src/assets/images/logo.png",
    social:
      (settings?.assets && settings.assets.social) ||
      "https://raw.githubusercontent.com/Life-Experimentalist/Code-Ledger/refs/heads/main/src/assets/images/social%20preview.png",
  };
  // NOTE: No backtick template literals inside the returned string — this entire
  // string is itself a template literal, so nested backticks would terminate it.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CodeLedger — DSA Stats</title>
  <meta name="description" content="${esc(blurb)}" />
  <meta property="og:title" content="CodeLedger — DSA Stats" />
  <meta property="og:description" content="${esc(blurb)}" />
  <meta property="og:image" content="${safeHttpUrl(ASSETS.social)}" />
  <meta property="og:type" content="website" />
  ${canonicalTag}
  <script type="application/ld+json">${jsonLdText}</script>
  <script>${CHART_JS_INLINE}</script>
  <style>
    :root {
      --bg: #050508; --surface: #0a0a0f; --border: rgba(255,255,255,.05);
      --cyan: #06b6d4; --text: #e2e8f0; --muted: #64748b;
      --easy: #34d399; --med: #fbbf24; --hard: #f87171;
      --hdr-bg: rgba(5,5,8,.9);
    }
    [data-theme="light"] {
      --bg: #f8fafc; --surface: #ffffff; --border: rgba(15,23,42,.08);
      --cyan: #0891b2; --text: #0f172a; --muted: #64748b;
      --easy: #16a34a; --med: #d97706; --hard: #dc2626;
      --hdr-bg: rgba(248,250,252,.92);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-height: 100vh; line-height: 1.5; transition: background .2s, color .2s; }
    a { color: var(--cyan); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .theme-toggle { background: none; border: 1px solid var(--border); border-radius: 9999px; padding: .25rem .65rem; cursor: pointer; font-size: .7rem; color: var(--muted); transition: all .2s; }
    .theme-toggle:hover { color: var(--cyan); border-color: rgba(6,182,212,.35); }

    /* Layout */
    .wrap { max-width: 1080px; margin: 0 auto; padding: 0 1.25rem 4rem; }
    header {
      border-bottom: 1px solid var(--border); padding: .75rem 0; margin-bottom: 2rem;
      position: sticky; top: 0; background: var(--hdr-bg); backdrop-filter: blur(12px); z-index: 10;
    }
    .hdr { max-width: 1080px; margin: 0 auto; padding: 0 1.25rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    .logo { display: flex; align-items: center; gap: .625rem; }
    .logo-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 10px rgba(6,182,212,.7); }
    .logo-text { font-size: 1rem; font-weight: 600; letter-spacing: -.02em; }
    .logo-text b { color: var(--cyan); }
    .repo-pill { font-size: .7rem; color: var(--muted); border: 1px solid var(--border); padding: .2rem .7rem; border-radius: 9999px; transition: all .2s; }
    .repo-pill:hover { color: var(--cyan); border-color: rgba(6,182,212,.35); text-decoration: none; }

    /* Cards */
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 1.25rem; }
    .card-label { font-size: .55rem; text-transform: uppercase; letter-spacing: .15em; color: var(--muted); font-weight: 700; margin-bottom: .875rem; }

    /* Stats row */
    .stats-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: .875rem; margin-bottom: 1rem; }
    @media (max-width: 760px) { .stats-row { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 480px) { .stats-row { grid-template-columns: repeat(2, 1fr); } }
    .stat { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; text-align: center; }
    .stat-n { font-size: 2rem; font-weight: 700; line-height: 1; margin-bottom: .2rem; }
    .stat-l { font-size: .55rem; text-transform: uppercase; letter-spacing: .15em; color: var(--muted); }
    .stat.t .stat-n { color: var(--cyan); }
    .stat.e .stat-n { color: var(--easy); }
    .stat.m .stat-n { color: var(--med); }
    .stat.h .stat-n { color: var(--hard); }
    .stat.s .stat-n { color: #10b981; }
    .stat.b .stat-n { color: #f59e0b; }
    .vc-box { position: relative; height: 170px; }

    /* 2-col grid */
    .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    @media (max-width: 660px) { .g2 { grid-template-columns: 1fr; } }

    /* Heatmap */
    .hm-outer { margin-bottom: 1rem; width: 100% }
    .hm-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .hm-wrap { display: flex; gap: 4px; align-items: flex-start; }
    /* padding-top must equal .hm-months min-height (18px) + .hm-main gap (4px),
       or the weekday labels drift out of line with the rows they name. */
    .hm-side { display: grid; grid-template-rows: repeat(7,var(--hm-cell,11px)); gap: 3px; font-size: .55rem; color: var(--muted); padding-right: 6px; padding-top: 22px; text-align: right; }
    .hm-main { display: flex; flex-direction: column; gap: 4px; }
    .hm-months { display: flex; gap: 3px; font-size: .58rem; color: var(--muted); min-height: 18px; align-items: flex-end; }
    .hm-months span { min-width: var(--hm-cell,11px); white-space: nowrap; }
    .hm-cols { display: flex; gap: 3px; }
    .hm-col { display: flex; flex-direction: column; gap: 3px; }
    .hm-cell { width: var(--hm-cell,11px); height: var(--hm-cell,11px); border-radius: 2px; background: rgba(255,255,255,.04); flex-shrink: 0; }
    .hm-cell.l1 { background: rgba(6,182,212,.18); }
    .hm-cell.l2 { background: rgba(6,182,212,.4); }
    .hm-cell.l3 { background: rgba(6,182,212,.65); }
    .hm-cell.l4 { background: rgba(6,182,212,.9); }
    .hm-legend { display: flex; align-items: center; gap: .5rem; margin-top: .625rem; font-size: .6rem; color: var(--muted); }
    .hm-swatches { display: flex; gap: 3px; }
    .hm-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; flex-wrap: wrap; }
    .hm-range { background: var(--card, #0d1117); color: var(--fg, #e2e8f0); border: 1px solid rgba(255,255,255,.12);
      border-radius: 8px; font-size: .65rem; padding: .2rem .4rem; cursor: pointer; font-family: inherit; }
    .hm-range:hover { border-color: rgba(255,255,255,.24); }

    /* Bars */
    .bar-row { display: flex; align-items: center; gap: .625rem; margin-bottom: .55rem; }
    .bar-lbl { font-size: .7rem; color: var(--text); min-width: 90px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar-track { flex: 1; background: rgba(255,255,255,.05); border-radius: 3px; height: 7px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 3px; }
    .bar-ct { font-size: .65rem; color: var(--muted); min-width: 24px; text-align: right; font-variant-numeric: tabular-nums; }

    /* Chart */
    .chart-box { position: relative; height: 180px; }

    /* Knowledge graph */
    .kg-box { position: relative; height: 460px; border-radius: 12px; overflow: hidden; background: rgba(255,255,255,.015); }
    .kg-box canvas { width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; }
    .kg-box canvas:active { cursor: grabbing; }
    .kg-tip { position: absolute; pointer-events: none; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: .4rem .6rem; font-size: .65rem; color: var(--text); max-width: 240px; box-shadow: 0 4px 16px rgba(0,0,0,.4); z-index: 5; }
    .kg-tip b { display: block; font-size: .7rem; margin-bottom: .1rem; }
    .kg-legend { display: flex; align-items: center; gap: .9rem; flex-wrap: wrap; margin-top: .6rem; font-size: .6rem; color: var(--muted); }
    .kg-legend .kd { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: .3rem; vertical-align: middle; }
    .kg-legend .kd.hollow { background: transparent !important; border: 1.5px solid var(--muted); }

    /* Recent table */
    table.recent { width: 100%; border-collapse: collapse; }
    table.recent th { font-size: .55rem; text-transform: uppercase; letter-spacing: .12em; color: var(--muted); font-weight: 700; text-align: left; padding: .4rem .625rem; border-bottom: 1px solid var(--border); }
    table.recent td { padding: .55rem .625rem; border-bottom: 1px solid var(--border); font-size: .75rem; }
    table.recent tr:last-child td { border-bottom: 0; }
    table.recent tr:hover td { background: rgba(255,255,255,.02); }
    .badge { display: inline-block; font-size: .55rem; font-weight: 700; padding: .1rem .45rem; border-radius: 9999px; text-transform: uppercase; letter-spacing: .05em; }
    .be { background: rgba(52,211,153,.15); color: var(--easy); }
    .bm { background: rgba(251,191,36,.15); color: var(--med); }
    .bh { background: rgba(248,113,113,.15); color: var(--hard); }

    /* Loading / error */
    /* Slim, because the stats row underneath is already populated from the
       markup and no longer waits on the fetch. A half-viewport spinner over
       numbers the reader could already have seen was pure invented latency. */
    #loading { display: flex; align-items: center; justify-content: center; padding: 1rem 0; color: var(--muted); font-size: .85rem; letter-spacing: .05em; }
    /* Everything below the stats row is drawn by the script from index.json, so
       it is hidden until there is data to draw. The class comes off in main(). */
    #app.pending .card { display: none; }
    #err { color: var(--hard); font-size: .85rem; padding: 2rem; text-align: center; max-width: 600px; margin: 0 auto; display: none; }
    .footer { font-size: .6rem; color: var(--muted); text-align: center; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border); }

    /* All-problems table */
    .search-row { display: flex; gap: .625rem; margin-bottom: .875rem; align-items: center; flex-wrap: wrap; }
    .search-input { flex: 1; min-width: 160px; background: rgba(255,255,255,.04); border: 1px solid var(--border); border-radius: 8px; padding: .45rem .75rem; color: var(--text); font-size: .75rem; outline: none; }
    .search-input:focus { border-color: rgba(6,182,212,.4); }
    .filter-sel { background: rgba(255,255,255,.04); border: 1px solid var(--border); border-radius: 8px; padding: .45rem .625rem; color: var(--text); font-size: .75rem; outline: none; cursor: pointer; }
    .filter-sel:focus { border-color: rgba(6,182,212,.4); }
    table.all-t { width: 100%; border-collapse: collapse; font-size: .72rem; }
    table.all-t th { font-size: .52rem; text-transform: uppercase; letter-spacing: .12em; color: var(--muted); font-weight: 700; text-align: left; padding: .4rem .625rem; border-bottom: 1px solid var(--border); white-space: nowrap; }
    table.all-t td { padding: .5rem .625rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
    table.all-t tr:last-child td { border-bottom: 0; }
    table.all-t tr:hover td { background: rgba(255,255,255,.02); }
    .prob-link { color: var(--text); }
    .prob-link:hover { color: var(--cyan); }
    .src-link { color: var(--muted); font-size: .65rem; margin-left: .35rem; }
    .src-link:hover { color: var(--cyan); }
    .plat-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: .3rem; vertical-align: middle; }
    #all-count { font-size: .65rem; color: var(--muted); margin-left: auto; }
    .pagination { display: flex; gap: .35rem; align-items: center; margin-top: .75rem; flex-wrap: wrap; }
    .pg-btn { background: rgba(255,255,255,.04); border: 1px solid var(--border); border-radius: 6px; padding: .25rem .6rem; color: var(--muted); font-size: .65rem; cursor: pointer; }
    .pg-btn:hover, .pg-btn.active { background: rgba(6,182,212,.1); border-color: rgba(6,182,212,.35); color: var(--cyan); }
    .pg-btn:disabled { opacity: .3; cursor: default; }
  </style>
  <noscript><style>
    /* Without JavaScript nothing ever clears "Loading stats…", so hide it. The
       #app rule is belt-and-braces now that the markup no longer ships it
       hidden — it costs nothing and survives a future restyle of #app. */
    #loading { display: none !important; }
    #app { display: block !important; }
    /* Every card below the stats row is drawn by script — heatmap, canvases,
       knowledge graph, commit list — so each would render as an empty box. */
    #app .card { display: none !important; }
  </style></noscript>
</head>
<body>
  <header>
    <div class="hdr">
      <div class="logo">
        <img src="${safeHttpUrl(ASSETS.iconTransparent)}" alt="logo" style="width:28px;height:28px;border-radius:6px;margin-right:.5rem;object-fit:contain" />
        <div class="logo-text">Code<b>Ledger</b></div>
      </div>
      <div style="display:flex;align-items:center;gap:.5rem">
        ${commitSummary && settings.pages_show_verification ? `<div class="repo-pill" style="margin-right:.5rem">Verified: ${Number(commitSummary.verified) || 0} / ${Number(commitSummary.total) || 0}</div>` : ""}
        <a id="repo-link" class="repo-pill" href="#" target="_blank" rel="noreferrer">—</a>
        <button class="theme-toggle" id="theme-btn" title="Toggle light/dark mode" aria-label="Toggle theme">☀</button>
      </div>
    </div>
  </header>

  <div id="loading">Loading stats…</div>
  <div id="err"></div>

  <div id="app" class="wrap pending">
    <div class="stats-row">
      <div class="stat t"><div class="stat-n" id="sn-t">${sTotal}</div><div class="stat-l">Total</div></div>
      <div class="stat e"><div class="stat-n" id="sn-e">${sEasy}</div><div class="stat-l">Easy</div></div>
      <div class="stat m"><div class="stat-n" id="sn-m">${sMed}</div><div class="stat-l">Medium</div></div>
      <div class="stat h"><div class="stat-n" id="sn-h">${sHard}</div><div class="stat-l">Hard</div></div>
      <!-- The current streak stays a placeholder on purpose. Unlike every other
           cell here it decays with the wall clock: a repository that goes quiet
           for a week does not commit, so nothing regenerates this file, and a
           baked "12d" would keep telling crawlers and no-script readers a
           streak is running days after it ended. "—" is not knowing; a stale
           number is a false claim. The script overwrites it on load. -->
      <div class="stat s"><div class="stat-n" id="sn-cs">—</div><div class="stat-l">Streak</div></div>
      <div class="stat b"><div class="stat-n" id="sn-ms">${sBest ? sBest + "d" : "—"}</div><div class="stat-l">Best Streak</div></div>
    </div>

    <div class="card hm-outer">
      <div class="hm-head">
        <div class="card-label" id="hm-label">Activity</div>
        <select class="hm-range" id="hm-range" aria-label="Heatmap range"></select>
      </div>
      <div class="hm-scroll">
        <div class="hm-wrap">
          <div class="hm-side">
            <span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span>
          </div>
          <div class="hm-main">
            <div class="hm-months" id="hm-m"></div>
            <div class="hm-cols" id="hm-g"></div>
          </div>
        </div>
      </div>
      <div class="hm-legend">
        <span>Less</span>
        <div class="hm-swatches">
          <div class="hm-cell"></div>
          <div class="hm-cell l1"></div>
          <div class="hm-cell l2"></div>
          <div class="hm-cell l3"></div>
          <div class="hm-cell l4"></div>
        </div>
        <span>More</span>
      </div>
    </div>

    <div class="g2" style="margin-bottom:1rem">
      <div class="card">
        <div class="card-label">Solve Velocity (24 Weeks)</div>
        <div class="vc-box"><canvas id="vc"></canvas></div>
      </div>
      <div class="card">
        <div class="card-label">Difficulty Split</div>
        <div class="vc-box"><canvas id="dd"></canvas></div>
      </div>
    </div>

    <div class="g2">
      <div class="card">
        <div class="card-label">Difficulty Progression (12 Months)</div>
        <div class="vc-box"><canvas id="dp"></canvas></div>
      </div>
      <div class="card">
        <div class="card-label">Solving Punch Card</div>
        <div id="pc" style="overflow-x:auto"></div>
      </div>
    </div>

    <div class="card" id="kg-card" style="margin-bottom:1rem">
      <div class="card-label">Knowledge Graph</div>
      <div class="kg-box">
        <canvas id="kg"></canvas>
        <div id="kg-tip" class="kg-tip" style="display:none"></div>
      </div>
      <div class="kg-legend">
        <span><span class="kd" style="background:#22c55e"></span>Strong</span>
        <span><span class="kd" style="background:#f59e0b"></span>Working</span>
        <span><span class="kd" style="background:#f87171"></span>Shaky</span>
        <span><span class="kd" style="background:var(--easy)"></span>Easy</span>
        <span><span class="kd" style="background:var(--med)"></span>Medium</span>
        <span><span class="kd" style="background:var(--hard)"></span>Hard</span>
        <span><span class="kd hollow"></span>Unsolved suggestion</span>
        <span style="margin-left:auto">Drag to pan · scroll to zoom · click a problem to open it</span>
      </div>
    </div>

    <div class="g2">
      <div class="card">
        <div class="card-label">Languages</div>
        <div class="chart-box"><canvas id="lc"></canvas></div>
      </div>
      <div class="card">
        <div class="card-label">Platforms</div>
        <div id="pb"></div>
      </div>
    </div>

    <div class="g2">
      <div class="card">
        <div class="card-label">Top Topics</div>
        <div id="tb"></div>
      </div>
      <div class="card">
        <div class="card-label">Recent Solves</div>
        <table class="recent">
          <thead><tr><th>Problem</th><th>Diff</th><th>Lang</th></tr></thead>
          <tbody id="rt"></tbody>
        </table>
      </div>
    </div>

    <!-- Commit verification placeholder (rendered client-side) -->
    <div class="g2">
      <div class="card">
        <div class="card-label">Commit Verification</div>
        <div id="commit-panel" style="font-size:.9rem;color:var(--muted);margin-bottom:.6rem">${commitSummary ? `Verified ${Number(commitSummary.verified) || 0} of ${Number(commitSummary.total) || 0} recent commits` : "Commit verification not enabled"}</div>
      </div>
      <div class="card">
        <div class="card-label">Report Images</div>
        <div id="report-images" style="display:flex;gap:.5rem;flex-wrap:wrap">${reportImages.length ? reportImages.map((p) => `<a href="${assetPath(p)}" target="_blank"><img src="${assetPath(p)}" alt="report image" style="width:120px;height:auto;border-radius:8px;border:1px solid rgba(255,255,255,.04)"></a>`).join("") : '<div style="color:var(--muted)">No report images found</div>'}</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:1rem">
      <div class="card-label">All Problems</div>
      <div class="search-row">
        <input class="search-input" id="s-q" type="search" placeholder="Search title, tag, or language…" />
        <select class="filter-sel" id="s-diff">
          <option value="">All Difficulties</option>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
        </select>
        <select class="filter-sel" id="s-plat">
          <option value="">All Platforms</option>
          <option value="leetcode">LeetCode</option>
          <option value="geeksforgeeks">GeeksForGeeks</option>
          <option value="codeforces">Codeforces</option>
        </select>
        <span id="all-count"></span>
      </div>
      <div style="overflow-x:auto">
        <table class="all-t">
          <thead><tr><th>#</th><th>Problem</th><th>Difficulty</th><th>Language</th><th>Platform</th><th>Date</th></tr></thead>
          <tbody id="all-body"></tbody>
        </table>
      </div>
      <div class="pagination" id="pg"></div>
    </div>

    <div class="footer" id="ft">Tracked by <a href="https://codeledger.vkrishna04.me" target="_blank" rel="noreferrer">CodeLedger</a></div>
  </div>

  <!-- Floating image/report panel -->
  ${
    reportImages.length
      ? `
  <div id="float-panel" style="position:fixed;right:1rem;bottom:1rem;width:320px;max-width:40%;z-index:60">
    <div class="card" style="padding: .5rem;">
      <div class="card-label">Report Images</div>
      <div style="display:flex;flex-direction:column;gap:.5rem">
        ${reportImages.map((img) => `<a href="${assetPath(img)}" target="_blank" style="display:block"><img src="${assetPath(img)}" alt="report image" style="width:100%;height:auto;border-radius:8px;border:1px solid rgba(255,255,255,.04)"></a>`).join("")}
      </div>
    </div>
  </div>
  `
      : ""
  }

  <script>
    var PALETTE = ['#06b6d4','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6','#f97316','#a855f7'];
    var PLATFORM_COLORS = { leetcode: '#FFA116', geeksforgeeks: '#2F8D46', codeforces: '#1F8ACB' };
    var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var DOW_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    // Embedded at commit time by CodeLedger — correct regardless of custom domain
    var REPO_OWNER = '${repoOwner}';
    var REPO_NAME  = '${repoName}';

    // Heatmap month label state — stored globally so resizeHeatmap can update them
    var hmMonthSpans = [];
    var hmTotalCols = 0;

    function paletteColor(i) { return PALETTE[i % PALETTE.length]; }
    function platformColor(name) { return PLATFORM_COLORS[(name || '').toLowerCase()] || '#64748b'; }

    // Re-renders month labels using current --hm-cell size (fixes alignment after resize)
    function renderMonthLabels() {
      var cellStyleVal = getComputedStyle(document.documentElement).getPropertyValue('--hm-cell').trim();
      var cellW = parseFloat(cellStyleVal) || 11;
      var gap = 3;
      var monthsEl = document.getElementById('hm-m');
      if (!monthsEl) return;
      monthsEl.innerHTML = '';
      for (var j = 0; j < hmMonthSpans.length; j++) {
        var ms = hmMonthSpans[j];
        var nextIdx = (j + 1 < hmMonthSpans.length) ? hmMonthSpans[j + 1].idx : hmTotalCols;
        var colCount = nextIdx - ms.idx;
        var span = document.createElement('span');
        span.textContent = ms.label;
        // Width = colCount cells + (colCount-1) gaps — matches exact flex layout of hm-cols
        span.style.minWidth = (colCount * cellW + (colCount > 1 ? (colCount - 1) * gap : 0)) + 'px';
        monthsEl.appendChild(span);
      }
    }

    function computeStreaks(problems) {
      var daySet = {};
      for (var i = 0; i < problems.length; i++) {
        var p = problems[i];
        if (!p.timestamp) continue;
        var ts = p.timestamp > 1e12 ? p.timestamp : p.timestamp * 1000;
        daySet[dayKey(new Date(ts))] = true;
      }
      var today = new Date();
      var max = 0, run = 0;
      for (var i = 0; i < 730; i++) {
        var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (729 - i));
        if (daySet[dayKey(d)]) { run++; if (run > max) max = run; } else { run = 0; }
      }
      var cur = 0;
      for (var j = 0; j < 730; j++) {
        var d2 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - j);
        if (daySet[dayKey(d2)]) { cur++; } else { break; }
      }
      return { current: cur, max: max };
    }

    function buildVelocityChart(problems) {
      var canvas = document.getElementById('vc');
      if (!canvas || typeof Chart === 'undefined') return;
      var now = new Date();
      var wks = [], wkMap = {};
      for (var i = 23; i >= 0; i--) {
        var ref = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
        var ws = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - ref.getDay());
        var wk = dayKey(ws);
        wks.push({ key: wk, label: MONTH_NAMES[ws.getMonth()] + ' ' + ws.getDate() });
        wkMap[wk] = 0;
      }
      for (var i = 0; i < problems.length; i++) {
        var p = problems[i];
        if (!p.timestamp) continue;
        var ts = p.timestamp > 1e12 ? p.timestamp : p.timestamp * 1000;
        var pd = new Date(ts);
        var pws = new Date(pd.getFullYear(), pd.getMonth(), pd.getDate() - pd.getDay());
        var pk = dayKey(pws);
        if (wkMap[pk] !== undefined) wkMap[pk]++;
      }
      new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: wks.map(function(w) { return w.label; }),
          datasets: [{ label: 'Solved', data: wks.map(function(w) { return wkMap[w.key]; }),
            borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,.08)', fill: true,
            tension: 0.4, pointRadius: 2, pointBackgroundColor: '#06b6d4', borderWidth: 2 }]
        },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#64748b', maxTicksLimit: 7 } },
            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#64748b', precision: 0 } }
          }
        }
      });
    }

    function buildDifficultyDonut(easy, medium, hard) {
      var canvas = document.getElementById('dd');
      if (!canvas || typeof Chart === 'undefined') return;
      new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['Easy', 'Medium', 'Hard'],
          datasets: [{ data: [easy, medium, hard],
            backgroundColor: ['#34d399', '#fbbf24', '#f87171'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%',
          plugins: { legend: { position: 'right',
            labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10, padding: 8 } } }
        }
      });
    }

    // Stacked per-month difficulty mix over the last 12 months. Returns the
    // month map so main() can fold it into the AI insights JSON.
    function buildDifficultyTrend(problems) {
      var now = new Date();
      var keys = [], labels = [], byMonth = {};
      for (var i = 11; i >= 0; i--) {
        var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        var k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        keys.push(k);
        labels.push(MONTH_NAMES[d.getMonth()] + " '" + String(d.getFullYear()).slice(2));
        byMonth[k] = { easy: 0, medium: 0, hard: 0 };
      }
      for (var j = 0; j < problems.length; j++) {
        var p = problems[j];
        if (!p.timestamp) continue;
        var ts = p.timestamp > 1e12 ? p.timestamp : p.timestamp * 1000;
        var pd = new Date(ts);
        var mk = pd.getFullYear() + '-' + String(pd.getMonth() + 1).padStart(2, '0');
        var slot = byMonth[mk];
        if (!slot) continue;
        var diff = normDiff(p.difficulty);
        if (diff === 'Easy') slot.easy++;
        else if (diff === 'Medium') slot.medium++;
        else if (diff === 'Hard') slot.hard++;
      }
      var canvas = document.getElementById('dp');
      if (canvas && typeof Chart !== 'undefined') {
        new Chart(canvas.getContext('2d'), {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [
              { label: 'Easy', data: keys.map(function(k2) { return byMonth[k2].easy; }), backgroundColor: '#34d399' },
              { label: 'Medium', data: keys.map(function(k2) { return byMonth[k2].medium; }), backgroundColor: '#fbbf24' },
              { label: 'Hard', data: keys.map(function(k2) { return byMonth[k2].hard; }), backgroundColor: '#f87171' }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10, padding: 8 } } },
            scales: {
              x: { stacked: true, grid: { display: false }, ticks: { color: '#64748b', maxTicksLimit: 12 } },
              y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#64748b', precision: 0 } }
            }
          }
        });
      }
      return byMonth;
    }

    // Day-of-week x hour-of-day punch card. Renders into #pc and returns the
    // 7x24 matrix for the insights JSON.
    function buildPunchCard(problems) {
      var matrix = [];
      for (var d = 0; d < 7; d++) {
        var row = [];
        for (var h = 0; h < 24; h++) row.push(0);
        matrix.push(row);
      }
      var max = 0;
      for (var i = 0; i < problems.length; i++) {
        var p = problems[i];
        if (!p.timestamp) continue;
        var ts = p.timestamp > 1e12 ? p.timestamp : p.timestamp * 1000;
        var pd = new Date(ts);
        var n = ++matrix[pd.getDay()][pd.getHours()];
        if (n > max) max = n;
      }
      var box = document.getElementById('pc');
      if (box) {
        var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        var htmlStr = '<div style="min-width:520px">';
        for (var r = 0; r < 7; r++) {
          htmlStr += '<div style="display:grid;grid-template-columns:2.2rem repeat(24,minmax(0,1fr));gap:2px;margin-bottom:2px;align-items:center">';
          htmlStr += '<span style="font-size:.6rem;color:var(--muted)">' + days[r] + '</span>';
          for (var c = 0; c < 24; c++) {
            var v = matrix[r][c];
            var alpha = v === 0 ? 0.05 : (0.2 + 0.8 * (v / (max || 1)));
            htmlStr += '<div title="' + days[r] + ' ' + String(c).padStart(2, '0') + ':00 — ' + v + '" style="aspect-ratio:1;border-radius:2px;background:rgba(6,182,212,' + alpha.toFixed(2) + ')"></div>';
          }
          htmlStr += '</div>';
        }
        htmlStr += '<div style="display:grid;grid-template-columns:2.2rem repeat(24,minmax(0,1fr));gap:2px"><span></span>';
        for (var hh = 0; hh < 24; hh++) {
          htmlStr += '<span style="font-size:.5rem;color:var(--muted);text-align:center">' + (hh % 6 === 0 ? String(hh).padStart(2, '0') : '') + '</span>';
        }
        htmlStr += '</div></div>';
        box.innerHTML = htmlStr;
      }
      return matrix;
    }

    // Topic-centric knowledge graph, the same picture the extension's Graph tab
    // draws: topics coloured by mastery (volume x recency, half-life 90 days,
    // recency clocked from the 2nd-most-recent solve so one stray solve does not
    // repaint a rusty topic), problems coloured by difficulty, unsolved
    // LeetCode "similar" suggestions as hollow ghosts. Self-contained canvas —
    // no library, works from the same index.json everything else reads.
    function buildKnowledgeGraphView(problems) {
      var card = document.getElementById('kg-card');
      var canvas = document.getElementById('kg');
      var tip = document.getElementById('kg-tip');
      if (!card || !canvas) return;
      if (!problems.length) { card.style.display = 'none'; return; }

      var BAND = { strong: '#22c55e', working: '#f59e0b', shaky: '#f87171', untouched: '#64748b' };
      var DIFF = { Easy: '#34d399', Medium: '#fbbf24', Hard: '#f87171' };
      var HALF_LIFE_DAYS = 90, REGAIN = 2, DAY = 86400000;
      var GHOST_CAP = 250;

      function normTs(t) {
        if (!t) return null;
        return t > 1e12 ? t : t * 1000;
      }
      function tagKey(t) { return String(t || '').trim().toLowerCase(); }

      // ---- model ----
      var topics = {};   // key -> { label, solveCount, times: [], x, y }
      var probs = {};    // slug -> node
      var similarEdges = []; // [slugA, slugB]
      var ghostCount = 0, ghostDropped = 0;

      function ensureTopic(raw) {
        var k = tagKey(raw);
        if (!k) return null;
        if (!topics[k]) topics[k] = { label: String(raw).trim(), solveCount: 0, times: [] };
        return k;
      }

      for (var i = 0; i < problems.length; i++) {
        var p = problems[i];
        var slug = p.titleSlug || String(p.id || i);
        var rawTags = (p.tags && p.tags.length) ? p.tags : [p.topic || 'Untagged'];
        var keys = [];
        for (var t = 0; t < rawTags.length; t++) {
          var k = ensureTopic(rawTags[t]);
          if (k && keys.indexOf(k) === -1) keys.push(k);
        }
        if (!keys.length) keys.push(ensureTopic('Untagged'));
        var ts = normTs(p.timestamp);
        var node = probs[slug];
        if (!node) {
          node = probs[slug] = {
            slug: slug, label: p.title || slug, difficulty: normDiff(p.difficulty),
            solved: true, platforms: [], topics: keys, src: p
          };
        } else {
          node.solved = true;
          if (!node.src) node.src = p;
          for (var kk = 0; kk < keys.length; kk++) {
            if (node.topics.indexOf(keys[kk]) === -1) node.topics.push(keys[kk]);
          }
        }
        if (p.platform && node.platforms.indexOf(p.platform) === -1) node.platforms.push(p.platform);
        for (var ki = 0; ki < keys.length; ki++) {
          topics[keys[ki]].solveCount++;
          if (ts) topics[keys[ki]].times.push(ts);
        }
      }

      // Ghost nodes: unsolved similar problems (LeetCode metadata)
      for (var g = 0; g < problems.length; g++) {
        var gp = problems[g];
        if (!gp.similar || !gp.similar.length) continue;
        var parentSlug = gp.titleSlug || String(gp.id || g);
        for (var s = 0; s < gp.similar.length; s++) {
          var sim = gp.similar[s];
          if (!sim || !sim.titleSlug) continue;
          if (!probs[sim.titleSlug]) {
            if (ghostCount >= GHOST_CAP) { ghostDropped++; continue; }
            ghostCount++;
            var simTags = [];
            if (sim.topicTags && sim.topicTags.length) {
              for (var st = 0; st < sim.topicTags.length; st++) {
                var sk = ensureTopic(sim.topicTags[st].name || sim.topicTags[st]);
                if (sk && simTags.indexOf(sk) === -1) simTags.push(sk);
              }
            }
            if (!simTags.length && probs[parentSlug]) simTags = [probs[parentSlug].topics[0]];
            if (!simTags.length) continue;
            probs[sim.titleSlug] = {
              slug: sim.titleSlug, label: sim.title || sim.titleSlug,
              difficulty: normDiff(sim.difficulty), solved: false, platforms: [], topics: simTags, src: null
            };
          }
          if (probs[parentSlug] && probs[sim.titleSlug]) similarEdges.push([parentSlug, sim.titleSlug]);
        }
      }

      // ---- mastery per topic (mirrors the extension's topic-taxonomy math) ----
      var topicKeys = Object.keys(topics);
      var now = Date.now();
      for (var m = 0; m < topicKeys.length; m++) {
        var top = topics[topicKeys[m]];
        var count = top.solveCount;
        if (!count) { top.mastery = 0; top.band = 'untouched'; top.daysSince = null; continue; }
        top.times.sort(function (a, b) { return b - a; });
        var idx = Math.min(REGAIN, top.times.length) - 1;
        var last = top.times.length ? top.times[idx] : null;
        var volume = 1 - Math.exp(-count / 5);
        var days = last ? Math.max(0, (now - last) / DAY) : Infinity;
        var recency = 0.25 + 0.75 * Math.pow(0.5, days / HALF_LIFE_DAYS);
        top.mastery = Math.max(0, Math.min(1, volume * recency));
        top.band = top.mastery >= 0.7 ? 'strong' : (top.mastery >= 0.4 ? 'working' : 'shaky');
        top.daysSince = top.times.length ? Math.floor((now - top.times[0]) / DAY) : null;
      }

      // ---- layout: force-sim the topics, spiral problems around them ----
      var probKeys = Object.keys(probs);
      var clusterR = {};
      var perTopicIdx = {};
      for (var pc = 0; pc < probKeys.length; pc++) {
        var pt = probs[probKeys[pc]].topics[0];
        perTopicIdx[pt] = (perTopicIdx[pt] || 0) + 1;
      }
      for (var cr = 0; cr < topicKeys.length; cr++) {
        clusterR[topicKeys[cr]] = 34 + 9 * Math.sqrt(perTopicIdx[topicKeys[cr]] || 0);
      }
      // Deterministic starting ring (no Math.random — same data, same picture)
      for (var ti = 0; ti < topicKeys.length; ti++) {
        var ang = (ti / topicKeys.length) * Math.PI * 2;
        var ring = 260 + 140 * (ti % 3);
        topics[topicKeys[ti]].x = Math.cos(ang) * ring;
        topics[topicKeys[ti]].y = Math.sin(ang) * ring;
      }
      for (var iter = 0; iter < 260; iter++) {
        var cool = 1 - iter / 260;
        for (var a = 0; a < topicKeys.length; a++) {
          var ta = topics[topicKeys[a]];
          var fx = -ta.x * 0.012, fy = -ta.y * 0.012; // center gravity
          for (var b = 0; b < topicKeys.length; b++) {
            if (a === b) continue;
            var tb = topics[topicKeys[b]];
            var dx = ta.x - tb.x, dy = ta.y - tb.y;
            var d2 = dx * dx + dy * dy || 1;
            var minD = clusterR[topicKeys[a]] + clusterR[topicKeys[b]] + 26;
            var f = (minD * minD) / d2;
            if (f > 4) f = 4;
            fx += (dx / Math.sqrt(d2)) * f * 2.2;
            fy += (dy / Math.sqrt(d2)) * f * 2.2;
          }
          ta.x += fx * cool; ta.y += fy * cool;
        }
      }
      var spiralIdx = {};
      for (var pi = 0; pi < probKeys.length; pi++) {
        var pn = probs[probKeys[pi]];
        if (pn.topics.length > 1) {
          var cx = 0, cy = 0;
          for (var c = 0; c < pn.topics.length; c++) { cx += topics[pn.topics[c]].x; cy += topics[pn.topics[c]].y; }
          cx /= pn.topics.length; cy /= pn.topics.length;
          // Nudge toward the primary topic so multi-tag problems do not pile at the midpoint
          var prim = topics[pn.topics[0]];
          var h = (pi * 2.399963);
          pn.x = (cx + prim.x) / 2 + Math.cos(h) * 14;
          pn.y = (cy + prim.y) / 2 + Math.sin(h) * 14;
        } else {
          var tk = pn.topics[0];
          var n = spiralIdx[tk] = (spiralIdx[tk] || 0) + 1;
          var sa = n * 2.399963; // golden angle — even spread, no RNG
          var sr = 16 + 7.5 * Math.sqrt(n);
          pn.x = topics[tk].x + Math.cos(sa) * sr;
          pn.y = topics[tk].y + Math.sin(sa) * sr;
        }
      }

      // ---- render ----
      var view = { x: 0, y: 0, k: 1 };
      var hover = null;
      var dpr = window.devicePixelRatio || 1;
      var ctx2 = canvas.getContext('2d');

      function fitView() {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var f = 0; f < probKeys.length; f++) {
          var fn = probs[probKeys[f]];
          if (fn.x < minX) minX = fn.x; if (fn.x > maxX) maxX = fn.x;
          if (fn.y < minY) minY = fn.y; if (fn.y > maxY) maxY = fn.y;
        }
        if (!isFinite(minX)) { minX = -100; maxX = 100; minY = -100; maxY = 100; }
        var w = canvas.clientWidth, hgt = canvas.clientHeight;
        var pad = 50;
        var kx = (w - pad * 2) / Math.max(1, maxX - minX);
        var ky = (hgt - pad * 2) / Math.max(1, maxY - minY);
        view.k = Math.min(kx, ky, 1.6);
        view.x = w / 2 - ((minX + maxX) / 2) * view.k;
        view.y = hgt / 2 - ((minY + maxY) / 2) * view.k;
      }

      function resize() {
        var w = canvas.clientWidth, hgt = canvas.clientHeight;
        canvas.width = w * dpr; canvas.height = hgt * dpr;
        draw();
      }

      function toScreen(x, y) { return [x * view.k + view.x, y * view.k + view.y]; }

      function draw() {
        var w = canvas.clientWidth, hgt = canvas.clientHeight;
        ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx2.clearRect(0, 0, w, hgt);
        var css = getComputedStyle(document.documentElement);
        var mutedCol = (css.getPropertyValue('--muted') || '#64748b').trim();
        var textCol = (css.getPropertyValue('--text') || '#e2e8f0').trim();

        // Edges: topic -> problem (faint), similar (dashed)
        ctx2.lineWidth = Math.max(0.4, 0.7 * view.k);
        ctx2.globalAlpha = 0.13;
        ctx2.strokeStyle = mutedCol;
        ctx2.beginPath();
        for (var e = 0; e < probKeys.length; e++) {
          var en = probs[probKeys[e]];
          for (var et = 0; et < en.topics.length; et++) {
            var tn = topics[en.topics[et]];
            var s1 = toScreen(tn.x, tn.y), s2 = toScreen(en.x, en.y);
            ctx2.moveTo(s1[0], s1[1]); ctx2.lineTo(s2[0], s2[1]);
          }
        }
        ctx2.stroke();
        ctx2.globalAlpha = 0.22;
        ctx2.setLineDash([3, 3]);
        ctx2.beginPath();
        for (var se = 0; se < similarEdges.length; se++) {
          var pa = probs[similarEdges[se][0]], pb = probs[similarEdges[se][1]];
          if (!pa || !pb) continue;
          var q1 = toScreen(pa.x, pa.y), q2 = toScreen(pb.x, pb.y);
          ctx2.moveTo(q1[0], q1[1]); ctx2.lineTo(q2[0], q2[1]);
        }
        ctx2.stroke();
        ctx2.setLineDash([]);
        ctx2.globalAlpha = 1;

        // Problem dots
        for (var pd = 0; pd < probKeys.length; pd++) {
          var dn = probs[probKeys[pd]];
          var sp = toScreen(dn.x, dn.y);
          if (sp[0] < -20 || sp[0] > w + 20 || sp[1] < -20 || sp[1] > hgt + 20) continue;
          var r = (dn === hover ? 6 : 4) * Math.max(0.6, Math.min(view.k, 1.4));
          var col = DIFF[dn.difficulty] || mutedCol;
          ctx2.beginPath();
          ctx2.arc(sp[0], sp[1], r, 0, Math.PI * 2);
          if (dn.solved) {
            ctx2.fillStyle = col; ctx2.fill();
          } else {
            ctx2.strokeStyle = col; ctx2.lineWidth = 1.4; ctx2.globalAlpha = 0.75; ctx2.stroke(); ctx2.globalAlpha = 1;
          }
        }

        // Topic hubs + labels
        for (var td = 0; td < topicKeys.length; td++) {
          var tt = topics[topicKeys[td]];
          var tsp = toScreen(tt.x, tt.y);
          if (tsp[0] < -80 || tsp[0] > w + 80 || tsp[1] < -40 || tsp[1] > hgt + 40) continue;
          var tr = (8 + Math.min(tt.solveCount, 24) * 0.55) * Math.max(0.6, Math.min(view.k, 1.4));
          if (tt === hover) tr += 2;
          ctx2.beginPath();
          ctx2.arc(tsp[0], tsp[1], tr, 0, Math.PI * 2);
          ctx2.fillStyle = BAND[tt.band] || BAND.untouched;
          ctx2.globalAlpha = 0.9; ctx2.fill(); ctx2.globalAlpha = 1;
          if (view.k > 0.35 || tt.solveCount >= 3) {
            ctx2.font = '600 ' + Math.max(9, Math.min(12, 11 * view.k + 4)) + 'px -apple-system, Segoe UI, Roboto, sans-serif';
            ctx2.fillStyle = textCol;
            ctx2.textAlign = 'center';
            ctx2.fillText(tt.label, tsp[0], tsp[1] - tr - 4);
          }
        }
      }

      function nodeAt(mx, my) {
        var bestD = 12 * 12, best = null;
        for (var t2 = 0; t2 < topicKeys.length; t2++) {
          var tn2 = topics[topicKeys[t2]];
          var ts2 = toScreen(tn2.x, tn2.y);
          var tr2 = 8 + Math.min(tn2.solveCount, 24) * 0.55;
          var dd = (ts2[0] - mx) * (ts2[0] - mx) + (ts2[1] - my) * (ts2[1] - my);
          if (dd < Math.max(bestD, tr2 * tr2)) { bestD = dd; best = tn2; }
        }
        for (var p2 = 0; p2 < probKeys.length; p2++) {
          var pn2 = probs[probKeys[p2]];
          var ps2 = toScreen(pn2.x, pn2.y);
          var dd2 = (ps2[0] - mx) * (ps2[0] - mx) + (ps2[1] - my) * (ps2[1] - my);
          if (dd2 < bestD) { bestD = dd2; best = pn2; }
        }
        return best;
      }

      function showTip(node, mx, my) {
        var s = '';
        if (node.solveCount !== undefined) {
          s = '<b>' + escHtml(node.label) + '</b>' + node.solveCount + ' solve' + (node.solveCount === 1 ? '' : 's')
            + ' · ' + node.band
            + (node.daysSince !== null ? ' · last ' + (node.daysSince === 0 ? 'today' : node.daysSince + 'd ago') : '');
        } else {
          // Platform names come straight out of index.json, which is repository
          // content — same trust level as the commit list below. The difficulty
          // is safe because normDiff() only ever returns one of four literals.
          // No backticks in here: this whole script is inside a template literal.
          s = '<b>' + escHtml(node.label) + '</b>' + (node.difficulty || '?')
            + (node.solved ? (node.platforms.length ? ' · ' + escHtml(node.platforms.join(', ')) : ' · solved') : ' · unsolved suggestion');
        }
        tip.innerHTML = s;
        tip.style.display = 'block';
        var box = canvas.getBoundingClientRect();
        var tx = mx + 14, ty = my + 10;
        if (tx + tip.offsetWidth > box.width - 8) tx = mx - tip.offsetWidth - 10;
        if (ty + tip.offsetHeight > box.height - 8) ty = my - tip.offsetHeight - 8;
        tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
      }

      var drag = null, moved = false;
      canvas.addEventListener('pointerdown', function (ev) {
        drag = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y };
        moved = false;
        canvas.setPointerCapture(ev.pointerId);
      });
      canvas.addEventListener('pointermove', function (ev) {
        var box = canvas.getBoundingClientRect();
        var mx = ev.clientX - box.left, my = ev.clientY - box.top;
        if (drag) {
          var ddx = ev.clientX - drag.x, ddy = ev.clientY - drag.y;
          if (Math.abs(ddx) + Math.abs(ddy) > 3) moved = true;
          view.x = drag.vx + ddx; view.y = drag.vy + ddy;
          tip.style.display = 'none';
          draw();
          return;
        }
        var n2 = nodeAt(mx, my);
        if (n2 !== hover) { hover = n2; draw(); }
        if (n2) { showTip(n2, mx, my); canvas.style.cursor = 'pointer'; }
        else { tip.style.display = 'none'; canvas.style.cursor = 'grab'; }
      });
      canvas.addEventListener('pointerup', function (ev) {
        drag = null;
        if (moved) return;
        var box = canvas.getBoundingClientRect();
        var n3 = nodeAt(ev.clientX - box.left, ev.clientY - box.top);
        if (n3 && n3.slug) {
          var url = n3.src ? problemUrl(n3.src) : ('https://leetcode.com/problems/' + n3.slug + '/');
          if (url) window.open(url, '_blank', 'noopener');
        }
      });
      canvas.addEventListener('pointerleave', function () { hover = null; tip.style.display = 'none'; draw(); });
      canvas.addEventListener('wheel', function (ev) {
        ev.preventDefault();
        var box = canvas.getBoundingClientRect();
        var mx = ev.clientX - box.left, my = ev.clientY - box.top;
        var factor = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
        var nk = Math.max(0.15, Math.min(5, view.k * factor));
        view.x = mx - ((mx - view.x) / view.k) * nk;
        view.y = my - ((my - view.y) / view.k) * nk;
        view.k = nk;
        tip.style.display = 'none';
        draw();
      }, { passive: false });

      window.addEventListener('resize', resize);
      // Redraw when the theme flips — colours are read from CSS variables at draw time
      new MutationObserver(function () { draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

      fitView();
      resize();
      if (ghostDropped > 0) {
        var lg = card.querySelector('.kg-legend span:last-child');
        if (lg) lg.textContent = ghostDropped + ' more suggestions not shown · drag to pan · scroll to zoom';
      }
    }

    function dayKey(d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    // Rolling windows are anchored on today, not on Jan 1. "12m" walks the
    // calendar back a year and forward a day, so it covers exactly 365 days in
    // an ordinary year and 366 across a leap day -- whichever the window
    // actually spans, rather than a hardcoded count that drifts every fourth
    // year. A four-digit value selects that calendar year instead.
    var HM_RANGES = [
      { id: '30d',  label: 'Last 30 days' },
      { id: '90d',  label: 'Last 90 days' },
      { id: '6m',   label: 'Last 6 months' },
      { id: '12m',  label: 'Last 12 months' },
      { id: '24m',  label: 'Last 2 years' },
      { id: 'all',  label: 'All time' }
    ];

    function hmWindow(range, firstDayKey) {
      var now = new Date();
      var end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var start = new Date(end);

      // Backslashes are doubled here: this script is written out through a
      // template literal, which eats a lone "\" — /^\d{4}$/ reached the page
      // as /^d{4}$/ and no year option ever matched.
      if (/^\\d{4}$/.test(range)) {
        var y = parseInt(range, 10);
        start = new Date(y, 0, 1);
        if (y !== end.getFullYear()) end = new Date(y, 11, 31);
        return { start: start, end: end };
      }
      if (range === '30d') start.setDate(start.getDate() - 29);
      else if (range === '90d') start.setDate(start.getDate() - 89);
      else if (range === '6m') { start.setMonth(start.getMonth() - 6); start.setDate(start.getDate() + 1); }
      else if (range === '24m') { start.setFullYear(start.getFullYear() - 2); start.setDate(start.getDate() + 1); }
      else if (range === 'all') {
        var parts = (firstDayKey || '').split('-');
        if (parts.length === 3) start = new Date(+parts[0], +parts[1] - 1, +parts[2]);
        else { start.setFullYear(start.getFullYear() - 1); start.setDate(start.getDate() + 1); }
      } else { start.setFullYear(start.getFullYear() - 1); start.setDate(start.getDate() + 1); }
      return { start: start, end: end };
    }

    function buildHeatmap(problems, range) {
      var dayMap = {};
      var firstKey = null;
      for (var i = 0; i < problems.length; i++) {
        var p = problems[i];
        if (!p.timestamp) continue;
        var ts = p.timestamp;
        var tsMs = (typeof ts === 'number' && ts < 1e10) ? ts * 1000 : ts;
        var k = dayKey(new Date(tsMs));
        dayMap[k] = (dayMap[k] || 0) + 1;
        if (!firstKey || k < firstKey) firstKey = k;
      }

      var win = hmWindow(range || '12m', firstKey);
      var rangeStart = win.start;
      var rangeEnd = win.end;

      var cur = new Date(rangeStart);
      cur.setDate(cur.getDate() - cur.getDay()); // snap to Sunday

      var grid = document.getElementById('hm-g');
      var monthsEl = document.getElementById('hm-m');
      grid.innerHTML = '';
      monthsEl.innerHTML = '';

      var colEl = null;
      var prevMonth = -1;
      var monthSpans = [];

      while (cur <= rangeEnd) {
        if (cur.getDay() === 0 || !colEl) {
          colEl = document.createElement('div');
          colEl.className = 'hm-col';
          grid.appendChild(colEl);
        }

        var inRange = cur >= rangeStart && cur <= rangeEnd;
        // The month a column belongs to is decided by its first *in-range* day.
        // Reading it off the Sunday would mislabel the leading column whenever
        // the window opens mid-week, which every rolling range does.
        if (inRange && cur.getMonth() !== prevMonth) {
          prevMonth = cur.getMonth();
          monthSpans.push({ idx: grid.children.length - 1, label: MONTH_NAMES[prevMonth] });
        }

        var k2 = dayKey(cur);
        var cnt = dayMap[k2] || 0;
        var cell = document.createElement('div');
        var cls = 'hm-cell';
        if (inRange && cnt > 0) cls += cnt >= 4 ? ' l4' : cnt >= 3 ? ' l3' : cnt >= 2 ? ' l2' : ' l1';
        cell.className = cls;
        if (!inRange) cell.style.visibility = 'hidden';
        cell.title = k2 + ': ' + cnt + ' solve' + (cnt !== 1 ? 's' : '');
        colEl.appendChild(cell);

        cur.setDate(cur.getDate() + 1);
      }

      // Two labels can land on the same column when a short window straddles a
      // month boundary; the later one wins so the label sits over real cells.
      var uniq = [];
      for (var m = 0; m < monthSpans.length; m++) {
        if (uniq.length && uniq[uniq.length - 1].idx === monthSpans[m].idx) uniq.pop();
        uniq.push(monthSpans[m]);
      }

      // Store month data globally so renderMonthLabels() can recompute widths after resize
      hmMonthSpans = uniq;
      hmTotalCols = grid.children.length;
      renderMonthLabels();
    }

    function renderBars(containerId, items, maxN, colorFn) {
      var el = document.getElementById(containerId);
      var html = '';
      for (var i = 0; i < items.length; i++) {
        var lbl = items[i][0];
        var n = items[i][1];
        var pct = maxN > 0 ? (n / maxN) * 100 : 0;
        var col = colorFn(lbl, i);
        html += '<div class="bar-row">'
          + '<span class="bar-lbl" title="' + escHtml(lbl) + '">' + escHtml(lbl) + '</span>'
          + '<div class="bar-track"><div class="bar-fill" style="width:' + pct.toFixed(1) + '%;background:' + col + '"></div></div>'
          + '<span class="bar-ct">' + n + '</span>'
          + '</div>';
      }
      el.innerHTML = html;
    }

    function escHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Mirror of BUILT_IN_MAP + the heuristics in src/core/difficulty-map.js.
    // GeeksForGeeks grades School and Basic, not Easy, and platforms are free to
    // change the casing at any time — comparing to the literal 'Easy' counted
    // every one of those as nothing, which is how a repository full of solves
    // rendered 0 / 0 / 0 in its own report.
    function normDiff(d) {
      var s = String(d == null ? '' : d).trim().toLowerCase();
      if (!s || s === 'unknown') return '';
      var MAP = {
        school: 'Easy', basic: 'Easy', trivial: 'Easy', beginner: 'Easy',
        simple: 'Easy', easy: 'Easy',
        intermediate: 'Medium', medium: 'Medium', moderate: 'Medium',
        hard: 'Hard', difficult: 'Hard', advanced: 'Hard', expert: 'Hard',
        extreme: 'Hard', 'very hard': 'Hard', 'extra hard': 'Hard'
      };
      if (MAP[s]) return MAP[s];
      if (s.indexOf('very hard') > -1 || s.indexOf('extra') > -1 || s.indexOf('extreme') > -1) return 'Hard';
      if (s.indexOf('hard') > -1) return 'Hard';
      if (s.indexOf('med') > -1 || s.indexOf('intermediate') > -1 || s.indexOf('moderate') > -1) return 'Medium';
      if (s.indexOf('easy') > -1 || s.indexOf('simple') > -1 || s.indexOf('beginner') > -1
        || s.indexOf('school') > -1 || s.indexOf('basic') > -1) return 'Easy';
      return '';
    }

    function countDiff(problems, want) {
      var n = 0;
      for (var i = 0; i < problems.length; i++) {
        if (normDiff(problems[i].difficulty) === want) n++;
      }
      return n;
    }

    function diffBadge(d) {
      var n = normDiff(d);
      if (n === 'Easy') return '<span class="badge be">Easy</span>';
      if (n === 'Medium') return '<span class="badge bm">Med</span>';
      if (n === 'Hard') return '<span class="badge bh">Hard</span>';
      return '<span class="badge" style="color:var(--muted)">' + escHtml(d || '—') + '</span>';
    }

    function problemUrl(p) {
      // Stored URLs are repository content — anyone who lands a commit on a
      // public repo controls them, so restrict to http(s) exactly like the
      // commit-URL renderer below (doubled backslashes for the same reason).
      if (p.url && /^https?:\\/\\//i.test(String(p.url))) return p.url;
      var pl = (p.platform || '').toLowerCase();
      if (pl === 'leetcode' && p.titleSlug) return 'https://leetcode.com/problems/' + p.titleSlug + '/';
      if (pl === 'geeksforgeeks' && p.titleSlug) return 'https://www.geeksforgeeks.org/problems/' + p.titleSlug + '/';
      if (pl === 'codeforces' && p.titleSlug) {
        // A Codeforces slug is contest and letter glued together ("4A",
        // "gym100500B"); the URL needs them apart again, and gym contests
        // live under a different path.
        var m = /^(gym)?(\\d+)([A-Za-z][A-Za-z0-9]*)$/.exec(p.titleSlug);
        if (!m) return 'https://codeforces.com/problemset';
        if (m[1] || Number(m[2]) >= 100000) return 'https://codeforces.com/gym/' + m[2] + '/problem/' + m[3];
        return 'https://codeforces.com/problemset/problem/' + m[2] + '/' + m[3];
      }
      return '#';
    }

    function getRepoUrl() {
      // Use values embedded at commit time — works on any custom domain
      if (REPO_OWNER && REPO_NAME) {
        return {
          url: 'https://github.com/' + REPO_OWNER + '/' + REPO_NAME,
          label: REPO_OWNER + '/' + REPO_NAME
        };
      }
      // Fallback: derive from URL (only works reliably on *.github.io paths)
      var host = window.location.hostname;
      var parts = host.split('.');
      var owner = parts.length >= 3 ? parts[0] : host.replace('.github.io', '');
      var pathParts = window.location.pathname.split('/').filter(Boolean);
      var repo = pathParts[0] || '';
      return { url: 'https://github.com/' + owner + '/' + repo, label: owner + (repo ? '/' + repo : '') };
    }

    function countBy(arr, keyFn) {
      var map = {};
      for (var i = 0; i < arr.length; i++) {
        var k = keyFn(arr[i]);
        map[k] = (map[k] || 0) + 1;
      }
      return map;
    }

    function sortedEntries(map) {
      return Object.keys(map).map(function(k) { return [k, map[k]]; }).sort(function(a, b) { return b[1] - a[1]; });
    }

    var ALL_PROBLEMS = [];
    var ALL_REPO_URL = '';
    var PG_SIZE = 50;
    var pg_cur = 0;

    function fileUrl(problem) {
      if (!ALL_REPO_URL || !problem.files || !problem.files.length) return '';
      return ALL_REPO_URL + '/blob/main/' + problem.files[0].path;
    }

    function repoFileUrl(problem) {
      // Reconstruct v3 path: problems/{canonicalId}/{platform}/README.md
      //                   or: problems/{platformId}/README.md
      if (!ALL_REPO_URL) return '';
      var PLAT_CODE = { leetcode: 'lc', geeksforgeeks: 'gfg', codeforces: 'cf' };
      var plat = (problem.platform || '').toLowerCase();
      var prefix = PLAT_CODE[plat] || plat.slice(0, 3) || 'xx';
      var rawId = String(problem.id || problem.titleSlug || '').split('::')[0];
      var pid = rawId.startsWith(prefix + '-') ? rawId : (prefix + '-' + rawId);
      var dir = (problem.canonical && problem.canonical.canonicalId)
        ? 'problems/' + problem.canonical.canonicalId + '/' + plat
        : 'problems/' + pid;
      return ALL_REPO_URL + '/blob/main/' + dir + '/README.md';
    }

    function filterProblems() {
      var q = (document.getElementById('s-q').value || '').toLowerCase();
      var diff = document.getElementById('s-diff').value;
      var plat = document.getElementById('s-plat').value;
      return ALL_PROBLEMS.filter(function(p) {
        if (diff && normDiff(p.difficulty) !== diff) return false;
        if (plat && (p.platform || '').toLowerCase() !== plat) return false;
        if (q) {
          var hay = [p.title, p.titleSlug, p.platform, p.difficulty,
            (p.lang && p.lang.name), (p.tags || []).join(' ')].join(' ').toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      });
    }

    function renderAllTable() {
      var filtered = filterProblems();
      var total = filtered.length;
      var start = pg_cur * PG_SIZE;
      var page = filtered.slice(start, start + PG_SIZE);

      document.getElementById('all-count').textContent = total + ' problem' + (total !== 1 ? 's' : '');

      var rows = '';
      for (var i = 0; i < page.length; i++) {
        var p = page[i];
        var idx = start + i + 1;
        var lang = (p.lang && p.lang.name) ? p.lang.name : (p.language || (p.lang && p.lang.ext) || '—');
        var platColor = platformColor(p.platform);
        var pUrl = problemUrl(p);
        var fUrl = repoFileUrl(p);
        var ts = p.timestamp ? (p.timestamp > 1e12 ? p.timestamp : p.timestamp * 1000) : 0;
        var dateStr = ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
        rows += '<tr>'
          + '<td style="color:var(--muted);font-variant-numeric:tabular-nums">' + idx + '</td>'
          + '<td><a class="prob-link" href="' + escHtml(pUrl) + '" target="_blank" rel="noreferrer">' + escHtml(p.title || p.titleSlug || '—') + '</a>'
          + (fUrl ? '<a class="src-link" href="' + escHtml(fUrl) + '" target="_blank" rel="noreferrer" title="View code in repo">[src]</a>' : '')
          + '</td>'
          + '<td>' + diffBadge(p.difficulty) + '</td>'
          + '<td style="color:var(--muted)">' + escHtml(lang) + '</td>'
          + '<td><span class="plat-dot" style="background:' + platColor + '"></span>' + escHtml(p.platform || '—') + '</td>'
          + '<td style="color:var(--muted);white-space:nowrap">' + dateStr + '</td>'
          + '</tr>';
      }
      document.getElementById('all-body').innerHTML = rows || '<tr><td colspan="6" style="color:var(--muted);text-align:center;padding:1.5rem">No problems match the current filter.</td></tr>';

      // Pagination
      var totalPages = Math.ceil(total / PG_SIZE);
      var pgEl = document.getElementById('pg');
      if (totalPages <= 1) { pgEl.innerHTML = ''; return; }
      var pgHtml = '<button class="pg-btn" onclick="changePage(' + (pg_cur - 1) + ')"' + (pg_cur === 0 ? ' disabled' : '') + '>&#8249;</button>';
      var lo = Math.max(0, pg_cur - 2), hi = Math.min(totalPages - 1, pg_cur + 2);
      for (var pi = lo; pi <= hi; pi++) {
        pgHtml += '<button class="pg-btn' + (pi === pg_cur ? ' active' : '') + '" onclick="changePage(' + pi + ')">' + (pi + 1) + '</button>';
      }
      pgHtml += '<button class="pg-btn" onclick="changePage(' + (pg_cur + 1) + ')"' + (pg_cur >= totalPages - 1 ? ' disabled' : '') + '>&#8250;</button>';
      pgEl.innerHTML = pgHtml;
    }

    function changePage(n) { pg_cur = n; renderAllTable(); }

    function bindFilters() {
      ['s-q', 's-diff', 's-plat'].forEach(function(id) {
        document.getElementById(id).addEventListener('input', function() { pg_cur = 0; renderAllTable(); });
      });
    }

    async function main() {
      try {
        var res = await fetch('./index.json');
        if (!res.ok) throw new Error('index.json not found (HTTP ' + res.status + ')');
        var data = await res.json();
        var problems = data.problems || [];
        var stats = data.stats || {};

        // Repo link
        var repo = getRepoUrl();
        ALL_REPO_URL = repo.url;
        var rl = document.getElementById('repo-link');
        rl.href = repo.url;
        rl.textContent = repo.label + ' ↗';

        // Quick stats
        // The problem list wins over stats whenever it is present. Every repo
        // written before the counters learned to normalize carries a stale
        // easy/medium/hard in its index.json — often 0 / 0 / 0 — and that block
        // is only rewritten on the next commit. Counting the list means an
        // existing report corrects itself on the very next page load instead of
        // waiting for a solve that may not come for weeks.
        var sTotal = problems.length || stats.total || 0;
        var sEasy  = problems.length ? countDiff(problems, 'Easy')   : (stats.easy   || 0);
        var sMed   = problems.length ? countDiff(problems, 'Medium') : (stats.medium || 0);
        var sHard  = problems.length ? countDiff(problems, 'Hard')   : (stats.hard   || 0);
        document.getElementById('sn-t').textContent = sTotal;
        document.getElementById('sn-e').textContent = sEasy;
        document.getElementById('sn-m').textContent = sMed;
        document.getElementById('sn-h').textContent = sHard;

        // Streak stats
        var streakData = computeStreaks(problems);
        document.getElementById('sn-cs').textContent = streakData.current + 'd';
        document.getElementById('sn-ms').textContent = streakData.max + 'd';

        // Heatmap
        function resizeHeatmap() {
          // Measure .hm-scroll, not the card. The card carries padding, and
          // clientWidth includes it — so the old measurement handed the grid
          // ~3rem of space that does not exist, sized the cells to fill it, and
          // the year view spilled into a horizontal scrollbar on every load.
          // .hm-scroll has no padding of its own, so its content box is exactly
          // the room the grid has.
          var scroll = document.querySelector('.hm-scroll');
          var side = document.querySelector('.hm-side');
          var cols = document.querySelectorAll('.hm-col').length;
          if (!scroll || !cols) return;
          var COL_GAP = 3;   // .hm-cols gap
          var WRAP_GAP = 4;  // .hm-wrap gap, between the weekday labels and the grid
          var sideW = side ? side.offsetWidth + WRAP_GAP : 0;
          // n columns have n-1 gaps between them, not n. Counting one gap too
          // many is only a few pixels, but it compounds with the padding error.
          var avail = scroll.clientWidth - sideW - (cols - 1) * COL_GAP;
          // Capped both ways: below 6px the cells stop reading as a calendar,
          // and above 20px a 30-day window would blow up into coloured tiles.
          var cell = Math.min(20, Math.max(6, Math.floor(avail / cols)));
          document.documentElement.style.setProperty('--hm-cell', cell + 'px');
          renderMonthLabels();
        }

        var hmYears = {};
        for (var hy = 0; hy < problems.length; hy++) {
          var hts = problems[hy].timestamp;
          if (!hts) continue;
          hmYears[new Date((typeof hts === 'number' && hts < 1e10) ? hts * 1000 : hts).getFullYear()] = 1;
        }
        var hmYearList = Object.keys(hmYears).sort().reverse();

        var hmSel = document.getElementById('hm-range');
        var hmlEl = document.getElementById('hm-label');
        var hmLabels = {};
        if (hmSel) {
          for (var hr = 0; hr < HM_RANGES.length; hr++) {
            var o = document.createElement('option');
            o.value = HM_RANGES[hr].id;
            o.textContent = HM_RANGES[hr].label;
            hmLabels[HM_RANGES[hr].id] = HM_RANGES[hr].label;
            hmSel.appendChild(o);
          }
          for (var hyy = 0; hyy < hmYearList.length; hyy++) {
            var oy = document.createElement('option');
            oy.value = hmYearList[hyy];
            oy.textContent = hmYearList[hyy];
            hmLabels[hmYearList[hyy]] = hmYearList[hyy];
            hmSel.appendChild(oy);
          }
          hmSel.value = '12m';
        }

        function drawHeatmap(range) {
          buildHeatmap(problems, range);
          if (hmlEl) hmlEl.textContent = 'Activity — ' + (hmLabels[range] || 'Last 12 months');
          resizeHeatmap();
        }

        // The choice is remembered per browser. It is a view preference, so it
        // lives in localStorage rather than in the committed report.
        var hmSaved = null;
        try { hmSaved = localStorage.getItem('cl-hm-range'); } catch (e) {}
        if (hmSaved && hmSel) {
          for (var hs = 0; hs < hmSel.options.length; hs++) {
            if (hmSel.options[hs].value === hmSaved) { hmSel.value = hmSaved; break; }
          }
        }
        drawHeatmap(hmSel ? hmSel.value : '12m');
        if (hmSel) {
          hmSel.addEventListener('change', function () {
            try { localStorage.setItem('cl-hm-range', hmSel.value); } catch (e) {}
            drawHeatmap(hmSel.value);
          });
        }
        window.addEventListener('resize', resizeHeatmap);

        // Velocity + difficulty charts
        buildVelocityChart(problems);
        buildDifficultyDonut(sEasy, sMed, sHard);
        var monthlyDiff = buildDifficultyTrend(problems);
        var punchCard = buildPunchCard(problems);

        // Knowledge graph
        buildKnowledgeGraphView(problems);

        // Language donut
        var langMap = countBy(problems, function(p) {
          var n = (p.lang && p.lang.name) ? p.lang.name : (p.language || '');
          if (!n || n === 'undefined' || n === 'null') n = (p.lang && p.lang.ext) ? p.lang.ext.toUpperCase() : 'Unknown';
          return n;
        });
        var langEntries = sortedEntries(langMap).slice(0, 8);
        var ctx = document.getElementById('lc').getContext('2d');
        new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: langEntries.map(function(e) { return e[0]; }),
            datasets: [{
              data: langEntries.map(function(e) { return e[1]; }),
              backgroundColor: langEntries.map(function(_, i) { return paletteColor(i); }),
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10, padding: 6 } }
            },
            cutout: '65%'
          }
        });

        // Platform bars
        var platEntries = sortedEntries(countBy(problems, function(p) { return p.platform || 'Unknown'; }));
        renderBars('pb', platEntries, platEntries.length ? platEntries[0][1] : 1, function(lbl) { return platformColor(lbl); });

        // Topic bars
        var topicMap = {};
        for (var i = 0; i < problems.length; i++) {
          var tags = problems[i].tags || [];
          for (var j = 0; j < tags.length; j++) { topicMap[tags[j]] = (topicMap[tags[j]] || 0) + 1; }
        }
        var topicEntries = sortedEntries(topicMap).slice(0, 10);
        renderBars('tb', topicEntries, topicEntries.length ? topicEntries[0][1] : 1, function() { return '#06b6d4'; });

        // AI-ready insights: the same shape the library's Analytics tab copies
        // to the clipboard, assembled from aggregates only — no titles, no
        // code. Exposed as window.CL_INSIGHTS and in #cl-insights so a person
        // (or a bot) can lift one JSON object from the report.
        var dowTotals = [0, 0, 0, 0, 0, 0, 0];
        var hourTotals = [];
        for (var ht = 0; ht < 24; ht++) hourTotals.push(0);
        for (var pr = 0; pr < 7; pr++) {
          for (var pcH = 0; pcH < 24; pcH++) {
            dowTotals[pr] += punchCard[pr][pcH];
            hourTotals[pcH] += punchCard[pr][pcH];
          }
        }
        var peakHour = null, peakN = 0;
        for (var ph = 0; ph < 24; ph++) { if (hourTotals[ph] > peakN) { peakN = hourTotals[ph]; peakHour = ph; } }
        var dowNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        var bestDow = 0;
        for (var bd = 1; bd < 7; bd++) { if (dowTotals[bd] > dowTotals[bestDow]) bestDow = bd; }
        var insights = {
          generatedAt: new Date().toISOString(),
          totals: { solved: sTotal, easy: sEasy, medium: sMed, hard: sHard },
          streak: { current: streakData.current, longest: streakData.max },
          activity: {
            bestDayOfWeek: sTotal > 0 ? dowNames[bestDow] : null,
            peakHour: peakHour,
            byDayOfWeek: dowTotals,
            punchCard: punchCard
          },
          monthlyDifficulty: monthlyDiff,
          platforms: countBy(problems, function(p) { return p.platform || 'Unknown'; }),
          languages: langMap,
          topTopics: sortedEntries(topicMap).slice(0, 15).map(function(e) { return { topic: e[0], count: e[1] }; })
        };
        window.CL_INSIGHTS = insights;
        var insEl = document.getElementById('cl-insights');
        if (insEl) insEl.textContent = JSON.stringify(insights);

        // Recent solves
        var recent = problems.slice().sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); }).slice(0, 10);
        var rows = '';
        for (var k = 0; k < recent.length; k++) {
          var p = recent[k];
          var lang = (p.lang && p.lang.name) ? p.lang.name : (p.language || (p.lang && p.lang.ext) || '—');
          var url = problemUrl(p);
          rows += '<tr>'
            + '<td><a href="' + escHtml(url) + '" target="_blank" rel="noreferrer">' + escHtml(p.title || '—') + '</a></td>'
            + '<td>' + diffBadge(p.difficulty) + '</td>'
            + '<td style="color:var(--muted);font-size:.7rem">' + escHtml(lang) + '</td>'
            + '</tr>';
        }
        document.getElementById('rt').innerHTML = rows || '<tr><td colspan="3" style="color:var(--muted);text-align:center">No solves yet</td></tr>';

        // Footer timestamp
        if (data.updatedAt) {
          var upd = new Date(data.updatedAt);
          var dateStr = upd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
          document.getElementById('ft').innerHTML = 'Last synced: ' + dateStr + ' · <a href="https://codeledger.vkrishna04.me" target="_blank" rel="noreferrer">CodeLedger</a>';
        }

        // All-problems table
        ALL_PROBLEMS = problems.slice().sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
        bindFilters();
        renderAllTable();

        document.getElementById('loading').style.display = 'none';
        // #app was visible all along, carrying the counts baked into the markup.
        // Only the script-drawn cards were held back.
        document.getElementById('app').classList.remove('pending');
      } catch (e) {
        document.getElementById('loading').style.display = 'none';
        var errEl = document.getElementById('err');
        errEl.innerHTML = '<strong>Could not load stats.</strong><br>' + escHtml(e.message)
          + '<br><br><small>Make sure <code>index.json</code> exists at the repo root and GitHub Pages is enabled on the <code>main</code> branch.</small>';
        errEl.style.display = 'block';
      }
    }

    main();
  </script>
  <!-- Filled by main() with the CL_INSIGHTS aggregate JSON — inert to the
       browser, liftable by anything that reads the rendered DOM. -->
  <script type="application/json" id="cl-insights"></script>
  <script>
    // Inject server-provided commit list for client-side rendering.
    // "<" is escaped so a commit message carrying a closing script tag cannot end
    // this block; U+2028/U+2029 are escaped because JSON.stringify emits them raw
    // and they are line terminators to any parser predating ES2019.
    //
    // This comment may not itself spell that tag out. The HTML parser does not
    // know what a JS comment is: the literal characters used to end this element,
    // wherever they appear, end it. Writing them here closed the block and dumped
    // every line below onto the page as visible text.
    window.SERVER_COMMIT_LIST = ${JSON.stringify(commitList || [])
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029")};
    (function renderServerCommits() {
      try {
        var list = window.SERVER_COMMIT_LIST || [];
        if (!list.length) return;
        var panel = document.getElementById('commit-panel');
        if (!panel) return;
        var html = '';
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          var color = c.verified ? '#10b981' : '#ef4444';
          var msg = c.message || (c.sha ? String(c.sha).substring(0,7) : 'commit');
          // Commit message, author and URL are repository content: on a public
          // repo anyone who lands a commit controls them, so all three are
          // escaped and the URL is restricted to http(s).
          // Doubled backslashes — see hmWindow(). Written singly this reached
          // the page as /^https?:// followed by a line comment, which deleted
          // both the escaping and the scheme check below it.
          var url = /^https?:\\/\\//i.test(String(c.url || '')) ? escHtml(c.url) : '#';
          html += '<div style="display:flex;align-items:center;gap:.6rem;padding:.25rem 0;border-bottom:1px solid rgba(255,255,255,.02)">'
               + '<div style="width:10px;height:10px;border-radius:50%;background:' + color + '"></div>'
               + '<a href="' + url + '" target="_blank" rel="noreferrer" style="color:var(--text);text-decoration:none">' + escHtml(msg) + '</a>'
               + '<span style="color:var(--muted);font-size:.75rem;margin-left:auto">' + escHtml(c.author || '') + '</span>'
               + '</div>';
        }
        panel.innerHTML = html;
      } catch (e) { console.warn('renderServerCommits failed', e); }
    })();
  </script>
  <script>
    (function() {
      var STORAGE_KEY = 'cl-pages-theme';
      var root = document.documentElement;
      var btn = document.getElementById('theme-btn');
      function applyTheme(t) {
        if (t === 'light') { root.setAttribute('data-theme', 'light'); if (btn) btn.textContent = '🌙'; }
        else { root.removeAttribute('data-theme'); if (btn) btn.textContent = '☀'; }
        try { localStorage.setItem(STORAGE_KEY, t); } catch(_) {}
      }
      try { applyTheme(localStorage.getItem(STORAGE_KEY) || 'dark'); } catch(_) { applyTheme('dark'); }
      if (btn) btn.addEventListener('click', function() {
        applyTheme(root.hasAttribute('data-theme') ? 'dark' : 'light');
      });
    })();
  </script>
</body>
</html>`;
}

/**
 * Returns a root README.md for the user's CodeLedger repo.
 * pagesUrl is the GitHub Pages URL (or custom domain if configured), and is
 * empty when no site is known to exist — the header badges then link to the
 * repository itself, which always resolves, instead of to a Pages address that
 * a free private repo can never have.
 */
export function getRepoReadme(owner, repo, pagesUrl, _theme, _settings, indexMeta) {
  const url = pagesUrl || "https://github.com/" + owner + "/" + repo;
  const stats = indexMeta?.stats || null;

  const updatedAt = indexMeta?.updatedAt
    ? new Date(indexMeta.updatedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const recentProblems = (indexMeta?.problems || [])
    .filter((p) => p.timestamp)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 10);

  const LOGO_URL =
    "https://raw.githubusercontent.com/Life-Experimentalist/Code-Ledger/refs/heads/main/src/assets/images/logo.png";
  const ICON_URL =
    "https://raw.githubusercontent.com/Life-Experimentalist/Code-Ledger/refs/heads/main/src/assets/images/icon-transparent.png";
  const SOCIAL_URL =
    "https://raw.githubusercontent.com/Life-Experimentalist/Code-Ledger/refs/heads/main/src/assets/images/social%20preview.png";
  const total = stats?.total || 0;
  const easy = stats?.easy || 0;
  const medium = stats?.medium || 0;
  const hard = stats?.hard || 0;
  const languages = stats?.byLang ? Object.keys(stats.byLang).length : 0;
  const platforms = stats?.byPlatform ? Object.keys(stats.byPlatform).length : 0;

  // One shape for all six, so the row cannot drift apart again the way it had:
  // a single style, no per-badge logo (only `Solutions` carried one, which made
  // it the odd one out), and six colours distinct from each other *and* from the
  // gamification row rendered directly below. That rules out 8b5cf6, which is
  // the points badge, and 64748b, which is the colour a gamification badge uses
  // to mean "zero" — a slate `Platforms` badge read as a disabled one.
  const shield = (label, value, color) =>
    "[![" +
    label +
    "](https://img.shields.io/badge/" +
    label +
    "-" +
    value +
    "-" +
    color +
    "?style=flat-square)](" +
    url +
    ")";

  const lines = [
    "<!-- CODELEDGER_AUTO_GENERATED_START -->",
    "",
    '<div align="center">',
    "",
    '<img src="' + ICON_URL + '" alt="CodeLedger" width="72" height="72" />',
    "",
    "# " + owner + "'s DSA Solutions",
    "",
    [
      shield("Solutions", total, "06b6d4"),
      shield("Easy", easy, "22c55e"),
      shield("Medium", medium, "f59e0b"),
      shield("Hard", hard, "ef4444"),
      shield("Languages", languages, "14b8a6"),
      shield("Platforms", platforms, "6366f1"),
    ].join(" "),
    "",
    // The gamification markers are emitted here, inside the centered div and
    // empty, purely to reserve the position. `upsertReadmeBlock` fills them in
    // the same commit (infra-builder runs it against this merged text), and the
    // nightly refresh workflow rewrites them in place afterwards.
    //
    // They have to be written by this template rather than left to
    // `upsertReadmeBlock`'s own fallback: with no markers to find, it prepends
    // the block to the top of the file, which put the streak card above the
    // `<div align="center">` and therefore left-aligned above the title.
    README_START,
    README_END,
    "",
    "> Automatically tracked by [CodeLedger](https://codeledger.vkrishna04.me) — every problem solved, committed to Git.",
    "",
    "**[View Live Dashboard →](" + url + ")**",
    "",
  ];

  // Its own paragraph. Pushed onto the previous line it rendered as
  // "View Live Dashboard →Last updated: Jan 1, 2026", and the empty string that
  // stood in for it when absent left a stray blank line behind.
  if (updatedAt) lines.push("*Last updated: " + updatedAt + "*", "");

  lines.push("[![CodeLedger](" + SOCIAL_URL + ")](" + url + ")", "", "</div>", "", "---", "");

  // Stats — breakdowns only. The four-column Total/Easy/Medium/Hard table that
  // used to open this section restated the Solutions/Easy/Medium/Hard badge row
  // from the same `stats` object, about ten lines further up the same page.
  if (stats) {
    const breakdowns = [];

    // Platform breakdown
    if (stats.byPlatform && Object.keys(stats.byPlatform).length) {
      const platRows = Object.entries(stats.byPlatform).sort((a, b) => b[1] - a[1]);
      breakdowns.push(
        "**By Platform:** " + platRows.map(([p, n]) => p + " (" + n + ")").join(" · "),
      );
      breakdowns.push("");
    }

    // Language breakdown
    if (stats.byLang && Object.keys(stats.byLang).length) {
      const langRows = Object.entries(stats.byLang)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
      breakdowns.push(
        "**Top Languages:** " + langRows.map(([l, n]) => l + " (" + n + ")").join(" · "),
      );
      breakdowns.push("");
    }

    // Topic breakdown
    if (stats.byTopic && Object.keys(stats.byTopic).length) {
      const topicRows = Object.entries(stats.byTopic)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      breakdowns.push(
        "**Top Topics:** " + topicRows.map(([t, n]) => t + " (" + n + ")").join(" · "),
      );
      breakdowns.push("");
    }

    // Only when there is something under it. The counts table used to guarantee
    // the section had a body; with that gone, a `stats` carrying no breakdown
    // maps would leave a bare "## Stats" heading against a horizontal rule.
    if (breakdowns.length) lines.push("## Stats", "", ...breakdowns, "---", "");
  }

  // Recent solves
  const LANG_DISPLAY = {
    pythondata: "Python (Pandas)",
    python3: "Python3",
    python: "Python",
    javascript: "JavaScript",
    typescript: "TypeScript",
    java: "Java",
    cpp: "C++",
    c: "C",
    csharp: "C#",
    kotlin: "Kotlin",
    swift: "Swift",
    go: "Go",
    rust: "Rust",
    scala: "Scala",
    ruby: "Ruby",
    php: "PHP",
  };
  if (recentProblems.length) {
    lines.push("## Recent Solves", "");
    lines.push("| Problem | Difficulty | Language | Platform | Date |");
    lines.push("|---------|-----------|----------|----------|------|");
    const thisYear = new Date().getFullYear();
    recentProblems.forEach((p) => {
      const ts = p.timestamp > 1e12 ? p.timestamp : p.timestamp * 1000;
      const d = new Date(ts);
      const isSameYear = d.getFullYear() === thisYear;
      const date = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        ...(isSameYear ? {} : { year: "numeric" }),
      });
      const rawLang = (p.lang && (p.lang.name || p.lang)) || "?";
      const lang = LANG_DISPLAY[rawLang.toLowerCase()] || rawLang;
      const slug = p.titleSlug || "";
      const titleText = p.title || slug || "?";
      const titleCell = slug
        ? "[" + titleText + "](" + CONSTANTS.makeProblemUrl(p.platform || "leetcode", slug) + ")"
        : titleText;
      const diff = p.difficulty || "?";
      const plat = p.platform || "?";
      lines.push("| " + [titleCell, diff, lang, plat, date].join(" | ") + " |");
    });
    lines.push("");
    lines.push("---", "");
  }

  lines.push(
    "## Repository Structure",
    "",
    "```",
    "problems/",
    "  lc-{slug}/                  ← one directory per problem",
    "    lc-{slug}.py              ← your solution (named after the slug)",
    "    lc-{slug}.md              ← problem statement + runtime + memory + AI review",
    "  {canonical-slug}/",
    "    leetcode/                 ← platform subdir (when canonical ID is assigned)",
    "      lc-{slug}.py",
    "index.json                    ← machine-readable index (all problems + stats)",
    "index.html                    ← live GitHub Pages dashboard",
    "chats/                        ← saved AI conversations (YYYY-MM-DD-*.md)",
    ".codeledger/                  ← extension config & knowledge bank",
    "```",
    "",
    "---",
    "",
    "## About",
    "",
    "This repository is managed by [CodeLedger](https://codeledger.vkrishna04.me), a browser extension that automatically commits every accepted DSA solution to GitHub with AI-powered code reviews.",
    "",
    "- Solutions committed automatically the instant they are accepted",
    "- AI code reviews (complexity analysis, hints, optimizations) committed alongside code",
    "- Live stats dashboard: " + url,
    "- Cross-device sync — your history is always up to date on any machine",
    "- Fully owned by you — plain files, no lock-in, no third-party servers",
    "",
    "---",
    "",
    '<div align="center">',
    "",
    '<img src="' + LOGO_URL + '" width="32" alt="CodeLedger" />',
    "",
    "Built with [CodeLedger](https://codeledger.vkrishna04.me) · " +
      "[⭐ Star the extension](https://github.com/Life-Experimentalist/Code-Ledger) · " +
      "[Apache 2.0](https://github.com/Life-Experimentalist/Code-Ledger/blob/main/LICENSE.md)",
    "",
    "</div>",
    "",
    "<!-- CODELEDGER_AUTO_GENERATED_END -->",
    "",
  );

  return lines.filter((l) => l !== null && l !== undefined).join("\n");
}
