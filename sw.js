// Service worker: keeps the app and the whole course available offline.
// VERSION is rewritten by scripts/build_app.py whenever any app or course file changes.
const VERSION = "7f5c3c798032";
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
    // First the app itself and the pages every screen needs; the rest of the course follows in the
    // background once the app is open (see "CACHE_REST"), so the first visit is quick.
    const core = list.docs.filter(d => /^(README|05-|06-)/.test(d.path) || d.path === "ragas/README.md" || d.path === "exercises/EX-MEL-practice-melodies.md");
    const urls = ["./", "index.html", "manifest.webmanifest", "app/data/files.json"].concat(list.assets, core.map(d => "bansuri-mastery/" + d.path));
    await cache.addAll(urls.map(u => new Request(u, { cache: "reload" })));
    // Network-first pages never depend on this worker's cache while online, so it can take over at once.
    await self.skipWaiting();
  })());
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
  // The rest of the course, a few pages at a time, without slowing the app down.
  if (event.data && event.data.type === "CACHE_REST") event.waitUntil(cacheRest());
});

// Daily reminder (see app/js/reminder.js): woken by the browser now and then; reminds once a day,
// after the chosen time, only if there is no practice logged for today.
function metaGet(key) {
  return new Promise(resolve => {
    const r = indexedDB.open("bansuri-meta", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onerror = () => resolve(undefined);
    r.onsuccess = () => { const d = r.result, g = d.transaction("kv").objectStore("kv").get(key); g.onsuccess = () => { resolve(g.result); d.close(); }; g.onerror = () => { resolve(undefined); d.close(); }; };
  });
}
function metaPut(key, value) {
  return new Promise(resolve => {
    const r = indexedDB.open("bansuri-meta", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onerror = () => resolve();
    r.onsuccess = () => { const d = r.result, t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(value, key); t.oncomplete = () => { d.close(); resolve(); }; };
  });
}
async function maybeRemind() {
  const rem = await metaGet("reminder");
  if (!rem || !rem.on) return;
  const now = new Date(), day = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  const [hh, mm] = String(rem.time || "18:00").split(":").map(Number);
  if (now.getHours() * 60 + now.getMinutes() < hh * 60 + mm) return;
  if ((await metaGet("lastPractice")) === day || (await metaGet("lastReminded")) === day) return;
  await metaPut("lastReminded", day);
  await self.registration.showNotification("Time to practise", { body: "Your bansuri is waiting: even 5 minutes keeps the streak going.", icon: "app/icon.svg", badge: "app/icon.svg", tag: "practice-reminder" });
}
self.addEventListener("periodicsync", event => { if (event.tag === "practice-reminder") event.waitUntil(maybeRemind()); });
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window" });
    if (all.length) { all[0].focus(); all[0].navigate(self.registration.scope + "#/today").catch(() => {}); }
    else await self.clients.openWindow(self.registration.scope + "#/today");
  })());
});

async function cacheRest() {
  const cache = await caches.open(CACHE);
  const list = await (await fetch("app/data/files.json")).json();
  const todo = [];
  for (const d of list.docs) { const u = "bansuri-mastery/" + d.path; if (!(await cache.match(u))) todo.push(u); }
  for (let i = 0; i < todo.length; i += 6) {
    await Promise.all(todo.slice(i, i + 6).map(u => fetch(u, { cache: "no-cache" }).then(r => r.ok ? cache.put(u, r) : null).catch(() => null)));
  }
}

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("bansuri-") && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// Pages are served cross-origin isolated (COOP same-origin, COEP credentialless), which GitHub
// Pages cannot set itself: it lets the separation model (Transcribe) use several processor
// threads. The app loads nothing cross-origin that this blocks (models come by CORS fetch).
function isolated(res) {
  if (!res || res.type === "opaque" || res.status === 0) return res;
  const h = new Headers(res.headers);
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Cross-Origin-Embedder-Policy", "credentialless");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

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
    // Pages and worker scripts carry the isolation headers (a worker started by an isolated page must too).
    const page = req.mode === "navigate" || req.destination === "worker" ? isolated : r => r;
    try {
      const res = await fetchSoon(req, rel.startsWith("docs/") ? 8000 : 4000);
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return page(res);
    } catch (e) {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return page(cached);
      if (req.mode === "navigate") { const shell = await cache.match("index.html"); if (shell) return isolated(shell); }
      if (rel.startsWith("docs/")) return new Response("You are offline and this page is not saved yet. The app itself works offline: go back to the app.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      throw e;
    }
  })());
});
