/**
 * Kladra's service worker. It does one thing: show a splash when the phone has
 * no signal (SPEC §3 — offline splash only, no offline data).
 *
 * Nothing about a customer is cached, ever. A rep who opens the app in a
 * basement and reads a follow-up date from last week, acts on it, and finds out
 * later is worse off than a rep who is told plainly that he is offline. So:
 *
 * - Only NAVIGATIONS are intercepted. Scripts, styles, images and every fetch
 *   the app makes go straight to the network, exactly as if this file were not
 *   here.
 * - Even a navigation goes to the network FIRST. The cached page is what a
 *   failure falls back to, not what a request is answered from — so a screen is
 *   never a stale copy of itself.
 * - The cache holds two files: the splash and the mark on it.
 *
 * Bump CACHE to retire an old one; `activate` deletes every cache that is not
 * the current name, so an old splash cannot outlive a deploy.
 */

const CACHE = "kladra-shell-v1";
const OFFLINE = "/offline.html";
const SHELL = [OFFLINE, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      // The splash is worth having on the very first offline moment, not the
      // second, so this worker does not wait for every tab to close first.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // A navigation is a person asking for a screen. Everything else — the app's
  // own data, its assets, the live-updates stream — is none of this worker's
  // business and is left alone.
  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      const splash = await cache.match(OFFLINE);
      return (
        splash ??
        new Response("Kladra is offline.", {
          status: 503,
          headers: { "content-type": "text/plain; charset=utf-8" },
        })
      );
    }),
  );
});
