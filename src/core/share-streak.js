/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Turning a streak into something worth posting.
 *
 * Every piece of sharing is a plain string: a sentence, a link the browser
 * opens, a filename. There is no service in the middle, nothing to sign up for
 * and nothing to pay for — the picture is drawn in the page from the same
 * `streakCard` the README uses, and the network share targets are the public
 * intent URLs each site has always had.
 *
 * Kept separate from the component so the wording and the URL building can be
 * tested without a DOM.
 */

/**
 * The sentence that goes in the post.
 *
 * Three shapes, because a fresh install genuinely has nothing to brag about and
 * "0-day streak" reads as a bug rather than a beginning.
 *
 * @param {object} snapshot from `computeSnapshot`
 * @returns {string}
 */
export function shareSummary(snapshot) {
  const streak = Math.max(0, Number(snapshot?.currentStreak) || 0);
  const points = Math.max(0, Number(snapshot?.totalPoints) || 0);
  const solves = Math.max(0, Number(snapshot?.totalSolves) || 0);

  if (streak > 0) {
    const days = streak === 1 ? "1 day" : `${streak} days`;
    return `🔥 ${days} in a row solving DSA problems — ${points} points across ${solves} solutions, all committed to my own GitHub repo by CodeLedger.`;
  }
  if (solves > 0) {
    return `${solves} DSA solutions and ${points} points logged in my own GitHub repo, committed automatically by CodeLedger.`;
  }
  return `Starting a DSA ledger — every problem I solve gets committed to my own GitHub repo automatically by CodeLedger.`;
}

/**
 * The public address to attach to a post, if there is one.
 *
 * A private repository deliberately produces nothing. Its URL is a 404 to
 * everyone who reads the post, and pointing strangers at a page they cannot
 * open is worse than posting the picture on its own.
 *
 * @param {Record<string, any>} [settings]
 * @returns {string} "" when nothing public is known
 */
export function shareLink(settings = {}) {
  if (settings?.github_repo_private === true) return "";

  const pages = String(settings?.github_pages_url || "").trim();
  if (/^https:\/\//i.test(pages)) return pages;

  const owner = String(settings?.github_owner || settings?.github_username || "").trim();
  const repo = String(settings?.github_repo || settings?.gitRepo || "").trim();
  if (owner && repo) return `https://github.com/${owner}/${repo}`;
  return "";
}

/**
 * Where the post can go.
 *
 * Each entry is a URL the browser opens in a new tab; the user still writes and
 * sends the post themselves on the site. LinkedIn only appears when a link is
 * known because its share endpoint takes a URL and nothing else — offered
 * without one it would open an empty composer, which looks broken.
 *
 * @param {string} text
 * @param {string} [url]
 * @returns {Array<{ id: string, label: string, href: string }>}
 */
export function shareTargets(text, url = "") {
  const body = String(text || "");
  const link = String(url || "");
  const q = encodeURIComponent;
  const out = [
    {
      id: "x",
      label: "X",
      href: `https://x.com/intent/post?text=${q(body)}${link ? `&url=${q(link)}` : ""}`,
    },
  ];

  if (link) {
    out.push({
      id: "linkedin",
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${q(link)}`,
    });
  }

  out.push({
    id: "reddit",
    label: "Reddit",
    // A link post when there is something to link to, a text post otherwise.
    href: link
      ? `https://www.reddit.com/submit?title=${q(body)}&url=${q(link)}`
      : `https://www.reddit.com/submit?title=${q(body)}&text=${q(body)}`,
  });

  return out;
}

/**
 * What the downloaded picture is called.
 *
 * The day is in the name because the card is a snapshot; two downloads a week
 * apart should not overwrite each other in the downloads folder.
 *
 * @param {object} snapshot
 * @returns {string}
 */
export function cardFilename(snapshot) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(snapshot?.today || "")) ? snapshot.today : "streak";
  return `codeledger-${day}.png`;
}
