/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../../lib/debug.js";
import { fetchModelsForProvider } from "../../core/model-fetch.js";

export class BaseAIHandler {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.dbg = createDebugger(`${name}AIHandler`);
  }

  async review(code, problemContext) {
    throw new Error("Not implemented");
  }
  async getAvailableModels() {
    try {
      return await fetchModelsForProvider(this.id);
    } catch (e) {
      this.dbg("getAvailableModels failed", e);
      return [];
    }
  }
}
