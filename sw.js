// Service worker: keeps the app and the whole course available offline.
// VERSION is rewritten by scripts/build_app.py whenever any app or course file changes.
const VERSION = "b52fd79ee14b";
const CACHE = "bansuri-" + VERSION;

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const res = await fetch("app/data/files.json", { cache: "no-cache" });
    const list = await res.json();
    const urls = ["./", "index.html", "manifest.webmanifest", "app/data/files.json"].concat(list.assets, list.docs.map(d => "bansuri-mastery/" + d.path));
    await cache.addAll(urls.map(u => new Request(u, { cache: "reload" })));
  })());
});

// A new version waits until the learner chooses to update, so an open page never mixes old and new modules.
self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("bansuri-") && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // The MkDocs reference site under docs/ is always fetched fresh (falling back to cache).
  const scope = new URL(self.registration.scope);
  const rel = url.pathname.slice(scope.pathname.length);
  if (rel.startsWith("docs/")) {
    event.respondWith(fetch(req).then(r => {
      if (r.ok && r.type === "basic") { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return r;
    }).catch(async () => (await caches.match(req)) || new Response("You are offline and this page is not saved yet. The app itself works offline: go back to the app.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })));
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    } catch (e) {
      if (req.mode === "navigate") { const shell = await caches.match("index.html"); if (shell) return shell; }
      throw e;
    }
  })());
});
