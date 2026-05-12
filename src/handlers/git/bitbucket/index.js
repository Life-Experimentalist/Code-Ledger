/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseGitHandler } from "../../_base/BaseGitHandler.js";
import { CONSTANTS } from "../../../core/constants.js";

export const BITBUCKET_FEATURE_STATUS =
    CONSTANTS.FEATURE_STATUS.UNDER_CONSTRUCTION;

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

    async commit(files, message, repo) {
        // Implement Bitbucket Commit API
        this.dbg.log("Bitbucket commit simulation/unimplemented");
    }
}
