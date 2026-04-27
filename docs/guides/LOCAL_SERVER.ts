import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON parsing
  app.use(express.json());

  // API Routes (Auth Worker replacements)
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", version: "1.0.0" });
  });

  // Simple OAuth callback proxy for local dev
  app.get("/auth/github/callback", (req, res) => {
    const { code } = req.query;
    res.send(`<html><body><script>
      window.opener.postMessage({ type: 'GITHUB_AUTH_CODE', code: '${code}' }, '*');
      window.close();
    </script></body></html>`);
  });

  // Serve extension files natively
  app.use(express.static(path.join(__dirname, "src")));

  // Fallback for direct library access (web app mode)
  app.get("/library", (req, res) => {
    res.redirect("/library/library.html");
  });

  app.get("/popup", (req, res) => {
    res.redirect("/popup/popup.html");
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CodeLedger server running on http://localhost:${PORT}`);
  });
}

startServer();
