/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NeetCode handler — the parts that decide whether a commit happens.
 *
 * Everything tested here is pure: envelope unwrapping, the accepted/not
 * decision, the shape of the recorded verdict, language resolution and page
 * detection. The DOM-reading and network-calling parts are not covered by
 * unit tests; they are covered by the fact that they cannot cause a commit on
 * their own.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  unwrap,
  isAccepted,
  readVerdict,
  readSubmitRequest,
  normalizeDifficulty,
} from "../src/handlers/platforms/neetcode/api.js";
import { resolveLang } from "../src/handlers/platforms/neetcode/lang-utils.js";
import {
  detectPage,
  isSolveCapablePage,
  PAGE_TYPES,
} from "../src/handlers/platforms/neetcode/page-detector.js";
import { readTappedSolve } from "../src/handlers/platforms/neetcode/submission-detector.js";

describe("neetcode/api unwrap", () => {
  test("peels the Firebase callable envelope", () => {
    assert.deepEqual(unwrap({ result: { a: 1 } }), { a: 1 });
  });

  test("peels a proxied data envelope", () => {
    assert.deepEqual(unwrap({ data: { a: 1 } }), { a: 1 });
  });

  test("peels nested envelopes", () => {
    assert.deepEqual(unwrap({ result: { data: { a: 1 } } }), { a: 1 });
  });

  test("leaves a bare payload alone", () => {
    assert.deepEqual(unwrap({ a: 1 }), { a: 1 });
  });

  test("does not mistake a verdict's own `data` for an envelope", () => {
    // A payload that already has a status is the verdict, not a wrapper.
    const verdict = { status: { id: 3 }, data: "stdout" };
    assert.deepEqual(unwrap(verdict), verdict);
  });

  test("passes non-objects straight through", () => {
    assert.equal(unwrap(null), null);
    assert.equal(unwrap("x"), "x");
  });
});

describe("neetcode/api isAccepted", () => {
  test("accepts Judge0 status id 3", () => {
    assert.equal(isAccepted({ status: { id: 3, description: "Accepted" } }), true);
  });

  test("accepts on the description alone, whatever its casing", () => {
    assert.equal(isAccepted({ status: { id: 99, description: "accepted" } }), true);
    assert.equal(isAccepted({ status: { id: 99, description: "  ACCEPTED " } }), true);
  });

  test("rejects every other verdict", () => {
    assert.equal(isAccepted({ status: { id: 4, description: "Wrong Answer" } }), false);
    assert.equal(isAccepted({ status: { id: 5, description: "Time Limit Exceeded" } }), false);
    assert.equal(isAccepted({ status: { id: 11, description: "Runtime Error" } }), false);
  });

  test("rejects payloads with no status at all", () => {
    assert.equal(isAccepted({}), false);
    assert.equal(isAccepted(null), false);
    assert.equal(isAccepted({ status: "Accepted" }), false);
  });
});

describe("neetcode/api readVerdict", () => {
  test("formats runtime and memory the way NeetCode displays them", () => {
    const v = readVerdict({
      status: { id: 3, description: "Accepted" },
      time: "0.042",
      memory: 14200,
    });
    assert.equal(v.accepted, true);
    assert.equal(v.status, "Accepted");
    assert.equal(v.runtime, "0.042 s");
    assert.equal(v.memory, "14200 KB");
  });

  test("reports test counts when present and null when not", () => {
    const withCounts = readVerdict({ test_case_count: 62, correct_test_case_count: 62 });
    assert.equal(withCounts.totalTests, 62);
    assert.equal(withCounts.passedTests, 62);

    const without = readVerdict({});
    assert.equal(without.totalTests, null);
    assert.equal(without.passedTests, null);
  });

  test("parses the submission date when the payload carries one", () => {
    const v = readVerdict({ date: "2026-08-12T10:00:00.000Z" });
    assert.equal(v.timestamp, Date.parse("2026-08-12T10:00:00.000Z"));
  });

  test("survives an empty payload without throwing", () => {
    const v = readVerdict(null);
    assert.equal(v.accepted, false);
    assert.equal(v.runtime, null);
  });
});

describe("neetcode/api readSubmitRequest", () => {
  test("reads the callable-wrapped submit body", () => {
    const body = JSON.stringify({
      data: { problemId: "two-sum", rawCode: "print(1)", lang: "python" },
    });
    assert.deepEqual(readSubmitRequest(body), {
      problemId: "two-sum",
      code: "print(1)",
      lang: "python",
    });
  });

  test("reads an unwrapped submit body and the alternate field names", () => {
    const body = JSON.stringify({ slug: "two-sum", source_code: "x=1", language: "py" });
    const out = readSubmitRequest(body);
    assert.equal(out.problemId, "two-sum");
    assert.equal(out.code, "x=1");
  });

  test("refuses a request with no source — there is nothing to commit", () => {
    assert.equal(readSubmitRequest(JSON.stringify({ data: { problemId: "two-sum" } })), null);
    assert.equal(
      readSubmitRequest(JSON.stringify({ data: { problemId: "two-sum", rawCode: "   " } })),
      null,
    );
  });

  test("refuses a request with no problem id", () => {
    assert.equal(readSubmitRequest(JSON.stringify({ data: { rawCode: "x=1" } })), null);
  });

  test("returns null rather than throwing on unparseable input", () => {
    assert.equal(readSubmitRequest("not json"), null);
    assert.equal(readSubmitRequest(null), null);
    assert.equal(readSubmitRequest(""), null);
  });
});

describe("neetcode/api normalizeDifficulty", () => {
  test("normalises whatever casing the API used", () => {
    assert.equal(normalizeDifficulty("easy"), "Easy");
    assert.equal(normalizeDifficulty("MEDIUM"), "Medium");
    assert.equal(normalizeDifficulty(" Hard "), "Hard");
    assert.equal(normalizeDifficulty("med"), "Medium");
  });

  test("returns null for anything it does not recognise", () => {
    assert.equal(normalizeDifficulty("impossible"), null);
    assert.equal(normalizeDifficulty(""), null);
    assert.equal(normalizeDifficulty(null), null);
  });
});

describe("neetcode/lang-utils", () => {
  test("resolves every language NeetCode offers", () => {
    assert.deepEqual(resolveLang("python"), { name: "Python3", ext: "py", slug: "python3" });
    assert.deepEqual(resolveLang("cpp"), { name: "C++", ext: "cpp", slug: "cpp" });
    assert.deepEqual(resolveLang("csharp"), { name: "C#", ext: "cs", slug: "csharp" });
    assert.equal(resolveLang("golang").ext, "go");
    assert.equal(resolveLang("kotlin").ext, "kt");
    assert.equal(resolveLang("swift").ext, "swift");
    assert.equal(resolveLang("rust").ext, "rs");
    assert.equal(resolveLang("typescript").ext, "ts");
    assert.equal(resolveLang("java").ext, "java");
    assert.equal(resolveLang("javascript").ext, "js");
  });

  test("handles the display names the editor button shows", () => {
    assert.equal(resolveLang("Python 3").ext, "py");
    assert.equal(resolveLang("C++").ext, "cpp");
    assert.equal(resolveLang("  JavaScript  ").ext, "js");
  });

  test("falls back to a plain text file rather than guessing", () => {
    assert.deepEqual(resolveLang("brainfuck"), { name: "unknown", ext: "txt", slug: "txt" });
    assert.deepEqual(resolveLang(""), { name: "unknown", ext: "txt", slug: "txt" });
  });

  test("returns a fresh object each time so callers cannot mutate the table", () => {
    const a = resolveLang("python");
    a.ext = "MUTATED";
    assert.equal(resolveLang("python").ext, "py");
  });
});

describe("neetcode/page-detector", () => {
  test("treats every problem tab as a problem page", () => {
    // Each tab renders the same split view with the same editor, so a solve
    // can happen on any of them.
    for (const tab of ["", "/question", "/solution", "/history", "/discuss", "/notes"]) {
      const page = detectPage(`/problems/two-sum${tab}`);
      assert.equal(page.type, PAGE_TYPES.PROBLEM, `tab "${tab}"`);
      assert.equal(page.slug, "two-sum");
      assert.equal(isSolveCapablePage(`/problems/two-sum${tab}`), true);
    }
  });

  test("defaults the tab to question when the url omits it", () => {
    assert.equal(detectPage("/problems/two-sum").tab, "question");
  });

  test("recognises the listing pages without calling them solve-capable", () => {
    assert.equal(detectPage("/practice").type, PAGE_TYPES.PRACTICE);
    assert.equal(isSolveCapablePage("/practice"), false);
    assert.equal(detectPage("/roadmap").type, PAGE_TYPES.ROADMAP);
    assert.equal(isSolveCapablePage("/roadmap"), false);
  });

  test("returns unknown for anything else", () => {
    assert.equal(detectPage("/").type, PAGE_TYPES.UNKNOWN);
    assert.equal(detectPage("/courses/advanced-algorithms").type, PAGE_TYPES.UNKNOWN);
    assert.equal(detectPage("").type, PAGE_TYPES.UNKNOWN);
  });
});

describe("neetcode/submission-detector readTappedSolve", () => {
  const request = JSON.stringify({
    data: { problemId: "two-sum", rawCode: "def f(): pass", lang: "python" },
  });

  test("returns the solve for an accepted run", () => {
    const solve = readTappedSolve({
      status: 200,
      requestBody: request,
      responseBody: JSON.stringify({
        result: { status: { id: 3, description: "Accepted" }, time: "0.01", memory: 1000 },
      }),
    });
    assert.ok(solve);
    assert.equal(solve.problemId, "two-sum");
    assert.equal(solve.code, "def f(): pass");
    assert.equal(solve.verdict.accepted, true);
  });

  test("returns nothing for a rejected run", () => {
    const solve = readTappedSolve({
      status: 200,
      requestBody: request,
      responseBody: JSON.stringify({ result: { status: { id: 4, description: "Wrong Answer" } } }),
    });
    assert.equal(solve, null);
  });

  test("returns nothing when the judge itself errored", () => {
    assert.equal(
      readTappedSolve({
        status: 500,
        requestBody: request,
        responseBody: JSON.stringify({ result: { status: { id: 3 } } }),
      }),
      null,
    );
  });

  test("returns nothing when the response is not JSON", () => {
    assert.equal(
      readTappedSolve({ status: 200, requestBody: request, responseBody: "<html>oops</html>" }),
      null,
    );
  });

  test("returns nothing when the request carried no source", () => {
    assert.equal(
      readTappedSolve({
        status: 200,
        requestBody: JSON.stringify({ data: { problemId: "two-sum" } }),
        responseBody: JSON.stringify({ result: { status: { id: 3 } } }),
      }),
      null,
    );
  });

  test("returns nothing for an empty payload", () => {
    assert.equal(readTappedSolve(null), null);
  });
});
