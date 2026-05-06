/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { PanelGeneral } from "../settings-panels/PanelGeneral.js";
import { PanelAI } from "../settings-panels/PanelAI.js";
import { PanelGit } from "../settings-panels/PanelGit.js";
import { PanelPlatforms } from "../settings-panels/PanelPlatforms.js";
import { PanelBackups } from "../settings-panels/PanelBackups.js";
import { PanelAdvanced } from "../settings-panels/PanelAdvanced.js";

const NAV_ITEMS = [
  { id: "general",   emoji: "🎨", label: "General"   },
  { id: "ai",        emoji: "🤖", label: "AI"         },
  { id: "git",       emoji: "🔗", label: "Git"        },
  { id: "platforms", emoji: "🌐", label: "Platforms"  },
  { id: "backups",   emoji: "💾", label: "Backups"    },
  { id: "advanced",  emoji: "⚙️", label: "Advanced"   },
];

export function SettingsPageView({ settings, onSettingsChange, onSetupRepo }) {
  const [activePanel, setActivePanel] = useState("general");

  function renderPanel() {
    const props = { settings, onSettingsChange, onSetupRepo };
    switch (activePanel) {
      case "general":   return html`<${PanelGeneral}   ...${props} />`;
      case "ai":        return html`<${PanelAI}        ...${props} />`;
      case "git":       return html`<${PanelGit}       ...${props} />`;
      case "platforms": return html`<${PanelPlatforms} ...${props} />`;
      case "backups":   return html`<${PanelBackups}   ...${props} />`;
      case "advanced":  return html`<${PanelAdvanced}  ...${props} />`;
      default:          return null;
    }
  }

  return html`
    <div class="flex flex-col h-full min-h-0 gap-0">
      <!-- Horizontal tab bar -->
      <div class="flex items-center gap-1 px-1 border-b border-white/5 shrink-0 overflow-x-auto">
        ${NAV_ITEMS.map(({ id, emoji, label }) => html`
          <button
            key=${id}
            onClick=${() => setActivePanel(id)}
            class="flex items-center gap-1.5 px-3 py-2.5 rounded-t-lg text-sm font-medium whitespace-nowrap transition-colors border-b-2
              ${activePanel === id
                ? "border-cyan-500 text-cyan-200 bg-cyan-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5"}"
          >
            <span class="text-sm leading-none">${emoji}</span>
            <span>${label}</span>
          </button>
        `)}
      </div>

      <!-- Panel content -->
      <div class="flex-1 overflow-y-auto p-6 min-h-0">
        ${renderPanel()}
      </div>
    </div>
  `;
}
