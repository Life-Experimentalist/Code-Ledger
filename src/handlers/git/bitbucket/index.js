/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseGitHandler } from "../../_base/BaseGitHandler.js";
import { CONSTANTS } from "../../../core/constants.js";
import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("BitbucketHandler");

export const BITBUCKET_FEATURE_STATUS = CONSTANTS.FEATURE_STATUS.UNDER_CONSTRUCTION;

export class BitbucketHandler extends BaseGitHandler {
  constructor() {
    super("bitbucket", "Bitbucket");
  }

  getSettingsSchema() {
    return {
      id: this.id,
      title: "Bitbucket Integration",
      order: 3,
      status: BITBUCKET_FEATURE_STATUS,
      description: "Bitbucket support is under construction.",
      fields: [],
    };
  }

  async getToken() {
    return null;
  }
  async getContents(_owner, _repo, _path) {
    throw new Error("Bitbucket getContents: not yet implemented");
  }
  async getCurrentUser() {
    throw new Error("Bitbucket getCurrentUser: not yet implemented");
  }
  async apiFetch(_path, _opts = {}) {
    throw new Error("Bitbucket apiFetch: not yet implemented");
  }
  async commit(files, message, repo) {
    // Implement Bitbucket Commit API
    this.dbg.log("Bitbucket commit simulation/unimplemented");
  }
}
