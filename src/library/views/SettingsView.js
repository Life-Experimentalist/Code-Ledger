/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { SettingsSchema } from "../../ui/components/SettingsSchema.js";
import { registry } from "../../core/handler-registry.js";

export function SettingsView({ settings, onSettingsChange }) {
  const schemas = registry.getAllSettingsSchemas();

  return html`
    <div class="flex flex-col gap-8 w-full max-w-4xl">
      <div class="p-6 bg-[#0a0a0f] border border-white/5 rounded-2xl">
        <h2 class="text-xl font-light text-white mb-1">Preferences</h2>
        <p class="text-sm text-slate-400 mb-6">
          Manage tracking triggers, AI models, and sync behaviors.
        </p>
        <${SettingsSchema}
          schema=${schemas}
          values=${settings}
          onChange=${onSettingsChange}
        />
      </div>
    </div>
  `;
}
