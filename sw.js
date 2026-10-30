// Service worker: keeps the app and the whole course available offline.
// VERSION is rewritten by scripts/build_app.py whenever any app or course file changes.
const VERSION = "eabe86ab4c29";
const CACHE = "bansuri-" + VERSION;
const VOICE_CACHE = "voice-clips-v1";

// Online, every file comes from the network (and refreshes the cache); offline, from the cache.
// So a page is built either all from the new files or all from the saved ones, never a mix of
// versions (a mix breaks ES modules: a new module can import something an old one lacks).
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const res = await fetch("app/data/files.json", { cache: "no-cache" });
    const list = await res.json();
    const urls = ["./", "index.html", "manifest.webmanifest", "app/data/files.json"].concat(list.assets, list.docs.map(d => "bansuri-mastery/" + d.path));
    await cache.addAll(urls.map(u => new Request(u, { cache: "reload" })));
    // Network-first pages never depend on this worker's cache while online, so it can take over at once.
    await self.skipWaiting();
  })());
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("bansuri-") && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// A network request that gives up after a few seconds, so a weak connection falls back to the cache.
function fetchSoon(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(req, { cache: "no-cache" }).then(r => { clearTimeout(t); resolve(r); }, e => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  const rel = url.pathname.slice(scope.pathname.length);
  // Voice clips never change (their names are hashes of their text), so they are kept across
  // updates in their own cache: from the cache when saved, otherwise fetched and saved.
  if (rel.startsWith("app/voice/") && rel.endsWith(".mp3")) {
    event.respondWith((async () => {
      const cache = await caches.open(VOICE_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) await cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  event.respondWith((async () => {
    try {
      const res = await fetchSoon(req, rel.startsWith("docs/") ? 8000 : 4000);
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    } catch (e) {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === "navigate") { const shell = await cache.match("index.html"); if (shell) return shell; }
      if (rel.startsWith("docs/")) return new Response("You are offline and this page is not saved yet. The app itself works offline: go back to the app.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      throw e;
    }
  })());
});
