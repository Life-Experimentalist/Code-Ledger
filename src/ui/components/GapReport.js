/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The 30-second gap report.
 *
 * `TopicGaps` answers "where am I weak" across every topic at once, which is
 * the right question when you have time to read a table. This one answers a
 * narrower question — what are the three things most worth fixing — and it
 * carries the number behind each, so the sentence a user leaves with is "four
 * core topics at zero", not "some gaps in graph algorithms".
 *
 * Three is the whole design. `gapHeadlines` already ranks and truncates; this
 * component's job is to not add a fourth row, a filter, or a chart.
 */

import { h } from "../../vendor/preact-bundle.js";
import { useMemo } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { gapHeadlines } from "../../core/interview-gaps.js";

/**
 * Colour per finding, ordered by how much it should alarm.
 * Anything unrecognised falls back to slate rather than rendering colourless.
 */
const TONE = {
  "absent-foundation": "#f43f5e",
  "absent-core": "#f59e0b",
  "easy-heavy": "#f59e0b",
  "medium-light": "#06b6d4",
  retention: "#a78bfa",
  "hard-absent": "#06b6d4",
  blocked: "#64748b",
};

function Headline({ finding, rank, onTopic }) {
  const color = TONE[finding.id] || "#64748b";
  // The number is the point of the row, so it is the largest thing in it.
  return html`
    <div class="flex gap-3 items-start">
      <span class="text-[10px] font-mono text-slate-600 pt-1.5 w-3 shrink-0">${rank}</span>
      <div class="shrink-0 w-16 flex flex-col items-end leading-none pt-0.5" style=${{ color }}>
        <span class="text-2xl font-bold tabular-nums">${finding.number}</span>
        <span class="text-[9px] text-slate-500 text-right">${finding.unit}</span>
      </div>
      <div class="flex flex-col gap-1 min-w-0">
        <span class="text-sm text-slate-100 leading-snug">${finding.title}</span>
        <span class="text-[11px] text-slate-500 leading-relaxed">${finding.detail}</span>
        ${finding.topics.length
          ? html`
              <div class="flex flex-wrap gap-1 mt-0.5">
                ${finding.topics
                  .slice(0, 6)
                  .map(
                    (t) => html`
                      <button
                        key=${t}
                        onClick=${onTopic ? () => onTopic(t) : null}
                        class="px-1.5 py-0.5 rounded-md text-[10px] border border-white/5 bg-white/2 text-slate-400 ${onTopic
                          ? "hover:border-white/15 cursor-pointer"
                          : "cursor-default"} transition-colors"
                      >
                        ${t}
                      </button>
                    `,
                  )}
                ${finding.topics.length > 6
                  ? html`<span class="text-[10px] text-slate-600 self-center"
                      >+${finding.topics.length - 6} more</span
                    >`
                  : ""}
              </div>
            `
          : ""}
      </div>
    </div>
  `;
}

/**
 * @param {object} props
 * @param {Array<object>} props.problems the ledger
 * @param {Record<string,string>} [props.topicKinds] `settings.topicKinds` overrides
 * @param {Record<string,string>} [props.difficultyMap] user difficulty aliases
 * @param {{ halfLifeDays?: number, regainSolves?: number }} [props.masteryOpts]
 * @param {number} [props.maxTier] how far out to look — matches the role preset
 * @param {(topic: string) => void} [props.onTopic] open the solves behind a topic
 */
export function GapReport({ problems, topicKinds, difficultyMap, masteryOpts, maxTier, onTopic }) {
  const findings = useMemo(
    () =>
      gapHeadlines(problems || [], {
        overrides: topicKinds || {},
        userMap: difficultyMap || {},
        maxTier,
        ...(masteryOpts || {}),
      }),
    [problems, topicKinds, difficultyMap, masteryOpts, maxTier],
  );

  const total = (problems || []).length;
  if (!total) return "";

  return html`
    <div class="p-4 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col gap-4">
      <div class="flex flex-col">
        <span class="text-[10px] uppercase tracking-widest text-slate-500">What to fix first</span>
        <span class="text-[11px] text-slate-600"
          >At most three findings, each with the number behind it.</span
        >
      </div>

      ${findings.length
        ? html`
            <div class="flex flex-col gap-4">
              ${findings.map(
                (f, i) =>
                  html`<${Headline} key=${f.id} finding=${f} rank=${i + 1} onTopic=${onTopic} />`,
              )}
            </div>
          `
        : html`
            <!-- An empty report is a real result. If this can never be empty it
                 is not a report, it is decoration. -->
            <p class="text-[11px] text-slate-500 leading-relaxed py-1">
              Nothing stands out across ${total} ${total === 1 ? "solve" : "solves"} — the
              foundations are met, the difficulty mix is reasonable and nothing has gone stale. Keep
              going and check back after the next stretch.
            </p>
          `}
    </div>
  `;
}
