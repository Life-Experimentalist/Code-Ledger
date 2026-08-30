/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Resolving the API base URL an AI provider is called on.
 *
 * Every AI handler used to inline the same three-way chain —
 * `settings.{id}_endpoint || settings.aiEndpoint || CONSTANTS default` — and
 * then `fetch()` whatever came back. That value is a code-and-credential
 * exfiltration primitive: the handler posts the user's solution to it and puts
 * the user's API key in the Authorization header, so whoever chooses the URL
 * receives both. Settings are not a trusted input — `settings-sync.js` merges
 * them from a file in the ledger repository and `backup-manager.js` merges them
 * from a snapshot the user may have been handed.
 *
 * What this module actually guarantees, and nothing more:
 *
 *   - the request goes over TLS, unless it goes to loopback. `http:` to a
 *     remote host is rejected, so a stolen override cannot downgrade the
 *     connection and read the key off the wire. `http:` to localhost stays
 *     legal because Ollama's shipped default is `http://localhost:11434/api`.
 *     This costs nothing in reach: an extension page is a secure context, and
 *     the browser's own mixed-content rule already blocks plain `http:` to
 *     anything but a potentially-trustworthy origin, so a LAN endpoint over
 *     `http:` would not have loaded either way.
 *   - a non-URL, or a `javascript:` / `data:` / `file:` scheme, is rejected.
 *   - an override that fails either test is dropped and the built-in default
 *     is used, so a bad value degrades to the shipped behaviour.
 *
 * What it does **not** do: decide whether an `https:` host deserves your key.
 * It cannot. Custom endpoints exist so people can point at Azure OpenAI,
 * LiteLLM, or their own gateway, so any host allow-list narrow enough to be
 * meaningful would break the feature it is guarding. `https://evil.example/v1`
 * passes this check. Keeping an attacker's URL out of settings in the first
 * place is the job of the portability gate in `settings-sync.js`; this is the
 * backstop for the case where one gets in anyway.
 */

import { CONSTANTS } from "./constants.js";

/** Hosts allowed to be reached over plain `http:`. */
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];

/**
 * Is `value` a URL this extension is willing to send a solution and an API key to?
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isSafeEndpoint(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") return LOOPBACK_HOSTS.includes(url.hostname);
  return false;
}

/**
 * The base URL to call `providerId` on.
 *
 * Prefers the provider's own override, then the legacy global `aiEndpoint`,
 * then the shipped default. Any candidate that fails `isSafeEndpoint` is
 * skipped rather than allowed to break the chain, so one poisoned key cannot
 * suppress a good one further down.
 *
 * `aiEndpoint` is read but never written — no UI produces it. It is honoured so
 * that a value set by a much older build keeps working, and validated for the
 * same reason everything else here is.
 *
 * @param {string} providerId a key of `CONSTANTS.AI_PROVIDERS`
 * @param {Record<string, any>} [settings]
 * @returns {string} base URL, with any trailing slash removed
 */
export function resolveEndpoint(providerId, settings = {}) {
  const fallback = CONSTANTS.AI_PROVIDERS[providerId]?.endpoint || "";
  for (const candidate of [settings[`${providerId}_endpoint`], settings.aiEndpoint, fallback]) {
    if (isSafeEndpoint(candidate)) return String(candidate).trim().replace(/\/$/, "");
  }
  return fallback;
}
