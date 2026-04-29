/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Returns a self-contained HTML stats page for GitHub Pages.
 * The page fetches ./index.json at runtime and renders a full dashboard.
 */
export function getPagesHtml() {
  // NOTE: No backtick template literals inside the returned string — this entire
  // string is itself a template literal, so nested backticks would terminate it.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CodeLedger — DSA Stats</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
  <style>
    :root {
      --bg: #050508; --surface: #0a0a0f; --border: rgba(255,255,255,.05);
      --cyan: #06b6d4; --text: #e2e8f0; --muted: #64748b;
      --easy: #34d399; --med: #fbbf24; --hard: #f87171;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-height: 100vh; line-height: 1.5; }
    a { color: var(--cyan); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Layout */
    .wrap { max-width: 1080px; margin: 0 auto; padding: 0 1.25rem 4rem; }
    header {
      border-bottom: 1px solid var(--border); padding: .75rem 0; margin-bottom: 2rem;
      position: sticky; top: 0; background: rgba(5,5,8,.9); backdrop-filter: blur(12px); z-index: 10;
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
    .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: .875rem; margin-bottom: 1rem; }
    @media (max-width: 560px) { .stats-row { grid-template-columns: repeat(2,1fr); } }
    .stat { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; text-align: center; }
    .stat-n { font-size: 2rem; font-weight: 700; line-height: 1; margin-bottom: .2rem; }
    .stat-l { font-size: .55rem; text-transform: uppercase; letter-spacing: .15em; color: var(--muted); }
    .stat.t .stat-n { color: var(--cyan); }
    .stat.e .stat-n { color: var(--easy); }
    .stat.m .stat-n { color: var(--med); }
    .stat.h .stat-n { color: var(--hard); }

    /* 2-col grid */
    .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    @media (max-width: 660px) { .g2 { grid-template-columns: 1fr; } }

    /* Heatmap */
    .hm-outer { margin-bottom: 1rem; }
    .hm-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .hm-wrap { display: inline-flex; gap: 4px; align-items: flex-start; }
    .hm-side { display: grid; grid-template-rows: repeat(7,11px); gap: 3px; font-size: .55rem; color: var(--muted); padding-right: 6px; padding-top: 20px; text-align: right; }
    .hm-main { display: flex; flex-direction: column; gap: 4px; }
    .hm-months { display: flex; gap: 3px; font-size: .58rem; color: var(--muted); min-height: 18px; align-items: flex-end; }
    .hm-months span { min-width: 14px; white-space: nowrap; }
    .hm-cols { display: flex; gap: 3px; }
    .hm-col { display: flex; flex-direction: column; gap: 3px; }
    .hm-cell { width: 11px; height: 11px; border-radius: 2px; background: rgba(255,255,255,.04); flex-shrink: 0; }
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
  </style>
</head>
<body>
  <header>
    <div class="hdr">
      <div class="logo">
        <div class="logo-dot"></div>
        <div class="logo-text">Code<b>Ledger</b></div>
      </div>
      <a id="repo-link" class="repo-pill" href="#" target="_blank" rel="noreferrer">—</a>
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
    </div>

    <div class="card hm-outer">
      <div class="card-label">Activity — Last 12 Months</div>
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

    <div class="footer" id="ft">Tracked by <a href="https://codeledger.vkrishna04.me" target="_blank" rel="noreferrer">CodeLedger</a></div>
  </div>

  <script>
    var PALETTE = ['#06b6d4','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6','#f97316','#a855f7'];
    var PLATFORM_COLORS = { leetcode: '#FFA116', geeksforgeeks: '#2F8D46', codeforces: '#1F8ACB' };
    var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    function paletteColor(i) { return PALETTE[i % PALETTE.length]; }
    function platformColor(name) { return PLATFORM_COLORS[(name || '').toLowerCase()] || '#64748b'; }

    function dayKey(d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function buildHeatmap(problems) {
      var dayMap = {};
      for (var i = 0; i < problems.length; i++) {
        var p = problems[i];
        if (!p.timestamp) continue;
        var k = dayKey(new Date(p.timestamp));
        dayMap[k] = (dayMap[k] || 0) + 1;
      }

      var now = new Date();
      var rangeStart = new Date(now);
      rangeStart.setFullYear(rangeStart.getFullYear() - 1);

      var cur = new Date(rangeStart);
      cur.setDate(cur.getDate() - cur.getDay()); // snap to Sunday

      var grid = document.getElementById('hm-g');
      var monthsEl = document.getElementById('hm-m');
      grid.innerHTML = '';
      monthsEl.innerHTML = '';

      var colEl = null;
      var prevMonth = -1;
      var monthSpans = [];

      while (cur <= now) {
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
          var inRange = cur >= rangeStart && cur <= now;
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

      // Render month labels with approximate spacing
      var totalCols = grid.children.length;
      for (var j = 0; j < monthSpans.length; j++) {
        var ms = monthSpans[j];
        var nextIdx = j + 1 < monthSpans.length ? monthSpans[j + 1].idx : totalCols;
        var span = document.createElement('span');
        span.textContent = ms.label;
        span.style.minWidth = ((nextIdx - ms.idx) * 14) + 'px';
        monthsEl.appendChild(span);
      }
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
      var host = window.location.hostname;
      var owner = host.split('.')[0];
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

    async function main() {
      try {
        var res = await fetch('./index.json');
        if (!res.ok) throw new Error('index.json not found (HTTP ' + res.status + ')');
        var data = await res.json();
        var problems = data.problems || [];
        var stats = data.stats || {};

        // Repo link
        var repo = getRepoUrl();
        var rl = document.getElementById('repo-link');
        rl.href = repo.url;
        rl.textContent = repo.label + ' ↗';

        // Quick stats
        document.getElementById('sn-t').textContent = stats.total !== undefined ? stats.total : problems.length;
        document.getElementById('sn-e').textContent = stats.easy !== undefined ? stats.easy : problems.filter(function(p) { return p.difficulty === 'Easy'; }).length;
        document.getElementById('sn-m').textContent = stats.medium !== undefined ? stats.medium : problems.filter(function(p) { return p.difficulty === 'Medium'; }).length;
        document.getElementById('sn-h').textContent = stats.hard !== undefined ? stats.hard : problems.filter(function(p) { return p.difficulty === 'Hard'; }).length;

        // Heatmap
        buildHeatmap(problems);

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
    "            const readme = [",
    "              '# DSA Solutions',",
    "              '',",
    "              '> Managed by [CodeLedger](https://github.com/Life-Experimentalist/CodeLedger). Last updated: ' + updated,",
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
    "            ].join('\\n');",
    "            fs.writeFileSync('README.md', readme);",
    "            console.log('README updated with ' + problems.length + ' problems.');",
    "",
    "      - name: Commit README",
    "        run: |",
    "          git config user.name \"github-actions[bot]\"",
    "          git config user.email \"41898282+github-actions[bot]@users.noreply.github.com\"",
    "          git add README.md",
    "          git diff --staged --quiet && echo \"No changes\" || git commit -m \"chore: update stats README [skip ci]\"",
    "          git push",
  ];
  return lines.join(nl);
}
