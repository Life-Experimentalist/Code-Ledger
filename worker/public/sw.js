/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CodeLedger landing-page service worker — the minimum a PWA install needs.
 *
 * The app window is just this landing page: the extension's content script
 * still runs inside it, so the "Open Library" relay works exactly as in a
 * normal tab. Nothing dynamic lives here, so the strategy is deliberately
 * boring:
 *
 *   - navigations:  network-first, falling back to the cached shell offline
 *   - same-origin static assets: cache-first, filled on first fetch
 *   - /api/* is NEVER touched — OAuth and health checks must always hit the
 *     network, and caching a callback page would replay a token
 */

const CACHE = "codeledger-static-v1";
const SHELL = [
  "/",
  "/assets/landing.css",
  "/assets/landing.js",
  "/assets/icon-128.png",
  "/assets/icon-288.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // always live — see header comment

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request).then((hit) => hit || caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ||
        fetch(event.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return res;
        }),
    ),
  );
});
