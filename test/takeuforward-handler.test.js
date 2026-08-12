/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * takeuforward handler — the pure decision logic.
 *
 * A note on what these tests can and cannot prove. The TUF+ judge is behind
 * the subscription, so no real accepted-verdict payload was ever observed. The
 * shapes below are FABRICATED, and passing tests therefore prove only that
 * `readVerdict` behaves as designed on plausible input — not that TUF's actual
 * response matches any of them. What they do prove, and what matters more, is
 * the safety direction: ambiguous, partial and unrecognised payloads all
 * resolve to "not accepted", so the failure mode is a missed commit rather
 * than a wrong one.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  unwrap,
  unredact,
  readVerdict,
  readSubmitRequest,
  readProblemMeta,
  readSubscriptionTier,
  normalizeDifficulty,
  REDACTED,
  TIER,
} from "../src/handlers/platforms/takeuforward/api.js";
import { resolveLang, SUPPORTED } from "../src/handlers/platforms/takeuforward/lang-utils.js";
import {
  detectPage,
  isSolveCapablePage,
  PAGE_TYPES,
} from "../src/handlers/platforms/takeuforward/page-detector.js";
import {
  SubmissionTracker,
  readSubmissionId,
  readIdFromUrl,
  PENDING_TTL_MS,
} from "../src/handlers/platforms/takeuforward/submission-detector.js";
import { slugFromHref, candidateIds } from "../src/handlers/platforms/takeuforward/sheet.js";

describe("takeuforward/api unwrap", () => {
  test("peels the standard envelope", () => {
    assert.deepEqual(unwrap({ success: true, message: "ok", data: { a: 1 } }), { a: 1 });
  });

  test("returns null when the call itself failed", () => {
    assert.equal(unwrap({ success: false, error: "TOKEN_MISSING" }), null);
  });

  test("passes a bare payload through", () => {
    assert.deepEqual(unwrap({ a: 1 }), { a: 1 });
  });

  test("returns null for non-objects", () => {
    assert.equal(unwrap(null), null);
    assert.equal(unwrap("x"), null);
  });
});

describe("takeuforward/api unredact", () => {
  test("drops the paywall sentinel rather than committing it as a value", () => {
    assert.equal(unredact(REDACTED), null);
    assert.equal(unredact("Subscribe to TUF+"), null);
  });

  test("keeps a real value", () => {
    assert.equal(unredact("Medium"), "Medium");
  });

  test("filters the sentinel out of an array", () => {
    assert.deepEqual(unredact(["Arrays", REDACTED, "Hashing"]), ["Arrays", "Hashing"]);
    assert.deepEqual(unredact([REDACTED]), []);
  });

  test("normalises absent values to null", () => {
    assert.equal(unredact(undefined), null);
    assert.equal(unredact(null), null);
  });
});

describe("takeuforward/api readVerdict", () => {
  test("accepts a payload whose status field says so", () => {
    // FABRICATED shape — see the file header.
    const v = readVerdict({ status: "accepted", total_testcases: 20, passed_testcases: 20 });
    assert.equal(v.accepted, true);
    assert.equal(v.totalTests, 20);
    assert.equal(v.passedTests, 20);
  });

  test("accepts the other words a judge might use for a full pass", () => {
    for (const word of ["Accepted", "success", "passed", "AC", "correct"]) {
      assert.equal(readVerdict({ verdict: word }).accepted, true, word);
    }
  });

  test("accepts a Judge0-shaped nested status", () => {
    assert.equal(readVerdict({ status: { id: 3, description: "Accepted" } }).accepted, true);
  });

  test("NEVER reads the envelope's own success as a verdict", () => {
    // `success: true` means the HTTP call worked. It is true on a rejected
    // submission too, so treating it as a verdict would commit wrong answers.
    assert.equal(readVerdict({ success: true }).accepted, false);
    assert.equal(readVerdict({ success: true, message: "Submission fetched" }).accepted, false);
  });

  test("treats a partial pass as a failure even if the status says accepted", () => {
    const v = readVerdict({ status: "accepted", total_testcases: 20, passed_testcases: 19 });
    assert.equal(v.accepted, false);
  });

  test("reports a still-judging poll as pending, not as a failure", () => {
    for (const word of ["pending", "PROCESSING", "in_progress", "queued", "Running"]) {
      const v = readVerdict({ status: word });
      assert.equal(v.pending, true, word);
      assert.equal(v.accepted, false, word);
    }
  });

  test("rejects a wrong answer", () => {
    const v = readVerdict({ status: "wrong_answer" });
    assert.equal(v.accepted, false);
    assert.equal(v.pending, false);
  });

  test("rejects an unrecognised payload rather than guessing", () => {
    assert.equal(readVerdict({ whatever: 1 }).accepted, false);
    assert.equal(readVerdict(null).accepted, false);
    assert.equal(readVerdict("accepted").accepted, false);
  });

  test("carries through timings when present", () => {
    const v = readVerdict({ status: "accepted", time: "0.03", memory: "12MB" });
    assert.equal(v.runtime, "0.03");
    assert.equal(v.memory, "12MB");
  });
});

describe("takeuforward/api readSubmitRequest", () => {
  test("reads the source, language and slug", () => {
    const body = JSON.stringify({ problem_slug: "two-sum", code: "int main(){}", language: "cpp" });
    assert.deepEqual(readSubmitRequest(body), {
      slug: "two-sum",
      code: "int main(){}",
      lang: "cpp",
    });
  });

  test("still returns the source when the request does not name the problem", () => {
    // The url identifies the problem in that case; the handler falls back to it.
    const out = readSubmitRequest(JSON.stringify({ code: "x", language: "go" }));
    assert.equal(out.slug, null);
    assert.equal(out.code, "x");
  });

  test("refuses a request with no source", () => {
    assert.equal(readSubmitRequest(JSON.stringify({ problem_slug: "two-sum" })), null);
    assert.equal(readSubmitRequest(JSON.stringify({ code: "  " })), null);
  });

  test("returns null rather than throwing on unparseable input", () => {
    assert.equal(readSubmitRequest("not json"), null);
    assert.equal(readSubmitRequest(null), null);
  });
});

describe("takeuforward/api readProblemMeta", () => {
  const authed = {
    success: true,
    data: {
      problem_slug: "two-sum",
      problem_name: "Two Sum",
      difficulty: "Easy",
      topic_tags: ["Arrays", "Hashing"],
      problem_statement: "<p>Find two numbers…</p>",
      constraints: "1 <= n <= 1e5",
      example1: "in: [2,7]",
    },
  };

  test("reads a subscriber's full metadata", () => {
    const meta = readProblemMeta(authed);
    assert.equal(meta.slug, "two-sum");
    assert.equal(meta.title, "Two Sum");
    assert.equal(meta.difficulty, "Easy");
    assert.deepEqual(meta.tags, ["Arrays", "Hashing"]);
    assert.equal(meta.examples.length, 1);
  });

  test("drops the redacted fields for a non-subscriber instead of committing the sentinel", () => {
    const meta = readProblemMeta({
      success: true,
      data: {
        problem_slug: "two-sum",
        problem_name: "Two Sum",
        difficulty: REDACTED,
        topic_tags: REDACTED,
      },
    });
    assert.equal(meta.title, "Two Sum");
    assert.equal(meta.difficulty, null);
    assert.deepEqual(meta.tags, []);
  });

  test("returns null when the payload is not a problem", () => {
    assert.equal(readProblemMeta({ success: false }), null);
    assert.equal(readProblemMeta({ success: true, data: { unrelated: 1 } }), null);
    assert.equal(readProblemMeta(null), null);
  });
});

describe("takeuforward/api readSubscriptionTier", () => {
  test("reads free from the difficulty sentinel", () => {
    const tier = readSubscriptionTier({
      success: true,
      data: { problem_slug: "two-sum", difficulty: REDACTED, topic_tags: REDACTED },
    });
    assert.equal(tier, TIER.FREE);
  });

  test("reads free when only the tags are redacted", () => {
    const tier = readSubscriptionTier({
      success: true,
      data: { problem_slug: "two-sum", topic_tags: ["Arrays", REDACTED] },
    });
    assert.equal(tier, TIER.FREE);
  });

  test("reads plus from a real difficulty", () => {
    const tier = readSubscriptionTier({
      success: true,
      data: { problem_slug: "two-sum", difficulty: "Easy", topic_tags: ["Arrays"] },
    });
    assert.equal(tier, TIER.PLUS);
  });

  test("says nothing when the fields are simply absent", () => {
    assert.equal(readSubscriptionTier({ success: true, data: { problem_slug: "two-sum" } }), null);
    assert.equal(
      readSubscriptionTier({ success: true, data: { problem_slug: "two-sum", difficulty: "" } }),
      null,
    );
  });

  test("says nothing about a response that is not a problem", () => {
    assert.equal(readSubscriptionTier({ success: false }), null);
    assert.equal(readSubscriptionTier({ success: true, data: { unrelated: 1 } }), null);
    assert.equal(readSubscriptionTier(null), null);
  });
});

describe("takeuforward/api normalizeDifficulty", () => {
  test("normalises the three levels", () => {
    assert.equal(normalizeDifficulty("easy"), "Easy");
    assert.equal(normalizeDifficulty("MEDIUM"), "Medium");
    assert.equal(normalizeDifficulty(" Hard "), "Hard");
  });

  test("returns null for the sentinel and for anything unrecognised", () => {
    assert.equal(normalizeDifficulty(REDACTED), null);
    assert.equal(normalizeDifficulty(""), null);
  });
});

describe("takeuforward/lang-utils", () => {
  test("resolves each of the six languages the judge accepts", () => {
    assert.deepEqual(SUPPORTED, ["cpp", "java", "python", "javascript", "csharp", "go"]);
    assert.equal(resolveLang("cpp").ext, "cpp");
    assert.equal(resolveLang("java").ext, "java");
    assert.equal(resolveLang("python").ext, "py");
    assert.equal(resolveLang("javascript").ext, "js");
    assert.equal(resolveLang("csharp").ext, "cs");
    assert.equal(resolveLang("go").ext, "go");
  });

  test("handles display names and version suffixes", () => {
    assert.equal(resolveLang("C++").ext, "cpp");
    assert.equal(resolveLang("Python 3").ext, "py");
    assert.equal(resolveLang("C#").ext, "cs");
  });

  test("falls back to a plain text file rather than guessing", () => {
    assert.deepEqual(resolveLang("ruby"), { name: "unknown", ext: "txt", slug: "txt" });
    assert.deepEqual(resolveLang(""), { name: "unknown", ext: "txt", slug: "txt" });
  });
});

describe("takeuforward/page-detector", () => {
  test("recognises a TUF+ problem page as the only solve-capable one", () => {
    const page = detectPage("/plus/dsa/problems/two-sum");
    assert.equal(page.type, PAGE_TYPES.PROBLEM);
    assert.equal(page.slug, "two-sum");
    assert.equal(isSolveCapablePage("/plus/dsa/problems/two-sum"), true);
  });

  test("tolerates a trailing slash and a deeper sub-route", () => {
    assert.equal(detectPage("/plus/dsa/problems/two-sum/").slug, "two-sum");
    assert.equal(detectPage("/plus/dsa/problems/two-sum/editorial").slug, "two-sum");
  });

  test("recognises a sheet, and never treats it as solve-capable", () => {
    const page = detectPage("/dsa/strivers-a2z-sheet-learn-dsa-a-to-z");
    assert.equal(page.type, PAGE_TYPES.SHEET);
    assert.equal(page.sheet, "strivers-a2z-sheet-learn-dsa-a-to-z");
    assert.equal(isSolveCapablePage("/dsa/strivers-a2z-sheet-learn-dsa-a-to-z"), false);
  });

  test("does not mistake a deeper article route for a sheet", () => {
    assert.equal(detectPage("/dsa/arrays/two-sum-explained").type, PAGE_TYPES.UNKNOWN);
  });

  test("returns unknown for everything else", () => {
    assert.equal(detectPage("/").type, PAGE_TYPES.UNKNOWN);
    assert.equal(detectPage("/plus").type, PAGE_TYPES.UNKNOWN);
    assert.equal(detectPage("").type, PAGE_TYPES.UNKNOWN);
  });
});

describe("takeuforward/submission-detector id extraction", () => {
  test("finds an id under any of the names a judge might use", () => {
    assert.equal(readSubmissionId({ submission_id: "abc" }), "abc");
    assert.equal(readSubmissionId({ token: "t1" }), "t1");
    assert.equal(readSubmissionId({ id: 42 }), "42");
    assert.equal(readSubmissionId({ unrelated: 1 }), null);
    assert.equal(readSubmissionId(null), null);
  });

  test("finds an id in a poll url's query string", () => {
    assert.equal(
      readIdFromUrl("https://x/api/v1/plus/judge/check-submit?submission_id=abc"),
      "abc",
    );
    assert.equal(readIdFromUrl("https://x/api/v1/plus/judge/check-submit?token=t1&x=2"), "t1");
    assert.equal(readIdFromUrl("https://x/api/v1/plus/judge/check-submit"), null);
  });
});

describe("takeuforward/submission-detector SubmissionTracker", () => {
  const SUBMIT = "https://backend-go.takeuforward.org/api/v1/plus/judge/submit";
  const CHECK = "https://backend-go.takeuforward.org/api/v1/plus/judge/check-submit";

  const submitBody = JSON.stringify({
    problem_slug: "two-sum",
    code: "int main(){}",
    language: "cpp",
  });

  /** A tracker with a clock we control. */
  function fixture(start = 1_000_000) {
    let now = start;
    const tracker = new SubmissionTracker(() => now);
    return { tracker, advance: (ms) => (now += ms) };
  }

  test("pairs a submit with the poll that reports the verdict", () => {
    const { tracker } = fixture();

    assert.equal(
      tracker.noteSubmit({
        url: SUBMIT,
        status: 200,
        requestBody: submitBody,
        responseBody: JSON.stringify({ success: true, data: { submission_id: "s1" } }),
      }),
      null,
    );

    // Still judging — nothing yet, and the submission stays pending.
    assert.equal(
      tracker.noteCheck({
        url: `${CHECK}?submission_id=s1`,
        status: 200,
        responseBody: JSON.stringify({ success: true, data: { status: "pending" } }),
      }),
      null,
    );
    assert.ok(tracker.pending);

    const solve = tracker.noteCheck({
      url: `${CHECK}?submission_id=s1`,
      status: 200,
      responseBody: JSON.stringify({ success: true, data: { status: "accepted" } }),
    });
    assert.ok(solve);
    assert.equal(solve.slug, "two-sum");
    assert.equal(solve.code, "int main(){}");
    assert.equal(solve.lang, "cpp");
    assert.equal(tracker.pending, null, "settling clears the pending submission");
  });

  test("does not pair a poll for a different submission", () => {
    const { tracker } = fixture();
    tracker.noteSubmit({
      url: SUBMIT,
      status: 200,
      requestBody: submitBody,
      responseBody: JSON.stringify({ success: true, data: { submission_id: "s1" } }),
    });

    const solve = tracker.noteCheck({
      url: `${CHECK}?submission_id=SOMEONE-ELSE`,
      status: 200,
      responseBody: JSON.stringify({ success: true, data: { status: "accepted" } }),
    });
    assert.equal(solve, null);
    assert.ok(tracker.pending, "our submission is still waiting");
  });

  test("pairs without an id when neither side exposes one", () => {
    const { tracker } = fixture();
    tracker.noteSubmit({ url: SUBMIT, status: 200, requestBody: submitBody, responseBody: "{}" });

    const solve = tracker.noteCheck({
      url: CHECK,
      status: 200,
      responseBody: JSON.stringify({ success: true, data: { status: "accepted" } }),
    });
    assert.ok(solve);
    assert.equal(solve.slug, "two-sum");
  });

  test("drops the submission on a terminal rejection", () => {
    const { tracker } = fixture();
    tracker.noteSubmit({ url: SUBMIT, status: 200, requestBody: submitBody, responseBody: "{}" });

    assert.equal(
      tracker.noteCheck({
        url: CHECK,
        status: 200,
        responseBody: JSON.stringify({ success: true, data: { status: "wrong_answer" } }),
      }),
      null,
    );
    assert.equal(tracker.pending, null);
  });

  test("returns the solve straight away if the judge answered synchronously", () => {
    const { tracker } = fixture();
    const solve = tracker.noteSubmit({
      url: SUBMIT,
      status: 200,
      requestBody: submitBody,
      responseBody: JSON.stringify({ success: true, data: { status: "accepted" } }),
    });
    assert.ok(solve);
    assert.equal(tracker.pending, null);
  });

  test("never pairs a verdict with a submission that is minutes old", () => {
    const { tracker, advance } = fixture();
    tracker.noteSubmit({ url: SUBMIT, status: 200, requestBody: submitBody, responseBody: "{}" });

    advance(PENDING_TTL_MS + 1);

    const solve = tracker.noteCheck({
      url: CHECK,
      status: 200,
      responseBody: JSON.stringify({ success: true, data: { status: "accepted" } }),
    });
    assert.equal(solve, null);
    assert.equal(tracker.pending, null);
  });

  test("ignores a submit call that carried no source", () => {
    const { tracker } = fixture();
    assert.equal(
      tracker.noteSubmit({
        url: SUBMIT,
        status: 200,
        requestBody: JSON.stringify({ problem_slug: "two-sum" }),
        responseBody: "{}",
      }),
      null,
    );
    assert.equal(tracker.pending, null);
  });

  test("ignores calls the server errored on", () => {
    const { tracker } = fixture();
    assert.equal(
      tracker.noteSubmit({ url: SUBMIT, status: 401, requestBody: submitBody, responseBody: "{}" }),
      null,
    );
    assert.equal(tracker.pending, null);

    tracker.noteSubmit({ url: SUBMIT, status: 200, requestBody: submitBody, responseBody: "{}" });
    assert.equal(
      tracker.noteCheck({
        url: CHECK,
        status: 500,
        responseBody: JSON.stringify({ data: { status: "accepted" } }),
      }),
      null,
    );
  });

  test("a poll with no submission pending pairs with nothing", () => {
    const { tracker } = fixture();
    assert.equal(
      tracker.noteCheck({
        url: CHECK,
        status: 200,
        responseBody: JSON.stringify({ success: true, data: { status: "accepted" } }),
      }),
      null,
    );
  });
});

describe("takeuforward/sheet", () => {
  test("reads the slug out of a TUF+ link", () => {
    assert.equal(
      slugFromHref("https://takeuforward.org/plus/dsa/problems/two-sum", "/plus/dsa/problems/"),
      "two-sum",
    );
    assert.equal(slugFromHref("/plus/dsa/problems/two-sum/", "/plus/dsa/problems/"), "two-sum");
  });

  test("strips the text fragment the sheet appends to LeetCode links", () => {
    assert.equal(
      slugFromHref(
        "https://leetcode.com/problems/two-sum/#:~:text=Two%20Sum",
        "leetcode.com/problems/",
      ),
      "two-sum",
    );
    assert.equal(
      slugFromHref("https://leetcode.com/problems/two-sum/description/", "leetcode.com/problems/"),
      "two-sum",
    );
    assert.equal(
      slugFromHref("https://leetcode.com/problems/two-sum?envType=x", "leetcode.com/problems/"),
      "two-sum",
    );
  });

  test("returns null when the href is not a problem link", () => {
    assert.equal(slugFromHref("https://takeuforward.org/dsa/arrays", "/plus/dsa/problems/"), null);
    assert.equal(slugFromHref("", "/plus/dsa/problems/"), null);
    assert.equal(slugFromHref(null, "/plus/dsa/problems/"), null);
    assert.equal(slugFromHref("https://leetcode.com/problems/", "leetcode.com/problems/"), null);
  });

  test("builds the ids a row could have been solved under", () => {
    assert.deepEqual(candidateIds({ tufSlug: "two-sum", leetcodeSlug: "two-sum" }), [
      "tuf-two-sum",
      "lc-two-sum",
      "nc-two-sum",
    ]);
    assert.deepEqual(candidateIds({ tufSlug: "two-sum", leetcodeSlug: null }), ["tuf-two-sum"]);
    assert.deepEqual(candidateIds({ tufSlug: null, leetcodeSlug: null }), []);
  });
});
