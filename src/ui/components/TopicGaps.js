/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The gap report.
 *
 * Every other topic surface in the app ranks by solve count, which answers
 * "what have I done a lot of" — a question whose answer is always Array, and
 * which nobody needs help with. This one ranks by mastery, so it answers the
 * useful question instead: what is weak, and what has never been touched at all.
 *
 * Structures and algorithms are ranked in separate columns and never against
 * each other. "Weak on Trie" and "weak on DP" are different pieces of advice,
 * and one combined leaderboard lets a big structure count drown out both.
 */

import { h } from "../../vendor/preact-bundle.js";
import { useMemo } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { topicGaps, KIND_LABEL } from "../../core/topic-taxonomy.js";

/** Band → the colour that says how solid a topic is at a glance. */
const BAND = {
  strong: { color: "#10b981", label: "solid" },
  working: { color: "#06b6d4", label: "coming along" },
  shaky: { color: "#f59e0b", label: "shaky" },
  untouched: { color: "#64748b", label: "untouched" },
};

function Row({ topic, onTopic }) {
  const band = BAND[topic.band] || BAND.untouched;
  const pct = Math.round((topic.mastery || 0) * 100);
  const since =
    topic.daysSince === null || topic.daysSince === undefined
      ? ""
      : topic.daysSince === 0
        ? "today"
        : topic.daysSince === 1
          ? "yesterday"
          : `${topic.daysSince}d ago`;

  return html`
    <button
      onClick=${onTopic ? () => onTopic(topic) : null}
      class="w-full text-left flex flex-col gap-1 px-2.5 py-2 rounded-xl border border-white/5 bg-white/2 ${onTopic
        ? "hover:border-white/15 cursor-pointer"
        : "cursor-default"} transition-colors"
    >
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-xs text-slate-200 truncate">${topic.topic}</span>
        <span class="text-[10px] text-slate-500 font-mono shrink-0"
          >${topic.count}${since ? ` · ${since}` : ""}</span
        >
      </div>
      <div class="h-1 rounded-full bg-white/5 overflow-hidden">
        <div
          class="h-full rounded-full"
          style=${{ width: `${Math.max(2, pct)}%`, background: band.color }}
        ></div>
      </div>
      <span class="text-[10px]" style=${{ color: band.color }}>${band.label}</span>
    </button>
  `;
}

function Column({ title, subtitle, topics, onTopic, empty }) {
  return html`
    <div class="flex flex-col gap-2 min-w-0">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-[10px] uppercase tracking-widest text-slate-500">${title}</span>
        <span class="text-[10px] text-slate-600">${subtitle}</span>
      </div>
      ${topics.length
        ? topics.map((t) => html`<${Row} key=${t.topic} topic=${t} onTopic=${onTopic} />`)
        : html`<p class="text-[11px] text-slate-600 py-2">${empty}</p>`}
    </div>
  `;
}

/**
 * @param {object} props
 * @param {Array<object>} props.problems the ledger
 * @param {Record<string,string>} [props.topicKinds] `settings.topicKinds` overrides
 * @param {(topic: object) => void} [props.onTopic] open the solves behind a topic
 */
export function TopicGaps({ problems, topicKinds, onTopic }) {
  const gaps = useMemo(
    () => topicGaps(problems || [], { overrides: topicKinds || {} }),
    [problems, topicKinds],
  );

  const { ds, algo, untouched, summary } = gaps;
  if (!ds.length && !algo.length && !untouched.length) return "";

  const algoPct = Math.round(summary.algoRatio * 100);
  // The blind spots worth naming. The full untouched list is every well-known
  // topic nobody has met yet, which on a young ledger is most of the table —
  // a wall of grey that reads as failure rather than as a next step.
  const blind = untouched.slice(0, 12);

  return html`
    <div class="p-4 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col gap-4">
      <div class="flex items-baseline justify-between gap-3 flex-wrap">
        <div class="flex flex-col">
          <span class="text-[10px] uppercase tracking-widest text-slate-500"
            >Where the gaps are</span
          >
          <span class="text-[11px] text-slate-600"
            >Ranked by how well a topic is held, not by how often it shows up.</span
          >
        </div>
        <div class="text-right">
          <span class="text-lg font-bold text-cyan-400">${algoPct}%</span>
          <span class="text-[10px] text-slate-500 block"
            >of solves needed a technique, not just a structure</span
          >
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <${Column}
          title="Weakest structures"
          subtitle=${`${summary.dsTopics} met`}
          topics=${ds}
          onTopic=${onTopic}
          empty="Nothing here yet — solve something tagged with a structure."
        />
        <${Column}
          title="Weakest algorithms"
          subtitle=${`${summary.algoTopics} met`}
          topics=${algo}
          onTopic=${onTopic}
          empty="Nothing here yet — solve something tagged with a technique."
        />
      </div>

      ${blind.length
        ? html`
            <div class="flex flex-col gap-2">
              <span class="text-[10px] uppercase tracking-widest text-slate-500"
                >Never touched<span class="text-slate-600 normal-case tracking-normal ml-2"
                  >${untouched.length} well-known ${untouched.length === 1 ? "topic" : "topics"}
                  with no solves at all</span
                ></span
              >
              <div class="flex flex-wrap gap-1.5">
                ${blind.map(
                  (t) => html`
                    <span
                      key=${t.topic}
                      title=${KIND_LABEL[t.kind] || ""}
                      class="px-2 py-0.5 rounded-lg text-[10px] border border-white/5 bg-white/2 text-slate-500"
                    >
                      ${t.topic}
                    </span>
                  `,
                )}
              </div>
            </div>
          `
        : ""}
    </div>
  `;
}
