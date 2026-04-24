/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from '../../lib/debug.js';

export class BaseAIHandler {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.dbg = createDebugger(`${name}AIHandler`);
  }

  async review(code, problemContext) { throw new Error('Not implemented'); }
  async getAvailableModels() { throw new Error('Not implemented'); }
}
