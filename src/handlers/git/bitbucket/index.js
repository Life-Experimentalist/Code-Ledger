/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseGitHandler } from '../../_base/BaseGitHandler.js';
import { CONSTANTS } from '../../../core/constants.js';

export class BitbucketHandler extends BaseGitHandler {
  constructor() {
    super('bitbucket', 'Bitbucket');
  }

  async commit(files, message, repo) {
    // Implement Bitbucket Commit API
    this.dbg.log('Bitbucket commit simulation/unimplemented');
  }
}
