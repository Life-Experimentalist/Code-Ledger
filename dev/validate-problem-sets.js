#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Check every NeetCode 150 slug against LeetCode.
 *
 * The unit tests can prove the list is 150 long, free of duplicates and mapped
 * onto a vocabulary that exists. They cannot prove a slug is real — only
 * LeetCode can, and a wrong slug is a 404 in a study plan rather than a silent
 * miss. This is therefore a network tool and deliberately not part of
 * `npm test`: a suite that fails when the wifi drops teaches people to ignore
 * it.
 *
 *   node dev/validate-problem-sets.js
 *
 * Exits non-zero and lists the offenders if any slug does not resolve.
 */

import { NEETCODE_150 } from "../src/data/problem-sets.js";

const ENDPOINT = "https://leetcode.com/graphql";
const QUERY = `query q($titleSlug: String!) {
  question(titleSlug: $titleSlug) { titleSlug title difficulty }
}`;

/** LeetCode rate-limits aggressively; a small pool and a pause keep it happy. */
const CONCURRENCY = 4;
const PAUSE_MS = 250;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function lookup(slug) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      referer: `https://leetcode.com/problems/${slug}/`,
    },
    body: JSON.stringify({ query: QUERY, variables: { titleSlug: slug } }),
  });
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
  const body = await res.json();
  const q = body?.data?.question;
  if (!q) return { ok: false, reason: "no such problem" };
  return { ok: true, difficulty: q.difficulty, title: q.title };
}

async function main() {
  const bad = [];
  const mismatched = [];
  const queue = [...NEETCODE_150];

  async function worker() {
    while (queue.length) {
      const p = queue.shift();
      try {
        const r = await lookup(p.slug);
        if (!r.ok) bad.push({ ...p, reason: r.reason });
        else if (r.difficulty !== p.difficulty) {
          mismatched.push({ ...p, actual: r.difficulty });
        }
      } catch (e) {
        bad.push({ ...p, reason: e.message });
      }
      await sleep(PAUSE_MS);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (mismatched.length) {
    console.warn(`\n${mismatched.length} difficulty mismatch(es):`);
    for (const m of mismatched)
      console.warn(`  ${m.slug}: listed ${m.difficulty}, LeetCode says ${m.actual}`);
  }

  if (bad.length) {
    console.error(`\n${bad.length} slug(s) do not resolve:`);
    for (const b of bad) console.error(`  ${b.slug} (${b.group}) — ${b.reason}`);
    process.exit(1);
  }

  console.log(`\nAll ${NEETCODE_150.length} slugs resolve.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
