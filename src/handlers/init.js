/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * @ts-check
 */

import { registry } from "../core/handler-registry.js";
import { CONSTANTS } from "../core/constants.js";
import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("HandlersInit");

// Platforms
import { LeetCodeHandler } from "./platforms/leetcode/index.js";
import { GFGHandler as GeeksForGeeksHandler } from "./platforms/geeksforgeeks/index.js";
import { CodeforcesHandler } from "./platforms/codeforces/index.js";
import { NeetCodeHandler } from "./platforms/neetcode/index.js";
import { TakeUForwardHandler } from "./platforms/takeuforward/index.js";

// Git Providers
import { GitHubHandler } from "./git/github/index.js";

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
    new NeetCodeHandler(),
    new TakeUForwardHandler(),
  ];
  platforms.forEach((h) => {
    registry.registerPlatform(h.id, h);
    if (typeof h.getSettingsSchema === "function")
      registry.registerSettings(h.id, h.getSettingsSchema());
    dbg.log(`initializeHandlers(): ✓ platform ${h.id} registered`);
  });

  // GitHub is the only git provider. The GitLab and Bitbucket handlers used to
  // be registered here with every method throwing "not yet implemented", which
  // meant the registry could hand a caller a provider that could only fail.
  const gits = [new GitHubHandler()];
  gits.forEach((h) => {
    registry.registerGitProvider(h.id, h);
    if (typeof h.getSettingsSchema === "function")
      registry.registerSettings(h.id, h.getSettingsSchema());
    dbg.log(`initializeHandlers(): ✓ git provider ${h.id} registered`);
  });

  // These stay written out: a static import is what lets the packager see the
  // file, and a computed `import()` of a path built from an id would not be
  // reviewable by a store reviewer reading the source. So this is the second
  // and last file adding an AI provider touches — `CONSTANTS.AI_PROVIDERS` is
  // the first, and every list that names providers derives from it.
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

  // Declared but not wired is the one failure this split can produce, and it is
  // a quiet one: the mention picker, the status bar, the privacy disclosure and
  // the settings-sync prefixes all read the descriptor, so a provider missing
  // from `ais` is advertised everywhere and works nowhere. Say so at startup
  // rather than letting the first review fail with "no handler".
  const missing = Object.keys(CONSTANTS.AI_PROVIDERS).filter((id) => !ais.some((h) => h.id === id));
  if (missing.length) {
    dbg.error(
      `initializeHandlers(): declared in AI_PROVIDERS but no handler registered: ${missing.join(", ")}`,
    );
  }

  dbg.log(
    `initializeHandlers(): ✓ complete — ${platforms.length} platform(s), ${gits.length} git provider(s), ${ais.length} AI provider(s) registered`,
  );
}
