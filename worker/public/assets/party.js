/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Party — comparing your ledger against other people's.
 *
 * A "friend" here is nothing but a public repository reference. There is no
 * handshake, no account, no server: adding somebody means writing down
 * `owner/repo` and reading the `badges/stats.json` their own extension already
 * commits. That makes the relationship one-sided by construction — A can watch
 * B without B watching A, and neither is told about the other. The UI has to
 * say so, because a feature that quietly implies mutual consent when there is
 * none is worse than one that admits it.
 *
 * Everything here is pure and dependency-free on purpose. A byte-identical copy
 * is served to the landing page at `worker/public/assets/party.js` so the
 * shareable comparison URL is parsed by the same code the extension uses; run
 * `node dev/sync-party-module.js` after editing, and `test/party.test.js` fails
 * if the two drift.
 */

/**
 * How many repositories a comparison will look at.
 *
 * Each one is a separate anonymous request to raw.githubusercontent.com, so the
 * cap is about not turning a pasted URL into a burst of traffic — and about the
 * comparison staying readable, which stops being true long before 25.
 */
export const PARTY_LIMIT = 25;

/**
 * Branches tried, in order, when a friend was added without naming one.
 *
 * GitHub's default moved from `master` to `main` in 2020 and old ledgers exist,
 * so guessing wrong once is normal. The caller records whichever answered so
 * the guess is not repeated on every render.
 */
export const CANDIDATE_BRANCHES = Object.freeze(["main", "master"]);

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A branch name that can be pasted into a URL path without changing its shape.
 *
 * Git allows more than this, but a ref carrying `..`, a leading slash or a
 * control character in a string we are about to interpolate into a URL is
 * either a typo or an attempt to reach a different path, and neither deserves a
 * request.
 */
function validBranch(name) {
  if (!name) return false;
  if (name.length > 255) return false;
  if (name.startsWith("/") || name.endsWith("/")) return false;
  if (name.includes("..")) return false;
  // git's own forbidden set, plus whitespace and control characters. Hyphens,
  // dots and slashes stay legal — `release/2.1-rc` is an ordinary branch name.
  return !/[\s~^:?*[\]\\]|[\u0000-\u001f\u007f]/.test(name);
}

/**
 * Turn whatever the user pasted into a repository reference.
 *
 * Accepts `owner/repo`, `owner/repo@branch`, a github.com URL with or without
 * `/tree/<branch>`, and a `.git` suffix — the four things that actually end up
 * on a clipboard. Anything else returns null rather than being coerced into a
 * request against a URL nobody meant to visit.
 *
 * @param {string} input
 * @returns {{owner: string, repo: string, branch: string, id: string}|null}
 */
export function parseFriendRef(input) {
  let text = String(input ?? "").trim();
  if (!text) return null;

  let branch = "";

  // A URL first: a github.com link is the thing people copy out of the address
  // bar, and it carries a branch when they were looking at one.
  const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)$/i.exec(text);
  if (url) {
    const parts = url[1].split("/").filter(Boolean);
    if (parts.length < 2) return null;
    text = `${parts[0]}/${parts[1]}`;
    if (parts[2] === "tree" && parts[3]) branch = parts.slice(3).join("/");
  }

  const at = text.lastIndexOf("@");
  if (at > 0) {
    branch = text.slice(at + 1).trim();
    text = text.slice(0, at).trim();
  }

  text = text.replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  const [owner, repo, ...rest] = text.split("/");
  if (rest.length || !owner || !repo) return null;
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo)) return null;
  if (branch && !validBranch(branch)) return null;

  return { owner, repo, branch, id: friendId({ owner, repo, branch }) };
}

/**
 * The identity two entries are compared on.
 *
 * Owner and repo are case-insensitive on GitHub, so `Octocat/Ledger` and
 * `octocat/ledger` are the same person and adding both should not produce two
 * rows. A branch is case-sensitive and is a genuinely different view of the
 * same repository, so it stays part of the identity.
 */
export function friendId(ref) {
  const owner = String(ref?.owner || "").toLowerCase();
  const repo = String(ref?.repo || "").toLowerCase();
  const branch = String(ref?.branch || "");
  return branch ? `${owner}/${repo}@${branch}` : `${owner}/${repo}`;
}

/** How the reference reads to a human — the identity, minus the case-folding. */
export function friendLabel(entry) {
  const nick = String(entry?.label || "").trim();
  if (nick) return nick;
  const branch = entry?.branch ? `@${entry.branch}` : "";
  return `${entry?.owner || "?"}/${entry?.repo || "?"}${branch}`;
}

/** The repository page, for the "this is who you are looking at" link. */
export function repoUrl(ref) {
  return `https://github.com/${ref.owner}/${ref.repo}`;
}

const RAW_BASE = "https://raw.githubusercontent.com";

/**
 * Where a friend's headline numbers live.
 *
 * raw.githubusercontent.com answers anonymously with
 * `access-control-allow-origin: *`, which is what makes the whole feature work
 * with no backend and no token. It also means this only ever works for public
 * repositories — a private one 404s, and the UI reports that as "not shared"
 * rather than as an error, because from the outside the two are the same.
 */
export function statsUrl(ref, branch) {
  const b = branch || ref.branch || CANDIDATE_BRANCHES[0];
  return `${RAW_BASE}/${ref.owner}/${ref.repo}/${encodeURIComponent(b)}/badges/stats.json`;
}

/** The full ledger, fetched only when somebody expands a single friend. */
export function indexUrl(ref, branch) {
  const b = branch || ref.branch || CANDIDATE_BRANCHES[0];
  return `${RAW_BASE}/${ref.owner}/${ref.repo}/${encodeURIComponent(b)}/index.json`;
}

const num = (v, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), max);
};

const str = (v, max) => String(v ?? "").slice(0, max);

/**
 * Read a friend's `badges/stats.json` into something safe to render.
 *
 * This file is written by whoever owns that repository, which is to say: not by
 * us, and not necessarily by CodeLedger at all. Every field is re-derived here
 * with a type and a bound, so a hand-edited file can make a claim that is
 * wrong but cannot make one that is enormous, negative, or a nested object
 * where a number belongs.
 *
 * @param {any} json
 * @returns {object|null} null when the file is not a stats file at all
 */
export function parseStats(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  // Strict, unlike every other field here. The version marker is the one thing
  // that decides whether the rest of the file means what we think it means, so
  // a string `"1"` is treated as "written by something else" rather than
  // coerced into agreement.
  if (json.schema !== 1) return null;

  const diff = json.byDifficulty && typeof json.byDifficulty === "object" ? json.byDifficulty : {};

  return {
    schema: 1,
    asOf: DAY_RE.test(String(json.asOf || "")) ? String(json.asOf) : "",
    currentStreak: num(json.currentStreak, 100000),
    longestStreak: num(json.longestStreak, 100000),
    freezes: num(json.freezes, 1000),
    totalPoints: num(json.totalPoints, 1e9),
    totalSolves: num(json.totalSolves, 1e6),
    totalRecalls: num(json.totalRecalls, 1e6),
    byDifficulty: {
      Easy: num(diff.Easy, 1e6),
      Medium: num(diff.Medium, 1e6),
      Hard: num(diff.Hard, 1e6),
    },
    level: Math.max(1, num(json.level, 999)),
    levelName: str(json.levelName, 40),
    activeDays: num(json.activeDays, 100000),
    dailyTargetPoints: num(json.dailyTargetPoints, 100000),
    achievements: Array.isArray(json.achievements)
      ? json.achievements
          .filter((a) => typeof a === "string")
          .slice(0, 64)
          .map((a) => a.slice(0, 64))
      : [],
  };
}

/**
 * How stale a set of numbers is, in whole days.
 *
 * `asOf` is a day rather than a timestamp because the nightly refresh rewrites
 * the file and a wall-clock stamp would produce a commit every night saying
 * nothing changed. Negative answers are clamped: a repository claiming a future
 * date is reporting a clock problem, not time travel, and "0 days" is the
 * honest way to show it.
 */
export function stalenessDays(asOf, todayKey) {
  if (!DAY_RE.test(String(asOf || "")) || !DAY_RE.test(String(todayKey || ""))) return null;
  const a = Date.parse(`${asOf}T00:00:00.000Z`);
  const b = Date.parse(`${todayKey}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/**
 * The metrics a comparison can be sorted on.
 *
 * Deliberately short. Every entry is something the owner of a ledger chose to
 * publish; nothing here is derived from data they did not put in `stats.json`.
 */
export const METRICS = Object.freeze([
  { id: "totalPoints", label: "Points", short: "pts" },
  { id: "currentStreak", label: "Current streak", short: "days" },
  { id: "longestStreak", label: "Longest streak", short: "days" },
  { id: "totalSolves", label: "Solved", short: "solved" },
  { id: "level", label: "Level", short: "lv" },
]);

const METRIC_IDS = new Set(METRICS.map((m) => m.id));

/**
 * Rank a set of ledgers on one metric.
 *
 * Entries whose stats could not be read keep their place in the list instead of
 * disappearing — a friend whose repository went private is information, and
 * dropping the row silently would read as though they had never been added.
 * They sort last and carry no rank.
 *
 * @param {Array<{id: string, label: string, stats: object|null, self?: boolean}>} entries
 * @param {string} metric one of `METRICS`
 * @returns {Array<object>} rows in display order
 */
export function compareRows(entries, metric = "totalPoints") {
  const key = METRIC_IDS.has(metric) ? metric : "totalPoints";
  const list = (Array.isArray(entries) ? entries : []).filter(Boolean);

  const ranked = list
    .filter((e) => e.stats)
    .sort((a, b) => {
      const d = (b.stats[key] || 0) - (a.stats[key] || 0);
      if (d) return d;
      // A stable, meaningful tiebreak: same points, more problems solved goes
      // first. Falling back to insertion order would make the list reshuffle
      // depending on who happened to be added first.
      const s = (b.stats.totalSolves || 0) - (a.stats.totalSolves || 0);
      return s || String(a.label).localeCompare(String(b.label));
    });

  const leader = ranked.length ? ranked[0].stats[key] || 0 : 0;

  const rows = ranked.map((e, i) => ({
    ...e,
    rank: i + 1,
    value: e.stats[key] || 0,
    behindLeader: leader - (e.stats[key] || 0),
    // A share of the leader, for the bar. The leader sitting at zero means
    // nobody has anything yet, and drawing full bars for everyone would be a
    // lie told with a rectangle.
    share: leader > 0 ? (e.stats[key] || 0) / leader : 0,
  }));

  return rows.concat(
    list.filter((e) => !e.stats).map((e) => ({ ...e, rank: null, value: null, share: 0 })),
  );
}

/**
 * Parse the `?repos=` parameter of a shared comparison link.
 *
 * The link carries no state of its own: it is the list, and anyone opening it
 * sees exactly what the sender saw. Unparseable entries are dropped rather than
 * failing the whole link, because one typo in a list of six should still show
 * the other five.
 *
 * @param {string} value
 * @returns {Array<{owner: string, repo: string, branch: string, id: string}>}
 */
export function parseCompareParam(value) {
  const out = [];
  const seen = new Set();
  for (const part of String(value ?? "").split(/[,\s]+/)) {
    if (!part) continue;
    const ref = parseFriendRef(part);
    if (!ref || seen.has(ref.id)) continue;
    seen.add(ref.id);
    out.push(ref);
    if (out.length >= PARTY_LIMIT) break;
  }
  return out;
}

/** The shareable link for a set of references. */
export function buildCompareUrl(refs, base = "https://codeledger.vkrishna04.me/compare") {
  const list = (Array.isArray(refs) ? refs : [])
    .slice(0, PARTY_LIMIT)
    .map((r) => (r.branch ? `${r.owner}/${r.repo}@${r.branch}` : `${r.owner}/${r.repo}`));
  if (!list.length) return base;
  return `${base}?repos=${encodeURIComponent(list.join(","))}`;
}

/**
 * Add a reference to a stored friend list, or return the list unchanged.
 *
 * Returns a new array rather than mutating, so the caller can hand it straight
 * to `Storage.updateSettings` in its function form and let the lock decide
 * which of two concurrent adds lands second.
 *
 * @returns {{friends: Array<object>, added: boolean, reason: string}}
 */
export function addFriend(friends, input, label = "") {
  const list = normalizeFriends(friends);
  const ref = parseFriendRef(input);
  if (!ref) return { friends: list, added: false, reason: "unreadable" };
  if (list.some((f) => f.id === ref.id))
    return { friends: list, added: false, reason: "duplicate" };
  if (list.length >= PARTY_LIMIT) return { friends: list, added: false, reason: "full" };

  return {
    friends: list.concat({
      owner: ref.owner,
      repo: ref.repo,
      branch: ref.branch,
      label: String(label || "")
        .trim()
        .slice(0, 60),
      id: ref.id,
    }),
    added: true,
    reason: "",
  };
}

/** Drop a reference by id. */
export function removeFriend(friends, id) {
  return normalizeFriends(friends).filter((f) => f.id !== id);
}

/**
 * Clean a stored list on the way in.
 *
 * The list rides settings sync, so it arrives from another device — and from a
 * JSON file in a repository that the user can edit by hand. Re-validating every
 * entry here means a mangled sync.json costs one dropped friend rather than a
 * broken page.
 */
export function normalizeFriends(friends) {
  const out = [];
  const seen = new Set();
  for (const f of Array.isArray(friends) ? friends : []) {
    // An entry has to be an object with the two fields that identify it.
    // Reading `.owner` off a string yields undefined, and `undefined/undefined`
    // happens to satisfy the owner and repo patterns — so the shape is checked
    // before the value is built, not after.
    if (!f || typeof f !== "object") continue;
    if (typeof f.owner !== "string" || typeof f.repo !== "string") continue;
    const ref = parseFriendRef(
      f.branch ? `${f.owner}/${f.repo}@${f.branch}` : `${f.owner}/${f.repo}`,
    );
    if (!ref || seen.has(ref.id)) continue;
    seen.add(ref.id);
    out.push({
      owner: ref.owner,
      repo: ref.repo,
      branch: ref.branch,
      label: String(f.label || "")
        .trim()
        .slice(0, 60),
      id: ref.id,
    });
    if (out.length >= PARTY_LIMIT) break;
  }
  return out;
}

/**
 * Reduce a friend's `index.json` to the shape the expanded card shows.
 *
 * This is the deep read, and it only runs for the one friend somebody opened —
 * an index can be megabytes, and pulling every friend's would turn opening a
 * tab into a download. The result is counts and names only: no code, and no
 * per-problem detail beyond what a title already gives away.
 *
 * @param {any} index parsed `index.json`
 * @param {{limit?: number, topics?: number}} [opts]
 */
export function summarizeIndex(index, opts = {}) {
  const problems = Array.isArray(index?.problems) ? index.problems : [];
  const limit = Number.isFinite(opts.limit) ? opts.limit : 50000;
  const topicLimit = Number.isFinite(opts.topics) ? opts.topics : 12;

  const byPlatform = {};
  const byDifficulty = {};
  const byLanguage = {};
  const topics = new Map();
  const days = new Map();
  let counted = 0;
  let lastSolveDay = "";

  for (const p of problems.slice(0, limit)) {
    if (!p || typeof p !== "object") continue;
    counted += 1;

    const platform = str(p.platform || "unknown", 32).toLowerCase();
    byPlatform[platform] = (byPlatform[platform] || 0) + 1;

    const difficulty = ["Easy", "Medium", "Hard"].includes(p.difficulty) ? p.difficulty : "Unknown";
    byDifficulty[difficulty] = (byDifficulty[difficulty] || 0) + 1;

    const lang = str(p.lang?.name || p.lang?.slug || "", 32).toLowerCase();
    if (lang) byLanguage[lang] = (byLanguage[lang] || 0) + 1;

    for (const t of Array.isArray(p.tags) ? p.tags.slice(0, 20) : []) {
      const name = str(t, 48).trim().toLowerCase();
      if (name) topics.set(name, (topics.get(name) || 0) + 1);
    }

    const ts = Number(p.timestamp);
    if (Number.isFinite(ts) && ts > 0) {
      // UTC, not the viewer's zone: this is somebody else's ledger and their
      // day boundary is not ours. Naming it as UTC in the UI is more honest
      // than quietly shifting their history by a few hours.
      const day = new Date(ts).toISOString().slice(0, 10);
      days.set(day, (days.get(day) || 0) + 1);
      if (day > lastSolveDay) lastSolveDay = day;
    }
  }

  return {
    counted,
    truncated: problems.length > limit,
    byPlatform,
    byDifficulty,
    byLanguage,
    topics: [...topics.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, topicLimit)
      .map(([name, count]) => ({ name, count })),
    days: [...days.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([day, count]) => ({ day, count })),
    lastSolveDay,
  };
}

/**
 * Topics the other ledger covers and yours does not, and the reverse.
 *
 * The point of comparing is finding a gap, not finding out who is ahead. Two
 * people can have identical point totals and completely different holes.
 *
 * @param {Array<{name: string}>} mine
 * @param {Array<{name: string}>} theirs
 */
export function topicGap(mine, theirs) {
  const a = new Set(
    (Array.isArray(mine) ? mine : []).map((t) => String(t?.name || t).toLowerCase()),
  );
  const b = new Set(
    (Array.isArray(theirs) ? theirs : []).map((t) => String(t?.name || t).toLowerCase()),
  );
  return {
    onlyTheirs: [...b].filter((t) => t && !a.has(t)).sort(),
    onlyMine: [...a].filter((t) => t && !b.has(t)).sort(),
    shared: [...a].filter((t) => t && b.has(t)).sort(),
  };
}

/**
 * Who leads each metric, for the crowns.
 *
 * The tiebreak matches `compareRows` — same value, more solves, then name — so
 * the crown always sits on the row the leaderboard would rank first. A metric
 * nobody has scored on gets no leader: crowning somebody for zero points is the
 * kind of gamification that teaches people the crowns mean nothing.
 *
 * @param {Array<{id: string, label: string, stats: object|null}>} entries
 * @returns {Object<string, {id: string, label: string, value: number}>}
 */
export function metricLeaders(entries) {
  const list = (Array.isArray(entries) ? entries : []).filter((e) => e && e.stats);
  const out = {};
  for (const m of METRICS) {
    let best = null;
    for (const e of list) {
      const value = e.stats[m.id] || 0;
      if (value <= 0) continue;
      if (
        !best ||
        value > best.value ||
        (value === best.value && (e.stats.totalSolves || 0) > best.solves) ||
        (value === best.value &&
          (e.stats.totalSolves || 0) === best.solves &&
          String(e.label).localeCompare(String(best.label)) < 0)
      ) {
        best = { id: e.id, label: e.label, value, solves: e.stats.totalSolves || 0 };
      }
    }
    if (best) out[m.id] = { id: best.id, label: best.label, value: best.value };
  }
  return out;
}

/**
 * Your numbers against one other ledger's, metric by metric.
 *
 * Nothing here that `compareRows` does not already know — but a leaderboard
 * answers "who is ahead overall" and a duel answers "where exactly", which is
 * the question that tells somebody what to do about it.
 *
 * @param {object|null} mine parsed stats
 * @param {object|null} theirs parsed stats
 * @returns {Array<{id: string, label: string, short: string, mine: number, theirs: number, diff: number}>}
 */
export function headToHead(mine, theirs) {
  if (!mine || !theirs) return [];
  return METRICS.map((m) => {
    const a = mine[m.id] || 0;
    const b = theirs[m.id] || 0;
    return { id: m.id, label: m.label, short: m.short, mine: a, theirs: b, diff: a - b };
  });
}

/**
 * How many days of hitting your own daily target closes a points gap.
 *
 * Deliberately framed on the *your effort* side — it uses your target, not a
 * guess at their pace, because their pace is not something a stats file states
 * and inventing it would put a made-up number in the most motivating spot on
 * the page. Returns 0 when there is no gap and null when there is no target to
 * divide by.
 *
 * @param {number} gap points behind (positive)
 * @param {number} dailyTarget the user's own daily target
 * @returns {number|null}
 */
export function catchUpDays(gap, dailyTarget) {
  const g = Number(gap);
  if (!Number.isFinite(g) || g <= 0) return 0;
  const t = Number(dailyTarget);
  if (!Number.isFinite(t) || t <= 0) return null;
  return Math.ceil(g / t);
}

/**
 * Achievements split into shared, only-theirs and only-yours.
 *
 * Ids as published in `stats.json` — opaque strings, compared exactly. Unknown
 * ids survive: a file written by a newer version than the one reading it names
 * achievements this build has never heard of, and dropping them would make the
 * newer ledger look poorer for being newer.
 *
 * @param {Array<string>} mine earned achievement ids
 * @param {Array<string>} theirs earned achievement ids
 */
export function achievementGap(mine, theirs) {
  const a = new Set((Array.isArray(mine) ? mine : []).filter((x) => typeof x === "string" && x));
  const b = new Set(
    (Array.isArray(theirs) ? theirs : []).filter((x) => typeof x === "string" && x),
  );
  return {
    shared: [...a].filter((x) => b.has(x)).sort(),
    onlyTheirs: [...b].filter((x) => !a.has(x)).sort(),
    onlyMine: [...a].filter((x) => !b.has(x)).sort(),
  };
}

/**
 * A dense daily series ending on `todayKey`, for the activity strip.
 *
 * `summarizeIndex` reports only the days that had solves; a sparkline drawn
 * from that flatters everybody, because the gaps are the story. Zero-filled
 * here, in UTC like the rest of a foreign ledger's dates.
 *
 * @param {Array<{day: string, count: number}>} days
 * @param {string} todayKey `YYYY-MM-DD`
 * @param {number} [n]
 * @returns {Array<{day: string, count: number}>}
 */
export function lastNDays(days, todayKey, n = 30) {
  if (!DAY_RE.test(String(todayKey || ""))) return [];
  const len = Math.max(1, Math.min(Math.floor(Number(n) || 0) || 30, 366));
  const counts = new Map();
  for (const d of Array.isArray(days) ? days : []) {
    if (d && DAY_RE.test(String(d.day || ""))) counts.set(d.day, num(d.count, 1000));
  }
  const end = Date.parse(`${todayKey}T00:00:00.000Z`);
  const out = [];
  for (let i = len - 1; i >= 0; i--) {
    const day = new Date(end - i * 86400000).toISOString().slice(0, 10);
    out.push({ day, count: counts.get(day) || 0 });
  }
  return out;
}

/**
 * Fetch and parse one ledger's headline numbers.
 *
 * The branch is guessed when the reference did not name one, and the branch
 * that answered comes back with the result so the caller can record it and stop
 * guessing. A 404 is reported as `missing` rather than thrown: a repository
 * that is private, renamed, or simply has not published badges is a normal
 * state for this feature, not an error condition.
 *
 * @param {{owner: string, repo: string, branch: string}} ref
 * @param {{fetchImpl?: Function, signal?: AbortSignal}} [opts]
 */
export async function fetchFriendStats(ref, opts = {}) {
  const doFetch = opts.fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!doFetch) throw new Error("no fetch available");

  const branches = ref.branch ? [ref.branch] : CANDIDATE_BRANCHES;
  let lastStatus = 0;

  for (const branch of branches) {
    let res;
    try {
      res = await doFetch(statsUrl(ref, branch), { signal: opts.signal, cache: "no-cache" });
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      return { ok: false, error: "network", branch: "" };
    }
    if (res.status === 404) {
      lastStatus = 404;
      continue;
    }
    if (!res.ok) return { ok: false, error: "http", status: res.status, branch: "" };

    let json;
    try {
      json = await res.json();
    } catch {
      return { ok: false, error: "malformed", branch };
    }
    const stats = parseStats(json);
    if (!stats) return { ok: false, error: "malformed", branch };
    return { ok: true, stats, branch };
  }

  return { ok: false, error: lastStatus === 404 ? "missing" : "network", branch: "" };
}

/** Why a friend has no numbers, in words somebody can act on. */
export const ERROR_TEXT = Object.freeze({
  missing:
    "No published stats found. The repository may be private, renamed, or badge publishing may be switched off on their side.",
  malformed:
    "Found a stats file but could not read it. It may not have been written by CodeLedger.",
  network: "Could not reach GitHub for this one.",
  http: "GitHub refused the request for this one.",
});
