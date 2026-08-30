/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The model listing, once per provider.
 *
 * `fetchModelsForProvider` used to be six hand-written branches, one per
 * provider, each building its own URL and headers. It is now one generic
 * request driven by the provider's own entry in `CONSTANTS.AI_PROVIDERS`, which
 * is only an improvement if the generic version still sends exactly what each
 * vendor requires — a Gemini key in `x-goog-api-key`, an Anthropic key in
 * `x-api-key` alongside the version header, a Bearer token everywhere else.
 *
 * So these tests assert the wire format rather than the code shape: the URL,
 * the headers, and the rows read back out of a realistic response body. They
 * are what makes the descriptor safe to add a provider to.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { CONSTANTS } from "../src/core/constants.js";
import { Storage } from "../src/core/storage.js";
import { fetchModelsForProvider, testAIKey } from "../src/core/model-fetch.js";

let real = {};
/** @type {Array<{url: string, init: any}>} */
let calls = [];
/** @type {any} */
let body = { data: [] };

beforeEach(() => {
  real = { getAIKeys: Storage.getAIKeys, fetch: globalThis.fetch };
  calls = [];
  body = { data: [] };
  Storage.getAIKeys = async () => {
    const keys = {};
    for (const id of Object.keys(CONSTANTS.AI_PROVIDERS)) keys[id] = ["THE-KEY"];
    return keys;
  };
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: true, json: async () => body, text: async () => "" };
  };
});

afterEach(() => {
  Storage.getAIKeys = real.getAIKeys;
  globalThis.fetch = real.fetch;
});

describe("fetchModelsForProvider — where the key goes", () => {
  const expected = {
    gemini: ["x-goog-api-key", "THE-KEY"],
    openai: ["Authorization", "Bearer THE-KEY"],
    claude: ["x-api-key", "THE-KEY"],
    deepseek: ["Authorization", "Bearer THE-KEY"],
    openrouter: ["Authorization", "Bearer THE-KEY"],
  };

  for (const [id, [header, value]] of Object.entries(expected)) {
    test(`${id} sends the key as ${header}`, async () => {
      await fetchModelsForProvider(id);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].init.headers[header], value);
    });
  }

  test("ollama sends no key at all — it is a local server that wants none", async () => {
    await fetchModelsForProvider("ollama");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].init.headers, {});
    assert.match(calls[0].url, /localhost:11434/);
  });

  test("claude still carries the version header the API rejects requests without", async () => {
    await fetchModelsForProvider("claude");
    assert.equal(calls[0].init.headers["anthropic-version"], "2023-06-01");
  });

  test("openrouter still identifies the app, as its terms ask", async () => {
    await fetchModelsForProvider("openrouter");
    assert.equal(calls[0].init.headers["X-Title"], "CodeLedger");
  });

  test("a provider with no key configured makes no request", async () => {
    Storage.getAIKeys = async () => ({});
    await fetchModelsForProvider("openai");
    assert.equal(calls.length, 0);
  });

  test("every declared provider produces exactly one request", async () => {
    for (const id of Object.keys(CONSTANTS.AI_PROVIDERS)) {
      calls = [];
      await fetchModelsForProvider(id);
      assert.equal(calls.length, 1, `${id} sent ${calls.length} requests`);
      assert.match(calls[0].url, /^https?:\/\//, `${id} built a URL of ${calls[0].url}`);
    }
  });
});

describe("fetchModelsForProvider — reading the response", () => {
  test("gemini strips the models/ prefix and drops models that cannot generate", async () => {
    body = {
      models: [
        {
          name: "models/gemini-2.0-flash",
          displayName: "Gemini 2.0 Flash",
          supportedGenerationMethods: ["generateContent"],
        },
        { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
      ],
    };
    const out = await fetchModelsForProvider("gemini");
    assert.deepEqual(
      out.map((m) => m.id),
      ["gemini-2.0-flash"],
    );
    assert.equal(out[0].label, "Google Gemini: Gemini 2.0 Flash");
  });

  test("claude keeps only claude models, newest first", async () => {
    body = {
      data: [
        { id: "claude-haiku-4-5-20251001", display_name: "Haiku 4.5" },
        { id: "claude-opus-4-20250101", display_name: "Opus 4" },
        { id: "some-other-model" },
      ],
    };
    const out = await fetchModelsForProvider("claude");
    assert.deepEqual(
      out.map((m) => m.id),
      ["claude-opus-4-20250101", "claude-haiku-4-5-20251001"].sort((a, b) => b.localeCompare(a)),
    );
    assert.ok(!out.some((m) => m.id === "some-other-model"));
  });

  test("openai sorts by id", async () => {
    body = { data: [{ id: "gpt-4o" }, { id: "gpt-3.5-turbo" }] };
    const out = await fetchModelsForProvider("openai");
    assert.deepEqual(
      out.map((m) => m.id),
      ["gpt-3.5-turbo", "gpt-4o"],
    );
  });

  test("ollama reads the name field its /api/tags response uses", async () => {
    body = { models: [{ name: "llama3.2:latest", size: 1 }] };
    const out = await fetchModelsForProvider("ollama");
    assert.deepEqual(
      out.map((m) => m.id),
      ["llama3.2:latest"],
    );
  });

  test("a listing that returns nothing falls back to the declared models", async () => {
    // Without this the DeepSeek picker goes empty the moment a key expires,
    // which reads as "this provider has no models" rather than "check the key".
    body = { data: [] };
    const out = await fetchModelsForProvider("deepseek");
    assert.deepEqual(
      out.map((m) => m.id),
      CONSTANTS.AI_PROVIDERS.deepseek.staticModels,
    );
  });

  test("a provider with no static models simply lists nothing", async () => {
    body = { data: [] };
    assert.deepEqual(await fetchModelsForProvider("openai"), []);
  });
});

describe("testAIKey", () => {
  test("tests the key the caller passed, not the one in storage", async () => {
    await testAIKey("openai", "sk-typed-just-now");
    assert.equal(calls[0].init.headers.Authorization, "Bearer sk-typed-just-now");
  });

  test("every declared provider can be tested", async () => {
    for (const id of Object.keys(CONSTANTS.AI_PROVIDERS)) {
      const res = await testAIKey(id, "THE-KEY");
      assert.equal(res.ok, true, `${id}: ${res.error}`);
    }
  });
});

describe("the descriptor is complete", () => {
  test("every provider declares how to read its model list", () => {
    for (const [id, meta] of Object.entries(CONSTANTS.AI_PROVIDERS)) {
      assert.ok(meta.modelList?.path, `${id} has no modelList.path`);
      assert.ok(meta.name && meta.shortName, `${id} is missing a name`);
      // Anything that needs a key must say where it goes, or the request would
      // be sent unauthenticated and the failure blamed on the key.
      if (meta.keyRequired) assert.ok(meta.auth?.header, `${id} needs a key but declares no auth`);
    }
  });
});
