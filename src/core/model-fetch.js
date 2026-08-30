/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Storage } from "./storage.js";
import { CONSTANTS } from "./constants.js";
import { createDebugger } from "../lib/debug.js";
import { isSafeEndpoint } from "./ai-endpoint.js";

const dbg = createDebugger("ModelFetch");

/**
 * Drop an endpoint override this extension will not send an API key to.
 *
 * These three functions all put the user's key in a header, and their override
 * comes out of settings (`ModelSelector` reads `{provider}_endpoint` straight
 * from the settings map), so the same poisoned value that would redirect a
 * review would redirect the model listing. Returning a falsy value here puts
 * the caller back on the `baseOverride` branch it already has for "no override
 * given", so a rejected value degrades to the shipped endpoint.
 *
 * @param {unknown} value
 * @returns {string} the override, or "" if it is not one we will use
 */
function safeOverride(value) {
  if (isSafeEndpoint(value)) return String(value).trim();
  if (value) dbg.warn("ignoring an endpoint override that is not https (or loopback http)");
  return "";
}

async function getFirstKeyForProvider(providerId) {
  const aiKeys = await Storage.getAIKeys();
  const list = aiKeys[providerId] || [];
  return list.length ? list[0].trim() : null;
}

/**
 * Where a provider's model listing lives, given an optional endpoint override.
 *
 * The override only replaces the part of the URL that is the provider's own
 * base. A `modelsEndpoint` that does not start with `endpoint` is a fixed URL
 * belonging to that vendor, so an override cannot redirect it — which is the
 * behaviour every branch here used to implement separately, and correctly.
 *
 * @param {Record<string, any>} provider an entry of `CONSTANTS.AI_PROVIDERS`
 * @param {string} override already through `safeOverride`
 */
function modelsUrl(provider, override) {
  const base = override ? override.replace(/\/$/, "") : "";
  const me = provider.modelsEndpoint;
  if (me) {
    if (base && provider.endpoint && me.startsWith(provider.endpoint)) {
      return base + me.substring(provider.endpoint.length);
    }
    return me.replace(/\/$/, "");
  }
  const root = base || (provider.endpoint || "").replace(/\/$/, "");
  return root + (provider.modelsPath || "/models");
}

/**
 * The headers a listing request needs: the key where the provider wants it,
 * plus whatever fixed headers it insists on.
 *
 * @param {Record<string, any>} provider
 * @param {string|null} key
 */
function listingHeaders(provider, key) {
  const headers = { ...(provider.headers || {}) };
  const auth = provider.auth;
  if (auth?.header && key) headers[auth.header] = `${auth.prefix || ""}${key}`;
  return headers;
}

/**
 * The two things a listing needs beyond field names: which rows to keep, and
 * what order to show them in.
 *
 * Everything else — the URL, the headers, where the array is, which field names
 * a model — is declared on the provider, so an ordinary provider needs no entry
 * here at all. These three are not ordinary: Gemini lists models that cannot
 * generate content and prefixes every name with `models/`, and Anthropic's
 * catalogue is worth reading newest-first.
 */
const LISTING_QUIRKS = {
  gemini: {
    keep: (m) => m.supportedGenerationMethods?.includes("generateContent"),
    id: (m) => String(m.name || "").replace("models/", ""),
  },
  claude: {
    keep: (m) => String(m.id || "").startsWith("claude"),
    sort: (a, b) => b.id.localeCompare(a.id),
  },
  openai: { sort: (a, b) => a.id.localeCompare(b.id) },
  openrouter: { sort: (a, b) => a.id.localeCompare(b.id) },
};

/**
 * Turn a listing response into `{id, label, group}` rows.
 *
 * @param {string} providerId
 * @param {Record<string, any>} provider
 * @param {any} json
 */
function readModelList(providerId, provider, json) {
  const spec = provider.modelList || {};
  const quirks = LISTING_QUIRKS[providerId] || {};
  const rows = json?.[spec.path] || json?.data || json?.models || [];
  if (!Array.isArray(rows)) return [];
  const idOf = quirks.id || ((m) => m[spec.id || "id"] || m.name || m.id);
  const out = rows
    .filter((m) => (quirks.keep ? quirks.keep(m) : true))
    .map((m) => {
      const id = String(idOf(m) || "");
      return {
        id,
        label: `${provider.name}: ${(spec.label && m[spec.label]) || id}`,
        group: provider.name,
      };
    })
    .filter((m) => m.id);
  return quirks.sort ? out.sort(quirks.sort) : out;
}

/**
 * Every model a provider will list, as `{id, label, group}`.
 *
 * One request, described entirely by the provider's own entry in
 * `CONSTANTS.AI_PROVIDERS`. This used to be six near-identical branches; they
 * had drifted, so whether a failed listing was reported or silently swallowed
 * depended on which provider you had selected rather than on `throwOnError`.
 *
 * @param {string} providerId
 * @param {string} [endpointOverride] a user-supplied base URL, checked here
 * @param {{throwOnError?: boolean}} [options]
 * @returns {Promise<Array<{id: string, label: string, group: string}>>}
 */
export async function fetchModelsForProvider(providerId, endpointOverride, options = {}) {
  dbg.log(`fetchModelsForProvider(): ${providerId}`);
  const provider = CONSTANTS.AI_PROVIDERS[providerId];
  if (!provider) return [];
  const throwOnError = !!options.throwOnError;

  // Normalised once, here, rather than at each use: the override arrives from
  // the settings map and this request carries the user's API key.
  const ep = modelsUrl(provider, safeOverride(endpointOverride));

  // No key means no request. Asking a provider for its catalogue without one
  // would just spend a round trip to be told so.
  const key = provider.auth ? await getFirstKeyForProvider(providerId) : null;
  if (provider.auth && !key) return staticFallback(provider);

  try {
    const res = await fetch(ep, {
      headers: listingHeaders(provider, key),
      ...(provider.timeoutMs ? { signal: AbortSignal.timeout(provider.timeoutMs) } : {}),
    });
    if (!res.ok) {
      if (throwOnError) throw new Error(`Status ${res.status}`);
      return staticFallback(provider);
    }
    const models = readModelList(providerId, provider, await res.json());
    return models.length ? models : staticFallback(provider);
  } catch (e) {
    // A listing that fails is not fatal — the picker falls back to whatever the
    // provider declares statically, and to its default model beyond that.
    if (throwOnError) throw e;
    dbg.warn(`fetchModelsForProvider(): ${providerId} listing failed — ${e?.message}`);
    return staticFallback(provider);
  }
}

/**
 * The models a provider declares outright, for when the live listing gives us
 * nothing. Better than an empty picker, and it is the only thing a provider
 * with no listing endpoint can offer.
 *
 * @param {Record<string, any>} provider
 */
function staticFallback(provider) {
  return (provider.staticModels || []).map((id) => ({
    id,
    label: `${provider.name}: ${id}`,
    group: provider.name,
  }));
}

export async function fetchAIModels() {
  dbg.log(`fetchAIModels(): fetching from ${Object.keys(CONSTANTS.AI_PROVIDERS).length} providers`);
  const out = [];
  for (const pid of Object.keys(CONSTANTS.AI_PROVIDERS)) {
    try {
      const m = await fetchModelsForProvider(pid);
      if (m && m.length) out.push(...m);
    } catch (e) {
      // ignore per provider
    }
  }
  dbg.log(`fetchAIModels(): ✓ loaded ${out.length} total models`);
  return out;
}

/**
 * Whether a key works, asked in the cheapest way a provider allows: list the
 * models with it and see whether the request is accepted.
 *
 * @param {string} providerId
 * @param {string} key
 * @param {string} [endpointOverride]
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function testAIKey(providerId, key, endpointOverride = "") {
  const provider = CONSTANTS.AI_PROVIDERS[providerId];
  if (!provider) return { ok: false, error: "Unknown provider" };
  const ep = modelsUrl(provider, safeOverride(endpointOverride));
  try {
    const res = await fetch(ep, { headers: listingHeaders(provider, key) });
    if (res.ok) return { ok: true };
    return { ok: false, error: `Status ${res.status}: ${await res.text()}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function testProviderEndpoint(providerId, endpointOverride) {
  const provider = CONSTANTS.AI_PROVIDERS[providerId];
  if (!provider) return { ok: false, error: "Unknown provider" };

  if (endpointOverride && !isSafeEndpoint(endpointOverride)) {
    // Say so rather than silently testing the shipped endpoint and reporting a
    // pass for a URL that would never have been used.
    return { ok: false, error: "Endpoint must be an https:// URL (or http:// on localhost)" };
  }
  // No key on this one deliberately: it answers "is anything serving the API
  // here", and a reachability check should not hand a credential to a URL the
  // user is still deciding about.
  const ep = modelsUrl(provider, safeOverride(endpointOverride));

  try {
    const res = await fetch(ep);
    if (res.ok) return { ok: true };
    const text = await res.text();
    return { ok: false, error: `Status ${res.status}: ${text}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
