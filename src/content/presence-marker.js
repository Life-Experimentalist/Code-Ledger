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
  console.log(`[CodeLedger:PresenceMarker] IIFE starting...`);
  // Supports both Chrome (chrome.*) and Firefox (browser.* / chrome.* alias)
  const _rt = (typeof browser !== "undefined" ? browser : chrome)?.runtime;
  if (!_rt) {
    console.warn(`[CodeLedger:PresenceMarker] runtime unavailable`);
    return;
  }

  const version = _rt.getManifest?.()?.version || "unknown";
  const libraryUrl = _rt.getURL("library/library.html");
  console.log(`[CodeLedger:PresenceMarker] version=${version}, libraryUrl=${libraryUrl}`);

  // ── 1. DOM marker (legacy + MutationObserver path) ──────────────────────
  if (!document.getElementById("codeledger-present")) {
    const marker = document.createElement("div");
    marker.id = "codeledger-present";
    marker.style.display = "none";
    marker.setAttribute("data-version", version);
    marker.setAttribute("data-library-url", libraryUrl);
    marker.setAttribute("data-source", "extension");
    (document.body || document.documentElement).appendChild(marker);
    console.log(`[CodeLedger:PresenceMarker] ✓ DOM marker injected`);
  } else {
    console.log(`[CodeLedger:PresenceMarker] DOM marker already present`);
  }

  // ── 2. CustomEvent handshake (robust cross-browser detection) ────────────
  const detail = { version, libraryUrl, installed: true };
  const fire = () => {
    window.dispatchEvent(new CustomEvent("CODELEDGER_HANDSHAKE", { detail }));
  };

  fire(); // immediate
  console.log(`[CodeLedger:PresenceMarker] ✓ initial CustomEvent dispatched`);

  // Retry for a few seconds to catch pages where our script loads first
  let n = 0;
  const iv = setInterval(() => {
    fire();
    if (++n >= 10) {
      clearInterval(iv);
      console.log(`[CodeLedger:PresenceMarker] ✓ retry loop complete (10 retries sent)`);
    }
  }, 250);

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
  const storageApi = (typeof browser !== "undefined" ? browser : chrome)?.storage;

  function writeAuthToken(provider, token) {
    if (!provider || !token) {
      console.warn(`[CodeLedger:PresenceMarker] writeAuthToken(): skipped — provider=${provider}, token=${!!token}`);
      return;
    }
    console.log(`[CodeLedger:PresenceMarker] writeAuthToken(): dispatching relay for ${provider} (${token.slice(0, 7)}...)`);

    // Primary: sendMessage to SW — Chrome puts this in the IPC queue synchronously,
    // so delivery is guaranteed even if this popup window closes right after.
    // SW writes the token; library page detects it via chrome.storage.onChanged.
    _rt.sendMessage({ type: "CODELEDGER_AUTH_RELAY", provider, token })
      .then(() => console.log(`[CodeLedger:PresenceMarker] ✓ SW relay confirmed`))
      .catch((e) => console.warn(`[CodeLedger:PresenceMarker] SW relay response error (message still delivered):`, e?.message));

    // Belt-and-suspenders: also attempt direct storage write.
    // Faster when context is stable; SW relay is the guarantee when context tears down.
    if (storageApi) {
      storageApi.local.get(AUTH_TOKENS_KEY)
        .then((keys) => {
          const tokens = keys[AUTH_TOKENS_KEY] || {};
          tokens[provider] = token;
          return storageApi.local.set({ [AUTH_TOKENS_KEY]: tokens });
        })
        .then(() => console.log(`[CodeLedger:PresenceMarker] ✓ direct storage write also succeeded`))
        .catch((e) => console.warn(`[CodeLedger:PresenceMarker] direct write skipped (SW relay covers it):`, e?.message));
    }

    // Close popup after 150 ms — both paths have been dispatched by then.
    // The deployed worker's fallback timer is a last resort if this doesn't fire.
    setTimeout(() => { try { window.close(); } catch (_) {} }, 150);
  }

  // Path A: DOM element (primary)
  function relayAuthFromDOM() {
    console.log(`[CodeLedger:PresenceMarker] relayAuthFromDOM(): checking for #codeledger-auth-result`);
    const el = document.getElementById("codeledger-auth-result");
    if (!el) {
      console.log(`[CodeLedger:PresenceMarker] relayAuthFromDOM(): no auth element — not the callback page`);
      return;
    }
    let authData;
    try {
      authData = JSON.parse(el.getAttribute("data-auth") || "");
    } catch (e) {
      console.error(`[CodeLedger:PresenceMarker] relayAuthFromDOM(): JSON.parse failed:`, e);
      return;
    }
    if (!authData || authData.type !== "CODELEDGER_AUTH") {
      console.warn(`[CodeLedger:PresenceMarker] relayAuthFromDOM(): unexpected data shape`, authData?.type);
      return;
    }
    if (!authData.token) {
      console.error(`[CodeLedger:PresenceMarker] relayAuthFromDOM(): auth element present but token missing — error=${authData.error}`);
      return;
    }
    console.log(
      `[CodeLedger:PresenceMarker] OAuth relay (DOM): provider=${authData.provider}, token=${authData.token.slice(0, 7)}...`,
    );
    writeAuthToken(authData.provider, authData.token);
  }
  relayAuthFromDOM();

  // ── Background pull (CL_GET_AUTH_DATA) ──────────────────────────────────────
  // The background's tabs.onUpdated listener sends this once the callback URL is
  // detected and retries for up to 7.5 s, keeping the SW alive the whole time.
  // This is the primary relay path for both Chrome and Firefox.
  _rt.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "CL_GET_AUTH_DATA") return false;
    console.log(`[CodeLedger:PresenceMarker] CL_GET_AUTH_DATA received from background`);
    const el = document.getElementById("codeledger-auth-result");
    if (!el) {
      console.log(`[CodeLedger:PresenceMarker] CL_GET_AUTH_DATA: no #codeledger-auth-result — not the callback page`);
      sendResponse(null);
      return true;
    }
    let data;
    try {
      data = JSON.parse(el.getAttribute("data-auth") || "{}");
    } catch (e) {
      console.error(`[CodeLedger:PresenceMarker] CL_GET_AUTH_DATA: JSON parse failed:`, e);
      sendResponse(null);
      return true;
    }
    if (!data?.token) {
      console.warn(`[CodeLedger:PresenceMarker] CL_GET_AUTH_DATA: element found but no token (error=${data?.error})`);
      sendResponse(null);
      return true;
    }
    console.log(`[CodeLedger:PresenceMarker] CL_GET_AUTH_DATA: ✓ returning token for ${data.provider}`);
    sendResponse({ token: data.token, provider: data.provider || "github" });
    return true;
  });

  // Path B: window.postMessage fallback (for older deployed workers or timing races)
  // event.source !== window guards against cross-frame injection.
  window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "CODELEDGER_AUTH") return;
    if (event.source !== window) return;
    if (!event.data.token) return;
    if (document.getElementById("codeledger-auth-result")) {
      console.log(`[CodeLedger:PresenceMarker] OAuth relay (postMessage): DOM path already handled, skipping`);
      return;
    }
    console.log(
      `[CodeLedger:PresenceMarker] OAuth relay (postMessage fallback): provider=${event.data.provider}`,
    );
    writeAuthToken(event.data.provider, event.data.token);
  });
})();
