/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseGitHandler } from '../../_base/BaseGitHandler.js';
import { CONSTANTS } from '../../../core/constants.js';

export class GitLabHandler extends BaseGitHandler {
  constructor() {
    super('gitlab', 'GitLab');
  }

  async commit(files, message, repo) {
    // Implement GitLab Commit API
    this.dbg.log('GitLab commit simulation/unimplemented');
  }
}
