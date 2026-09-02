/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Topics the user invents have to behave like the built-in ones — same
 * spelling rules, same node, same list — or the graph grows a second "Arrays"
 * beside "Array" and the split stops meaning anything. The invariants that
 * keeps true are all in this module: the target of a mapping goes through the
 * same normaliser as every stored tag, and the list of user topics is derived
 * from the mappings rather than kept alongside them.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  customTopicsFromMappings,
  getKnownTopics,
  normalizeTag,
  resolvePrimaryTopic,
} from "../src/core/topic-resolver.js";

describe("normalizeTag as the gate on a new topic name", () => {
  test("a name that is really an existing alias resolves to that topic", () => {
    assert.equal(normalizeTag("arrays"), "Array");
    assert.equal(normalizeTag("HASHING"), "Hash Table");
    assert.equal(normalizeTag(" dp "), "Dynamic Programming");
  });

  test("a genuinely new name comes back spelled like the built-ins", () => {
    assert.equal(normalizeTag("game theory basics"), "Game Theory Basics");
    assert.equal(normalizeTag("interview-favourites"), "Interview Favourites");
  });

  test("an umbrella name comes back empty, so it can be refused", () => {
    for (const name of ["dsa", "algorithms", "data structures", "programming"]) {
      assert.equal(normalizeTag(name), "", `${name} should be dropped`);
    }
  });

  test("a user mapping wins over the built-in table", () => {
    assert.equal(normalizeTag("array", { array: "My Arrays" }), "My Arrays");
  });
});

describe("customTopicsFromMappings", () => {
  test("reports the targets that are not built-in topics", () => {
    const out = customTopicsFromMappings({
      "sliding-window-2": "Sliding Window",
      "cf-constructive": "Constructive Puzzles",
      "gfg-fav": "Interview Favourites",
    });
    assert.deepEqual(out, ["Constructive Puzzles", "Interview Favourites"]);
  });

  test("counts a topic once however many tags point at it", () => {
    const out = customTopicsFromMappings({ a: "My Topic", b: "my topic", c: "MY TOPIC" });
    assert.equal(out.length, 1);
  });

  test("a target that only differs from a built-in by case is that built-in", () => {
    assert.deepEqual(customTopicsFromMappings({ x: "hash table" }), []);
  });

  test("empty, blank and non-string targets are not topics", () => {
    assert.deepEqual(customTopicsFromMappings({ a: "", b: "   ", c: null, d: 7 }), []);
    assert.deepEqual(customTopicsFromMappings(), []);
    assert.deepEqual(customTopicsFromMappings(null), []);
  });
});

describe("getKnownTopics", () => {
  test("built-ins come first, in weight order", () => {
    const topics = getKnownTopics();
    assert.equal(topics[0], "Dynamic Programming");
    assert.equal(topics.indexOf("Array") > topics.indexOf("Two Pointers"), true);
  });

  test("the user's own topics are appended, not merged into the ranking", () => {
    const base = getKnownTopics();
    const withMine = getKnownTopics(["Interview Favourites"]);
    assert.equal(withMine.length, base.length + 1);
    assert.equal(withMine[withMine.length - 1], "Interview Favourites");
  });

  test("a user topic that duplicates a built-in is not listed twice", () => {
    const out = getKnownTopics(["hash table", "Hash Table", "  Array  "]);
    assert.equal(out.length, getKnownTopics().length);
  });

  test("blank entries and a missing argument are tolerated", () => {
    assert.deepEqual(getKnownTopics(["", "   ", null]), getKnownTopics());
    assert.deepEqual(getKnownTopics(undefined), getKnownTopics());
  });
});

describe("a user topic in the resolver", () => {
  test("is chosen as the primary topic when nothing better is tagged", () => {
    const mappings = { "gfg-fav": "Interview Favourites" };
    assert.equal(resolvePrimaryTopic(["gfg-fav"], null, mappings), "Interview Favourites");
  });

  test("does not displace a ranked built-in on the same problem", () => {
    // No weight is invented for a topic the table has never seen, so a tagged
    // Dynamic Programming still wins. Worth pinning: the alternative — ranking
    // user topics above everything — would quietly rewrite every folder path.
    const mappings = { "gfg-fav": "Interview Favourites" };
    assert.equal(
      resolvePrimaryTopic(["gfg-fav", "dynamic programming"], null, mappings),
      "Dynamic Programming",
    );
  });
});

/**
 * normalizeTag memoizes the lowercased view of `settings.topicMappings` in a
 * WeakMap keyed on the mappings object, because it is called once per tag per
 * problem with the same object for a whole library. That is only safe while the
 * two writers in PanelPlatforms keep replacing the object rather than mutating
 * it, and while two different objects never share an entry. Both are pinned
 * here, along with the collision rule the linear scan used to give for free.
 */
describe("normalizeTag custom mappings", () => {
  test("matches a key case-insensitively", () => {
    assert.equal(normalizeTag("MY tag", { "my TAG": "Graph" }), "Graph");
  });

  test("the first key wins a case collision", () => {
    assert.equal(normalizeTag("dup", { Dup: "First", DUP: "Second" }), "First");
  });

  test("two mapping objects do not share a cached view", () => {
    const a = { alias: "Array" };
    const b = { alias: "Binary Search" };
    assert.equal(normalizeTag("alias", a), "Array");
    assert.equal(normalizeTag("alias", b), "Binary Search");
    assert.equal(normalizeTag("alias", a), "Array");
  });

  test("a mapping to an empty string does not fall through to the built-ins", () => {
    // `hit !== undefined` is the test, not truthiness: "" is a deliberate
    // "drop this tag", and `||` would have sent it on to title-casing.
    assert.equal(normalizeTag("Array", { array: "" }), "");
  });

  test("an unmapped tag still normalizes normally", () => {
    assert.equal(normalizeTag("dynamic programming", { other: "X" }), "Dynamic Programming");
  });
});
