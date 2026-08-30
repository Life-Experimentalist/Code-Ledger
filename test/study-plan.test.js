/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for src/core/study-plan.js.
 *
 * `now` is always passed. Everything here is dated arithmetic, so a suite that
 * lets it default to Date.now() would produce a different plan every day.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  ROLE_PRESETS,
  REVISION_INTERVALS,
  rolePreset,
  planCapacity,
  topicQueue,
  revisionSchedule,
  buildStudyPlan,
} from "../src/core/study-plan.js";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 10, 12, 0, 0);
const OPTS = { now: NOW };

function solve({ tags, difficulty = "Medium", daysAgo = 1, titleSlug, title }) {
  return {
    tags,
    platform: "leetcode",
    difficulty,
    titleSlug: titleSlug || `p-${tags[0]}-${daysAgo}`.toLowerCase().replace(/\s+/g, "-"),
    title: title || `Problem ${daysAgo}`,
    timestamp: NOW - daysAgo * DAY,
  };
}

function reps(tag, n, { daysAgo = 1, difficulty = "Medium" } = {}) {
  return Array.from({ length: n }, (_, i) =>
    solve({ tags: [tag], difficulty, daysAgo: daysAgo + i }),
  );
}

/** Enough of a ledger that foundations are held and the plan reaches further. */
function foundationLedger() {
  return [
    "Array",
    "String",
    "Hash Table",
    "Stack",
    "Queue",
    "Linked List",
    "Sorting",
    "Two Pointers",
    "Binary Search",
    "Sliding Window",
    "Prefix Sum",
    "Recursion",
  ].flatMap((t) => reps(t, 10));
}

/* ------------------------------------------------------------------ */
/* Capacity                                                            */
/* ------------------------------------------------------------------ */

test("capacity comes from the target date and the hours", () => {
  const c = planCapacity({ now: NOW, targetDate: NOW + 30 * DAY, hoursPerDay: 2 });
  assert.equal(c.days, 30);
  assert.equal(c.minutesPerDay, 120);
  assert.equal(c.totalMinutes, 3600);
});

test("a target date in the past yields one day, not a division by zero", () => {
  const c = planCapacity({ now: NOW, targetDate: NOW - 10 * DAY, hoursPerDay: 2 });
  assert.equal(c.days, 1);
  assert.ok(Number.isFinite(c.totalMinutes));
});

test("nonsense hours are clamped rather than producing an empty day", () => {
  assert.ok(planCapacity({ now: NOW, hoursPerDay: 0 }).minutesPerDay > 0);
  assert.ok(planCapacity({ now: NOW, hoursPerDay: -5 }).minutesPerDay > 0);
});

/* ------------------------------------------------------------------ */
/* Ordering — the reason this module exists                            */
/* ------------------------------------------------------------------ */

test("the queue is dependency-ordered, not frequency-ordered", () => {
  // Frequency would put Dynamic Programming near the top. Dependency puts it
  // after the things it is built from.
  const q = topicQueue(reps("Array", 60), OPTS);
  const at = (t) => q.findIndex((x) => x.topic === t);
  assert.ok(at("Binary Search") < at("Sliding Window"));
  assert.ok(at("Sliding Window") < at("Heap (Priority Queue)"));
  assert.ok(at("Heap (Priority Queue)") < at("Graph"));
  assert.ok(at("Graph") < at("Dynamic Programming"));
});

test("held topics are not in the plan", () => {
  const q = topicQueue(foundationLedger(), OPTS);
  assert.ok(!q.some((t) => t.topic === "Array"));
});

test("every queued topic carries concrete problems to open", () => {
  // A plan that says "solve 5 Binary Search problems" and cannot name one is
  // the roadmap feature that already exists.
  const q = topicQueue(reps("Array", 60), OPTS);
  const bs = q.find((t) => t.topic === "Binary Search");
  assert.ok(bs.problems.length > 0);
  assert.ok(bs.problems.every((p) => p.slug && p.title));
});

test("a problem already solved is never suggested again", () => {
  const ledger = [
    ...reps("Array", 60),
    { ...solve({ tags: ["Binary Search"] }), titleSlug: "koko-eating-bananas" },
  ];
  const bs = topicQueue(ledger, OPTS).find((t) => t.topic === "Binary Search");
  assert.ok(!bs.problems.some((p) => p.slug === "koko-eating-bananas"));
});

/* ------------------------------------------------------------------ */
/* Role presets                                                        */
/* ------------------------------------------------------------------ */

test("the service preset stops at core topics", () => {
  const q = topicQueue(reps("Array", 60), { ...OPTS, role: "service" });
  assert.ok(!q.some((t) => t.tier > 2));
  assert.ok(!q.some((t) => t.topic === "Dynamic Programming"));
});

test("the tier-A preset reaches differentiators", () => {
  const q = topicQueue(reps("Array", 60), { ...OPTS, role: "tier-a" });
  assert.ok(q.some((t) => t.topic === "Dynamic Programming"));
});

test("the presets differ in what counts as done, not in the order", () => {
  const order = (role) => topicQueue(reps("Array", 60), { ...OPTS, role }).map((t) => t.topic);
  const service = order("service");
  const tierA = order("tier-a");
  // The shorter list is a prefix-by-filtering of the longer one: same sequence,
  // fewer topics. Ordering is a property of the subject, not of the employer.
  assert.deepEqual(
    service,
    tierA.filter((t) => service.includes(t)),
  );
});

test("an unknown role falls back rather than throwing", () => {
  assert.equal(rolePreset("nonsense").id, ROLE_PRESETS["tier-a"].id);
  assert.equal(rolePreset(undefined).id, ROLE_PRESETS["tier-a"].id);
});

/* ------------------------------------------------------------------ */
/* Spaced revision — the half most tools omit                          */
/* ------------------------------------------------------------------ */

test("a problem solved months ago is overdue", () => {
  const r = revisionSchedule(
    [solve({ tags: ["Trie"], daysAgo: 90, titleSlug: "implement-trie" })],
    OPTS,
  );
  assert.equal(r.length, 1);
  assert.ok(r[0].overdueDays > 0);
  assert.equal(r[0].interval, 60);
});

test("a problem solved yesterday is scheduled, not overdue", () => {
  const r = revisionSchedule([solve({ tags: ["Trie"], daysAgo: 1 })], { ...OPTS, horizonDays: 30 });
  assert.equal(r.length, 1);
  assert.equal(r[0].overdueDays, 0);
  assert.equal(r[0].interval, REVISION_INTERVALS[0]);
});

test("a fresh problem outside the horizon is left alone", () => {
  const r = revisionSchedule([solve({ tags: ["Trie"], daysAgo: 1 })], { ...OPTS, horizonDays: 3 });
  assert.deepEqual(r, []);
});

test("re-solving resets the clock", () => {
  // Two records for one problem. The recent one is the state of the world; a
  // schedule built from the older one would nag about something just revisited.
  const problems = [
    solve({ tags: ["Trie"], daysAgo: 200, titleSlug: "implement-trie" }),
    solve({ tags: ["Trie"], daysAgo: 2, titleSlug: "implement-trie" }),
  ];
  const r = revisionSchedule(problems, { ...OPTS, horizonDays: 30 });
  assert.equal(r.length, 1);
  assert.equal(r[0].overdueDays, 0);
});

test("the most overdue comes first", () => {
  const r = revisionSchedule(
    [
      solve({ tags: ["Trie"], daysAgo: 30, titleSlug: "a" }),
      solve({ tags: ["Graph"], daysAgo: 300, titleSlug: "b" }),
      solve({ tags: ["Stack"], daysAgo: 100, titleSlug: "c" }),
    ],
    OPTS,
  );
  assert.deepEqual(
    r.map((x) => x.slug),
    ["b", "c", "a"],
  );
});

test("a record with no slug and no title is skipped rather than crashing", () => {
  const r = revisionSchedule([{ timestamp: NOW - 100 * DAY }, null], OPTS);
  assert.deepEqual(r, []);
});

/* ------------------------------------------------------------------ */
/* The plan                                                            */
/* ------------------------------------------------------------------ */

test("the next seven days are concrete and the rest are themes", () => {
  const plan = buildStudyPlan(reps("Array", 60), {
    ...OPTS,
    targetDate: NOW + 60 * DAY,
    hoursPerDay: 2,
  });
  assert.ok(plan.days.length <= 7);
  assert.ok(plan.days[0].items.length > 0);
  assert.ok(plan.weeks.length > 0);
  for (const w of plan.weeks) {
    assert.ok(w.themes.length > 0);
    assert.ok(w.from <= w.to);
  }
});

test("a day does not overrun its budget except to place a first item", () => {
  const plan = buildStudyPlan(reps("Array", 60), {
    ...OPTS,
    targetDate: NOW + 30 * DAY,
    hoursPerDay: 1,
  });
  for (const d of plan.days) {
    if (d.items.length > 1) assert.ok(d.minutes <= plan.capacity.minutesPerDay, d.date);
  }
});

test("revision never eats more than its share of a day", () => {
  const ledger = [
    ...reps("Array", 60, { daysAgo: 200 }),
    ...Array.from({ length: 40 }, (_, i) =>
      solve({ tags: ["Graph"], daysAgo: 300 + i, titleSlug: `old-${i}` }),
    ),
  ];
  const plan = buildStudyPlan(ledger, { ...OPTS, targetDate: NOW + 30 * DAY, hoursPerDay: 3 });
  for (const d of plan.days) {
    const revisionMinutes = d.items
      .filter((i) => i.kind === "revision")
      .reduce((s, i) => s + i.minutes, 0);
    assert.ok(revisionMinutes <= plan.capacity.minutesPerDay * 0.4 + 0.001, d.date);
  }
});

test("overdue revision is scheduled before new work on the same day", () => {
  const ledger = [
    ...reps("Array", 60),
    solve({ tags: ["Graph"], daysAgo: 300, titleSlug: "long-forgotten" }),
  ];
  const plan = buildStudyPlan(ledger, { ...OPTS, targetDate: NOW + 30 * DAY, hoursPerDay: 3 });
  assert.equal(plan.days[0].items[0].kind, "revision");
});

test("a window too small to hold the plan says so, with the numbers", () => {
  // The failure mode being avoided: quietly truncating and presenting the
  // result as a complete plan.
  const plan = buildStudyPlan(reps("Array", 60), {
    ...OPTS,
    targetDate: NOW + 3 * DAY,
    hoursPerDay: 1,
  });
  assert.ok(plan.shortfall);
  assert.ok(plan.shortfall.newUnplaced > 0);
  assert.ok(plan.shortfall.minutesNeeded > plan.shortfall.minutesAvailable);
  assert.ok(plan.shortfall.droppedTopics.length > 0);
});

test("a plan that fits reports no shortfall", () => {
  const plan = buildStudyPlan(foundationLedger(), {
    ...OPTS,
    targetDate: NOW + 365 * DAY,
    hoursPerDay: 6,
    role: "service",
  });
  assert.equal(plan.shortfall, null);
});

test("an empty ledger produces a plan that starts at the beginning", () => {
  const plan = buildStudyPlan([], { ...OPTS, targetDate: NOW + 60 * DAY, hoursPerDay: 2 });
  assert.equal(plan.queue[0].topic, "Array");
  assert.ok(plan.days[0].items.length > 0);
  assert.deepEqual(plan.revisions, []);
});

test("the role is reported back so the plan can say what it assumed", () => {
  const plan = buildStudyPlan([], { ...OPTS, role: "service" });
  assert.equal(plan.role.id, "service");
  assert.ok(plan.role.label);
});
