/* Just the Bits — offline shell service worker */
/* Bump CACHE version whenever you ship a new index.html so old caches clear. */
var CACHE = "bits-shell-v1";

/* The only things needed to open the app offline: the page itself and the
   Supabase library it loads from a CDN. Everything else is inline. */
var SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* addAll fails the whole install if any URL 404s; cache them
         individually so one miss can't brick the worker. */
      return Promise.all(SHELL.map(function (url) {
        return c.add(url).catch(function () { return null; });
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);

  /* Never cache Supabase API/auth/realtime traffic — that must always hit the
     network, and offline saves are already handled in localStorage. */
  if (url.hostname.indexOf("supabase.co") !== -1) return;

  /* Navigations (opening the app): network-first so you get updates online,
     fall back to the cached page when there's no signal. */
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put("./index.html", copy); });
        return res;
      }).catch(function () {
        return caches.match("./index.html").then(function (hit) {
          return hit || caches.match("./");
        });
      })
    );
    return;
  }

  /* Other GETs (the Supabase CDN script, icon): cache-first, then network. */
  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return hit; });
    })
  );
});
