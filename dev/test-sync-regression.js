#!/usr/bin/env node
/**
 * Regression checks for sync preview keying.
 *
 * Purpose:
 * - Ensure preview matching uses problem-id + language key.
 * - Prevent false conflicts when one language exists remotely and another is local-only.
 *
 * Usage:
 *   node dev/test-sync-regression.js
 */

function normalizeLang(problem = {}) {
  const lang =
    problem?.lang?.name || problem?.lang?.slug || problem?.lang?.ext || "";
  return String(lang).toLowerCase().trim();
}

function syncCommitKey(problem = {}) {
  const id = String(problem.id || "").trim();
  const lang = normalizeLang(problem);
  if (!id || !lang) return "";
  return `${id}::${lang}`;
}

function previewDiff(localProblems = [], remoteProblems = []) {
  const remoteByKey = new Map(
    remoteProblems
      .map((p) => [syncCommitKey(p), p])
      .filter(([key]) => Boolean(key)),
  );

  const conflicts = [];
  const remoteOnly = [];

  for (const local of localProblems) {
    const key = syncCommitKey(local);
    const remote = remoteByKey.get(key);
    if (!remote) {
      remoteOnly.push(local);
      continue;
    }

    if (String(local.code || "") !== String(remote.code || "")) {
      conflicts.push({ local, remote, type: "code-drift" });
    }
  }

  return {
    conflicts,
    remoteOnly,
    pendingConflicts: conflicts.length,
    pendingRemoteOnly: remoteOnly.length,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const local = [
    {
      id: "lc-two-sum",
      lang: { name: "Python3", ext: "py" },
      code: "def twoSum(nums, target):\n  return [0, 1]",
    },
    {
      id: "lc-two-sum",
      lang: { name: "JavaScript", ext: "js" },
      code: "const twoSum = () => [0, 1];",
    },
  ];

  const remote = [
    {
      id: "lc-two-sum",
      lang: { name: "python3", ext: "py" },
      code: "def twoSum(nums, target):\n  return [0, 1]",
    },
  ];

  const result = previewDiff(local, remote);

  assert(
    result.pendingConflicts === 0,
    `expected 0 conflicts, got ${result.pendingConflicts}`,
  );
  assert(
    result.pendingRemoteOnly === 1,
    `expected 1 remoteOnly, got ${result.pendingRemoteOnly}`,
  );
  assert(
    normalizeLang(result.remoteOnly[0]) === "javascript",
    "expected JavaScript variant (not in remote) to appear in sync queue",
  );

  console.log("[PASS] Multi-language sync-key regression check passed");
  console.log(JSON.stringify(result, null, 2));
}

try {
  run();
} catch (err) {
  console.error("[FAIL]", err.message || err);
  process.exit(1);
}
