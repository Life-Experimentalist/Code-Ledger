/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * What leaves this browser, given how the extension is currently configured.
 *
 * The claim CodeLedger makes is "private by default", and that is worth being
 * precise about rather than proud of. Out of the box the only destination is
 * the user's own GitHub repository, reached with the user's own token. Every
 * step beyond that — an AI review, a public repository, a badge service, the
 * anonymous counter — is something the user switched on, and each one deserves
 * a plain sentence saying what goes where.
 *
 * So this module answers two questions from a settings object:
 *
 *   `disclosures(settings)` — every destination, whether it is currently
 *   active, and what it receives. The list includes the ones that are *off*,
 *   because "here is what you have not enabled" is the other half of an honest
 *   picture, and because a settings UI needs to explain a choice before it is
 *   made rather than after.
 *
 *   `privacyTier(settings)` — the single label that describes the furthest
 *   thing the current configuration does.
 *
 * It is pure and reads nothing but the settings object it is handed, so the
 * page, the popup and the welcome flow can all say exactly the same thing.
 */

import { CONSTANTS } from "./constants.js";
import { isAIActive, isGamificationActive } from "./feature-flags.js";

/**
 * How far a given destination goes, worst last.
 *
 * `code` ranks above `public` deliberately. Publishing solutions is something
 * many people actively want — it is a portfolio. Handing a solution to a
 * company whose terms of service you have not read is the step that is hard to
 * take back.
 */
export const TIERS = Object.freeze(["private", "shared", "public", "code"]);

export const TIER_META = Object.freeze({
  private: {
    name: "Private by default",
    summary: "Your commits go to your own repository. Nothing else you do here is sent anywhere.",
  },
  shared: {
    name: "Private, plus a few small pings",
    summary: "A service other than GitHub hears from you, but never your code.",
  },
  public: {
    name: "Publicly readable",
    summary: "Some of what you solve can be read by anyone with the link.",
  },
  code: {
    name: "Your code goes to an AI provider",
    summary: "A review sends your solution and the problem statement to a company that is not you.",
  },
});

/**
 * Whether a provider runs on the user's own machine and reaches no third party,
 * and how it is priced when there is a genuine no-cost path — both read off the
 * provider's own entry in `CONSTANTS.AI_PROVIDERS`, so a new provider is
 * disclosed correctly the moment it is declared rather than the moment somebody
 * remembers to add it to a second list here.
 *
 * `freeTier` is stated as a fact about how a provider is priced today, not a
 * promise about tomorrow — hence "free tier" rather than "free". A provider
 * that declares none reads as paid, which is the safe direction to be wrong in.
 */
const PAID_NOTE = "bills per token — check their pricing before you lean on it";

function repoOf(settings) {
  return settings?.github_repo || settings?.gitRepo || "";
}

/**
 * Every destination the extension can reach, in the order a person should read
 * them: what is unavoidable first, then what they chose.
 *
 * @param {Record<string, any>} [settings]
 * @returns {Array<{id: string, on: boolean, required: boolean, tier: string,
 *   destination: string, what: string, note: string}>}
 */
export function disclosures(settings) {
  const s = settings && typeof settings === "object" ? settings : {};
  const repo = repoOf(s);
  const repoPublic = !!repo && s.github_repo_private !== true;
  const badgesOn = !!repo && isGamificationActive(s) && s.gamificationBadges !== false;
  const out = [];

  out.push({
    id: "github",
    on: !!repo,
    required: true,
    tier: "private",
    destination: "GitHub",
    what: "Your solutions, the metadata around them, and — under .codeledger/ — your settings, your party list, and the behaviour bank if it is recording.",
    note: repo
      ? `Sent straight from this browser to the API with your own token, into ${repo}. It is your repository — you can delete it, make it private, or take it elsewhere.`
      : "Nothing is committed until you link a repository.",
  });

  out.push({
    id: "oauth-relay",
    on: !!repo,
    required: true,
    // Counted as private rather than shared: it brokers one credential exchange
    // and stores nothing. Ranking it alongside a badge CDN would make the
    // headline tier useless — every install would read the same — and would
    // hide the distinction that actually matters to someone deciding.
    tier: "private",
    destination: "The CodeLedger sign-in relay",
    what: "Your GitHub authorisation code, once, at sign-in.",
    note: "Exchanged for a token and not retained. It never sees your code, your keys or your solves. It is the only server this project runs.",
  });

  out.push({
    id: "repo-public",
    on: repoPublic,
    required: false,
    tier: "public",
    destination: "Anyone on the internet",
    what: "Your solutions and your solve history, because the repository is public.",
    note: "A public repository is the point for most people — it is a portfolio you did not have to write. Making it private keeps it to you and anyone you invite.",
  });

  out.push({
    id: "badges",
    on: badgesOn && repoPublic,
    required: false,
    tier: "public",
    destination: "Anyone with your repository URL",
    what: "Your streak, points, level and solve counts, as badge images and a small JSON file.",
    note: "Committed next to your solutions. In a private repository they are visible only to you.",
  });

  out.push({
    id: "pages",
    on: !!repo && repoPublic && s.github_pages !== false,
    required: false,
    tier: "public",
    destination: "Anyone with your GitHub Pages URL",
    what: "A generated stats page built from the same numbers.",
    note: "Served by GitHub from your own repository. Turning Pages off leaves the files in place but stops publishing the site.",
  });

  out.push({
    id: "shields",
    on: badgesOn && repoPublic && s.gamificationBadgeStyle === "shields",
    required: false,
    tier: "shared",
    destination: "shields.io",
    what: "One request per README view, telling shields your repository exists.",
    note: "Your numbers still come from your own repository; shields only draws them. The self-hosted badges do the same job with nobody in the middle.",
  });

  for (const [id, meta] of Object.entries(CONSTANTS.AI_PROVIDERS || {})) {
    const enabled = isAIActive(s) && s[`${id}_enabled`] === true;
    const local = meta.local === true;
    // A provider that answers by asking you is not a destination at all — the
    // extension opens a box with the prompt in it and waits. Where that text
    // goes next is a decision you make with your own clipboard, so this is
    // listed at the same tier as a local model and says so plainly rather than
    // claiming a privacy property that depends on where you paste.
    if (meta.requiresHuman === true) {
      out.push({
        id: `ai:${id}`,
        on: enabled,
        required: false,
        manual: true,
        tier: "private",
        destination: "Your clipboard",
        what: "The prompt is shown to you. Nothing is sent.",
        note: "CodeLedger makes no request for this provider. You copy the prompt into whichever AI chat you choose and paste the reply back — so whatever that service does with it is between you and them.",
      });
      continue;
    }
    out.push({
      id: `ai:${id}`,
      on: enabled,
      required: false,
      tier: local ? "private" : "code",
      destination: local ? `${meta.name} — your own machine` : meta.name,
      what: "Your solution and the problem statement, each time a review runs.",
      note: local
        ? "Runs locally, so nothing about your code reaches the network at all."
        : `Sent directly from this browser with your own API key. ${meta.name}'s terms and retention policy apply, not ours.`,
    });
  }

  out.push({
    id: "mermaid",
    // There is no setting for this one: it is a button on each diagram. What a
    // settings object can honestly say is whether it is *reachable*, which is
    // exactly when AI reviews can produce a diagram in the first place. Listing
    // it as off while a Render button sits there would be the wrong answer.
    on: isAIActive(s),
    // Reachable, but never automatic — it waits for a click on one diagram.
    // `privacyTier` skips these, so somebody running a local model is not told
    // they are pinging a service when nothing has been sent.
    manual: true,
    required: false,
    tier: "shared",
    destination: "mermaid.ink",
    what: "The source of one diagram, and only when you press Render on it.",
    note: "AI replies that contain a diagram are shown as source with a Render button. Pressing it sends that diagram's source — which describes the shape of your solution, though not the code — to mermaid.ink to be drawn. Nothing is sent if you never press it.",
  });

  out.push({
    id: "party",
    // The list lives in settings, so "has the user added anyone" is a question
    // this module can answer honestly without guessing.
    on: Array.isArray(s.partyFriends) && s.partyFriends.length > 0,
    required: false,
    tier: "shared",
    destination: "raw.githubusercontent.com",
    what: "A request for each added repository's public badge file, sent without your token.",
    note: "Nothing of yours is uploaded and the people you add are not told. What leaves is the request itself — GitHub sees your IP address asking for their file. Removing everyone from the list stops it.",
  });

  out.push({
    id: "telemetry",
    // Read through the constant: the toggle once wrote `telemetryEnabled` while
    // the sender read `telemetryOptIn`, so the switch did nothing for a release.
    // A disclosure that consults the wrong key is the same bug with worse
    // consequences — it would tell someone they are opted out when they are not.
    on: s[CONSTANTS.SK.TELEMETRY_OPT_IN] === true,
    required: false,
    tier: "shared",
    destination: "CodeLedger's anonymous counter",
    what: "The platform name and extension version on each solve. No problem, no code, no identifier.",
    note: "Off unless you switch it on. It exists to answer 'is anyone using this', nothing more.",
  });

  return out;
}

/**
 * The label for the furthest thing the current configuration does.
 *
 * @param {Record<string, any>} [settings]
 * @returns {{ tier: string, name: string, summary: string, active: object[] }}
 */
export function privacyTier(settings) {
  const active = disclosures(settings).filter((d) => d.on);
  let rank = 0;
  for (const d of active) {
    // A destination that only fires on an explicit click is listed but does not
    // set the headline: nothing has been sent, and saying otherwise would push
    // somebody running a local model out of "private" for a button they may
    // never press.
    if (d.manual) continue;
    const i = TIERS.indexOf(d.tier);
    if (i > rank) rank = i;
  }
  const tier = TIERS[rank];
  return { tier, ...TIER_META[tier], active };
}

/**
 * Why turning AI on is worth doing, and what it costs.
 *
 * Reviews are the feature people get the most out of and the one most likely to
 * be left off out of vague unease, so the encouragement is worth making — but
 * only alongside the accurate version of "free". Some providers have a genuine
 * no-cost path and the rest bill you; which is which comes from each entry's
 * own `freeTier`, so this stays true as providers are added.
 *
 * @returns {Array<{id: string, name: string, free: boolean, why: string}>}
 */
export function aiCostNotes() {
  return Object.entries(CONSTANTS.AI_PROVIDERS || {}).map(([id, meta]) => ({
    id,
    name: meta.name,
    free: !!meta.freeTier,
    why: meta.freeTier || PAID_NOTE,
  }));
}
