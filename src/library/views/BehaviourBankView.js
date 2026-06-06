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
import {
  getAllSkills,
  saveUserSkill,
  deleteUserSkill,
  BUILTIN_SKILLS,
} from "../../core/ai/skills-registry.js";
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
  const [form, setForm] = useState({
    topic: "",
    content: "",
    tags: "",
    type: "insight",
  });

  useEffect(() => {
    load();
  }, []);

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
      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await saveInsight({
        topic: form.topic.trim(),
        content: form.content.trim(),
        tags,
        type: form.type || "insight",
      });
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
      setInsights((prev) => prev.filter((i) => i.id !== id));
      setMsg("Deleted.");
    } catch (e) {
      setMsg("Failed: " + (e?.message || String(e)));
    }
    setTimeout(() => setMsg(""), 3000);
  };

  const byTopic = {};
  insights.forEach((i) => {
    const t = i.topic || "general";
    (byTopic[t] = byTopic[t] || []).push(i);
  });

  return html`
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <p class="text-sm text-slate-400">
          ${insights.length} insight${insights.length !== 1 ? "s" : ""} stored
        </p>
        <button
          onClick=${() => setAddForm((v) => !v)}
          class="px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors"
        >
          ${addForm ? "Cancel" : "+ Add Insight"}
        </button>
      </div>

      ${msg &&
      html`<p class="text-xs ${msg.startsWith("Failed") ? "text-rose-400" : "text-emerald-400"}">
        ${msg}
      </p>`}
      ${addForm &&
      html`
        <form
          onSubmit=${handleAdd}
          class="p-4 bg-white/5 border border-white/10 rounded-xl flex flex-col gap-3"
        >
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-slate-400 mb-1 block">Topic</label>
              <input
                type="text"
                value=${form.topic}
                onInput=${(e) =>
                  setForm((f) => ({
                    ...f,
                    topic: e.target.value,
                  }))}
                placeholder="e.g. dynamic-programming"
                class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
            <div>
              <label class="text-xs text-slate-400 mb-1 block">Type</label>
              <select
                value=${form.type}
                onChange=${(e) =>
                  setForm((f) => ({
                    ...f,
                    type: e.target.value,
                  }))}
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
              onInput=${(e) =>
                setForm((f) => ({
                  ...f,
                  content: e.target.value,
                }))}
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
              onInput=${(e) =>
                setForm((f) => ({
                  ...f,
                  tags: e.target.value,
                }))}
              placeholder="arrays, recursion, two-pointers"
              class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <button
            type="submit"
            class="self-start px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-200 text-xs rounded-lg transition-colors"
          >
            Save Insight
          </button>
        </form>
      `}
      ${loading
        ? html`<p class="text-xs text-slate-500 py-4">Loading...</p>`
        : insights.length === 0
          ? html`<p class="text-xs text-slate-500 py-4">
              No insights yet. The AI will add insights here as you chat and solve problems.
            </p>`
          : Object.entries(byTopic).map(
              ([topic, items]) => html`
                <div key=${topic} class="p-4 bg-white/3 border border-white/8 rounded-xl">
                  <h4 class="text-xs font-medium text-cyan-400 uppercase tracking-widest mb-3">
                    ${topic}
                  </h4>
                  <div class="flex flex-col gap-2">
                    ${items.map(
                      (item) => html`
                        <div
                          key=${item.id}
                          class="flex items-start gap-3 p-3 bg-white/5 border border-white/8 rounded-lg group"
                        >
                          <div class="flex-1 min-w-0">
                            <p class="text-xs text-slate-300 leading-relaxed">${item.content}</p>
                            ${item.tags?.length > 0 &&
                            html`
                              <div class="flex flex-wrap gap-1 mt-1.5">
                                ${item.tags.map(
                                  (tag) => html`
                                    <span
                                      key=${tag}
                                      class="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-slate-500 text-xs"
                                      >${tag}</span
                                    >
                                  `,
                                )}
                              </div>
                            `}
                          </div>
                          <button
                            onClick=${() => handleDelete(item.id)}
                            class="text-slate-600 hover:text-rose-400 text-xs opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                            title="Delete"
                          >
                            ✕
                          </button>
                        </div>
                      `,
                    )}
                  </div>
                </div>
              `,
            )}
    </div>
  `;
}

// ── Roadmap section ───────────────────────────────────────────────────────────

const DIFFICULTY_COLORS = {
  Easy: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  Medium: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  Hard: "text-rose-400 bg-rose-500/10 border-rose-500/20",
};

function calcProgress(milestone, problems) {
  if (!Array.isArray(problems) || !problems.length) return 0;
  const targets = new Set([
    (milestone.topic || "").toLowerCase(),
    ...(milestone.subtopics || []).map((s) => s.toLowerCase()),
  ]);
  const matched = problems.filter((p) => {
    const pTags = (p.tags || []).map((t) => String(t).toLowerCase());
    const pTopic = String(p.topic || "").toLowerCase();
    return pTags.some((t) => targets.has(t)) || targets.has(pTopic);
  });
  return matched.length;
}

function MilestoneCard({ milestone, problems, onNavigate }) {
  const solved = calcProgress(milestone, problems);
  const target = milestone.targetCount || 5;
  const pct = Math.min(100, Math.round((solved / target) * 100));
  const done = solved >= target;
  const diffClass = DIFFICULTY_COLORS[milestone.difficulty] || DIFFICULTY_COLORS.Medium;

  return html`
    <div
      class="p-4 bg-white/3 border ${done ? "border-emerald-500/30" : "border-white/8"} rounded-xl"
    >
      <div class="flex items-start justify-between gap-3 mb-2">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            ${done
              ? html`<span class="text-emerald-400 text-sm">✓</span>`
              : html`<span
                  class="w-4 h-4 rounded-full border border-white/20 inline-block flex-shrink-0"
                ></span>`}
            <span class="text-sm font-medium text-slate-200">${milestone.topic}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded border ${diffClass}"
              >${milestone.difficulty || "Medium"}</span
            >
            ${milestone.week
              ? html`<span class="text-[10px] text-slate-600">Week ${milestone.week}</span>`
              : ""}
          </div>
          ${milestone.description
            ? html`<p class="text-xs text-slate-500 ml-6">${milestone.description}</p>`
            : ""}
        </div>
        <span class="text-xs text-slate-400 flex-shrink-0">${solved}/${target}</span>
      </div>
      <div class="h-1.5 rounded-full bg-white/8 overflow-hidden mb-2">
        <div
          class="h-full rounded-full transition-all duration-500 ${done
            ? "bg-emerald-500"
            : "bg-cyan-500"}"
          style="width: ${pct}%"
        ></div>
      </div>
      ${Array.isArray(milestone.subtopics) && milestone.subtopics.length
        ? html`
            <div class="flex flex-wrap gap-1 mt-1">
              ${milestone.subtopics.map(
                (s) => html`
                  <span
                    key=${s}
                    class="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-slate-500 text-[10px]"
                    >${s}</span
                  >
                `,
              )}
            </div>
          `
        : ""}
    </div>
  `;
}

function RoadmapSection({ problems, onNavigate }) {
  const [roadmaps, setRoadmaps] = useState([]);
  const [active, setActive] = useState(null); // active roadmap id
  const [screen, setScreen] = useState("list"); // list | wizard | generating
  const [form, setForm] = useState({
    level: "intermediate",
    goal: "",
    timeframe: "1 month",
    topics: "",
  });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    Storage.getRoadmaps()
      .then((list) => {
        setRoadmaps(list || []);
        if (list?.length) setActive(list[list.length - 1].id);
      })
      .catch((e) => dbg.error("RoadmapSection load:", e?.message));
  }, []);

  const currentRoadmap = roadmaps.find((r) => r.id === active) || null;

  const handleGenerate = async () => {
    if (!form.goal.trim()) {
      setMsg("Please describe your goal.");
      return;
    }
    setScreen("generating");
    setMsg("");
    try {
      const resp = await new Promise((resolve, reject) => {
        if (typeof chrome === "undefined" || !chrome.runtime?.id) {
          reject(new Error("Extension not available"));
          return;
        }
        chrome.runtime.sendMessage({ type: "GENERATE_ROADMAP", ...form }, (r) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r);
        });
      });
      if (!resp?.ok) throw new Error(resp?.error || "Generation failed");
      const roadmap = {
        id: `rm-${Date.now()}`,
        createdAt: Date.now(),
        level: form.level,
        goal: form.goal,
        timeframe: form.timeframe,
        topics: form.topics,
        ...resp.roadmap,
      };
      await Storage.saveRoadmap(roadmap);
      const updated = await Storage.getRoadmaps();
      setRoadmaps(updated);
      setActive(roadmap.id);
      setScreen("list");
      setForm({
        level: "intermediate",
        goal: "",
        timeframe: "1 month",
        topics: "",
      });
    } catch (e) {
      setMsg("Failed: " + (e?.message || String(e)));
      setScreen("wizard");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this roadmap?")) return;
    await Storage.deleteRoadmap(id);
    const updated = await Storage.getRoadmaps();
    setRoadmaps(updated);
    setActive(updated.length ? updated[updated.length - 1].id : null);
  };

  const totalMilestones = currentRoadmap?.milestones?.length || 0;
  const completedMilestones =
    currentRoadmap?.milestones?.filter((m) => calcProgress(m, problems) >= (m.targetCount || 5))
      .length || 0;

  if (screen === "generating")
    return html`
      <div class="flex flex-col items-center justify-center py-16 gap-4">
        <div
          class="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"
        ></div>
        <p class="text-sm text-slate-400">AI is building your roadmap…</p>
        ${msg && html`<p class="text-xs text-rose-400">${msg}</p>`}
      </div>
    `;

  if (screen === "wizard")
    return html`
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-2">
          <button
            onClick=${() => setScreen("list")}
            class="text-slate-500 hover:text-slate-300 text-xs transition-colors"
          >
            ← Back
          </button>
          <h3 class="text-sm font-medium text-slate-200">Create Roadmap with AI</h3>
        </div>
        ${msg && html`<p class="text-xs text-rose-400">${msg}</p>`}
        <div class="flex flex-col gap-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-slate-400 mb-1 block">Current Level</label>
              <select
                value=${form.level}
                onChange=${(e) => setForm((f) => ({ ...f, level: e.target.value }))}
                class="w-full bg-[#0a0a0f] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/50"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-slate-400 mb-1 block">Timeframe</label>
              <select
                value=${form.timeframe}
                onChange=${(e) => setForm((f) => ({ ...f, timeframe: e.target.value }))}
                class="w-full bg-[#0a0a0f] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/50"
              >
                <option value="2 weeks">2 Weeks</option>
                <option value="1 month">1 Month</option>
                <option value="3 months">3 Months</option>
                <option value="6 months">6 Months</option>
              </select>
            </div>
          </div>
          <div>
            <label class="text-xs text-slate-400 mb-1 block">Goal *</label>
            <input
              type="text"
              value=${form.goal}
              onInput=${(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
              placeholder="e.g. Crack FAANG interviews, master DP, prepare for competitive programming…"
              class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <div>
            <label class="text-xs text-slate-400 mb-1 block">Focus Topics (optional)</label>
            <input
              type="text"
              value=${form.topics}
              onInput=${(e) => setForm((f) => ({ ...f, topics: e.target.value }))}
              placeholder="e.g. graphs, dynamic programming, trees"
              class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <button
            onClick=${handleGenerate}
            class="self-start px-5 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-sm rounded-xl transition-colors"
          >
            Generate Roadmap →
          </button>
        </div>
      </div>
    `;

  // list / viewing screen
  return html`
    <div class="flex flex-col gap-4">
      <!-- Header row -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          ${roadmaps.length > 1
            ? html`
                <select
                  value=${active || ""}
                  onChange=${(e) => setActive(e.target.value)}
                  class="bg-[#0a0a0f] border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                >
                  ${roadmaps.map(
                    (r) => html`<option key=${r.id} value=${r.id}>${r.title || "Roadmap"}</option>`,
                  )}
                </select>
              `
            : currentRoadmap
              ? html`<span class="text-sm font-medium text-slate-200"
                  >${currentRoadmap.title}</span
                >`
              : html`<span class="text-sm text-slate-500">No roadmap yet</span>`}
        </div>
        <div class="flex items-center gap-2">
          ${currentRoadmap && onNavigate
            ? html`<button
                onClick=${() => onNavigate("graph")}
                class="text-xs text-slate-500 hover:text-cyan-400 transition-colors"
                title="View in graph"
              >
                View in Graph →
              </button>`
            : ""}
          ${currentRoadmap
            ? html`<button
                onClick=${() => handleDelete(currentRoadmap.id)}
                class="text-xs text-slate-600 hover:text-rose-400 transition-colors"
                title="Delete roadmap"
              >
                Delete
              </button>`
            : ""}
          <button
            onClick=${() => setScreen("wizard")}
            class="px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors"
          >
            + New Roadmap
          </button>
        </div>
      </div>

      ${currentRoadmap
        ? html`
            <!-- Progress summary -->
            <div class="p-3 bg-white/3 border border-white/8 rounded-xl flex items-center gap-4">
              <div class="flex-1">
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-xs text-slate-400"
                    >${completedMilestones}/${totalMilestones} milestones completed</span
                  >
                  <span class="text-xs text-slate-500">${currentRoadmap.goal}</span>
                </div>
                <div class="h-1.5 rounded-full bg-white/8 overflow-hidden">
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500"
                    style="width: ${totalMilestones
                      ? Math.round((completedMilestones / totalMilestones) * 100)
                      : 0}%"
                  ></div>
                </div>
              </div>
            </div>
            <!-- Milestones -->
            <div class="flex flex-col gap-3">
              ${(currentRoadmap.milestones || []).map(
                (m, i) => html`
                  <${MilestoneCard}
                    key=${m.id || i}
                    milestone=${m}
                    problems=${problems}
                    onNavigate=${onNavigate}
                  />
                `,
              )}
            </div>
          `
        : html`
            <div class="p-8 bg-white/3 border border-white/8 rounded-xl text-center">
              <p class="text-2xl mb-3">🗺️</p>
              <p class="text-sm font-medium text-slate-300 mb-1">No roadmap yet</p>
              <p class="text-xs text-slate-500 max-w-sm mx-auto">
                Create an AI-powered study roadmap tailored to your goals. Progress auto-updates as
                you solve problems.
              </p>
            </div>
          `}
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
  const [form, setForm] = useState({
    id: "",
    name: "",
    description: "",
    trigger: "always",
    system_prompt_modifier: "",
  });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const all = await getAllSkills();
      setSkills(all);
    } catch (e) {
      dbg.error("SkillsSection load:", e?.message);
    }
  };

  const isBuiltin = (id) => BUILTIN_SKILLS.some((s) => s.id === id);

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
      setForm({
        id: "",
        name: "",
        description: "",
        trigger: "always",
        system_prompt_modifier: "",
      });
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

  const userSkills = skills.filter((s) => !isBuiltin(s.id));

  return html`
    <div class="flex flex-col gap-4">
      ${msg &&
      html`<p class="text-xs ${msg.startsWith("Failed") ? "text-rose-400" : "text-emerald-400"}">
        ${msg}
      </p>`}

      <!-- Built-in skills -->
      <div class="p-4 bg-white/3 border border-white/8 rounded-xl">
        <button
          onClick=${() => setShowBuiltin((v) => !v)}
          class="flex items-center justify-between w-full text-left"
        >
          <span class="text-xs font-medium text-slate-300"
            >Built-in Skills (${BUILTIN_SKILLS.length})</span
          >
          <span class="text-slate-500 text-xs">${showBuiltin ? "▲" : "▼"}</span>
        </button>
        ${showBuiltin &&
        html`
          <div class="flex flex-col gap-2 mt-3">
            ${BUILTIN_SKILLS.map(
              (skill) => html`
                <div key=${skill.id} class="p-3 bg-white/5 border border-white/8 rounded-lg">
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <p class="text-xs font-medium text-white">${skill.name}</p>
                      <p class="text-xs text-slate-500 mt-0.5">${skill.description}</p>
                    </div>
                    <span
                      class="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs rounded flex-shrink-0"
                      >${skill.trigger}</span
                    >
                  </div>
                </div>
              `,
            )}
          </div>
        `}
      </div>

      <!-- User-defined skills -->
      <div class="flex items-center justify-between">
        <p class="text-sm text-slate-400">
          ${userSkills.length} custom skill${userSkills.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick=${() => setAddForm((v) => !v)}
          class="px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors"
        >
          ${addForm ? "Cancel" : "+ New Skill"}
        </button>
      </div>

      ${addForm &&
      html`
        <form
          onSubmit=${handleSave}
          class="p-4 bg-white/5 border border-white/10 rounded-xl flex flex-col gap-3"
        >
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-slate-400 mb-1 block">Skill ID (unique)</label>
              <input
                type="text"
                value=${form.id}
                onInput=${(e) =>
                  setForm((f) => ({
                    ...f,
                    id: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                  }))}
                placeholder="e.g. my-skill"
                class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
            <div>
              <label class="text-xs text-slate-400 mb-1 block">Display Name</label>
              <input
                type="text"
                value=${form.name}
                onInput=${(e) =>
                  setForm((f) => ({
                    ...f,
                    name: e.target.value,
                  }))}
                placeholder="e.g. My Custom Skill"
                class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>
          <div>
            <label class="text-xs text-slate-400 mb-1 block">Trigger</label>
            <select
              value=${form.trigger}
              onChange=${(e) =>
                setForm((f) => ({
                  ...f,
                  trigger: e.target.value,
                }))}
              class="w-full bg-[#0a0a0f] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/50"
            >
              ${SKILL_TRIGGER_OPTIONS.map(
                (opt) => html` <option key=${opt.value} value=${opt.value}>${opt.label}</option> `,
              )}
            </select>
          </div>
          <div>
            <label class="text-xs text-slate-400 mb-1 block">Description (optional)</label>
            <input
              type="text"
              value=${form.description}
              onInput=${(e) =>
                setForm((f) => ({
                  ...f,
                  description: e.target.value,
                }))}
              placeholder="Short description of what this skill does"
              class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <div>
            <label class="text-xs text-slate-400 mb-1 block">System Prompt Modifier</label>
            <textarea
              value=${form.system_prompt_modifier}
              onInput=${(e) =>
                setForm((f) => ({
                  ...f,
                  system_prompt_modifier: e.target.value,
                }))}
              rows="4"
              placeholder="Instructions added to the AI's system prompt when this skill is active. E.g. 'Respond only in Python examples.'"
              class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 resize-none"
            />
          </div>
          <button
            type="submit"
            class="self-start px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-200 text-xs rounded-lg transition-colors"
          >
            Save Skill
          </button>
        </form>
      `}
      ${userSkills.length === 0 && !addForm
        ? html`
            <div class="p-6 bg-white/3 border border-white/8 rounded-xl text-center">
              <p class="text-sm text-slate-500 mb-1">No custom skills yet.</p>
              <p class="text-xs text-slate-600">
                Create skills to modify how the AI behaves in specific situations — like a Socratic
                tutor, a strict time-complexity reviewer, or a language-specific expert.
              </p>
            </div>
          `
        : html`
            <div class="flex flex-col gap-2">
              ${userSkills.map(
                (skill) => html`
                  <div
                    key=${skill.id}
                    class="p-3 bg-white/5 border border-white/8 rounded-lg group"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                          <p class="text-xs font-medium text-white">${skill.name}</p>
                          <span
                            class="px-1.5 py-0.5 bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs rounded"
                            >${skill.trigger}</span
                          >
                        </div>
                        ${skill.description &&
                        html`<p class="text-xs text-slate-500">${skill.description}</p>`}
                        <p class="text-xs text-slate-400 mt-1.5 leading-relaxed line-clamp-2">
                          ${skill.system_prompt_modifier}
                        </p>
                      </div>
                      <button
                        onClick=${() => handleDelete(skill.id)}
                        class="text-slate-600 hover:text-rose-400 text-xs opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 mt-0.5"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                `,
              )}
            </div>
          `}
    </div>
  `;
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function BehaviourBankView({ problems = [], onNavigate }) {
  const [tab, setTab] = useState("insights");

  return html`
    <div class="flex flex-col gap-6 w-full max-w-3xl mx-auto">
      <!-- Header -->
      <div>
        <h1 class="text-2xl font-light text-white mb-1">Behaviour Bank</h1>
        <p class="text-sm text-slate-400">
          Persistent AI memory — insights, roadmap, and custom skills that shape how the AI assists
          you.
        </p>
      </div>

      <!-- Tab switcher -->
      <div class="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl w-fit">
        ${TABS.map(
          (t) => html`
            <button
              key=${t.id}
              onClick=${() => setTab(t.id)}
              class="px-4 py-1.5 rounded-lg text-xs transition-colors ${tab === t.id
                ? "bg-cyan-600/30 border border-cyan-500/30 text-cyan-300"
                : "text-slate-400 hover:text-slate-200"}"
            >
              ${t.label}
            </button>
          `,
        )}
      </div>

      <!-- Content -->
      ${tab === "insights" && html`<${InsightsSection} />`}
      ${tab === "roadmap" &&
      html`<${RoadmapSection} problems=${problems} onNavigate=${onNavigate} />`}
      ${tab === "skills" && html`<${SkillsSection} />`}
    </div>
  `;
}
