// Minimal web library UI for CodeLedger PWA.
// Shows the library if the extension is present, otherwise shows install/connect options.
document.addEventListener("DOMContentLoaded", async () => {
  const root = document.getElementById("root");
  const configResp = await fetch("/config.json").catch(() => null);
  const config = configResp && configResp.ok ? await configResp.json() : {};

  function renderNotInstalled() {
    root.innerHTML = `
      <div style="padding:40px; text-align:center;">
        <img src="/assets/og-image.png" style="width:120px;height:120px;object-fit:contain;margin-bottom:12px" alt="CodeLedger" />
        <h1 style="font-size:32px;margin:8px 0;color:#fff">CodeLedger Library (Web)</h1>
        <p style="color:#9ebbd6;max-width:760px;margin:0 auto 18px">Install the browser extension for a richer experience, or connect directly via GitHub to use the web library.</p>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:18px">
          <a class="btn btn-primary" href="${config.chrome_store || "#"}">Chrome</a>
          <a class="btn btn-secondary" href="${config.firefox_store || "#"}">Firefox</a>
          <a class="btn btn-secondary" href="${config.edge_store || "#"}">Edge</a>
          <a class="btn btn-secondary" href="${config.github_releases || config.github_repo || "#"}">GitHub</a>
        </div>
        <div style="margin-top:24px">
          <a class="btn btn-secondary" href="/auth/github">Connect with GitHub</a>
        </div>
      </div>
    `;
  }

  function renderInstalled(marker) {
    const source = marker.getAttribute("data-source") || "unknown";
    const browser = marker.getAttribute("data-browser") || "";
    root.innerHTML = `
      <div style="padding:16px;">
        <header style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px;background:#0a0a0f;border-bottom:1px solid rgba(255,255,255,0.05)">
          <div style="display:flex;gap:12px;align-items:center">
            <img src="/assets/og-image.png" style="width:36px;height:36px;object-fit:contain" alt="CL"/>
            <h2 style="margin:0;color:#fff">CodeLedger Library</h2>
          </div>
          <div style="color:#9ebbd6;font-size:13px">${source === "store" ? "Installed from store" : source === "temporary" ? "Temporary add-on" : "Extension present"}${browser ? " • " + browser : ""}</div>
        </header>
        <main style="padding:20px">
          <p style="color:#cbd5e1">This opens the local library stored in your browser (IndexedDB). The extension keeps this in sync with your GitHub repo when available.</p>
          <div style="margin-top:18px">
            <button id="open-extension" class="btn btn-primary">Open in Extension</button>
            <button id="open-web" class="btn btn-secondary" style="margin-left:8px">Open Web Library</button>
          </div>
        </main>
      </div>
    `;

    document.getElementById("open-extension").addEventListener("click", () => {
      // Signal extension to open library via window messaging - extension should listen for this message.
      window.postMessage({ type: "codeledger:open-library" }, "*");
    });
    document.getElementById("open-web").addEventListener("click", () => {
      // Render a simple local problems view (reads from IndexedDB)
      renderLocalProblemsView();
    });
  }

  async function renderLocalProblemsView() {
    // Try to read IndexedDB (same name as extension) and list problems, fallback to a placeholder
    try {
      const openDB = indexedDB.open("codeledger");
      openDB.onupgradeneeded = () => {
        /* no-op */
      };
      openDB.onerror = () => {
        throw new Error("db-open");
      };
      openDB.onsuccess = async () => {
        const db = openDB.result;
        const tx = db.transaction("problems", "readonly");
        const store = tx.objectStore("problems");
        const req = store.getAll();
        req.onsuccess = () => {
          const items = req.result || [];
          const list =
            items
              .map(
                (i) =>
                  `<li style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.03)"><strong>${i.title || i.id}</strong> <span style="color:#94a3b8">${i.platform || ""} ${i.language ? "• " + i.language : ""}</span></li>`,
              )
              .join("") ||
            '<li style="padding:8px;color:#94a3b8">No problems found locally.</li>';
          document.querySelector("main").innerHTML =
            `<h3 style="color:#fff">Local Library</h3><ul style="list-style:none;padding:0;margin-top:12px">${list}</ul>`;
        };
        req.onerror = () => {
          document.querySelector("main").innerHTML =
            '<p style="color:#94a3b8">Unable to read local library.</p>';
        };
      };
    } catch (e) {
      document.querySelector("main").innerHTML =
        '<p style="color:#94a3b8">Local library unavailable (IndexedDB not accessible).</p>';
    }
  }

  // Detect extension marker
  setTimeout(() => {
    const marker = document.getElementById("codeledger-present");
    if (marker) renderInstalled(marker);
    else renderNotInstalled();
  }, 200);
});
