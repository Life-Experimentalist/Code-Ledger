/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Where an AI review is allowed to be sent.
 *
 * The handler posts the user's solution to this URL and puts the user's API key
 * in the Authorization header, so whoever picks the URL receives both. Settings
 * are not a trusted input — they are merged from a file in the ledger
 * repository and from restored backups — so the value is checked at the point
 * of use as well as at the point of entry.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isSafeEndpoint, resolveEndpoint } from "../src/core/ai-endpoint.js";
import { CONSTANTS } from "../src/core/constants.js";

describe("isSafeEndpoint", () => {
  it("accepts https anywhere", () => {
    for (const u of [
      "https://api.openai.com/v1",
      "https://my-gateway.internal:8443/v1",
      "https://evil.example/v1", // honest: https alone is not a trust decision
    ]) {
      assert.equal(isSafeEndpoint(u), true, `${u} should be accepted`);
    }
  });

  it("accepts plain http only on loopback", () => {
    // Ollama's shipped default is http://localhost:11434/api, which is the only
    // reason http is legal at all.
    for (const u of ["http://localhost:11434/api", "http://127.0.0.1:11434/api", "http://[::1]/v1"])
      assert.equal(isSafeEndpoint(u), true, `${u} should be accepted`);
  });

  it("rejects plain http to anywhere else", () => {
    // A downgrade is enough on its own: the key travels in a header.
    for (const u of [
      "http://evil.example/v1",
      "http://192.168.1.9/v1",
      "http://localhost.evil.tld/",
    ])
      assert.equal(isSafeEndpoint(u), false, `${u} must be rejected`);
  });

  it("rejects schemes that are not http(s) at all", () => {
    for (const u of [
      "javascript:fetch('//evil.example')",
      "data:text/plain,x",
      "file:///etc/passwd",
      "ftp://evil.example/v1",
    ]) {
      assert.equal(isSafeEndpoint(u), false, `${u} must be rejected`);
    }
  });

  it("rejects anything that is not a URL", () => {
    for (const v of ["", "   ", "api.openai.com/v1", "not a url", null, undefined, 42, {}, []]) {
      assert.equal(isSafeEndpoint(/** @type {any} */ (v)), false);
    }
  });
});

describe("resolveEndpoint", () => {
  it("uses the shipped default when nothing is overridden", () => {
    assert.equal(resolveEndpoint("openai", {}), CONSTANTS.AI_PROVIDERS.openai.endpoint);
    assert.equal(resolveEndpoint("ollama", {}), CONSTANTS.AI_PROVIDERS.ollama.endpoint);
  });

  it("honours a legitimate override", () => {
    assert.equal(
      resolveEndpoint("openai", { openai_endpoint: "https://gateway.example/v1" }),
      "https://gateway.example/v1",
    );
  });

  it("falls back to the shipped default when the override is unsafe", () => {
    // The whole point: a poisoned value degrades to shipped behaviour rather
    // than being fetched, and rather than throwing and killing the review.
    for (const bad of ["http://evil.example/v1", "javascript:0", "://", ""]) {
      assert.equal(
        resolveEndpoint("openai", { openai_endpoint: bad }),
        CONSTANTS.AI_PROVIDERS.openai.endpoint,
        `${bad} should not have been used`,
      );
    }
  });

  it("does not let an unsafe provider key suppress the legacy global one", () => {
    assert.equal(
      resolveEndpoint("claude", {
        claude_endpoint: "http://evil.example/v1",
        aiEndpoint: "https://gateway.example/v1",
      }),
      "https://gateway.example/v1",
    );
  });

  it("still prefers the provider key when both are safe", () => {
    assert.equal(
      resolveEndpoint("claude", {
        claude_endpoint: "https://specific.example/v1",
        aiEndpoint: "https://global.example/v1",
      }),
      "https://specific.example/v1",
    );
  });

  it("trims a trailing slash so the path join does not double up", () => {
    // Handlers build `${endpoint}/chat/completions`.
    assert.equal(
      resolveEndpoint("openai", { openai_endpoint: "https://gateway.example/v1/" }),
      "https://gateway.example/v1",
    );
  });

  it("returns the empty string for a provider that does not exist", () => {
    assert.equal(resolveEndpoint("nope", {}), "");
  });

  it("keeps every shipped default acceptable to its own gate", () => {
    for (const [id, provider] of Object.entries(CONSTANTS.AI_PROVIDERS)) {
      if (!provider.endpoint) continue;
      assert.equal(
        isSafeEndpoint(provider.endpoint),
        true,
        `${id}'s shipped endpoint ${provider.endpoint} fails the check`,
      );
    }
  });
});
