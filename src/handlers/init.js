/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// @ts-nocheck

import { registry } from "../core/handler-registry.js";

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
  const platforms = [
    new LeetCodeHandler(),
    new GeeksForGeeksHandler(),
    new CodeforcesHandler(),
  ];
  platforms.forEach((h) => {
    registry.registerPlatform(h.id, h);
    if (typeof h.getSettingsSchema === "function")
      registry.registerSettings(h.id, h.getSettingsSchema());
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
  });
}
