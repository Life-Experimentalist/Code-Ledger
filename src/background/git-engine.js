/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { registry } from '../core/handler-registry.js';
import { createDebugger } from '../lib/debug.js';

const dbg = createDebugger('GitEngine');

export const GitEngine = {
  async commitSolve(problemContext, code, settings) {
    if (settings.gitEnabled === false || settings.gitEnabled === 0) return;
    dbg.log('Processing atomic commit request via GitEngine');

    const providerId = settings.gitProvider || 'github';
    const gitHandler = registry.getGitProvider(providerId);

    if (!gitHandler) {
      dbg.error(`Handler for ${providerId} not found.`);
      return;
    }

    try {
      const topicFolder = problemContext.topic || 'Untagged';
      const cleanTitle = (problemContext.titleSlug || problemContext.title || 'unknown').replace(/[^a-zA-Z0-9-]/g, '-');
      const langExt = problemContext.lang?.ext || 'txt';
      const filePath = `topics/${topicFolder}/${cleanTitle}/solution.${langExt}`;

      await gitHandler.commit([
        { path: filePath, content: code }
      ], `[${topicFolder}] Solved ${problemContext.title}`, settings.github_repo || settings.gitRepo);

      dbg.log('Commit completed via GitEngine');
    } catch (e) {
      dbg.error('Git engine commit failure', e);
    }
  }
};
