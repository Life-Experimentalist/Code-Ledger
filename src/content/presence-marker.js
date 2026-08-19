/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Runs on codeledger.vkrishna04.me to announce extension presence.
 * Two mechanisms for maximum reliability across Chrome, Edge, Brave, Firefox:
 *
 * 1. DOM marker (#codeledger-present) — checked by MutationObserver in landing.js
 * 2. CustomEvent (CODELEDGER_HANDSHAKE) — dispatched immediately and retried for
 *    race conditions; landing.js listens and stores the library URL in sessionStorage.
 *
 * Both mechanisms carry the extension version and the chrome-extension:// (or
 * moz-extension://) URL to the library page, which is browser-specific and only
 * the installed extension knows.
 */

(function injectPresenceMarker() {
  // Supports both Chrome (chrome.*) and Firefox (browser.* / chrome.* alias)
  const _rt = (typeof browser !== "undefined" ? browser : chrome)?.runtime;
  const storageApi = (typeof browser !== "undefined" ? browser : chrome)?.storage;

  // This file is a plain content script, not a module, so it cannot import
  // createDebugger — and the console patching debug.js installs lives in a
  // different world and never reaches here. Unguarded, every visitor to the
  // landing page got ~30 lines in their console. Same shape as createDebugger:
  // a getter returning a bound console method, so DevTools still reports the
  // call site rather than this file. Errors stay unconditional, matching
  // rawError() elsewhere.
  const PREFIX = `[CodeLedger:PresenceMarker]`;
  let _debug = false;
  const noop = () => {};
  const dbg = {
    get log() {
      return _debug ? console.log.bind(console, PREFIX) : noop;
    },
    get warn() {
      return _debug ? console.warn.bind(console, PREFIX) : noop;
    },
    get error() {
      return console.error.bind(console, PREFIX);
    },
  };

  if (!_rt) {
    dbg.warn(`runtime unavailable`);
    return;
  }

  const version = _rt.getManifest?.()?.version || "unknown";
  const libraryUrl = _rt.getURL("library/library.html");

  // The flag resolves after the synchronous work below has already run, so
  // restate what that work saw instead of losing it to the race.
  //
  // Wrapped because everything after this point is the OAuth relay, and a
  // browser whose storage.local.get is callback-style rather than promise-based
  // would throw on .then() and abort the whole IIFE — taking the presence
  // marker and the relay with it. A debug flag is never worth that.
  try {
    Promise.resolve(storageApi?.local?.get("codeledger.debug"))
      .then((r) => {
        _debug = r?.["codeledger.debug"] === true;
        dbg.log(`started — version=${version}, libraryUrl=${libraryUrl}`);
      })
      .catch(noop);
  } catch (_) {
    /* debug stays off */
  }

  // ── 1. DOM marker (legacy + MutationObserver path) ──────────────────────
  if (!document.getElementById("codeledger-present")) {
    const marker = document.createElement("div");
    marker.id = "codeledger-present";
    marker.style.display = "none";
    marker.setAttribute("data-version", version);
    marker.setAttribute("data-library-url", libraryUrl);
    marker.setAttribute("data-source", "extension");
    (document.body || document.documentElement).appendChild(marker);
    dbg.log(`✓ DOM marker injected`);
  } else {
    dbg.log(`DOM marker already present`);
  }

  // ── 2. CustomEvent handshake (robust cross-browser detection) ────────────
  const detail = { version, libraryUrl, installed: true };
  const fire = () => {
    // Firefox Xray vision hides content-script objects from the page — its
    // listener would see e.detail === null. cloneInto() (a Firefox sandbox
    // global) exports the object into the page compartment; Chrome has no
    // cloneInto and needs none.
    const clone = globalThis.cloneInto;
    const pageDetail = typeof clone === "function" ? clone(detail, window) : detail;
    window.dispatchEvent(new CustomEvent("CODELEDGER_HANDSHAKE", { detail: pageDetail }));
  };

  fire(); // immediate
  dbg.log(`✓ initial CustomEvent dispatched`);

  // Retry for a few seconds to catch pages where our script loads first
  let n = 0;
  const iv = setInterval(() => {
    fire();
    if (++n >= 10) {
      clearInterval(iv);
      dbg.log(`✓ retry loop complete (10 retries sent)`);
    }
  }, 250);

  // ── 3. Open-library relay ────────────────────────────────────────────────
  // A web page cannot reliably navigate to an extension URL itself, so a click
  // on an "Open Library" control dispatches this event and the background opens
  // the tab via tabs.create. The event carries no data — the worst a hostile
  // page script on this origin can do is open the user's own library.
  window.addEventListener("CODELEDGER_OPEN_LIBRARY", () => {
    dbg.log(`CODELEDGER_OPEN_LIBRARY received — asking background to open the library`);
    try {
      Promise.resolve(_rt.sendMessage({ type: "OPEN_LIBRARY" })).catch(noop);
    } catch (_) {
      /* extension context torn down — nothing to open */
    }
  });

  // ── OAuth relay ───────────────────────────────────────────────────────────
  //
  // GitHub's COOP header clears window.opener, so the callback page cannot use
  // opener.postMessage. Two relay paths are provided for belt-and-suspenders
  // reliability across browsers and deployment states:
  //
  //   A. DOM element  — callback page writes #codeledger-auth-result at document_end.
  //      Read synchronously; most reliable when the popup outlives document_end.
  //
  //   B. window.postMessage — callback page also dispatches a same-page postMessage
  //      as a fallback for race conditions or older deployed worker versions.
  //
  // Both paths converge at writeAuthToken(), which writes directly to
  // chrome.storage.local. This is crucial for Firefox: runtime.sendMessage()
  // from a content script in a closing popup may not complete before the SW
  // processes it, but storage writes are committed immediately and persist.
  // The library page's chrome.storage.onChanged listener picks up the new token.

  const AUTH_TOKENS_KEY = "auth.tokens";

  function writeAuthToken(provider, token) {
    if (!provider || !token) {
      dbg.warn(`writeAuthToken(): skipped — provider=${provider}, token=${!!token}`);
      return;
    }
    dbg.log(`writeAuthToken(): dispatching relay for ${provider}`);

    // Primary: sendMessage to SW — Chrome puts this in the IPC queue synchronously,
    // so delivery is guaranteed even if this popup window closes right after.
    // SW writes the token; library page detects it via chrome.storage.onChanged.
    _rt
      .sendMessage({ type: "CODELEDGER_AUTH_RELAY", provider, token })
      .then(() => dbg.log(`✓ SW relay confirmed`))
      .catch((e) => dbg.warn(`SW relay response error (message still delivered):`, e?.message));

    // Belt-and-suspenders: also attempt direct storage write.
    // Faster when context is stable; SW relay is the guarantee when context tears down.
    if (storageApi) {
      storageApi.local
        .get(AUTH_TOKENS_KEY)
        .then((keys) => {
          const tokens = keys[AUTH_TOKENS_KEY] || {};
          tokens[provider] = token;
          return storageApi.local.set({ [AUTH_TOKENS_KEY]: tokens });
        })
        .then(() => dbg.log(`✓ direct storage write also succeeded`))
        .catch((e) => dbg.warn(`direct write skipped (SW relay covers it):`, e?.message));
    }

    // Close popup after 150 ms — both paths have been dispatched by then.
    // The deployed worker's fallback timer is a last resort if this doesn't fire.
    setTimeout(() => {
      try {
        window.close();
      } catch (_) {}
    }, 150);
  }

  // Path A: DOM element (primary)
  function relayAuthFromDOM() {
    dbg.log(`relayAuthFromDOM(): checking for #codeledger-auth-result`);
    const el = document.getElementById("codeledger-auth-result");
    if (!el) {
      dbg.log(`relayAuthFromDOM(): no auth element — not the callback page`);
      return;
    }
    let authData;
    try {
      authData = JSON.parse(el.getAttribute("data-auth") || "");
    } catch (e) {
      dbg.error(`relayAuthFromDOM(): JSON.parse failed:`, e);
      return;
    }
    if (!authData || authData.type !== "CODELEDGER_AUTH") {
      dbg.warn(`relayAuthFromDOM(): unexpected data shape`, authData?.type);
      return;
    }
    if (!authData.token) {
      dbg.error(
        `relayAuthFromDOM(): auth element present but token missing — error=${authData.error}`,
      );
      return;
    }
    // Never log any part of the token — this page is the OAuth callback and its
    // console is readable by anything with devtools access to the tab.
    dbg.log(`OAuth relay (DOM): provider=${authData.provider}`);
    writeAuthToken(authData.provider, authData.token);
  }
  relayAuthFromDOM();

  // ── Background pull (CL_GET_AUTH_DATA) ──────────────────────────────────────
  // The background's tabs.onUpdated listener sends this once the callback URL is
  // detected and retries for up to 7.5 s, keeping the SW alive the whole time.
  // This is the primary relay path for both Chrome and Firefox.
  _rt.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "CL_GET_AUTH_DATA") return false;
    dbg.log(`CL_GET_AUTH_DATA received from background`);
    const el = document.getElementById("codeledger-auth-result");
    if (!el) {
      dbg.log(`CL_GET_AUTH_DATA: no #codeledger-auth-result — not the callback page`);
      sendResponse(null);
      return true;
    }
    let data;
    try {
      data = JSON.parse(el.getAttribute("data-auth") || "{}");
    } catch (e) {
      dbg.error(`CL_GET_AUTH_DATA: JSON parse failed:`, e);
      sendResponse(null);
      return true;
    }
    if (!data?.token) {
      dbg.warn(`CL_GET_AUTH_DATA: element found but no token (error=${data?.error})`);
      sendResponse(null);
      return true;
    }
    dbg.log(`CL_GET_AUTH_DATA: ✓ returning token for ${data.provider}`);
    sendResponse({ token: data.token, provider: data.provider || "github" });
    return true;
  });

  // Path B: window.postMessage fallback (for older deployed workers or timing races)
  // event.source !== window guards against cross-frame injection.
  window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "CODELEDGER_AUTH") return;
    // Same document only, and belt-and-braces on the origin. event.source ===
    // window already implies this page posted it, but an explicit origin check
    // means a future refactor that relaxes the source check cannot open a hole.
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    if (!event.data.token) return;
    if (document.getElementById("codeledger-auth-result")) {
      dbg.log(`OAuth relay (postMessage): DOM path already handled, skipping`);
      return;
    }
    dbg.log(`OAuth relay (postMessage fallback): provider=${event.data.provider}`);
    writeAuthToken(event.data.provider, event.data.token);
  });
})();
