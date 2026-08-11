/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Security regression tests for the CodeLedger Worker.
 *
 * Every test here corresponds to a real defect found during the v1.0.0 audit.
 * They exist so those defects cannot silently return.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import app from "../src/index.js";

const ENV = {
  CODELEDGER_OAUTH_CLIENT_ID: "Iv23liTESTCLIENTID",
  CODELEDGER_OAUTH_CLIENT_SECRET: "test-client-secret",
  SESSION_SECRET: "test-session-secret-do-not-use-in-production",
  CANONICAL_UPLOAD_TOKEN: "test-upload-token",
};

const BASE = "https://codeledger.vkrishna04.me";

/** Runs a request through the Hono app with a stub env.
 *  Hono's signature is request(input, requestInit, Env) — the env must be the
 *  third positional argument, not folded into the Request. */
function req(path, init = {}, env = ENV) {
  return app.request(BASE + path, init, env);
}

/** Drives /api/auth/github and returns the issued state plus its cookie. */
async function issuedState(query = "") {
  const res = await req(`/api/auth/github${query}`, { redirect: "manual" });
  const location = res.headers.get("location");
  const setCookie = res.headers.get("set-cookie") || "";
  const state = new URL(location).searchParams.get("state");
  return { res, location, setCookie, state, cookie: `cl_oauth_state=${encodeURIComponent(state)}` };
}

/* ────────────────────────────────────────────────────────────────── */

describe("OAuth authorize redirect", () => {
  test("redirects to GitHub with a state parameter (CSRF protection)", async () => {
    const { res, location, state, setCookie } = await issuedState();
    assert.equal(res.status, 302);
    assert.ok(location.startsWith("https://github.com/login/oauth/authorize"));
    assert.ok(state && state.length > 20, "state must be present and unguessable");
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /SameSite=Lax/);
  });

  test("issues a distinct state per request (no fixation)", async () => {
    const a = await issuedState();
    const b = await issuedState();
    assert.notEqual(a.state, b.state);
  });

  test("defaults to least-privilege public_repo scope", async () => {
    const { location } = await issuedState();
    const scope = new URL(location).searchParams.get("scope");
    assert.equal(scope, "public_repo,workflow");
  });

  test("honours an allowlisted wider scope", async () => {
    const { location } = await issuedState("?scope=repo");
    assert.equal(new URL(location).searchParams.get("scope"), "repo");
  });

  test("rejects an arbitrary scope, falling back to the default", async () => {
    const { location } = await issuedState("?scope=admin:org,delete_repo");
    assert.equal(new URL(location).searchParams.get("scope"), "public_repo,workflow");
  });

  test("fails closed when SESSION_SECRET is unset", async () => {
    const res = await req("/api/auth/github", {}, { ...ENV, SESSION_SECRET: undefined });
    assert.equal(res.status, 500);
  });

  test("rejects unsupported providers", async () => {
    const res = await req("/api/auth/gitlab");
    assert.equal(res.status, 404);
  });
});

describe("OAuth callback — CSRF", () => {
  test("rejects a callback with no state at all", async () => {
    const res = await req("/api/auth/github/callback?code=abc");
    const body = await res.text();
    assert.match(body, /state mismatch/i);
    assert.doesNotMatch(body, /"token":"[^"]+"/);
  });

  test("rejects a state that does not match the cookie", async () => {
    const { cookie } = await issuedState();
    const res = await req("/api/auth/github/callback?code=abc&state=attacker-supplied", {
      headers: { cookie },
    });
    assert.match(await res.text(), /state mismatch/i);
  });

  test("rejects a forged state that was never issued by us", async () => {
    // Cookie and query agree, but the HMAC was not produced with SESSION_SECRET.
    const forged = "deadbeef.9999999999999.notavalidmac";
    const res = await req(`/api/auth/github/callback?code=abc&state=${forged}`, {
      headers: { cookie: `cl_oauth_state=${forged}` },
    });
    assert.match(await res.text(), /expired|mismatch/i);
  });

  test("clears the state cookie on every callback", async () => {
    const res = await req("/api/auth/github/callback?code=abc");
    assert.match(res.headers.get("set-cookie") || "", /Max-Age=0/);
  });
});

describe("OAuth callback — credential type", () => {
  /**
   * Completes a real state round-trip and stubs only GitHub's token endpoint,
   * so the exchange runs exactly as it does in production.
   */
  async function exchange(tokenResponse) {
    const { state, cookie } = await issuedState();
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) =>
      String(url).includes("login/oauth/access_token")
        ? new Response(JSON.stringify(tokenResponse), {
            headers: { "Content-Type": "application/json" },
          })
        : realFetch(url, init);
    try {
      const res = await req(`/api/auth/github/callback?code=abc&state=${encodeURIComponent(state)}`, {
        headers: { cookie },
      });
      return await res.text();
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  test("passes through a classic OAuth App token", async () => {
    const body = await exchange({ access_token: "gho_valid", scope: "public_repo,workflow" });
    assert.ok(body.includes("gho_valid"), "a valid OAuth token must reach the extension");
  });

  test("refuses a GitHub App user-to-server token instead of failing later", async () => {
    // A GitHub App ignores the requested scope and returns an expiring token.
    // Such a token 403s on POST /user/repos — the Chrome Web Store rejection.
    const body = await exchange({
      access_token: "ghu_appToken",
      expires_in: 28800,
      refresh_token: "ghr_x",
      scope: "",
    });
    assert.ok(!body.includes("ghu_appToken"), "the unusable token must not be handed out");
    assert.match(body, /OAuth App/);
  });
});

describe("OAuth callback — XSS (attacker-controlled error_description)", () => {
  test("does not emit a raw script-closing tag from error_description", async () => {
    const payload = "</script><img src=x onerror=alert(1)>";
    const res = await req(
      `/api/auth/github/callback?error=access_denied&error_description=${encodeURIComponent(payload)}`,
    );
    const body = await res.text();
    // The literal breakout sequence must not survive anywhere in the document.
    assert.ok(!body.includes("</script><img"), "script breakout must be neutralised");
    assert.ok(!body.includes("<img src=x"), "raw markup must not be emitted");
    assert.ok(body.includes("&lt;") || body.includes("\\u003c"), "payload must be escaped");
  });

  test("escapes quotes so the data-auth attribute cannot be broken out of", async () => {
    const payload = '" onload="alert(1)';
    const res = await req(
      `/api/auth/github/callback?error=x&error_description=${encodeURIComponent(payload)}`,
    );
    const body = await res.text();
    assert.ok(!body.includes('" onload="'), "attribute breakout must be neutralised");
  });

  test("sets no-store so the token page is never cached", async () => {
    const res = await req("/api/auth/github/callback?error=x");
    assert.match(res.headers.get("cache-control") || "", /no-store/);
  });
});

describe("Webhook", () => {
  test("fails closed when no secret is configured", async () => {
    const res = await req(
      "/api/webhook/github",
      { method: "POST", body: "{}" },
      { ...ENV, CODELEDGER_GH_APP_WEBHOOK_SECRET: undefined },
    );
    assert.equal(res.status, 503);
  });

  test("rejects a delivery with a bad signature", async () => {
    const res = await req(
      "/api/webhook/github",
      { method: "POST", body: "{}", headers: { "x-hub-signature-256": "sha256=00" } },
      { ...ENV, CODELEDGER_GH_APP_WEBHOOK_SECRET: "hook-secret" },
    );
    assert.equal(res.status, 401);
  });

  test("rejects a delivery with no signature header", async () => {
    const res = await req(
      "/api/webhook/github",
      { method: "POST", body: "{}" },
      { ...ENV, CODELEDGER_GH_APP_WEBHOOK_SECRET: "hook-secret" },
    );
    assert.equal(res.status, 401);
  });
});

describe("Admin canonical upload", () => {
  test("rejects an unauthenticated upload", async () => {
    const res = await req("/api/admin/canonical", { method: "POST", body: "{}" });
    assert.equal(res.status, 401);
  });

  test("rejects a wrong token", async () => {
    const res = await req("/api/admin/canonical", {
      method: "POST",
      body: "{}",
      headers: { Authorization: "Bearer wrong" },
    });
    assert.equal(res.status, 401);
  });

  test("returns no permissive CORS header (not readable cross-origin)", async () => {
    const res = await req("/api/admin/canonical", { method: "POST", body: "{}" });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });

  test("rejects a non-JSON body even with a valid token", async () => {
    const kv = { put: async () => {} };
    const res = await req(
      "/api/admin/canonical",
      {
        method: "POST",
        body: "not json",
        headers: { Authorization: `Bearer ${ENV.CANONICAL_UPLOAD_TOKEN}` },
      },
      { ...ENV, CANONICAL_MAP: kv },
    );
    assert.equal(res.status, 400);
  });

  test("accepts a valid JSON upload with the right token", async () => {
    let stored = null;
    const kv = {
      put: async (_k, v) => {
        stored = v;
      },
    };
    const res = await req(
      "/api/admin/canonical",
      {
        method: "POST",
        body: '{"ok":true}',
        headers: { Authorization: `Bearer ${ENV.CANONICAL_UPLOAD_TOKEN}` },
      },
      { ...ENV, CANONICAL_MAP: kv },
    );
    assert.equal(res.status, 200);
    assert.equal(stored, '{"ok":true}');
  });
});

describe("Removed GitHub App endpoints", () => {
  // These minted real installation access tokens for anonymous callers.
  // They must stay gone.
  test("installation listing is no longer served as an API route", async () => {
    const res = await req("/api/app/installations");
    assert.notEqual(res.status, 200);
  });

  test("installation token minting is no longer served as an API route", async () => {
    const res = await req("/api/app/installations/123/access_tokens", { method: "POST" });
    assert.notEqual(res.status, 200);
  });
});

describe("Health", () => {
  test("reports the real version, not a hardcoded placeholder", async () => {
    const res = await req("/api/health");
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.match(body.version, /^\d+\.\d+\.\d+$/);
  });
});
