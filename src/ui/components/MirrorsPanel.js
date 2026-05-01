/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Settings panel for configuring mirror git repositories.
 * After each primary commit, the same files are pushed to every active mirror.
 */
import { h } from "../../vendor/preact-bundle.js";
import { useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
import { Storage } from "../../core/storage.js";
const html = htm.bind(h);

const PROVIDERS = [
  { id: "github",    label: "GitHub" },
  { id: "gitlab",    label: "GitLab" },
  { id: "bitbucket", label: "Bitbucket" },
];

const EMPTY_MIRROR = { provider: "github", repo: "", owner: "" };

export function MirrorsPanel() {
  const [mirrors, setMirrors] = useState([]);
  const [draft,   setDraft]   = useState({ ...EMPTY_MIRROR });
  const [status,  setStatus]  = useState("");

  useEffect(() => {
    Storage.getSettings()
      .then((s) => setMirrors(Array.isArray(s?.git_mirrors) ? s.git_mirrors : []))
      .catch(() => {});
  }, []);

  const save = async (next) => {
    try {
      const settings = await Storage.getSettings();
      await Storage.setSettings({ ...settings, git_mirrors: next });
      setMirrors(next);
      setStatus("Saved");
      setTimeout(() => setStatus(""), 2000);
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    }
  };

  const addMirror = () => {
    if (!draft.repo.trim()) return;
    save([...mirrors, { provider: draft.provider, repo: draft.repo.trim(), owner: draft.owner.trim() }]);
    setDraft({ ...EMPTY_MIRROR });
  };

  const removeMirror = (i) => save(mirrors.filter((_, idx) => idx !== i));

  const providerLabel = (id) => PROVIDERS.find((p) => p.id === id)?.label || id;

  return html`
    <div class="p-6 bg-[#0a0a0f] rounded-2xl border border-white/5 flex flex-col gap-5">
      <div>
        <h3 class="text-sm font-bold text-white uppercase tracking-widest mb-1">Mirror Repositories</h3>
        <p class="text-[11px] text-slate-500">
          After each commit to the primary repository, the same files are pushed to every mirror.
          Mirrors require the provider's token to be configured in its settings section.
        </p>
      </div>

      <!-- Existing mirrors -->
      ${mirrors.length === 0
        ? html`<p class="text-[11px] text-slate-600">No mirrors configured.</p>`
        : html`
          <div class="flex flex-col gap-2">
            ${mirrors.map((m, i) => html`
              <div key=${i} class="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/10">
                <span class="text-[10px] font-medium text-cyan-400 uppercase tracking-wider w-16 shrink-0">${providerLabel(m.provider)}</span>
                <div class="flex-1 min-w-0">
                  <div class="text-xs text-slate-200 truncate">${m.owner ? `${m.owner}/` : ""}${m.repo}</div>
                </div>
                <button
                  onClick=${() => removeMirror(i)}
                  class="text-[10px] text-slate-600 hover:text-rose-400 px-1 shrink-0 transition-colors"
                >Remove</button>
              </div>
            `)}
          </div>
        `}

      <!-- Add mirror -->
      <div class="flex flex-col gap-2">
        <div class="text-[10px] text-slate-600 uppercase tracking-wider">Add mirror</div>
        <div class="flex items-center gap-2 flex-wrap">
          <select
            value=${draft.provider}
            onChange=${(e) => setDraft((d) => ({ ...d, provider: e.target.value }))}
            class="bg-[#0d1117] border border-white/10 text-xs text-slate-300 px-2 py-1.5 rounded-lg"
          >
            ${PROVIDERS.map((p) => html`<option value=${p.id}>${p.label}</option>`)}
          </select>
          <input
            type="text"
            placeholder="Owner / org (optional)"
            value=${draft.owner}
            onInput=${(e) => setDraft((d) => ({ ...d, owner: e.target.value }))}
            class="bg-[#0d1117] border border-white/10 text-xs text-slate-300 px-3 py-1.5 rounded-lg w-36 outline-none focus:border-cyan-500/50"
          />
          <input
            type="text"
            placeholder="Repository name"
            value=${draft.repo}
            onInput=${(e) => setDraft((d) => ({ ...d, repo: e.target.value }))}
            onKeyDown=${(e) => e.key === "Enter" && addMirror()}
            class="bg-[#0d1117] border border-white/10 text-xs text-slate-300 px-3 py-1.5 rounded-lg flex-1 min-w-[140px] outline-none focus:border-cyan-500/50"
          />
          <button
            onClick=${addMirror}
            disabled=${!draft.repo.trim()}
            class="px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-medium hover:bg-cyan-500/25 transition-colors disabled:opacity-40"
          >Add</button>
        </div>
      </div>

      ${status ? html`<p class="text-[11px] text-emerald-400">${status}</p>` : ""}
    </div>
  `;
}
