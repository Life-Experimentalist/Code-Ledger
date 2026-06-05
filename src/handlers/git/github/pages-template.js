/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CONSTANTS } from "../../../core/constants.js";

/**
 * Returns a self-contained HTML stats page for GitHub Pages.
 * The page fetches ./index.json at runtime and renders a full dashboard.
 */
export function getPagesHtml(opts = {}) {
  const theme = opts.theme || {};
  const settings = opts.settings || {};
  const commitSummary = opts.commitSummary || null;
  const reportImages = Array.isArray(opts.reportImages)
    ? opts.reportImages
    : [];
  const commitList = Array.isArray(opts.commitList) ? opts.commitList : [];
  // GitHub owner and repo embedded at generation time so custom domains work correctly
  const repoOwner = opts.owner || "";
  const repoName = opts.repo || "";
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
  <meta name="description" content="DSA problem solutions tracked by CodeLedger — GitHub-backed, AI-reviewed, owned by you." />
  <meta property="og:title" content="CodeLedger — DSA Stats" />
  <meta property="og:description" content="DSA solutions committed automatically to GitHub." />
  <meta property="og:image" content="${ASSETS.social}" />
  <meta property="og:type" content="website" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
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
    .hm-side { display: grid; grid-template-rows: repeat(7,var(--hm-cell,11px)); gap: 3px; font-size: .55rem; color: var(--muted); padding-right: 6px; padding-top: 20px; text-align: right; }
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

    /* Bars */
    .bar-row { display: flex; align-items: center; gap: .625rem; margin-bottom: .55rem; }
    .bar-lbl { font-size: .7rem; color: var(--text); min-width: 90px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar-track { flex: 1; background: rgba(255,255,255,.05); border-radius: 3px; height: 7px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 3px; }
    .bar-ct { font-size: .65rem; color: var(--muted); min-width: 24px; text-align: right; font-variant-numeric: tabular-nums; }

    /* Chart */
    .chart-box { position: relative; height: 180px; }

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
    #loading { display: flex; align-items: center; justify-content: center; min-height: 50vh; color: var(--muted); font-size: .85rem; letter-spacing: .05em; }
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
</head>
<body>
  <header>
    <div class="hdr">
      <div class="logo">
        <img src="${ASSETS.iconTransparent}" alt="logo" style="width:28px;height:28px;border-radius:6px;margin-right:.5rem;object-fit:contain" />
        <div class="logo-text">Code<b>Ledger</b></div>
      </div>
      <div style="display:flex;align-items:center;gap:.5rem">
        ${commitSummary && settings.pages_show_verification ? `<div class="repo-pill" style="margin-right:.5rem">Verified: ${commitSummary.verified} / ${commitSummary.total}</div>` : ""}
        <a id="repo-link" class="repo-pill" href="#" target="_blank" rel="noreferrer">—</a>
        <button class="theme-toggle" id="theme-btn" title="Toggle light/dark mode" aria-label="Toggle theme">☀</button>
      </div>
    </div>
  </header>

  <div id="loading">Loading stats…</div>
  <div id="err"></div>

  <div id="app" style="display:none" class="wrap">
    <div class="stats-row">
      <div class="stat t"><div class="stat-n" id="sn-t">0</div><div class="stat-l">Total</div></div>
      <div class="stat e"><div class="stat-n" id="sn-e">0</div><div class="stat-l">Easy</div></div>
      <div class="stat m"><div class="stat-n" id="sn-m">0</div><div class="stat-l">Medium</div></div>
      <div class="stat h"><div class="stat-n" id="sn-h">0</div><div class="stat-l">Hard</div></div>
      <div class="stat s"><div class="stat-n" id="sn-cs">—</div><div class="stat-l">Streak</div></div>
      <div class="stat b"><div class="stat-n" id="sn-ms">—</div><div class="stat-l">Best Streak</div></div>
    </div>

    <div class="card hm-outer">
      <div class="card-label" id="hm-label">Activity</div>
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
        <div id="commit-panel" style="font-size:.9rem;color:var(--muted);margin-bottom:.6rem">${commitSummary ? `Verified ${commitSummary.verified} of ${commitSummary.total} recent commits` : "Commit verification not enabled"}</div>
      </div>
      <div class="card">
        <div class="card-label">Report Images</div>
        <div id="report-images" style="display:flex;gap:.5rem;flex-wrap:wrap">${reportImages.length ? reportImages.map((p) => `<a href="/${p}" target="_blank"><img src="/${p}" style="width:120px;height:auto;border-radius:8px;border:1px solid rgba(255,255,255,.04)"></a>`).join("") : '<div style="color:var(--muted)">No report images found</div>'}</div>
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
        ${reportImages.map((img) => `<a href="/${img}" target="_blank" style="display:block"><img src="/${img}" alt="report image" style="width:100%;height:auto;border-radius:8px;border:1px solid rgba(255,255,255,.04)"></a>`).join("")}
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

    function dayKey(d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function buildHeatmap(problems) {
      var dayMap = {};
      for (var i = 0; i < problems.length; i++) {
        var p = problems[i];
        if (!p.timestamp) continue;
        var ts = p.timestamp;
        var tsMs = (typeof ts === 'number' && ts < 1e10) ? ts * 1000 : ts;
        var k = dayKey(new Date(tsMs));
        dayMap[k] = (dayMap[k] || 0) + 1;
      }

      var now = new Date();
      var rangeEnd = new Date(now);
      var rangeStart = new Date(now);
      rangeStart.setFullYear(rangeStart.getFullYear() - 1); // exactly 1 year back (leap-year aware)

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
        if (cur.getDay() === 0) {
          colEl = document.createElement('div');
          colEl.className = 'hm-col';
          grid.appendChild(colEl);

          var mon = cur.getMonth();
          if (mon !== prevMonth && cur >= rangeStart) {
            prevMonth = mon;
            monthSpans.push({ idx: grid.children.length - 1, label: MONTH_NAMES[mon] });
          }
        }

        if (colEl) {
          var k2 = dayKey(cur);
          var cnt = dayMap[k2] || 0;
          var inRange = cur >= rangeStart && cur <= rangeEnd;
          var cell = document.createElement('div');
          var cls = 'hm-cell';
          if (inRange && cnt > 0) cls += cnt >= 4 ? ' l4' : cnt >= 3 ? ' l3' : cnt >= 2 ? ' l2' : ' l1';
          cell.className = cls;
          if (!inRange) cell.style.visibility = 'hidden';
          cell.title = k2 + ': ' + cnt + ' solve' + (cnt !== 1 ? 's' : '');
          colEl.appendChild(cell);
        }

        cur.setDate(cur.getDate() + 1);
      }

      // Store month data globally so renderMonthLabels() can recompute widths after resize
      hmMonthSpans = monthSpans;
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

    function diffBadge(d) {
      if (d === 'Easy') return '<span class="badge be">Easy</span>';
      if (d === 'Medium') return '<span class="badge bm">Med</span>';
      if (d === 'Hard') return '<span class="badge bh">Hard</span>';
      return '<span class="badge" style="color:var(--muted)">' + escHtml(d || '—') + '</span>';
    }

    function problemUrl(p) {
      if (p.url) return p.url;
      var pl = (p.platform || '').toLowerCase();
      if (pl === 'leetcode' && p.titleSlug) return 'https://leetcode.com/problems/' + p.titleSlug + '/';
      if (pl === 'geeksforgeeks' && p.titleSlug) return 'https://practice.geeksforgeeks.org/problems/' + p.titleSlug + '/';
      if (pl === 'codeforces' && p.titleSlug) return 'https://codeforces.com/problemset/problem/' + p.titleSlug;
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
        if (diff && p.difficulty !== diff) return false;
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
        var sTotal = stats.total !== undefined ? stats.total : problems.length;
        var sEasy  = stats.easy   !== undefined ? stats.easy   : problems.filter(function(p) { return p.difficulty === 'Easy';   }).length;
        var sMed   = stats.medium !== undefined ? stats.medium : problems.filter(function(p) { return p.difficulty === 'Medium'; }).length;
        var sHard  = stats.hard   !== undefined ? stats.hard   : problems.filter(function(p) { return p.difficulty === 'Hard';   }).length;
        document.getElementById('sn-t').textContent = sTotal;
        document.getElementById('sn-e').textContent = sEasy;
        document.getElementById('sn-m').textContent = sMed;
        document.getElementById('sn-h').textContent = sHard;

        // Streak stats
        var streakData = computeStreaks(problems);
        document.getElementById('sn-cs').textContent = streakData.current + 'd';
        document.getElementById('sn-ms').textContent = streakData.max + 'd';

        // Heatmap
        buildHeatmap(problems);
        var hmlEl = document.getElementById('hm-label');
        if (hmlEl) hmlEl.textContent = 'Activity — Last 12 Months';
        function resizeHeatmap() {
          var outer = document.querySelector('.hm-outer');
          var cols = document.querySelectorAll('.hm-col').length;
          if (!outer || !cols) return;
          var sideW = outer.querySelector('.hm-side') ? outer.querySelector('.hm-side').offsetWidth + 8 : 44;
          var avail = outer.clientWidth - sideW - cols * 3;
          var cell = Math.max(8, Math.floor(avail / cols));
          document.documentElement.style.setProperty('--hm-cell', cell + 'px');
          renderMonthLabels();
        }
        resizeHeatmap();
        window.addEventListener('resize', resizeHeatmap);

        // Velocity + difficulty charts
        buildVelocityChart(problems);
        buildDifficultyDonut(sEasy, sMed, sHard);

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

        // Recent solves
        var recent = problems.slice().sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); }).slice(0, 10);
        var rows = '';
        for (var k = 0; k < recent.length; k++) {
          var p = recent[k];
          var lang = (p.lang && p.lang.name) ? p.lang.name : (p.language || (p.lang && p.lang.ext) || '—');
          var url = problemUrl(p);
          rows += '<tr>'
            + '<td><a href="' + url + '" target="_blank" rel="noreferrer">' + escHtml(p.title || '—') + '</a></td>'
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
        document.getElementById('app').style.display = 'block';
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
  <script>
    // Inject server-provided commit list for client-side rendering
    window.SERVER_COMMIT_LIST = ${JSON.stringify(commitList || []).replace(/</g, "\\u003c")};
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
          var msg = c.message || (c.sha ? c.sha.substring(0,7) : 'commit');
          html += '<div style="display:flex;align-items:center;gap:.6rem;padding:.25rem 0;border-bottom:1px solid rgba(255,255,255,.02)">'
               + '<div style="width:10px;height:10px;border-radius:50%;background:' + color + '"></div>'
               + '<a href="' + (c.url || '#') + '" target="_blank" rel="noreferrer" style="color:var(--text);text-decoration:none">' + (msg) + '</a>'
               + '<span style="color:var(--muted);font-size:.75rem;margin-left:auto">' + (c.author || '') + '</span>'
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

export function getActionsWorkflow() {
  // Build with string concatenation so no nested backticks or tricky escapes are needed.
  const nl = "\n";
  const lines = [
    "name: Update Stats README",
    "",
    "on:",
    "  push:",
    "    paths:",
    "      - 'index.json'",
    "  workflow_dispatch:",
    "",
    "permissions:",
    "  contents: write",
    "",
    "jobs:",
    "  update-readme:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: Checkout",
    "        uses: actions/checkout@v4",
    "",
    "      - name: Generate README",
    "        uses: actions/github-script@v7",
    "        with:",
    "          script: |",
    "            const fs = require('fs');",
    "            const startMarker = '<!-- CODELEDGER_AUTO_GENERATED_START -->';",
    "            const endMarker = '<!-- CODELEDGER_AUTO_GENERATED_END -->';",
    "            const data = JSON.parse(fs.readFileSync('index.json', 'utf8'));",
    "            const stats = data.stats || {};",
    "            const problems = data.problems || [];",
    "            const updated = data.updatedAt",
    "              ? new Date(data.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })",
    "              : '-';",
    "            const recentRows = problems",
    "              .filter(p => p.timestamp)",
    "              .sort((a, b) => b.timestamp - a.timestamp)",
    "              .slice(0, 5)",
    "              .map(p => {",
    "                const ts = p.timestamp > 1e12 ? p.timestamp : p.timestamp * 1000;",
    "                const date = new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });",
    "                const lang = (p.lang && (p.lang.name || p.lang)) || '?';",
    "                return '| ' + [p.title || p.titleSlug, p.difficulty || '?', lang, date].join(' | ') + ' |';",
    "              });",
    "            const generatedBlock = [",
    "              startMarker,",
    "              '# DSA Solutions',",
    "              '',",
    "              '> Managed by [CodeLedger](https://github.com/Life-Experimentalist/Code-Ledger). Last updated: ' + updated,",
    "              '',",
    "              '## Stats',",
    "              '',",
    "              '| Total | Easy | Medium | Hard |',",
    "              '|:-----:|:----:|:------:|:----:|',",
    "              '| **' + (stats.total || 0) + '** | ' + (stats.easy || 0) + ' | ' + (stats.medium || 0) + ' | ' + (stats.hard || 0) + ' |',",
    "              '',",
    "              '## Recent Solves',",
    "              '',",
    "              '| Problem | Difficulty | Language | Date |',",
    "              '|---------|-----------|----------|------|',",
    "              ...(recentRows.length ? recentRows : ['| - | - | - | - |']),",
    "              '',",
    "              endMarker,",
    "            ].join('\\n');",
    "            const readmePath = 'README.md';",
    "            if (fs.existsSync(readmePath)) {",
    "              const existing = fs.readFileSync(readmePath, 'utf8');",
    "              if (existing.includes(startMarker) && existing.includes(endMarker)) {",
    "                const pattern = new RegExp(startMarker + '[\\\\s\\\\S]*?' + endMarker);",
    "                const next = existing.replace(pattern, generatedBlock);",
    "                fs.writeFileSync(readmePath, next);",
    "              } else {",
    "                console.log('README.md is manually maintained. Skipping auto-update.');",
    "              }",
    "            } else {",
    "              fs.writeFileSync(readmePath, generatedBlock);",
    "            }",
    "            console.log('README updated with ' + problems.length + ' problems.');",
    "",
    "      - name: Commit README",
    "        run: |",
    '          git config user.name "github-actions[bot]"',
    '          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"',
    "          git add README.md",
    '          git diff --staged --quiet && echo "No changes" || git commit -m "chore: update stats README [skip ci]"',
    "          git push",
  ];
  return lines.join(nl);
}

/**
 * Returns a root README.md for the user's CodeLedger repo.
 * pagesUrl is the GitHub Pages URL (or custom domain if configured).
 */
export function getRepoReadme(
  owner,
  repo,
  pagesUrl,
  _theme,
  _settings,
  indexMeta,
) {
  const url = pagesUrl || "https://" + owner + ".github.io/" + repo + "/";
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

  const lines = [
    "<!-- CODELEDGER_AUTO_GENERATED_START -->",
    "",
    '<div align="center">',
    "",
    '<img src="' + ICON_URL + '" alt="CodeLedger" width="72" height="72" />',
    "",
    "# " + owner + "'s DSA Solutions",
    "",
    "[![Solutions](https://img.shields.io/badge/Solutions-" +
      total +
      "-06b6d4?style=flat-square&logo=github)](" +
      url +
      ")" +
      "  [![Easy](https://img.shields.io/badge/Easy-" +
      easy +
      "-22c55e?style=flat-square)](" +
      url +
      ")" +
      "  [![Medium](https://img.shields.io/badge/Medium-" +
      medium +
      "-f59e0b?style=flat-square)](" +
      url +
      ")" +
      "  [![Hard](https://img.shields.io/badge/Hard-" +
      hard +
      "-ef4444?style=flat-square)](" +
      url +
      ")",
    "",
    "> Automatically tracked by [CodeLedger](https://codeledger.vkrishna04.me) — every problem solved, committed to Git.",
    "",
    "**[View Live Dashboard →](" + url + ")**",
    updatedAt ? "*Last updated: " + updatedAt + "*" : "",
    "",
    "[![CodeLedger](" + SOCIAL_URL + ")](" + url + ")",
    "",
    "</div>",
    "",
    "---",
    "",
  ];

  // Stats table
  if (stats) {
    lines.push("## Stats", "");
    lines.push("| Total | Easy | Medium | Hard |");
    lines.push("|:-----:|:----:|:------:|:----:|");
    lines.push(
      "| **" +
        (stats.total || 0) +
        "** | " +
        (stats.easy || 0) +
        " | " +
        (stats.medium || 0) +
        " | " +
        (stats.hard || 0) +
        " |",
    );
    lines.push("");

    // Platform breakdown
    if (stats.byPlatform && Object.keys(stats.byPlatform).length) {
      const platRows = Object.entries(stats.byPlatform).sort(
        (a, b) => b[1] - a[1],
      );
      lines.push(
        "**By Platform:** " +
          platRows.map(([p, n]) => p + " (" + n + ")").join(" · "),
      );
      lines.push("");
    }

    // Language breakdown
    if (stats.byLang && Object.keys(stats.byLang).length) {
      const langRows = Object.entries(stats.byLang)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
      lines.push(
        "**Top Languages:** " +
          langRows.map(([l, n]) => l + " (" + n + ")").join(" · "),
      );
      lines.push("");
    }

    // Topic breakdown
    if (stats.byTopic && Object.keys(stats.byTopic).length) {
      const topicRows = Object.entries(stats.byTopic)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      lines.push(
        "**Top Topics:** " +
          topicRows.map(([t, n]) => t + " (" + n + ")").join(" · "),
      );
      lines.push("");
    }

    lines.push("---", "");
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
        ? "[" +
          titleText +
          "](" +
          CONSTANTS.makeProblemUrl(p.platform || "leetcode", slug) +
          ")"
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
