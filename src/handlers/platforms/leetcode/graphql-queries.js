/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const QUERIES = {
  // Fetches problem details via slug
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
        topicTags {
          name
          slug
        }
        stats
        hints
      }
    }
  `,

  // Fetches detailed submission info including code
  SUBMISSION_DETAIL: `
    query submissionDetails($submissionId: Int!) {
      submissionDetails(submissionId: $submissionId) {
        runtime
        runtimeDisplay
        runtimePercentile
        runtimeDistribution
        memory
        memoryDisplay
        memoryPercentile
        memoryDistribution
        code
        timestamp
        statusCode
        statusDisplay
        lang {
          name
          verboseName
        }
        question {
          questionId
          titleSlug
        }
      }
    }
  `,

  // Fetches recent submissions list
  SUBMISSION_LIST: `
    query submissionList($offset: Int!, $limit: Int!, $lastKey: String, $questionSlug: String!, $status: Int) {
      questionSubmissionList(
        offset: $offset
        limit: $limit
        lastKey: $lastKey
        questionSlug: $questionSlug
        status: $status
      ) {
        lastKey
        hasNext
        submissions {
          id
          title
          titleSlug
          status
          statusDisplay
          lang
          langName
          runtime
          timestamp
          url
          isPending
          memory
          hasCompileError
        }
      }
    }
  `,

  // Fetches the user's public profile and stats
  USER_PROFILE: `
    query getUserProfile($username: String!) {
      allQuestionsCount {
        difficulty
        count
      }
      matchedUser(username: $username) {
        contributions {
          points
        }
        profile {
          reputation
          ranking
        }
        submissionCalendar
        submitStats {
          acSubmissionNum {
            difficulty
            count
            submissions
          }
          totalSubmissionNum {
            difficulty
            count
            submissions
          }
        }
      }
    }
  `
};

