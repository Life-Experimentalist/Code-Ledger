// Detect extension presence and show appropriate install / open links.
document.addEventListener("DOMContentLoaded", async () => {
  const installBtn = document.getElementById("install-btn");
  const actions = document.querySelector(".actions");

  // Load config (store links, github repo) from the worker-served config.json
  let config = {};
  try {
    const resp = await fetch("/config.json", { cache: "no-store" });
    if (resp.ok) config = await resp.json();
  } catch (e) {
    /* ignore */
  }

  // If GitHub redirected here after app install, forward to the library page
  try {
    const params = new URLSearchParams(window.location.search);
    const installationId = params.get("installation_id");
    if (installationId) {
      const setupAction =
        params.get("setup_action") || params.get("setupAction") || "";
      const notice = document.createElement("div");
      notice.style =
        "position:fixed;top:16px;left:50%;transform:translateX(-50%);background:rgba(6,182,212,0.12);color:#cdeff6;padding:10px 14px;border-radius:8px;z-index:9999;font-weight:600;";
      notice.textContent =
        "GitHub App installed — redirecting to your Library...";
      document.body.prepend(notice);
      setTimeout(() => {
        const q = new URLSearchParams();
        q.set("installation_id", installationId);
        if (setupAction) q.set("setup_action", setupAction);
        window.location.href = `/library?${q.toString()}`;
      }, 1200);
      return;
    }
  } catch (e) {
    /* ignore malformed params */
  }

  // Wait briefly to allow a page-injected marker from the extension
  setTimeout(() => {
    const marker = document.getElementById("codeledger-present");
    const isInstalled = marker !== null;

    if (isInstalled) {
      const source = marker.getAttribute("data-source") || "unknown";
      const browser = marker.getAttribute("data-browser") || "";

      if (installBtn) {
        installBtn.textContent = "Open Library";
        installBtn.classList.remove("btn-primary");
        installBtn.classList.add("btn-secondary");
        installBtn.href = "/library";
        installBtn.style.pointerEvents = "";
      }

      if (actions && !document.getElementById("install-info")) {
        const info = document.createElement("div");
        info.id = "install-info";
        info.style.marginTop = "8px";
        info.style.color = "#9ebbd6";
        info.textContent =
          source === "store"
            ? `Installed from store ${browser}`
            : source === "temporary"
              ? `Temporary add-on ${browser}`
              : "Extension detected";
        actions.appendChild(info);
      }
    } else {
      // Not installed: show download/store links
      if (installBtn) {
        installBtn.textContent = "Get Extension";
        installBtn.href =
          config.chrome_store ||
          config.github_releases ||
          config.github_repo ||
          "#";
        installBtn.classList.add("btn-primary");
      }

      // Configure GitHub App install link
      try {
        const appBtn = document.getElementById("install-app-btn");
        if (appBtn) {
          appBtn.href = config.github_app_install || "#";
        }
      } catch (e) {
        /* ignore */
      }

      if (actions && !document.getElementById("store-links")) {
        const links = document.createElement("div");
        links.id = "store-links";
        links.style.marginTop = "10px";
        links.innerHTML = `
                    <a class="btn btn-secondary" href="${config.chrome_store || "#"}" style="margin-right:8px">Chrome</a>
                    <a class="btn btn-secondary" href="${config.firefox_store || "#"}" style="margin-right:8px">Firefox</a>
                    <a class="btn btn-secondary" href="${config.edge_store || "#"}" style="margin-right:8px">Edge</a>
                    <a class="btn btn-secondary" href="${config.github_releases || config.github_repo || "#"}">GitHub</a>
                `;
        actions.appendChild(links);
      }
    }
  }, 250);
});
