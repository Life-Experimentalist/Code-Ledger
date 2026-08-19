/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

const PROVIDER_LABELS = {
  gemini: "Gemini",
  openai: "OpenAI",
  claude: "Claude",
  anthropic: "Claude",
  deepseek: "DeepSeek",
  ollama: "Ollama",
  openrouter: "OpenRouter",
};

function shortModel(model) {
  if (!model) return "";
  // Trim common prefix noise: "gemini-2.0-flash" → "2.0-flash", "gpt-4o" → "gpt-4o"
  return model.replace(/^(gemini|gpt|claude|deepseek)-/, (_, p) => `${p}-`).slice(0, 24);
}

export function ModelStatusBar({ settings }) {
  if (!settings) return null;

  const provider = settings.aiProvider || "gemini";
  const model = settings.aiPrimaryModel || "";
  const fallbackProvider = settings.aiSecondary || "";
  const fallbackModel = settings.aiSecondaryModel || "";

  const providerLabel = PROVIDER_LABELS[provider] || provider;
  const fallbackLabel = PROVIDER_LABELS[fallbackProvider] || fallbackProvider;

  return html`
    <div
      class="flex items-center gap-2 px-2 py-1 rounded-md bg-slate-800/60 border border-slate-700/40 text-[11px]"
      title="Active AI model"
    >
      <span class="text-slate-500">AI:</span>
      <span class="text-cyan-400 font-medium">${providerLabel}</span>
      ${model && html`<span class="text-slate-400">${shortModel(model)}</span>`}
      ${fallbackProvider &&
      html`
        <span class="text-slate-600">→</span>
        <span class="text-slate-500">${fallbackLabel}</span>
        ${fallbackModel &&
        html`<span class="text-slate-600 text-[10px]">${shortModel(fallbackModel)}</span>`}
      `}
    </div>
  `;
}
