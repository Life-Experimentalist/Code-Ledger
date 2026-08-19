/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deciding which accepted row on a Codeforces page is *our* submission.
 *
 * Codeforces does not answer a submit in place. The submit form posts and the
 * browser lands on `/contest/{id}/my`, a table of **every** submission you have
 * made in that contest. The verdict watcher looks for
 * `span[submissionverdict="OK"]`, and on that page it will find one for each
 * problem already solved — none of which is the submission just made, which is
 * usually still showing "In queue".
 *
 * Taking the first OK row is therefore wrong twice over. It commits before the
 * judge has answered, so a submission that ends up Wrong Answer is filed as
 * accepted; and it consumes the pending code under an unrelated submission id.
 * The fix is to read the problem the row is *about* — every row on a status
 * table links to its problem — and require it to be the problem we are waiting
 * on.
 *
 * The one place that link is absent is the inline submissions box on a problem
 * page, where the problem is implied by the page. That is the reason a missing
 * row slug falls through to the pending slug rather than being rejected.
 *
 * The same page is why `mergeCapturedMetadata` lives here: the title, tags and
 * statement are not on /my either, so what the solve knows about itself comes
 * from the capture rather than from the page the verdict was read on.
 *
 * Nothing here touches the DOM, so the rules can be tested on their own.
 */

import { detectPage, PAGE_TYPES } from "./page-detector.js";

/**
 * How long a saved submission stays eligible to be matched.
 *
 * sessionStorage lives as long as the tab, so without a bound the code captured
 * at lunchtime is still sitting there in the evening, ready to attach itself to
 * whatever accepted row the next page happens to show. Judging takes seconds
 * normally and minutes when a big contest floods the queue; thirty minutes is
 * past the worst of that and nowhere near a stale attach.
 */
export const PENDING_TTL_MS = 30 * 60 * 1000;

/**
 * Read the problem a status-table row points at.
 *
 * @param {string} href an absolute or relative link from the row's problem cell
 * @returns {string} the CodeLedger slug ("1234A", "gym100500B"), or "" when the
 *   link is not a problem link at all
 */
export function cfSlugFromHref(href) {
  const raw = String(href || "").trim();
  if (!raw) return "";
  // Only the path matters, and the href may be absolute, protocol-relative or
  // rooted. Chopping at the host keeps this free of the URL constructor, which
  // throws on the relative form.
  const path = raw.replace(/^[a-z]+:\/\/[^/]+/i, "").replace(/^\/\/[^/]+/, "");
  const page = detectPage(path.split(/[?#]/)[0]);
  return page.type === PAGE_TYPES.PROBLEM ? page.slug || "" : "";
}

/**
 * Decide whether an accepted row should be committed, and under which slug.
 *
 * @param {object} args
 * @param {string} [args.rowSlug]     the problem the row links to, "" when the
 *                                    table does not say
 * @param {string} [args.pendingSlug] the problem whose code we captured at submit
 * @param {string} [args.pageSlug]    the problem page we are currently on
 * @returns {string|null} the slug to file the solve under, or null to ignore
 *   the row
 */
export function matchAcceptedRow({ rowSlug = "", pendingSlug = "", pageSlug = "" } = {}) {
  const row = String(rowSlug || "").trim();
  const pending = String(pendingSlug || "").trim();
  const page = String(pageSlug || "").trim();

  // The row names a problem: it is the authority, and it has to agree with
  // whatever we were waiting for. This is the check that keeps an older solve
  // further down /contest/{id}/my from consuming the submission we just made.
  if (row) {
    if (pending) return row === pending ? row : null;
    if (page) return row === page ? row : null;
    // Neither a capture nor a problem page — a status list being read on its
    // own. There is no code to commit, so there is nothing to accept.
    return null;
  }

  // No link in the row. Only the inline box on a problem page looks like this,
  // and there the problem is not in doubt.
  return pending || page || null;
}

/**
 * Does an accepted row belong to the signed-in user?
 *
 * Contest-wide and problemset status tables list everyone's submissions, so a
 * matching problem slug alone is not proof of ownership: within the pending
 * TTL, somebody else's OK on the same problem would file our still-unjudged
 * code as accepted. A row is rejected only when it provably belongs to someone
 * else — both handles known and different. The inline box on a problem page
 * has no party cell, and the header handle can fail to parse; an unknown on
 * either side must not reject, because that would kill detection for every
 * user the markup drifts for, which is worse than the rare shared-status
 * false accept it would stop.
 *
 * @param {string} rowHandle handle the row's party cell links to, "" if none
 * @param {string} ownHandle the signed-in user's handle, "" if unknown
 * @returns {boolean}
 */
export function isRowOwn(rowHandle, ownHandle) {
  const row = String(rowHandle || "")
    .trim()
    .toLowerCase();
  const own = String(ownHandle || "")
    .trim()
    .toLowerCase();
  if (!row || !own) return true;
  return row === own;
}

/**
 * Reconcile what the verdict page can see with what was captured at submit.
 *
 * The capture wins on every descriptive field, because on /contest/{id}/my the
 * live read has nothing to offer: it returns the slug as the title, no tags, no
 * rating and no statement, and letting that overwrite a real capture is exactly
 * the bug this exists to stop. The live read still wins when there is no
 * capture at all — solving from the problem page without the submit hook
 * firing, say.
 *
 * Runtime and memory go the other way round: they describe the submission, not
 * the problem, and they do not exist until it has been judged.
 *
 * @param {object} live      metadata read from the page the verdict appeared on
 * @param {object|null} captured metadata saved at submit time
 * @param {{runtime?: string|null, memory?: string|null}|null} stats read off the
 *   accepted row
 * @returns {object}
 */
export function mergeCapturedMetadata(live, captured, stats) {
  const base = live || {};
  const saved = captured || {};
  const pick = (key) => {
    const fromLive = base[key];
    if (fromLive !== null && fromLive !== undefined && fromLive !== "") return fromLive;
    const fromSaved = saved[key];
    return fromSaved === undefined ? null : fromSaved;
  };

  return {
    ...saved,
    ...base,
    title: pick("title"),
    tags: base.tags?.length ? base.tags : saved.tags || [],
    difficulty: pick("difficulty"),
    rating: pick("rating"),
    description: pick("description"),
    contestId: pick("contestId"),
    letter: pick("letter"),
    runtime: stats?.runtime ?? base.runtime ?? null,
    memory: stats?.memory ?? base.memory ?? null,
  };
}

/**
 * Is a captured submission still recent enough to belong to this verdict?
 *
 * @param {number|null|undefined} ts when the code was captured
 * @param {number} now
 * @returns {boolean}
 */
export function isPendingFresh(ts, now = Date.now()) {
  const at = Number(ts);
  if (!Number.isFinite(at) || at <= 0) return false;
  // A clock that has gone backwards should expire the capture, not extend it
  // forever, so the future is out of bounds too.
  return at <= now && now - at <= PENDING_TTL_MS;
}
