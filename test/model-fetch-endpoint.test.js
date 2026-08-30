/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Where the model listing sends the API key.
 *
 * `ModelSelector` reads `{provider}_endpoint` straight out of the settings map
 * and hands it to `fetchModelsForProvider`, which puts the user's key in an
 * Authorization header. That fires when the AI settings panel renders — it does
 * not wait for a solve — so a poisoned endpoint leaks the key sooner here than
 * through a review.
 *
 * Each provider branch in `model-fetch.js` joins the override to the models
 * path itself, against the raw parameter, so the check has to happen once at
 * the entry point. These tests exist because a check inside the `epFor` helper
 * looked right and covered one of eight paths.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { Storage } from "../src/core/storage.js";
import {
  fetchModelsForProvider,
  testAIKey,
  testProviderEndpoint,
} from "../src/core/model-fetch.js";

let real = {};
/** @type {string[]} */
let fetched = [];

beforeEach(() => {
  real = { getAIKeys: Storage.getAIKeys, fetch: globalThis.fetch };
  fetched = [];
  Storage.getAIKeys = async () => ({ openai: ["sk-secret"], claude: ["sk-secret"] });
  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    return { ok: true, json: async () => ({ data: [] }) };
  };
});

afterEach(() => {
  Storage.getAIKeys = real.getAIKeys;
  globalThis.fetch = real.fetch;
});

describe("fetchModelsForProvider — endpoint override", () => {
  test("honours a legitimate gateway", async () => {
    await fetchModelsForProvider("openai", "https://gateway.example/v1");
    assert.equal(fetched.length, 1);
    assert.match(fetched[0], /^https:\/\/gateway\.example\/v1\//);
  });

  test("never sends the key to a plain-http override", async () => {
    await fetchModelsForProvider("openai", "http://evil.example/v1");
    assert.equal(fetched.length, 1);
    assert.match(fetched[0], /^https:\/\/api\.openai\.com\//);
  });

  test("never sends the key to a non-http scheme", async () => {
    for (const bad of ["javascript:0", "data:text/plain,x", "file:///etc/passwd", "nonsense"]) {
      fetched = [];
      await fetchModelsForProvider("openai", bad);
      assert.equal(fetched.length, 1, `${bad} produced no request`);
      assert.match(fetched[0], /^https:\/\/api\.openai\.com\//, `${bad} was used as an endpoint`);
    }
  });

  test("the same holds for a provider whose branch builds its own URL", async () => {
    await fetchModelsForProvider("claude", "http://evil.example/v1");
    assert.equal(fetched.length, 1);
    assert.match(fetched[0], /^https:\/\/api\.anthropic\.com\//);
  });
});

describe("testAIKey — endpoint override", () => {
  test("honours a legitimate gateway", async () => {
    await testAIKey("openai", "sk-secret", "https://gateway.example/v1");
    assert.equal(fetched.length, 1);
    assert.match(fetched[0], /^https:\/\/gateway\.example\/v1\//);
  });

  test("never sends the key to an unsafe override", async () => {
    for (const bad of ["http://evil.example/v1", "javascript:0", "not a url"]) {
      fetched = [];
      await testAIKey("openai", "sk-secret", bad);
      assert.equal(fetched.length, 1, `${bad} produced no request`);
      assert.match(fetched[0], /^https:\/\/api\.openai\.com\//, `${bad} was used as an endpoint`);
    }
  });
});

describe("testProviderEndpoint", () => {
  test("says the endpoint is unusable rather than passing the shipped one", async () => {
    // Reporting "ok" here would tell the user a URL works when the extension
    // would never call it.
    const res = await testProviderEndpoint("openai", "http://evil.example/v1");
    assert.equal(res.ok, false);
    assert.match(res.error, /https/);
    assert.equal(fetched.length, 0);
  });
});
