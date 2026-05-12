/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Behaviour Bank View — full-page view of AI-managed user insights, learning patterns,
 * roadmap, and knowledge bank entries. Replaces the panel stub in Settings.
 */

import { h, useState, useEffect, useRef } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { createDebugger } from "../../lib/debug.js";
import { getInsights, saveInsight, deleteInsight } from "../../core/memory/knowledge-bank.js";
import { getAllSkills, saveUserSkill, deleteUserSkill, BUILTIN_SKILLS } from "../../core/ai/skills-registry.js";
import { Storage } from "../../core/storage.js";

const dbg = createDebugger("BehaviourBankView");

const TABS = [
    { id: "insights", label: "Insights" },
    { id: "roadmap", label: "Roadmap" },
    { id: "skills", label: "Skills" },
];

// ── Insights section ──────────────────────────────────────────────────────────

function InsightsSection() {
    const [insights, setInsights] = useState([]);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState("");
    const [addForm, setAddForm] = useState(false);
    const [form, setForm] = useState({ topic: "", content: "", tags: "", type: "insight" });

    useEffect(() => { load(); }, []);

    const load = async () => {
        try {
            const items = await getInsights(null, 100);
            setInsights(items);
        } catch (e) {
            dbg.error("InsightsSection load failed:", e?.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!form.topic.trim() || !form.content.trim()) {
            setMsg("Topic and content are required.");
            return;
        }
        try {
            const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
            await saveInsight({ topic: form.topic.trim(), content: form.content.trim(), tags, type: form.type || "insight" });
            setMsg("Insight saved.");
            setForm({ topic: "", content: "", tags: "", type: "insight" });
            setAddForm(false);
            await load();
        } catch (e) {
            setMsg("Failed: " + (e?.message || String(e)));
        }
        setTimeout(() => setMsg(""), 3000);
    };

    const handleDelete = async (id) => {
        if (!confirm("Delete this insight?")) return;
        try {
            await deleteInsight(id);
            setInsights(prev => prev.filter(i => i.id !== id));
            setMsg("Deleted.");
        } catch (e) {
            setMsg("Failed: " + (e?.message || String(e)));
        }
        setTimeout(() => setMsg(""), 3000);
    };

    const byTopic = {};
    insights.forEach(i => {
        const t = i.topic || "general";
        (byTopic[t] = byTopic[t] || []).push(i);
    });

    return html`
        <div class="flex flex-col gap-4">
            <div class="flex items-center justify-between">
                <p class="text-sm text-slate-400">${insights.length} insight${insights.length !== 1 ? "s" : ""} stored</p>
                <button
                    onClick=${() => setAddForm(v => !v)}
                    class="px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors"
                >${addForm ? "Cancel" : "+ Add Insight"}</button>
            </div>

            ${msg && html`<p class="text-xs ${msg.startsWith("Failed") ? "text-rose-400" : "text-emerald-400"}">${msg}</p>`}

            ${addForm && html`
                <form onSubmit=${handleAdd} class="p-4 bg-white/5 border border-white/10 rounded-xl flex flex-col gap-3">
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-xs text-slate-400 mb-1 block">Topic</label>
                            <input
                                type="text"
                                value=${form.topic}
                                onInput=${e => setForm(f => ({ ...f, topic: e.target.value }))}
                                placeholder="e.g. dynamic-programming"
                                class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                            />
                        </div>
                        <div>
                            <label class="text-xs text-slate-400 mb-1 block">Type</label>
                            <select
                                value=${form.type}
                                onChange=${e => setForm(f => ({ ...f, type: e.target.value }))}
                                class="w-full bg-[#0a0a0f] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/50"
                            >
                                <option value="insight">Insight</option>
                                <option value="preference">Preference</option>
                                <option value="roadmap">Roadmap</option>
                                <option value="note">Note</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="text-xs text-slate-400 mb-1 block">Content</label>
                        <textarea
                            value=${form.content}
                            onInput=${e => setForm(f => ({ ...f, content: e.target.value }))}
                            rows="3"
                            placeholder="What did you learn or observe?"
                            class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 resize-none"
                        />
                    </div>
                    <div>
                        <label class="text-xs text-slate-400 mb-1 block">Tags (comma-separated)</label>
                        <input
                            type="text"
                            value=${form.tags}
                            onInput=${e => setForm(f => ({ ...f, tags: e.target.value }))}
                            placeholder="arrays, recursion, two-pointers"
                            class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                        />
                    </div>
                    <button type="submit" class="self-start px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-200 text-xs rounded-lg transition-colors">
                        Save Insight
                    </button>
                </form>
            `}

            ${loading
                ? html`<p class="text-xs text-slate-500 py-4">Loading...</p>`
                : insights.length === 0
                    ? html`<p class="text-xs text-slate-500 py-4">No insights yet. The AI will add insights here as you chat and solve problems.</p>`
                    : Object.entries(byTopic).map(([topic, items]) => html`
                        <div key=${topic} class="p-4 bg-white/3 border border-white/8 rounded-xl">
                            <h4 class="text-xs font-medium text-cyan-400 uppercase tracking-widest mb-3">${topic}</h4>
                            <div class="flex flex-col gap-2">
                                ${items.map(item => html`
                                    <div key=${item.id} class="flex items-start gap-3 p-3 bg-white/5 border border-white/8 rounded-lg group">
                                        <div class="flex-1 min-w-0">
                                            <p class="text-xs text-slate-300 leading-relaxed">${item.content}</p>
                                            ${item.tags?.length > 0 && html`
                                                <div class="flex flex-wrap gap-1 mt-1.5">
                                                    ${item.tags.map(tag => html`
                                                        <span key=${tag} class="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-slate-500 text-xs">${tag}</span>
                                                    `)}
                                                </div>
                                            `}
                                        </div>
                                        <button
                                            onClick=${() => handleDelete(item.id)}
                                            class="text-slate-600 hover:text-rose-400 text-xs opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                                            title="Delete"
                                        >✕</button>
                                    </div>
                                `)}
                            </div>
                        </div>
                    `)
            }
        </div>
    `;
}

// ── Roadmap section ───────────────────────────────────────────────────────────

function RoadmapSection() {
    const [roadmap, setRoadmap] = useState("");
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [msg, setMsg] = useState("");

    useEffect(() => {
        Storage.getSettings().then(s => {
            const r = s?.aiRoadmap || "";
            setRoadmap(r);
            setDraft(r);
        }).catch(e => dbg.error("RoadmapSection load:", e?.message));
    }, []);

    const save = async () => {
        try {
            await Storage.setSettings({ aiRoadmap: draft });
            setRoadmap(draft);
            setEditing(false);
            setMsg("Roadmap saved.");
        } catch (e) {
            setMsg("Failed: " + (e?.message || String(e)));
        }
        setTimeout(() => setMsg(""), 3000);
    };

    return html`
        <div class="flex flex-col gap-4">
            <div class="flex items-center justify-between">
                <p class="text-sm text-slate-400">Your DSA roadmap — the AI uses this to suggest next problems.</p>
                ${!editing && html`
                    <button
                        onClick=${() => setEditing(true)}
                        class="px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors"
                    >${roadmap ? "Edit" : "Set Roadmap"}</button>
                `}
            </div>

            ${msg && html`<p class="text-xs ${msg.startsWith("Failed") ? "text-rose-400" : "text-emerald-400"}">${msg}</p>`}

            ${editing
                ? html`
                    <div class="flex flex-col gap-3">
                        <textarea
                            value=${draft}
                            onInput=${e => setDraft(e.target.value)}
                            rows="12"
                            placeholder="Paste or describe your DSA roadmap. Example:&#10;Week 1: Arrays & Hashing (Easy)&#10;Week 2: Two Pointers, Sliding Window&#10;Week 3: Stacks, Queues&#10;..."
                            class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 font-mono resize-y"
                        />
                        <div class="flex gap-2">
                            <button onClick=${save} class="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-200 text-xs rounded-lg transition-colors">Save</button>
                            <button onClick=${() => { setEditing(false); setDraft(roadmap); }} class="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors">Cancel</button>
                        </div>
                    </div>
                `
                : roadmap
                    ? html`
                        <pre class="p-4 bg-white/5 border border-white/10 rounded-xl text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed overflow-auto max-h-96">${roadmap}</pre>
                    `
                    : html`
                        <div class="p-6 bg-white/3 border border-white/8 rounded-xl text-center">
                            <p class="text-sm text-slate-500 mb-1">No roadmap set yet.</p>
                            <p class="text-xs text-slate-600">Add a DSA study plan and the AI will use it to guide problem suggestions and track your progress.</p>
                        </div>
                    `
            }
        </div>
    `;
}

// ── Skills section ────────────────────────────────────────────────────────────

const SKILL_TRIGGER_OPTIONS = [
    { value: "always", label: "Always active" },
    { value: "on_command:custom", label: "On command (/custom)" },
    { value: "after_solve", label: "After solving a problem" },
    { value: "on_stuck", label: "When user is stuck" },
    { value: "on_error", label: "When errors are present" },
    { value: "on_difficulty:Easy", label: "On Easy problems" },
    { value: "on_difficulty:Medium", label: "On Medium problems" },
    { value: "on_difficulty:Hard", label: "On Hard problems" },
];

function SkillsSection() {
    const [skills, setSkills] = useState([]);
    const [showBuiltin, setShowBuiltin] = useState(false);
    const [addForm, setAddForm] = useState(false);
    const [form, setForm] = useState({ id: "", name: "", description: "", trigger: "always", system_prompt_modifier: "" });
    const [msg, setMsg] = useState("");

    useEffect(() => { load(); }, []);

    const load = async () => {
        try {
            const all = await getAllSkills();
            setSkills(all);
        } catch (e) {
            dbg.error("SkillsSection load:", e?.message);
        }
    };

    const isBuiltin = (id) => BUILTIN_SKILLS.some(s => s.id === id);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!form.id.trim() || !form.name.trim() || !form.system_prompt_modifier.trim()) {
            setMsg("ID, name, and prompt modifier are required.");
            return;
        }
        try {
            await saveUserSkill({
                id: form.id.trim(),
                name: form.name.trim(),
                description: form.description.trim(),
                trigger: form.trigger,
                system_prompt_modifier: form.system_prompt_modifier.trim(),
            });
            setMsg("Skill saved.");
            setForm({ id: "", name: "", description: "", trigger: "always", system_prompt_modifier: "" });
            setAddForm(false);
            await load();
        } catch (e) {
            setMsg("Failed: " + (e?.message || String(e)));
        }
        setTimeout(() => setMsg(""), 3000);
    };

    const handleDelete = async (id) => {
        if (!confirm(`Delete skill "${id}"?`)) return;
        try {
            await deleteUserSkill(id);
            setMsg("Deleted.");
            await load();
        } catch (e) {
            setMsg("Failed: " + (e?.message || String(e)));
        }
        setTimeout(() => setMsg(""), 3000);
    };

    const userSkills = skills.filter(s => !isBuiltin(s.id));

    return html`
        <div class="flex flex-col gap-4">
            ${msg && html`<p class="text-xs ${msg.startsWith("Failed") ? "text-rose-400" : "text-emerald-400"}">${msg}</p>`}

            <!-- Built-in skills -->
            <div class="p-4 bg-white/3 border border-white/8 rounded-xl">
                <button
                    onClick=${() => setShowBuiltin(v => !v)}
                    class="flex items-center justify-between w-full text-left"
                >
                    <span class="text-xs font-medium text-slate-300">Built-in Skills (${BUILTIN_SKILLS.length})</span>
                    <span class="text-slate-500 text-xs">${showBuiltin ? "▲" : "▼"}</span>
                </button>
                ${showBuiltin && html`
                    <div class="flex flex-col gap-2 mt-3">
                        ${BUILTIN_SKILLS.map(skill => html`
                            <div key=${skill.id} class="p-3 bg-white/5 border border-white/8 rounded-lg">
                                <div class="flex items-start justify-between gap-2">
                                    <div>
                                        <p class="text-xs font-medium text-white">${skill.name}</p>
                                        <p class="text-xs text-slate-500 mt-0.5">${skill.description}</p>
                                    </div>
                                    <span class="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs rounded flex-shrink-0">${skill.trigger}</span>
                                </div>
                            </div>
                        `)}
                    </div>
                `}
            </div>

            <!-- User-defined skills -->
            <div class="flex items-center justify-between">
                <p class="text-sm text-slate-400">${userSkills.length} custom skill${userSkills.length !== 1 ? "s" : ""}</p>
                <button
                    onClick=${() => setAddForm(v => !v)}
                    class="px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors"
                >${addForm ? "Cancel" : "+ New Skill"}</button>
            </div>

            ${addForm && html`
                <form onSubmit=${handleSave} class="p-4 bg-white/5 border border-white/10 rounded-xl flex flex-col gap-3">
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-xs text-slate-400 mb-1 block">Skill ID (unique)</label>
                            <input
                                type="text"
                                value=${form.id}
                                onInput=${e => setForm(f => ({ ...f, id: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
                                placeholder="e.g. my-skill"
                                class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                            />
                        </div>
                        <div>
                            <label class="text-xs text-slate-400 mb-1 block">Display Name</label>
                            <input
                                type="text"
                                value=${form.name}
                                onInput=${e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="e.g. My Custom Skill"
                                class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                            />
                        </div>
                    </div>
                    <div>
                        <label class="text-xs text-slate-400 mb-1 block">Trigger</label>
                        <select
                            value=${form.trigger}
                            onChange=${e => setForm(f => ({ ...f, trigger: e.target.value }))}
                            class="w-full bg-[#0a0a0f] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/50"
                        >
                            ${SKILL_TRIGGER_OPTIONS.map(opt => html`
                                <option key=${opt.value} value=${opt.value}>${opt.label}</option>
                            `)}
                        </select>
                    </div>
                    <div>
                        <label class="text-xs text-slate-400 mb-1 block">Description (optional)</label>
                        <input
                            type="text"
                            value=${form.description}
                            onInput=${e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Short description of what this skill does"
                            class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                        />
                    </div>
                    <div>
                        <label class="text-xs text-slate-400 mb-1 block">System Prompt Modifier</label>
                        <textarea
                            value=${form.system_prompt_modifier}
                            onInput=${e => setForm(f => ({ ...f, system_prompt_modifier: e.target.value }))}
                            rows="4"
                            placeholder="Instructions added to the AI's system prompt when this skill is active. E.g. 'Respond only in Python examples.'"
                            class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 resize-none"
                        />
                    </div>
                    <button type="submit" class="self-start px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-200 text-xs rounded-lg transition-colors">
                        Save Skill
                    </button>
                </form>
            `}

            ${userSkills.length === 0 && !addForm
                ? html`
                    <div class="p-6 bg-white/3 border border-white/8 rounded-xl text-center">
                        <p class="text-sm text-slate-500 mb-1">No custom skills yet.</p>
                        <p class="text-xs text-slate-600">Create skills to modify how the AI behaves in specific situations — like a Socratic tutor, a strict time-complexity reviewer, or a language-specific expert.</p>
                    </div>
                `
                : html`
                    <div class="flex flex-col gap-2">
                        ${userSkills.map(skill => html`
                            <div key=${skill.id} class="p-3 bg-white/5 border border-white/8 rounded-lg group">
                                <div class="flex items-start justify-between gap-2">
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2 mb-1">
                                            <p class="text-xs font-medium text-white">${skill.name}</p>
                                            <span class="px-1.5 py-0.5 bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs rounded">${skill.trigger}</span>
                                        </div>
                                        ${skill.description && html`<p class="text-xs text-slate-500">${skill.description}</p>`}
                                        <p class="text-xs text-slate-400 mt-1.5 leading-relaxed line-clamp-2">${skill.system_prompt_modifier}</p>
                                    </div>
                                    <button
                                        onClick=${() => handleDelete(skill.id)}
                                        class="text-slate-600 hover:text-rose-400 text-xs opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 mt-0.5"
                                        title="Delete"
                                    >✕</button>
                                </div>
                            </div>
                        `)}
                    </div>
                `
            }
        </div>
    `;
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function BehaviourBankView() {
    const [tab, setTab] = useState("insights");

    return html`
        <div class="flex flex-col gap-6 w-full max-w-3xl mx-auto">
            <!-- Header -->
            <div>
                <h1 class="text-2xl font-light text-white mb-1">Behaviour Bank</h1>
                <p class="text-sm text-slate-400">
                    Persistent AI memory — insights, roadmap, and custom skills that shape how the AI assists you.
                </p>
            </div>

            <!-- Tab switcher -->
            <div class="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl w-fit">
                ${TABS.map(t => html`
                    <button
                        key=${t.id}
                        onClick=${() => setTab(t.id)}
                        class="px-4 py-1.5 rounded-lg text-xs transition-colors ${tab === t.id
                            ? "bg-cyan-600/30 border border-cyan-500/30 text-cyan-300"
                            : "text-slate-400 hover:text-slate-200"}"
                    >${t.label}</button>
                `)}
            </div>

            <!-- Content -->
            ${tab === "insights" && html`<${InsightsSection} />`}
            ${tab === "roadmap" && html`<${RoadmapSection} />`}
            ${tab === "skills" && html`<${SkillsSection} />`}
        </div>
    `;
}
