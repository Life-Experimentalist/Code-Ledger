/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CodeLedger Cloudflare Worker
 * Handles: GitHub OAuth flow, static landing page, canonical map KV
 *
 * Required secrets (set via `wrangler secret put`):
 *   CODELEDGER_OAUTH_CLIENT_ID        — OAuth App client ID
 *   CODELEDGER_OAUTH_CLIENT_SECRET    — OAuth App client secret
 *   SESSION_SECRET                    — random secret, signs the OAuth state cookie
 *
 * Optional:
 *   CANONICAL_UPLOAD_TOKEN            — random token for /api/admin/canonical.
 *                                       When unset, that endpoint is closed.
 *   CODELEDGER_GH_APP_WEBHOOK_SECRET  — webhook HMAC secret. When unset, the
 *                                       webhook endpoint refuses every request.
 *
 * Bindings: CANONICAL_MAP (KV), ASSETS (worker/public — see wrangler.toml.example)
 *
 * NOTE ON AUTH MODEL: CodeLedger uses a classic OAuth App, not a GitHub App.
 * A GitHub App's user-to-server token silently ignores the `scope` parameter and
 * cannot create repositories on a personal account, which is what onboarding does
 * first. The historical `CODELEDGER_GH_APP_*` names are still accepted so existing
 * deployments keep working; see env() below.
 */

import { Hono } from "hono";

const app = new Hono();

/* ── Constants ────────────────────────────────────────────────────── */

const VERSION = "1.0.0";

/** Scopes the client may request. Anything else is rejected.
 *  public_repo is the default: it can create and push to public repos but
 *  cannot read private ones. Full `repo` is only for users who opt into a
 *  private ledger, and is requested at that moment rather than up front. */
const ALLOWED_SCOPES = new Set(["public_repo", "public_repo,workflow", "repo", "repo,workflow"]);
const DEFAULT_SCOPE = "public_repo,workflow";

const STATE_COOKIE = "cl_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000;

/* ── CORS ─────────────────────────────────────────────────────────── */

/** Public, unauthenticated, read-only endpoints may be read cross-origin.
 *  Authenticated endpoints deliberately get NO CORS headers so a browser will
 *  not let another origin read their responses. */
const PUBLIC_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

app.options("/api/health", () => new Response(null, { status: 204, headers: PUBLIC_CORS }));
app.options("/api/data/*", () => new Response(null, { status: 204, headers: PUBLIC_CORS }));

/* ── Env helper ───────────────────────────────────────────────────── */

const ENV_ALIASES = {
  GH_CLIENT_ID: ["CODELEDGER_OAUTH_CLIENT_ID", "CODELEDGER_GH_APP_CLIENT_ID", "GITHUB_CLIENT_ID"],
  GH_CLIENT_SECRET: [
    "CODELEDGER_OAUTH_CLIENT_SECRET",
    "CODELEDGER_GH_APP_CLIENT_SECRET",
    "GITHUB_CLIENT_SECRET",
  ],
  GH_WEBHOOK_SECRET: ["CODELEDGER_GH_APP_WEBHOOK_SECRET", "GITHUB_APP_WEBHOOK_SECRET"],
};

/**
 * Which alias actually supplied a value, or undefined if none did.
 *
 * The ID and the secret resolve through separate chains, so setting only the
 * new `CODELEDGER_OAUTH_CLIENT_ID` on a deployment that still holds an old
 * `CODELEDGER_GH_APP_CLIENT_SECRET` pairs one app's ID with another app's
 * secret. GitHub answers that with "client_id and/or client_secret passed are
 * incorrect", which names neither, and `wrangler secret list` shows both
 * present and looks right. Naming the winning alias is what makes the
 * mismatch visible.
 *
 * @param {any} c
 * @param {string} key
 * @returns {string|undefined}
 */
function envSource(c, key) {
  for (const name of ENV_ALIASES[key] || [key]) {
    if (c.env?.[name]) return name;
  }
  return undefined;
}

function env(c, key) {
  const name = envSource(c, key);
  // Trailing whitespace survives `wrangler secret put` when the value is pasted
  // with a newline. An untrimmed ID still passes the authorize redirect — it is
  // percent-encoded and GitHub tolerates it — and then fails the token
  // exchange, where the value is compared byte for byte.
  return name === undefined ? undefined : String(c.env[name]).trim();
}

/**
 * Describe a secret's shape without printing it.
 *
 * Used when a configured value fails its format check and the operator needs to
 * know how. Reports length and character classes only — enough to tell a typo
 * from a failed paste from a value set on the wrong worker, and not enough to
 * reconstruct anything.
 *
 * @param {string} value
 * @returns {string}
 */
export function describeSecretShape(value) {
  const s = String(value ?? "");
  if (s.length === 0) return "empty";

  const printable = [...s].filter((ch) => {
    const cp = ch.codePointAt(0);
    return cp >= 0x20 && cp !== 0x7f;
  }).length;
  const unprintable = s.length - printable;
  const plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;

  if (unprintable === s.length) {
    return (
      `${plural(s.length, "non-printable character")} — this is what a terminal that ` +
      "cannot handle Ctrl+V records when you try to paste"
    );
  }

  const parts = [plural(s.length, "character")];
  if (unprintable > 0) parts.push(`${unprintable} of them non-printable`);
  if (/\s/.test(s)) parts.push("with whitespace inside it");
  if (/^[A-Za-z0-9._-]+$/.test(s)) parts.push("too short to be a client ID");
  else parts.push("containing characters a client ID never has");
  return parts.join(", ");
}

/* ── Encoding helpers ─────────────────────────────────────────────── */

/** Escapes text for interpolation into HTML text nodes and quoted attributes. */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Serialises a value for embedding inside a <script> block.
 *  JSON.stringify alone is unsafe here: it does not escape `</script>`, so a
 *  string containing that sequence would terminate the block and let the rest
 *  be parsed as markup. U+2028/U+2029 are valid in JSON but are JavaScript
 *  line terminators, so they are escaped as well. */
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function bytesToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-independent, constant-time string comparison.
 *  A plain `!==` leaks how many leading characters matched via timing. */
function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(String(a));
  const bb = enc.encode(String(b));
  // Compare fixed-width digests so differing lengths do not short-circuit.
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

/* ── OAuth state (CSRF protection) ────────────────────────────────── */

/** Builds an opaque, tamper-evident state token: <nonce>.<issuedAt>.<hmac>.
 *  Without this, an attacker can complete an OAuth flow with their own code and
 *  silently bind the victim's extension to the attacker's GitHub account. */
async function issueState(secret) {
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const issuedAt = Date.now();
  const body = `${nonce}.${issuedAt}`;
  return `${body}.${await hmacHex(secret, body)}`;
}

async function verifyState(secret, state) {
  if (!state) return false;
  const parts = String(state).split(".");
  if (parts.length !== 3) return false;
  const [nonce, issuedAt, mac] = parts;
  const expected = await hmacHex(secret, `${nonce}.${issuedAt}`);
  if (!timingSafeEqual(mac, expected)) return false;
  const ts = Number(issuedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < STATE_TTL_MS;
}

function readCookie(c, name) {
  const raw = c.req.header("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

/* ── OAuth callback page ──────────────────────────────────────────── */

/**
 * Returns an HTML page that hands CODELEDGER_AUTH to the extension, then closes.
 * The token travels via a DOM attribute read by the content script at
 * document_end; the same-page postMessage is a fallback for timing races.
 *
 * Every interpolation below is escaped: `error` originates from GitHub's
 * redirect query string and is therefore attacker-controlled.
 */
function authCallbackHtml(provider, token, error = "") {
  const payload = { type: "CODELEDGER_AUTH", provider, token, error };
  const attr = escapeHtml(JSON.stringify(payload));
  const status = token
    ? "Authentication successful. Closing…"
    : `Authentication failed: ${escapeHtml(error || "unknown error")}`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>CodeLedger Auth</title>
<style>body{font-family:system-ui,sans-serif;background:#050508;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style>
</head><body>
<div id="codeledger-auth-result" data-auth="${attr}" style="display:none"></div>
<p>${status}</p>
<script>
(function(){
  var msg = ${jsonForScript(payload)};
  // Fallback only: delivered to this window alone, never broadcast with '*'.
  try{window.postMessage(msg, window.location.origin);}catch(e){}
  // Fires only if the content script fails to close the popup itself.
  if(${jsonForScript(!!token)}) setTimeout(function(){try{window.close();}catch(e){}},5000);
})();
</script>
</body></html>`;
}

/* ── Routes ───────────────────────────────────────────────────────── */

app.get("/api/health", (c) =>
  c.json({ ok: true, version: VERSION, ts: Date.now() }, 200, PUBLIC_CORS),
);

// OAuth: redirect to provider
app.get("/api/auth/:provider", async (c) => {
  const provider = c.req.param("provider")?.toLowerCase();
  if (provider !== "github") {
    return c.json({ error: `Unsupported provider: ${provider}` }, 404);
  }

  const clientId = env(c, "GH_CLIENT_ID")?.trim();
  if (!clientId) {
    return c.text("GitHub OAuth not configured — set CODELEDGER_OAUTH_CLIENT_ID", 500);
  }
  // A present-but-malformed client ID used to sail through the emptiness check
  // above and get percent-encoded into the authorize URL, where GitHub bounced
  // it to a generic login page — a broken sign-in with nothing anywhere saying
  // why. Production held a single 0x16 byte, which is what a terminal that does
  // not handle Ctrl+V records when you try to paste into `wrangler secret put`.
  // GitHub's IDs are 20 characters of `Ov23li…`/`Iv23li…`; anything that is not
  // plausibly one of those is a misconfiguration, and should say so here.
  if (!/^[A-Za-z0-9._-]{10,}$/.test(clientId)) {
    // Say what arrived, not just that it was wrong. The first time this fired,
    // the stored value was a single 0x16 byte and the message alone was not
    // enough to work out that the re-set had failed the same way again. A
    // client ID is public — it goes out in the authorize URL to every user —
    // so describing its shape here leaks nothing, and the description is what
    // tells you whether you typed a bad value, set the wrong secret, or set
    // the right secret on the wrong worker.
    return c.text(
      "GitHub OAuth is misconfigured: CODELEDGER_OAUTH_CLIENT_ID is set but is not a " +
        `client ID. It is ${describeSecretShape(clientId)}; a client ID is 20 characters ` +
        "of letters and digits, beginning `Ov23li` for an OAuth App or `Iv23li` for a " +
        "GitHub App. Re-set it with `wrangler secret put CODELEDGER_OAUTH_CLIENT_ID` and " +
        "type or right-click-paste the value — Ctrl+V does not paste in that prompt.",
      500,
    );
  }
  const sessionSecret = c.env?.SESSION_SECRET;
  if (!sessionSecret) {
    return c.text("GitHub OAuth not configured — set SESSION_SECRET", 500);
  }

  // Callers may request a wider scope (private ledger); anything unrecognised
  // falls back to the least-privilege default rather than being passed through.
  const requested = c.req.query("scope");
  const scope = ALLOWED_SCOPES.has(requested) ? requested : DEFAULT_SCOPE;

  const origin = new URL(c.req.url).origin;
  const redirectUri = `${origin}/api/auth/github/callback`;
  const state = await issueState(sessionSecret);

  const url =
    `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}` +
    `&allow_signup=true`;

  // SameSite=Lax is correct here: the callback arrives as a top-level GET
  // navigation from github.com, which Lax permits.
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Set-Cookie": `${STATE_COOKIE}=${encodeURIComponent(state)}; Path=/api/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    },
  });
});

// GitHub OAuth callback
app.get("/api/auth/github/callback", async (c) => {
  const clearCookie = `${STATE_COOKIE}=; Path=/api/auth; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
  const reply = (token, error) =>
    new Response(authCallbackHtml("github", token, error), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Set-Cookie": clearCookie,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });

  const code = c.req.query("code");
  const error = c.req.query("error");
  const errorDesc = c.req.query("error_description");

  if (error) return reply("", errorDesc || error);
  if (!code) return reply("", "No code received from GitHub");

  // CSRF: the state echoed by GitHub must match the one we issued in this browser.
  const sessionSecret = c.env?.SESSION_SECRET;
  const returned = c.req.query("state");
  const stored = readCookie(c, STATE_COOKIE);
  if (!sessionSecret) return reply("", "OAuth not configured on server");
  if (!returned || !stored || !timingSafeEqual(returned, stored)) {
    return reply("", "Authorization state mismatch — please start the sign-in again");
  }
  if (!(await verifyState(sessionSecret, returned))) {
    return reply("", "Authorization request expired — please start the sign-in again");
  }

  const clientId = env(c, "GH_CLIENT_ID");
  const clientSecret = env(c, "GH_CLIENT_SECRET");
  if (!clientId || !clientSecret) return reply("", "OAuth not configured on server");

  try {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${new URL(c.req.url).origin}/api/auth/github/callback`,
      }),
    });
    const data = await res.json();

    // A GitHub App issues user-to-server tokens: it ignores the `scope` we
    // requested and returns an expiring token instead. Such a token cannot call
    // POST /user/repos, which surfaces much later as an unexplained 403 during
    // repository creation. Refuse it here, where the cause is still visible.
    if (data.access_token && (data.expires_in || data.refresh_token) && !data.scope) {
      return reply(
        "",
        "This server is configured with a GitHub App client ID. CodeLedger needs a " +
          "classic OAuth App — set CODELEDGER_OAUTH_CLIENT_ID and " +
          "CODELEDGER_OAUTH_CLIENT_SECRET from an OAuth App registration.",
      );
    }

    // "incorrect client_id and/or client_secret" names neither half, and both
    // are present, so `wrangler secret list` looks correct. Say which alias
    // supplied each — a pair drawn from two different chains is the usual
    // cause and is otherwise invisible.
    if (data.error === "incorrect_client_credentials") {
      const idFrom = envSource(c, "GH_CLIENT_ID");
      const secretFrom = envSource(c, "GH_CLIENT_SECRET");
      return reply(
        "",
        `GitHub rejected the client credentials. The client ID came from ${idFrom} and ` +
          `the client secret from ${secretFrom}; they must both belong to the same OAuth ` +
          `App registration. Re-set both with \`wrangler secret put\`, and delete any ` +
          `leftover CODELEDGER_GH_APP_CLIENT_ID / CODELEDGER_GH_APP_CLIENT_SECRET so they ` +
          `cannot supply half the pair.`,
      );
    }

    return reply(data.access_token || "", data.error_description || data.error || "");
  } catch (e) {
    return reply("", e.message);
  }
});

// GitHub webhook receiver
app.post("/api/webhook/github", async (c) => {
  const secret = env(c, "GH_WEBHOOK_SECRET");
  // Fail closed. Previously an unset secret skipped verification entirely,
  // leaving the endpoint open to forged deliveries.
  if (!secret) return c.text("Webhook not configured", 503);

  const sigHeader = c.req.header("x-hub-signature-256") || "";
  const bodyText = await c.req.text();
  const expected = `sha256=${await hmacHex(secret, bodyText)}`;
  if (!timingSafeEqual(sigHeader, expected)) return c.text("Invalid signature", 401);

  return c.json({ ok: true }, 200);
});

// Canonical map: read from KV or GitHub raw fallback
app.get("/api/data/canonical-map.json", async (c) => {
  const headers = {
    ...PUBLIC_CORS,
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=3600",
  };
  try {
    const kv = c.env?.CANONICAL_MAP;
    if (kv) {
      const v = await kv.get("canonical-map");
      if (v) return new Response(v, { status: 200, headers });
    }
  } catch (_) {}
  try {
    const res = await fetch(
      "https://raw.githubusercontent.com/Life-Experimentalist/Code-Ledger/refs/heads/main/src/data/canonical-map.json",
    );
    if (!res.ok) return c.json({ error: "Canonical map unavailable" }, 503, PUBLIC_CORS);
    return new Response(await res.text(), { status: 200, headers });
  } catch (e) {
    return c.json({ error: "Canonical map unavailable" }, 503, PUBLIC_CORS);
  }
});

// Canonical map: admin update (protected — deliberately no CORS headers)
app.post("/api/admin/canonical", async (c) => {
  const expected = c.env?.CANONICAL_UPLOAD_TOKEN;
  if (!expected) return c.json({ error: "Upload not configured" }, 503);

  const auth = c.req.header("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!token || !timingSafeEqual(token, expected)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const kv = c.env?.CANONICAL_MAP;
  if (!kv) return c.json({ error: "KV not bound" }, 500);

  const body = await c.req.text();
  try {
    JSON.parse(body);
  } catch {
    return c.json({ error: "Body must be valid JSON" }, 400);
  }
  await kv.put("canonical-map", body);
  return c.json({ ok: true }, 200);
});

// favicon fallback — redirect to the extension icon
app.get("/favicon.ico", (c) =>
  c.redirect(
    "https://raw.githubusercontent.com/Life-Experimentalist/Code-Ledger/main/src/assets/images/icon-transparent.png",
    301,
  ),
);

// Static assets via ASSETS binding — must be last
app.get("/*", async (c) => {
  if (c.env?.ASSETS) {
    try {
      const res = await c.env.ASSETS.fetch(c.req.raw);
      if (res.status !== 404) return res;
    } catch (_) {}
  }
  return c.notFound();
});

export default app;
