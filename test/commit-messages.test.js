/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the commit-message builder, in particular the user template.
 *
 * The Git settings panel has offered a "Commit Message Template" input since
 * the panel existed, but buildCommitMessage() never read the setting — the
 * input wrote a key nothing consumed. These tests pin the now-honoured
 * contract: the template applies to solve commits, fills exactly the five
 * variables the panel advertises, and every other commit type keeps its
 * fixed taxonomy string.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  applyCommitTemplate,
  buildCommitMessage,
  COMMIT_TYPES,
} from "../src/core/commit-messages.js";

const SOLVE = {
  title: "Two Sum",
  titleSlug: "two-sum",
  lang: { name: "Python3", ext: "py", slug: "python3" },
  topic: "Array",
  difficulty: "Easy",
  platform: "leetcode",
};

describe("applyCommitTemplate", () => {
  test("fills every advertised variable", () => {
    const msg = applyCommitTemplate("[{topic}] {title} — {difficulty} | {language} @{platform}", SOLVE);
    assert.equal(msg, "[Array] Two Sum — Easy | Python3 @leetcode");
  });

  test("missing data falls back rather than printing undefined", () => {
    const msg = applyCommitTemplate("{topic} {title} {difficulty} {language} {platform}", {});
    assert.equal(msg, "Untagged Unknown ? Unknown unknown");
  });

  test("unknown braces pass through untouched", () => {
    assert.equal(applyCommitTemplate("{title} {emoji}", SOLVE), "Two Sum {emoji}");
  });
});

describe("buildCommitMessage with a user template", () => {
  test("a solve commit uses the template when one is set", () => {
    const msg = buildCommitMessage(COMMIT_TYPES.SOLVED, SOLVE, "solve: {title} ({language})");
    assert.equal(msg, "solve: Two Sum (Python3)");
  });

  test("no template keeps the legacy [solved] format", () => {
    assert.equal(buildCommitMessage(COMMIT_TYPES.SOLVED, SOLVE), "[solved] Two Sum (Python3) — Array");
    assert.equal(
      buildCommitMessage(COMMIT_TYPES.SOLVED, SOLVE, "   "),
      "[solved] Two Sum (Python3) — Array",
      "a blank template is no template",
    );
  });

  test("non-solve types ignore the template", () => {
    const msg = buildCommitMessage(COMMIT_TYPES.UPDATE, SOLVE, "solve: {title}");
    assert.equal(msg, "[update] Two Sum — synced");
  });
});
