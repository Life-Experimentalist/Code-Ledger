/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the privacy disclosure list.
 *
 * This is the module that decides what the extension tells people about where
 * their data goes, so the failure that matters is understatement: a destination
 * that is live but not listed, or a headline that says "private" while a
 * solution is on its way to somebody's API. Every test here is a claim the UI
 * makes on our behalf.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  TIERS,
  TIER_META,
  disclosures,
  privacyTier,
  aiCostNotes,
} from "../src/core/privacy-disclosure.js";
import { CONSTANTS } from "../src/core/constants.js";

const byId = (settings) => Object.fromEntries(disclosures(settings).map((d) => [d.id, d]));

const REPO = { github_repo: "CodeLedger-Sync", github_owner: "octocat" };
const PRIVATE_REPO = { ...REPO, github_repo_private: true };

describe("disclosures", () => {
  test("every entry says where it goes, what goes, and carries a known tier", () => {
    for (const d of disclosures({})) {
      assert.ok(d.id, "an entry without an id cannot be rendered stably");
      assert.ok(d.destination, `${d.id} has no destination`);
      assert.ok(d.what, `${d.id} does not say what it sends`);
      assert.ok(d.note, `${d.id} has no explanation`);
      assert.ok(TIERS.includes(d.tier), `${d.id} has tier ${d.tier}`);
      assert.equal(typeof d.on, "boolean");
    }
  });

  test("options that are off are still listed", () => {
    // Half of an honest picture is what you have not enabled. It is also what
    // the settings UI needs in order to explain a choice before it is made.
    const off = disclosures({}).filter((d) => !d.on);
    assert.ok(off.length > 3, "expected the unused destinations to be described too");
    assert.ok(off.some((d) => d.id === "telemetry"));
  });

  test("a fresh install with no repository sends nothing anywhere", () => {
    for (const d of disclosures({})) {
      assert.equal(d.on, false, `${d.id} claims to be active before anything is configured`);
    }
  });

  test("linking a repository turns on GitHub and the sign-in relay, and names the repo", () => {
    const d = byId(REPO);
    assert.equal(d.github.on, true);
    assert.ok(d.github.note.includes("CodeLedger-Sync"));
    assert.equal(d["oauth-relay"].on, true);
  });

  test("a public repository is disclosed as publicly readable", () => {
    assert.equal(byId(REPO)["repo-public"].on, true);
    assert.equal(byId(PRIVATE_REPO)["repo-public"].on, false);
  });

  test("badges are only public when the repository is", () => {
    assert.equal(byId(REPO).badges.on, true);
    assert.equal(byId(PRIVATE_REPO).badges.on, false);
    assert.equal(byId({ ...REPO, gamificationBadges: false }).badges.on, false);
    assert.equal(byId({ ...REPO, gamificationEnabled: false }).badges.on, false);
  });

  test("shields is disclosed only when it is actually the chosen rendering", () => {
    assert.equal(byId(REPO).shields.on, false);
    assert.equal(byId({ ...REPO, gamificationBadgeStyle: "shields" }).shields.on, true);
    // A private repo cannot use shields, so claiming it were reachable would be
    // a disclosure of something that never happens.
    assert.equal(
      byId({ ...PRIVATE_REPO, gamificationBadgeStyle: "shields" }).shields.on,
      false,
    );
  });

  test("an AI provider is listed for every one the extension supports", () => {
    const ids = disclosures({}).map((d) => d.id);
    for (const id of Object.keys(CONSTANTS.AI_PROVIDERS)) {
      assert.ok(ids.includes(`ai:${id}`), `no disclosure for ${id}`);
    }
  });

  test("an enabled provider discloses that the code itself leaves", () => {
    const d = byId({ ...REPO, gemini_enabled: true });
    assert.equal(d["ai:gemini"].on, true);
    assert.equal(d["ai:gemini"].tier, "code");
    assert.match(d["ai:gemini"].note, /terms/i, "the provider's own terms should be named");
    assert.equal(d["ai:openai"].on, false, "a provider that is off must not be listed as active");
  });

  test("the master AI switch silences every provider", () => {
    const d = byId({ ...REPO, gemini_enabled: true, aiEnabled: false });
    assert.equal(d["ai:gemini"].on, false);
  });

  test("a local model is not a third party", () => {
    // Ollama runs on localhost. Filing it under "your code goes to a company"
    // would be a false disclosure, and would push the headline tier for
    // somebody who took the most private option available.
    const d = byId({ ...PRIVATE_REPO, ollama_enabled: true });
    assert.equal(d["ai:ollama"].on, true);
    assert.equal(d["ai:ollama"].tier, "private");
    assert.equal(privacyTier({ ...PRIVATE_REPO, ollama_enabled: true }).tier, "private");
  });

  test("the diagram renderer is listed whenever its button can appear", () => {
    // It has no setting — it is a Render button on each diagram — so the
    // honest thing a settings object can report is whether it is reachable,
    // which is exactly when AI can produce a diagram to render.
    assert.equal(byId(REPO).mermaid.on, false);
    assert.equal(byId({ ...REPO, gemini_enabled: true }).mermaid.on, true);
    assert.equal(byId({ ...REPO, gemini_enabled: true, aiEnabled: false }).mermaid.on, false);
    assert.match(byId(REPO).mermaid.note, /press/i, "it must say a click is required");
  });

  test("a click-only destination is listed but does not set the headline", () => {
    const s = { ...PRIVATE_REPO, ollama_enabled: true };
    assert.equal(byId(s).mermaid.on, true, "the Render button is reachable, so say so");
    // ...but nothing has been sent, so the headline must not claim a ping.
    assert.equal(privacyTier(s).tier, "private");
  });

  test("party is listed as off until somebody is actually added", () => {
    assert.equal(byId(REPO).party.on, false);
    assert.equal(byId({ ...REPO, partyFriends: [] }).party.on, false);
    assert.equal(
      byId({ ...REPO, partyFriends: [{ owner: "a", repo: "b" }] }).party.on,
      true,
      "reading a friend's repository is a request leaving this browser",
    );
  });

  test("party moves a private setup off the private headline", () => {
    // Nothing of the user's is uploaded, but a host that was silent now hears
    // from them on every visit to the view. Calling that "private" would be
    // the kind of technically-true that the tier labels exist to avoid.
    assert.equal(privacyTier(PRIVATE_REPO).tier, "private");
    assert.equal(
      privacyTier({ ...PRIVATE_REPO, partyFriends: [{ owner: "a", repo: "b" }] }).tier,
      "shared",
    );
  });

  test("the anonymous counter is off unless explicitly switched on", () => {
    assert.equal(byId(REPO).telemetry.on, false);
    assert.equal(byId({ ...REPO, telemetryOptIn: true }).telemetry.on, true);
  });

  test("the counter is read through the same key the sender uses", () => {
    // These two once disagreed — the toggle wrote `telemetryEnabled` and the
    // sender read `telemetryOptIn`. Reading the wrong key here would report
    // somebody as opted out while their solves were being counted.
    assert.equal(byId({ ...REPO, [CONSTANTS.SK.TELEMETRY_OPT_IN]: true }).telemetry.on, true);
    assert.equal(byId({ ...REPO, telemetryEnabled: true }).telemetry.on, false);
  });

  test("junk in place of settings does not throw", () => {
    for (const input of [undefined, null, "nope", 42]) {
      assert.ok(Array.isArray(disclosures(/** @type {any} */ (input))));
    }
  });
});

describe("privacyTier", () => {
  test("nothing configured is private", () => {
    assert.equal(privacyTier({}).tier, "private");
    assert.equal(privacyTier({}).name, TIER_META.private.name);
  });

  test("a private repository with no extras stays private", () => {
    assert.equal(privacyTier(PRIVATE_REPO).tier, "private");
  });

  test("a public repository is reported as publicly readable", () => {
    assert.equal(privacyTier(REPO).tier, "public");
  });

  test("shields alone is a ping, not a publication", () => {
    // A private repo cannot use shields, so exercise the ping tier through the
    // counter instead: something leaves, but nothing readable and no code.
    assert.equal(privacyTier({ ...PRIVATE_REPO, telemetryOptIn: true }).tier, "shared");
  });

  test("sending code to a provider outranks everything else", () => {
    // Publishing solutions is usually deliberate; handing them to a company
    // whose terms you have not read is the step that is hard to take back.
    assert.equal(privacyTier({ ...REPO, telemetryOptIn: true, claude_enabled: true }).tier, "code");
    assert.equal(privacyTier({ ...PRIVATE_REPO, claude_enabled: true }).tier, "code");
  });

  test("the active list is exactly the entries that are on", () => {
    const t = privacyTier({ ...REPO, gemini_enabled: true });
    assert.ok(t.active.every((d) => d.on));
    assert.ok(t.active.some((d) => d.id === "ai:gemini"));
    assert.ok(!t.active.some((d) => d.id === "telemetry"));
  });

  test("every tier has a name and a summary to render", () => {
    for (const tier of TIERS) {
      assert.ok(TIER_META[tier]?.name, `${tier} has no name`);
      assert.ok(TIER_META[tier]?.summary, `${tier} has no summary`);
    }
  });
});

describe("aiCostNotes", () => {
  test("covers every provider and does not overstate what is free", () => {
    const notes = aiCostNotes();
    assert.equal(notes.length, Object.keys(CONSTANTS.AI_PROVIDERS).length);
    const free = notes.filter((n) => n.free).map((n) => n.id).sort();
    assert.deepEqual(free, ["gemini", "ollama", "openrouter"]);
    for (const n of notes) {
      assert.ok(n.why, `${n.id} has no cost note`);
      assert.ok(n.name, `${n.id} has no display name`);
    }
  });

  test("the paid ones say so rather than staying silent", () => {
    const paid = aiCostNotes().filter((n) => !n.free);
    for (const n of paid) {
      assert.match(n.why, /bills/, `${n.id} does not say it costs money`);
    }
  });
});
