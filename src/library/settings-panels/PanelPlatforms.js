/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { CONSTANTS } from "../../core/constants.js";
import {
  RAW_MAPPINGS,
  customTopicsFromMappings,
  getKnownTopics,
  normalizeTag,
} from "../../core/topic-resolver.js";
import {
  classifyTopic,
  KIND,
  KIND_LABEL,
  masteryOptsFromSettings,
} from "../../core/topic-taxonomy.js";
import { TIER, TIER_KEY } from "../../handlers/platforms/takeuforward/api.js";

const PLATFORMS = Object.values(CONSTANTS.PLATFORMS);
const DIFFICULTY_LABELS = ["Easy", "Medium", "Hard"];

/** Badge colours for the three topic axes, keyed by `KIND`. */
const KIND_BADGE_CLASS = {
  [KIND.DS]: "bg-purple-500/10 text-purple-300 border border-purple-500/20",
  [KIND.ALGO]: "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20",
  [KIND.DOMAIN]: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
};

const PLATFORM_SYNC_URLS = {
  leetcode: {
    profile: CONSTANTS.PLATFORMS.leetcode.baseUrl + "/",
    progress: CONSTANTS.PLATFORMS.leetcode.baseUrl + "/progress/",
  },
  geeksforgeeks: {
    profile: CONSTANTS.PLATFORMS.geeksforgeeks.baseUrl + "/",
  },
  codeforces: {
    profile: CONSTANTS.PLATFORMS.codeforces.baseUrl + "/",
  },
};

export function PanelPlatforms({ settings, onSettingsChange }) {
  const [importMsg, setImportMsg] = useState({});
  const [newTagFrom, setNewTagFrom] = useState("");
  const [newTagTo, setNewTagTo] = useState("");
  const [tagError, setTagError] = useState("");

  const customMappings = settings?.topicMappings || {};
  /** Topics the user has invented, derived from the mappings themselves. */
  const customTopics = customTopicsFromMappings(customMappings);
  const knownTopics = getKnownTopics(customTopics);
  const isCustomTopic = (topic) => customTopics.some((t) => t === topic);

  const addCustomMapping = () => {
    const from = newTagFrom.trim();
    const typed = newTagTo.trim();
    if (!from || !typed) {
      setTagError("Both a tag and a topic are needed.");
      return;
    }
    // Fold the target through the same normaliser every stored tag goes through.
    // Typing "arrays" then links to the existing Array node instead of standing a
    // second one up beside it, and a genuinely new name arrives spelled like the
    // built-ins. An umbrella name comes back empty — those are dropped from every
    // problem, so a topic named that would never have anything in it.
    const to = normalizeTag(typed);
    if (!to) {
      setTagError(`"${typed}" is dropped as a catch-all tag. Pick something more specific.`);
      return;
    }
    if (from.toLowerCase() === to.toLowerCase()) {
      setTagError(`"${from}" already resolves to ${to}.`);
      return;
    }
    setTagError("");
    onSettingsChange("topicMappings", { ...customMappings, [from]: to });
    setNewTagFrom("");
    setNewTagTo("");
  };

  const deleteCustomMapping = (fromKey) => {
    const next = { ...customMappings };
    delete next[fromKey];
    onSettingsChange("topicMappings", next);
  };

  /** The user's own calls on which axis a topic sits, keyed on canonical name. */
  const topicKinds = settings?.topicKinds || {};

  /** Current decay knobs, already clamped to their valid ranges. */
  const masteryOpts = masteryOptsFromSettings(settings);

  const setMasteryNumber = (key, raw, lo, hi) => {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return;
    onSettingsChange(key, Math.min(hi, Math.max(lo, n)));
  };

  /**
   * Cycle a topic through the three axes and back to the built-in call.
   *
   * The built-in table is a set of judgement calls — Binary Search is a
   * technique, Binary Search Tree is a structure — and some of them are worth
   * arguing with. Cycling back to unset rather than pinning the built-in value
   * matters: an override recorded as agreement would silently outlive a future
   * correction to the table.
   */
  const cycleTopicKind = (topic) => {
    const order = [KIND.DS, KIND.ALGO, KIND.DOMAIN];
    const current = topicKinds[topic];
    const next = current === undefined ? order[0] : order[order.indexOf(current) + 1];
    const map = { ...topicKinds };
    if (next === undefined) delete map[topic];
    else map[topic] = next;
    onSettingsChange("topicKinds", map);
  };

  const isPlatformEnabled = (pid) => {
    const key = `${pid}_enabled`;
    if (settings?.[key] !== undefined) {
      return settings[key] === true;
    }
    const legacyKey =
      pid === "geeksforgeeks" ? "gfg_enable" : pid === "codeforces" ? "cf_enable" : `${pid}_enable`;
    if (settings?.[legacyKey] !== undefined) {
      return settings[legacyKey] === true;
    }
    // Must agree with BasePlatformHandler.isEnabled and with each handler's own
    // `{platform}_enable` schema default. Codeforces used to be special-cased
    // off here, so this card read "off" while its own settings section read
    // "on" — and a user who trusted the second one recorded nothing.
    return true;
  };

  const togglePlatform = (pid) => {
    const key = `${pid}_enabled`;
    onSettingsChange(key, !isPlatformEnabled(pid));
  };

  const getDifficultyMap = (pid) => settings?.[`${pid}_difficultyMap`] || {};

  const setDifficultyAlias = (pid, level, alias) => {
    const current = getDifficultyMap(pid);
    onSettingsChange(`${pid}_difficultyMap`, {
      ...current,
      [level]: alias,
    });
  };

  const openAndFlash = (pid, url, message) => {
    setImportMsg((m) => ({ ...m, [pid]: message }));
    try {
      if (typeof chrome !== "undefined" && chrome.tabs?.create) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, "_blank");
      }
    } catch (e) {
      setImportMsg((m) => ({ ...m, [pid]: "Error: " + e.message }));
    }
    setTimeout(() => setImportMsg((m) => ({ ...m, [pid]: "" })), 5000);
  };

  return html`
    <div class="space-y-6 w-full">
      <div>
        <h2 class="text-base font-semibold text-white mb-1">Platforms</h2>
        <p class="text-xs text-slate-500 mb-4">
          Enable tracking per platform, customize difficulty labels, and trigger profile imports.
        </p>
      </div>

      ${PLATFORMS.map((p) => {
        const enabled = isPlatformEnabled(p.id);
        const diffMap = getDifficultyMap(p.id);
        const syncUrls = PLATFORM_SYNC_URLS[p.id] || {};

        return html`
          <div
            key=${p.id}
            class="p-4 rounded-xl border ${enabled
              ? "border-white/10"
              : "border-white/5 opacity-60"} bg-white/2 space-y-4 transition-opacity"
          >
            <!-- Header -->
            <div class="flex items-center gap-3">
              <span
                class="w-2.5 h-2.5 rounded-full shrink-0"
                style=${"background:" + p.color}
              ></span>
              <span class="text-sm font-semibold text-slate-200 flex-1">${p.name}</span>
              ${(() => {
                const s = p.status;
                if (!s || s === CONSTANTS.FEATURE_STATUS.STABLE) return null;
                const meta = CONSTANTS.FEATURE_STATUS_META[s];
                if (!meta) return null;
                return html`<span
                  class="text-[10px] font-medium px-1.5 py-0.5 rounded border ${meta.className}"
                  >${meta.label}</span
                >`;
              })()}
              <button
                onClick=${() => togglePlatform(p.id)}
                class="relative inline-flex h-5 w-9 items-center rounded-full border transition-colors
                  ${enabled ? "bg-cyan-500/30 border-cyan-500/40" : "bg-white/5 border-white/10"}"
                title=${enabled ? "Disable " + p.name : "Enable " + p.name}
              >
                <span
                  class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
                  ${enabled ? "translate-x-4" : "translate-x-0.5"}"
                >
                </span>
              </button>
            </div>

            <!--
              takeuforward is the one platform where a subscription changes what
              CodeLedger receives. The tier is read off the site's own problem
              responses, which replace difficulty and topic tags with "Subscribe
              to TUF+" for everyone else, so this line appears only once you have
              opened a TUF+ problem page.

              It states only that redaction, which is observed. Whether the code
              judge itself runs for a free account is not something the extension
              can determine without an account of each kind, so it does not say.
            -->
            ${p.id === "takeuforward" &&
            settings?.[TIER_KEY] &&
            html`
              <p
                class="text-[11px] ${settings[TIER_KEY] === TIER.PLUS
                  ? "text-emerald-400/80"
                  : "text-amber-400/80"}"
              >
                ${settings[TIER_KEY] === TIER.PLUS
                  ? "TUF+ detected — problems here arrive with their difficulty and topic tags."
                  : "TUF+ not detected. Sheet mark-up is unaffected, but takeuforward withholds difficulty and topic tags from free accounts, so anything committed from here arrives without them."}
              </p>
            `}
            ${enabled &&
            html`
              <!-- Difficulty map -->
              <div>
                <p class="text-[11px] text-slate-500 mb-2">
                  Difficulty label aliases (leave blank to use default)
                </p>
                <div class="grid grid-cols-3 gap-2">
                  ${DIFFICULTY_LABELS.map(
                    (level) => html`
                      <div key=${level} class="space-y-1">
                        <label class="text-[10px] text-slate-500">${level}</label>
                        <input
                          type="text"
                          placeholder=${level}
                          value=${diffMap[level] || ""}
                          onInput=${(e) => setDifficultyAlias(p.id, level, e.target.value)}
                          class="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                        />
                      </div>
                    `,
                  )}
                </div>
              </div>

              <!-- Import / sync actions -->
              <div class="space-y-2">
                <p class="text-[11px] text-slate-500">
                  Open pages to trigger in-page import buttons:
                </p>
                <div class="flex flex-wrap gap-2">
                  ${syncUrls.profile &&
                  html`
                    <button
                      onClick=${() =>
                        openAndFlash(
                          p.id,
                          syncUrls.profile,
                          "Navigate to your profile and click the CodeLedger import button.",
                        )}
                      class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors"
                    >
                      Open Profile →
                    </button>
                  `}
                  ${syncUrls.progress &&
                  html`
                    <button
                      onClick=${() =>
                        openAndFlash(
                          p.id,
                          syncUrls.progress,
                          "Click the CodeLedger import button on the progress page to sync all submissions.",
                        )}
                      class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors"
                    >
                      Open Progress →
                    </button>
                  `}
                </div>

                ${p.id === "leetcode" &&
                html`
                  <p class="text-[10px] text-slate-600 leading-snug">
                    Profile import syncs your public solve count. Progress page imports full
                    submission history (first-time only for each problem+language).
                  </p>
                `}
                ${importMsg[p.id] &&
                html` <p class="text-[11px] text-emerald-400">${importMsg[p.id]}</p> `}
              </div>

              <!-- LeetCode-specific settings -->
              ${p.id === "leetcode" &&
              html`
                <div class="pt-1 border-t border-white/5 space-y-3">
                  <p class="text-[11px] text-slate-500 uppercase tracking-widest font-medium">
                    LeetCode Settings
                  </p>

                  ${[
                    {
                      key: "leetcode_submission_poll",
                      label: "Submission polling",
                      desc: "Poll for accepted verdict after you click Submit (catches submissions that don't trigger the solve event).",
                    },
                    {
                      key: "notifications",
                      label: "Notifications on commit",
                      desc: "Show a browser notification each time a solution is committed.",
                    },
                  ].map(
                    ({ key, label, desc }) => html`
                      <label key=${key} class="flex items-start gap-3 cursor-pointer">
                        <div class="flex-1">
                          <p class="text-xs text-slate-300">${label}</p>
                          <p class="text-[10px] text-slate-600">${desc}</p>
                        </div>
                        <button
                          onClick=${() =>
                            onSettingsChange(key, settings?.[key] !== false ? false : true)}
                          class="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
                          ${settings?.[key] !== false
                            ? "bg-cyan-500/30 border-cyan-500/40"
                            : "bg-white/5 border-white/10"}"
                        >
                          <span
                            class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
                          ${settings?.[key] !== false ? "translate-x-4" : "translate-x-0.5"}"
                          >
                          </span>
                        </button>
                      </label>
                    `,
                  )}
                </div>

                <div class="pt-1 border-t border-white/5 space-y-3">
                  <p class="text-[11px] text-slate-500 uppercase tracking-widest font-medium">
                    Quality of Life
                  </p>

                  ${[
                    {
                      key: "leetcode_copy_btn",
                      label: "Copy code button",
                      desc: "Adds a copy button to the editor toolbar that copies your code cleanly (strips Monaco whitespace markers).",
                    },
                    {
                      key: "leetcode_paste_btn",
                      label: "Paste without auto-indent button",
                      desc: "Adds a paste button that bypasses Monaco's auto-indentation for clean clipboard pastes.",
                    },
                    {
                      key: "floatingTimerEnabled",
                      label: "Floating solve timer",
                      desc: "Shows a draggable stopwatch that records how long you spend on each problem.",
                      defaultOn: true,
                    },
                    {
                      key: "floatingAIEnabled",
                      label: "Floating AI assistant",
                      desc: "Shows the AI chat panel on problem pages.",
                      defaultOn: true,
                    },
                  ].map(
                    ({ key, label, desc, defaultOn = true }) => html`
                      <label key=${key} class="flex items-start gap-3 cursor-pointer">
                        <div class="flex-1">
                          <p class="text-xs text-slate-300">${label}</p>
                          <p class="text-[10px] text-slate-600">${desc}</p>
                        </div>
                        <button
                          onClick=${() =>
                            onSettingsChange(
                              key,
                              settings?.[key] !== undefined ? !settings[key] : !defaultOn,
                            )}
                          class="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
                          ${(settings?.[key] !== undefined ? !!settings[key] : defaultOn)
                            ? "bg-cyan-500/30 border-cyan-500/40"
                            : "bg-white/5 border-white/10"}"
                        >
                          <span
                            class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
                          ${(settings?.[key] !== undefined ? !!settings[key] : defaultOn)
                              ? "translate-x-4"
                              : "translate-x-0.5"}"
                          >
                          </span>
                        </button>
                      </label>
                    `,
                  )}
                </div>
              `}

              <!-- GeeksForGeeks-specific settings -->
              ${p.id === "geeksforgeeks" &&
              html`
                <div class="pt-1 border-t border-white/5 space-y-3">
                  <p class="text-[11px] text-slate-500 uppercase tracking-widest font-medium">
                    GeeksForGeeks Settings
                  </p>

                  <div class="space-y-1">
                    <label class="text-[10px] text-slate-500">GFG Username</label>
                    <input
                      type="text"
                      placeholder="e.g. vkrishna04"
                      value=${settings?.gfg_username || ""}
                      onInput=${(e) => onSettingsChange("gfg_username", e.target.value)}
                      class="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                    />
                  </div>

                  ${[
                    {
                      key: "gfg_readme",
                      label: "Include problem description",
                      desc: "Save full problem statement and your stats to README.md.",
                      defaultOn: true,
                    },
                    {
                      key: "gfg_timer",
                      label: "Floating solve timer",
                      desc: "Display a floating stopwatch overlay while solving problems on GFG.",
                      defaultOn: true,
                    },
                    {
                      key: "gfg_copy_btn",
                      label: "Copy code button",
                      desc: "Inject a copy-to-clipboard button into the GFG editor area.",
                      defaultOn: true,
                    },
                    {
                      key: "gfg_ai_panel",
                      label: "Floating AI assistant",
                      desc: "Show a floating AI chat panel for instant code feedback on GFG problem pages.",
                      defaultOn: true,
                    },
                  ].map(
                    ({ key, label, desc, defaultOn = true }) => html`
                      <label key=${key} class="flex items-start gap-3 cursor-pointer">
                        <div class="flex-1">
                          <p class="text-xs text-slate-300">${label}</p>
                          <p class="text-[10px] text-slate-600">${desc}</p>
                        </div>
                        <button
                          onClick=${() =>
                            onSettingsChange(
                              key,
                              settings?.[key] !== undefined ? !settings[key] : !defaultOn,
                            )}
                          class="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
                          ${(settings?.[key] !== undefined ? !!settings[key] : defaultOn)
                            ? "bg-cyan-500/30 border-cyan-500/40"
                            : "bg-white/5 border-white/10"}"
                        >
                          <span
                            class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
                          ${(settings?.[key] !== undefined ? !!settings[key] : defaultOn)
                              ? "translate-x-4"
                              : "translate-x-0.5"}"
                          >
                          </span>
                        </button>
                      </label>
                    `,
                  )}
                </div>
              `}
            `}
          </div>
        `;
      })}

      <!-- Tag Normalization Mappings -->
      <div class="pt-6 border-t border-white/10 space-y-4">
        <div>
          <h3 class="text-sm font-semibold text-white mb-1">Tag & Topic Normalization</h3>
          <p class="text-xs text-slate-500">
            Map different tag names (e.g. platform-specific names like "Arrays" or "hashing") to a
            single canonical topic node (e.g. "Array" or "Hash Table") in the graph. The topic does
            not have to be one of the built-in ones — type a name of your own and it becomes a topic
            like any other, with its own axis, its own node and its own place in the gap report.
          </p>
        </div>

        <div class="bg-white/2 border border-white/5 rounded-xl p-4 space-y-4">
          <!-- Add Mappings Form -->
          <div class="flex items-end gap-3 flex-wrap sm:flex-nowrap">
            <div class="flex-1 min-w-[150px] space-y-1">
              <label class="text-[10px] text-slate-500 uppercase tracking-wider font-semibold"
                >Unnormalized Tag</label
              >
              <input
                type="text"
                placeholder="e.g. Arrays"
                value=${newTagFrom}
                onInput=${(e) => setNewTagFrom(e.target.value)}
                class="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
              />
            </div>
            <div class="flex-1 min-w-[150px] space-y-1">
              <label class="text-[10px] text-slate-500 uppercase tracking-wider font-semibold"
                >Canonical Topic (Target Node)</label
              >
              <input
                type="text"
                list="cl-canonical-topics"
                placeholder="Pick one, or type a new topic"
                value=${newTagTo}
                onInput=${(e) => setNewTagTo(e.target.value)}
                class="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
              />
              <datalist id="cl-canonical-topics">
                ${knownTopics.map((topic) => html`<option key=${topic} value=${topic}></option>`)}
              </datalist>
            </div>
            <button
              onClick=${addCustomMapping}
              class="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white text-xs font-medium rounded-lg transition-colors shrink-0 h-[32px] flex items-center justify-center"
            >
              Add Link
            </button>
          </div>

          ${tagError && html`<p class="text-xs text-rose-400">${tagError}</p>`}

          <!-- Existing Mappings List -->
          ${Object.keys(customMappings).length === 0
            ? html`<p class="text-xs text-slate-600 italic">No custom tag mappings added yet.</p>`
            : html`
                <div
                  class="max-h-60 overflow-y-auto border border-white/5 rounded-lg divide-y divide-white/5 bg-black/20"
                >
                  ${Object.entries(customMappings).map(
                    ([from, to]) => html`
                      <div key=${from} class="flex items-center justify-between p-2.5 text-xs">
                        <div class="flex items-center gap-2">
                          <span
                            class="px-2 py-0.5 bg-rose-500/10 text-rose-300 border border-rose-500/20 rounded font-mono"
                            >${from}</span
                          >
                          <span class="text-slate-500">→</span>
                          <span
                            class="px-2 py-0.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded font-mono"
                            >${to}</span
                          >
                        </div>
                        <button
                          onClick=${() => deleteCustomMapping(from)}
                          class="text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 p-1 rounded-md transition-colors"
                          title="Delete mapping"
                        >
                          ✕
                        </button>
                      </div>
                    `,
                  )}
                </div>
              `}
        </div>

        <!-- Predefined Canonical Topics & Aliases Reference Guide -->
        <details
          class="group bg-white/2 border border-white/5 rounded-xl overflow-hidden transition-all duration-300"
        >
          <summary
            class="flex items-center justify-between p-4 cursor-pointer select-none text-xs font-semibold text-slate-300 hover:bg-white/5 list-none"
          >
            <span class="flex items-center gap-2">
              <span class="group-open:hidden">▸</span>
              <span class="hidden group-open:inline">▾</span>
              View Canonical Topics & Aliases
            </span>
            <span class="text-[10px] text-slate-500 font-normal">Show built-in rules</span>
          </summary>
          <div class="p-4 border-t border-white/5 bg-black/40 space-y-4">
            <p class="text-xs text-slate-400">
              Every canonical topic, the axis each one sits on (data structure, algorithm, or
              neither), and the aliases that map to it. Click an axis badge to overrule the built-in
              call — analytics, the gap report and the graph all follow yours. Click through to
              cycle back to the built-in. Topics you created are marked
              <span class="text-cyan-300">yours</span>; they behave exactly like the built-in ones
              and disappear when the last tag mapped to them is removed.
            </p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
              ${knownTopics.map((topic) => {
                const kind = classifyTopic(topic, topicKinds).kind || KIND.DOMAIN;
                const overridden = Object.prototype.hasOwnProperty.call(topicKinds, topic);
                const aliases = [
                  ...(RAW_MAPPINGS[topic] || []),
                  ...Object.keys(customMappings).filter((from) => customMappings[from] === topic),
                ];
                return html`
                  <div
                    key=${topic}
                    class="p-3 bg-white/2 border border-white/5 rounded-lg space-y-2"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-xs font-medium text-slate-200 truncate"
                        >${topic}${isCustomTopic(topic)
                          ? html`<span
                              class="ml-1.5 text-[9px] uppercase tracking-wider text-cyan-400"
                              >yours</span
                            >`
                          : ""}</span
                      >
                      <button
                        onClick=${() => cycleTopicKind(topic)}
                        title=${overridden
                          ? `Your call. Click to cycle; keep clicking to go back to the built-in.`
                          : isCustomTopic(topic)
                            ? `Guessed from the name. Click to set your own.`
                            : `Built-in. Click to set your own.`}
                        class="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded hover:brightness-125 transition
                        ${KIND_BADGE_CLASS[kind]}"
                      >
                        ${KIND_LABEL[kind]}${overridden ? " •" : ""}
                      </button>
                    </div>
                    <div class="flex flex-wrap gap-1">
                      ${aliases.length === 0
                        ? html`<span class="text-[10px] text-slate-600 italic"
                            >No aliases defined</span
                          >`
                        : aliases.map(
                            (alias, i) => html`
                              <span
                                key=${`${alias}-${i}`}
                                class="text-[10px] font-mono px-1.5 py-0.5 bg-white/5 text-slate-400 rounded"
                              >
                                ${alias}
                              </span>
                            `,
                          )}
                    </div>
                  </div>
                `;
              })}
            </div>
          </div>
        </details>
      </div>

      <!-- Topic Proficiency Decay -->
      <div class="pt-6 border-t border-white/10 space-y-4">
        <div>
          <h3 class="text-sm font-semibold text-white mb-1">Topic Proficiency Decay</h3>
          <p class="text-xs text-slate-500">
            Topic mastery in the graph and the gap report fades when a topic goes untouched. The
            half-life sets how fast: after that many days without solving, the recency part of the
            score is halved. Regaining takes more than one solve — a topic counts as touched again
            only from its Nth most recent solve, so a single stray problem does not mark a rusty
            topic as fresh.
          </p>
        </div>

        <div class="bg-white/2 border border-white/5 rounded-xl p-4 flex items-end gap-6 flex-wrap">
          <div class="space-y-1">
            <label class="text-[10px] text-slate-500 uppercase tracking-wider font-semibold"
              >Half-life (days)</label
            >
            <input
              type="number"
              min="7"
              max="3650"
              step="1"
              value=${masteryOpts.halfLifeDays}
              onChange=${(e) => setMasteryNumber("mastery_half_life_days", e.target.value, 7, 3650)}
              class="w-28 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/40"
            />
            <p class="text-[10px] text-slate-600">7–3650 · default 90</p>
          </div>
          <div class="space-y-1">
            <label class="text-[10px] text-slate-500 uppercase tracking-wider font-semibold"
              >Solves to regain</label
            >
            <input
              type="number"
              min="1"
              max="8"
              step="1"
              value=${masteryOpts.regainSolves}
              onChange=${(e) => setMasteryNumber("mastery_regain_solves", e.target.value, 1, 8)}
              class="w-28 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/40"
            />
            <p class="text-[10px] text-slate-600">1–8 · default 2</p>
          </div>
        </div>
      </div>
    </div>
  `;
}
