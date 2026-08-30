/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Click handlers for the buttons we inject into a platform's page.
 *
 * Our content scripts run in the page's DOM, so the page can find our buttons
 * and call `.click()` on them. The handlers behind the import and sync buttons
 * read the current solution and commit it to the user's GitHub repository, so a
 * hostile or XSS'd platform page can drive repeated commits with no user
 * action — the extension has no way to tell those from a real click after the
 * fact, because by then it is the same handler running.
 *
 * `isTrusted` is the one part of the event a page cannot forge: the browser
 * sets it to `false` on every event constructed or dispatched from script, and
 * it is read-only. Requiring it means the page can still press the button
 * visually, but nothing happens.
 *
 * What this does not do: it does not protect a button from a real click the
 * user was tricked into making, and it does not apply to anything triggered
 * from the extension's own pages, where there is no untrusted script to begin
 * with. It is only worth attaching to a button whose handler writes to the
 * user's repository.
 *
 * @param {EventTarget} el
 * @param {(e: MouseEvent) => any} handler
 */
export function onTrustedClick(el, handler) {
  el.addEventListener("click", (e) => {
    if (!e.isTrusted) return;
    return handler(e);
  });
}
