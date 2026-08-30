/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Trust check for inbound OAuth `postMessage` events.
 *
 * This lives in one file on purpose. The check was previously inlined in three
 * separate listeners and two of them were wrong — one omitted the origin test
 * entirely, the other explicitly allowlisted origin "null". Both let any page
 * that could reach the listener hand us an attacker-controlled GitHub token,
 * which would silently repoint the user's ledger at a repository they do not
 * own and let the attacker read everything committed afterwards.
 *
 * Any new OAuth listener must call this rather than re-deriving the rules.
 */

/** The one origin any part of the OAuth flow is allowed to come from. */
export const AUTH_ORIGIN = "https://codeledger.vkrishna04.me";

/**
 * True only for the worker's own OAuth callback URL.
 *
 * Used by the background tabs.onUpdated relay, which previously matched three
 * substrings against the raw URL. That accepted any host willing to put those
 * strings in a path or fragment, and pointed a repeated CL_GET_AUTH_DATA probe
 * at the resulting tab. Parse the URL and compare the origin.
 *
 * @param {string|undefined|null} url
 */
export function isAuthCallbackUrl(url) {
  if (typeof url !== "string" || !url) return false;
  try {
    const u = new URL(url);
    return (
      u.origin === AUTH_ORIGIN &&
      u.pathname.startsWith("/api/auth/") &&
      u.pathname.endsWith("/callback")
    );
  } catch {
    return false;
  }
}

/**
 * Origins permitted to deliver a CODELEDGER_AUTH message.
 *
 * "null" is never included. That is the origin reported by sandboxed iframes
 * and by data:/file: documents, so accepting it is equivalent to accepting
 * anyone.
 *
 * @param {string} workerUrl  CONSTANTS.URLS.AUTH_WORKER (may include a path)
 * @param {string} selfOrigin location.origin of the listening document
 * @returns {string[]}
 */
export function trustedAuthOrigins(workerUrl, selfOrigin) {
  const origins = [];
  try {
    origins.push(new URL(workerUrl).origin);
  } catch {
    // A malformed worker URL must not widen the allowlist — skip it.
  }
  if (selfOrigin && selfOrigin !== "null") origins.push(selfOrigin);
  return origins;
}

/**
 * True only for a well-formed auth message from an allowed origin.
 *
 * @param {{origin?: string, data?: any}} event   the MessageEvent
 * @param {string[]} allowedOrigins              from trustedAuthOrigins()
 * @param {string} [expectedProvider]            reject other providers when given
 */
export function isTrustedAuthMessage(event, allowedOrigins, expectedProvider) {
  if (!event || typeof event.origin !== "string") return false;
  if (!allowedOrigins.includes(event.origin)) return false;

  const data = event.data;
  if (!data || typeof data !== "object") return false;
  if (data.type !== "CODELEDGER_AUTH") return false;
  if (typeof data.token !== "string" || !data.token) return false;
  if (expectedProvider && data.provider !== expectedProvider) return false;

  return true;
}
