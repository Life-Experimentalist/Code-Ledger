/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Gamification core: points, streaks, freezes, penalties, vacations, levels
 * and achievements.
 *
 * Everything in this file is a pure function of (solve history + config +
 * user-declared vacations + "now"). Nothing is a running counter.
 *
 * That is a deliberate design choice. A stored `streak: 14` drifts the moment a
 * device is offline, a sync arrives out of order, or the extension is
 * reinstalled — and a streak that lies is worse than no streak at all. Deriving
 * from the ledger means the number is always reproducible, survives a
 * reinstall, and agrees across devices without any reconciliation protocol.
 *
 * The only persisted state is what cannot be derived: the vacation ranges the
 * user declared, and which achievement toasts have already been shown.
 */

/**
 * Points per canonical difficulty. Fixed, not user-editable: the whole point of
 * a standard is that a Hard is worth the same to everyone, so leaderboards and
 * side-by-side comparisons on the landing page mean something.
 *
 * The ratio (1 : 2.5 : 5) is roughly the median time ratio across LeetCode's
 * own accepted-submission data, so an hour of work is worth about the same
 * number of points regardless of which difficulty you spend it on.
 */
export const POINTS = Object.freeze({
  Easy: 10,
  Medium: 25,
  Hard: 50,
  Unknown: 10,
});

/**
 * A recall — re-solving a problem already in the ledger — is worth a fraction
 * of the first solve. Spaced repetition is the highest-value activity in DSA
 * practice and scoring it at zero actively discourages it, but scoring it at
 * full value makes farming one easy problem the optimal strategy.
 */
export const RECALL_MULTIPLIER = 0.4;

/** A recall earns points again only after this long. Blocks same-day farming. */
export const RECALL_COOLDOWN_DAYS = 3;

export const DEFAULT_CONFIG = Object.freeze({
  /** Master switch. When false every gamification surface is hidden. */
  enabled: true,
  /** Points needed to close a day. 25 = one Medium, or two Easies plus change. */
  dailyTargetPoints: 25,
  /** Reaching this multiple of the target in one day earns a streak freeze. */
  freezeEarnMultiplier: 2,
  /** Freezes you can bank. Uncapped banking removes all pressure. */
  maxFreezes: 5,
  /** Points needed the next day to buy back a missed day, as a multiple. */
  penaltyMultiplier: 1.5,
  /** Days after a vacation that run at a reduced target while you warm up. */
  iceBreakerDays: 3,
  /** Target multiplier during the ice-breaker ramp. */
  iceBreakerMultiplier: 0.5,
  /** Minutes to add to UTC to get the user's local day boundary. */
  utcOffsetMinutes: -new Date().getTimezoneOffset(),
});

/** The tunable keys, stored flat in settings alongside everything else. */
export const CONFIG_KEYS = Object.freeze(
  Object.keys(DEFAULT_CONFIG).filter((k) => k !== "enabled"),
);

/**
 * Pull the scoring config out of a settings object.
 *
 * Settings are a flat bag written by a schema-driven UI, so a value that was
 * cleared can come back as "" or NaN. Anything that is not a finite number is
 * left out entirely so the default applies rather than the scoring maths
 * silently producing NaN points.
 *
 * @param {Record<string, any>} [settings]
 * @returns {Record<string, number>}
 */
export function configFromSettings(settings) {
  const out = {};
  if (!settings || typeof settings !== "object") return out;
  for (const key of CONFIG_KEYS) {
    const value = settings[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

/**
 * Level thresholds in cumulative points. Gaps widen so early levels arrive fast
 * (the first week is when people quit) and later ones stay meaningful.
 */
export const LEVELS = Object.freeze([
  { level: 1, name: "Initiate", at: 0 },
  { level: 2, name: "Apprentice", at: 100 },
  { level: 3, name: "Practitioner", at: 300 },
  { level: 4, name: "Analyst", at: 700 },
  { level: 5, name: "Engineer", at: 1500 },
  { level: 6, name: "Architect", at: 3000 },
  { level: 7, name: "Strategist", at: 6000 },
  { level: 8, name: "Veteran", at: 10000 },
  { level: 9, name: "Master", at: 18000 },
  { level: 10, name: "Grandmaster", at: 30000 },
]);

const MS_PER_DAY = 86_400_000;

/* ------------------------------------------------------------------ */
/* Day arithmetic                                                      */
/* ------------------------------------------------------------------ */

/**
 * The calendar day a timestamp falls in, as `YYYY-MM-DD`, shifted into the
 * user's timezone. Streaks are a human concept anchored to local midnight, so
 * every day boundary in this file goes through here.
 *
 * @param {number|string|Date} ts
 * @param {number} [utcOffsetMinutes]
 * @returns {string}
 */
export function dayKey(ts, utcOffsetMinutes = DEFAULT_CONFIG.utcOffsetMinutes) {
  const ms = ts instanceof Date ? ts.getTime() : typeof ts === "string" ? Date.parse(ts) : ts;
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` → the UTC-midnight epoch ms of that key. Inverse of dayKey. */
function keyToMs(key) {
  return Date.parse(`${key}T00:00:00.000Z`);
}

/** Shift a day key by whole days. `addDays("2026-01-31", 1) === "2026-02-01"`. */
export function addDays(key, n) {
  return new Date(keyToMs(key) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Whole days between two day keys, `b - a`. */
export function daysBetween(a, b) {
  return Math.round((keyToMs(b) - keyToMs(a)) / MS_PER_DAY);
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

/**
 * Points a single solve is worth.
 *
 * @param {string} difficulty canonical Easy/Medium/Hard; anything else scores as Easy
 * @param {{ recall?: boolean }} [opts]
 * @returns {number}
 */
export function pointsFor(difficulty, opts = {}) {
  const base = POINTS[difficulty] ?? POINTS.Unknown;
  return opts.recall ? Math.round(base * RECALL_MULTIPLIER) : base;
}

/**
 * Every scoring event in the history, in chronological order.
 *
 * A problem's first solve scores full. Each later solve of the same problem is
 * a recall and scores the reduced rate, but only once the cooldown has passed —
 * otherwise resubmitting the same accepted solution five times in an afternoon
 * would close the day.
 *
 * @param {Array<object>} problems ledger records
 * @param {object} [config]
 * @returns {Array<{ day: string, points: number, difficulty: string, recall: boolean, id: string, title: string }>}
 */
/** A timestamp that names a real moment — not null, not 0, not a string of one. */
function usableStamp(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

export function scoreEvents(problems, config = DEFAULT_CONFIG) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const events = [];

  for (const p of problems || []) {
    if (!p) continue;
    const id = p.canonicalId || `${p.platform || "?"}:${p.titleSlug || p.title || "?"}`;
    const difficulty = p.difficulty || "Unknown";
    const title = p.title || p.titleSlug || id;

    // A record carries its first solve on `timestamp`, and any re-solves in
    // `solveHistory` (written by the recall flow). Older records have neither
    // shape, so fall back to whatever timestamp exists.
    // `> 0`, not just finite: `Number(null)` is 0, and a zero timestamp would
    // score the solve on 1970-01-01 — a real day, on the calendar, in the
    // heatmap range, and eligible to be "best day". No solve happened then.
    const stamps = [];
    if (usableStamp(p.timestamp)) stamps.push(Number(p.timestamp));
    for (const h of p.solveHistory || []) {
      const t = h?.timestamp ?? h;
      if (usableStamp(t)) stamps.push(Number(t));
    }
    if (!stamps.length) {
      // A solve whose date the platform never published — GeeksForGeeks lists
      // what you solved but not when. It is still a solve and still worth its
      // points; it just does not belong to any calendar day. `day: null` keeps
      // it out of the streak, the daily buckets and the heatmap, all of which
      // key on the day, while the point total still counts it.
      if (p._solveDateUnknown) {
        events.push({
          day: null,
          points: pointsFor(difficulty, { recall: false }),
          difficulty,
          recall: false,
          dateUnknown: true,
          id,
          title,
        });
      }
      continue;
    }
    stamps.sort((a, b) => a - b);

    let lastScored = -Infinity;
    stamps.forEach((ts, i) => {
      const recall = i > 0;
      if (recall && ts - lastScored < RECALL_COOLDOWN_DAYS * MS_PER_DAY) return;
      lastScored = ts;
      events.push({
        day: dayKey(ts, cfg.utcOffsetMinutes),
        points: pointsFor(difficulty, { recall }),
        difficulty,
        recall,
        id,
        title,
      });
    });
  }

  // Undated events sort to the front: they are the back catalogue, and they
  // precede anything with a known date rather than landing on "today".
  events.sort((a, b) => {
    const x = a.day || "";
    const y = b.day || "";
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return events;
}

/**
 * Collapse scoring events into one bucket per calendar day.
 *
 * @param {Array<object>} problems
 * @param {object} [config]
 * @returns {Map<string, { points: number, solves: number, recalls: number, byDifficulty: Record<string, number> }>}
 */
export function buildDailyPoints(problems, config = DEFAULT_CONFIG) {
  const days = new Map();
  for (const e of scoreEvents(problems, config)) {
    if (!e.day) continue; // undated solve — counts for points, belongs to no day
    let d = days.get(e.day);
    if (!d) {
      d = { points: 0, solves: 0, recalls: 0, byDifficulty: {} };
      days.set(e.day, d);
    }
    d.points += e.points;
    if (e.recall) d.recalls += 1;
    else d.solves += 1;
    d.byDifficulty[e.difficulty] = (d.byDifficulty[e.difficulty] || 0) + 1;
  }
  return days;
}

/* ------------------------------------------------------------------ */
/* Vacations                                                           */
/* ------------------------------------------------------------------ */

/**
 * Whether a day key falls inside a declared vacation. Ranges are inclusive at
 * both ends; an open `end` means the vacation is still running.
 *
 * @param {string} key
 * @param {Array<{ start: string, end?: string|null }>} vacations
 * @returns {boolean}
 */
export function isVacationDay(key, vacations) {
  for (const v of vacations || []) {
    if (!v?.start) continue;
    if (key < v.start) continue;
    if (v.end && key > v.end) continue;
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Streak                                                              */
/* ------------------------------------------------------------------ */

/**
 * Walk the history day by day and work out where the streak stands.
 *
 * The rules, in the order they are applied to each day:
 *
 *   1. A vacation day is neutral. It neither extends nor breaks the streak.
 *   2. A day that reaches the target extends the streak. Reaching
 *      `freezeEarnMultiplier` × target also banks a freeze (one per day, capped
 *      at `maxFreezes`).
 *   3. A day that misses the target is bought back if the *next* day reaches
 *      `ceil(penaltyMultiplier × target)`. That is the penalty path: you skipped
 *      Tuesday, so Wednesday costs one and a half days.
 *   4. Otherwise a banked freeze is spent and the streak survives.
 *   5. With no freeze and no penalty paid, the streak resets to zero.
 *
 * Order matters: penalty is checked before freezes so that a user who did the
 * work is never silently charged a freeze for it.
 *
 * @param {Map<string, {points:number}>} days
 * @param {object} config
 * @param {Array<{start:string,end?:string|null}>} vacations
 * @param {string} todayKey
 * @param {string} [floorDay] no streak accounting before this day — see below
 * @returns {{ current: number, longest: number, freezes: number, freezesSpent: number,
 *   frozenDays: string[], penaltyDays: string[], brokenAt: string|null, timeline: Array<object> }}
 */
export function computeStreak(days, config, vacations, todayKey, floorDay) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const target = Math.max(1, Math.round(cfg.dailyTargetPoints));
  // Both multipliers are clamped to 1, not just hinted at in the UI. A freeze
  // multiplier below 1 would hand out a freeze on every completed day, and a
  // penalty multiplier below 1 makes a missed day cheaper than the day itself
  // — with 0, every miss auto-restores and the streak can never break.
  const freezeAt = target * Math.max(1, cfg.freezeEarnMultiplier);
  const penaltyCost = Math.ceil(Math.max(1, cfg.penaltyMultiplier) * target);

  const keys = [...days.keys()].sort();
  if (!keys.length) {
    return {
      current: 0,
      longest: 0,
      freezes: 0,
      freezesSpent: 0,
      frozenDays: [],
      penaltyDays: [],
      brokenAt: null,
      timeline: [],
    };
  }

  // Streak accounting starts at the later of the first solve and the floor.
  //
  // The floor is the install day. Importing years of LeetCode history should
  // credit every point and every topic, but it must not manufacture a 400-day
  // streak the user never lived through, and it must not open with a wall of
  // missed days from the gaps in that history. Points are lifetime; streaks
  // start when the extension does.
  const first = floorDay && floorDay > keys[0] ? floorDay : keys[0];
  const last = todayKey > first ? todayKey : first;

  let current = 0;
  let longest = 0;
  let freezes = 0;
  let freezesSpent = 0;
  const frozenDays = [];
  const penaltyDays = [];
  const timeline = [];
  let brokenAt = null;

  for (let key = first; key <= last; key = addDays(key, 1)) {
    const bucket = days.get(key);
    const points = bucket?.points || 0;
    const vacation = isVacationDay(key, vacations);
    let status;

    if (vacation) {
      status = "vacation";
    } else if (points >= target) {
      current += 1;
      status = "complete";
      if (points >= freezeAt && freezes < cfg.maxFreezes) {
        freezes += 1;
        status = "earned-freeze";
      }
    } else if (key === todayKey) {
      // Today is still in progress. It has not been missed until midnight.
      status = points > 0 ? "partial" : "pending";
    } else {
      const nextPoints = days.get(addDays(key, 1))?.points || 0;
      if (nextPoints >= penaltyCost) {
        current += 1;
        status = "restored";
        penaltyDays.push(key);
      } else if (freezes > 0) {
        freezes -= 1;
        freezesSpent += 1;
        current += 1;
        status = "frozen";
        frozenDays.push(key);
      } else {
        longest = Math.max(longest, current);
        current = 0;
        brokenAt = key;
        status = "missed";
      }
    }

    timeline.push({ day: key, points, status, vacation });
  }

  longest = Math.max(longest, current);
  return {
    current,
    longest,
    freezes,
    freezesSpent,
    frozenDays,
    penaltyDays,
    brokenAt,
    timeline,
  };
}

/* ------------------------------------------------------------------ */
/* Levels                                                              */
/* ------------------------------------------------------------------ */

/**
 * @param {number} points lifetime points
 * @returns {{ level:number, name:string, at:number, next:object|null, into:number, span:number, progress:number }}
 */
export function levelFor(points) {
  const p = Math.max(0, Number(points) || 0);
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (p >= LEVELS[i].at) idx = i;
  const cur = LEVELS[idx];
  const next = LEVELS[idx + 1] || null;
  const into = p - cur.at;
  const span = next ? next.at - cur.at : 0;
  return {
    ...cur,
    next,
    into,
    span,
    progress: next ? Math.min(1, into / span) : 1,
  };
}

/* ------------------------------------------------------------------ */
/* Achievements                                                        */
/* ------------------------------------------------------------------ */

/**
 * Declarative badge set. Each `test` takes the snapshot below and returns a
 * boolean, so adding a badge never means touching the engine.
 *
 * `needsAI` marks the ones that cannot be earned without a review provider
 * configured. They are still computed — an achievement earned last year does not
 * un-earn itself when the last API key is removed — but a surface showing the
 * locked ones hides them, because a permanently unreachable badge in the list
 * reads as a broken feature rather than an invitation.
 */
export const ACHIEVEMENTS = Object.freeze([
  {
    id: "first-blood",
    emoji: "🩸",
    name: "First Blood",
    hint: "Commit your first solve",
    test: (s) => s.totalSolves >= 1,
  },
  {
    id: "ten-down",
    emoji: "🔟",
    name: "Ten Down",
    hint: "Solve 10 problems",
    test: (s) => s.totalSolves >= 10,
  },
  {
    id: "century",
    emoji: "💯",
    name: "Century",
    hint: "Solve 100 problems",
    test: (s) => s.totalSolves >= 100,
  },
  {
    id: "half-k",
    emoji: "🏛️",
    name: "Five Hundred",
    hint: "Solve 500 problems",
    test: (s) => s.totalSolves >= 500,
  },
  {
    id: "week-streak",
    emoji: "🔥",
    name: "Week On Fire",
    hint: "7-day streak",
    test: (s) => s.longestStreak >= 7,
  },
  {
    id: "month-streak",
    emoji: "🌋",
    name: "Month On Fire",
    hint: "30-day streak",
    test: (s) => s.longestStreak >= 30,
  },
  {
    id: "hundred-streak",
    emoji: "☄️",
    name: "Unbroken",
    hint: "100-day streak",
    test: (s) => s.longestStreak >= 100,
  },
  {
    id: "hard-mode",
    emoji: "💀",
    name: "Hard Mode",
    hint: "Solve 25 Hard problems",
    test: (s) => (s.byDifficulty.Hard || 0) >= 25,
  },
  {
    id: "polyglot",
    emoji: "🗣️",
    name: "Polyglot",
    hint: "Solve in 5 languages",
    test: (s) => s.languageCount >= 5,
  },
  {
    id: "explorer",
    emoji: "🧭",
    name: "Explorer",
    hint: "Solve on 3 platforms",
    test: (s) => s.platformCount >= 3,
  },
  {
    id: "well-rounded",
    emoji: "🎯",
    name: "Well Rounded",
    hint: "Cover 15 topics",
    test: (s) => s.topicCount >= 15,
  },
  {
    id: "rememberer",
    emoji: "🧠",
    name: "Rememberer",
    hint: "50 recall solves",
    test: (s) => s.totalRecalls >= 50,
  },
  {
    id: "double-day",
    emoji: "⚡",
    name: "Double Day",
    hint: "Hit twice the daily target in one day",
    test: (s) => s.bestDayPoints >= s.dailyTargetPoints * 2,
  },
  {
    id: "comeback",
    emoji: "🪃",
    name: "Comeback",
    hint: "Buy back a missed day with the penalty",
    test: (s) => s.penaltyDays.length >= 1,
  },
  {
    id: "level-five",
    emoji: "⭐",
    name: "Engineer",
    hint: "Reach level 5",
    test: (s) => s.level.level >= 5,
  },
  {
    id: "level-ten",
    emoji: "👑",
    name: "Grandmaster",
    hint: "Reach level 10",
    test: (s) => s.level.level >= 10,
  },
  {
    id: "second-opinion",
    emoji: "🔍",
    name: "Second Opinion",
    hint: "Get 10 solutions reviewed",
    needsAI: true,
    test: (s) => s.totalReviews >= 10,
  },
  {
    id: "peer-reviewed",
    emoji: "📝",
    name: "Peer Reviewed",
    hint: "Get 100 solutions reviewed",
    needsAI: true,
    test: (s) => s.totalReviews >= 100,
  },
]);

/* ------------------------------------------------------------------ */
/* Snapshot                                                            */
/* ------------------------------------------------------------------ */

/**
 * The single object every gamification surface renders from — popup badge,
 * library header, GitHub Pages badges, README block, share card.
 *
 * @param {Array<object>} problems ledger records
 * @param {object} [options]
 * @param {object} [options.config] partial config merged over DEFAULT_CONFIG
 * @param {Array<{start:string,end?:string|null}>} [options.vacations]
 * @param {number} [options.now] epoch ms, for deterministic tests
 * @param {string} [options.streakFloorDay] install day — streaks do not predate it
 * @returns {object}
 */
export function computeSnapshot(problems, options = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...(options.config || {}) };
  const vacations = options.vacations || [];
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const today = dayKey(now, cfg.utcOffsetMinutes);

  const events = scoreEvents(problems, cfg);
  const days = buildDailyPoints(problems, cfg);
  const streak = computeStreak(days, cfg, vacations, today, options.streakFloorDay);

  let totalPoints = 0;
  let totalRecalls = 0;
  const byDifficulty = {};
  for (const e of events) {
    totalPoints += e.points;
    if (e.recall) totalRecalls += 1;
    else byDifficulty[e.difficulty] = (byDifficulty[e.difficulty] || 0) + 1;
  }

  const languages = new Set();
  const platforms = new Set();
  const topics = new Set();
  // Solves that came back with a review on them. Counted here rather than asked
  // of the AI settings, because the count is about work that happened: a review
  // written last month still counts after the last provider is switched off.
  let totalReviews = 0;
  for (const p of problems || []) {
    if (!p) continue;
    const lang = p.lang?.name || p.lang?.slug;
    if (lang) languages.add(String(lang).toLowerCase());
    if (p.platform) platforms.add(p.platform);
    for (const t of p.tags || []) if (t) topics.add(String(t).toLowerCase());
    if (typeof p.aiReview === "string" && p.aiReview.trim()) totalReviews += 1;
  }

  let bestDayPoints = 0;
  let bestDay = null;
  for (const [key, d] of days) {
    if (d.points > bestDayPoints) {
      bestDayPoints = d.points;
      bestDay = key;
    }
  }

  // The effective target is reduced while easing back in from a vacation. The
  // hardest day to restart is the first one, so it is the cheapest.
  const iceBreaker = computeIceBreaker(vacations, today, cfg);
  const effectiveTarget = iceBreaker.active
    ? Math.max(1, Math.round(cfg.dailyTargetPoints * cfg.iceBreakerMultiplier))
    : Math.max(1, Math.round(cfg.dailyTargetPoints));

  const todayBucket = days.get(today) || { points: 0, solves: 0, recalls: 0, byDifficulty: {} };
  const yesterday = addDays(today, -1);

  // Ask the timeline rather than re-deriving. A freeze spent on yesterday, or a
  // penalty already paid by today's points, both leave a status other than
  // "missed" — and in either case there is nothing left to rescue.
  const yesterdayMissed = streak.timeline.find((t) => t.day === yesterday)?.status === "missed";

  const snapshot = {
    // config echoed back so renderers never need their own copy
    enabled: cfg.enabled !== false,
    dailyTargetPoints: cfg.dailyTargetPoints,
    effectiveTarget,
    // The day boundary this snapshot was computed against. It has to travel:
    // a GitHub Actions runner is on UTC, so a refresh that fell back to its own
    // offset would roll the day over at the wrong hour for everyone else.
    utcOffsetMinutes: cfg.utcOffsetMinutes,

    totalPoints,
    totalSolves: events.filter((e) => !e.recall).length,
    totalRecalls,
    totalReviews,
    byDifficulty,
    languageCount: languages.size,
    platformCount: platforms.size,
    topicCount: topics.size,

    today,
    todayPoints: todayBucket.points,
    todaySolves: todayBucket.solves,
    todayDone: todayBucket.points >= effectiveTarget,
    todayRemaining: Math.max(0, effectiveTarget - todayBucket.points),

    currentStreak: streak.current,
    longestStreak: streak.longest,
    freezes: streak.freezes,
    freezesSpent: streak.freezesSpent,
    frozenDays: streak.frozenDays,
    penaltyDays: streak.penaltyDays,
    timeline: streak.timeline,

    bestDay,
    bestDayPoints,
    activeDays: days.size,

    level: levelFor(totalPoints),
    vacationActive: isVacationDay(today, vacations),
    iceBreaker,

    /**
     * What it would cost to save the streak right now: null when nothing is at
     * risk, otherwise the points needed today and how they would be paid.
     */
    rescue: null,
  };

  if (yesterdayMissed && !snapshot.vacationActive) {
    const cost = Math.ceil(cfg.penaltyMultiplier * cfg.dailyTargetPoints);
    snapshot.rescue = {
      kind: "penalty",
      requiredPoints: cost,
      remaining: Math.max(0, cost - todayBucket.points),
      restoresDay: yesterday,
    };
  }

  snapshot.achievements = ACHIEVEMENTS.map((a) => ({
    id: a.id,
    emoji: a.emoji,
    name: a.name,
    hint: a.hint,
    needsAI: a.needsAI === true,
    earned: !!a.test(snapshot),
  }));
  snapshot.earnedCount = snapshot.achievements.filter((a) => a.earned).length;

  return snapshot;
}

/**
 * The achievements earned since the last time the user looked at them.
 *
 * Deliberately returns nothing until the seen-list has been seeded once. The
 * list starts empty for everybody, including a user who has been solving for
 * months, and flagging their entire back catalogue as new the first time they
 * open the shelf would be a lie about when the work happened. Seeding is the
 * first read; everything earned after it is genuinely new.
 *
 * @param {Array<{id:string,earned:boolean}>} achievements from `computeSnapshot`
 * @param {{ seenAchievements?: string[], achievementsSeeded?: boolean }} [state]
 * @returns {string[]} ids, in the order they appear in the list
 */
export function newlyEarned(achievements, state) {
  if (!state || state.achievementsSeeded !== true) return [];
  const seen = new Set(state.seenAchievements || []);
  return (achievements || []).filter((a) => a?.earned && !seen.has(a.id)).map((a) => a.id);
}

/**
 * Where the user is in the post-vacation ramp.
 *
 * @param {Array<{start:string,end?:string|null}>} vacations
 * @param {string} today
 * @param {object} cfg
 * @returns {{ active: boolean, dayOf: number, total: number, endedOn: string|null }}
 */
export function computeIceBreaker(vacations, today, cfg) {
  const ended = (vacations || [])
    .filter((v) => v?.end && v.end < today)
    .sort((a, b) => (a.end < b.end ? 1 : -1))[0];
  if (!ended) return { active: false, dayOf: 0, total: cfg.iceBreakerDays, endedOn: null };
  const since = daysBetween(ended.end, today);
  const active = since >= 1 && since <= cfg.iceBreakerDays;
  return {
    active,
    dayOf: active ? since : 0,
    total: cfg.iceBreakerDays,
    endedOn: ended.end,
  };
}

/**
 * Problems worth re-solving, most stale first. Drives the break-the-ice screen
 * after a vacation and the "recall" nudge in the popup.
 *
 * Ordering is by how long it has been since the last solve, weighted up for
 * harder problems — a Hard you saw two months ago is more at risk of being
 * forgotten than an Easy from the same week.
 *
 * @param {Array<object>} problems
 * @param {{ now?: number, limit?: number, minDays?: number }} [opts]
 * @returns {Array<{ id:string, title:string, platform:string, difficulty:string, daysSince:number, score:number }>}
 */
export function recallCandidates(problems, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const limit = opts.limit ?? 5;
  const minDays = opts.minDays ?? 14;
  const weight = { Easy: 1, Medium: 1.4, Hard: 1.9 };

  return (problems || [])
    .filter(Boolean)
    .map((p) => {
      const stamps = [Number(p.timestamp)].concat(
        (p.solveHistory || []).map((h) => Number(h?.timestamp ?? h)),
      );
      const last = Math.max(...stamps.filter(Number.isFinite));
      if (!Number.isFinite(last)) return null;
      const daysSince = Math.floor((now - last) / MS_PER_DAY);
      return {
        id: p.canonicalId || `${p.platform || "?"}:${p.titleSlug || p.title || "?"}`,
        title: p.title || p.titleSlug || "Untitled",
        titleSlug: p.titleSlug || "",
        platform: p.platform || "unknown",
        difficulty: p.difficulty || "Unknown",
        daysSince,
        score: daysSince * (weight[p.difficulty] || 1),
      };
    })
    .filter((r) => r && r.daysSince >= minDays)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Human-readable one-liner for the popup badge tooltip and share cards.
 * @param {object} snapshot
 * @returns {string}
 */
export function describeStreak(snapshot) {
  if (!snapshot || !snapshot.enabled) return "";
  const s = snapshot.currentStreak;
  if (snapshot.vacationActive) return "On vacation — streak is paused";
  if (s === 0) return "No streak yet — solve one problem to start";
  const done = snapshot.todayDone
    ? "today is done"
    : `${snapshot.todayRemaining} points to go today`;
  return `${s}-day streak · ${done}`;
}
