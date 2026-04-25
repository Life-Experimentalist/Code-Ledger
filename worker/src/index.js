// Cloudflare Worker using Hono
import { Hono } from "hono";
import { serveStatic } from "hono/cloudflare-workers";

const app = new Hono();

/* Utility helpers -------------------------------------------------- */
function base64UrlEncode(input) {
  let str;
  if (input instanceof Uint8Array)
    str = String.fromCharCode.apply(null, Array.from(input));
  else str = input;
  let b64 = btoa(str);
  return b64.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function jsonBase64(obj) {
  return base64UrlEncode(unescape(encodeURIComponent(JSON.stringify(obj))));
}

function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function importPrivateKey(pem) {
  const pkcs8 = pemToArrayBuffer(pem);
  return crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function signWithPrivateKey(privateKey, data) {
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, data);
  return new Uint8Array(sig);
}

// Read environment with optional CODELEDGER_GH_* fallbacks for CI-safe secret names
function getEnvValue(env, key) {
  const mapping = {
    GITHUB_APP_PRIVATE_KEY: "CODELEDGER_GH_APP_PRIVATE_KEY",
    GITHUB_APP_ID: "CODELEDGER_GH_APP_ID",
    GITHUB_APP_WEBHOOK_SECRET: "CODELEDGER_GH_APP_WEBHOOK_SECRET",
    GITHUB_CLIENT_ID: "CODELEDGER_GH_APP_CLIENT_ID",
    GITHUB_CLIENT_SECRET: "CODELEDGER_GH_APP_CLIENT_SECRET",
  };
  const alt = mapping[key];
  return env && (env[key] || (alt ? env[alt] : undefined));
}

let _cachedPrivateKey = null;
async function getImportedKey(env) {
  if (_cachedPrivateKey) return _cachedPrivateKey;
  const pem = getEnvValue(env, "GITHUB_APP_PRIVATE_KEY");
  if (!pem)
    throw new Error(
      "Missing GitHub App private key env (GITHUB_APP_PRIVATE_KEY or CODELEDGER_GH_APP_PRIVATE_KEY)",
    );
  _cachedPrivateKey = await importPrivateKey(pem);
  return _cachedPrivateKey;
}

async function createAppJWT(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: now - 60,
    exp: now + 600,
    iss: Number(getEnvValue(env, "GITHUB_APP_ID")),
  };
  const encoded = `${jsonBase64(header)}.${jsonBase64(payload)}`;
  const key = await getImportedKey(env);
  const data = new TextEncoder().encode(encoded);
  const sig = await signWithPrivateKey(key, data);
  const sigB64 = base64UrlEncode(sig);
  return `${encoded}.${sigB64}`;
}

/* GitHub API helpers ----------------------------------------------- */
async function githubAppRequest(env, path, opts = {}) {
  const jwt = await createAppJWT(env);
  const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
    },
  });
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

async function githubAsInstallation(installationToken, path, opts = {}) {
  const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `token ${installationToken}`,
      Accept: "application/vnd.github+json",
    },
  });
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

/* Routes ----------------------------------------------------------- */
// List installations for the App (requires App JWT)
app.get("/api/app/installations", async (c) => {
  try {
    const json = await githubAppRequest(c.env, "/app/installations");
    return c.json(json);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// Create an installation access token (server-side) and return it
app.post("/api/app/installations/:id/access_tokens", async (c) => {
  const id = c.req.param("id");
  try {
    const json = await githubAppRequest(
      c.env,
      `/app/installations/${id}/access_tokens`,
      { method: "POST" },
    );
    return c.json(json);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// Basic OAuth starter for supported providers (github, gitlab, bitbucket)
app.get("/api/auth/:provider", (c) => {
  const provider = c.req.param("provider")?.toLowerCase();
  const origin = new URL(c.req.url).origin;

  if (provider === "github") {
    const clientId = getEnvValue(c.env, "GITHUB_CLIENT_ID");
    if (!clientId) return c.text("OAuth not configured", 400);
    const redirect = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo`;
    return c.redirect(redirect);
  }

  if (provider === "gitlab") {
    const clientId = getEnvValue(c.env, "GITLAB_CLIENT_ID");
    if (!clientId) return c.text("GitLab OAuth not configured", 400);
    const redirectUri = `${origin}/api/auth/gitlab/callback`;
    const url = `https://gitlab.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read_user+api`;
    return c.redirect(url);
  }

  if (provider === "bitbucket") {
    const clientId = getEnvValue(c.env, "BITBUCKET_CLIENT_ID");
    if (!clientId) return c.text("Bitbucket OAuth not configured", 400);
    const redirectUri = `${origin}/api/auth/bitbucket/callback`;
    const url = `https://bitbucket.org/site/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}`;
    return c.redirect(url);
  }

  return c.text("Unsupported provider", 404);
});

app.get("/api/auth/github/callback", async (c) => {
  const code = c.req.query("code");
  const clientId = getEnvValue(c.env, "GITHUB_CLIENT_ID");
  const clientSecret = getEnvValue(c.env, "GITHUB_CLIENT_SECRET");
  if (!clientId || !clientSecret) return c.text("OAuth not configured", 400);

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });
  const data = await res.json();
  return c.html(
    `<!DOCTYPE html><html><body><script>window.opener.postMessage({ type: 'GITHUB_TOKEN', token: '${data.access_token || ""}' }, '*'); window.close();</script></body></html>`,
  );
});

// Generic OAuth callback handler for GitLab and Bitbucket
app.get("/api/auth/:provider/callback", async (c) => {
  const provider = c.req.param("provider")?.toLowerCase();
  const code = c.req.query("code");
  const origin = new URL(c.req.url).origin;

  if (provider === "gitlab") {
    const clientId = getEnvValue(c.env, "GITLAB_CLIENT_ID");
    const clientSecret = getEnvValue(c.env, "GITLAB_CLIENT_SECRET");
    if (!clientId || !clientSecret)
      return c.text("GitLab OAuth not configured", 400);
    const tokenRes = await fetch("https://gitlab.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${origin}/api/auth/gitlab/callback`,
      }),
    });
    const data = await tokenRes.json();
    return c.html(
      `<!DOCTYPE html><html><body><script>window.opener.postMessage({ type: 'GITLAB_TOKEN', token: '${data.access_token || ""}' }, '*'); window.close();</script></body></html>`,
    );
  }

  if (provider === "bitbucket") {
    const clientId = getEnvValue(c.env, "BITBUCKET_CLIENT_ID");
    const clientSecret = getEnvValue(c.env, "BITBUCKET_CLIENT_SECRET");
    if (!clientId || !clientSecret)
      return c.text("Bitbucket OAuth not configured", 400);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin}/api/auth/bitbucket/callback`,
    });
    const basic =
      typeof btoa === "function"
        ? btoa(`${clientId}:${clientSecret}`)
        : Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch(
      "https://bitbucket.org/site/oauth2/access_token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
    );
    const data = await tokenRes.json();
    return c.html(
      `<!DOCTYPE html><html><body><script>window.opener.postMessage({ type: 'BITBUCKET_TOKEN', token: '${data.access_token || ""}' }, '*'); window.close();</script></body></html>`,
    );
  }

  return c.text("Unsupported provider", 404);
});

// Webhook receiver: verify HMAC-SHA256 signature then accept
app.post("/api/webhook/github", async (c) => {
  const sigHeader = c.req.headers.get("x-hub-signature-256") || "";
  const bodyText = await c.req.text();
  const secret = getEnvValue(c.env, "GITHUB_APP_WEBHOOK_SECRET");
  if (!secret) return c.text("Webhook secret not configured", 500);

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(bodyText));
  const hex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const expected = `sha256=${hex}`;
  if (expected !== sigHeader) return c.text("Invalid signature", 401);

  try {
    const payload = JSON.parse(bodyText);
    return c.json({ ok: true });
  } catch (e) {
    return c.text("Invalid payload", 400);
  }
});

// CORS preflight for canonical endpoint
app.options("/api/data/canonical-map.json", (c) => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS,POST",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
});

// Canonical map endpoint: prefer KV storage, fallback to GitHub raw.
app.get("/api/data/canonical-map.json", async (c) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=3600, s-maxage=86400",
    "Access-Control-Allow-Origin": "*",
  };
  try {
    const kv = c.env.CANONICAL_MAP;
    if (kv) {
      const v = await kv.get("canonical-map");
      if (v) return new Response(v, { status: 200, headers });
    }
  } catch (e) {}
  try {
    const fallbackUrl =
      "https://raw.githubusercontent.com/Life-Experimentalist/Code-Ledger/main/data/canonical-map.json";
    const res = await fetch(fallbackUrl);
    const txt = await res.text();
    return new Response(txt, { status: 200, headers });
  } catch (e) {
    return c.text("Canonical map unavailable", 503);
  }
});

// Admin endpoint to update canonical map in KV (protected via CANONICAL_UPLOAD_TOKEN)
app.post("/api/admin/canonical", async (c) => {
  const authHeader =
    c.req.headers.get("Authorization") ||
    c.req.headers.get("x-admin-token") ||
    "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;
  if (!token || token !== c.env.CANONICAL_UPLOAD_TOKEN)
    return c.text("Unauthorized", 401);
  const body = await c.req.text();
  const kv = c.env.CANONICAL_MAP;
  if (!kv) return c.text("KV not bound", 500);
  await kv.put("canonical-map", body);
  return c.json({ ok: true });
});

// Post-install redirect for GitHub App installs
app.get("/api/post_install", (c) => {
  const installationId =
    c.req.query("installation_id") || c.req.query("installationId") || "";
  const setupAction =
    c.req.query("setup_action") || c.req.query("setupAction") || "";
  const landing = c.env.LANDING_PAGE_URL || "https://codeledger.vkrishna04.me";
  const params = new URLSearchParams();
  if (installationId) params.set("installation_id", installationId);
  if (setupAction) params.set("setup_action", setupAction);
  const dest = `${landing}/?${params.toString()}`;
  return c.redirect(dest);
});

// Serve static landing page and assets from worker/public
app.get("/*", serveStatic({ root: "./public" }));

export default app;
