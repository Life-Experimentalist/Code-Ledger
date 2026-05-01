// Detect extension presence and update install button accordingly.
function waitForMarker(timeoutMs = 2000) {
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

    observer.observe(document.documentElement, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(document.getElementById("codeledger-present"));
    }, timeoutMs);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const installBtn = document.getElementById("install-btn");

  // Load config for store links
  let config = {};
  try {
    const r = await fetch("/config.json", { cache: "no-store" });
    if (r.ok) config = await r.json();
  } catch (_) { }

  // If GitHub App redirected here after install, go to library
  const params = new URLSearchParams(window.location.search);
  if (params.get("installation_id")) {
    const q = new URLSearchParams({ installation_id: params.get("installation_id") });
    if (params.get("setup_action")) q.set("setup_action", params.get("setup_action"));
    window.location.href = `/library?${q}`;
    return;
  }

  // Wait for presence-marker.js content script to inject
  const marker = await waitForMarker();

  if (marker) {
    if (installBtn) {
      installBtn.textContent = "📚 Open Library";
      installBtn.href = "/library";
      installBtn.classList.remove("btn-primary");
      installBtn.classList.add("btn-ghost");
    }
  } else {
    if (installBtn) {
      installBtn.textContent = "⬇ Get Extension";
      installBtn.href = config.chrome_store || config.github_releases || config.github_repo || "#";
    }
  }
});
