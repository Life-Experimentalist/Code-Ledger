/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Storage } from "./storage.js";
import { CONSTANTS } from "./constants.js";

async function getFirstKeyForProvider(providerId) {
  const aiKeys = await Storage.getAIKeys();
  const list = aiKeys[providerId] || [];
  return list.length ? list[0].trim() : null;
}

export async function fetchModelsForProvider(providerId) {
  const provider = CONSTANTS.AI_PROVIDERS[providerId];
  if (!provider) return [];
  const models = [];

  const epFor = (useModelsEndpoint = false) => {
    const me = provider.modelsEndpoint;
    if (useModelsEndpoint && me) return me.replace(/\/$/, "");
    return (provider.endpoint || "").replace(/\/$/, "");
  };

  try {
    if (providerId === "gemini") {
      const key = await getFirstKeyForProvider("gemini");
      if (!key) return [];
      const me = provider.modelsEndpoint;
      const ep = me ? me.replace(/\/$/, "") : `${epFor()}/models`;
      // Use header `x-goog-api-key` for Google Gemini model listing when possible.
      const res = await fetch(ep, { headers: { "x-goog-api-key": key } });
      if (!res.ok) return [];
      const data = await res.json();
      const geminiModels = (data.models || [])
        .filter((m) =>
          m.supportedGenerationMethods?.includes("generateContent"),
        )
        .map((m) => ({
          id: m.name.replace("models/", ""),
          label: `${provider.name}: ${m.displayName || m.name.replace("models/", "")}`,
          group: provider.name,
        }));
      models.push(...geminiModels);
    }

    if (providerId === "openai") {
      const key = await getFirstKeyForProvider("openai");
      if (!key) return [];
      const me = provider.modelsEndpoint;
      const ep = me ? me.replace(/\/$/, "") : `${epFor()}/models`;
      const res = await fetch(ep, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      const oaModels = (data.data || []).map((m) => ({
        id: m.id,
        label: `${provider.name}: ${m.id}`,
        group: provider.name,
      }));
      models.push(...oaModels);
    }

    if (providerId === "claude") {
      const key = await getFirstKeyForProvider("claude");
      if (!key) return [];
      const me = provider.modelsEndpoint;
      const ep = me ? me.replace(/\/$/, "") : `${epFor()}/models`;
      try {
        const res = await fetch(ep, { headers: { "x-api-key": key } });
        if (res.ok) {
          const data = await res.json();
          const claudeModels = (data.data || []).map((m) => ({
            id: m.id,
            label: `${provider.name}: ${m.display_name || m.id}`,
            group: provider.name,
          }));
          models.push(...claudeModels);
        }
      } catch (e) {
        // ignore
      }
    }

    if (providerId === "ollama") {
      // Ollama: tags endpoint typically returns model tags. Use modelsEndpoint directly if present.
      const me = provider.modelsEndpoint;
      const ep = me ? me.replace(/\/$/, "") : `${epFor()}/tags`;
      try {
        const res = await fetch(ep);
        if (res.ok) {
          const data = await res.json();
          const tags = data.tags || data;
          const ollamaModels = (Array.isArray(tags) ? tags : []).map((t) => ({
            id: t,
            label: `${provider.name}: ${t}`,
            group: provider.name,
          }));
          models.push(...ollamaModels);
        }
      } catch (e) {
        // ignore connection refused or other failures
      }
    }

    if (providerId === "deepseek") {
      const key = await getFirstKeyForProvider("deepseek");
      if (!key) return [];
      const me = provider.modelsEndpoint;
      const ep = me ? me.replace(/\/$/, "") : `${epFor()}/models`;
      try {
        const res = await fetch(ep, {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (res.ok) {
          const data = await res.json();
          const dsModels = (data.data || []).map((m) => ({
            id: m.id,
            label: `${provider.name}: ${m.name || m.id}`,
            group: provider.name,
          }));
          models.push(...dsModels);
        }
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    // best-effort
  }

  return models;
}

export async function fetchAIModels() {
  const out = [];
  for (const pid of Object.keys(CONSTANTS.AI_PROVIDERS)) {
    try {
      const m = await fetchModelsForProvider(pid);
      if (m && m.length) out.push(...m);
    } catch (e) {
      // ignore per provider
    }
  }
  return out;
}

export async function testAIKey(providerId, key) {
  const provider = CONSTANTS.AI_PROVIDERS[providerId];
  if (!provider) return { ok: false, error: "Unknown provider" };
  const me = provider.modelsEndpoint;

  try {
    if (providerId === "openai") {
      const ep = me
        ? me.replace(/\/$/, "")
        : `${(provider.endpoint || "").replace(/\/$/, "")}/models`;
      const res = await fetch(ep, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) return { ok: true };
      const text = await res.text();
      return { ok: false, error: `Status ${res.status}: ${text}` };
    }

    if (providerId === "gemini") {
      const epBase = me
        ? me.replace(/\/$/, "")
        : `${(provider.endpoint || "").replace(/\/$/, "")}/models`;
      // prefer header-based key for Google APIs
      const res = await fetch(epBase, { headers: { "x-goog-api-key": key } });
      if (res.ok) return { ok: true };
      const text = await res.text();
      return { ok: false, error: `Status ${res.status}: ${text}` };
    }

    if (providerId === "claude") {
      const ep = me
        ? me.replace(/\/$/, "")
        : `${(provider.endpoint || "").replace(/\/$/, "")}/models`;
      try {
        const res = await fetch(ep, { headers: { "x-api-key": key } });
        if (res.ok) return { ok: true };
        const text = await res.text();
        return { ok: false, error: `Status ${res.status}: ${text}` };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    if (providerId === "ollama") {
      const ep = me
        ? me.replace(/\/$/, "")
        : `${(provider.endpoint || "").replace(/\/$/, "")}/tags`;
      try {
        const res = await fetch(ep);
        if (res.ok) return { ok: true };
        const text = await res.text();
        return { ok: false, error: `Status ${res.status}: ${text}` };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    if (providerId === "deepseek") {
      const ep = me
        ? me.replace(/\/$/, "")
        : `${(provider.endpoint || "").replace(/\/$/, "")}/models`;
      try {
        const res = await fetch(ep, {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (res.ok) return { ok: true };
        const text = await res.text();
        return { ok: false, error: `Status ${res.status}: ${text}` };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    return { ok: false, error: "Provider does not support key testing" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
