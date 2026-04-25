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

export async function fetchModelsForProvider(
  providerId,
  endpointOverride,
  options = {},
) {
  const provider = CONSTANTS.AI_PROVIDERS[providerId];
  if (!provider) return [];
  const models = [];
  const throwOnError = !!options.throwOnError;

  const epFor = (useModelsEndpoint = false) => {
    const baseOverride = endpointOverride
      ? String(endpointOverride).replace(/\/$/, "")
      : null;
    const me = provider.modelsEndpoint;
    if (useModelsEndpoint && me) {
      if (
        baseOverride &&
        provider.endpoint &&
        me.startsWith(provider.endpoint)
      ) {
        return baseOverride + me.substring(provider.endpoint.length);
      }
      return me.replace(/\/$/, "");
    }
    if (baseOverride) return baseOverride;
    return (provider.endpoint || "").replace(/\/$/, "");
  };

  try {
    if (providerId === "gemini") {
      const key = await getFirstKeyForProvider("gemini");
      if (!key) return [];
      const me = provider.modelsEndpoint;
      const ep = me
        ? endpointOverride && me.startsWith(provider.endpoint)
          ? endpointOverride.replace(/\/$/, "") +
            me.substring(provider.endpoint.length)
          : me.replace(/\/$/, "")
        : `${epFor()}/models`;
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
      const ep = me
        ? endpointOverride && me.startsWith(provider.endpoint)
          ? endpointOverride.replace(/\/$/, "") +
            me.substring(provider.endpoint.length)
          : me.replace(/\/$/, "")
        : `${epFor()}/models`;
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
      const ep = me
        ? endpointOverride && me.startsWith(provider.endpoint)
          ? endpointOverride.replace(/\/$/, "") +
            me.substring(provider.endpoint.length)
          : me.replace(/\/$/, "")
        : `${epFor()}/models`;
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
      const ep = me
        ? endpointOverride && me.startsWith(provider.endpoint)
          ? endpointOverride.replace(/\/$/, "") +
            me.substring(provider.endpoint.length)
          : me.replace(/\/$/, "")
        : `${epFor()}/tags`;
      try {
        const res = await fetch(ep);
        if (!res.ok) {
          if (throwOnError) throw new Error(`Status ${res.status}`);
          return models;
        }
        const data = await res.json();
        const tags = data.tags || data;
        const ollamaModels = (Array.isArray(tags) ? tags : []).map((t) => ({
          id: t,
          label: `${provider.name}: ${t}`,
          group: provider.name,
        }));
        models.push(...ollamaModels);
      } catch (e) {
        if (throwOnError) throw e;
      }
    }

    if (providerId === "deepseek") {
      const key = await getFirstKeyForProvider("deepseek");
      if (!key) return [];
      const me = provider.modelsEndpoint;
      const ep = me
        ? endpointOverride && me.startsWith(provider.endpoint)
          ? endpointOverride.replace(/\/$/, "") +
            me.substring(provider.endpoint.length)
          : me.replace(/\/$/, "")
        : `${epFor()}/models`;
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

    if (providerId === "openrouter") {
      const key = await getFirstKeyForProvider("openrouter");
      if (!key) return [];
      const me = provider.modelsEndpoint;
      const ep = me
        ? endpointOverride && me.startsWith(provider.endpoint)
          ? endpointOverride.replace(/\/$/, "") +
            me.substring(provider.endpoint.length)
          : me.replace(/\/$/, "")
        : `${epFor()}/models`;
      try {
        const res = await fetch(ep, {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (res.ok) {
          const data = await res.json();
          const orModels = (data.data || data.models || []).map((m) => ({
            id: m.id || m.name,
            label: `${provider.name}: ${m.name || m.id}`,
            group: provider.name,
          }));
          models.push(...orModels);
        }
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    if (throwOnError) throw e;
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

export async function testAIKey(providerId, key, endpointOverride = "") {
  const provider = CONSTANTS.AI_PROVIDERS[providerId];
  if (!provider) return { ok: false, error: "Unknown provider" };
  const baseOverride = endpointOverride
    ? String(endpointOverride).replace(/\/$/, "")
    : "";
  const endpointForModels = () => {
    const me = provider.modelsEndpoint;
    if (me) {
      if (
        baseOverride &&
        provider.endpoint &&
        me.startsWith(provider.endpoint)
      ) {
        return baseOverride + me.substring(provider.endpoint.length);
      }
      return me.replace(/\/$/, "");
    }
    return `${baseOverride || (provider.endpoint || "").replace(/\/$/, "")}/${
      providerId === "ollama" ? "tags" : "models"
    }`;
  };
  const me = provider.modelsEndpoint;

  try {
    if (providerId === "openai") {
      const ep = endpointForModels();
      const res = await fetch(ep, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) return { ok: true };
      const text = await res.text();
      return { ok: false, error: `Status ${res.status}: ${text}` };
    }

    if (providerId === "gemini") {
      const epBase = endpointForModels();
      // prefer header-based key for Google APIs
      const res = await fetch(epBase, { headers: { "x-goog-api-key": key } });
      if (res.ok) return { ok: true };
      const text = await res.text();
      return { ok: false, error: `Status ${res.status}: ${text}` };
    }

    if (providerId === "claude") {
      const ep = endpointForModels();
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
      const ep = endpointForModels();
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
      const ep = endpointForModels();
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

    if (providerId === "openrouter") {
      const ep = endpointForModels();
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

export async function testProviderEndpoint(providerId, endpointOverride) {
  const provider = CONSTANTS.AI_PROVIDERS[providerId];
  if (!provider) return { ok: false, error: "Unknown provider" };

  const baseOverride = endpointOverride
    ? String(endpointOverride).replace(/\/$/, "")
    : null;
  const me = provider.modelsEndpoint;
  const ep = me
    ? baseOverride && provider.endpoint && me.startsWith(provider.endpoint)
      ? baseOverride + me.substring(provider.endpoint.length)
      : me.replace(/\/$/, "")
    : (baseOverride || (provider.endpoint || "").replace(/\/$/, "")) +
      (providerId === "ollama" ? "/tags" : "/models");

  try {
    const res = await fetch(ep);
    if (res.ok) return { ok: true };
    const text = await res.text();
    return { ok: false, error: `Status ${res.status}: ${text}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
