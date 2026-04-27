// Detect extension presence and update install button accordingly.
document.addEventListener("DOMContentLoaded", async () => {
  const installBtn = document.getElementById("install-btn");

  // Load config for store links
  let config = {};
  try {
    const r = await fetch("/config.json", { cache: "no-store" });
    if (r.ok) config = await r.json();
  } catch (_) {}

  // If GitHub App redirected here after install, go to library
  const params = new URLSearchParams(window.location.search);
  if (params.get("installation_id")) {
    const q = new URLSearchParams({ installation_id: params.get("installation_id") });
    if (params.get("setup_action")) q.set("setup_action", params.get("setup_action"));
    window.location.href = `/library?${q}`;
    return;
  }

  // Wait for presence-marker.js content script to inject
  await new Promise(r => setTimeout(r, 350));
  const marker = document.getElementById("codeledger-present");

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
