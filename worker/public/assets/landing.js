/**
 * CodeLedger landing page logic.
 *
 * Extension detection uses two complementary mechanisms:
 *  1. CustomEvent CODELEDGER_HANDSHAKE — dispatched by presence-marker.js
 *     immediately, with retry. Carries the browser-specific library URL.
 *  2. DOM marker #codeledger-present — fallback for slower pages.
 *  3. sessionStorage cache — avoids flicker on page refresh.
 *
 * Works on Chrome, Edge, Brave, and Firefox (the library URL is browser-specific
 * but only the installed extension knows it, so it's safe to use as a proof).
 */

const SS_KEY_INSTALLED  = "cl_ext_installed";
const SS_KEY_LIBRARY    = "cl_ext_library_url";
const SS_KEY_VERSION    = "cl_ext_version";

function markInstalled(libraryUrl, version) {
  try {
    sessionStorage.setItem(SS_KEY_INSTALLED, "1");
    if (libraryUrl) sessionStorage.setItem(SS_KEY_LIBRARY, libraryUrl);
    if (version)    sessionStorage.setItem(SS_KEY_VERSION, version);
  } catch (_) { }
  updateInstallUI(libraryUrl, version);
}

function updateInstallUI(libraryUrl, version) {
  const btn = document.getElementById("install-btn");
  if (!btn) return;

  btn.textContent = "📚 Open Library";
  btn.href = libraryUrl || "/library";
  btn.classList.remove("btn-primary");
  btn.classList.add("btn-success");
  if (version) btn.title = `Extension v${version} detected`;

  // Also update any secondary CTAs
  const openBtns = document.querySelectorAll("[data-cl-open]");
  openBtns.forEach((el) => {
    el.href = libraryUrl || "/library";
    el.classList.add("detected");
  });

  // Show "detected" badge if present
  const badge = document.getElementById("ext-detected-badge");
  if (badge) badge.hidden = false;

  // Update all library links to point to the extension library when known
  if (libraryUrl) {
    document.querySelectorAll("[data-cl-open]").forEach((el) => {
      el.href = libraryUrl;
    });
  }

  // Hide "install" hints if present
  document.querySelectorAll("[data-cl-hide-when-installed]").forEach((el) => {
    el.style.display = "none";
  });
  document.querySelectorAll("[data-cl-show-when-installed]").forEach((el) => {
    el.style.display = "";
  });
}

function waitForDomMarker(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const existing = document.getElementById("codeledger-present");
    if (existing) { resolve(existing); return; }

    const startedAt = Date.now();
    const observer = new MutationObserver(() => {
      const marker = document.getElementById("codeledger-present");
      if (marker) { observer.disconnect(); resolve(marker); return; }
      if (Date.now() - startedAt >= timeoutMs) { observer.disconnect(); resolve(null); }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(document.getElementById("codeledger-present")); }, timeoutMs);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  // ── GitHub App post-install redirect ────────────────────────────────────
  const params = new URLSearchParams(window.location.search);
  if (params.get("installation_id")) {
    const q = new URLSearchParams({ installation_id: params.get("installation_id") });
    if (params.get("setup_action")) q.set("setup_action", params.get("setup_action"));
    window.location.href = `/library?${q}`;
    return;
  }

  // ── Load store config ────────────────────────────────────────────────────
  let config = {};
  try {
    const r = await fetch("/config.json", { cache: "no-store" });
    if (r.ok) config = await r.json();
  } catch (_) { }

  // ── Populate install links from config ───────────────────────────────────
  const installBtn = document.getElementById("install-btn");
  if (installBtn && installBtn.href === window.location.origin + "/#") {
    const storeUrl = config.chrome_store || config.github_releases || config.github_repo || "#";
    installBtn.href = storeUrl;
  }
  const ffBtn = document.getElementById("install-btn-firefox");
  if (ffBtn) {
    ffBtn.href = config.firefox_store || config.github_releases || config.github_repo || "#";
  }
  const ghBtn = document.getElementById("install-btn-github");
  if (ghBtn) {
    ghBtn.href = config.github_releases || config.github_repo || "#";
  }

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
  }, { once: false });

  // ── Fallback: DOM marker (MutationObserver) ──────────────────────────────
  if (!detected) {
    const marker = await waitForDomMarker(3000);
    if (marker && !detected) {
      detected = true;
      const libraryUrl = marker.getAttribute("data-library-url") || "/library";
      const version = marker.getAttribute("data-version") || "";
      markInstalled(libraryUrl, version);
    }
  }

  // ── Not detected after timeout — show install links ──────────────────────
  if (!detected) {
    const installFallbackUrl = config.chrome_store || config.github_releases || config.github_repo || "#";
    if (installBtn && !installBtn.classList.contains("btn-success")) {
      installBtn.href = installFallbackUrl;
    }
  }
});

// ── Smooth scroll for anchor links ────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const target = document.querySelector(a.getAttribute("href"));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: "smooth" }); }
  });
});
