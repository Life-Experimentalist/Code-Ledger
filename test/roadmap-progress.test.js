/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Roadmap progress — the shared definition of "how far along am I".
 *
 * The Roadmap tab and the AI both score milestones through this module. They
 * used to read different stores and could disagree completely; the failure that
 * matters now is quieter — a tag that stops matching, so a learner watches a
 * progress bar sit at zero while they solve exactly what it asked for.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  countMilestoneSolves,
  pickActiveRoadmap,
  summarizeRoadmap,
  formatRoadmapForPrompt,
} from "../src/core/roadmap-progress.js";
import {
  ROADMAP_TEMPLATES,
  buildWeakAreaRoadmap,
  instantiateTemplate,
} from "../src/core/roadmap-templates.js";

const milestone = (over = {}) => ({
  topic: "Graphs",
  subtopics: ["breadth-first-search"],
  targetCount: 2,
  ...over,
});
const solved = (tags, over = {}) => ({ titleSlug: "p", tags, ...over });

describe("countMilestoneSolves", () => {
  test("matches a subtopic tag", () => {
    assert.equal(countMilestoneSolves(milestone(), [solved(["breadth-first-search"])]), 1);
  });

  test("matches the milestone topic itself, not only its subtopics", () => {
    assert.equal(countMilestoneSolves(milestone(), [solved(["graphs"])]), 1);
  });

  test("ignores case, because milestones are written for humans and tags are not", () => {
    // Milestone topics read like "Arrays & Hashing"; tags arrive lowercase and
    // hyphenated. Case-sensitive matching would score every milestone zero.
    const m = milestone({ topic: "Arrays & Hashing", subtopics: ["Hash-Table"] });
    assert.equal(countMilestoneSolves(m, [solved(["hash-table"])]), 1);
  });

  test("matches the folder topic when a problem carries no tags", () => {
    assert.equal(countMilestoneSolves(milestone(), [{ titleSlug: "p", topic: "Graphs" }]), 1);
  });

  test("does not count an unrelated problem", () => {
    assert.equal(countMilestoneSolves(milestone(), [solved(["dynamic-programming"])]), 0);
  });

  test("survives the empty cases instead of throwing into the render", () => {
    assert.equal(countMilestoneSolves(null, [solved(["graph"])]), 0);
    assert.equal(countMilestoneSolves(milestone(), []), 0);
    assert.equal(countMilestoneSolves(milestone(), null), 0);
    assert.equal(countMilestoneSolves({ topic: "", subtopics: [] }, [solved(["graph"])]), 0);
  });
});

describe("pickActiveRoadmap", () => {
  test("picks the newest, matching what the tab shows by default", () => {
    const list = [
      { id: "old", createdAt: 100 },
      { id: "new", createdAt: 300 },
      { id: "mid", createdAt: 200 },
    ];
    assert.equal(pickActiveRoadmap(list).id, "new");
  });

  test("returns null rather than undefined when there is nothing", () => {
    assert.equal(pickActiveRoadmap([]), null);
    assert.equal(pickActiveRoadmap(null), null);
  });

  test("still returns something when createdAt is missing", () => {
    assert.ok(pickActiveRoadmap([{ id: "a" }, { id: "b" }]));
  });
});

describe("summarizeRoadmap", () => {
  const roadmap = {
    title: "Interview core",
    goal: "Pass the loop",
    milestones: [
      { topic: "Arrays", subtopics: ["array"], targetCount: 1 },
      { topic: "Graphs", subtopics: ["graph"], targetCount: 2 },
      { topic: "DP", subtopics: ["dynamic-programming"], targetCount: 1 },
    ],
  };
  const problems = [solved(["array"]), solved(["graph"])];

  test("counts a milestone done only once it reaches its target", () => {
    const s = summarizeRoadmap(roadmap, problems);
    assert.equal(s.done, 1, "Arrays is met; Graphs is 1 of 2");
    assert.equal(s.total, 3);
  });

  test("points at the first unfinished milestone, not the first empty one", () => {
    const s = summarizeRoadmap(roadmap, problems);
    assert.equal(s.next.topic, "Graphs");
    assert.equal(s.next.solved, 1);
  });

  test("reports no next milestone when the plan is finished", () => {
    const s = summarizeRoadmap({ milestones: [{ topic: "Arrays", targetCount: 1 }] }, [
      solved(["arrays"]),
    ]);
    assert.equal(s.next, null);
    assert.equal(s.done, 1);
  });

  test("returns null for no roadmap at all", () => {
    assert.equal(summarizeRoadmap(null, problems), null);
  });
});

describe("formatRoadmapForPrompt", () => {
  const roadmap = {
    title: "Interview core",
    goal: "Pass the loop",
    milestones: [
      { topic: "Arrays", subtopics: ["array"], targetCount: 1 },
      { topic: "Graphs", subtopics: ["graph", "union-find"], targetCount: 2, description: "BFS." },
    ],
  };

  test("says where they are and what they are on", () => {
    const text = formatRoadmapForPrompt(roadmap, [solved(["array"])]);
    assert.match(text, /Interview core/);
    assert.match(text, /Pass the loop/);
    assert.match(text, /1 of 2 milestones/);
    assert.match(text, /Currently on: Graphs/);
  });

  test("spells out the current milestone's subtopics — a suggestion is built from them", () => {
    const text = formatRoadmapForPrompt(roadmap, [solved(["array"])]);
    assert.match(text, /union-find/);
  });

  test("emits nothing for an empty or missing roadmap, rather than an empty heading", () => {
    assert.equal(formatRoadmapForPrompt(null, []), "");
    assert.equal(formatRoadmapForPrompt({ title: "x", milestones: [] }, []), "");
  });

  test("does not claim they are mid-plan once every milestone is met", () => {
    const text = formatRoadmapForPrompt(roadmap, [
      solved(["array"]),
      ...[1, 2].map(() => solved(["graph"])),
    ]);
    assert.doesNotMatch(text, /Currently on:/);
    assert.match(text, /complete/);
  });
});

describe("shipped templates", () => {
  test("every subtopic is a plain lowercase tag — prose would score zero forever", () => {
    for (const t of ROADMAP_TEMPLATES) {
      for (const m of t.milestones) {
        for (const s of m.subtopics) {
          assert.equal(s, s.toLowerCase(), `${t.id}: "${s}" is not lowercase`);
          assert.doesNotMatch(s, /\s/, `${t.id}: "${s}" contains a space`);
        }
      }
    }
  });

  test("every milestone asks for a finite number of problems", () => {
    for (const t of ROADMAP_TEMPLATES) {
      for (const m of t.milestones) {
        assert.ok(m.targetCount > 0, `${t.id}: ${m.topic} has no target`);
      }
    }
  });

  test("template ids are unique, since one becomes the roadmap's source", () => {
    const ids = ROADMAP_TEMPLATES.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("instantiating gives every milestone the id the progress list keys on", () => {
    const roadmap = instantiateTemplate(ROADMAP_TEMPLATES[0]);
    assert.ok(roadmap.id);
    assert.ok(roadmap.milestones.every((m) => !!m.id));
    assert.equal(new Set(roadmap.milestones.map((m) => m.id)).size, roadmap.milestones.length);
  });
});

describe("the roadmap built from the learner's own history", () => {
  test("is not offered on thin evidence", () => {
    assert.equal(buildWeakAreaRoadmap([{ label: "array", problems: 9 }]), null);
    assert.equal(buildWeakAreaRoadmap([]), null);
    assert.equal(buildWeakAreaRoadmap(null), null);
  });

  test("turns each strained topic into one milestone, strongest first", () => {
    const rm = buildWeakAreaRoadmap([
      { label: "dynamic-programming", problems: 20 },
      { label: "graph", problems: 8 },
      { label: "trie", problems: 3 },
    ]);
    assert.equal(rm.milestones.length, 3);
    assert.equal(rm.milestones[0].topic, "dynamic-programming");
  });

  test("keeps every target inside a range someone can actually finish", () => {
    const rm = buildWeakAreaRoadmap([
      { label: "a", problems: 400 },
      { label: "b", problems: 3 },
      { label: "c", problems: 0 },
    ]);
    for (const m of rm.milestones) {
      assert.ok(m.targetCount >= 5 && m.targetCount <= 12, `${m.topic}: ${m.targetCount}`);
    }
  });

  test("scores against the tag it was built from", () => {
    const rm = buildWeakAreaRoadmap([
      { label: "Dynamic-Programming", problems: 10 },
      { label: "graph", problems: 8 },
      { label: "trie", problems: 6 },
    ]);
    assert.equal(countMilestoneSolves(rm.milestones[0], [solved(["dynamic-programming"])]), 1);
  });
});
