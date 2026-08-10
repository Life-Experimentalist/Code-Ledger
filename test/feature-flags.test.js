/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the two master switches.
 *
 * These decide whether whole regions of the UI render at all, so the failure
 * mode is not a wrong number on screen — it is a panel that survives being
 * switched off, or a feature that vanishes for someone who never asked.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isAIActive,
  countEnabledAIProviders,
  canToggleAI,
  isGamificationActive,
  isCombinedActive,
} from "../src/core/feature-flags.js";
import { CONSTANTS } from "../src/core/constants.js";

const PROVIDER_IDS = Object.keys(CONSTANTS.AI_PROVIDERS || {});

describe("isAIActive", () => {
  test("a fresh install with no provider configured is off", () => {
    assert.equal(isAIActive({}), false);
    assert.equal(isAIActive({ _defaultsApplied: true }), false);
  });

  test("turning on any provider turns the feature on, with no extra step", () => {
    for (const id of PROVIDER_IDS) {
      assert.equal(isAIActive({ [`${id}_enabled`]: true }), true, `${id} should activate AI`);
    }
  });

  test("the explicit off switch beats configured providers", () => {
    const withProvider = { [`${PROVIDER_IDS[0]}_enabled`]: true };
    assert.equal(isAIActive(withProvider), true);
    assert.equal(isAIActive({ ...withProvider, aiEnabled: false }), false);
  });

  test("aiEnabled: true does not conjure a provider that is not there", () => {
    // Otherwise a stale synced setting would light up an AI panel with nothing
    // behind it, and every call would fail with "no provider configured".
    assert.equal(isAIActive({ aiEnabled: true }), false);
  });

  test("removing the last provider switches the feature off on its own", () => {
    const id = PROVIDER_IDS[0];
    assert.equal(isAIActive({ [`${id}_enabled`]: true }), true);
    assert.equal(isAIActive({ [`${id}_enabled`]: false }), false);
  });

  test("a truthy-but-not-true flag does not count as enabled", () => {
    const id = PROVIDER_IDS[0];
    assert.equal(isAIActive({ [`${id}_enabled`]: "yes" }), false);
    assert.equal(isAIActive({ [`${id}_enabled`]: 1 }), false);
  });

  test("survives junk in place of a settings object", () => {
    assert.equal(isAIActive(null), false);
    assert.equal(isAIActive(undefined), false);
    assert.equal(isAIActive("nonsense"), false);
  });

  test("an unknown provider key is ignored", () => {
    assert.equal(isAIActive({ notaprovider_enabled: true }), false);
  });
});

describe("countEnabledAIProviders", () => {
  test("counts only the providers that are actually on", () => {
    assert.equal(countEnabledAIProviders({}), 0);
    const two = {};
    two[`${PROVIDER_IDS[0]}_enabled`] = true;
    two[`${PROVIDER_IDS[1]}_enabled`] = true;
    two[`${PROVIDER_IDS[2]}_enabled`] = false;
    assert.equal(countEnabledAIProviders(two), 2);
  });

  test("counts providers even when the master switch is off", () => {
    // The panel needs to know they are still configured so it can offer to
    // switch the feature back on rather than making the user re-add keys.
    const s = { [`${PROVIDER_IDS[0]}_enabled`]: true, aiEnabled: false };
    assert.equal(countEnabledAIProviders(s), 1);
    assert.equal(isAIActive(s), false);
  });
});

describe("canToggleAI", () => {
  test("no dead switch is offered when there is nothing to switch", () => {
    assert.equal(canToggleAI({}), false);
    assert.equal(canToggleAI({ [`${PROVIDER_IDS[0]}_enabled`]: true }), true);
  });
});

describe("isGamificationActive", () => {
  test("on by default — it needs no key and no network", () => {
    assert.equal(isGamificationActive({}), true);
    assert.equal(isGamificationActive(null), true);
    assert.equal(isGamificationActive({ gamificationEnabled: true }), true);
  });

  test("only an explicit false turns it off", () => {
    assert.equal(isGamificationActive({ gamificationEnabled: false }), false);
    assert.equal(isGamificationActive({ gamificationEnabled: 0 }), true);
    assert.equal(isGamificationActive({ gamificationEnabled: "no" }), true);
  });
});

describe("isCombinedActive", () => {
  test("needs both halves", () => {
    const id = PROVIDER_IDS[0];
    assert.equal(isCombinedActive({ [`${id}_enabled`]: true }), true);
    assert.equal(
      isCombinedActive({ [`${id}_enabled`]: true, gamificationEnabled: false }),
      false,
    );
    assert.equal(isCombinedActive({ gamificationEnabled: true }), false);
  });
});
