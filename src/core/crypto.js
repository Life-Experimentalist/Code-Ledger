/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from '../lib/debug.js';
const dbg = createDebugger('Crypto');

/**
 * Token encryption using Web Crypto API.
 */
export const Crypto = {
  async _getKey(password) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: enc.encode("codeledger-salt"), iterations: 100000, hash: "SHA-256" },
      keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  },

  async encrypt(text, password) {
    try {
      const key = await this._getKey(password);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(text);
      const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

      const combined = new Uint8Array(iv.length + ciphertext.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(ciphertext), iv.length);

      return btoa(String.fromCharCode(...combined));
    } catch (err) {
      dbg.error('Encryption failed', err);
      throw err;
    }
  },

  async decrypt(combinedB64, password) {
    try {
      const key = await this._getKey(password);
      const combined = new Uint8Array(atob(combinedB64).split("").map(c => c.charCodeAt(0)));
      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);

      const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
      return new TextDecoder().decode(decrypted);
    } catch (err) {
      dbg.error('Decryption failed', err);
      throw err;
    }
  }
};
