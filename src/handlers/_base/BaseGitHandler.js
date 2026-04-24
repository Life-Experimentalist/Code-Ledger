/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from '../../lib/debug.js';

export class BaseGitHandler {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.dbg = createDebugger(`${name}GitHandler`);
  }

  async authenticate() { throw new Error('Not implemented'); }
  async commit(files, message) { throw new Error('Not implemented'); }
  async getFile(path) { throw new Error('Not implemented'); }
}
