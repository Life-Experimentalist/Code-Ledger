/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import { useState, useMemo, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { ProblemCard } from "../../ui/components/ProblemCard.js";
import { ProblemModal } from "../components/ProblemModal.js";
import { getQueryParam, updateQueryParams } from "../../core/url-state.js";
import { Storage } from "../../core/storage.js";

const PLATFORMS = [
  {
    id: "leetcode",
    name: "LeetCode",
    url: "https://leetcode.com/problemset/",
    profileUrl: (s) => s?.leetcode_username ? `https://leetcode.com/u/${s.leetcode_username}/` : null,
    progressUrl: () => "https://leetcode.com/progress",
    color: "#FFA116",
    bg: "rgba(255,161,22,0.08)",
    border: "rgba(255,161,22,0.25)",
    favicon: "https://assets.leetcode.com/static_assets/public/icons/favicon.ico",
  },
  {
    id: "geeksforgeeks",
    name: "GeeksForGeeks",
    url: "https://practice.geeksforgeeks.org/explore",
    profileUrl: (s) => s?.gfg_username ? `https://auth.geeksforgeeks.org/user/${s.gfg_username}/` : null,
    color: "#2F8D46",
    bg: "rgba(47,141,70,0.08)",
    border: "rgba(47,141,70,0.25)",
    favicon: "https://www.geeksforgeeks.org/favicon.ico",
  },
  {
    id: "codeforces",
    name: "Codeforces",
    url: "https://codeforces.com/problemset",
    profileUrl: (s) => s?.cf_username ? `https://codeforces.com/profile/${s.cf_username}` : null,
    color: "#1F8ACB",
    bg: "rgba(31,138,203,0.08)",
    border: "rgba(31,138,203,0.25)",
    favicon: "https://codeforces.com/favicon.ico",
  },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "diff-asc", label: "Easy → Hard" },
  { value: "diff-desc", label: "Hard → Easy" },
  { value: "title", label: "Title A-Z" },
  { value: "platform", label: "Platform A-Z" },
  { value: "tags", label: "Most Tags" },
];
const DIFF_ORDER = { Easy: 0, Medium: 1, Hard: 2, Unknown: 3 };

export function ProblemsView({ problems, searchQuery, onProblemUpdate, onProblemDelete, settings, onOpenGraphProblem, onNavigate }) {
  const [filterDifficulty, setFilterDifficulty] = useState(getQueryParam("difficulty", "All"));
  const [filterPlatform, setFilterPlatform] = useState(getQueryParam("platform", "All"));
  const [filterLanguage, setFilterLanguage] = useState(getQueryParam("language", "All"));
  const [filterTag, setFilterTag] = useState(getQueryParam("tag", "All"));
  const [filterOverview, setFilterOverview] = useState("All");
  const [query, setQuery] = useState(searchQuery || getQueryParam("q", ""));
  const [sortBy, setSortBy] = useState(getQueryParam("sort", "newest"));
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [queueStats, setQueueStats] = useState(null);
  const [reviewQueueBusy, setReviewQueueBusy] = useState(false);
  const [reviewQueueMsg, setReviewQueueMsg] = useState("");

  const isExtension = typeof chrome !== "undefined" && !!chrome.runtime?.id;

  const fetchQueueStats = () => {
    if (!isExtension) return;
    chrome.runtime.sendMessage({ type: "GET_QUEUE_STATS" }, (resp) => {
      if (chrome.runtime.lastError || !resp?.ok) return;
      setQueueStats(resp);
    });
  };

  useEffect(() => {
    fetchQueueStats();
    const id = setInterval(fetchQueueStats, 10000);
    return () => clearInterval(id);
  }, []);

  const handleQueueAllReviews = async () => {
    if (!isExtension || reviewQueueBusy) return;
    setReviewQueueBusy(true);
    setReviewQueueMsg("");
    chrome.runtime.sendMessage({ type: "QUEUE_ALL_AI_REVIEWS" }, (resp) => {
      setReviewQueueBusy(false);
      if (chrome.runtime.lastError || !resp?.ok) {
        setReviewQueueMsg("Failed to queue reviews.");
      } else {
        setReviewQueueMsg(`Queued ${resp.queued} problem(s) for AI review.`);
        fetchQueueStats();
      }
      setTimeout(() => setReviewQueueMsg(""), 5000);
    });
  };

  const getProblemKey = (p) => String(p?.id || p?.titleSlug || "");

  const handleProblemUpdate = (updated) => {
    setSelectedProblem(updated);
    if (onProblemUpdate) onProblemUpdate(updated);
  };

  const handleProblemDelete = (id) => {
    setSelectedProblem(null);
    if (onProblemDelete) onProblemDelete(id);
  };

  // Restore problem from URL param on mount
  useEffect(() => {
    const problemId = getQueryParam("problem");
    if (problemId && problems.length > 0) {
      const found = problems.find(p => (p.id === problemId || p.titleSlug === problemId));
      if (found) setSelectedProblem(found);
    }
  }, [problems.length]);

  const handleSelectProblem = (problem) => {
    setSelectedProblem(problem);
    updateQueryParams({ problem: problem.id || problem.titleSlug });
  };

  const handleCloseModal = () => {
    setSelectedProblem(null);
    updateQueryParams({ problem: null });
  };

  useEffect(() => { setQuery(searchQuery || ""); }, [searchQuery]);

  useEffect(() => {
    if (!selectedIds.size) return;
    const existing = new Set((problems || []).map((p) => getProblemKey(p)).filter(Boolean));
    setSelectedIds((prev) => {
      const next = new Set();
      prev.forEach((id) => { if (existing.has(id)) next.add(id); });
      return next;
    });
  }, [problems]);

  useEffect(() => {
    updateQueryParams({
      difficulty: filterDifficulty !== "All" ? filterDifficulty : null,
      platform: filterPlatform !== "All" ? filterPlatform : null,
      language: filterLanguage !== "All" ? filterLanguage : null,
      tag: filterTag !== "All" ? filterTag : null,
      sort: sortBy !== "newest" ? sortBy : null,
    });
  }, [filterDifficulty, filterPlatform, filterLanguage, filterTag, sortBy]);

  function tokenizeSearch(value) {
    const raw = String(value || "").trim();
    if (!raw) return [];
    const tokens = [];
    raw.replace(/"([^"]+)"|(\S+)/g, (_match, quoted, bare) => {
      tokens.push((quoted || bare || "").trim());
      return "";
    });
    return tokens;
  }

  function buildSearchSpec(value) {
    const spec = { tags: [], platforms: [], difficulties: [], free: [] };
    for (const token of tokenizeSearch(value).map((t) => t.toLowerCase())) {
      if (token.startsWith("tag:")) spec.tags.push(token.slice(4));
      else if (token.startsWith("topic:")) spec.tags.push(token.slice(6));
      else if (token.startsWith("platform:")) spec.platforms.push(token.slice(9));
      else if (token.startsWith("difficulty:")) spec.difficulties.push(token.slice(11));
      else spec.free.push(token);
    }
    return spec;
  }

  const platformCounts = useMemo(() => {
    const counts = {};
    (problems || []).forEach((p) => { counts[p.platform] = (counts[p.platform] || 0) + 1; });
    return counts;
  }, [problems]);

  const languageOptions = useMemo(() => {
    const set = new Set();
    (problems || []).forEach((p) => {
      const lang = p.lang?.name || p.language;
      if (lang) set.add(lang);
    });
    return ["All", ...Array.from(set).sort((a, b) => String(a).localeCompare(String(b)))];
  }, [problems]);

  const tagOptions = useMemo(() => {
    const set = new Set();
    (problems || []).forEach((p) => {
      (p.tags || []).forEach((t) => t && set.add(t));
      if (p.topic) set.add(p.topic);
    });
    return ["All", ...Array.from(set).sort((a, b) => String(a).localeCompare(String(b)))];
  }, [problems]);

  const filtered = useMemo(() => {
    let out = problems || [];
    if (filterDifficulty !== "All") out = out.filter((p) => p.difficulty === filterDifficulty);
    if (filterPlatform !== "All") out = out.filter((p) => p.platform === filterPlatform);
    if (filterLanguage !== "All") out = out.filter((p) => (p.lang?.name || p.language || "") === filterLanguage);
    if (filterTag !== "All") out = out.filter((p) => (p.tags || []).includes(filterTag) || p.topic === filterTag);
    if (filterOverview === "Missing") out = out.filter((p) => !p.problemStatement);
    if (filterOverview === "Present") out = out.filter((p) => !!p.problemStatement);
    if (query && String(query).trim()) {
      const structured = buildSearchSpec(query);

      out = out.filter((p) => {
        const title = String(p.title || "").toLowerCase();
        const platform = String(p.platform || "").toLowerCase();
        const tags = Array.isArray(p.tags) ? p.tags.map((t) => String(t || "").toLowerCase()) : [];
        const topic = String(p.topic || "").toLowerCase();
        const lang = String(p.lang?.name || p.language || "").toLowerCase();
        const review = String(p.aiReview || "").toLowerCase();
        const code = String(p.code || "").toLowerCase();
        const statement = String(p.problemStatement || p.description || "").toLowerCase();
        const hints = Array.isArray(p.hints) ? p.hints.join(" ").toLowerCase() : "";
        const similar = Array.isArray(p.similar) ? p.similar.map((s) => s?.title || s?.titleSlug || "").join(" ").toLowerCase() : "";
        const haystack = `${title} ${platform} ${topic} ${tags.join(" ")} ${lang} ${review} ${code} ${statement} ${hints} ${similar}`;

        if (structured.platforms.length && !structured.platforms.every((needle) => platform.includes(needle))) return false;
        if (structured.difficulties.length && !structured.difficulties.every((needle) => String(p.difficulty || "").toLowerCase() === needle)) return false;
        if (structured.tags.length && !structured.tags.every((tag) => tags.some((t) => t.includes(tag)) || topic.includes(tag))) return false;
        if (structured.free.length && !structured.free.every((term) => haystack.includes(term))) return false;
        return true;
      });
    }
    // Apply sort
    const arr = [...out];
    switch (sortBy) {
      case "newest": arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); break;
      case "oldest": arr.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)); break;
      case "diff-asc": arr.sort((a, b) => (DIFF_ORDER[a.difficulty] ?? 3) - (DIFF_ORDER[b.difficulty] ?? 3)); break;
      case "diff-desc": arr.sort((a, b) => (DIFF_ORDER[b.difficulty] ?? 3) - (DIFF_ORDER[a.difficulty] ?? 3)); break;
      case "title": arr.sort((a, b) => (a.title || "").localeCompare(b.title || "")); break;
      case "platform": arr.sort((a, b) => (a.platform || "").localeCompare(b.platform || "") || (a.title || "").localeCompare(b.title || "")); break;
      case "tags": arr.sort((a, b) => (b.tags?.length || 0) - (a.tags?.length || 0) || (a.title || "").localeCompare(b.title || "")); break;
    }
    return arr;
  }, [problems, filterDifficulty, filterPlatform, filterLanguage, filterTag, filterOverview, query, sortBy]);

  const buildRefreshUrl = (problem) => {
    if (!problem?.titleSlug) return null;
    if (problem.platform === "leetcode") {
      return `https://leetcode.com/problems/${problem.titleSlug}/?codeledger_fetch=1&cl_fetch_id=${encodeURIComponent(problem.titleSlug)}`;
    }
    if (problem.platform === "geeksforgeeks") {
      return `https://practice.geeksforgeeks.org/problems/${problem.titleSlug}?codeledger_fetch=1&cl_fetch_id=${encodeURIComponent(problem.titleSlug)}`;
    }
    if (problem.platform === "codeforces") {
      return `https://codeforces.com/problemset/problem/${problem.titleSlug}?codeledger_fetch=1&cl_fetch_id=${encodeURIComponent(problem.titleSlug)}`;
    }
    return null;
  };

  const refreshProblemData = (problem) => {
    const url = buildRefreshUrl(problem);
    if (!url) return;
    window.open(url, "_blank");
  };

  const refreshMissingFiltered = () => {
    const missing = filtered.filter((p) => !p.problemStatement).slice(0, 20);
    missing.forEach((p, idx) => {
      const url = buildRefreshUrl(p);
      if (!url) return;
      setTimeout(() => window.open(url, "_blank"), idx * 400);
    });
  };

  const toggleSelect = (problem) => {
    const key = getProblemKey(problem);
    if (!key) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkStatus("");
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filtered.map((p) => getProblemKey(p)).filter(Boolean)));
  };

  const selectedProblems = (problems || []).filter((p) => selectedIds.has(getProblemKey(p)));

  const bulkDeleteSelected = async () => {
    if (!selectedProblems.length || bulkBusy) return;
    if (!window.confirm(`Delete ${selectedProblems.length} selected problem(s)? This cannot be undone.`)) return;
    setBulkBusy(true);
    setBulkStatus("");
    try {
      for (const p of selectedProblems) {
        if (!p?.id) continue;
        await Storage.deleteProblem(p.id);
        onProblemDelete?.(p.id);
      }
      clearSelection();
      setBulkStatus(`Deleted ${selectedProblems.length} problem(s).`);
    } catch (e) {
      setBulkStatus(`Bulk delete failed: ${e.message || e}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkRetagSelected = async () => {
    if (!selectedProblems.length || bulkBusy) return;
    const newTags = bulkTagInput.split(",").map((t) => t.trim()).filter(Boolean);
    if (!newTags.length) {
      setBulkStatus("Enter at least one tag before applying.");
      return;
    }
    setBulkBusy(true);
    setBulkStatus("");
    try {
      for (const p of selectedProblems) {
        const updated = {
          ...p,
          tags: newTags,
          topic: newTags[0] || p.topic || "Untagged",
          manuallyEdited: true,
        };
        await Storage.saveProblem(updated);
        const slug = String(updated.titleSlug || updated.id || "").trim();
        const lang = updated.lang?.name || updated.lang?.slug || updated.lang?.ext || "";
        const normLang = String(lang).toLowerCase().replace(/\s+/g, "");
        const pendingKey = slug ? (normLang ? `${slug}::${normLang}` : slug) : "";
        if (pendingKey) await Storage.markPendingProblemKey(pendingKey).catch(() => { });
        onProblemUpdate?.(updated);
      }
      setBulkStatus(`Updated tags for ${selectedProblems.length} problem(s).`);
    } catch (e) {
      setBulkStatus(`Bulk tag update failed: ${e.message || e}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkExportSelected = () => {
    if (!selectedProblems.length) return;
    try {
      const payload = JSON.stringify(selectedProblems, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `codeledger-selected-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setBulkStatus(`Exported ${selectedProblems.length} problem(s).`);
    } catch (e) {
      setBulkStatus(`Bulk export failed: ${e.message || e}`);
    }
  };

  return html`
    <div class="flex flex-col gap-6 w-full">

      <!-- AI Review queue status banner -->
      ${isExtension && (queueStats?.pending > 0 || queueStats?.processing > 0 || reviewQueueMsg) ? html`
        <div class="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-xs">
          <div class="flex items-center gap-2 text-violet-300">
            ${(queueStats?.pending > 0 || queueStats?.processing > 0) ? html`
              <span class="inline-block w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse"></span>
              <span>AI reviews: ${queueStats?.processing || 0} processing · ${queueStats?.pending || 0} pending · ${queueStats?.failed || 0} failed</span>
            ` : ""}
            ${reviewQueueMsg ? html`<span class="text-emerald-400">${reviewQueueMsg}</span>` : ""}
          </div>
          <button
            onClick=${handleQueueAllReviews}
            disabled=${reviewQueueBusy}
            class="px-2.5 py-1 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-300 hover:bg-violet-500/30 transition-colors disabled:opacity-40"
          >${reviewQueueBusy ? "Queuing…" : "Re-queue all"}</button>
        </div>
      ` : isExtension ? html`
        <div class="flex items-center justify-between gap-3 px-4 py-2 rounded-xl bg-white/3 border border-white/5 text-xs">
          <span class="text-slate-500">
            ${(problems || []).filter(p => !p.aiReview).length} problems missing AI review
          </span>
          <button
            onClick=${handleQueueAllReviews}
            disabled=${reviewQueueBusy}
            class="px-2.5 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-40 text-[11px]"
          >${reviewQueueBusy ? "Queuing…" : "Generate all AI reviews"}</button>
        </div>
      ` : ""}

      <!-- Platform hub -->
      <div class="grid grid-cols-3 gap-4">
        ${PLATFORMS.map((plat) => {
    const count = platformCounts[plat.id] || 0;
    const active = filterPlatform === plat.id;
    return html`
            <div
              class="relative group flex flex-col items-center gap-3 p-5 rounded-2xl border cursor-pointer transition-all select-none"
              style=${{
        background: active ? plat.bg : "rgba(10,10,15,1)",
        borderColor: active ? plat.color : "rgba(255,255,255,0.05)",
        boxShadow: active ? `0 0 20px ${plat.bg}` : "none",
      }}
              onClick=${() => setFilterPlatform(active ? "All" : plat.id)}
            >
              <div
                class="w-12 h-12 rounded-xl flex items-center justify-center"
                style=${{ background: plat.bg, border: `1px solid ${plat.border}` }}
              >
                <img
                  src=${plat.favicon} alt=${plat.name} class="w-7 h-7 object-contain"
                  onError=${(e) => {
        e.target.style.display = "none";
        e.target.parentElement.innerHTML =
          `<span style="color:${plat.color};font-size:18px;font-weight:700">${plat.name.slice(0, 2)}</span>`;
      }}
                />
              </div>
              <div class="flex flex-col items-center gap-0.5">
                <span class="text-sm font-semibold" style=${{ color: active ? plat.color : "#94a3b8" }}>${plat.name}</span>
                <span class="text-[11px] text-slate-500">${count} solved</span>
              </div>
              <!-- Top-right action links: Practice + Profile -->
              <div class="absolute top-2 right-2 flex flex-col gap-1 items-end opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href=${plat.url} target="_blank" rel="noreferrer"
                  onClick=${(e) => e.stopPropagation()}
                  class="text-[10px] text-slate-400 hover:text-cyan-400 px-1.5 py-0.5 rounded bg-white/5 border border-white/10"
                >Practice ↗</a>
                ${plat.profileUrl?.(settings) ? html`
                  <a
                    href=${plat.profileUrl(settings)} target="_blank" rel="noreferrer"
                    onClick=${(e) => e.stopPropagation()}
                    class="text-[10px] text-slate-400 hover:text-cyan-400 px-1.5 py-0.5 rounded bg-white/5 border border-white/10"
                  >Profile ↗</a>
                ` : ""}
                ${plat.progressUrl ? html`
                  <a
                    href=${plat.progressUrl()} target="_blank" rel="noreferrer"
                    onClick=${(e) => e.stopPropagation()}
                    class="text-[10px] text-slate-400 hover:text-cyan-400 px-1.5 py-0.5 rounded bg-white/5 border border-white/10"
                  >Progress ↗</a>
                ` : ""}
              </div>
            </div>
          `;
  })}
      </div>

      <!-- Filter bar -->
      <div class="flex flex-col bg-[#0a0a0f] p-4 rounded-xl border border-white/5 gap-3">
        <div class="flex gap-2 flex-wrap">
          ${["All", "Easy", "Medium", "Hard"].map((d) => html`
            <button
              onClick=${() => setFilterDifficulty(d)}
              class="px-3 py-1 text-xs rounded transition-colors ${filterDifficulty === d
      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
      : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"}"
            >${d}</button>
          `)}
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <select
            value=${sortBy}
            onChange=${(e) => setSortBy(e.target.value)}
            class="px-2 py-1.5 bg-black border border-white/10 rounded text-xs text-slate-300"
          >
            ${SORT_OPTIONS.map(o => html`<option value=${o.value}>${o.label}</option>`)}
          </select>
          <input
            value=${query}
            placeholder="Search title, tag, or platform…"
            onInput=${(e) => setQuery(e.target.value)}
            class="px-3 py-1.5 bg-black border border-white/10 rounded text-sm text-white min-w-[220px]"
          />
          <select
            value=${filterLanguage}
            onChange=${(e) => setFilterLanguage(e.target.value)}
            class="px-2 py-1.5 bg-black border border-white/10 rounded text-xs text-slate-300"
          >
            ${languageOptions.map((o) => html`<option value=${o}>${o === "All" ? "All Languages" : o}</option>`)}
          </select>
          <select
            value=${filterTag}
            onChange=${(e) => setFilterTag(e.target.value)}
            class="px-2 py-1.5 bg-black border border-white/10 rounded text-xs text-slate-300"
          >
            ${tagOptions.map((o) => html`<option value=${o}>${o === "All" ? "All Tags" : o}</option>`)}
          </select>
          <select
            value=${filterOverview}
            onChange=${(e) => setFilterOverview(e.target.value)}
            class="px-2 py-1.5 bg-black border border-white/10 rounded text-xs text-slate-300"
          >
            <option value="All">All Overview</option>
            <option value="Missing">Missing Overview</option>
            <option value="Present">Has Overview</option>
          </select>
          ${query ? html`
            <button onClick=${() => setQuery("")} class="text-slate-500 hover:text-slate-300 text-xs px-2">✕</button>
          ` : ""}
        </div>
        <div class="flex items-center gap-2 justify-end flex-wrap">
          <button
            onClick=${refreshMissingFiltered}
            disabled=${!filtered.some((p) => !p.problemStatement)}
            class="text-[11px] px-2.5 py-1 rounded border border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
          >Refresh missing overviews</button>
          <button
            onClick=${() => {
      const next = !selectionMode;
      setSelectionMode(next);
      if (!next) clearSelection();
    }}
            class=${`text-[11px] px-2.5 py-1 rounded border transition-colors ${selectionMode
      ? "border-cyan-500/50 text-cyan-300 bg-cyan-500/10"
      : "border-white/15 text-slate-300 hover:bg-white/10"}`}
          >${selectionMode ? "Exit Select Mode" : "Select Mode"}</button>
        </div>
      </div>

      ${selectionMode ? html`
        <div class="flex flex-col gap-2 bg-[#0a0a0f] p-3 rounded-xl border border-cyan-500/20">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <span class="text-xs text-cyan-300">${selectedIds.size} selected</span>
            <div class="flex items-center gap-2 flex-wrap">
              <button onClick=${selectAllFiltered} class="text-[11px] px-2.5 py-1 rounded border border-white/15 text-slate-300 hover:bg-white/10">Select all filtered</button>
              <button onClick=${clearSelection} class="text-[11px] px-2.5 py-1 rounded border border-white/15 text-slate-300 hover:bg-white/10">Clear</button>
              <button onClick=${bulkExportSelected} disabled=${!selectedIds.size || bulkBusy} class="text-[11px] px-2.5 py-1 rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40">Export JSON</button>
              <button onClick=${bulkDeleteSelected} disabled=${!selectedIds.size || bulkBusy} class="text-[11px] px-2.5 py-1 rounded border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 disabled:opacity-40">Delete selected</button>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <input
              value=${bulkTagInput}
              onInput=${(e) => setBulkTagInput(e.target.value)}
              placeholder="Bulk tags (comma-separated)"
              class="px-3 py-1.5 bg-black border border-white/10 rounded text-xs text-white min-w-[260px]"
            />
            <button onClick=${bulkRetagSelected} disabled=${!selectedIds.size || bulkBusy} class="text-[11px] px-2.5 py-1 rounded border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40">Apply tags</button>
            ${bulkStatus ? html`<span class="text-[11px] text-slate-400">${bulkStatus}</span>` : ""}
          </div>
        </div>
      ` : ""}

      <!-- Results count -->
      <div class="flex items-center justify-between -mt-2">
        <p class="text-[10px] text-slate-600 uppercase tracking-wider">
          ${filtered.length} solution${filtered.length !== 1 ? "s" : ""}
          ${filterDifficulty !== "All" || filterPlatform !== "All" || filterLanguage !== "All" || filterTag !== "All" || filterOverview !== "All" || query ? " (filtered)" : ""}
          ${selectionMode ? ` · ${selectedIds.size} selected` : ""}
        </p>
        ${(filterDifficulty !== "All" || filterPlatform !== "All" || filterLanguage !== "All" || filterTag !== "All" || filterOverview !== "All" || query) ? html`
          <button
            onClick=${() => { setFilterDifficulty("All"); setFilterPlatform("All"); setFilterLanguage("All"); setFilterTag("All"); setFilterOverview("All"); setQuery(""); }}
            class="text-[10px] text-slate-500 hover:text-slate-300 underline"
          >Clear filters</button>
        ` : ""}
      </div>

      <!-- Cards grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        ${filtered.map((p) => html`
          <${ProblemCard}
            key=${p.id || p.titleSlug}
            problem=${p}
            onSelect=${selectionMode ? (() => toggleSelect(p)) : handleSelectProblem}
            onRefresh=${refreshProblemData}
            selectionMode=${selectionMode}
            selected=${selectedIds.has(getProblemKey(p))}
            onToggleSelect=${() => toggleSelect(p)}
          />
        `)}
        ${filtered.length === 0 ? html`
          <p class="col-span-full py-12 text-center text-slate-500 uppercase tracking-widest text-[10px]">
            No solutions found matching filters.
          </p>
        ` : ""}
      </div>

      <!-- Problem detail modal -->
      <${ProblemModal}
        problem=${selectedProblem}
        onClose=${handleCloseModal}
        onUpdate=${handleProblemUpdate}
        onDelete=${handleProblemDelete}
        problemList=${filtered}
        onNavigateProblem=${handleSelectProblem}
        onOpenGraphProblem=${onOpenGraphProblem}
        onNavigate=${onNavigate}
      />
    </div>
  `;
}
