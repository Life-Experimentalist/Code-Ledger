import { h } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { useState, useEffect } from "../../vendor/preact-bundle.js";
import { Storage } from "../../core/storage.js";
import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("MissingMetadataModal");
const IGNORED_METADATA_KEY = "metadata_ignored_ids";

export function MissingMetadataModal({ problems = [], onClose = () => { } }) {
  const [busyMap, setBusyMap] = useState({});
  const [ignoredIds, setIgnoredIds] = useState(new Set());
  const [loading, setLoading] = useState(true);

  // Load ignored IDs from storage on mount
  useEffect(() => {
    (async () => {
      try {
        const settings = await Storage.getSettings();
        const ignored = settings[IGNORED_METADATA_KEY] || [];
        setIgnoredIds(new Set(ignored));
      } catch (e) {
        dbg.warn("Failed to load ignored metadata:", e?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Get missing metadata explanation for each problem
  function getMissingReasons(p) {
    const reasons = [];
    const hasNoTags = !p.tags || p.tags.length === 0;
    const hasNoDifficulty =
      !p.difficulty || !["Easy", "Medium", "Hard"].includes(p.difficulty);

    if (hasNoTags) reasons.push("Missing tags");
    if (hasNoDifficulty) reasons.push("Missing difficulty level");

    return reasons;
  }

  const missing = (problems || [])
    .filter((p) => {
      const noTags = !p.tags || p.tags.length === 0;
      const noDifficulty =
        !p.difficulty ||
        !["Easy", "Medium", "Hard"].includes(p.difficulty);
      return noTags || noDifficulty;
    })
    .filter((p) => !ignoredIds.has(p.id)); // Exclude ignored

  const ignored = (problems || []).filter((p) => ignoredIds.has(p.id));

  async function queueRefreshOne(p) {
    setBusyMap((m) => ({ ...m, [p.id]: true }));
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.id) {
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { type: "REFRESH_METADATA", problems: [p] },
            (resp) => {
              if (chrome.runtime.lastError)
                return reject(
                  new Error(chrome.runtime.lastError.message)
                );
              if (resp?.ok) return resolve(resp);
              return reject(
                new Error(resp?.error || "refresh failed")
              );
            }
          );
        });
      }
    } catch (e) {
      dbg.error("Metadata refresh failed:", e?.message || e);
    } finally {
      setBusyMap((m) => ({ ...m, [p.id]: false }));
    }
  }

  async function toggleIgnore(problemId, ignore = true) {
    const newIgnored = new Set(ignoredIds);
    if (ignore) {
      newIgnored.add(problemId);
    } else {
      newIgnored.delete(problemId);
    }
    setIgnoredIds(newIgnored);

    try {
      const settings = await Storage.getSettings();
      await Storage.setSettings({
        ...settings,
        [IGNORED_METADATA_KEY]: Array.from(newIgnored),
      });
    } catch (e) {
      dbg.error("Failed to save ignored metadata:", e?.message);
    }
  }

  async function ignoreAll() {
    const toIgnore = new Set([...ignoredIds]);
    missing.forEach((p) => toIgnore.add(p.id));
    setIgnoredIds(toIgnore);

    try {
      const settings = await Storage.getSettings();
      await Storage.setSettings({
        ...settings,
        [IGNORED_METADATA_KEY]: Array.from(toIgnore),
      });
    } catch (e) {
      dbg.error("Failed to ignore all:", e?.message);
    }
  }

  async function unignoreAll() {
    setIgnoredIds(new Set());
    try {
      const settings = await Storage.getSettings();
      await Storage.setSettings({
        ...settings,
        [IGNORED_METADATA_KEY]: [],
      });
    } catch (e) {
      dbg.error("Failed to unignore all:", e?.message);
    }
  }

  if (loading) {
    return html`
            <div class="fixed inset-0 z-50 flex items-center justify-center">
                <div
                    class="absolute inset-0 bg-black/50"
                    onClick=${onClose}
                ></div>
                <div
                    class="relative w-full max-w-2xl mx-4 bg-slate-900 p-6 rounded-lg border border-white/10"
                >
                    <p class="text-slate-400">Loading…</p>
                </div>
            </div>
        `;
  }

  return html`
        <div class="fixed inset-0 z-50 flex items-center justify-center">
            <div class="absolute inset-0 bg-black/50" onClick=${onClose}></div>
            <div
                class="relative w-full max-w-4xl mx-4 bg-slate-900 p-6 rounded-lg border border-white/10 max-h-[80vh]" style="
  z-index: 10;          /* above overlay */
  width: 100%;
  max-width: var(--container-4xl);
  max-height: 80vh;     /* cap height to viewport */
  overflow-y: auto;     /* scroll inside modal */
  padding: calc(var(--spacing) * 6);
  border-radius: var(--radius-lg);
  border: 1px solid rgba(255,255,255,0.1);
  background-color: var(--color-slate-900);"
            >
                <div class="flex items-start justify-between gap-4 mb-4">
                    <div>
                        <h3 class="text-lg font-semibold">Missing Metadata</h3>
                        <p class="text-xs text-slate-500 mt-1">
                            ${missing.length}
                            problem${missing.length !== 1 ? "s" : ""} need
                            metadata
                            ${ignored.length > 0
      ? ` • ${ignored.length} ignored`
      : ""}
                        </p>
                    </div>
                    <button
                        onClick=${onClose}
                        class="text-slate-400 hover:text-white text-2xl leading-none"
                    >
                        ×
                    </button>
                </div>

                <p class="text-sm text-slate-400 mb-4">
                    The following problems have missing tags or difficulty
                    levels. You can refresh them individually or ignore them.
                </p>

                ${missing.length > 0 &&
    html`
                    <div
                        class="mb-6 p-4 bg-white/2 rounded-lg border border-white/5"
                    >
                        <div
                            class="flex items-center justify-between gap-4 mb-3"
                        >
                            <h4 class="text-sm font-medium">Needs Metadata</h4>
                            <button
                                onClick=${ignoreAll}
                                class="text-xs px-3 py-1 bg-slate-700/50 hover:bg-slate-600/50 rounded transition-colors"
                            >
                                Ignore All
                            </button>
                        </div>
                        <div class="space-y-2 max-h-64" style=" overflow: scroll;">
                        ${missing.map((p) => {
      const reasons = getMissingReasons(p);
      return html`
                                    <div
                                        class="p-3 bg-white/1 rounded border border-white/3 flex items-center gap-3"
                                    >
                                        <input
                                            type="checkbox"
                                            onChange=${(e) =>
          toggleIgnore(
            p.id,
            e.target.checked
          )}
                                            class="w-4 h-4"
                                            title="Ignore this problem"
                                        />
                                        <div class="flex-1 min-w-0">
                                            <div
                                                class="text-sm font-medium truncate"
                                            >
                                                ${p.title || p.id}
                                            </div>
                                            <div
                                                class="text-xs text-slate-500 truncate"
                                            >
                                                ${p.platform} →
                                                ${p.titleSlug || p.id}
                                            </div>
                                            <div
                                                class="text-xs text-amber-400/80 mt-1"
                                            >
                                                ${reasons.join(", ")}
                                            </div>
                                        </div>
                                        <button
                                            onClick=${() => queueRefreshOne(p)}
                                            disabled=${busyMap[p.id]}
                                            class="px-2 py-1 text-xs rounded whitespace-nowrap
                                                ${busyMap[p.id]
          ? "bg-slate-700/50 text-slate-400"
          : "bg-blue-600/20 hover:bg-blue-600/40 text-blue-200 transition-colors"}
                                            "
                                        >
                                            ${busyMap[p.id]
          ? "Queued…"
          : "Refresh"}
                                        </button>
                                    </div>
                                `;
    })}
                        </div>
                    </div>
                `}
                ${ignored.length > 0 &&
    html`
                    <div
                        class="p-4 bg-white/2 rounded-lg border border-white/5"
                    >
                        <div
                            class="flex items-center justify-between gap-4 mb-3"
                        >
                            <h4 class="text-sm font-medium text-slate-400">
                                ${ignored.length} Ignored
                            </h4>
                            <button
                                onClick=${unignoreAll}
                                class="text-xs px-3 py-1 bg-slate-700/50 hover:bg-slate-600/50 rounded transition-colors"
                            >
                                Un-ignore All
                            </button>
                        </div>
                        <div class="space-y-2 max-h-32 overflow-auto">
                            ${ignored.map((p) => {
      const reasons = getMissingReasons(p);
      return html`
                                    <div
                                        class="p-2 bg-white/1 rounded border border-white/3 flex items-center gap-2 opacity-60"
                                    >
                                        <input
                                            type="checkbox"
                                            checked
                                            onChange=${(e) =>
          toggleIgnore(
            p.id,
            e.target.checked
          )}
                                            class="w-4 h-4"
                                            title="Un-ignore this problem"
                                        />
                                        <div class="flex-1 min-w-0 text-xs">
                                            <div class="font-medium truncate">
                                                ${p.title || p.id}
                                            </div>
                                            <div
                                                class="text-slate-500 truncate"
                                            >
                                                ${p.platform} →
                                                ${p.titleSlug || p.id}
                                            </div>
                                        </div>
                                    </div>
                                `;
    })}
                        </div>
                    </div>
                `}
                ${missing.length === 0 &&
    ignored.length === 0 &&
    html`
                    <div
                        class="p-4 bg-white/2 rounded-lg text-center text-sm text-slate-400"
                    >
                        All problems have complete metadata!
                    </div>
                `}

                <div class="mt-6 flex gap-2">
                    <button
                        onClick=${onClose}
                        class="flex-1 px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg text-sm transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    `;
}
