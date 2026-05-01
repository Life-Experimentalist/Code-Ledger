/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CanonicalView — cross-platform problem linking pipeline.
 *
 * Flow:
 *  1. Fetch canonical-map.json from CDN — show existing mappings.
 *  2. Let user search for a problem across platforms.
 *  3. If no mapping exists → submit a GitHub Issue on the main repo (label: canonical-mapping).
 *  4. Show open canonical-mapping issues with 👍 vote counts.
 *  5. Issues with ≥ VOTES_REQUIRED (5) 👍 are shown as "ready to merge".
 */

import { h, useState, useEffect, useCallback, useRef } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";
import { CONSTANTS } from "../../core/constants.js";

const CANONICAL_REPO = "Life-Experimentalist/Code-Ledger";
const VOTES_REQUIRED = CONSTANTS.CANONICAL_VOTES_REQUIRED ?? 5;
const GH_API = "https://api.github.com";
const ISSUE_LABEL = "canonical-mapping";

const PLATFORMS = ["leetcode", "geeksforgeeks", "codeforces"];
const PLATFORM_LABEL = { leetcode: "LeetCode", geeksforgeeks: "GeeksForGeeks", codeforces: "Codeforces" };
const PLATFORM_FAVICON = {
  leetcode: "https://assets.leetcode.com/static_assets/public/icons/favicon.ico",
  geeksforgeeks: "https://www.geeksforgeeks.org/favicon.ico",
  codeforces: "https://codeforces.com/favicon.ico",
};

const TOPICS = [
  "arrays", "strings", "hash-table", "dynamic-programming", "math",
  "sorting", "greedy", "depth-first-search", "breadth-first-search",
  "binary-search", "two-pointers", "sliding-window", "stack", "queue",
  "tree", "graph", "recursion", "backtracking", "bit-manipulation",
  "linked-list", "heap", "trie", "union-find", "segment-tree",
];

function slugifyCanonicalId(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "canonical-request";
}

/* ── GitHub API helpers ──────────────────────────────────────────────── */

async function ghFetch(path, token, opts = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  };
  const res = await fetch(`${GH_API}${path}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.message || res.statusText), { status: res.status });
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

/* ── Small sub-components ────────────────────────────────────────────── */

function PlatformBadge({ platform }) {
  const favicon = PLATFORM_FAVICON[platform];
  const label = PLATFORM_LABEL[platform] || platform;
  return html`
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-slate-400">
      ${favicon ? html`<img src=${favicon} alt="" class="w-3 h-3 object-contain" onError=${(e) => { e.target.style.display = "none"; }} />` : ""}
      ${label}
    </span>
  `;
}

function ThumbsBar({ count, required }) {
  const pct = Math.min(100, Math.round((count / required) * 100));
  const color = count >= required ? "#22c55e" : count >= Math.ceil(required / 2) ? "#f59e0b" : "#64748b";
  return html`
    <div class="flex items-center gap-2">
      <div class="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
        <div class="h-full rounded-full transition-all" style=${{ width: `${pct}%`, background: color }}></div>
      </div>
      <span class="text-[10px] font-mono shrink-0" style=${{ color }}>
        ${count}/${required} 👍
      </span>
    </div>
  `;
}

/* ── Main view ────────────────────────────────────────────────────────── */

export function CanonicalView({ problems }) {
  // ── Canonical map state ─────────────────────────────────────────────
  const [canonicalMap, setCanonicalMap] = useState(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState(null);

  // ── Search ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);

  // ── Submit form ─────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [canonTitle, setCanonTitle] = useState("");
  const [canonTopic, setCanonTopic] = useState("arrays");
  const [aliases, setAliases] = useState([
    { platform: "leetcode", slug: "" },
    { platform: "geeksforgeeks", slug: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  // ── Issues list ─────────────────────────────────────────────────────
  const [issues, setIssues] = useState([]);
  const [issuesLoading, setIssuesLoading] = useState(true);
  const [issuesError, setIssuesError] = useState(null);
  const [voting, setVoting] = useState({});  // issueNumber → bool
  const [votedSet, setVotedSet] = useState(new Set());

  // ── GitHub token ────────────────────────────────────────────────────
  const [githubToken, setGithubToken] = useState(null);

  // ── Load token on mount ─────────────────────────────────────────────
  useEffect(() => {
    Storage.getAuthToken("github")
      .then((t) => setGithubToken(t || null))
      .catch(() => { });
  }, []);

  // ── Fetch canonical map ─────────────────────────────────────────────
  useEffect(() => {
    setMapLoading(true);
    fetch(CONSTANTS.URLS.CANONICAL_MAP_RAW, { cache: "default" })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)))
      .then((data) => { setCanonicalMap(data); setMapLoading(false); })
      .catch((e) => { setMapError(e.message); setMapLoading(false); });
  }, []);

  // ── Fetch GitHub Issues (public — no auth needed) ───────────────────
  const loadIssues = useCallback(() => {
    setIssuesLoading(true);
    setIssuesError(null);
    ghFetch(
      `/repos/${CANONICAL_REPO}/issues?labels=${encodeURIComponent(ISSUE_LABEL)}&state=open&per_page=30&sort=reactions-+1`,
      githubToken
    )
      .then((data) => { setIssues(Array.isArray(data) ? data : []); setIssuesLoading(false); })
      .catch((e) => { setIssuesError(e.message); setIssuesLoading(false); });
  }, [githubToken]);

  useEffect(() => { loadIssues(); }, [loadIssues]);

  // ── Search canonical map ─────────────────────────────────────────────
  const handleSearch = useCallback(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !canonicalMap?.entries) { setSearchResults(null); return; }
    const hits = canonicalMap.entries.filter((e) =>
      e.canonicalTitle?.toLowerCase().includes(q) ||
      e.canonicalId?.toLowerCase().includes(q) ||
      e.aliases?.some((a) => a.slug?.toLowerCase().includes(q)) ||
      e.tags?.some((t) => t.toLowerCase().includes(q))
    );
    setSearchResults(hits);
  }, [searchQuery, canonicalMap]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    const t = setTimeout(handleSearch, 300);
    return () => clearTimeout(t);
  }, [searchQuery, handleSearch]);

  // ── Submit new issue ─────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!githubToken) {
      setSubmitResult({ ok: false, msg: "Connect GitHub first (in Settings) to submit canonical requests." });
      return;
    }
    if (!canonTitle.trim()) {
      setSubmitResult({ ok: false, msg: "Canonical title is required." });
      return;
    }
    const validAliases = aliases.filter((a) => a.slug.trim());
    if (validAliases.length < 2) {
      setSubmitResult({ ok: false, msg: "At least two platform slugs are required." });
      return;
    }

    // Check if mapping already exists in canonical-map
    const existing = canonicalMap?.entries?.find((e) =>
      e.canonicalTitle?.toLowerCase() === canonTitle.trim().toLowerCase() ||
      validAliases.some((a) => e.aliases?.some((ea) => ea.platform === a.platform && ea.slug === a.slug.trim()))
    );
    if (existing) {
      setSubmitResult({
        ok: false,
        msg: `This mapping already exists in canonical-map.json as "${existing.canonicalTitle}".`,
      });
      return;
    }

    setSubmitting(true);
    setSubmitResult(null);

    const requestPayload = {
      canonicalId: slugifyCanonicalId(canonTitle.trim()),
      canonicalTitle: canonTitle.trim(),
      topic: canonTopic,
      aliases: validAliases.map((a) => ({ platform: a.platform, slug: a.slug.trim() })),
      requestedAt: new Date().toISOString(),
    };

    const aliasLines = validAliases.map((a) => `- **${PLATFORM_LABEL[a.platform] || a.platform}**: \`${a.slug.trim()}\``).join("\n");
    const body = `## Canonical Problem Mapping Request

**Canonical Title**: ${canonTitle.trim()}
**Topic**: ${canonTopic}

### Platform Aliases
${aliasLines}

### Verification Checklist
- [ ] I have confirmed these problems are equivalent (same algorithm, same constraints)
- [ ] The canonical title is descriptive and platform-agnostic
- [ ] All slugs are correct and publicly accessible

    <!-- codeledger-canonical-request -->
    \`\`\`json
    ${JSON.stringify(requestPayload, null, 2)}
    \`\`\`

---
*This issue was submitted via CodeLedger library. It needs ${VOTES_REQUIRED} 👍 reactions to be merged into the canonical map.*`;

    try {
      const created = await ghFetch(`/repos/${CANONICAL_REPO}/issues`, githubToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `[Canonical] ${canonTitle.trim()} (${validAliases.map((a) => a.platform).join(" ↔ ")})`,
          body,
          labels: [ISSUE_LABEL],
        }),
      });
      setSubmitResult({
        ok: true,
        msg: `Issue #${created.number} created!`,
        url: created.html_url,
      });
      setFormOpen(false);
      setCanonTitle("");
      setAliases([{ platform: "leetcode", slug: "" }, { platform: "geeksforgeeks", slug: "" }]);
      loadIssues();
    } catch (e) {
      setSubmitResult({ ok: false, msg: `Submit failed: ${e.message}` });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Vote on issue ────────────────────────────────────────────────────
  const handleVote = async (issueNumber) => {
    if (!githubToken) {
      alert("Connect GitHub in Settings to vote.");
      return;
    }
    if (votedSet.has(issueNumber)) return;
    setVoting((v) => ({ ...v, [issueNumber]: true }));
    try {
      await ghFetch(`/repos/${CANONICAL_REPO}/issues/${issueNumber}/reactions`, githubToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "+1" }),
      });
      setVotedSet((s) => new Set([...s, issueNumber]));
      setIssues((prev) => prev.map((iss) =>
        iss.number === issueNumber
          ? { ...iss, reactions: { ...iss.reactions, "+1": (iss.reactions?.["+1"] || 0) + 1 } }
          : iss
      ));
    } catch (e) {
      alert(`Vote failed: ${e.message}`);
    } finally {
      setVoting((v) => ({ ...v, [issueNumber]: false }));
    }
  };

  /* ── Render ──────────────────────────────────────────────────────────── */
  return html`
    <div class="flex flex-col gap-8 w-full">

      <!-- ── Header ── -->
      <div class="flex flex-col gap-1">
        <h2 class="text-lg font-semibold text-white">Cross-Platform Problem Linking</h2>
        <p class="text-sm text-slate-400">
          Link equivalent problems across LeetCode, GeeksForGeeks, and Codeforces.
          Mappings with ${VOTES_REQUIRED}+ 👍 are merged into the canonical map.
        </p>
        ${!githubToken ? html`
          <div class="mt-2 flex items-center gap-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            ⚠️ Connect GitHub in <strong>Settings</strong> to submit requests and vote.
          </div>
        ` : html`
          <div class="mt-2 text-[11px] text-emerald-400">✓ GitHub connected — you can submit and vote.</div>
        `}
      </div>

      <!-- ── Search existing canonical map ── -->
      <div class="p-5 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col gap-4">
        <h3 class="text-sm font-bold text-white uppercase tracking-widest">Search Canonical Map</h3>
        <div class="flex gap-2">
          <input
            value=${searchQuery}
            placeholder="Search by title, slug, or topic…"
            onInput=${(e) => setSearchQuery(e.target.value)}
            class="flex-1 px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-600"
          />
          ${searchQuery ? html`
            <button onClick=${() => { setSearchQuery(""); setSearchResults(null); }}
              class="px-3 py-2 text-slate-500 hover:text-slate-300 border border-white/10 rounded-lg text-sm">✕</button>
          ` : ""}
        </div>

        ${mapLoading ? html`<p class="text-[11px] text-slate-500">Loading canonical map…</p>` : ""}
        ${mapError ? html`<p class="text-[11px] text-rose-400">Error: ${mapError}</p>` : ""}

        ${searchResults !== null ? html`
          <div class="flex flex-col gap-2 max-h-64 overflow-y-auto">
            ${searchResults.length === 0 ? html`
              <div class="flex flex-col gap-2 p-4 bg-amber-500/5 border border-amber-500/15 rounded-xl text-center">
                <p class="text-sm text-amber-300">No mapping found for "${searchQuery}".</p>
                <button
                  onClick=${() => { setFormOpen(true); setCanonTitle(searchQuery); }}
                  class="self-center text-xs px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 rounded-lg hover:bg-cyan-500/30 transition-colors"
                >Submit a new mapping ↗</button>
              </div>
            ` : searchResults.map((entry) => html`
              <div class="p-3 bg-white/3 border border-white/5 rounded-xl flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-white">${entry.canonicalTitle}</span>
                  <span class="text-[10px] text-slate-500 px-1.5 py-0.5 bg-white/5 rounded">${entry.topic}</span>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  ${(entry.aliases || []).map((a) => html`
                    <${PlatformBadge} platform=${a.platform} />
                    <span class="text-[10px] font-mono text-slate-500">${a.slug}</span>
                  `)}
                </div>
                ${entry.tags?.length ? html`
                  <div class="flex flex-wrap gap-1">
                    ${entry.tags.map((t) => html`
                      <span class="px-1.5 py-0.5 rounded text-[9px] bg-white/5 text-slate-500">${t}</span>
                    `)}
                  </div>
                ` : ""}
              </div>
            `)}
          </div>
        ` : !mapLoading && !mapError && !searchQuery ? html`
          <p class="text-[11px] text-slate-600">
            ${canonicalMap?.entries?.length ?? 0} canonical entries loaded. Search to find a mapping.
          </p>
        ` : ""}
      </div>

      <!-- ── Submit new mapping ── -->
      <div class="p-5 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-white uppercase tracking-widest">Submit New Mapping</h3>
          <button
            onClick=${() => setFormOpen(!formOpen)}
            class="text-xs px-3 py-1.5 rounded-lg border transition-colors ${formOpen
      ? "bg-white/10 border-white/20 text-slate-300"
      : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"}"
          >${formOpen ? "Cancel" : "+ New request"}</button>
        </div>

        ${submitResult ? html`
          <div class="text-[11px] px-3 py-2 rounded-lg ${submitResult.ok
        ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
        : "bg-rose-500/10 border border-rose-500/20 text-rose-300"}">
            ${submitResult.msg}
            ${submitResult.url ? html` <a href=${submitResult.url} target="_blank" rel="noopener"
              class="underline ml-1">View Issue ↗</a>` : ""}
          </div>
        ` : ""}

        ${formOpen ? html`
          <div class="flex flex-col gap-4 p-4 bg-white/3 border border-white/5 rounded-xl">

            <!-- Canonical title -->
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] uppercase tracking-wider text-slate-500">Canonical Title *</label>
              <input
                value=${canonTitle}
                placeholder="e.g. Two Sum"
                onInput=${(e) => setCanonTitle(e.target.value)}
                class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-600"
              />
              <p class="text-[10px] text-slate-600">A platform-agnostic name for the problem (e.g. "Two Sum", not "LeetCode #1").</p>
            </div>

            <!-- Topic -->
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] uppercase tracking-wider text-slate-500">Topic *</label>
              <select
                value=${canonTopic}
                onChange=${(e) => setCanonTopic(e.target.value)}
                class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white"
              >
                ${TOPICS.map((t) => html`<option value=${t}>${t}</option>`)}
              </select>
            </div>

            <!-- Platform aliases -->
            <div class="flex flex-col gap-2">
              <label class="text-[11px] uppercase tracking-wider text-slate-500">Platform Slugs * (min 2)</label>
              ${aliases.map((alias, i) => html`
                <div class="flex gap-2 items-center">
                  <select
                    value=${alias.platform}
                    onChange=${(e) => {
            const next = [...aliases];
            next[i] = { ...next[i], platform: e.target.value };
            setAliases(next);
          }}
                    class="px-2 py-1.5 bg-black border border-white/10 rounded-lg text-xs text-white w-36 shrink-0"
                  >
                    ${PLATFORMS.map((p) => html`<option value=${p}>${PLATFORM_LABEL[p]}</option>`)}
                  </select>
                  <div class="flex items-center gap-1.5 flex-1">
                    ${PLATFORM_FAVICON[alias.platform] ? html`
                      <img src=${PLATFORM_FAVICON[alias.platform]} alt="" class="w-3.5 h-3.5 object-contain"
                        onError=${(e) => { e.target.style.display = "none"; }} />
                    ` : ""}
                    <input
                      value=${alias.slug}
                      placeholder="problem-slug or contest/problem-id"
                      onInput=${(e) => {
            const next = [...aliases];
            next[i] = { ...next[i], slug: e.target.value };
            setAliases(next);
          }}
                      class="flex-1 px-2 py-1.5 bg-black border border-white/10 rounded-lg text-xs text-white placeholder:text-slate-700"
                    />
                  </div>
                  ${aliases.length > 2 ? html`
                    <button
                      onClick=${() => setAliases(aliases.filter((_, j) => j !== i))}
                      class="text-slate-600 hover:text-rose-400 text-xs px-1"
                    >✕</button>
                  ` : ""}
                </div>
              `)}
              ${aliases.length < 4 ? html`
                <button
                  onClick=${() => setAliases([...aliases, { platform: "codeforces", slug: "" }])}
                  class="self-start text-[10px] text-slate-500 hover:text-slate-300 border border-white/10 rounded px-2 py-1 transition-colors"
                >+ Add platform</button>
              ` : ""}
            </div>

            <!-- Submit -->
            <button
              onClick=${handleSubmit}
              disabled=${submitting}
              class="self-end px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >${submitting ? "Submitting…" : "Submit GitHub Issue"}</button>
          </div>
        ` : ""}
      </div>

      <!-- ── Pending canonical requests (GitHub Issues) ── -->
      <div class="p-5 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-white uppercase tracking-widest">
            Pending Requests
            ${issues.length ? html`<span class="ml-2 text-[10px] font-normal text-slate-500 normal-case">${issues.length} open</span>` : ""}
          </h3>
          <button
            onClick=${loadIssues}
            class="text-[10px] text-slate-500 hover:text-slate-300 border border-white/10 rounded px-2 py-1"
          >↺ Refresh</button>
        </div>

        ${issuesLoading ? html`<p class="text-[11px] text-slate-500">Loading issues…</p>` : ""}
        ${issuesError ? html`<p class="text-[11px] text-rose-400">Error: ${issuesError}</p>` : ""}

        ${!issuesLoading && !issuesError && issues.length === 0 ? html`
          <p class="text-[11px] text-slate-600 italic">No pending canonical requests. Be the first to submit one!</p>
        ` : ""}

        ${issues.map((issue) => {
            const votes = issue.reactions?.["+1"] || 0;
            const ready = votes >= VOTES_REQUIRED;
            const alreadyVoted = votedSet.has(issue.number);
            const isVoting = voting[issue.number];
            return html`
            <div class="p-4 border rounded-xl flex flex-col gap-2 transition-colors ${ready
                ? "bg-emerald-500/5 border-emerald-500/20"
                : "bg-white/3 border-white/5 hover:border-white/10"}">
              <div class="flex items-start justify-between gap-2">
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-white leading-snug">${issue.title}</p>
                  <p class="text-[10px] text-slate-500 mt-0.5">
                    #${issue.number} · opened by ${issue.user?.login || "unknown"}
                    · ${new Date(issue.created_at).toLocaleDateString()}
                    ${ready ? html` <span class="text-emerald-400 font-medium">· Ready to merge ✓</span>` : ""}
                  </p>
                </div>
                <div class="flex gap-2 shrink-0">
                  <button
                    onClick=${() => handleVote(issue.number)}
                    disabled=${alreadyVoted || isVoting || !githubToken}
                    title=${!githubToken ? "Connect GitHub to vote" : alreadyVoted ? "Already voted" : "Vote to approve this mapping"}
                    class="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${alreadyVoted
                ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400"
                : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40"
              }"
                  >
                    ${isVoting ? "…" : alreadyVoted ? "✓ Voted" : "👍 Vote"}
                  </button>
                  <a
                    href=${issue.html_url} target="_blank" rel="noopener"
                    class="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-cyan-400 transition-colors no-underline"
                  >View ↗</a>
                </div>
              </div>
              <${ThumbsBar} count=${votes} required=${VOTES_REQUIRED} />
            </div>
          `;
          })}

        <p class="text-[10px] text-slate-700 text-center">
          Issues on <a href="https://github.com/${CANONICAL_REPO}" target="_blank" rel="noopener"
            class="text-slate-600 hover:text-slate-400 underline">${CANONICAL_REPO}</a>
          labelled <code class="text-[9px]">${ISSUE_LABEL}</code>
        </p>
      </div>
    </div>
  `;
}
