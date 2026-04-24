/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initDebug, coreDebug } from '../lib/debug.js';
import { registry } from '../core/handler-registry.js';
import { eventBus } from '../core/event-bus.js';
import { Storage } from '../core/storage.js';
import { Telemetry } from '../core/telemetry.js';
import { initializeHandlers } from '../handlers/init.js';
import { CONSTANTS } from '../core/constants.js';

// Init background
async function init() {
  await initDebug();
  coreDebug.log('Background starting...');

  // Register handlers
  initializeHandlers();

  // Set up event listeners
  eventBus.on('problem:solved', handleSolved);

  coreDebug.log('Background initialized');
}

async function handleSolved(data) {
  coreDebug.log('Handling solve event', data);
  
  // 1. Save locally
  await Storage.saveProblem(data);
  
  // 2. AI Review (if enabled)
  const settings = await Storage.getSettings();
  if (settings.autoReview) {
    const providers = [settings.aiProvider || 'gemini', ...CONSTANTS.AI_FALLBACK_CHAIN];
    for (const providerId of providers) {
      try {
        const ai = registry.getAIProvider(providerId);
        if (ai) {
          const review = await ai.review(data.code, data);
          data.aiReview = review;
          await Storage.saveProblem(data);
          coreDebug.log(`AI Review success via ${providerId}`);
          break; // Success!
        }
      } catch (err) {
        coreDebug.error(`AI Review failed with ${providerId}, trying next...`, err);
      }
    }
  }

  // 3. Git Commit
  if (settings.gitEnabled) {
    try {
      const git = registry.getGitProvider(settings.gitProvider || 'github');
      
      let filesToCommit = [];
      if (data.files && Array.isArray(data.files)) {
         filesToCommit = [...data.files];
      } else {
         const filePath = `topics/${data.topic || 'Uncategorized'}/${data.titleSlug}/${data.lang.name}.${data.lang.ext || 'js'}`;
         filesToCommit.push({ path: filePath, content: data.code });
      }

      filesToCommit.push({ path: 'index.json', content: await buildIndexJson() });

      await git.commit(
        filesToCommit, 
        `[${data.topic}] ${data.title} solved`, 
        settings.gitRepo
      );
    } catch (err) {
      coreDebug.error('Git commit failed', err);
    }
  }

  Telemetry.track('solve', { platform: data.platform });
}

async function buildIndexJson() {
  const problems = await Storage.getAllProblems();
  const stats = {
    total: problems.length,
    easy: problems.filter(p => p.difficulty === 'Easy').length,
    medium: problems.filter(p => p.difficulty === 'Medium').length,
    hard: problems.filter(p => p.difficulty === 'Hard').length,
  };

  return JSON.stringify({ stats, problems }, null, 2);
}

chrome.runtime.onInstalled.addListener(() => {
  init();
  Telemetry.track('install');
});

init();
