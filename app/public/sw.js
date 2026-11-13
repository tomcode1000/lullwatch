// Lullwatch offline worker. The timer, forecast and warning signs run on her
// phone, so once the app has loaded they keep working without a connection.
// Never cached: anything under /api (the AI, voice, attestation) and the
// Intel and NVIDIA checks, which must always be fresh.

const CACHE = "lullwatch-v2";
const SHELL = ["/app/", "/", "/favicon.svg", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];
// Each page is saved under one key, whatever its query (?sample, ?proof).
const pageKey = (url) => (url.pathname.startsWith("/app") ? "/app/" : "/");
const FONTS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

const put = (req, res) => caches.open(CACHE).then((c) => c.put(req, res));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (req.method !== "GET" || (same && url.pathname.startsWith("/api/"))) return;
  if (!same && !FONTS.includes(url.origin)) return;

  // The page: network first so updates arrive, the saved copy when offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) put(pageKey(url), res.clone());
          return res;
        })
        .catch(() => caches.match(pageKey(url))),
    );
    return;
  }

  // Build files and fonts: saved copy first, then the network.
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok || res.type === "opaque") put(req, res.clone());
          return res;
        }),
    ),
  );
});
