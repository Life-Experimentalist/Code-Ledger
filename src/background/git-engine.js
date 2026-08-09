/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { registry } from "../core/handler-registry.js";
import { buildProblemFiles } from "../core/path-builder.js";
import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("GitEngine");

export const GitEngine = {
  async commitSolve(problemContext, code, settings) {
    if (settings.gitEnabled === false || settings.gitEnabled === 0) {
      dbg.log(`commitSolve(): git disabled, skipping commit`);
      return;
    }
    dbg.log(`commitSolve(): starting solve commit for ${problemContext?.titleSlug || "unknown"}`);

    const providerId = settings.gitProvider || "github";
    const gitHandler = registry.getGitProvider(providerId);

    if (!gitHandler) {
      dbg.error(`commitSolve(): ✗ handler for ${providerId} not found`);
      return;
    }

    try {
      const problem = { ...problemContext, code };
      const files = buildProblemFiles(problem, settings);
      dbg.log(`commitSolve(): prepared ${files.length} file(s), first path=${files[0]?.path}`);

      await gitHandler.commit(
        files,
        `Solved ${problemContext.title}`,
        settings.github_repo || settings.gitRepo,
      );

      dbg.log(`commitSolve(): ✓ commit completed via ${providerId}`);
    } catch (e) {
      dbg.error(`commitSolve(): ✗ git engine commit failure:`, e?.message || e);
    }
  },
};
