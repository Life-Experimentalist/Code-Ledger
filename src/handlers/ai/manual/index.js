/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The provider with no API behind it.
 *
 * Every other handler in this directory turns a prompt into an HTTP request.
 * This one turns it into a person: it builds exactly the same prompt, shows it
 * to whoever is at the keyboard, and returns whatever they paste back. That is
 * the whole implementation, and it is worth having — an API key is a real
 * barrier, and plenty of people already pay for a chat window they could paste
 * into. It also means the strongest available model is always an option,
 * without CodeLedger holding a credential for it.
 *
 * It is also the proof that the provider descriptor is doing its job. Adding
 * this provider touched `CONSTANTS.AI_PROVIDERS`, this file and the handler
 * list — the mention picker, the status-bar label, the privacy disclosure, the
 * settings-sync prefixes and the model picker all picked it up on their own.
 */

import { BaseAIHandler } from "../../_base/BaseAIHandler.js";
import { Storage } from "../../../core/storage.js";
import { buildReviewPrompt } from "../../../core/ai-prompts.js";
import { resolveManualPrompt } from "../../../core/manual-bridge.js";
import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("ManualHandler");

export class ManualHandler extends BaseAIHandler {
  constructor() {
    super("manual", "Manual (copy & paste)");
    this.dbg = dbg;
  }

  getSettingsSchema() {
    return {
      id: this.id,
      title: "Manual (copy & paste)",
      order: 7,
      description:
        "No API key. CodeLedger writes the prompt, you paste it into any AI chat you already use, and paste the reply back.",
      fields: [
        {
          key: "manual_enabled",
          label: "Enable manual answers",
          type: "toggle",
          default: false,
          description:
            "Adds a copy-and-paste option to AI chat. Reviews that run in the background skip it — there is nobody to ask.",
        },
      ],
    };
  }

  /**
   * @param {string} code
   * @param {Record<string, any>} [problemContext]
   * @returns {Promise<string>}
   */
  async review(code, problemContext = {}) {
    const prompts = await Storage.getAIPrompts();
    const prompt = buildReviewPrompt(problemContext, code, prompts);
    // Throws where there is no UI installed — see core/manual-bridge.js. The
    // service worker never gets here anyway: it skips `requiresHuman` providers
    // when it builds the chain, rather than calling one and waiting.
    return resolveManualPrompt(prompt, {
      title: problemContext.title || "",
      difficulty: problemContext.difficulty || "",
    });
  }

  /** Nothing to list — there is no catalogue, only whichever chat you use. */
  async getAvailableModels() {
    return [];
  }
}
