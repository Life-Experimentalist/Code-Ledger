/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Party — your ledger next to other people's.
 *
 * There is no server behind this and no account system. A friend is a public
 * repository you wrote down; their numbers come from the `badges/stats.json`
 * their own extension commits. Three consequences the UI states rather than
 * implies: it is one-sided (adding somebody does not add you to their list),
 * nobody is notified, and every number is self-reported by the person who owns
 * that repository.
 *
 * The headline row costs one small request per friend. The deeper breakdown
 * pulls that friend's whole `index.json`, so it happens only for the card
 * somebody actually opened.
 */

import {
  h,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";
import { createDebugger } from "../../lib/debug.js";
import { computeSnapshot, configFromSettings, ACHIEVEMENTS } from "../../core/gamification.js";
import { badgeStats } from "../../core/badge-svg.js";
import { isGamificationActive } from "../../core/feature-flags.js";
import {
  PARTY_LIMIT,
  METRICS,
  ERROR_TEXT,
  parseFriendRef,
  friendLabel,
  repoUrl,
  indexUrl,
  parseStats,
  stalenessDays,
  compareRows,
  buildCompareUrl,
  addFriend,
  removeFriend,
  normalizeFriends,
  summarizeIndex,
  topicGap,
  metricLeaders,
  headToHead,
  catchUpDays,
  achievementGap,
  lastNDays,
  fetchFriendStats,
} from "../../core/party.js";

const dbg = createDebugger("PartyView");

const ADD_ERROR = {
  unreadable: "That does not look like a GitHub repository. Try owner/repo, or paste the repo URL.",
  duplicate: "That repository is already on the list.",
  full: `The list holds ${PARTY_LIMIT} repositories.`,
};

const pct = (n) => `${Math.round(Math.max(0, Math.min(1, n || 0)) * 100)}%`;

function Bar({ share, mine }) {
  return html`
    <div class="h-1.5 rounded-full bg-white/5 overflow-hidden">
      <div
        style=${{ width: pct(share) }}
        class="h-full rounded-full ${mine ? "bg-cyan-400/70" : "bg-violet-400/50"}"
      ></div>
    </div>
  `;
}

function Freshness({ asOf, today }) {
  // Their `asOf` is a UTC day, so a UTC day is the honest thing to compare it
  // against when our own snapshot has not been computed yet.
  const days = stalenessDays(asOf, today || new Date().toISOString().slice(0, 10));
  if (days === null) return html`<span class="text-slate-600">date unknown</span>`;
  if (days === 0) return html`<span class="text-emerald-400/80">today</span>`;
  if (days === 1) return html`<span class="text-slate-500">yesterday</span>`;
  // Past a week the number stops being a detail and starts being the point:
  // a badge file is written at commit time, so a stale one usually means the
  // person stopped solving, not that something broke.
  return html`<span class=${days > 7 ? "text-amber-400/80" : "text-slate-500"}
    >${days} days ago</span
  >`;
}

// Achievement ids in a friend's stats.json are the same ids this build earns
// locally, so the local catalogue supplies emoji and names. An id from a newer
// version than this one renders as its raw id rather than being hidden.
const ACH_META = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
const achLabel = (id) => {
  const meta = ACH_META[id];
  return meta ? `${meta.emoji} ${meta.name}` : id;
};

const MEDALS = ["🥇", "🥈", "🥉"];
const METRIC_EMOJI = {
  totalPoints: "🏆",
  currentStreak: "🔥",
  longestStreak: "🏔️",
  totalSolves: "💪",
  level: "⭐",
};

function Podium({ rows }) {
  const top = rows.filter((r) => r.rank).slice(0, 3);
  if (top.length < 2) return "";
  // Classic podium order: second on the left, winner in the middle, third on
  // the right. The heights are the theatre; the numbers are the truth.
  const order = top.length === 3 ? [top[1], top[0], top[2]] : [top[1], top[0]];
  const heights = { 1: "h-24", 2: "h-16", 3: "h-12" };
  return html`
    <div class="flex items-end gap-2 max-w-3xl mx-auto w-full pt-2">
      ${order.map(
        (r) => html`
          <div class="flex-1 flex flex-col items-center gap-1 min-w-0">
            <span class="text-xl leading-none">${MEDALS[r.rank - 1]}</span>
            <p class="text-xs truncate max-w-full ${r.self ? "text-cyan-300" : "text-slate-300"}">
              ${r.label}
            </p>
            <p class="text-[11px] text-slate-500 tabular-nums">${r.value}</p>
            <div
              class="w-full rounded-t-lg border border-b-0 ${r.self
                ? "bg-cyan-500/15 border-cyan-500/25"
                : "bg-white/5 border-white/10"} ${heights[r.rank] || "h-12"}"
            ></div>
          </div>
        `,
      )}
    </div>
  `;
}

function LeadersStrip({ leaders }) {
  const held = METRICS.filter((m) => leaders[m.id]);
  if (held.length < 2) return "";
  return html`
    <div class="flex flex-wrap gap-1.5 justify-center">
      ${held.map(
        (m) => html`
          <span
            title="${m.label}: ${leaders[m.id].value}"
            class="px-2 py-1 rounded-md bg-white/[0.03] border border-white/10 text-[11px] ${leaders[
              m.id
            ].id === "__me"
              ? "text-cyan-300"
              : "text-slate-400"}"
          >
            ${METRIC_EMOJI[m.id] || "🏅"} ${m.label}:${" "}
            <span class="font-medium">${leaders[m.id].label}</span>
          </span>
        `,
      )}
    </div>
  `;
}

function Duel({ mine, theirs, theirLabel }) {
  const duel = headToHead(mine, theirs);
  if (!duel.length) return "";
  const points = duel.find((r) => r.id === "totalPoints");
  const chase = points && points.diff < 0 ? catchUpDays(-points.diff, mine.dailyTargetPoints) : 0;
  const ach = achievementGap(mine.achievements, theirs.achievements);

  return html`
    <div class="mt-3 pt-3 border-t border-white/5 space-y-3">
      <div>
        <p class="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
          You vs ${theirLabel}
        </p>
        <div class="grid gap-1">
          ${duel.map(
            (r) => html`
              <div class="flex items-center gap-2 text-[12px]">
                <span
                  class="w-16 text-right tabular-nums ${r.diff > 0
                    ? "text-emerald-300"
                    : "text-slate-400"}"
                  >${r.mine}</span
                >
                <span class="flex-1 text-center text-slate-500">${r.label}</span>
                <span class="w-16 tabular-nums ${r.diff < 0 ? "text-amber-300" : "text-slate-400"}"
                  >${r.theirs}</span
                >
              </div>
            `,
          )}
        </div>
        ${chase
          ? html`<p class="text-[11px] text-slate-500 mt-1.5">
              ${-points.diff} pts behind — about ${chase} day${chase === 1 ? "" : "s"} of hitting
              your daily target (${mine.dailyTargetPoints} pts) to close it.
            </p>`
          : ""}
      </div>

      ${ach.onlyTheirs.length || ach.onlyMine.length
        ? html`
            <div class="grid sm:grid-cols-2 gap-3">
              <div>
                <p class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                  They have, you don't
                </p>
                <div class="flex flex-wrap gap-1.5">
                  ${ach.onlyTheirs.length
                    ? ach.onlyTheirs.map(
                        (id) => html`
                          <span
                            class="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200"
                            >${achLabel(id)}</span
                          >
                        `,
                      )
                    : html`<span class="text-[11px] text-slate-600">Nothing — clean sweep.</span>`}
                </div>
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                  You have, they don't
                </p>
                <div class="flex flex-wrap gap-1.5">
                  ${ach.onlyMine.length
                    ? ach.onlyMine.map(
                        (id) => html`
                          <span
                            class="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-[11px] text-cyan-200"
                            >${achLabel(id)}</span
                          >
                        `,
                      )
                    : html`<span class="text-[11px] text-slate-600">Nothing yet.</span>`}
                </div>
              </div>
            </div>
          `
        : ""}
      ${ach.shared.length
        ? html`<p class="text-[11px] text-slate-600">
            ${ach.shared.length} achievement${ach.shared.length === 1 ? "" : "s"} you both hold.
          </p>`
        : ""}
    </div>
  `;
}

function ActivityStrip({ days, today }) {
  const series = lastNDays(days, today || new Date().toISOString().slice(0, 10), 30);
  if (!series.length) return "";
  const max = Math.max(1, ...series.map((d) => d.count));
  return html`
    <div>
      <p class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Their last 30 days</p>
      <div class="flex items-end gap-[2px] h-8">
        ${series.map(
          (d) => html`
            <div
              title="${d.day}: ${d.count} solve${d.count === 1 ? "" : "s"}"
              class="flex-1 rounded-sm ${d.count ? "bg-violet-400/60" : "bg-white/5"}"
              style=${{ height: d.count ? `${Math.max(15, (d.count / max) * 100)}%` : "3px" }}
            ></div>
          `,
        )}
      </div>
    </div>
  `;
}

function Detail({ summary, mineTopics, today }) {
  const gap = topicGap(mineTopics, summary.topics);
  const cell = (label, value) => html`
    <div>
      <p class="text-[10px] uppercase tracking-wider text-slate-500">${label}</p>
      <p class="text-sm text-slate-300">${value}</p>
    </div>
  `;

  const counts = (map) =>
    Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(" · ") || "—";

  return html`
    <div class="mt-3 pt-3 border-t border-white/5 space-y-3">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        ${cell("Problems read", summary.counted)} ${cell("Platforms", counts(summary.byPlatform))}
        ${cell("Difficulty", counts(summary.byDifficulty))}
        ${cell("Last solve", summary.lastSolveDay || "—")}
      </div>

      ${summary.truncated
        ? html`<p class="text-[11px] text-amber-400/80">
            Their ledger is larger than this view reads — the counts above cover the first${" "}
            ${summary.counted} entries.
          </p>`
        : ""}

      <${ActivityStrip} days=${summary.days} today=${today} />

      <div>
        <p class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Their top topics</p>
        <div class="flex flex-wrap gap-1.5">
          ${summary.topics.length
            ? summary.topics.map(
                (t) => html`
                  <span
                    class="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] text-slate-400"
                    >${t.name} <span class="text-slate-600">${t.count}</span></span
                  >
                `,
              )
            : html`<span class="text-[11px] text-slate-600">No tags in their ledger.</span>`}
        </div>
      </div>

      ${gap.onlyTheirs.length
        ? html`
            <div>
              <p class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                Topics they cover and you do not
              </p>
              <div class="flex flex-wrap gap-1.5">
                ${gap.onlyTheirs
                  .slice(0, 20)
                  .map(
                    (t) => html`
                      <span
                        class="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200"
                        >${t}</span
                      >
                    `,
                  )}
              </div>
              <p class="text-[11px] text-slate-500 mt-1.5">
                This is the useful half of comparing. Points say who solved more; this says where
                your ledger has a hole.
              </p>
            </div>
          `
        : ""}

      <p class="text-[11px] text-slate-600">
        Read from their <code class="text-slate-500">index.json</code>. Dates are UTC — their day
        boundary is not necessarily yours.
      </p>
    </div>
  `;
}

export function PartyView({ problems, settings, onSettingsChange }) {
  const s = settings || {};
  const friends = useMemo(() => normalizeFriends(s.partyFriends), [s.partyFriends]);

  const [input, setInput] = useState("");
  const [nick, setNick] = useState("");
  const [addError, setAddError] = useState("");
  const [metric, setMetric] = useState("totalPoints");
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState("");
  const [details, setDetails] = useState({});
  const [mine, setMine] = useState(null);
  const [copied, setCopied] = useState(false);

  const abortRef = useRef(null);

  const myRepo = s.github_repo || s.gitRepo;
  const myOwner = s.github_owner || s.github_username;
  const myRef = myOwner && myRepo ? parseFriendRef(`${myOwner}/${myRepo}`) : null;

  // My own numbers come from the same function that writes badges/stats.json,
  // so the row labelled "you" is computed exactly the way a friend's row was
  // computed on their machine. Anything else would make the comparison a
  // comparison of two different definitions.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const state = await Storage.getGamificationState().catch(() => ({ vacations: [] }));
        const snap = computeSnapshot(problems || [], {
          config: configFromSettings(s),
          vacations: state?.vacations || [],
          streakFloorDay: s.installDay || undefined,
        });
        if (!live) return;
        setMine({ stats: parseStats(badgeStats(snap)), today: snap.today, snapshot: snap });
      } catch (e) {
        dbg.warn("own snapshot failed:", e?.message || e);
      }
    })();
    return () => {
      live = false;
    };
  }, [problems, s.dailyTargetPoints, s.installDay]);

  const myTopics = useMemo(() => {
    const counts = new Map();
    for (const p of problems || []) {
      for (const t of p?.tags || []) {
        const name = String(t || "")
          .trim()
          .toLowerCase();
        if (name) counts.set(name, (counts.get(name) || 0) + 1);
      }
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [problems]);

  const refresh = useCallback(async () => {
    if (!friends.length) {
      setResults({});
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const settled = await Promise.all(
        friends.map(async (f) => {
          try {
            return [f.id, await fetchFriendStats(f, { signal: controller.signal })];
          } catch (e) {
            if (e?.name === "AbortError") return null;
            return [f.id, { ok: false, error: "network" }];
          }
        }),
      );
      if (controller.signal.aborted) return;
      setResults(Object.fromEntries(settled.filter(Boolean)));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [friends]);

  useEffect(() => {
    refresh();
    return () => abortRef.current?.abort();
  }, [refresh]);

  const persist = async (next) => {
    // Written through the settings path so the list rides repo sync to the
    // user's other devices, and so a concurrent write from another tab merges
    // instead of overwriting.
    await onSettingsChange("partyFriends", next);
  };

  const onAdd = async (e) => {
    e?.preventDefault?.();
    const result = addFriend(friends, input, nick);
    if (!result.added) {
      setAddError(ADD_ERROR[result.reason] || "Could not add that one.");
      return;
    }
    setAddError("");
    setInput("");
    setNick("");
    await persist(result.friends);
  };

  const onRemove = async (id) => {
    await persist(removeFriend(friends, id));
    setResults((r) => {
      const next = { ...r };
      delete next[id];
      return next;
    });
  };

  const onExpand = async (friend) => {
    if (expanded === friend.id) {
      setExpanded("");
      return;
    }
    setExpanded(friend.id);
    if (details[friend.id]) return;

    setDetails((d) => ({ ...d, [friend.id]: { loading: true } }));
    const branch = results[friend.id]?.branch || friend.branch || "main";
    try {
      const res = await fetch(indexUrl(friend, branch), { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setDetails((d) => ({ ...d, [friend.id]: { summary: summarizeIndex(json) } }));
    } catch (err) {
      dbg.warn("index fetch failed:", err?.message || err);
      setDetails((d) => ({
        ...d,
        [friend.id]: {
          error: "Could not read their full ledger. The repository may not have one.",
        },
      }));
    }
  };

  const entries = useMemo(() => {
    const list = friends.map((f) => ({
      id: f.id,
      label: friendLabel(f),
      friend: f,
      stats: results[f.id]?.ok ? results[f.id].stats : null,
      error: results[f.id]?.ok ? "" : results[f.id]?.error || "",
    }));
    if (mine?.stats) {
      list.unshift({ id: "__me", label: "You", stats: mine.stats, self: true });
    }
    return list;
  }, [friends, results, mine]);

  const rows = useMemo(() => compareRows(entries, metric), [entries, metric]);
  const leaders = useMemo(() => metricLeaders(entries), [entries]);
  const myValue = mine?.stats ? mine.stats[metric] || 0 : null;

  const shareUrl = useMemo(
    () => buildCompareUrl(myRef ? [myRef, ...friends] : friends),
    [friends, myRef],
  );

  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission can be refused; the input below still holds the
      // URL so the user can select it by hand rather than being told nothing.
      setCopied(false);
    }
  };

  if (!isGamificationActive(s)) {
    return html`
      <div class="p-8 max-w-2xl">
        <h2 class="text-lg font-semibold text-slate-200">Party</h2>
        <p class="text-sm text-slate-400 mt-2">
          Comparing ledgers uses streaks, points and levels, and those are switched off. Turn
          streaks back on under Settings → Streaks to use this.
        </p>
      </div>
    `;
  }

  return html`
    <div class="p-6 space-y-5 overflow-y-auto">
      <header>
        <h2 class="text-lg font-semibold text-slate-200">Party</h2>
        <p class="text-sm text-slate-400 mt-1">
          Put your ledger next to other people's by writing down their repository. Numbers come from
          the <code class="text-slate-500">badges/stats.json</code> their extension commits — there
          is no server in the middle.
        </p>
      </header>

      <div class="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p class="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold mb-2">
          What this does and does not do
        </p>
        <ul class="text-[12px] text-slate-400 leading-relaxed grid gap-x-8 gap-y-1 lg:grid-cols-3">
          <li>
            <span class="text-slate-300">It is one-sided.</span> Adding somebody does not add you to
            their list, and they can add you without you knowing either.
          </li>
          <li>
            <span class="text-slate-300">Nobody is notified.</span> Reading a public file leaves no
            trace they can see. If you would rather not be readable, make your ledger repository
            private — badge publishing then stops working for you too, which is the trade.
          </li>
          <li>
            <span class="text-slate-300">The numbers are self-reported.</span> Anyone can hand-edit
            the file in their own repository. Treat this as a nudge, not a scoreboard.
          </li>
        </ul>
      </div>

      <form onSubmit=${onAdd} class="flex flex-wrap gap-2 items-start">
        <input
          value=${input}
          onInput=${(e) => {
            setInput(e.target.value);
            setAddError("");
          }}
          placeholder="owner/repo or a github.com link"
          class="flex-1 min-w-[240px] px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/40"
        />
        <input
          value=${nick}
          onInput=${(e) => setNick(e.target.value)}
          placeholder="Name (optional)"
          class="w-40 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/40"
        />
        <button
          type="submit"
          disabled=${!input.trim()}
          class="px-4 py-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-sm text-cyan-200 hover:bg-cyan-500/25 transition-colors disabled:opacity-40"
        >
          Add
        </button>
        <button
          type="button"
          onClick=${refresh}
          disabled=${loading || !friends.length}
          class="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40"
        >
          ${loading ? "Refreshing…" : "Refresh"}
        </button>
      </form>
      ${addError ? html`<p class="text-[12px] text-rose-300">${addError}</p>` : ""}

      <div class="flex flex-wrap gap-1.5">
        ${METRICS.map(
          (m) => html`
            <button
              onClick=${() => setMetric(m.id)}
              class="px-3 py-1.5 rounded-lg text-xs border transition-colors ${metric === m.id
                ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-200"
                : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200"}"
            >
              ${m.label}
            </button>
          `,
        )}
      </div>

      ${!friends.length
        ? html`
            <p class="text-sm text-slate-500">
              Nobody added yet. Anyone using CodeLedger with a public ledger repository will work —
              paste the repository they publish their badges from.
            </p>
          `
        : ""}

      <${Podium} rows=${rows} />
      <${LeadersStrip} leaders=${leaders} />

      <div class="space-y-2">
        ${rows.map((row) => {
          const detail = row.friend ? details[row.friend.id] : null;
          const open = row.friend && expanded === row.friend.id;
          return html`
            <div
              class="rounded-xl border p-3 ${row.self
                ? "border-cyan-500/25 bg-cyan-500/[0.04]"
                : "border-white/10 bg-white/[0.02]"}"
            >
              <div class="flex items-center gap-3">
                <span class="w-6 text-center text-xs text-slate-500"
                  >${row.rank ? (row.rank <= 3 ? MEDALS[row.rank - 1] : `#${row.rank}`) : "—"}</span
                >
                <div class="flex-1 min-w-0">
                  <div class="flex items-baseline gap-2">
                    <p class="text-sm text-slate-200 truncate">${row.label}</p>
                    ${row.friend
                      ? html`<a
                          href=${repoUrl(row.friend)}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-[11px] text-slate-600 hover:text-slate-400 shrink-0"
                          >${row.friend.owner}/${row.friend.repo}</a
                        >`
                      : ""}
                    ${!row.self && row.value !== null && myValue !== null
                      ? html`<span
                          class="text-[10px] shrink-0 px-1.5 py-0.5 rounded ${row.value > myValue
                            ? "bg-amber-500/10 text-amber-300/90"
                            : row.value < myValue
                              ? "bg-emerald-500/10 text-emerald-300/90"
                              : "bg-white/5 text-slate-500"}"
                          >${row.value > myValue
                            ? `+${row.value - myValue} vs you`
                            : row.value < myValue
                              ? `−${myValue - row.value} vs you`
                              : "tied with you"}</span
                        >`
                      : ""}
                  </div>
                  ${row.stats
                    ? html`
                        <div class="mt-1.5"><${Bar} share=${row.share} mine=${row.self} /></div>
                        <p class="text-[11px] text-slate-500 mt-1">
                          ${row.stats.currentStreak}d streak · ${row.stats.totalPoints} pts ·${" "}
                          ${row.stats.totalSolves} solved · Lv ${row.stats.level}
                          ${row.stats.levelName ? ` ${row.stats.levelName}` : ""} ·
                          <${Freshness} asOf=${row.stats.asOf} today=${mine?.today} />
                        </p>
                      `
                    : html`<p class="text-[11px] text-amber-400/80 mt-1">
                        ${ERROR_TEXT[row.error] || (loading ? "Reading…" : ERROR_TEXT.network)}
                      </p>`}
                </div>
                <div class="text-right shrink-0">
                  <p class="text-lg font-semibold text-slate-200 tabular-nums">
                    ${row.value === null ? "—" : row.value}
                  </p>
                  <p class="text-[10px] text-slate-600">
                    ${METRICS.find((m) => m.id === metric)?.short}
                  </p>
                </div>
                ${row.friend
                  ? html`
                      <div class="flex flex-col gap-1 shrink-0">
                        <button
                          onClick=${() => onExpand(row.friend)}
                          class="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                        >
                          ${open ? "Close" : "Details"}
                        </button>
                        <button
                          onClick=${() => onRemove(row.friend.id)}
                          class="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[11px] text-slate-500 hover:text-rose-300 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    `
                  : ""}
              </div>

              ${open && mine?.stats && row.stats
                ? html`<${Duel} mine=${mine.stats} theirs=${row.stats} theirLabel=${row.label} />`
                : ""}
              ${open && detail?.loading
                ? html`<p class="mt-3 pt-3 border-t border-white/5 text-[11px] text-slate-500">
                    Reading their ledger…
                  </p>`
                : ""}
              ${open && detail?.error
                ? html`<p class="mt-3 pt-3 border-t border-white/5 text-[11px] text-amber-400/80">
                    ${detail.error}
                  </p>`
                : ""}
              ${open && detail?.summary
                ? html`<${Detail}
                    summary=${detail.summary}
                    mineTopics=${myTopics}
                    today=${mine?.today}
                  />`
                : ""}
            </div>
          `;
        })}
      </div>

      ${friends.length
        ? html`
            <div class="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
              <p class="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">
                Share this comparison
              </p>
              <p class="text-[12px] text-slate-400">
                The link carries the repository list and nothing else — no account, no extension
                needed to open it. Anyone you send it to sees the same public files you do.
                ${myRef
                  ? ""
                  : " Your own repository is not in it yet, because no ledger repository is linked."}
              </p>
              <div class="flex gap-2">
                <input
                  readonly
                  value=${shareUrl}
                  onClick=${(e) => e.target.select()}
                  class="flex-1 px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-[11px] text-slate-400 font-mono"
                />
                <button
                  onClick=${onShare}
                  class="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-300 hover:bg-white/10 transition-colors"
                >
                  ${copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          `
        : ""}
    </div>
  `;
}
