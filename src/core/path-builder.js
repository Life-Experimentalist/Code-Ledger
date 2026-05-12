/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Centralised problem-path computation — layout v2.
 *
 * No canonical:   problems/{slug}/{slug}.{ext}
 * With canonical: problems/{slug}/{platform}/{slug}.{ext}
 * README:         problems/{slug}/README.md   (always, no platform subdir)
 * Hints:          problems/{slug}/hints.md    (always, no platform subdir)
 */

/** Increment when the directory layout changes. Stored in index.json. */
export const LAYOUT_VERSION = 2;

/** Base directory for a problem. Directory name is always id (or canonicalId if set). */
export function problemBase(id, canonical, settings = {}) {
    const root = CONSTANTS.PROBLEMS_DIR_DEFAULT.replace(/\/+$/, "");
    const dir = canonical?.canonicalId || id;
    return `${root}/${dir}`;
}

/**
 * Full path for the solution file.
 *
 * canonical present  → base/{platform}/{slug}.{ext}   (platform subdir for multi-platform problems)
 * canonical absent   → base/{slug}.{ext}              (no subdir — single platform only)
 *
 * The file is ALWAYS named after the problem slug, not the language verbose name.
 * Multiple languages for the same problem produce sibling files: two-sum.py, two-sum.js.
 */
export function solutionPath(
    id,
    platform,
    lang,
    canonical,
    settings = {},
    methodTitle = ""
) {
    const base = problemBase(id, canonical, settings);
    const slug = canonical?.canonicalId || id;
    const ext = lang.ext || "txt";
    const sanitized = String(methodTitle || "")
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
    const method = sanitized ? "-" + sanitized : "";
    const fileName = `${slug}${method}.${ext}`;
    if (canonical?.canonicalId) {
        return `${base}/${platform}/${fileName}`;
    }
    return `${base}/${fileName}`;
}

/** README is always at the problem base, never inside a platform subdir. */
export function readmePath(id, canonical, settings = {}) {
    return `${problemBase(id, canonical, settings)}/README.md`;
}

/** Hints file is always at the problem base, never inside a platform subdir. */
export function hintsPath(id, canonical, settings = {}) {
    return `${problemBase(id, canonical, settings)}/hints.md`;
}

/**
 * Build the complete file list for a solved problem from its stored record.
 * Used by service-worker for resync/pending commits.
 *
 * Includes: code, README, hints, and a metadata JSON file with AI review, tags, difficulty, etc.
 *
 * @param {object} problem  — stored problem record
 * @param {object} settings — user settings
 * @returns {Array<{path: string, content: string}>}
 */
export function buildProblemFiles(problem, settings = {}) {
    if (Array.isArray(problem?.files) && problem.files.length > 0) {
        // Use pre-built files array, but also add metadata if available
        const files = problem.files
            .filter(
                (f) =>
                    f &&
                    typeof f.path === "string" &&
                    typeof f.content === "string"
            )
            .map((f) => ({ path: f.path, content: f.content }));

        // Add metadata file
        if (
            problem.aiReview ||
            problem.tags ||
            problem.difficulty ||
            Array.isArray(problem.methods)
        ) {
            const meta = {
                id: problem.id || problem.titleSlug,
                title: problem.title,
                platform: problem.platform,
                difficulty: problem.difficulty,
                tags: problem.tags || [],
                aiReview: problem.aiReview || null,
                timestamp: problem.timestamp,
                elapsedSeconds: problem.elapsedSeconds || 0,
                isDuplicate: problem.isDuplicate || false,
                duplicateOf: problem.duplicateOf || null,
                methods: Array.isArray(problem.methods)
                    ? problem.methods.map((m) => ({
                          title: m.title,
                          language: m.language,
                          description: m.description || "",
                          timestamp: m.timestamp,
                      }))
                    : [],
            };
            const base = problemBase(
                problem.id || problem.titleSlug,
                problem.canonical,
                settings
            );
            files.push({
                path: `${base}/.meta.json`,
                content: JSON.stringify(meta, null, 2),
            });
        }
        return files;
    }

    const canonical = problem.canonical || null;
    const lang = problem.lang || {
        verbose: "Solution",
        name: "solution",
        ext: "txt",
    };
    const ext = lang.ext || "txt";
    const normalLang = {
        verbose: lang.verbose || lang.name || "Solution",
        name: lang.name || "solution",
        ext,
    };
    const id = problem.id || problem.titleSlug || "unknown"; // platform-scoped
    const files = [];

    if (problem.code) {
        files.push({
            path: solutionPath(
                id,
                problem.platform || "unknown",
                normalLang,
                canonical,
                settings,
                problem.methodTitle
            ),
            content: problem.code,
        });
    }
    if (problem.readmeContent) {
        files.push({
            path: readmePath(id, canonical, settings),
            content: problem.readmeContent,
        });
    }
    if (problem.hintsContent) {
        files.push({
            path: hintsPath(id, canonical, settings),
            content: problem.hintsContent,
        });
    }

    // Add metadata file with AI review and other metadata
    if (
        problem.aiReview ||
        problem.tags ||
        problem.difficulty ||
        Array.isArray(problem.methods)
    ) {
        const meta = {
            id: problem.id || problem.titleSlug,
            title: problem.title,
            platform: problem.platform,
            difficulty: problem.difficulty,
            tags: problem.tags || [],
            aiReview: problem.aiReview || null,
            timestamp: problem.timestamp,
            elapsedSeconds: problem.elapsedSeconds || 0,
            isDuplicate: problem.isDuplicate || false,
            duplicateOf: problem.duplicateOf || null,
            methods: Array.isArray(problem.methods)
                ? problem.methods.map((m) => ({
                      title: m.title,
                      language: m.language,
                      description: m.description || "",
                      timestamp: m.timestamp,
                  }))
                : [],
        };
        const base = problemBase(id, canonical, settings);
        files.push({
            path: `${base}/.meta.json`,
            content: JSON.stringify(meta, null, 2),
        });
    }

    return files;
}

/**
 * Rebase a file path from oldBase to newBase.
 * Used during canonical-ID reassignment to compute rename targets.
 */
export function rebasePath(oldPath, oldBase, newBase) {
    if (!oldPath.startsWith(oldBase + "/")) return oldPath;
    const rel = oldPath.slice(oldBase.length + 1);
    return `${newBase}/${rel}`;
}
