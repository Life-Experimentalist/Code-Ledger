/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    h,
    useState,
    useEffect,
    useCallback,
} from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";
import {
    DEFAULT_THEME,
    THEME_PRESETS,
    getPresetList,
    applyThemeFromStorage,
} from "../../core/theme-engine.js";

const MODE_OPTIONS = [
    { id: "dark", label: "Dark" },
    { id: "light", label: "Light" },
    { id: "auto", label: "Auto" },
];

const AUTO_BEHAVIOR_OPTIONS = [
    { id: "system", label: "Follow OS" },
    { id: "sun", label: "Sunrise / Sunset" },
    { id: "schedule", label: "Custom schedule" },
];

export function PanelGeneral() {
    const [theme, setThemeState] = useState(DEFAULT_THEME);
    const [presets, setPresets] = useState([]);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState("");

    useEffect(() => {
        Storage.getTheme()
            .then((t) => {
                if (t) setThemeState({ ...DEFAULT_THEME, ...t });
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        setPresets(getPresetList(theme.customPresets || {}));
    }, [theme.customPresets]);

    const update = useCallback((key, val) => {
        setThemeState((prev) => ({ ...prev, [key]: val }));
    }, []);

    const save = async () => {
        setSaving(true);
        setSaveMsg("");
        try {
            await Storage.setTheme(theme);
            await applyThemeFromStorage();
            setSaveMsg("Saved");
        } catch (e) {
            setSaveMsg("Save failed: " + e.message);
        } finally {
            setSaving(false);
            setTimeout(() => setSaveMsg(""), 2500);
        }
    };

    const presetsByGroup = presets.reduce((acc, p) => {
        const g = p.group || "other";
        if (!acc[g]) acc[g] = [];
        acc[g].push(p);
        return acc;
    }, {});

    return html`
        <div class="space-y-6 max-w-xl">
            <div>
                <h2 class="text-base font-semibold text-white mb-1">
                    Appearance
                </h2>
                <p class="text-xs text-slate-500 mb-4">
                    Customize the color theme and display preferences.
                </p>
            </div>

            <!-- Mode pills -->
            <div>
                <label class="block text-xs font-medium text-slate-400 mb-2"
                    >Color mode</label
                >
                <div class="flex gap-2">
                    ${MODE_OPTIONS.map(
                        ({ id, label }) => html`
                            <button
                                key=${id}
                                onClick=${() => update("mode", id)}
                                class="px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors
                ${theme.mode === id
                                    ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-200"
                                    : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10"}"
                            >
                                ${label}
                            </button>
                        `
                    )}
                </div>
            </div>

            <!-- Auto behavior -->
            ${theme.mode === "auto" &&
            html`
                <div>
                    <label class="block text-xs font-medium text-slate-400 mb-2"
                        >Auto-switch behavior</label
                    >
                    <div class="space-y-1.5">
                        ${AUTO_BEHAVIOR_OPTIONS.map(
                            ({ id, label }) => html`
                                <label
                                    key=${id}
                                    class="flex items-center gap-3 cursor-pointer"
                                >
                                    <input
                                        type="radio"
                                        name="autoBehavior"
                                        value=${id}
                                        checked=${theme.autoBehavior === id}
                                        onChange=${() =>
                                            update("autoBehavior", id)}
                                        class="accent-cyan-500"
                                    />
                                    <span class="text-sm text-slate-300"
                                        >${label}</span
                                    >
                                </label>
                            `
                        )}
                    </div>
                    ${theme.autoBehavior === "schedule" &&
                    html`
                        <div class="mt-3 flex items-center gap-3">
                            <label class="text-xs text-slate-400 w-12"
                                >From</label
                            >
                            <input
                                type="time"
                                value=${theme.timeCustomStart || "06:00"}
                                onInput=${(e) =>
                                    update("timeCustomStart", e.target.value)}
                                class="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-slate-300 focus:outline-none focus:border-cyan-500/40"
                            />
                            <label class="text-xs text-slate-400 w-4">to</label>
                            <input
                                type="time"
                                value=${theme.timeCustomEnd || "18:00"}
                                onInput=${(e) =>
                                    update("timeCustomEnd", e.target.value)}
                                class="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-slate-300 focus:outline-none focus:border-cyan-500/40"
                            />
                        </div>
                    `}
                </div>
            `}

            <!-- Preset skin -->
            <div>
                <label class="block text-xs font-medium text-slate-400 mb-2"
                    >Preset skin</label
                >
                <select
                    value=${theme.preset || "material-dark"}
                    onChange=${(e) => update("preset", e.target.value)}
                    class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-cyan-500/40"
                >
                    ${Object.entries(presetsByGroup).map(
                        ([group, items]) => html`
                            <optgroup
                                key=${group}
                                label=${group.charAt(0).toUpperCase() +
                                group.slice(1)}
                            >
                                ${items.map(
                                    (p) => html`
                                        <option key=${p.id} value=${p.id}>
                                            ${p.emoji} ${p.name}
                                        </option>
                                    `
                                )}
                            </optgroup>
                        `
                    )}
                </select>
            </div>

            <!-- Live preview strip -->
            <div class="rounded-xl border border-white/10 overflow-hidden">
                <div
                    class="px-4 py-2 bg-[var(--cl-bg,#050508)] flex items-center gap-3"
                >
                    <span
                        class="w-3 h-3 rounded-full bg-[var(--cl-accent,#06b6d4)]"
                    ></span>
                    <span class="text-xs text-[var(--cl-text,#e2e8f0)]"
                        >Preview strip</span
                    >
                    <span
                        class="ml-auto text-[10px] text-[var(--cl-text-muted,#64748b)]"
                        >accent · bg · text</span
                    >
                </div>
            </div>

            <!-- Accent color override -->
            <div>
                <label class="block text-xs font-medium text-slate-400 mb-2"
                    >Accent color override</label
                >
                <div class="flex items-center gap-3">
                    <input
                        type="color"
                        value=${theme.accentPrimary ||
                        THEME_PRESETS[theme.preset]?.dark?.["primary-color"] ||
                        "#06b6d4"}
                        onInput=${(e) =>
                            update("accentPrimary", e.target.value)}
                        class="w-9 h-9 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                    />
                    <span class="text-xs text-slate-400">
                        ${theme.accentPrimary
                            ? theme.accentPrimary
                            : "Using preset default"}
                    </span>
                    ${theme.accentPrimary &&
                    html`
                        <button
                            onClick=${() => update("accentPrimary", "")}
                            class="ml-auto text-xs text-slate-500 hover:text-slate-300 transition-colors"
                        >
                            Reset
                        </button>
                    `}
                </div>
            </div>

            <!-- Background color override -->
            <div>
                <label class="block text-xs font-medium text-slate-400 mb-2"
                    >Background color override</label
                >
                <div class="flex items-center gap-3">
                    <input
                        type="color"
                        value=${theme.bgColor ||
                        THEME_PRESETS[theme.preset]?.dark?.["bg-primary"] ||
                        "#050508"}
                        onInput=${(e) => update("bgColor", e.target.value)}
                        class="w-9 h-9 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                    />
                    <span class="text-xs text-slate-400">
                        ${theme.bgColor
                            ? theme.bgColor
                            : "Using preset default"}
                    </span>
                    ${theme.bgColor &&
                    html`
                        <button
                            onClick=${() => update("bgColor", "")}
                            class="ml-auto text-xs text-slate-500 hover:text-slate-300 transition-colors"
                        >
                            Reset
                        </button>
                    `}
                </div>
            </div>

            <!-- Save -->
            <div class="flex items-center gap-3 pt-2">
                <button
                    onClick=${save}
                    disabled=${saving}
                    class="px-5 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                    ${saving ? "Saving…" : "Apply & save"}
                </button>
                ${saveMsg &&
                html`
                    <span
                        class="text-xs ${saveMsg.includes("failed")
                            ? "text-rose-400"
                            : "text-emerald-400"}"
                        >${saveMsg}</span
                    >
                `}
            </div>
        </div>
    `;
}
