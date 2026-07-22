/* Just the Bits — service worker
 *
 * The old worker served the app shell from cache without ever checking the
 * network, so a deployed update could sit on the server indefinitely while
 * the installed app kept showing an older build.
 *
 * Two changes fix that for good:
 *   1. The HTML is fetched network-first. A fresh copy wins whenever you're
 *      online; the cache is only a fallback for offline.
 *   2. The cache name carries the version. On activate, every cache that
 *      isn't the current one is deleted, and the new worker takes over
 *      immediately instead of waiting for every tab to close.
 *
 * Bump CACHE on each release. Nothing else needs touching.
 */

var CACHE = "jtb-v1.2.5";

self.addEventListener("install", function (e) {
  // don't sit in "waiting" behind the old worker
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.map(function (n) {
          if (n !== CACHE) return caches.delete(n);
        })
      );
    }).then(function () {
      // control pages that are already open, without a reload
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;

  // Never touch anything but plain GETs, and leave cross-origin alone —
  // Supabase and the CDN scripts must go straight to the network.
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  var wantsHTML =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").indexOf("text/html") !== -1;

  if (wantsHTML) {
    // network first: the newest build always wins when there's a connection
    e.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (hit) {
            return hit || caches.match("./index.html") || caches.match("./");
          });
        })
    );
    return;
  }

  // everything else (icons, manifest): cache first, fill from network
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
