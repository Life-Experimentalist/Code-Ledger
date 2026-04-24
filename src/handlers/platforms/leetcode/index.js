/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasePlatformHandler } from '../../_base/BasePlatformHandler.js';
import { SELECTORS } from './dom-selectors.js';
import { detectPage } from './page-detector.js';
import { QUERIES } from './graphql-queries.js';
import { eventBus } from '../../../core/event-bus.js';
import { injectQoL } from './qol.js';
import { Storage } from '../../../core/storage.js';

export class LeetCodeHandler extends BasePlatformHandler {
  constructor() {
    super('leetcode', 'LeetCode', {});
    this.mutationObserver = null;
    this.lastDetectedId = null;
  }

  getSettingsSchema() {
    return {
      id: this.id,
      title: 'LeetCode Integration',
      order: 10,
      description: 'Configure automated submission tracking for LeetCode.',
      fields: [
        {
          key: 'leetcode_enable',
          label: 'Enable Tracking',
          type: 'toggle',
          default: true,
          description: 'Automatically track successful LeetCode submissions.'
        },
        {
          key: 'leetcode_sync_hints',
          label: 'Sync Hints',
          type: 'toggle',
          default: false,
          description: 'Include official hints in the repository as a separate file.'
        }
      ]
    };
  }

  async init() {
    this.dbg.log('Initializing LeetCode handler');
    this.setupMutationObserver();

    // Check if we are on a problem page to inject QoL features
    const pageInfo = detectPage(window.location.pathname);
    if (pageInfo.type === 'problem') {
      setTimeout(() => {
        const editor = this.safeQuery(SELECTORS.qol.editorContainer);
        if (editor) {
          this.dbg.log('Injecting QoL features into editor');
          injectQoL(editor, SELECTORS);
        }
      }, 2500); // Give the editor time to mount via React
    }
  }

  setupMutationObserver() {
    this.mutationObserver = new MutationObserver(() => {
      this.checkSubmission();
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async checkSubmission() {
    const successEl = this.safeQuery(SELECTORS.submission.successIndicator);
    if (!successEl || successEl.innerText.toLowerCase() !== 'accepted') return;

    // Throttle duplicate detections
    const pageInfo = detectPage(window.location.pathname);
    if (pageInfo.slug === this.lastDetectedId) return;

    this.dbg.log('Solve detected!', pageInfo.slug);
    this.lastDetectedId = pageInfo.slug;

    try {
      const metadata = await this.getProblemMetadata(pageInfo.slug);
      const submission = await this.getLatestSubmission(pageInfo.slug);

      const settings = await Storage.getSettings();
      const topic = metadata.topicTags?.[0]?.name || 'Uncategorized';
      const basePath = `topics/${topic}/${metadata.titleSlug}/`;
      const codeExt = submission.lang.name || 'js';
      
      const files = [
        { path: `${basePath}${submission.lang.verboseName || 'Solution'}.${codeExt}`, content: submission.code }
      ];

      // Add README.md with problem description
      if (metadata.content) {
        // Strip out some HTML if necessary or just save as markdown
        const mdContent = `# ${metadata.title}\n\n${metadata.content}`;
        files.push({ path: `${basePath}README.md`, content: mdContent });
      }

      // Add hints if enabled
      if (settings.leetcode_sync_hints && metadata.hints && metadata.hints.length > 0) {
        const hintsMd = `# Hints for ${metadata.title}\n\n` + metadata.hints.map((h, i) => `### Hint ${i + 1}\n${h}\n`).join('\n');
        files.push({ path: `${basePath}Hints.md`, content: hintsMd });
      }

      eventBus.emit('problem:solved', {
        platform: 'leetcode',
        id: metadata.questionId,
        title: metadata.title,
        titleSlug: metadata.titleSlug,
        difficulty: metadata.difficulty,
        topic: topic,
        tags: metadata.topicTags?.map(t => t.name) || [],
        code: submission.code, // keep code for the UI and AI review
        files: files, // specific atomic commit files
        lang: {
          name: submission.lang.verboseName,
          ext: submission.lang.name
        },
        runtime: submission.runtime,
        memory: submission.memory,
        timestamp: submission.timestamp || Math.floor(Date.now() / 1000)
      });
    } catch (err) {
      this.dbg.error('Failed to process submission', err);
    }
  }

  async getProblemMetadata(slug) {
    const res = await this.fetchGraphQL(QUERIES.QUESTION, { titleSlug: slug });
    return res.data.question;
  }

  async getLatestSubmission(slug) {
    // LeetCode's Accepted status ID is typically 10 (though they use string 'Accepted' in display normally)
    const res = await this.fetchGraphQL(QUERIES.SUBMISSION_LIST, {
      offset: 0,
      limit: 1,
      questionSlug: slug
    });
    
    if (!res.data.questionSubmissionList.submissions.length) {
      throw new Error('No submissions found');
    }

    // Find the first accepted submission or just the first if latest
    const sub = res.data.questionSubmissionList.submissions.find(s => s.statusDisplay === 'Accepted') 
                || res.data.questionSubmissionList.submissions[0];

    // Get strictly code payload
    const detail = await this.fetchGraphQL(QUERIES.SUBMISSION_DETAIL, {
      submissionId: parseInt(sub.id)
    });

    return detail.data.submissionDetails;
  }

  async fetchGraphQL(query, variables) {
    // Relative path to avoid CORS issues within the content script
    const res = await fetch('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    });
    const parsed = await res.json();
    if (parsed.errors) throw new Error(parsed.errors[0].message);
    return parsed;
  }
}
