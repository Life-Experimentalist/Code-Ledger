/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * One way to ask the AI a question from a page.
 *
 * Four surfaces send chat — the library's AI Chats view, its compose box, the
 * problem modal and the floating panel on a problem page — and each had written
 * out its own `chrome.runtime.sendMessage({type: "AI_CHAT"})` with its own
 * error handling. That was fine while every provider was an HTTP call the
 * service worker could make. It stopped being fine with `manual`, which answers
 * by asking the person at the keyboard: the service worker has nobody to ask
 * and skips it, so the decision "does this one need a page" has to be made
 * before the message is sent, and it should be made in one place.
 *
 * So this is that place, and the shape it returns is the shape the service
 * worker already returned — `{response, providerId, modelId, isFallback}` —
 * because none of the four callers should have to care which way the answer
 * came back.
 */

import { Storage } from "../core/storage.js";
import { CONSTANTS } from "../core/constants.js";

/**
 * @typedef {{response: string, providerId: string, modelId: string, isFallback: boolean}} AIChatResult
 */

/**
 * Ask the service worker, which runs its own provider fallback chain.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {Record<string, any>} context
 * @returns {Promise<AIChatResult>}
 */
function viaServiceWorker(messages, context) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      reject(new Error("AI chat is only available inside the extension."));
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: "AI_CHAT", messages, context }, (resp) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (resp?.ok) resolve(resp.response);
        else reject(new Error(resp?.error || "AI request failed"));
      });
    } catch (_) {
      // The worker was replaced under us — an extension update, a reload. The
      // port is gone and this page's module graph is stale with it.
      reject(new Error("Extension was updated. Please reload this page to continue using AI."));
    }
  });
}

/**
 * Ask the person looking at this page.
 *
 * Everything is imported on demand: the exchange overlay and the handler that
 * drives it are dead weight in the four callers that will never select this
 * provider, and on a problem page they would be loaded into somebody else's
 * site for nothing.
 *
 * @param {string} providerId
 * @param {Array<{role: string, content: string}>} messages
 * @param {Record<string, any>} context
 * @returns {Promise<AIChatResult>}
 */
async function viaHuman(providerId, messages, context) {
  const [{ setManualPromptResolver }, { askHuman }, { ManualHandler }] = await Promise.all([
    import("../core/manual-bridge.js"),
    import("../ui/manual-exchange.js"),
    import("../handlers/ai/manual/index.js"),
  ]);
  const uninstall = setManualPromptResolver(askHuman);
  try {
    const response = await new ManualHandler().chat(messages, context);
    return { response, providerId, modelId: "", isFallback: false };
  } finally {
    // Installed only for the duration of this exchange. Leaving it set would
    // let a later background-initiated call believe a human is available.
    uninstall();
  }
}

/**
 * Send a chat turn and get the reply, whichever way this provider answers.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {Record<string, any>} [context]
 * @returns {Promise<AIChatResult>}
 */
export async function sendAIChat(messages, context = {}) {
  let providerId = CONSTANTS.AI_DEFAULT_PRIMARY;
  try {
    const settings = await Storage.getSettings();
    providerId = settings?.aiProvider || CONSTANTS.AI_DEFAULT_PRIMARY;
  } catch (_) {
    // Unreadable settings mean the default provider, which the worker handles.
  }
  if (CONSTANTS.AI_PROVIDERS?.[providerId]?.requiresHuman === true) {
    return viaHuman(providerId, messages, context);
  }
  return viaServiceWorker(messages, context);
}
