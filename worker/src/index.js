/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CodeLedger Cloudflare Worker
 * Handles: GitHub OAuth flow, static landing page, canonical map KV
 *
 * Required secrets (set via `wrangler secret put`):
 *   CODELEDGER_GH_APP_CLIENT_ID       — GitHub OAuth App client ID
 *   CODELEDGER_GH_APP_CLIENT_SECRET   — GitHub OAuth App client secret
 *   CANONICAL_UPLOAD_TOKEN            — random token for /api/admin/canonical
 *
 * Optional (for GitHub App JWT features):
 *   CODELEDGER_GH_APP_PRIVATE_KEY     — PKCS#8 PEM private key
 *   CODELEDGER_GH_APP_ID              — GitHub App numeric ID
 *   CODELEDGER_GH_APP_WEBHOOK_SECRET  — webhook HMAC secret
 *
 * KV binding: CANONICAL_MAP
 */
import { Hono } from "hono";
import { serveStatic } from "hono/cloudflare-workers";

const app = new Hono();

/* ── CORS headers ─────────────────────────────────────────────────── */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

app.options("*", (c) => new Response(null, { status: 204, headers: CORS_HEADERS }));

/* ── Env helper ───────────────────────────────────────────────────── */

function env(c, key) {
  const aliases = {
    GH_CLIENT_ID:     ["CODELEDGER_GH_APP_CLIENT_ID",     "GITHUB_CLIENT_ID"],
    GH_CLIENT_SECRET: ["CODELEDGER_GH_APP_CLIENT_SECRET",  "GITHUB_CLIENT_SECRET"],
    GH_APP_KEY:       ["CODELEDGER_GH_APP_PRIVATE_KEY",    "GITHUB_APP_PRIVATE_KEY"],
    GH_APP_ID:        ["CODELEDGER_GH_APP_ID",             "GITHUB_APP_ID"],
    GH_WEBHOOK_SECRET:["CODELEDGER_GH_APP_WEBHOOK_SECRET", "GITHUB_APP_WEBHOOK_SECRET"],
  };
  const names = aliases[key] || [key];
  for (const name of names) {
    if (c.env?.[name]) return c.env[name];
  }
  return undefined;
}

/* ── GitHub App JWT helpers (optional — only used if key is present) ─ */

function base64UrlEncode(bytes) {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function jsonBase64(obj) {
  return base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(obj))
  );
}

/**
 * Converts PEM (PKCS#1 or PKCS#8) to a PKCS#8 ArrayBuffer.
 * GitHub downloads PKCS#1 (.pem); crypto.subtle needs PKCS#8.
 */
function pemToArrayBuffer(pem) {
  const isPkcs1 = pem.includes("BEGIN RSA PRIVATE KEY");
  const b64 = pem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, "")
    .replace(/-----END (RSA )?PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const pkcs1 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) pkcs1[i] = binary.charCodeAt(i);

  if (!isPkcs1) return pkcs1.buffer;

  // Wrap PKCS#1 in a PKCS#8 ASN.1 envelope
  const rsaOid = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09,
    0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
    0x05, 0x00,
  ]);
  const encLen = (n) =>
    n < 128 ? new Uint8Array([n])
    : n < 256 ? new Uint8Array([0x81, n])
    : new Uint8Array([0x82, (n >> 8) & 0xff, n & 0xff]);
  const concat = (...arrs) => {
    const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0));
    let off = 0;
    for (const a of arrs) { out.set(a, off); off += a.length; }
    return out;
  };
  const octet = concat(new Uint8Array([0x04]), encLen(pkcs1.length), pkcs1);
  const inner = concat(rsaOid, octet);
  const pkcs8 = concat(new Uint8Array([0x30]), encLen(inner.length), inner);
  return pkcs8.buffer;
}

let _cachedKey = null;
async function getAppJwtKey(c) {
  if (_cachedKey) return _cachedKey;
  const pem = env(c, "GH_APP_KEY");
  if (!pem) return null;
  _cachedKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return _cachedKey;
}

async function createAppJWT(c) {
  const key = await getAppJwtKey(c);
  if (!key) throw new Error("GitHub App private key not configured");
  const appId = env(c, "GH_APP_ID");
  if (!appId) throw new Error("GitHub App ID not configured");

  const now = Math.floor(Date.now() / 1000);
  const payload = `${jsonBase64({ alg: "RS256", typ: "JWT" })}.${jsonBase64({
    iat: now - 60, exp: now + 600, iss: Number(appId),
  })}`;
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(payload)
  );
  return `${payload}.${base64UrlEncode(new Uint8Array(sig))}`;
}

/* ── OAuth postMessage helper ─────────────────────────────────────── */

/**
 * Returns an HTML page that posts CODELEDGER_AUTH to window.opener then closes.
 * The extension's handleOAuth listens for exactly type === 'CODELEDGER_AUTH'.
 */
function authCallbackHtml(provider, token, error = "") {
  const msg = JSON.stringify({ type: "CODELEDGER_AUTH", provider, token, error });
  const status = token
    ? "Authentication successful. Closing…"
    : `Authentication failed: ${error || "unknown error"}`;
  return `<!DOCTYPE html>
<html><head><title>CodeLedger Auth</title>
<style>body{font-family:system-ui,sans-serif;background:#050508;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style>
</head><body>
<p>${status}</p>
<script>
(function(){
  var msg = ${msg};
  if(window.opener){try{window.opener.postMessage(msg,'*');}catch(e){}}
  if(${JSON.stringify(!!token)}) setTimeout(function(){try{window.close();}catch(e){}},1200);
})();
</script>
</body></html>`;
}

/* ── Routes ───────────────────────────────────────────────────────── */

// Health — used for smoke testing + uptime monitoring
app.get("/api/health", (c) =>
  c.json({ ok: true, version: "1.0.0", ts: Date.now() }, 200, CORS_HEADERS)
);

// GitHub App: list installations (requires App key configured)
app.get("/api/app/installations", async (c) => {
  try {
    const jwt = await createAppJWT(c);
    const res = await fetch("https://api.github.com/app/installations", {
      headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json" },
    });
    return c.json(await res.json(), res.status, CORS_HEADERS);
  } catch (e) {
    return c.json({ error: e.message }, 500, CORS_HEADERS);
  }
});

// GitHub App: create installation access token
app.post("/api/app/installations/:id/access_tokens", async (c) => {
  const id = c.req.param("id");
  try {
    const jwt = await createAppJWT(c);
    const res = await fetch(`https://api.github.com/app/installations/${id}/access_tokens`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json" },
    });
    return c.json(await res.json(), res.status, CORS_HEADERS);
  } catch (e) {
    return c.json({ error: e.message }, 500, CORS_HEADERS);
  }
});

// OAuth: redirect to provider
app.get("/api/auth/:provider", (c) => {
  const provider = c.req.param("provider")?.toLowerCase();
  const origin = new URL(c.req.url).origin;

  if (provider === "github") {
    const clientId = env(c, "GH_CLIENT_ID");
    if (!clientId) return c.text("GitHub OAuth not configured — set CODELEDGER_GH_APP_CLIENT_ID", 400);
    const redirectUri = `${origin}/api/auth/github/callback`;
    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo`;
    return c.redirect(url);
  }

  return c.json({ error: `Unsupported provider: ${provider}` }, 404, CORS_HEADERS);
});

// GitHub OAuth callback
app.get("/api/auth/github/callback", async (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");
  const errorDesc = c.req.query("error_description");

  if (error) {
    return c.html(authCallbackHtml("github", "", errorDesc || error));
  }

  if (!code) {
    return c.html(authCallbackHtml("github", "", "No code received from GitHub"));
  }

  const clientId = env(c, "GH_CLIENT_ID");
  const clientSecret = env(c, "GH_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return c.html(authCallbackHtml("github", "", "OAuth not configured on server"));
  }

  try {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const data = await res.json();
    const token = data.access_token || "";
    const err = data.error_description || data.error || "";
    return c.html(authCallbackHtml("github", token, err));
  } catch (e) {
    return c.html(authCallbackHtml("github", "", e.message));
  }
});

// GitHub webhook receiver
app.post("/api/webhook/github", async (c) => {
  const sigHeader = c.req.header("x-hub-signature-256") || "";
  const bodyText = await c.req.text();
  const secret = env(c, "GH_WEBHOOK_SECRET");

  if (secret) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(bodyText));
    const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (`sha256=${hex}` !== sigHeader) {
      return c.text("Invalid signature", 401);
    }
  }

  return c.json({ ok: true }, 200, CORS_HEADERS);
});

// Canonical map: read from KV or GitHub raw fallback
app.get("/api/data/canonical-map.json", async (c) => {
  const headers = { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" };
  try {
    const kv = c.env?.CANONICAL_MAP;
    if (kv) {
      const v = await kv.get("canonical-map");
      if (v) return new Response(v, { status: 200, headers });
    }
  } catch (_) {}
  try {
    const res = await fetch(
      "https://raw.githubusercontent.com/Life-Experimentalist/Code-Ledger/main/data/canonical-map.json"
    );
    return new Response(await res.text(), { status: 200, headers });
  } catch (e) {
    return c.json({ error: "Canonical map unavailable" }, 503, CORS_HEADERS);
  }
});

// Canonical map: admin update (protected)
app.post("/api/admin/canonical", async (c) => {
  const auth = c.req.header("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!token || token !== c.env?.CANONICAL_UPLOAD_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401, CORS_HEADERS);
  }
  const kv = c.env?.CANONICAL_MAP;
  if (!kv) return c.json({ error: "KV not bound" }, 500, CORS_HEADERS);
  await kv.put("canonical-map", await c.req.text());
  return c.json({ ok: true }, 200, CORS_HEADERS);
});

// Post-install redirect from GitHub App marketplace
app.get("/api/post_install", (c) => {
  const installId = c.req.query("installation_id") || "";
  const action = c.req.query("setup_action") || "";
  const params = new URLSearchParams();
  if (installId) params.set("installation_id", installId);
  if (action) params.set("setup_action", action);
  return c.redirect(`/?${params.toString()}`);
});

// Static assets — must be last
app.get("/*", serveStatic({ root: "./public" }));

export default app;
