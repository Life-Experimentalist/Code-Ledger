/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for repository path construction.
 *
 * Every value here originates on a scraped page and ends up as a directory or
 * filename in the user's GitHub repository, so these paths are both a
 * correctness surface (a malformed path is a commit that silently never lands)
 * and a safety one (a path that escapes problems/ writes somewhere it should
 * not, including .github/workflows).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  safeSegment,
  platformId,
  problemBase,
  problemDir,
  solutionPath,
  buildProblemMarkdown,
  PROBLEMS_ROOT,
} from "../src/core/path-builder.js";

describe("safeSegment", () => {
  test("leaves an ordinary slug untouched", () => {
    assert.equal(safeSegment("two-sum"), "two-sum");
    assert.equal(safeSegment("lc-1"), "lc-1");
  });

  test("removes path separators", () => {
    assert.ok(!safeSegment("a/b").includes("/"));
    assert.ok(!safeSegment("a\\b").includes("\\"));
  });

  test("cannot produce a traversal segment", () => {
    assert.notEqual(safeSegment(".."), "..");
    assert.notEqual(safeSegment("."), ".");
    assert.ok(!safeSegment("../../.github/workflows").startsWith("."));
  });

  test("strips a leading dot so nothing becomes a hidden file", () => {
    assert.equal(safeSegment(".github"), "github");
  });

  test("folds spaces to hyphens", () => {
    assert.equal(safeSegment("longest common subsequence"), "longest-common-subsequence");
  });

  test("drops accents rather than emitting non-ASCII filenames", () => {
    assert.equal(safeSegment("café"), "cafe");
  });

  test("never returns an empty segment", () => {
    assert.equal(safeSegment(""), "untitled");
    assert.equal(safeSegment("!!!"), "untitled");
    assert.equal(safeSegment(null), "untitled");
    assert.equal(safeSegment(undefined), "untitled");
  });
});

describe("platformId", () => {
  test("prefixes the platform code", () => {
    assert.equal(platformId("leetcode", "two-sum"), "lc-two-sum");
  });

  test("is idempotent", () => {
    assert.equal(platformId("leetcode", "lc-two-sum"), "lc-two-sum");
  });

  test("drops the ::submissionId suffix the bulk importer appends", () => {
    assert.equal(platformId("leetcode", "two-sum::1427680302"), "lc-two-sum");
  });

  test("a traversal attempt cannot escape the id", () => {
    assert.ok(!platformId("leetcode", "../../evil").includes(".."));
  });
});

describe("path construction stays inside problems/", () => {
  const escapes = (p) => !p.startsWith(`${PROBLEMS_ROOT}/`) || p.includes("..");

  test("a hostile slug cannot leave the problems root", () => {
    const id = "../../.github/workflows/pwn";
    assert.ok(!escapes(problemBase(id, null, {}, "leetcode")));
    assert.ok(!escapes(problemDir(id, "leetcode", null)));
    assert.ok(!escapes(solutionPath(id, "leetcode", { ext: "py" }, null)));
  });

  test("a hostile canonical id cannot leave the problems root", () => {
    const canonical = { canonicalId: "../../.github/workflows/pwn" };
    assert.ok(!escapes(problemBase("1", canonical)));
    assert.ok(!escapes(problemDir("1", "leetcode", canonical)));
  });

  test("a hostile file extension cannot add a path segment", () => {
    const p = solutionPath("two-sum", "leetcode", { ext: "py/../../evil.yml" }, null);
    assert.ok(!escapes(p));
    assert.equal(p.split("/").length, 3, "solution path must be problems/{id}/{file}");
  });

  test("ordinary input produces the documented layout", () => {
    assert.equal(
      solutionPath("two-sum", "leetcode", { ext: "py" }, null),
      "problems/lc-two-sum/lc-two-sum.py",
    );
    assert.equal(
      solutionPath("1", "leetcode", { ext: "py" }, { canonicalId: "two-sum" }),
      "problems/two-sum/leetcode/lc-1.py",
    );
  });
});

describe("buildProblemMarkdown — the AI-written problem summary", () => {
  // Codeforces, NeetCode and takeuforward have no statement endpoint, so their
  // problems used to commit with no statement section at all. The reviewer can
  // say what the problem asks — but the README goes into a public repository,
  // so a paraphrase must never be able to pass for the platform's own text.
  const SUMMARY =
    "Given an even weight w, decide whether it can be split into two even positive parts.";
  const base = { platform: "codeforces", id: "4-A", title: "Watermelon" };

  test("renders under its own heading, attributed, when there is no statement", () => {
    const md = buildProblemMarkdown({ ...base, aiStatementSummary: SUMMARY });
    assert.match(md, /## Problem Summary/);
    assert.doesNotMatch(md, /## Problem Statement/);
    assert.match(md, /> Written by the AI reviewer/);
    assert.ok(md.includes(SUMMARY));
    assert.ok(
      md.indexOf("Written by the AI reviewer") < md.indexOf(SUMMARY),
      "the attribution must come before the text it disclaims",
    );
  });

  test("the real statement always wins, and the summary is not shown beside it", () => {
    for (const field of ["description", "problemStatement"]) {
      const md = buildProblemMarkdown({
        ...base,
        [field]: "One integer w.",
        aiStatementSummary: SUMMARY,
      });
      assert.match(md, /## Problem Statement/);
      assert.doesNotMatch(md, /## Problem Summary/);
      assert.ok(!md.includes(SUMMARY), `expected no AI summary alongside ${field}`);
    }
  });

  test("an empty or whitespace summary adds no heading at all", () => {
    for (const value of [undefined, "", "   \n  "]) {
      const md = buildProblemMarkdown({ ...base, aiStatementSummary: value });
      assert.doesNotMatch(md, /## Problem Summary/);
      assert.doesNotMatch(md, /Written by the AI reviewer/);
    }
  });
});
