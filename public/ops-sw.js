// PSS Ops: shows a "you're offline" page when an admin page can't load. Caches nothing else.
const CACHE = "pss-ops-offline-v1";
const OFFLINE = "/ops-offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([OFFLINE])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.mode !== "navigate" || !new URL(request.url).pathname.startsWith("/admin")) return;
  // If the offline page was evicted, answer with a network error: respondWith must never get undefined.
  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE).then((r) => r || Response.error())));
});
