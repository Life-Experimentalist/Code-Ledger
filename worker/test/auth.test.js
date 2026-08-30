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
  // `Ov23li…` is the OAuth App prefix, which is what production is meant to hold.
  CODELEDGER_OAUTH_CLIENT_ID: "Ov23liTESTCLIENTID",
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
  return {
    res,
    location,
    setCookie,
    state,
    cookie: `__Host-cl_oauth_state=${encodeURIComponent(state)}`,
  };
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

  // Production ran for a while with CODELEDGER_OAUTH_CLIENT_ID holding a single
  // 0x16 byte — what a terminal records for Ctrl+V at the `wrangler secret put`
  // prompt. It was non-empty, so it passed the configuration check and got
  // percent-encoded into the authorize URL, and GitHub answered with a generic
  // login redirect. Sign-in was broken with nothing anywhere naming the cause.
  test("fails closed on a present but malformed client ID", async () => {
    const res = await req("/api/auth/github", {}, { ...ENV, CODELEDGER_OAUTH_CLIENT_ID: "\x16" });
    assert.equal(res.status, 500);
    assert.match(await res.text(), /not a client ID/i);
  });

  // Saying only "that is not a client ID" was not enough: the value was re-set,
  // failed the same way, and the message read identically both times. It has to
  // describe what arrived or an operator cannot tell a bad paste from a secret
  // set on the wrong worker.
  test("says what the malformed client ID actually was", async () => {
    const res = await req("/api/auth/github", {}, { ...ENV, CODELEDGER_OAUTH_CLIENT_ID: "\x16" });
    const body = await res.text();
    assert.match(body, /1 non-printable character/);
    assert.match(body, /Ctrl\+V/);
    assert.equal(body.includes("\x16"), false, "the raw value must not be echoed back");
  });

  test("never echoes a well-formed-looking but rejected value", async () => {
    const res = await req("/api/auth/github", {}, { ...ENV, CODELEDGER_OAUTH_CLIENT_ID: "zqzqz" });
    const body = await res.text();
    assert.match(body, /5 characters/);
    assert.equal(body.includes("zqzqz"), false, "the raw value must not be echoed back");
  });

  test("does not redirect to GitHub with a malformed client ID", async () => {
    const res = await req(
      "/api/auth/github",
      { redirect: "manual" },
      { ...ENV, CODELEDGER_OAUTH_CLIENT_ID: "  " },
    );
    assert.equal(res.headers.get("location"), null);
  });

  test("accepts a well-formed client ID of either app type", async () => {
    for (const id of ["Iv23liTESTCLIENTID", "Ov23liTESTCLIENTID"]) {
      const res = await req(
        "/api/auth/github",
        { redirect: "manual" },
        { ...ENV, CODELEDGER_OAUTH_CLIENT_ID: id },
      );
      assert.equal(new URL(res.headers.get("location")).searchParams.get("client_id"), id);
    }
  });

  // A pasted value carries a trailing newline more often than not. Untrimmed,
  // it survives the authorize redirect and fails only at the token exchange,
  // which reports "incorrect client_id and/or client_secret" and points at the
  // wrong thing entirely.
  test("strips whitespace a paste left around the client ID", async () => {
    const res = await req(
      "/api/auth/github",
      { redirect: "manual" },
      { ...ENV, CODELEDGER_OAUTH_CLIENT_ID: "  Ov23liTESTCLIENTID\n" },
    );
    assert.equal(
      new URL(res.headers.get("location")).searchParams.get("client_id"),
      "Ov23liTESTCLIENTID",
    );
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
      headers: { cookie: `__Host-cl_oauth_state=${forged}` },
    });
    assert.match(await res.text(), /expired|mismatch/i);
  });

  test("clears the state cookie on every callback", async () => {
    const res = await req("/api/auth/github/callback?code=abc");
    assert.match(res.headers.get("set-cookie") || "", /Max-Age=0/);
  });

  test("state cookie carries the __Host- prefix requirements", async () => {
    const { setCookie } = await issuedState();
    assert.match(setCookie, /^__Host-/);
    assert.match(setCookie, /Path=\//);
    assert.match(setCookie, /Secure/);
    assert.doesNotMatch(setCookie, /Domain=/i);
  });

  test("a malformed state cookie reads as absent, not a 500", async () => {
    const res = await req("/api/auth/github/callback?code=abc&state=x.1.y", {
      headers: { cookie: "__Host-cl_oauth_state=%zz" },
    });
    assert.equal(res.status, 200);
    assert.match(await res.text(), /state mismatch/i);
  });

  test("an unauthenticated ?error= callback cannot bypass state verification", async () => {
    // Before the reorder, ?error= was honoured pre-state-check, so any drive-by
    // GET rendered attacker-chosen text in the trusted popup.
    const res = await req("/api/auth/github/callback?error=x&error_description=Pwned+text");
    const body = await res.text();
    assert.doesNotMatch(body, /Pwned text/);
    assert.match(body, /state mismatch/i);
  });

  test("a genuine denial (valid state + ?error=) still reports the error", async () => {
    const { cookie, state } = await issuedState();
    const res = await req(
      `/api/auth/github/callback?error=access_denied&error_description=User+denied&state=${encodeURIComponent(state)}`,
      { headers: { cookie } },
    );
    assert.match(await res.text(), /User denied/);
  });
});

describe("OAuth callback — credential type", () => {
  /**
   * Completes a real state round-trip and stubs only GitHub's token endpoint,
   * so the exchange runs exactly as it does in production.
   */
  async function exchange(tokenResponse, env = ENV) {
    const { state, cookie } = await issuedState();
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) =>
      String(url).includes("login/oauth/access_token")
        ? new Response(JSON.stringify(tokenResponse), {
            headers: { "Content-Type": "application/json" },
          })
        : realFetch(url, init);
    try {
      const res = await req(
        `/api/auth/github/callback?code=abc&state=${encodeURIComponent(state)}`,
        {
          headers: { cookie },
        },
        env,
      );
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

  // The ID and the secret resolve through independent alias chains, so setting
  // only the new ID on a deployment that still holds the old GitHub App secret
  // pairs one app's ID with another's secret. GitHub's reply names neither, and
  // `wrangler secret list` shows both present. The message has to name them.
  test("names which secret supplied each half when GitHub rejects the pair", async () => {
    const body = await exchange(
      { error: "incorrect_client_credentials" },
      {
        SESSION_SECRET: ENV.SESSION_SECRET,
        CODELEDGER_OAUTH_CLIENT_ID: "Ov23liTESTCLIENTID",
        CODELEDGER_GH_APP_CLIENT_SECRET: "stale-secret-from-the-old-app",
      },
    );
    assert.match(body, /CODELEDGER_OAUTH_CLIENT_ID/);
    assert.match(body, /CODELEDGER_GH_APP_CLIENT_SECRET/);
    assert.equal(
      body.includes("stale-secret-from-the-old-app"),
      false,
      "the secret's value must never be echoed back",
    );
  });
});

describe("OAuth callback — XSS (attacker-controlled error_description)", () => {
  // State verification now runs before the error branch, so a description only
  // renders when the redirect carries a valid state. These tests drive the full
  // authorize → callback flow so the escaping path is actually exercised.
  test("does not emit a raw script-closing tag from error_description", async () => {
    const { state, cookie } = await issuedState();
    const payload = "</script><img src=x onerror=alert(1)>";
    const res = await req(
      `/api/auth/github/callback?error=access_denied&error_description=${encodeURIComponent(payload)}&state=${encodeURIComponent(state)}`,
      { headers: { cookie } },
    );
    const body = await res.text();
    // The literal breakout sequence must not survive anywhere in the document.
    assert.ok(!body.includes("</script><img"), "script breakout must be neutralised");
    assert.ok(!body.includes("<img src=x"), "raw markup must not be emitted");
    assert.ok(body.includes("&lt;") || body.includes("\\u003c"), "payload must be escaped");
  });

  test("escapes quotes so the data-auth attribute cannot be broken out of", async () => {
    const { state, cookie } = await issuedState();
    const payload = '" onload="alert(1)';
    const res = await req(
      `/api/auth/github/callback?error=x&error_description=${encodeURIComponent(payload)}&state=${encodeURIComponent(state)}`,
      { headers: { cookie } },
    );
    const body = await res.text();
    assert.ok(!body.includes('" onload="'), "attribute breakout must be neutralised");
  });

  test("sets no-store so the token page is never cached", async () => {
    const res = await req("/api/auth/github/callback?error=x");
    assert.match(res.headers.get("cache-control") || "", /no-store/);
  });
});

/**
 * The callback page hands the extension a repo-scoped OAuth token through the
 * DOM. The escaping tests above are the first lock. These cover the second:
 * if markup ever does reach the page, it should not be able to run, and if it
 * runs it should not be able to reach the network to send the token anywhere.
 */
describe("OAuth callback — response headers", () => {
  const csp = async () => {
    const res = await req("/api/auth/github/callback?error=x");
    return { res, policy: res.headers.get("content-security-policy") || "" };
  };

  test("serves a Content-Security-Policy at all", async () => {
    const { policy } = await csp();
    assert.notEqual(policy, "", "the token page must carry a CSP");
  });

  test("denies everything by default and allows no network destination", async () => {
    const { policy } = await csp();
    assert.match(policy, /default-src 'none'/);
    // No connect-src, so fetch/XHR/beacon have nowhere to go.
    assert.ok(!/connect-src/.test(policy), "connect-src must not be opened up");
  });

  test("allows script only by nonce — never unsafe-inline", async () => {
    const { policy } = await csp();
    assert.match(policy, /script-src 'nonce-[^']+'/);
    assert.ok(
      !/unsafe-inline|unsafe-eval/.test(policy),
      "a wildcard inline allowance defeats the whole policy",
    );
  });

  test("the nonce in the header is the one on the script tag", async () => {
    const { res, policy } = await csp();
    const body = await res.text();
    const nonce = /script-src 'nonce-([^']+)'/.exec(policy)?.[1];
    assert.ok(nonce, "no nonce in the policy");
    assert.ok(
      body.includes(`<script nonce="${nonce}">`),
      "the inline script does not carry the nonce, so the page is broken",
    );
  });

  test("issues a fresh nonce per response", async () => {
    // A reused nonce is the same as no nonce: injected markup could carry it.
    const a = (await csp()).policy;
    const b = (await csp()).policy;
    const get = (p) => /script-src 'nonce-([^']+)'/.exec(p)?.[1];
    assert.notEqual(get(a), get(b));
  });

  test("refuses to be framed, and refuses MIME sniffing", async () => {
    const { res, policy } = await csp();
    assert.match(policy, /frame-ancestors 'none'/);
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
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

  const VALID_MAP = JSON.stringify({
    entries: [
      {
        canonicalId: "two-sum",
        canonicalTitle: "Two Sum",
        topic: "Array",
        difficulty: "Easy",
        aliases: [{ platform: "leetcode", slug: "two-sum" }],
      },
    ],
  });

  test("accepts a valid canonical map upload with the right token", async () => {
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
        body: VALID_MAP,
        headers: { Authorization: `Bearer ${ENV.CANONICAL_UPLOAD_TOKEN}` },
      },
      { ...ENV, CANONICAL_MAP: kv },
    );
    assert.equal(res.status, 200);
    assert.equal(stored, VALID_MAP);
  });

  test("rejects valid JSON that is not a canonical map", async () => {
    // This KV value is served verbatim to every install; an arbitrary blob
    // stored here would break canonical resolution fleet-wide.
    let stored = null;
    const kv = {
      put: async (_k, v) => {
        stored = v;
      },
    };
    for (const body of ['{"ok":true}', "null", "[]", '{"entries":[{"canonicalId":"x"}]}']) {
      const res = await req(
        "/api/admin/canonical",
        {
          method: "POST",
          body,
          headers: { Authorization: `Bearer ${ENV.CANONICAL_UPLOAD_TOKEN}` },
        },
        { ...ENV, CANONICAL_MAP: kv },
      );
      assert.equal(res.status, 400, `expected 400 for body ${body}`);
    }
    assert.equal(stored, null);
  });

  test("rejects an oversized body before parsing", async () => {
    const kv = { put: async () => {} };
    const big = `{"entries":[${'"x",'.repeat(3 * 1024 * 1024)}"x"]}`;
    const res = await req(
      "/api/admin/canonical",
      {
        method: "POST",
        body: big,
        headers: { Authorization: `Bearer ${ENV.CANONICAL_UPLOAD_TOKEN}` },
      },
      { ...ENV, CANONICAL_MAP: kv },
    );
    assert.equal(res.status, 413);
  });

  test("accepts the token with surrounding whitespace trimmed from the secret", async () => {
    // `wrangler secret put` keeps a pasted trailing newline; the guard must
    // compare against the trimmed value, not 401 forever with no diagnostic.
    const kv = { put: async () => {} };
    const res = await req(
      "/api/admin/canonical",
      {
        method: "POST",
        body: VALID_MAP,
        headers: { Authorization: `Bearer ${ENV.CANONICAL_UPLOAD_TOKEN}` },
      },
      { ...ENV, CANONICAL_UPLOAD_TOKEN: `${ENV.CANONICAL_UPLOAD_TOKEN}\n`, CANONICAL_MAP: kv },
    );
    assert.equal(res.status, 200);
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
    // Compare against package.json, not just a semver shape — the shape check
    // passed for years on exactly the stale placeholder it claimed to prevent.
    const { readFileSync } = await import("node:fs");
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    assert.equal(body.version, pkg.version);
  });
});
