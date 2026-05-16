/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CONSTANTS } from "./constants.js";
import { storage } from "../lib/browser-compat.js";
import { createDebugger } from "../lib/debug.js";
const dbg = createDebugger("CanonicalMapper");

function normalizeCanonicalEntries(json) {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.entries)) return json.entries;
    return [];
}

function normalizeAliases(entry) {
    if (!entry || typeof entry !== "object") return [];

    if (Array.isArray(entry.aliases)) {
        return entry.aliases.filter((alias) => alias?.platform && alias?.slug);
    }

    if (entry.platforms && typeof entry.platforms === "object") {
        return Object.entries(entry.platforms)
            .filter(([, slug]) => !!slug)
            .map(([platform, slug]) => ({ platform, slug }));
    }

    if (entry.aliases && typeof entry.aliases === "object") {
        return Object.entries(entry.aliases)
            .filter(([, slug]) => !!slug)
            .map(([platform, slug]) => ({ platform, slug }));
    }

    return [];
}

class CanonicalMapper {
    constructor() {
        this.map = new Map();
        this.lastFetch = 0;
    }

    async loadMap() {
        dbg.log(`loadMap(): fetching canonical map`);
        const cached = await storage.local.get([
            CONSTANTS.SK.CANONICAL_MAP_CACHE,
            CONSTANTS.SK.CANONICAL_MAP_ETAG,
        ]);
        const etag = cached[CONSTANTS.SK.CANONICAL_MAP_ETAG];
        const data = cached[CONSTANTS.SK.CANONICAL_MAP_CACHE];

        if (
            data &&
            Date.now() - this.lastFetch < CONSTANTS.CANONICAL_CACHE_TTL_MS
        ) {
            dbg.log(
                `loadMap(): ✓ using cached data (${this.map.size} entries)`
            );
            await this.populate(data);
            return;
        }

        const headers = etag ? { "If-None-Match": etag } : {};
        const urls = [
            CONSTANTS.URLS.CANONICAL_MAP,
            CONSTANTS.URLS.CANONICAL_MAP_RAW,
        ];
        let res = null;

        for (const url of urls) {
            try {
                res = await fetch(url, { headers });
                if (res.ok || res.status === 304) break;
            } catch (_) {
                res = null;
            }
        }

        try {
            if (res?.status === 304 && data) {
                this.lastFetch = Date.now();
                await this._mergeLocalEntries();
                return;
            }

            if (res?.ok) {
                const json = await res.json();
                const newEtag = res.headers.get("ETag");
                await storage.local.set({
                    [CONSTANTS.SK.CANONICAL_MAP_CACHE]: json,
                    [CONSTANTS.SK.CANONICAL_MAP_ETAG]: newEtag,
                });
                dbg.log(
                    `loadMap(): ✓ loaded remote map (entries: ${normalizeCanonicalEntries(json).length})`
                );
                await this.populate(json);
                this.lastFetch = Date.now();
            }
        } catch (err) {
            dbg.error("Failed to load canonical map", err);
            if (data) await this.populate(data);
        }
    }

    async populate(json) {
        this.map.clear();
        let aliasCount = 0;
        for (const entry of normalizeCanonicalEntries(json)) {
            this.map.set(entry.canonicalId, entry);
            for (const alias of normalizeAliases(entry)) {
                this.map.set(`${alias.platform}:${alias.slug}`, entry);
                aliasCount++;
            }
        }
        dbg.log(
            `populate(): ✓ loaded ${this.map.size} CDN entries (${aliasCount} aliases)`
        );
        await this._mergeLocalEntries();
    }

    async _mergeLocalEntries() {
        try {
            const res = await storage.local.get(CONSTANTS.SK.CANONICAL_LOCAL_ENTRIES);
            const local = res[CONSTANTS.SK.CANONICAL_LOCAL_ENTRIES];
            if (!Array.isArray(local) || local.length === 0) return;
            let added = 0;
            for (const entry of local) {
                if (!entry.canonicalId) continue;
                this.map.set(entry.canonicalId, entry);
                for (const alias of normalizeAliases(entry)) {
                    this.map.set(`${alias.platform}:${alias.slug}`, entry);
                }
                added++;
            }
            dbg.log(`_mergeLocalEntries(): ✓ merged ${added} local entries`);
        } catch (e) {
            dbg.warn("_mergeLocalEntries(): failed (non-blocking):", e?.message);
        }
    }

    /**
     * Resolves a platform-specific problem to its canonical identity.
     */
    resolve(platform, slug) {
        return this.map.get(`${platform}:${slug}`) || null;
    }

    getById(id) {
        return this.map.get(id) || null;
    }
}

export const canonicalMapper = new CanonicalMapper();
