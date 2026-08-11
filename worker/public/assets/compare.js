/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The /compare page.
 *
 * Everything that decides what a link means — parsing `?repos=`, validating a
 * reference, reading a stats file, ranking the result — lives in party.js,
 * which is a byte-identical copy of the extension's src/core/party.js. This
 * file is only the page: read the URL, draw rows, keep the URL in step with
 * what is on screen.
 *
 * There is no state on the server and none in storage. The list *is* the URL,
 * which is what makes a shared link show the sender exactly what they saw.
 */

import {
  METRICS,
  ERROR_TEXT,
  parseFriendRef,
  friendLabel,
  repoUrl,
  parseCompareParam,
  buildCompareUrl,
  compareRows,
  stalenessDays,
  addFriend,
  fetchFriendStats,
} from "./party.js";

const $ = (id) => document.getElementById(id);
const rowsEl = $("rows");
const metricsEl = $("metrics");
const errorEl = $("add-error");
const shareEl = $("share");

let refs = parseCompareParam(new URLSearchParams(location.search).get("repos"));
let metric = "totalPoints";
/** @type {Record<string, any>} */
let results = {};

function todayKey() {
  // UTC, matching what the extension writes into `asOf` for a published file.
  return new Date().toISOString().slice(0, 10);
}

function text(el, value) {
  el.textContent = value;
  return el;
}

function freshness(asOf) {
  const days = stalenessDays(asOf, todayKey());
  if (days === null) return "date unknown";
  if (days === 0) return "updated today";
  if (days === 1) return "updated yesterday";
  return `updated ${days} days ago`;
}

function syncUrl() {
  const url = buildCompareUrl(refs, `${location.origin}/compare`);
  // replaceState, not pushState: adding a name is not a navigation, and a back
  // button that walks backwards through a list somebody built is annoying.
  history.replaceState(null, "", refs.length ? new URL(url).search : location.pathname);
  shareEl.hidden = refs.length === 0;
  $("share-url").value = url;
}

function drawMetrics() {
  metricsEl.replaceChildren(
    ...METRICS.map((m) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = m.label;
      b.setAttribute("aria-pressed", String(m.id === metric));
      b.addEventListener("click", () => {
        metric = m.id;
        drawMetrics();
        draw();
      });
      return b;
    }),
  );
}

function draw() {
  if (!refs.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent =
      "Add a repository above to start, or open a link somebody shared with you. Any public repository a CodeLedger user publishes badges from will work.";
    rowsEl.replaceChildren(p);
    return;
  }

  const entries = refs.map((r) => ({
    id: r.id,
    label: friendLabel(r),
    ref: r,
    stats: results[r.id]?.ok ? results[r.id].stats : null,
    error: results[r.id] && !results[r.id].ok ? results[r.id].error : "",
  }));

  const short = METRICS.find((m) => m.id === metric)?.short || "";

  rowsEl.replaceChildren(
    ...compareRows(entries, metric).map((row) => {
      const el = document.createElement("div");
      el.className = row.stats ? "row" : "row bad";

      el.append(
        text(
          Object.assign(document.createElement("div"), { className: "rank" }),
          row.rank ? `#${row.rank}` : "—",
        ),
      );

      const who = document.createElement("div");
      who.className = "who";
      const a = document.createElement("a");
      a.href = repoUrl(row.ref);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = row.label;
      who.append(a);

      const sub = document.createElement("div");
      sub.className = "sub";
      if (row.stats) {
        const s = row.stats;
        sub.textContent = `${s.currentStreak}d streak · ${s.totalPoints} pts · ${s.totalSolves} solved · Lv ${s.level} ${s.levelName} · ${freshness(s.asOf)}`;
      } else {
        sub.textContent = results[row.id]
          ? ERROR_TEXT[row.error] || ERROR_TEXT.network
          : "Reading…";
      }
      who.append(sub);

      if (row.stats) {
        const bar = document.createElement("div");
        bar.className = "bar";
        const fill = document.createElement("i");
        fill.style.width = `${Math.round(Math.max(0, Math.min(1, row.share)) * 100)}%`;
        bar.append(fill);
        who.append(bar);
      }
      el.append(who);

      const value = document.createElement("div");
      value.className = "value";
      const b = document.createElement("b");
      b.textContent = row.value === null ? "—" : String(row.value);
      const sm = document.createElement("span");
      sm.textContent = short;
      value.append(b, sm);
      el.append(value);

      return el;
    }),
  );
}

async function load() {
  const pending = refs.filter((r) => !results[r.id]);
  if (!pending.length) return;
  draw();
  await Promise.all(
    pending.map(async (r) => {
      try {
        results[r.id] = await fetchFriendStats(r);
      } catch {
        results[r.id] = { ok: false, error: "network" };
      }
      // Drawn as each one lands rather than after the slowest, so a list of ten
      // fills in instead of sitting blank behind one unreachable repository.
      draw();
    }),
  );
}

$("add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("add-input");
  const result = addFriend(refs, input.value, "");
  if (!result.added) {
    errorEl.hidden = false;
    errorEl.textContent =
      result.reason === "duplicate"
        ? "That repository is already in the list."
        : result.reason === "full"
          ? "That is as many as this page will line up at once."
          : "That does not look like a GitHub repository. Try owner/repo, or paste the repo URL.";
    return;
  }
  errorEl.hidden = true;
  input.value = "";
  refs = result.friends;
  syncUrl();
  load();
});

$("share-copy").addEventListener("click", async () => {
  const btn = $("share-copy");
  try {
    await navigator.clipboard.writeText($("share-url").value);
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = "Copy link"), 2000);
  } catch {
    // Clipboard access can be refused. The field beside the button holds the
    // same text, so selecting it is still available — say so rather than
    // failing silently.
    $("share-url").select();
    btn.textContent = "Select and copy";
  }
});

// A single ref in the query is the common shape of a link somebody pasted from
// their own README, so it is worth accepting `?repo=` as well as `?repos=`.
const single = new URLSearchParams(location.search).get("repo");
if (single && !refs.length) {
  const ref = parseFriendRef(single);
  if (ref) refs = [ref];
}

drawMetrics();
syncUrl();
draw();
load();
