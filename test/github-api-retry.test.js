/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * apiFetch() is the one place every GitHub call passes through, and its retry
 * ladder is the part of it that is easy to break and impossible to notice.
 *
 * The subtle rung is the rate limit. GitHub signals the *secondary* limit as
 * 429, but the *primary* limit as 403 with `x-ratelimit-remaining: 0` — the
 * same status it uses for "you may not do that". Read the status alone and a
 * rate-limited user is told their token lacks permission, which sends them to
 * re-authenticate a token that was fine.
 *
 * These tests pin which 403s retry and which do not.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const { apiFetch } = await import("../src/handlers/git/github/api-client.js");

const realFetch = globalThis.fetch;

/** Build a Response-alike: only what apiFetch actually reads. */
function reply(status, { headers = {}, body = {} } = {}) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: `status ${status}`,
    headers: { get: (k) => (h.has(k.toLowerCase()) ? h.get(k.toLowerCase()) : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** Queue of replies; each call shifts one. Records every call made. */
let queue;
let calls;

beforeEach(() => {
  queue = [];
  calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, method: opts?.method });
    if (!queue.length) throw new Error("fetch called more times than the test queued");
    return queue.shift();
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("apiFetch rate-limit handling", () => {
  it("retries a 403 that carries x-ratelimit-remaining: 0", async () => {
    queue = [
      reply(403, { headers: { "x-ratelimit-remaining": "0", "Retry-After": "1" } }),
      reply(200, { body: { login: "tester" } }),
    ];

    const out = await apiFetch("/user", "t0ken");

    assert.deepEqual(out, { login: "tester" });
    assert.equal(calls.length, 2, "the rate-limited call must be retried");
  });

  it("does NOT retry a 403 without the header — that is a real permissions failure", async () => {
    queue = [reply(403, { body: { message: "Resource not accessible by integration" } })];

    await assert.rejects(
      () => apiFetch("/user/repos", "t0ken", { method: "POST" }),
      (e) => {
        assert.equal(e.status, 403);
        assert.match(e.message, /Resource not accessible by integration/);
        return true;
      },
    );
    assert.equal(calls.length, 1, "a permissions 403 must fail fast, not burn retries");
  });

  it("retries a 429", async () => {
    queue = [reply(429, { headers: { "Retry-After": "1" } }), reply(200, { body: { ok: 1 } })];

    await apiFetch("/user", "t0ken");

    assert.equal(calls.length, 2);
  });

  it("gives up after the retry budget instead of looping", async () => {
    queue = [
      reply(429, { headers: { "Retry-After": "1" } }),
      reply(429, { headers: { "Retry-After": "1" } }),
      reply(429, {
        headers: { "Retry-After": "1", "x-ratelimit-remaining": "0" },
        body: { message: "rate limited" },
      }),
    ];

    await assert.rejects(() => apiFetch("/user", "t0ken"), /429/);
    assert.equal(calls.length, 3, "two retries, then the error surfaces");
  });
});

describe("apiFetch transient-error handling", () => {
  it("retries a 5xx once and returns the success", async () => {
    queue = [reply(502), reply(200, { body: { sha: "abc" } })];

    const out = await apiFetch("/repos/o/r/git/trees", "t0ken", { method: "POST" });

    assert.deepEqual(out, { sha: "abc" });
    assert.equal(calls.length, 2);
  });

  it("does not retry a 404 — the resource is absent, not busy", async () => {
    queue = [reply(404, { body: { message: "Not Found" } })];

    await assert.rejects(
      () => apiFetch("/repos/o/r/git/ref/heads/main", "t0ken"),
      (e) => {
        assert.equal(e.status, 404);
        return true;
      },
    );
    assert.equal(calls.length, 1);
  });

  it("does not retry a 422 — the payload is wrong and will be wrong again", async () => {
    queue = [reply(422, { body: { message: "Validation Failed", errors: [{ field: "sha" }] } })];

    await assert.rejects(
      () => apiFetch("/repos/o/r/git/refs", "t0ken", { method: "PATCH" }),
      (e) => {
        assert.equal(e.status, 422);
        // describeGitHubError() reads err.body.errors — without it a 422 can only
        // be echoed back at the user, not explained.
        assert.deepEqual(e.body.errors, [{ field: "sha" }]);
        return true;
      },
    );
    assert.equal(calls.length, 1);
  });
});

describe("apiFetch request shape", () => {
  it("sends the bearer token and the pinned API version", async () => {
    let seen;
    globalThis.fetch = async (url, opts) => {
      seen = opts;
      return reply(200, { body: {} });
    };

    await apiFetch("/user", "t0ken");

    assert.equal(seen.headers.Authorization, "Bearer t0ken");
    assert.equal(seen.headers["X-GitHub-Api-Version"], "2022-11-28");
  });

  it("tolerates an empty body on success", async () => {
    globalThis.fetch = async () => ({
      status: 204,
      ok: true,
      statusText: "No Content",
      headers: { get: () => null },
      json: async () => ({}),
      text: async () => "",
    });

    assert.deepEqual(await apiFetch("/whatever", "t0ken", { method: "DELETE" }), {});
  });
});
