/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The isolated-world half of `content/net-tap.js`.
 *
 * The tap runs in the page's world, so its messages arrive over
 * `window.postMessage` — a channel the page itself can write to. `parseTapMessage`
 * is the whole boundary: same frame, same origin, right channel name, and a url
 * that is actually a string. Everything past that is treated as a claim about a
 * judge response, and each platform's detector decides for itself whether the
 * claim describes an accepted submission.
 *
 * Worth being clear about the residual risk, because it is not zero: a page
 * that wanted to could post a well-formed message describing an accepted
 * submission, and the handler would commit source of the page's choosing to the
 * user's repository. That is not a privilege escalation — a page can already
 * fabricate the same thing in its own DOM, which is what every other platform
 * handler reads — but it does mean the tap must stay scoped to the two hosts
 * that need it (see the `matches` on the net-tap content script) rather than
 * being enabled site-wide.
 */

const CHANNEL = "codeledger-net-tap";

/**
 * Validate one `message` event and return its payload, or null.
 *
 * Exported separately from `subscribeTap` because this is the whole security
 * boundary and it should be testable without a DOM.
 *
 * @param {{data?: any, source?: any, origin?: string}} event
 * @param {{window?: any, origin?: string}} [ctx] injected for tests
 * @returns {{url: string, status: number, requestBody: string|null,
 *            responseBody: string|null, at: number}|null}
 */
export function parseTapMessage(event, ctx = {}) {
  const win = ctx.window !== undefined ? ctx.window : typeof window !== "undefined" ? window : null;
  const origin =
    ctx.origin !== undefined
      ? ctx.origin
      : win?.location?.origin !== undefined
        ? win.location.origin
        : null;

  if (!event || typeof event !== "object") return null;
  // Same frame only. A message from an iframe or an opener is not our tap.
  if (win && event.source !== win) return null;
  // The tap posts with an explicit target origin, so a mismatch means the
  // message came from somewhere else entirely.
  if (origin && event.origin && event.origin !== origin) return null;

  const d = event.data;
  if (!d || typeof d !== "object" || d.source !== CHANNEL) return null;
  if (typeof d.url !== "string" || !d.url) return null;

  return {
    url: d.url,
    status: typeof d.status === "number" ? d.status : 0,
    requestBody: typeof d.requestBody === "string" ? d.requestBody : null,
    responseBody: typeof d.responseBody === "string" ? d.responseBody : null,
    at: typeof d.at === "number" ? d.at : Date.now(),
  };
}

/**
 * Listen for tapped responses whose url matches `match`.
 *
 * @param {(url: string) => boolean} match
 * @param {(payload: ReturnType<typeof parseTapMessage>) => void} onHit
 * @returns {() => void} unsubscribe
 */
export function subscribeTap(match, onHit) {
  if (typeof window === "undefined") return () => {};

  const listener = (event) => {
    const payload = parseTapMessage(event);
    if (!payload) return;
    if (!match(payload.url)) return;
    try {
      onHit(payload);
    } catch (_) {
      /* a throwing consumer must not kill the listener */
    }
  };

  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

/**
 * `JSON.parse` that returns null instead of throwing.
 * @param {string|null|undefined} text
 * @returns {any}
 */
export function parseJsonSafe(text) {
  if (typeof text !== "string" || !text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}
