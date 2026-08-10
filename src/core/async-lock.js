/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mutual exclusion across every context the extension runs in.
 *
 * A read-modify-write against `chrome.storage.local` is not atomic, and the
 * extension has several contexts doing it at once: the service worker, the
 * library tab, the popup, the welcome page. Two of them reading the same
 * settings object and writing back their own version means one of the two edits
 * is simply gone, with nothing logged.
 *
 * The Web Locks API is the right tool because its scope is the origin, not the
 * page — a lock taken in the service worker is seen by the library tab, which
 * is exactly the boundary the race crosses. Where it is missing we fall back to
 * a per-context promise chain, which still serialises the common case (one page
 * doing several things at once) and is never worse than the unguarded code it
 * replaces.
 */

/** Fallback chains, one per lock name. Only used when Web Locks is absent. */
const chains = new Map();

/**
 * Whether this context has a lock that other contexts can see.
 *
 * Checked per call rather than captured once, so a context that gains
 * `navigator` after this module loads is not stuck on the weaker path.
 */
export function hasWebLocks() {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.locks &&
    typeof navigator.locks.request === "function"
  );
}

/**
 * Run `fn` with exclusive hold of `name`. Callers queue in arrival order.
 *
 * The lock is released whether `fn` resolves or throws, so one failed write
 * cannot wedge every later one.
 *
 * @template T
 * @param {string} name
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function withLock(name, fn) {
  if (hasWebLocks()) {
    return navigator.locks.request(name, fn);
  }

  const previous = chains.get(name) || Promise.resolve();
  // The predecessor's rejection is swallowed here and here only: whoever
  // awaited it has already seen the error, and re-throwing would fail this
  // caller for someone else's problem. `fn` still runs, and its own result
  // passes through untouched.
  const run = previous.then(fn, fn);
  chains.set(
    name,
    run.catch(() => {}),
  );
  return run;
}
