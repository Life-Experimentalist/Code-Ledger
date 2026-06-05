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
  console.log(
    `[CodeLedger:PresenceMarker] version=${version}, libraryUrl=${libraryUrl}`,
  );

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
      console.log(
        `[CodeLedger:PresenceMarker] ✓ retry loop complete (10 retries sent)`,
      );
    }
  }, 250);
})();
