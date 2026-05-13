/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, render } from "/vendor/preact-bundle.js";
import {
    useState,
    useEffect,
    useMemo,
    useCallback,
} from "/vendor/preact-bundle.js";
import { htm } from "/vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "/core/storage.js";
import { CONSTANTS } from "/core/constants.js";
import { initDebug, setDebug, createDebugger } from "/lib/debug.js";
const dbg = createDebugger("LibraryApp");
import {
    applyThemeFromStorage,
    setupThemeListener,
} from "/core/theme-engine.js";
import { getQueryParam, updateQueryParams } from "/core/url-state.js";
import { initializeHandlers } from "/handlers/init.js";
import { ProblemsView } from "./views/ProblemsView.js";
import { AnalyticsView } from "./views/AnalyticsView.js";
import { GraphView } from "./views/GraphView.js";
import { SettingsView } from "./views/SettingsView.js";
import { SettingsPageView } from "./views/SettingsPageView.js";
import { CanonicalView } from "./views/CanonicalView.js";
import { AIChatsView } from "./views/AIChatsView.js";
import { BehaviourBankView } from "./views/BehaviourBankView.js";
import { IncognitoBanner } from "../ui/components/IncognitoBanner.js";
import { GitHubOnboardingModal } from "../ui/components/GitHubOnboardingModal.js";
import {
    DuplicateDetectionModal,
    findDuplicates,
} from "./components/DuplicateDetectionModal.js";
import { markSettingsPendingCommit } from "/core/settings-auto-commit.js";

initializeHandlers();
initDebug().catch(() => {});

// Apply saved theme before first render so there's no flash of default styles
applyThemeFromStorage().catch(() => {});
setupThemeListener();

function LibraryApp() {
    const [problems, setProblems] = useState([]);
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("solutions");
    const [searchQuery, setSearchQuery] = useState("");
    const [canonicalLookup, setCanonicalLookup] = useState(null);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [gitUser, setGitUser] = useState(null);
    const [gitAvatar, setGitAvatar] = useState(null);
    const [showGitHubOnboarding, setShowGitHubOnboarding] = useState(false);
    const [onboardingData, setOnboardingData] = useState({
        username: "",
        token: "",
    });
    const [graphFocusProblem, setGraphFocusProblem] = useState(null);
    const [duplicateGroups, setDuplicateGroups] = useState([]);
    const [pendingAutoSetup, setPendingAutoSetup] = useState(false);
    const [currentDuplicateGroup, setCurrentDuplicateGroup] = useState(null);
    const [setupIncomplete, setSetupIncomplete] = useState(null);
    const [setupDismissed, setSetupDismissed] = useState(false);
    const [importReport, setImportReport] = useState(null);

    // Reload problems from IndexedDB (used after import or external change)
    const reloadProblems = useCallback(() => {
        setLoading(true);
        Storage.getAllProblems()
            .then((p) => setProblems(p || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    // Update a single problem in state (called after modal edit saves to IndexedDB)
    const handleProblemUpdate = useCallback((updated) => {
        setProblems((prev) =>
            prev.map((p) => (p.id === updated.id ? updated : p))
        );
    }, []);

    // Remove a problem from state (called after modal delete removes from IndexedDB)
    const handleProblemDelete = useCallback((id) => {
        setProblems((prev) => prev.filter((p) => p.id !== id));
    }, []);

    // Load canonical map and build a fast lookup (tolerates multiple JSON shapes)
    useEffect(() => {
        fetch(CONSTANTS.URLS.CANONICAL_MAP_RAW, { cache: "default" })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (!data) return;
                const lookup = new Map(); // "platform:slug" → { id, title }
                const entries = Array.isArray(data) ? data : data.entries || [];
                for (const e of entries) {
                    const id = e.canonicalId || e.slug;
                    const title = e.canonicalTitle || e.title || id;
                    if (!id) continue;
                    // aliases as array [{ platform, slug }]
                    if (Array.isArray(e.aliases)) {
                        for (const a of e.aliases) {
                            if (a.platform && a.slug)
                                lookup.set(`${a.platform}:${a.slug}`, {
                                    id,
                                    title,
                                });
                        }
                    }
                    // aliases / platforms as object { platform: slug }
                    const obj = e.aliases ?? e.platforms;
                    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
                        for (const [plat, slug] of Object.entries(obj)) {
                            if (slug)
                                lookup.set(`${plat}:${slug}`, { id, title });
                        }
                    }
                }
                setCanonicalLookup(lookup);
            })
            .catch(() => {});
    }, []);

    // Enrich raw problems with canonical data (computed, not persisted)
    const enrichedProblems = useMemo(() => {
        if (!canonicalLookup || !problems.length) return problems;
        return problems.map((p) => {
            const key = `${p.platform}:${p.titleSlug || p.id}`;
            const canon = canonicalLookup.get(key);
            if (!canon || p.canonical?.id === canon.id) return p;
            return { ...p, canonical: canon };
        });
    }, [problems, canonicalLookup]);

    useEffect(() => {
        let mounted = true;
        Promise.all([Storage.getAllProblems(), Storage.getSettings()])
            .then(([p, s]) => {
                if (!mounted) return;
                setProblems(p || []);
                setSettings(s || {});
                // Hydrate display state from saved settings (avatar + username)
                if (s?.github_avatar) setGitAvatar(s.github_avatar);
                if (s?.github_username) setGitUser(s.github_username);

                // Check for duplicate problems
                const dups = findDuplicates(p || []);
                setDuplicateGroups(dups);
                if (dups.length > 0) {
                    setCurrentDuplicateGroup(dups[0]);
                }

                // Resolve GitHub user for header display
                // Priority 1: OAuth token from auth.tokens (correct path after Connect)
                // Priority 2: Manual PAT from settings (legacy support)
                Storage.getAuthToken("github").then((oauthToken) => {
                    const token = oauthToken || s?.github_token;
                    const hasRepo = !!(s?.github_repo || s?.gitRepo);
                    if (mounted) setSetupIncomplete(!token || !hasRepo);
                    if (!token || !mounted) return;
                    // Hydrate settings display with the OAuth token so SettingsSchema shows "Connected"
                    // (OAuth tokens are never persisted to settings storage — they live in auth.tokens)
                    if (oauthToken && !s?.github_token) {
                        setSettings((prev) => ({
                            ...prev,
                            github_token: oauthToken,
                        }));
                    }
                    fetch("https://api.github.com/user", {
                        headers: { Authorization: `Bearer ${token}` },
                    })
                        .then((r) => (r.ok ? r.json() : null))
                        .then((u) => {
                            if (u?.login && mounted) setGitUser(u.login);
                        })
                        .catch(() => {});
                });
            })
            .finally(() => mounted && setLoading(false));
        return () => (mounted = false);
    }, []);

    useEffect(() => {
        const tab = getQueryParam("tab", "");
        const q = getQueryParam("q", "");
        const allowed = new Set([
            "solutions",
            "archive", // "archive" kept as alias for old URLs
            "analytics",
            "graph",
            "ai-chats",
            "behaviour-bank",
            "canonical",
            "settings",
            "search",
        ]);
        if (allowed.has(tab))
            setActiveTab(tab === "archive" ? "solutions" : tab);
        if (q) setSearchQuery(q);
        if (getQueryParam("openSetup") === "true") setPendingAutoSetup(true);
    }, []);

    // Auto-open repo setup modal when navigated here with ?openSetup=true
    useEffect(() => {
        if (!loading && pendingAutoSetup) {
            setPendingAutoSetup(false);
            handleSetupRepo();
        }
    }, [loading, pendingAutoSetup]);

    useEffect(() => {
        updateQueryParams({
            tab: activeTab,
            q: activeTab === "search" && searchQuery ? searchQuery : null,
        });
    }, [activeTab, searchQuery]);

    // Listen for OAuth messages from Worker
    useEffect(() => {
        const handleOAuthMessage = async (event) => {
            // Validate origin
            const allowedOrigins = [
                new URL(CONSTANTS.URLS.AUTH_WORKER).origin,
                window.location.origin,
            ];
            if (
                event.origin !== "null" &&
                !allowedOrigins.includes(event.origin)
            ) {
                return;
            }

            const data = event.data;
            if (
                !data ||
                data.type !== "CODELEDGER_AUTH" ||
                data.provider !== "github"
            ) {
                return;
            }

            if (!data.token) {
                dbg.error("OAuth error:", data.error);
                return;
            }

            // Save token and get user info
            try {
                await Storage.setAuthToken("github", data.token);

                const userRes = await fetch("https://api.github.com/user", {
                    headers: { Authorization: `Bearer ${data.token}` },
                });

                if (!userRes.ok) throw new Error("Failed to fetch user");
                const user = await userRes.json();

                // Check if repo is already configured
                const currentSettings = await Storage.getSettings();
                const hasRepo = !!(
                    currentSettings?.github_repo || currentSettings?.gitRepo
                );

                // Save username and avatar to settings for sync operations and UI
                const updatedSettings = {
                    ...currentSettings,
                    github_username: user.login,
                };
                if (!currentSettings?.github_owner) {
                    updatedSettings.github_owner = user.login;
                }
                if (user.avatar_url) {
                    try {
                        // Try to fetch avatar and convert to data URL to avoid cross-origin/broken-img issues
                        const avatarRes = await fetch(user.avatar_url, {
                            headers: { Authorization: `Bearer ${data.token}` },
                            cache: "no-store",
                        });
                        if (avatarRes.ok) {
                            const blob = await avatarRes.blob();
                            const reader = new FileReader();
                            const dataUrl = await new Promise((res) => {
                                reader.onloadend = () => res(reader.result);
                                reader.readAsDataURL(blob);
                            });
                            updatedSettings.github_avatar = dataUrl;
                            setGitAvatar(dataUrl);
                        } else {
                            updatedSettings.github_avatar = user.avatar_url;
                            setGitAvatar(user.avatar_url);
                        }
                    } catch (e) {
                        // fallback to raw URL
                        updatedSettings.github_avatar = user.avatar_url;
                        setGitAvatar(user.avatar_url);
                    }
                }
                await Storage.setSettings(updatedSettings);

                // Enable debug logging to assist with troubleshooting after OAuth
                await Storage.setDebugEnabled(true).catch(() => {});
                setDebug(true);

                // Show onboarding if no repo is configured
                if (!hasRepo) {
                    setOnboardingData({
                        username: user.login,
                        token: data.token,
                    });
                    setShowGitHubOnboarding(true);
                }

                // Update user display
                setGitUser(user.login);
                setGitAvatar(user.avatar_url || null);
                setSettings(updatedSettings);
            } catch (e) {
                dbg.error("OAuth handler error:", e);
            }
        };

        window.addEventListener("message", handleOAuthMessage);
        return () => window.removeEventListener("message", handleOAuthMessage);
    }, []);

    // Listen for import complete broadcast from the service worker
    useEffect(() => {
        if (!window.chrome?.runtime?.onMessage) return;
        const handleImportComplete = (msg) => {
            if (msg?.type !== "CODELEDGER_IMPORT_COMPLETE") return;
            setImportReport({
                saved: msg.saved || 0,
                autoMerged: msg.autoMerged || 0,
                conflicts: msg.conflicts || 0,
                missingCode: msg.missingCode || 0,
                missingTags: msg.missingTags || 0,
            });
            reloadProblems();
        };
        chrome.runtime.onMessage.addListener(handleImportComplete);
        return () => chrome.runtime.onMessage.removeListener(handleImportComplete);
    }, [reloadProblems]);

    const handleOnboardingComplete = async () => {
        setShowGitHubOnboarding(false);
        // Refresh settings to reflect repo setup
        const updated = await Storage.getSettings();
        setSettings(updated || {});
    };

    const handleDuplicateResolved = useCallback(
        (deletedId, action) => {
            // Remove the resolved duplicate from state
            setProblems((prev) => prev.filter((p) => p.id !== deletedId));
            // Move to next duplicate group if any remain
            if (duplicateGroups.length > 0) {
                const nextGroup = duplicateGroups.slice(1);
                if (nextGroup.length > 0) {
                    setDuplicateGroups(nextGroup);
                    setCurrentDuplicateGroup(nextGroup[0]);
                } else {
                    setDuplicateGroups([]);
                    setCurrentDuplicateGroup(null);
                }
            }
        },
        [duplicateGroups]
    );

    // Called from SettingsSchema "Set up repository" / "Change repo" button
    const handleSetupRepo = useCallback(
        async (token, _owner) => {
            const t =
                token ||
                (await Storage.getAuthToken("github").catch(() => null));
            if (!t) return;
            let uName = gitUser;
            if (!uName) {
                const u = await fetch("https://api.github.com/user", {
                    headers: { Authorization: `Bearer ${t}` },
                })
                    .then((r) => (r.ok ? r.json() : null))
                    .catch(() => null);
                uName = u?.login || "";
            }
            setOnboardingData({ username: uName, token: t });
            setShowGitHubOnboarding(true);
        },
        [gitUser]
    );

    const openProblemInGraph = useCallback((problem) => {
        if (!problem) return;
        setGraphFocusProblem({ ...problem });
        setActiveTab("graph");
    }, []);

    const navItems = [
        { id: "solutions", label: "Solutions", icon: "💡" },
        { id: "analytics", label: "Analytics", icon: "📈" },
        { id: "graph", label: "Graph", icon: "🔗" },
        { id: "ai-chats", label: "AI Chats", icon: "🤖" },
        { id: "behaviour-bank", label: "Behaviour Bank", icon: "🧠" },
        { id: "canonical", label: "Canonical", icon: "🔀" },
        { id: "settings", label: "Settings", icon: "⚙️" },
    ];

    const handleSettingsChange = async (key, value) => {
        const next = { ...(settings || {}), [key]: value };

        if (key === "incognitoMode") {
            const durations = {
                "1h": 3600000,
                "4h": 14400000,
                "24h": 86400000,
            };
            if (value === "off") {
                next.incognitoExpiry = 0;
            } else if (value === "forever") {
                next.incognitoExpiry = -1;
            } else if (durations[value]) {
                next.incognitoExpiry = Date.now() + durations[value];
            }
        }

        // GitHub OAuth tokens should NOT be stored in settings — they belong in auth.tokens.
        // Only update state locally for OAuth fields; actual token was saved by handleOAuth in SettingsSchema.
        const isOAuthField = [
            "github_token",
            "gitlab_token",
            "bitbucket_token",
        ].includes(key);

        setSettings(next);

        // Skip persisting OAuth tokens to settings (they live in auth.tokens).
        // For other fields, save normally.
        if (!isOAuthField) {
            try {
                await Storage.setSettings(next);
                if (key === "debugMode") {
                    await Storage.setDebugEnabled(value);
                    setDebug(value); // update live state in this page without reload
                }
                markSettingsPendingCommit().catch(() => {});
            } catch (e) {
                // noop
            }
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
                problems=${enrichedProblems}
                searchQuery=${searchQuery}
                onProblemUpdate=${handleProblemUpdate}
                onProblemDelete=${handleProblemDelete}
                settings=${settings}
                onOpenGraphProblem=${openProblemInGraph}
                onNavigate=${setActiveTab}
            />`;

        if (activeTab === "solutions")
            return html`<${ProblemsView}
                problems=${enrichedProblems}
                onProblemUpdate=${handleProblemUpdate}
                onProblemDelete=${handleProblemDelete}
                settings=${settings}
                onOpenGraphProblem=${openProblemInGraph}
                onNavigate=${setActiveTab}
            />`;
        if (activeTab === "analytics")
            return html`<${AnalyticsView}
                problems=${enrichedProblems}
                onNavigate=${setActiveTab}
            />`;
        if (activeTab === "graph")
            return html`<${GraphView}
                problems=${enrichedProblems}
                focusProblem=${graphFocusProblem}
                onFocusProblemHandled=${() => setGraphFocusProblem(null)}
                onProblemDelete=${handleProblemDelete}
                onProblemUpdate=${handleProblemUpdate}
                onNavigate=${setActiveTab}
            />`;
        if (activeTab === "ai-chats")
            return html`<${AIChatsView}
                copyableEnabled=${settings?.aiCopyable === true}
                problems=${enrichedProblems}
                settings=${settings}
            />`;
        if (activeTab === "behaviour-bank")
            return html`<${BehaviourBankView} />`;
        if (activeTab === "canonical")
            return html`<${CanonicalView} problems=${enrichedProblems} />`;
        if (activeTab === "settings")
            return html`<${SettingsPageView}
                settings=${settings}
                onSettingsChange=${handleSettingsChange}
                onSetupRepo=${handleSetupRepo}
            />`;

        return html`<p class="text-slate-400">Unknown view</p>`;
    };

    return html`
        <div class="flex flex-col h-full w-full bg-[#050508]">
            ${importReport && html`
                <div class="px-4 py-3 bg-emerald-900/30 border-b border-emerald-500/20 flex items-center gap-3 flex-wrap text-sm shrink-0">
                    <span class="text-emerald-300 font-medium">Import complete:</span>
                    <span class="text-slate-300">${importReport.saved} saved</span>
                    ${importReport.autoMerged > 0 && html`<span class="text-slate-400">· ${importReport.autoMerged} auto-merged</span>`}
                    ${importReport.conflicts > 0 && html`<span class="text-amber-300">· ${importReport.conflicts} conflict${importReport.conflicts === 1 ? "" : "s"} need review</span>`}
                    ${importReport.missingCode > 0 && html`<span class="text-slate-400">· ${importReport.missingCode} queued for code recovery</span>`}
                    ${importReport.missingTags > 0 && html`<span class="text-slate-400">· ${importReport.missingTags} queued for tag refresh</span>`}
                    <div class="ml-auto flex gap-2">
                        ${importReport.conflicts > 0 && html`
                            <button
                                onClick=${() => { setActiveTab("settings"); setImportReport(null); }}
                                class="px-3 py-1 text-xs rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 hover:bg-amber-500/25 transition-colors"
                            >
                                View conflicts
                            </button>
                        `}
                        <button
                            onClick=${() => setImportReport(null)}
                            class="px-3 py-1 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 transition-colors"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            `}
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
                            class="w-2 h-2 rounded-full ${typeof chrome !==
                                "undefined" && chrome.runtime?.id
                                ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                                : "bg-slate-600"}"
                        ></div>
                        <span
                            class="text-xs font-mono uppercase tracking-widest ${typeof chrome !==
                                "undefined" && chrome.runtime?.id
                                ? "text-emerald-500/80"
                                : "text-slate-500"}"
                            >${typeof chrome !== "undefined" &&
                            chrome.runtime?.id
                                ? "Extension"
                                : "Web"}</span
                        >
                    </div>
                    <button
                        onClick=${reloadProblems}
                        title="Reload problems from local database"
                        class="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <polyline points="23 4 23 10 17 10" />
                            <polyline points="1 20 1 14 7 14" />
                            <path
                                d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
                            />
                        </svg>
                    </button>
                    <div class="h-4 w-px bg-white/10"></div>
                    <div class="flex items-center gap-3">
                        ${gitUser
                            ? html`
                                  <div class="flex items-center gap-2">
                                      ${gitAvatar
                                          ? html`<img
                                                src=${gitAvatar}
                                                alt="avatar"
                                                class="w-6 h-6 rounded-full"
                                            />`
                                          : html`<div
                                                class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                                            ></div>`}
                                      <span
                                          class="text-xs font-mono text-emerald-500/80"
                                          >${gitUser}</span
                                      >
                                      ${settings.github_repo || settings.gitRepo
                                          ? (() => {
                                                const owner =
                                                    settings.github_owner?.trim() ||
                                                    settings.github_username ||
                                                    gitUser;
                                                const repoUrl = owner
                                                    ? `https://github.com/${owner}/${settings.github_repo || settings.gitRepo}`
                                                    : null;
                                                return repoUrl
                                                    ? html`<a
                                                          href=${repoUrl}
                                                          target="_blank"
                                                          rel="noreferrer"
                                                          class="text-xs text-slate-400 hover:text-cyan-400 border border-white/10 hover:border-cyan-500/30 px-2 py-0.5 rounded transition-colors"
                                                          >Repo ↗</a
                                                      >`
                                                    : "";
                                            })()
                                          : ""}
                                  </div>
                              `
                            : html`<a
                                  onClick=${(e) => {
                                      e.preventDefault();
                                      setActiveTab("settings");
                                  }}
                                  href="#"
                                  class="text-xs text-slate-400 hover:text-cyan-400 border border-white/10 hover:border-cyan-500/30 px-2 py-1 rounded transition-colors"
                                  >Connect GitHub</a
                              >`}
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
                                        <span
                                            class="text-sm font-medium w-6 text-center"
                                            >${item.icon}</span
                                        >
                                        ${!sidebarCollapsed
                                            ? html`<span
                                                  class="text-sm font-medium"
                                                  >${item.label}</span
                                              >`
                                            : ""}
                                    </a>
                                `
                            )}
                        </nav>
                    </div>

                    ${setupIncomplete && !setupDismissed && !sidebarCollapsed
                        ? html`
                              <a
                                  href=${typeof chrome !== "undefined" &&
                                  chrome.runtime?.id
                                      ? chrome.runtime.getURL(
                                            "welcome/welcome.html"
                                        )
                                      : "#"}
                                  target="_blank"
                                  class="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 hover:bg-amber-500/15 transition-colors"
                              >
                                  <span>⚠</span>
                                  <span>Complete setup</span>
                              </a>
                          `
                        : setupIncomplete && !setupDismissed && sidebarCollapsed
                          ? html`
                                <a
                                    href=${typeof chrome !== "undefined" &&
                                    chrome.runtime?.id
                                        ? chrome.runtime.getURL(
                                              "welcome/welcome.html"
                                          )
                                        : "#"}
                                    target="_blank"
                                    title="Setup incomplete — click to complete"
                                    class="flex items-center justify-center w-10 h-10 mx-auto mb-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/15 transition-colors"
                                    >⚠</a
                                >
                            `
                          : ""}

                    <div class="mt-auto">
                        <div
                            class="p-3 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/5"
                        >
                            ${!sidebarCollapsed
                                ? html`
                                      <div
                                          class="flex items-center justify-between mb-2"
                                      >
                                          <span
                                              class="text-[10px] uppercase tracking-wider text-slate-500"
                                              >Database Size</span
                                          >
                                          <span
                                              class="text-[10px] font-mono text-cyan-400"
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
                                : html`<div
                                      class="text-center text-[10px] text-slate-400"
                                  >
                                      ${problems.length}
                                  </div>`}
                        </div>
                    </div>
                </aside>

                <div class="flex-1 bg-[#050508] p-6 overflow-y-auto">
                    ${setupIncomplete && !setupDismissed
                        ? html`
                              <div
                                  class="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/20"
                              >
                                  <div class="flex items-center gap-2 min-w-0">
                                      <span class="text-amber-400 shrink-0"
                                          >⚠</span
                                      >
                                      <p class="text-xs text-amber-300">
                                          Setup incomplete — connect GitHub and
                                          link a repo to start auto-committing
                                          solutions.
                                      </p>
                                  </div>
                                  <div class="flex items-center gap-2 shrink-0">
                                      <a
                                          href=${typeof chrome !==
                                              "undefined" && chrome.runtime?.id
                                              ? chrome.runtime.getURL(
                                                    "welcome/welcome.html"
                                                )
                                              : "#"}
                                          target="_blank"
                                          class="text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/10 px-2 py-1 rounded transition-colors whitespace-nowrap"
                                          >Complete setup →</a
                                      >
                                      <button
                                          onClick=${() =>
                                              setSetupDismissed(true)}
                                          class="text-slate-500 hover:text-slate-300 text-lg leading-none transition-colors"
                                          title="Dismiss"
                                      >
                                          ×
                                      </button>
                                  </div>
                              </div>
                          `
                        : ""}
                    ${(() => {
                        const mode = settings.incognitoMode;
                        const expiry = settings.incognitoExpiry ?? 0;
                        const active =
                            mode &&
                            mode !== "off" &&
                            mode !== false &&
                            (mode === "forever" ||
                                mode === true ||
                                expiry === -1 ||
                                (expiry > 0 && Date.now() < expiry));
                        return active
                            ? html`<${IncognitoBanner}
                                  settings=${settings}
                                  onDisable=${() =>
                                      handleSettingsChange(
                                          "incognitoMode",
                                          "off"
                                      )}
                              />`
                            : "";
                    })()}
                    ${renderActiveView()}
                </div>
            </main>

            <${GitHubOnboardingModal}
                isOpen=${showGitHubOnboarding}
                onComplete=${handleOnboardingComplete}
                username=${onboardingData.username}
                token=${onboardingData.token}
            />

            <!-- Duplicate detection modal -->
            ${currentDuplicateGroup
                ? html`
                      <${DuplicateDetectionModal}
                          duplicateGroup=${currentDuplicateGroup}
                          onResolve=${handleDuplicateResolved}
                          onClose=${() => {
                              setCurrentDuplicateGroup(null);
                          }}
                      />
                  `
                : ""}
        </div>
    `;
}

render(html`<${LibraryApp} />`, document.getElementById("root"));
