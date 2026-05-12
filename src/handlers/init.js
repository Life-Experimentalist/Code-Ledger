/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// @ts-nocheck

import { registry } from "../core/handler-registry.js";
import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("HandlersInit");

// Platforms
import { LeetCodeHandler } from "./platforms/leetcode/index.js";
import { GFGHandler as GeeksForGeeksHandler } from "./platforms/geeksforgeeks/index.js";
import { CodeforcesHandler } from "./platforms/codeforces/index.js";

// Git Providers
import { GitHubHandler } from "./git/github/index.js";
import { GitLabHandler } from "./git/gitlab/index.js";
import { BitbucketHandler } from "./git/bitbucket/index.js";

// AI Providers
import { GeminiHandler } from "./ai/gemini/index.js";
import { OpenAIHandler } from "./ai/openai/index.js";
import { ClaudeHandler } from "./ai/claude/index.js";
import { DeepSeekHandler } from "./ai/deepseek/index.js";
import { OllamaHandler } from "./ai/ollama/index.js";
import { OpenRouterHandler } from "./ai/openrouter/index.js";

export function initializeHandlers() {
  dbg.log(`initializeHandlers(): starting handler registration...`);
  const platforms = [
    new LeetCodeHandler(),
    new GeeksForGeeksHandler(),
    new CodeforcesHandler(),
  ];
  platforms.forEach((h) => {
    registry.registerPlatform(h.id, h);
    if (typeof h.getSettingsSchema === "function")
      registry.registerSettings(h.id, h.getSettingsSchema());
    dbg.log(`initializeHandlers(): ✓ platform ${h.id} registered`);
  });

  const gits = [
    new GitHubHandler(),
    new GitLabHandler(),
    new BitbucketHandler(),
  ];
  gits.forEach((h) => {
    registry.registerGitProvider(h.id, h);
    if (typeof h.getSettingsSchema === "function")
      registry.registerSettings(h.id, h.getSettingsSchema());
    dbg.log(`initializeHandlers(): ✓ git provider ${h.id} registered`);
  });

  const ais = [
    new GeminiHandler(),
    new OpenAIHandler(),
    new ClaudeHandler(),
    new DeepSeekHandler(),
    new OllamaHandler(),
    new OpenRouterHandler(),
  ];
  ais.forEach((h) => {
    registry.registerAIProvider(h.id, h);
    if (typeof h.getSettingsSchema === "function")
      registry.registerSettings(h.id, h.getSettingsSchema());
    dbg.log(`initializeHandlers(): ✓ AI provider ${h.id} registered`);
  });

  dbg.log(`initializeHandlers(): ✓ complete — ${platforms.length} platform(s), ${gits.length} git provider(s), ${ais.length} AI provider(s) registered`);
}
