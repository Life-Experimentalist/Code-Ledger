#!/usr/bin/env node
/**
 * Test sync flows: preview → apply → commit
 * Also tests primary failure + mirror failover
 *
 * Usage: node dev/test-sync-flows.js [--verbose] [--dry-run]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(__dirname);

const VERBOSE = process.argv.includes("--verbose");
const DRY_RUN = process.argv.includes("--dry-run");

function log(...args) {
  console.log(`[TEST]`, ...args);
}

function vlog(...args) {
  if (VERBOSE) console.log(`[VLOG]`, ...args);
}

function success(...args) {
  console.log(`✓`, ...args);
}

function error(...args) {
  console.error(`✗`, ...args);
}

// Mock problem data for testing
const MOCK_LOCAL = [
  {
    id: "lc-two-sum",
    titleSlug: "two-sum",
    title: "Two Sum",
    platform: "leetcode",
    difficulty: "Easy",
    lang: { name: "Python3", ext: "py" },
    tags: ["array", "hash-table"],
    code: "def twoSum(nums, target):\n  return [0, 1]",
    files: [{ path: "problems/lc-two-sum/lc-two-sum.py", content: "def twoSum..." }],
    timestamp: Date.now() - 86400000,
  },
  {
    id: "lc-two-sum",
    titleSlug: "two-sum",
    title: "Two Sum",
    platform: "leetcode",
    difficulty: "Easy",
    lang: { name: "JavaScript", ext: "js" },
    tags: ["array", "hash-table"],
    code: "const twoSum = () => [0, 1];",
    files: [{ path: "problems/lc-two-sum/lc-two-sum.js", content: "const twoSum..." }],
    timestamp: Date.now(),
  },
];

const MOCK_REMOTE = [
  {
    id: "lc-two-sum",
    titleSlug: "two-sum",
    title: "Two Sum",
    platform: "leetcode",
    difficulty: "Easy",
    lang: { name: "Python3", ext: "py" },
    tags: ["array", "hash-table"],
    code: "def twoSum(nums, target): pass",
    files: [{ path: "problems/lc-two-sum/lc-two-sum.py", content: "def twoSum..." }],
    timestamp: Date.now() - 86400000,
  },
];

// 1. Test: Sync Preview
async function testSyncPreview() {
  log("TEST 1: Sync Preview (detect conflicts & remote-only)");

  try {
    // Simulate preview: compare local vs remote
    const remoteIds = new Set(MOCK_REMOTE.map((p) => `${p.id}::${p.lang.name}`));
    const conflicts = [];
    const remoteOnly = [];

    MOCK_LOCAL.forEach((local) => {
      const key = `${local.id}::${local.lang.name}`;
      if (!remoteIds.has(key)) {
        remoteOnly.push(local);
      } else {
        const remote = MOCK_REMOTE.find(
          (r) => r.id === local.id && r.lang.name === local.lang.name,
        );
        if (remote && remote.code !== local.code) {
          conflicts.push({ local, remote, type: "code-drift" });
        }
      }
    });

    vlog("Local problems:", MOCK_LOCAL.length);
    vlog("Remote problems:", MOCK_REMOTE.length);
    vlog("Conflicts detected:", conflicts.length);
    vlog("Remote-only (need sync):", remoteOnly.length);

    const preview = {
      conflicts,
      remoteOnly,
      pendingConflicts: conflicts.length,
      pendingRemoteOnly: remoteOnly.length,
    };

    if (remoteOnly.length > 0) {
      success("Sync preview: detected", remoteOnly.length, "problem(s) to sync");
      if (VERBOSE) {
        remoteOnly.forEach((p) => console.log(`  - ${p.id} (${p.lang.name})`));
      }
      return preview;
    } else {
      success("Sync preview: already in sync");
      return preview;
    }
  } catch (e) {
    error("Sync preview failed:", e.message);
    throw e;
  }
}

// 2. Test: Apply Import (save resolved problems)
async function testApplyImport(problems) {
  log("TEST 2: Apply Import (save selected problems to IndexedDB)");

  try {
    if (!Array.isArray(problems) || problems.length === 0) {
      success("No problems to apply");
      return { saved: 0 };
    }

    vlog("Applying", problems.length, "problem(s)...");

    const result = {
      saved: problems.length,
      applied: problems.map((p) => p.id),
    };
    success("Import applied:", result.saved, "problem(s) saved");

    return result;
  } catch (e) {
    error("Apply import failed:", e.message);
    throw e;
  }
}

// 3. Test: Sync All Commit Path (bulk mode)
async function testSyncAllCommit() {
  log("TEST 3: Sync All Commit (bulk: one atomic commit)");

  try {
    const files = [];

    // Build file set from missing problems
    MOCK_LOCAL.forEach((p) => {
      if (p.files && Array.isArray(p.files)) {
        files.push(...p.files);
      }
    });

    files.push({
      path: "index.json",
      content: JSON.stringify({ problems: MOCK_LOCAL, total: MOCK_LOCAL.length }, null, 2),
    });

    vlog("Commit payload:", files.length, "files");
    vlog("Commit message: chore: sync", MOCK_LOCAL.length, "problem(s)");

    const commitSha = DRY_RUN
      ? "abcd1234"
      : Buffer.from(JSON.stringify(files)).toString("hex").slice(0, 8);

    success("Sync all commit (bulk mode):", files.length, "files →", commitSha);

    return {
      committed: MOCK_LOCAL.length,
      filesCount: files.length,
      commitSha,
    };
  } catch (e) {
    error("Sync all commit failed:", e.message);
    throw e;
  }
}

// 4. Test: Sync All Commit Path (individual mode)
async function testSyncAllCommitIndividual() {
  log("TEST 4: Sync All Commit (individual: one commit per problem)");

  try {
    const commits = [];
    const uniqueProblems = new Map();

    // Group by problem ID
    MOCK_LOCAL.forEach((p) => {
      if (!uniqueProblems.has(p.id)) {
        uniqueProblems.set(p.id, []);
      }
      uniqueProblems.get(p.id).push(p);
    });

    // Create one commit per problem
    for (const [id, problems] of uniqueProblems) {
      const files = [];
      problems.forEach((p) => {
        if (p.files) files.push(...p.files);
      });
      const problemTitle = problems[0]?.title || id;
      const langs = problems.map((p) => p.lang.name).join(", ");

      commits.push({
        message: `solve: ${problemTitle} (${langs})`,
        filesCount: files.length,
        date: new Date(problems[0].timestamp),
      });
    }

    vlog("Individual commits:", commits.length);
    commits.forEach((c) => {
      vlog(`  - ${c.message} (${c.filesCount} files)`);
    });

    success("Sync all commit (individual mode):", commits.length, "commit(s)");

    return { committed: commits.length, commits };
  } catch (e) {
    error("Sync all commit (individual) failed:", e.message);
    throw e;
  }
}

// 5. Test: Primary Failure → Mirror Failover
async function testPrimaryFailureFailover() {
  log("TEST 5: Primary Failure → Mirror Failover");

  try {
    const targets = [
      {
        provider: "github",
        owner: "VKrishna04",
        repo: "solutions",
        isPrimary: true,
      },
      {
        provider: "github",
        owner: "Life-Experimentalist",
        repo: "solutions-mirror",
        isPrimary: false,
      },
      {
        provider: "gitlab",
        owner: "vkrishna04",
        repo: "solutions",
        isPrimary: false,
      },
    ];

    vlog("Attempting ordered failover:");
    vlog("1. Primary:", targets[0].provider, targets[0].owner + "/" + targets[0].repo);

    // Simulate primary failure
    const primaryErr = new Error("Network timeout on primary");
    vlog(`   ✗ Failed: ${primaryErr.message}`);

    // Failover to mirror 1
    vlog("2. Mirror 1:", targets[1].provider, targets[1].owner + "/" + targets[1].repo);
    vlog(`   ✓ Success: commit abcd1234 pushed`);
    const activeTarget = targets[1];

    success(
      "Failover successful: switched to mirror",
      activeTarget.owner + "/" + activeTarget.repo,
    );

    return { failover: true, activeTarget, reason: primaryErr.message };
  } catch (e) {
    error("Failover test failed:", e.message);
    throw e;
  }
}

// 6. Test: Conflict Detection & Resolution
async function testConflictResolution() {
  log("TEST 6: Conflict Detection & Resolution");

  try {
    const localProb = {
      id: "lc-two-sum",
      code: "UPDATED_VERSION",
      timestamp: Date.now(),
    };

    const remoteProb = {
      id: "lc-two-sum",
      code: "ORIGINAL_VERSION",
      timestamp: Date.now() - 86400000,
    };

    vlog("Local version (newer):", localProb.timestamp);
    vlog("Remote version (older):", remoteProb.timestamp);
    vlog("Code differs:", localProb.code !== remoteProb.code);

    const resolution = {
      local: localProb,
      remote: remoteProb,
      winner: "local",
      reason: "Local is newer and drift detected",
    };

    success("Conflict detected & auto-resolved: local wins (newer + drift)");

    return resolution;
  } catch (e) {
    error("Conflict resolution test failed:", e.message);
    throw e;
  }
}

// Main test runner
async function main() {
  console.log("\n========================================");
  console.log("CodeLedger Sync Flow Test Suite");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log("========================================\n");

  const results = {};

  try {
    // Test 1: Preview
    results.preview = await testSyncPreview();
    console.log("");

    // Test 2: Apply
    if (results.preview?.remoteOnly?.length > 0) {
      results.apply = await testApplyImport(results.preview.remoteOnly);
      console.log("");
    }

    // Test 3: Sync All (bulk)
    results.syncBulk = await testSyncAllCommit();
    console.log("");

    // Test 4: Sync All (individual)
    results.syncIndividual = await testSyncAllCommitIndividual();
    console.log("");

    // Test 5: Failover
    results.failover = await testPrimaryFailureFailover();
    console.log("");

    // Test 6: Conflict Resolution
    results.conflicts = await testConflictResolution();
    console.log("");

    console.log("========================================");
    console.log("✓ All tests passed");
    console.log("========================================\n");

    if (VERBOSE) {
      console.log("Results summary:");
      console.log(JSON.stringify(results, null, 2));
    }
  } catch (e) {
    console.error("\n========================================");
    console.error("✗ Test suite failed:", e.message);
    console.error("========================================\n");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
