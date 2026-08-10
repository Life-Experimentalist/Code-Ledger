/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ambient globals the extension runs against but no @types package declares.
 */

/**
 * Firefox exposes the WebExtension API as `browser` and Chrome as `chrome`.
 * Every use in this codebase is guarded by `typeof browser !== "undefined"`,
 * so it is declared as possibly-undefined to keep that guard meaningful.
 */
declare const browser: typeof chrome | undefined;
