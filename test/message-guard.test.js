/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression tests for the runtime-message sender partition.
 *
 * Before this guard existed, every one of the service worker's ~50 message
 * handlers answered anything that could call chrome.runtime.sendMessage —
 * including content scripts on five third-party platform domains. A subverted
 * content script could send RESET_REPO or RESTORE_GITHUB_BACKUP and destroy or
 * overwrite the user's committed work. These tests pin the boundary.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_SCRIPT_ALLOWED,
  isExtensionPageSender,
  isMessageAllowed,
} from "../src/lib/message-guard.js";

const EXT = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

/** The library page — an extension page that happens to live in a tab. */
const libraryPage = { url: `${EXT}/library/library.html`, tab: { id: 7 } };
/** A content script on a platform we inject into. */
const contentScript = { url: "https://leetcode.com/problems/two-sum/", tab: { id: 9 } };

/**
 * Handlers a content script must never be able to reach. Each one either
 * destroys the user's repository, overwrites their local data from a remote
 * source, or pulls settings (including AI endpoint URLs) down from the network.
 */
const DESTRUCTIVE = [
  "RESET_REPO",
  "FORCE_REBUILD_REPO",
  "MIGRATE_REPO",
  "RESTORE_GITHUB_BACKUP",
  "SYNC_SETTINGS_FROM_GITHUB",
  "SYNC_SETTINGS_TO_GITHUB",
  "FORCE_COMMIT_SETTINGS",
  "BACKUP_TO_REPO",
  "COMMIT_GITHUB_BACKUP_NOW",
  "LIST_GITHUB_BACKUPS",
  "REPO_REPAIR",
  "CODELEDGER_RUN_MIGRATIONS",
  "RESYNC_ALL",
  "REFRESH_INFRA",
  "SYNC_APPLY_IMPORT",
  "TRIGGER_CODE_RECOVERY",
];

describe("isExtensionPageSender", () => {
  test("accepts our own extension page", () => {
    assert.equal(isExtensionPageSender(libraryPage, EXT), true);
  });

  test("a content script is not an extension page even though it has a tab", () => {
    assert.equal(isExtensionPageSender(contentScript, EXT), false);
  });

  test("rejects a different extension's origin", () => {
    const other = { url: "chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba/x.html" };
    assert.equal(isExtensionPageSender(other, EXT), false);
  });

  test("rejects a page whose URL merely contains the extension origin", () => {
    const spoof = { url: `https://evil.test/?u=${EXT}/library/library.html` };
    assert.equal(isExtensionPageSender(spoof, EXT), false);
  });

  test("rejects a sender with no URL", () => {
    assert.equal(isExtensionPageSender({ tab: { id: 1 } }, EXT), false);
    assert.equal(isExtensionPageSender(undefined, EXT), false);
  });

  test("an unparseable sender URL is rejected rather than throwing", () => {
    assert.equal(isExtensionPageSender({ url: "not a url" }, EXT), false);
  });

  test("an empty extension origin never matches", () => {
    assert.equal(isExtensionPageSender(libraryPage, ""), false);
  });
});

describe("isMessageAllowed — extension pages", () => {
  test("an extension page may send anything, including the destructive set", () => {
    for (const type of DESTRUCTIVE) {
      assert.equal(isMessageAllowed(type, libraryPage, EXT), true, `${type} from library page`);
    }
  });
});

describe("isMessageAllowed — content scripts", () => {
  test("every destructive handler is refused", () => {
    for (const type of DESTRUCTIVE) {
      assert.equal(
        isMessageAllowed(type, contentScript, EXT),
        false,
        `${type} must not be reachable from a content script`,
      );
    }
  });

  test("the handlers content scripts genuinely use still work", () => {
    for (const type of CONTENT_SCRIPT_ALLOWED) {
      assert.equal(isMessageAllowed(type, contentScript, EXT), true, `${type} from content script`);
    }
  });

  test("an unknown message type is refused rather than allowed by default", () => {
    assert.equal(isMessageAllowed("SOME_FUTURE_HANDLER", contentScript, EXT), false);
  });

  test("a missing or non-string type is refused", () => {
    assert.equal(isMessageAllowed(undefined, contentScript, EXT), false);
    assert.equal(isMessageAllowed("", contentScript, EXT), false);
    assert.equal(isMessageAllowed({ toString: () => "OPEN_LIBRARY" }, contentScript, EXT), false);
  });
});

describe("the allowlist itself", () => {
  test("contains no destructive handler", () => {
    for (const type of DESTRUCTIVE) {
      assert.ok(
        !CONTENT_SCRIPT_ALLOWED.includes(type),
        `${type} was added to CONTENT_SCRIPT_ALLOWED — read the warning in message-guard.js`,
      );
    }
  });

  test("has no duplicates", () => {
    assert.equal(new Set(CONTENT_SCRIPT_ALLOWED).size, CONTENT_SCRIPT_ALLOWED.length);
  });
});
