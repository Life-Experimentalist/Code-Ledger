#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Placeholder — the GFG CLI importer is not implemented yet.
 *
 * The supported GFG bulk-import path is the extension itself: open your own
 * GFG profile page with the extension loaded and press "Import All Solves"
 * (src/handlers/platforms/geeksforgeeks/profile-import.js). It reads the
 * profile's __NEXT_DATA__, resolves real solve dates from the month-scoped
 * submissions API, dedupes against the library, and saves via BULK_IMPORT.
 *
 * A CLI equivalent would mirror dev/import-profile/leetcode-importer.js.
 */

console.error(
  'gfg-importer: not implemented. Use the extension\'s "Import All Solves" button ' +
    "on your GFG profile page instead (see src/handlers/platforms/geeksforgeeks/profile-import.js).",
);
process.exit(1);
