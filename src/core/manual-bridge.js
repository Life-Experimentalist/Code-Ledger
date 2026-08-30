/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Where a human-in-the-loop provider finds its human.
 *
 * `ManualHandler.review()` needs to hand a prompt to a person and wait for what
 * they paste back. That only works somewhere a person is looking, and the code
 * that shows them the prompt is DOM code — which the service worker must never
 * load, because `handlers/init.js` registers every AI handler and the service
 * worker imports it.
 *
 * So the handler asks *this* module, and the page installs the answer. In the
 * service worker nothing is installed, `resolveManualPrompt` throws
 * immediately, and the chain moves on rather than blocking on a person who is
 * not there. That is the whole reason this indirection exists: it is not a
 * plugin point, it is the thing that keeps a UI import out of the worker.
 */

const NO_HUMAN =
  "The manual provider needs somebody to paste an answer, so it only works from a CodeLedger page — not from a background review.";

/** @type {null | ((prompt: string, meta: Record<string, any>) => Promise<string>)} */
let resolver = null;

/**
 * Install the page's prompt-exchange UI. Called once per page that can show it.
 *
 * @param {(prompt: string, meta: Record<string, any>) => Promise<string>} fn
 * @returns {() => void} removes it again
 */
export function setManualPromptResolver(fn) {
  resolver = typeof fn === "function" ? fn : null;
  return () => {
    if (resolver === fn) resolver = null;
  };
}

/** Whether a person can be asked from here. */
export function isManualAvailable() {
  return typeof resolver === "function";
}

/**
 * Ask the person in front of this page to answer a prompt.
 *
 * @param {string} prompt
 * @param {Record<string, any>} [meta] what the UI shows alongside it
 * @returns {Promise<string>} exactly what they pasted
 */
export async function resolveManualPrompt(prompt, meta = {}) {
  if (!resolver) throw new Error(NO_HUMAN);
  const answer = await resolver(String(prompt || ""), meta);
  const text = String(answer || "").trim();
  // An empty answer is a cancelled exchange, not a review. Returning "" would
  // be written to the repository as the AI review for that solve.
  if (!text) throw new Error("No answer was pasted back.");
  return text;
}

export { NO_HUMAN };
