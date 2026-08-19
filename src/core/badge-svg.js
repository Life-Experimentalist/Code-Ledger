/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Static SVG badge generation for the user's own ledger repository.
 *
 * These are plain files committed alongside the solutions. GitHub Pages serves
 * them from the user's own account, so there is no badge service to run, no
 * bill to pay, and nothing that can go down and take everyone's README with it.
 *
 * Two things this file has to get right, both learned the hard way:
 *
 * 1. **Camo caching.** GitHub proxies every image in a README through camo and
 *    caches it by URL. A badge served from a stable URL will show last month's
 *    streak indefinitely. Every URL this file emits therefore carries a
 *    cache-busting query derived from the content, so the URL changes exactly
 *    when the badge does — see `badgeUrl`.
 *
 * 2. **XML escaping.** A problem title reaches these badges from a scraped page.
 *    An unescaped `&` is a broken image; an unescaped `<` is worse. Everything
 *    interpolated goes through `escapeXml`.
 *
 * No fonts are embedded, so the text width has to be estimated — see
 * `textWidth`. Getting it slightly wrong costs a few pixels of padding, which
 * is why the estimate errs generous.
 */

/** Brand palette. Kept here so badges, the Pages site and the popup agree. */
export const COLORS = Object.freeze({
  fire: "#f97316",
  ice: "#38bdf8",
  points: "#8b5cf6",
  level: "#22c55e",
  easy: "#22c55e",
  medium: "#f59e0b",
  hard: "#ef4444",
  slate: "#334155",
  dim: "#64748b",
  vacation: "#0ea5e9",
});

/**
 * Escape a string for interpolation into SVG text or an attribute value.
 * @param {unknown} s
 * @returns {string}
 */
export function escapeXml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Approximate the rendered width of a string in DejaVu Sans at 11px, the font
 * GitHub falls back to for badges on every platform.
 *
 * There is no font metric available at generation time, so this is a weighted
 * character-class estimate rather than a measurement. It rounds up, because a
 * badge that is two pixels too wide looks fine and one that is two pixels too
 * narrow clips the last glyph.
 *
 * @param {string} text
 * @returns {number} width in px
 */
export function textWidth(text) {
  let w = 0;
  for (const ch of String(text ?? "")) {
    const code = ch.codePointAt(0);
    if (code > 0x1f000)
      w += 12; // emoji render roughly square
    else if (/[MW@%]/.test(ch)) w += 9.5;
    else if (/[A-Z]/.test(ch)) w += 7.5;
    else if (/[ijltfr.,:;'!|]/.test(ch)) w += 3.5;
    else if (/[mw]/.test(ch)) w += 9;
    else if (/[0-9]/.test(ch)) w += 6.5;
    else if (ch === " ") w += 3.5;
    else w += 6.2;
  }
  return Math.ceil(w);
}

/**
 * A flat two-part badge: grey label on the left, coloured value on the right.
 *
 * @param {{ label: string, value: string, color?: string, labelColor?: string, title?: string }} opts
 * @returns {string} a complete standalone SVG document
 */
export function badge({ label, value, color = COLORS.slate, labelColor = "#555", title }) {
  const pad = 10;
  const labelW = textWidth(label) + pad * 2;
  const valueW = textWidth(value) + pad * 2;
  const total = labelW + valueW;
  const alt = escapeXml(title || `${label}: ${value}`);

  // Text is drawn twice: once in near-black at 0.1 opacity one pixel down as a
  // shadow, then in white. This is how shields.io keeps light-coloured badges
  // legible, and it costs nothing.
  const text = (str, x, w) => `
    <text x="${x + w / 2}" y="15" fill="#010101" fill-opacity=".3" textLength="${textWidth(str)}">${escapeXml(str)}</text>
    <text x="${x + w / 2}" y="14" fill="#fff" textLength="${textWidth(str)}">${escapeXml(str)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="${alt}">
  <title>${alt}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${total}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="20" fill="${escapeXml(labelColor)}"/>
    <rect x="${labelW}" width="${valueW}" height="20" fill="${escapeXml(color)}"/>
    <rect width="${total}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,Geneva,sans-serif" font-size="11">${text(label, 0, labelW)}${text(value, labelW, valueW)}
  </g>
</svg>`;
}

/* ------------------------------------------------------------------ */
/* Named badges                                                        */
/* ------------------------------------------------------------------ */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `"2026-08-10"` → `"Aug 10"`.
 *
 * Parsed from the string rather than through `Date`, which would re-interpret an
 * already timezone-shifted day key in the runtime's zone and could shift it back
 * a day. Returns "" for anything unparseable, so a bad key drops the stamp
 * instead of printing "NaN".
 *
 * @param {string} dayKey
 * @returns {string}
 */
export function asOfLabel(dayKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey || ""));
  if (!m) return "";
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return "";
  return `${month} ${Number(m[3])}`;
}

/**
 * What every named badge says, before anything decides how to draw it.
 *
 * The same six specs feed the self-hosted SVGs here and the shields.io endpoint
 * files in `badge-shields.js`. Keeping them in one place is the only reason the
 * two renderings cannot drift into disagreeing about the same streak.
 *
 * @param {object} snapshot from `computeSnapshot`
 * @returns {Record<string, {label: string, value: string, color: string, title?: string}>}
 */
export function badgeSpecs(snapshot) {
  const s = snapshot || {};
  const n = s.currentStreak || 0;
  const asOf = asOfLabel(s.today);
  // A badge is a picture committed at a moment in time — it cannot recount days
  // when someone loads the README weeks later, and a bare "5 days" quietly
  // becomes a lie the moment the user stops solving. "5 days · Aug 10" stays
  // true forever, and the reader can see for themselves how old it is.
  const stamp = asOf ? ` · ${asOf}` : "";
  const l = s.level || { level: 1, name: "Initiate" };
  const d = s.byDifficulty || {};
  const freezes = s.freezes || 0;

  return {
    streak: s.vacationActive
      ? {
          label: "streak",
          value: `on vacation${stamp}`,
          color: COLORS.vacation,
          title: `On vacation${asOf ? ` as of ${asOf}` : ""} — the streak is held, not broken`,
        }
      : {
          label: "streak",
          value: `${n === 1 ? "1 day" : `${n} days`}${stamp}`,
          color: n > 0 ? COLORS.fire : COLORS.dim,
          title: `Current solving streak: ${n} day${n === 1 ? "" : "s"}${asOf ? ` as of ${asOf}` : ""}`,
        },
    points: {
      label: "points",
      value: formatCount(s.totalPoints || 0),
      color: COLORS.points,
    },
    level: { label: `level ${l.level}`, value: String(l.name), color: COLORS.level },
    solved: {
      label: "solved",
      value: formatCount(s.totalSolves || 0),
      color: COLORS.slate,
    },
    difficulty: {
      label: "solved",
      value: `${d.Easy || 0} easy · ${d.Medium || 0} medium · ${d.Hard || 0} hard`,
      color: COLORS.medium,
    },
    freezes: {
      label: "freezes",
      value: String(freezes),
      color: freezes > 0 ? COLORS.ice : COLORS.dim,
      title: `${freezes} streak freeze${freezes === 1 ? "" : "s"} banked`,
    },
  };
}

/** The badge names, in the order a README shows them. */
export const BADGE_NAMES = Object.freeze([
  "streak",
  "points",
  "level",
  "solved",
  "difficulty",
  "freezes",
]);

/** Streak badge. Turns blue on vacation and grey when the streak is zero. */
export function streakBadge(snapshot) {
  return badge(badgeSpecs(snapshot).streak);
}

export function pointsBadge(snapshot) {
  return badge(badgeSpecs(snapshot).points);
}

export function levelBadge(snapshot) {
  return badge(badgeSpecs(snapshot).level);
}

export function solvedBadge(snapshot) {
  return badge(badgeSpecs(snapshot).solved);
}

/** One badge carrying the full Easy/Medium/Hard split. */
export function difficultyBadge(snapshot) {
  return badge(badgeSpecs(snapshot).difficulty);
}

export function freezeBadge(snapshot) {
  return badge(badgeSpecs(snapshot).freezes);
}

/** `1234` → `1.2k`. Keeps badge widths stable as the ledger grows. */
export function formatCount(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0)}k`;
  return `${(v / 1_000_000).toFixed(1)}M`;
}

/* ------------------------------------------------------------------ */
/* Hero card                                                           */
/* ------------------------------------------------------------------ */

/**
 * The two paint jobs for the card.
 *
 * A `prefers-color-scheme` media query inside the SVG would be the obvious way
 * to do this and is the wrong one: GitHub loads badges through camo as `<img>`,
 * where the query follows the reader's *operating system* rather than the theme
 * they picked on GitHub. So the two themes are two files, and the README's
 * `<picture>` element chooses between them — which is the mechanism GitHub
 * actually honours.
 *
 * The light values are not the dark ones lightened. Orange and green at 34px on
 * white sit under 3:1, so the light card uses darker mixes of the same hues.
 */
const CARD_THEMES = Object.freeze({
  dark: {
    bg0: "#0f172a",
    bg1: "#1e293b",
    border: "#334155",
    title: "#e2e8f0",
    muted: "#94a3b8",
    faint: "#64748b",
    stamp: "#475569",
    track: "#334155",
    streak: COLORS.fire,
    points: COLORS.points,
    solved: COLORS.level,
  },
  light: {
    bg0: "#ffffff",
    bg1: "#f1f5f9",
    border: "#cbd5e1",
    title: "#0f172a",
    muted: "#475569",
    faint: "#64748b",
    stamp: "#94a3b8",
    track: "#e2e8f0",
    streak: "#c2410c",
    points: "#6d28d9",
    solved: "#15803d",
  },
});

/**
 * The card's motion, as a `<style>` block.
 *
 * Everything is a one-shot on load — the bar fills, the numbers rise — because
 * a badge that loops forever in the corner of a README is a distraction the
 * reader cannot dismiss. It runs only under `prefers-reduced-motion:
 * no-preference`, and the static card is the un-animated end state, so somebody
 * who has asked for less motion sees the finished thing rather than a blank one.
 *
 * CSS transforms rather than animating `width`: `transform` on an SVG shape is
 * the part every renderer agrees on.
 */
const CARD_MOTION = `<style>
    .bar,.n{transform-box:fill-box}
    .bar{transform-origin:left center}
    @media (prefers-reduced-motion: no-preference){
      .bar{animation:cl-grow .9s cubic-bezier(.22,1,.36,1) both}
      .n{animation:cl-rise .5s ease-out both}
      .n2{animation-delay:.08s}
      .n3{animation-delay:.16s}
    }
    @keyframes cl-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
    @keyframes cl-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  </style>`;

/**
 * A larger card for the top of a README or a social share. Self-contained and
 * sized for GitHub's content column at 2x.
 *
 * @param {object} snapshot
 * @param {{ username?: string, theme?: "dark"|"light", animate?: boolean }} [opts]
 * @returns {string}
 */
export function streakCard(snapshot, opts = {}) {
  const t = CARD_THEMES[opts.theme === "light" ? "light" : "dark"];
  const l = snapshot.level || { level: 1, name: "Initiate", progress: 0 };
  const streak = snapshot.vacationActive ? "🌴" : String(snapshot.currentStreak || 0);
  const barW = Math.round(360 * Math.min(1, Math.max(0, l.progress || 0)));
  const who = opts.username ? `${opts.username}'s ledger` : "CodeLedger";
  const motion = opts.animate === false ? "" : `\n  ${CARD_MOTION}`;

  const cell = (x, value, label, color, cls) => `
    <text class="n ${cls}" x="${x}" y="86" fill="${color}" font-size="34" font-weight="700" text-anchor="middle">${escapeXml(value)}</text>
    <text x="${x}" y="108" fill="${t.muted}" font-size="12" text-anchor="middle">${escapeXml(label)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="200" role="img" aria-label="${escapeXml(who)}: ${snapshot.currentStreak || 0} day streak, ${snapshot.totalPoints || 0} points">
  <title>${escapeXml(who)}</title>${motion}
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${t.bg0}"/>
      <stop offset="1" stop-color="${t.bg1}"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${t.streak}"/>
      <stop offset="1" stop-color="${t.points}"/>
    </linearGradient>
  </defs>
  <rect width="420" height="200" rx="12" fill="url(#bg)"/>
  <rect x="0.5" y="0.5" width="419" height="199" rx="12" fill="none" stroke="${t.border}"/>
  <text x="24" y="36" fill="${t.title}" font-size="15" font-weight="600" font-family="Segoe UI,Helvetica,Arial,sans-serif">${escapeXml(who)}</text>
  <text x="396" y="36" fill="${t.faint}" font-size="12" text-anchor="end" font-family="Segoe UI,Helvetica,Arial,sans-serif">Lv ${escapeXml(l.level)} · ${escapeXml(l.name)}</text>
  <g font-family="Segoe UI,Helvetica,Arial,sans-serif">
${cell(80, streak, "day streak", t.streak, "n1")}
${cell(210, formatCount(snapshot.totalPoints || 0), "points", t.points, "n2")}
${cell(340, formatCount(snapshot.totalSolves || 0), "solved", t.solved, "n3")}
  </g>
  <rect x="30" y="140" width="360" height="8" rx="4" fill="${t.track}"/>
  <rect class="bar" x="30" y="140" width="${barW}" height="8" rx="4" fill="url(#bar)"/>
  <text x="30" y="172" fill="${t.muted}" font-size="11" font-family="Segoe UI,Helvetica,Arial,sans-serif">${escapeXml(
    l.next ? `${l.into} / ${l.span} to ${l.next.name}` : "Max level",
  )}</text>
  <text x="390" y="172" fill="${t.muted}" font-size="11" text-anchor="end" font-family="Segoe UI,Helvetica,Arial,sans-serif">${escapeXml(
    snapshot.freezes || 0,
  )} ❄ · best ${escapeXml(snapshot.longestStreak || 0)}d</text>
  <text x="210" y="190" fill="${t.stamp}" font-size="9" text-anchor="middle" font-family="Segoe UI,Helvetica,Arial,sans-serif">${escapeXml(
    asOfLabel(snapshot.today) ? `as of ${asOfLabel(snapshot.today)}` : "",
  )}</text>
</svg>`;
}

/* ------------------------------------------------------------------ */
/* Repository output                                                   */
/* ------------------------------------------------------------------ */

/** Where badges live inside the ledger repository. */
export const BADGE_DIR = "badges";

/**
 * The badge files to include in a commit.
 *
 * @param {object} snapshot
 * @param {{ username?: string }} [opts]
 * @returns {Array<{ path: string, content: string }>}
 */
export function buildBadgeFiles(snapshot, opts = {}) {
  return [
    { path: `${BADGE_DIR}/streak.svg`, content: streakBadge(snapshot) },
    { path: `${BADGE_DIR}/points.svg`, content: pointsBadge(snapshot) },
    { path: `${BADGE_DIR}/level.svg`, content: levelBadge(snapshot) },
    { path: `${BADGE_DIR}/solved.svg`, content: solvedBadge(snapshot) },
    { path: `${BADGE_DIR}/difficulty.svg`, content: difficultyBadge(snapshot) },
    { path: `${BADGE_DIR}/freezes.svg`, content: freezeBadge(snapshot) },
    { path: `${BADGE_DIR}/card.svg`, content: streakCard(snapshot, opts) },
    // `card.svg` stays the dark one so every URL already embedded anywhere keeps
    // meaning what it meant. The light file is the addition, and the README's
    // `<picture>` is what decides between them.
    {
      path: `${BADGE_DIR}/card-light.svg`,
      content: streakCard(snapshot, { ...opts, theme: "light" }),
    },
    // A machine-readable copy so the landing page's comparison view and any
    // third-party dashboard can read the same numbers without parsing SVG.
    {
      path: `${BADGE_DIR}/stats.json`,
      content: JSON.stringify(badgeStats(snapshot), null, 2),
    },
  ];
}

/** The subset of a snapshot that is safe and useful to publish. */
export function badgeStats(snapshot) {
  return {
    schema: 1,
    // A day, not a timestamp. The scheduled refresh rewrites this file every
    // night; a wall-clock stamp would differ on every run and produce a commit
    // saying nothing changed when nothing did.
    asOf: snapshot.today || "",
    currentStreak: snapshot.currentStreak || 0,
    longestStreak: snapshot.longestStreak || 0,
    freezes: snapshot.freezes || 0,
    totalPoints: snapshot.totalPoints || 0,
    totalSolves: snapshot.totalSolves || 0,
    totalRecalls: snapshot.totalRecalls || 0,
    byDifficulty: snapshot.byDifficulty || {},
    level: snapshot.level?.level || 1,
    levelName: snapshot.level?.name || "Initiate",
    activeDays: snapshot.activeDays || 0,
    dailyTargetPoints: snapshot.dailyTargetPoints || 0,
    achievements: (snapshot.achievements || []).filter((a) => a.earned).map((a) => a.id),
  };
}

/**
 * The URL a README should embed for one badge.
 *
 * The `v` query is the cache-buster. GitHub's camo proxy keys its cache on the
 * full URL, so without it a README badge freezes at whatever it said the first
 * time anyone loaded the page. Deriving `v` from the snapshot means the URL is
 * stable while the numbers are, and changes the moment they do.
 *
 * @param {string} baseUrl e.g. `https://user.github.io/CodeLedger`
 * @param {string} name badge file name without extension
 * @param {object} snapshot
 * @returns {string}
 */
export function badgeUrl(baseUrl, name, snapshot) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  return `${base}/${BADGE_DIR}/${name}.svg?v=${encodeURIComponent(cacheKey(snapshot))}`;
}

/**
 * The value that has to change whenever a badge does.
 *
 * The day is part of it because the badges carry an "as of" stamp. A vacation
 * day regenerates identical numbers under a new date, and without the day here
 * camo would keep serving yesterday's picture with yesterday's stamp on it.
 *
 * @param {object} snapshot
 * @returns {string}
 */
export function cacheKey(snapshot) {
  const s = snapshot || {};
  return [s.totalPoints || 0, s.currentStreak || 0, s.totalSolves || 0, s.today || ""].join("-");
}

/**
 * Alt text per badge, so a reader with images off still gets the sense of it.
 *
 * Exported because the settings UI labels its badge checkboxes from here. A
 * separate label list would be a second place to forget when a badge is added.
 */
export const BADGE_ALT = Object.freeze({
  streak: "Streak",
  points: "Points",
  level: "Level",
  solved: "Solved",
  difficulty: "Solved by difficulty",
  freezes: "Freezes",
});

/**
 * Which badges a README shows when the user has not narrowed the list.
 *
 * Exported so the settings UI can tick the same boxes this renderer would use.
 * Hardcoding the default there instead would let the checkboxes disagree with
 * what actually gets committed.
 */
export const DEFAULT_PICKS = Object.freeze(["streak", "points", "level", "difficulty", "freezes"]);

/**
 * The gamification block for the ledger's README, between stable HTML comment
 * markers so it can be rewritten in place without disturbing anything the user
 * wrote around it.
 *
 * `urlFor` is how the shields.io rendering gets in without this file having to
 * know shields exists: pass a function and the badge row points wherever it
 * says. The card is always the self-hosted SVG, because there is no shields
 * equivalent of it.
 *
 * @param {object} snapshot
 * @param {{ pagesUrl?: string, username?: string, showCard?: boolean,
 *          picks?: string[], achievementPicks?: string[],
 *          urlFor?: (name: string) => string }} [opts]
 * @returns {string}
 */
export function badgeMarkdown(snapshot, opts = {}) {
  const svgUrl = (n) => badgeUrl(opts.pagesUrl || ".", n, snapshot);
  const url = typeof opts.urlFor === "function" ? opts.urlFor : svgUrl;
  const lines = [];

  if (opts.showCard !== false) {
    // `<picture>` rather than one image, because GitHub swaps the source on the
    // theme the reader chose on GitHub. The `<img>` is the dark card, so a
    // renderer that ignores `<picture>` entirely still shows something.
    lines.push(
      "<picture>",
      `  <source media="(prefers-color-scheme: light)" srcset="${escapeXml(svgUrl("card-light"))}">`,
      `  <img src="${escapeXml(svgUrl("card"))}" alt="Streak card" width="420">`,
      "</picture>",
      "",
    );
  }

  // An unrecognised name is dropped rather than rendered: `picks` comes from
  // stored settings, and a badge file that does not exist is a broken image.
  const picks = (
    Array.isArray(opts.picks) && opts.picks.length ? opts.picks : DEFAULT_PICKS
  ).filter((n) => BADGE_NAMES.includes(n));
  if (picks.length) {
    lines.push(picks.map((n) => `![${BADGE_ALT[n]}](${url(n)})`).join(" "));
  }

  // `achievementPicks` is an explicit selection: an array narrows the line to
  // exactly those ids, and an empty array removes the line entirely. That is a
  // deliberate difference from `picks` above — badges have a separate README
  // switch to remove the row, achievements have only this.
  const showcase = Array.isArray(opts.achievementPicks) ? new Set(opts.achievementPicks) : null;
  const earned = (snapshot.achievements || []).filter(
    (a) => a.earned && (!showcase || showcase.has(a.id)),
  );
  if (earned.length) {
    lines.push("", earned.map((a) => `${a.emoji} ${a.name}`).join(" · "));
  }

  return lines.join("\n");
}

export const README_START = "<!-- codeledger:gamification:start -->";
export const README_END = "<!-- codeledger:gamification:end -->";

/**
 * Insert or replace the gamification block in an existing README.
 *
 * Idempotent: running it twice on the same README with the same snapshot
 * produces byte-identical output, so it never creates an empty commit. If the
 * markers are absent the block is prepended, which is where a badge row belongs.
 *
 * @param {string} readme current file contents (may be empty)
 * @param {object} snapshot
 * @param {object} [opts] passed through to badgeMarkdown
 * @returns {string}
 */
export function upsertReadmeBlock(readme, snapshot, opts = {}) {
  const block = `${README_START}\n${badgeMarkdown(snapshot, opts)}\n${README_END}`;
  const text = String(readme || "");
  const start = text.indexOf(README_START);
  const end = text.indexOf(README_END);

  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(0, start) + block + text.slice(end + README_END.length);
  }
  if (!text.trim()) return `${block}\n`;

  // Keep an existing H1 as the first line; a badge row reads as a subtitle
  // under the title, not as a replacement for it.
  const nl = text.indexOf("\n");
  if (text.startsWith("# ") && nl !== -1) {
    return `${text.slice(0, nl + 1)}\n${block}\n${text.slice(nl + 1)}`;
  }
  return `${block}\n\n${text}`;
}
