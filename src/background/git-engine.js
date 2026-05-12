/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { registry } from '../core/handler-registry.js';
import { createDebugger } from '../lib/debug.js';

const dbg = createDebugger('GitEngine');

export const GitEngine = {
  async commitSolve(problemContext, code, settings) {
    if (settings.gitEnabled === false || settings.gitEnabled === 0) {
      dbg.log(`commitSolve(): git disabled, skipping commit`);
      return;
    }
    dbg.log(`commitSolve(): starting solve commit for ${problemContext?.titleSlug || 'unknown'}`);

    const providerId = settings.gitProvider || 'github';
    const gitHandler = registry.getGitProvider(providerId);

    if (!gitHandler) {
      dbg.error(`commitSolve(): ✗ handler for ${providerId} not found`);
      return;
    }

    try {
      const topicFolder = problemContext.topic || 'Untagged';
      const cleanTitle = (problemContext.titleSlug || problemContext.title || 'unknown').replace(/[^a-zA-Z0-9-]/g, '-');
      const langExt = problemContext.lang?.ext || 'txt';
      const filePath = `topics/${topicFolder}/${cleanTitle}/solution.${langExt}`;
      dbg.log(`commitSolve(): prepared file path=${filePath}`);

      await gitHandler.commit([
        { path: filePath, content: code }
      ], `[${topicFolder}] Solved ${problemContext.title}`, settings.github_repo || settings.gitRepo);

      dbg.log(`commitSolve(): ✓ commit completed via ${providerId}`);
    } catch (e) {
      dbg.error(`commitSolve(): ✗ git engine commit failure:`, e?.message || e);
    }
  }
};
