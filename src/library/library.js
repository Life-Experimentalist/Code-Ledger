/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, render } from "../vendor/preact-bundle.js";
import { useState, useEffect } from "../vendor/preact-bundle.js";
import { htm } from "../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../core/storage.js";
import { getQueryParam, updateQueryParams } from "../core/url-state.js";
import { initializeHandlers } from "../handlers/init.js";
import { ProblemsView } from "./views/ProblemsView.js";
import { AnalyticsView } from "./views/AnalyticsView.js";
import { GraphView } from "./views/GraphView.js";
import { SettingsView } from "./views/SettingsView.js";

initializeHandlers();

function LibraryApp() {
  const [problems, setProblems] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("archive");
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([Storage.getAllProblems(), Storage.getSettings()])
      .then(([p, s]) => {
        if (!mounted) return;
        setProblems(p || []);
        setSettings(s || {});
      })
      .finally(() => mounted && setLoading(false));
    return () => (mounted = false);
  }, []);

  useEffect(() => {
    const tab = getQueryParam("tab", "");
    const q = getQueryParam("q", "");
    const allowed = new Set([
      "archive",
      "analytics",
      "graph",
      "settings",
      "search",
    ]);
    if (allowed.has(tab)) setActiveTab(tab);
    if (q) setSearchQuery(q);
  }, []);

  useEffect(() => {
    updateQueryParams({
      tab: activeTab,
      q: activeTab === "search" && searchQuery ? searchQuery : null,
    });
  }, [activeTab, searchQuery]);

  const navItems = [
    { id: "archive", label: "Archive", icon: "📚" },
    { id: "analytics", label: "Analytics", icon: "📈" },
    { id: "graph", label: "Graph", icon: "🔗" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ];

  const handleSettingsChange = async (key, value) => {
    const next = { ...(settings || {}), [key]: value };
    setSettings(next);
    try {
      await Storage.setSettings(next);
    } catch (e) {
      // noop
    }
  };

  const renderActiveView = () => {
    if (loading)
      return html`<p
        class="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold p-8"
      >
        Loading workspace...
      </p>`;

    if (activeTab === "search")
      return html`<${ProblemsView}
        problems=${problems}
        searchQuery=${searchQuery}
      />`;

    if (activeTab === "archive")
      return html`<${ProblemsView} problems=${problems} />`;
    if (activeTab === "analytics")
      return html`<${AnalyticsView} problems=${problems} />`;
    if (activeTab === "graph")
      return html`<${GraphView} problems=${problems} />`;
    if (activeTab === "settings")
      return html`<${SettingsView}
        settings=${settings}
        onSettingsChange=${handleSettingsChange}
      />`;

    return html`<p class="text-slate-400">Unknown view</p>`;
  };

  return html`
    <div class="flex flex-col h-full w-full bg-[#050508]">
      <header
        class="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#0a0a0f] shrink-0"
      >
        <div class="flex items-center gap-3">
          <button
            onClick=${() => setSidebarCollapsed(!sidebarCollapsed)}
            class="p-2 rounded hover:bg-white/5"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 6H20"
                stroke="#94a3b8"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M4 12H20"
                stroke="#94a3b8"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M4 18H14"
                stroke="#94a3b8"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <img
            src="../assets/images/icon-dark-bg.png"
            class="w-8 h-8 object-contain drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]"
            alt="CL Logo"
          />
          <h1 class="text-lg font-semibold tracking-tight">
            CodeLedger <span class="text-cyan-400">Library</span>
          </h1>
        </div>

        <div class="flex items-center gap-6">
          <div class="flex items-center gap-2">
            <div
              class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
            ></div>
            <span
              class="text-xs font-mono uppercase tracking-widest text-emerald-500/80"
              >Worker: Active</span
            >
          </div>
          <div class="h-4 w-px bg-white/10"></div>
          <div class="flex items-center gap-3">
            <a
              class="text-xs text-slate-400 hover:text-cyan-400"
              href="/api/auth/github"
              >Connect</a
            >
          </div>
        </div>
      </header>

      <main class="flex-1 flex overflow-hidden">
        <aside
          style=${{ width: sidebarCollapsed ? "72px" : "260px" }}
          class="border-r border-white/5 bg-[#07070b] flex flex-col p-3 shrink-0 transition-all"
        >
          <div class="mb-4">
            <p
              class="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold mb-3 px-2"
            >
              Views
            </p>
            <nav class="space-y-1">
              ${navItems.map(
                (item) => html`
                  <a
                    href="#"
                    onClick=${(e) => {
                      e.preventDefault();
                      setActiveTab(item.id);
                    }}
                    class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${activeTab ===
                    item.id
                      ? "bg-cyan-500/5 text-cyan-400 border border-cyan-500/20"
                      : "hover:bg-white/5 text-slate-400 border border-transparent"}"
                  >
                    <span class="text-sm font-medium w-6 text-center"
                      >${item.icon}</span
                    >
                    ${!sidebarCollapsed
                      ? html`<span class="text-sm font-medium"
                          >${item.label}</span
                        >`
                      : ""}
                  </a>
                `,
              )}
            </nav>
          </div>

          <div class="mt-auto">
            <div
              class="p-3 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/5"
            >
              ${!sidebarCollapsed
                ? html`
                    <div class="flex items-center justify-between mb-2">
                      <span
                        class="text-[10px] uppercase tracking-wider text-slate-500"
                        >Database Size</span
                      >
                      <span class="text-[10px] font-mono text-cyan-400"
                        >${problems.length} items</span
                      >
                    </div>
                    <div
                      class="w-full h-1 bg-white/10 rounded-full overflow-hidden mb-2"
                    >
                      <div
                        class="h-full bg-cyan-500"
                        style=${{
                          width: `${Math.min(100, Math.max(5, (problems.length / 200) * 100))}%`,
                        }}
                      ></div>
                    </div>
                    <p
                      class="mt-2 text-[10px] text-slate-600 italic leading-tight"
                    >
                      Local IndexedDB Vault
                    </p>
                  `
                : html`<div class="text-center text-[10px] text-slate-400">
                    ${problems.length}
                  </div>`}
            </div>
          </div>
        </aside>

        <div class="flex-1 bg-[#050508] p-6 overflow-y-auto">
          ${renderActiveView()}
        </div>
      </main>
    </div>
  `;
}

render(html`<${LibraryApp} />`, document.getElementById("root"));
