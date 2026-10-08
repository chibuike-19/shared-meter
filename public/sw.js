// Conservative service worker for Shared Meter.
// It makes the app installable and gives an offline fallback, but NEVER caches
// authenticated HTML, API responses, or Supabase data — so balances can't go
// stale or leak between users. Only hashed static assets are cached.

const CACHE = "smt-static-v1";
const PRECACHE = ["/offline.html", "/app-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
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
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Only handle our own origin; let Supabase/other hosts pass straight through.
  if (url.origin !== self.location.origin) return;

  // Never intercept auth or API routes.
  if (url.pathname.startsWith("/auth") || url.pathname.startsWith("/api")) return;

  // Page navigations: network-first, fall back to the offline page when down.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  // Immutable build assets + our icons: cache-first (safe, content-hashed).
  const isStatic =
    url.pathname.startsWith("/_next/static") ||
    url.pathname === "/app-icon.svg" ||
    url.pathname === "/offline.html";

  if (isStatic) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});
