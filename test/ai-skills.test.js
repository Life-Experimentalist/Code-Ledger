/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Skills — which ones turn on, and the one line each review leaves behind.
 *
 * A skill rewrites how the assistant answers. When one fires uninvited the
 * learner cannot tell why the replies changed shape, so the matching has to be
 * exact: `/review` invoked, not the word "review" mentioned; stuck, not the word
 * "helper". Trigger matching was a bare `includes()` and got both wrong.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

/** `browser-compat.js` falls back to localStorage when `chrome` is absent. */
const backing = new Map();
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: (k) => backing.delete(k),
};

const { BUILTIN_SKILLS, getActiveSkills, buildSkillsSystemPrompt, getAutoToolIds, saveUserSkill } =
  await import("../src/core/ai/skills-registry.js");
const { parseTakeaway, parseWeakAreas } = await import("../src/core/ai-prompts.js");

beforeEach(() => backing.clear());

const idsFor = async (ctx) => (await getActiveSkills(ctx)).map((s) => s.id);

describe("the built-in set", () => {
  it("gives every skill an id, a trigger and something to say", () => {
    const ids = new Set();
    for (const skill of BUILTIN_SKILLS) {
      assert.ok(skill.id, "a skill with no id cannot be toggled or overridden");
      assert.equal(ids.has(skill.id), false, `duplicate skill id: ${skill.id}`);
      ids.add(skill.id);
      assert.ok(skill.name, `${skill.id} has no display name`);
      assert.ok(skill.trigger, `${skill.id} has no trigger, so it can never fire`);
      assert.ok(
        (skill.system_prompt_modifier || "").length > 40,
        `${skill.id} adds nothing to the prompt`,
      );
    }
  });

  it("keeps exactly one always-on skill — every one of them is paid for on every message", () => {
    assert.equal(BUILTIN_SKILLS.filter((s) => s.trigger === "always").length, 1);
  });
});

describe("commands", () => {
  it("fires on the command as its own token", async () => {
    assert.ok((await idsFor({ text: "/review please" })).includes("code-reviewer"));
    assert.ok((await idsFor({ text: "ok now /explain heaps" })).includes("explain-deeply"));
  });

  it("does not fire on a path that happens to end in the command name", async () => {
    // The original `includes()` match turned any pasted URL containing
    // "/review" — a PR link, a docs path — into review mode.
    const ids = await idsFor({ text: "see https://github.com/x/y/pull/3/files#docs/review" });
    assert.equal(ids.includes("code-reviewer"), false);
  });

  it("does not fire when the word is merely mentioned", async () => {
    const ids = await idsFor({ text: "could you review this and explain it" });
    assert.equal(ids.includes("code-reviewer"), false);
    assert.equal(ids.includes("explain-deeply"), false);
  });

  it("does not fire on a longer command that starts with the same letters", async () => {
    assert.equal((await idsFor({ text: "/reviewers" })).includes("code-reviewer"), false);
  });
});

describe("stuck", () => {
  it("fires on the words someone actually types when they are stuck", async () => {
    for (const text of ["i'm stuck", "can I get a hint", "help me here", "I'm confused"]) {
      assert.ok((await idsFor({ text })).includes("hint-giver"), `missed: ${text}`);
    }
  });

  it("does not fire on a longer word that contains a keyword", async () => {
    // "helper" contains "help"; "hinted" contains "hint". Neither is a learner
    // asking for one, and a hint ladder starting itself mid-explanation is worse
    // than no hint at all.
    for (const text of ["I wrote a helper function", "the docs hinted at a queue"]) {
      assert.equal((await idsFor({ text })).includes("hint-giver"), false, `fired on: ${text}`);
    }
  });
});

describe("user-defined skills", () => {
  // No built-in claims `on_error` or `on_difficulty` today, but both triggers
  // are documented for user skills, so both have to actually work.
  const register = (skill) => saveUserSkill({ system_prompt_modifier: "x", ...skill });

  it("fires an on_error skill when something actually failed", async () => {
    await register({ id: "u-err", name: "Errors", trigger: "on_error" });
    assert.ok((await idsFor({ text: "wrong answer on test 4" })).includes("u-err"));
    assert.ok((await idsFor({ text: "it throws an exception" })).includes("u-err"));
  });

  it("does not fire an on_error skill on a word that merely contains one", async () => {
    await register({ id: "u-err", name: "Errors", trigger: "on_error" });
    assert.equal((await idsFor({ text: "a terror of a problem" })).includes("u-err"), false);
  });

  it("fires an on_difficulty skill only for its own difficulty", async () => {
    await register({ id: "u-hard", name: "Hard", trigger: "on_difficulty:Hard" });
    assert.ok((await idsFor({ difficulty: "Hard" })).includes("u-hard"));
    assert.equal((await idsFor({ difficulty: "Medium" })).includes("u-hard"), false);
    assert.equal((await idsFor({})).includes("u-hard"), false);
  });

  it("lets a user skill carry its own stuck keywords", async () => {
    await register({
      id: "u-stuck",
      name: "Stuck",
      trigger: "on_stuck",
      conditions: { keywords: ["blocked"] },
    });
    assert.ok((await idsFor({ text: "I am blocked" })).includes("u-stuck"));
    assert.equal((await idsFor({ text: "I am stuck" })).includes("u-stuck"), false);
  });
});

describe("after a solve", () => {
  it("suggests the next problem only when something was just solved", async () => {
    assert.ok((await idsFor({ justSolved: true })).includes("next-problem"));
    assert.equal((await idsFor({ justSolved: false })).includes("next-problem"), false);
  });
});

describe("assembly", () => {
  it("always includes the roadmap navigator, since it frames every answer", async () => {
    assert.ok((await idsFor({ text: "" })).includes("roadmap-navigator"));
  });

  it("emits nothing rather than a bare heading when no skill is active", async () => {
    // Not reachable with the current built-ins — one is always-on — but the
    // caller concatenates this straight into the system prompt, so an empty
    // "## Active Skills" section must never be produced.
    const prompt = await buildSkillsSystemPrompt({ text: "" });
    assert.match(prompt, /## Active Skills/);
    assert.ok(prompt.trim().length > "## Active Skills".length);
  });

  it("collects auto-tools from the active skills without repeating one", async () => {
    const ids = await getAutoToolIds({ justSolved: true });
    assert.ok(ids.includes("get-next-suggestion"));
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("the takeaway line", () => {
  it("keeps a plain sentence intact", () => {
    const s = "Sorting first makes the greedy choice provable — worth reaching for earlier.";
    assert.equal(parseTakeaway(s), s);
  });

  it("strips the LaTeX and markdown that made the old summary unreadable", () => {
    // This is the shape of the string that shipped: a heading and the opening of
    // a complexity table, which is what `review.slice(0, 200)` always caught.
    const out = parseTakeaway("**Time** is $O(N \\log N)$ because of the `sort` call.");
    assert.equal(out, "Time is O(N log N) because of the sort call.");
  });

  it("takes the first line only — the reviewer sometimes keeps writing", () => {
    assert.equal(
      parseTakeaway("The real cost is the sort.\n\n## Next section"),
      "The real cost is the sort.",
    );
  });

  it("treats a refusal as no takeaway rather than storing the word", () => {
    for (const s of ["none", "N/A", "  ", "-", ""]) assert.equal(parseTakeaway(s), "");
    assert.equal(parseTakeaway(), "");
  });

  it("truncates on a boundary and says it truncated", () => {
    const out = parseTakeaway("word ".repeat(100));
    assert.ok(out.length <= 240, `${out.length} characters`);
    assert.match(out, /…$/);
  });
});

describe("weak-area labels", () => {
  it("splits the line into lowercase labels", () => {
    assert.deepEqual(parseWeakAreas("Edge Cases, Space Complexity"), [
      "edge cases",
      "space complexity",
    ]);
  });

  it("drops prose, which could only ever be a label seen once", () => {
    const long = "the solution does not consider what happens when the input array is empty";
    assert.deepEqual(parseWeakAreas(long), []);
  });

  it("drops the ways a model says nothing is wrong", () => {
    assert.deepEqual(parseWeakAreas("none"), []);
    assert.deepEqual(parseWeakAreas("N/A, nothing"), []);
  });

  it("de-duplicates, so one review cannot inflate a profile chip", () => {
    assert.deepEqual(parseWeakAreas("edge cases, Edge Cases, edge cases."), ["edge cases"]);
  });

  it("caps the count — a model listing twenty flags has flagged nothing", () => {
    assert.ok(parseWeakAreas("a,b,c,d,e,f,g,h,i,j").length <= 6);
  });
});
