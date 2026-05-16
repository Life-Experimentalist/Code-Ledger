/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const QUERIES = {
    QUESTION: `
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        questionFrontendId
        title
        titleSlug
        content
        isPaidOnly
        difficulty
        likes
        dislikes
        stats
        hints
        topicTags {
          name
          slug
        }
        similarQuestionList {
          difficulty
          titleSlug
          title
          isPaidOnly
        }
        codeSnippets {
          lang
          langSlug
          code
        }
        companyTagStats
        acRate
      }
    }
  `,

    SUBMISSION_DETAIL: `
    query submissionDetails($submissionId: Int!) {
      submissionDetails(submissionId: $submissionId) {
        runtime
        runtimeDisplay
        runtimePercentile
        memory
        memoryDisplay
        memoryPercentile
        code
        timestamp
        notes
        lang {
          name
          verboseName
        }
        topicTags {
          name
          slug
        }
      }
    }
  `,

    SUBMISSION_LIST: `
    query submissionList($offset: Int!, $limit: Int!, $lastKey: String, $questionSlug: String!) {
      questionSubmissionList(
        offset: $offset
        limit: $limit
        lastKey: $lastKey
        questionSlug: $questionSlug
      ) {
        lastKey
        hasNext
        submissions {
          id
          statusDisplay
          lang
          timestamp
        }
      }
    }
  `,

    // Fetches the currently logged-in user's username
    GLOBAL_DATA: `
    query globalData {
      userStatus {
        isSignedIn
        username
        avatar
        isPremium
      }
    }
  `,

    // Daily challenge — for QoL banner
    DAILY_CHALLENGE: `
    query questionOfToday {
      activeDailyCodingChallengeQuestion {
        date
        link
        question {
          questionFrontendId
          title
          titleSlug
          difficulty
          topicTags {
            name
          }
        }
      }
    }
  `,
};
