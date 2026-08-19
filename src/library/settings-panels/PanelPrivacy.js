/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * One page that answers "what does this thing send, and to whom".
 *
 * Every claim here is computed from the live settings by
 * `src/core/privacy-disclosure.js` rather than written down, so it cannot drift
 * from what the extension actually does. If a future feature adds a
 * destination, it appears on this page the moment it is added to that module —
 * which is the point of keeping the list there instead of in prose.
 *
 * The panel does not own any toggle. Each row points at the panel that does,
 * so there is exactly one place to change a given behaviour and this page stays
 * a mirror rather than a second source of truth.
 */

import { h } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { disclosures, privacyTier, aiCostNotes, TIER_META } from "../../core/privacy-disclosure.js";
import { isAIActive } from "../../core/feature-flags.js";

/**
 * Which settings panel owns each destination.
 *
 * Kept here rather than in the disclosure module: where a toggle lives is a
 * fact about this UI, and the core module is also read by the welcome page,
 * which has no panels at all.
 */
const OWNED_BY = {
  github: "git",
  "oauth-relay": "git",
  "repo-public": "git",
  pages: "git",
  badges: "streaks",
  shields: "streaks",
  // No entry for `mermaid` or `party`: neither has a settings-panel control.
  // Mermaid rendering is a per-diagram button and the party list lives on the
  // Party tab, so a jump button would land the user somewhere with nothing to
  // change — an entry here must point at an actual toggle.
  telemetry: "advanced",
};

const panelFor = (id) => (id.startsWith("ai:") ? "ai" : OWNED_BY[id]);

const PANEL_LABEL = {
  git: "Git",
  streaks: "Streaks",
  ai: "AI",
  advanced: "Advanced",
};

/** Colour per tier, worst last — the same ordering `TIERS` uses. */
const TIER_STYLE = {
  private: {
    ring: "border-emerald-500/30 bg-emerald-500/5",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
  },
  shared: { ring: "border-sky-500/30 bg-sky-500/5", dot: "bg-sky-400", text: "text-sky-300" },
  public: {
    ring: "border-amber-500/30 bg-amber-500/5",
    dot: "bg-amber-400",
    text: "text-amber-300",
  },
  code: {
    ring: "border-fuchsia-500/30 bg-fuchsia-500/5",
    dot: "bg-fuchsia-400",
    text: "text-fuchsia-300",
  },
};

function DisclosureRow({ entry, onGoToPanel }) {
  const style = TIER_STYLE[entry.tier] || TIER_STYLE.private;
  const panel = panelFor(entry.id);
  return html`
    <div
      class="flex items-start gap-3 rounded-lg border px-3 py-2.5
        ${entry.on ? style.ring : "border-white/5 bg-white/[0.02]"}"
    >
      <span
        class="mt-1.5 h-2 w-2 shrink-0 rounded-full ${entry.on ? style.dot : "bg-slate-600"}"
        aria-hidden="true"
      ></span>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-baseline gap-x-2">
          <p class="text-sm font-medium ${entry.on ? "text-slate-200" : "text-slate-500"}">
            ${entry.destination}
          </p>
          ${entry.required && entry.on
            ? html`<span class="text-[10px] uppercase tracking-wide text-slate-500">required</span>`
            : null}
          ${entry.manual && entry.on
            ? html`<span class="text-[10px] uppercase tracking-wide text-slate-500"
                >only when you ask</span
              >`
            : null}
          ${!entry.on
            ? html`<span class="text-[10px] uppercase tracking-wide text-slate-600"
                >not enabled</span
              >`
            : null}
        </div>
        <p class="text-xs leading-snug ${entry.on ? "text-slate-400" : "text-slate-600"}">
          ${entry.what}
        </p>
        <p class="mt-1 text-[11px] leading-snug text-slate-500">${entry.note}</p>
      </div>
      ${panel && !entry.required && onGoToPanel
        ? html`
            <button
              onClick=${() => onGoToPanel(panel)}
              class="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-white/5"
            >
              ${PANEL_LABEL[panel] || "Settings"} →
            </button>
          `
        : null}
    </div>
  `;
}

export function PanelPrivacy({ settings, onGoToPanel }) {
  const s = settings || {};
  const all = disclosures(s);
  const tier = privacyTier(s);
  const style = TIER_STYLE[tier.tier] || TIER_STYLE.private;

  const on = all.filter((d) => d.on);
  const off = all.filter((d) => !d.on);

  const aiOn = isAIActive(s);
  const costs = aiCostNotes();
  const freeOnes = costs.filter((c) => c.free);

  return html`
    <div class="space-y-6 w-full">
      <!-- Where this configuration currently stands -->
      <div class="rounded-xl border px-4 py-4 ${style.ring}">
        <div class="flex items-center gap-2">
          <span class="h-2.5 w-2.5 rounded-full ${style.dot}" aria-hidden="true"></span>
          <h3 class="text-base font-semibold ${style.text}">${tier.name}</h3>
        </div>
        <p class="mt-1.5 text-sm text-slate-300 leading-snug">${tier.summary}</p>
        <p class="mt-2 text-[11px] text-slate-500 leading-snug">
          This is computed from your settings as they are right now, not a promise written in a
          document. Change something below and this line changes with it.
        </p>
      </div>

      <!-- Everything currently live -->
      <div class="space-y-2">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Live in this setup (${on.length})
        </h4>
        ${on.length === 0
          ? html`
              <p
                class="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-3 text-xs text-slate-500"
              >
                Nothing yet. Until you link a repository, every solve stays in this browser's local
                storage.
              </p>
            `
          : on.map(
              (entry) =>
                html`<${DisclosureRow}
                  key=${entry.id}
                  entry=${entry}
                  onGoToPanel=${onGoToPanel}
                />`,
            )}
      </div>

      <!-- The other half of an honest picture -->
      <div class="space-y-2">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Available, currently off (${off.length})
        </h4>
        <p class="text-[11px] text-slate-500 leading-snug">
          Listed so you can read what each one costs you before switching it on, rather than after.
        </p>
        ${off.map(
          (entry) =>
            html`<${DisclosureRow} key=${entry.id} entry=${entry} onGoToPanel=${onGoToPanel} />`,
        )}
      </div>

      <!-- AI is the feature most worth turning on and the one most often left off -->
      <div class="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-4">
        <h4 class="text-sm font-semibold text-slate-200">About AI reviews</h4>
        <p class="mt-1.5 text-xs text-slate-400 leading-snug">
          Reviews are off until you add a key, and they are the single feature that turns this from
          a commit log into something that teaches you. They do cost you privacy: a review sends
          your solution and the problem statement to whichever provider you pick.
          ${aiOn
            ? " You have that switched on, so the providers listed above are receiving it."
            : " Nothing is being sent today."}
        </p>
        <p class="mt-2 text-xs text-slate-400 leading-snug">
          ${freeOnes.length} of the ${costs.length} providers have a no-cost path, so trying it need
          not cost anything:
        </p>
        <ul class="mt-2 space-y-1">
          ${costs.map(
            (c) => html`
              <li key=${c.id} class="flex items-start gap-2 text-[11px] leading-snug">
                <span class="${c.free ? "text-emerald-400" : "text-slate-600"}"
                  >${c.free ? "free" : "paid"}</span
                >
                <span class="text-slate-400"
                  ><span class="text-slate-300">${c.name}</span> ${c.why}.</span
                >
              </li>
            `,
          )}
        </ul>
        <p class="mt-3 text-[11px] text-slate-500 leading-snug">
          If you want reviews with no third party at all, Ollama runs a model on your own machine
          and keeps this page reading
          <span class="text-emerald-300">${TIER_META.private.name}</span>.
        </p>
      </div>
    </div>
  `;
}
