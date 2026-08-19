/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 *
 * CodeLedger landing page enhancements.
 *
 * This file is decoration only. Every install link, every section and every
 * word of copy is already in index.html, so the page renders and works with
 * scripting disabled — which is also what a crawler sees. Nothing here fetches
 * content or reveals hidden text.
 *
 * Two jobs:
 *  1. Detect the installed extension and surface the Library controls.
 *  2. Reveal-on-scroll and the reading-progress bar.
 *
 * Extension detection uses three complementary mechanisms:
 *  1. CustomEvent CODELEDGER_HANDSHAKE — dispatched by presence-marker.js
 *     immediately, with retry. Carries the browser-specific library URL.
 *  2. DOM marker #codeledger-present — fallback for slower pages.
 *  3. sessionStorage cache — avoids flicker on page refresh.
 *
 * The library URL is browser-specific and only the installed extension knows
 * it, so its presence is what proves installation.
 */

const SS_KEY_INSTALLED = "cl_ext_installed";
const SS_KEY_LIBRARY = "cl_ext_library_url";
const SS_KEY_VERSION = "cl_ext_version";

/**
 * The library is a page inside the extension. There is no hosted copy, so
 * without the extension there is nothing to open — every library control stays
 * hidden until the handshake proves it is installed. Linking these to /library
 * as a fallback only produced a 404.
 */
function markInstalled(libraryUrl, version) {
  try {
    sessionStorage.setItem(SS_KEY_INSTALLED, "1");
    if (libraryUrl) sessionStorage.setItem(SS_KEY_LIBRARY, libraryUrl);
    if (version) sessionStorage.setItem(SS_KEY_VERSION, version);
  } catch (_) {}
  updateInstallUI(libraryUrl, version);
}

/**
 * The library URL arrives from a CustomEvent detail, a DOM marker attribute, or
 * sessionStorage — all forgeable by any script running on this page (another
 * extension's content script, for instance). Only an actual extension page URL
 * may ever reach an href; anything else (javascript:, https:, …) is dropped.
 */
function safeLibraryUrl(url) {
  try {
    const proto = new URL(url).protocol;
    if (proto === "chrome-extension:" || proto === "moz-extension:") return url;
  } catch (_) {}
  return "";
}

function updateInstallUI(libraryUrl, version) {
  libraryUrl = safeLibraryUrl(libraryUrl);
  // Without a URL from the extension there is nothing to link to, so leave the
  // page in its install state rather than pointing anywhere.
  if (!libraryUrl) return;

  const btn = document.getElementById("install-btn");
  if (btn) {
    btn.textContent = "📚 Open Library";
    btn.href = libraryUrl;
    btn.classList.remove("btn-primary");
    btn.classList.add("btn-success");
    if (version) btn.title = `Extension v${version} detected`;
  }

  document.querySelectorAll("[data-cl-open]").forEach((el) => {
    el.href = libraryUrl;
    el.hidden = false;
  });

  const badge = document.getElementById("ext-detected-badge");
  if (badge) badge.hidden = false;
}

function waitForDomMarker(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const existing = document.getElementById("codeledger-present");
    if (existing) {
      resolve(existing);
      return;
    }

    const startedAt = Date.now();
    const observer = new MutationObserver(() => {
      const marker = document.getElementById("codeledger-present");
      if (marker) {
        observer.disconnect();
        resolve(marker);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        observer.disconnect();
        resolve(null);
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    setTimeout(() => {
      observer.disconnect();
      resolve(document.getElementById("codeledger-present"));
    }, timeoutMs);
  });
}

/**
 * Arm the scroll reveal.
 *
 * The .js class on <html> is what puts elements into their pre-reveal state, so
 * this observer is the only thing that can bring them back. If the browser has
 * no IntersectionObserver, drop the class instead of leaving the page blank.
 */
function initReveal() {
  const targets = document.querySelectorAll(".reveal, .reveal-stagger");
  if (!("IntersectionObserver" in window)) {
    document.documentElement.classList.remove("js");
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
  );

  targets.forEach((el) => observer.observe(el));
}

/** Reading-progress bar. Transform-only, so it never triggers layout. */
function initScrollProgress() {
  const bar = document.getElementById("scroll-progress");
  if (!bar) return;

  let ticking = false;
  const update = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
    bar.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio))})`;
    ticking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
  update();
}

document.addEventListener("DOMContentLoaded", async () => {
  initReveal();
  initScrollProgress();

  // ── Store links ──────────────────────────────────────────────────────────
  // index.html already carries working hrefs so the page functions without
  // scripting. config.json is allowed to override them, which is how a store
  // URL can change without touching the markup.
  let config = {};
  try {
    const r = await fetch("/config.json", { cache: "no-store" });
    if (r.ok) config = await r.json();
  } catch (_) {}

  const override = (id, url) => {
    const el = document.getElementById(id);
    if (el && url) el.href = url;
  };
  override("install-btn", config.chrome_store);
  override("install-btn-chrome", config.chrome_store);
  override("install-btn-firefox", config.firefox_store);
  override("install-btn-github", config.github_releases);

  // ── Check sessionStorage cache first (no flicker) ───────────────────────
  let detected = false;
  const cachedLibrary = sessionStorage.getItem(SS_KEY_LIBRARY);
  const cachedVersion = sessionStorage.getItem(SS_KEY_VERSION);
  if (sessionStorage.getItem(SS_KEY_INSTALLED) && cachedLibrary) {
    updateInstallUI(cachedLibrary, cachedVersion);
    detected = true;
  }

  // ── Listen for CustomEvent handshake (works for Firefox + all Chromium) ──
  window.addEventListener("CODELEDGER_HANDSHAKE", (e) => {
    if (detected) return;
    detected = true;
    const { libraryUrl, version } = e.detail || {};
    markInstalled(libraryUrl, version);
  });

  // ── Fallback: DOM marker (MutationObserver) ──────────────────────────────
  if (!detected) {
    const marker = await waitForDomMarker(3000);
    if (marker && !detected) {
      detected = true;
      const libraryUrl = marker.getAttribute("data-library-url") || "";
      const version = marker.getAttribute("data-version") || "";
      markInstalled(libraryUrl, version);
    }
  }
});
