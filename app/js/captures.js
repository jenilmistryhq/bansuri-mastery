// Recordings made or opened in Transcribe (#/transcribe), kept in this browser's IndexedDB so they
// can be opened again without saving a file: the sound, its name and length, and the notation
// last saved for it. Separate from the Journal's recordings; never uploaded. Up to MAX are kept.
const DB = "bansuri-transcribe", STORE = "captures";
export const MAX = 12;

function openDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) { reject(new Error("This browser cannot store recordings.")); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let t;
    try { t = db.transaction(STORE, mode); } catch (e) { db.close(); reject(e); return; }
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(out && "result" in out ? out.result : out); };
    t.onerror = () => { db.close(); reject(t.error || new Error("Storage error")); };
    t.onabort = () => { db.close(); reject(t.error || new Error("Storage is full or the save was interrupted.")); };
  });
}

// Newest first, without the sound (for the list).
export async function listCaptures() {
  const all = (await tx("readonly", s => s.getAll())) || [];
  return all.sort((a, b) => (a.created < b.created ? 1 : -1)).map(({ blob, ...rest }) => ({ ...rest, size: blob ? blob.size : 0 }));
}
export async function getCapture(id) { return tx("readonly", s => s.get(id)); }
export async function deleteCapture(id) { return tx("readwrite", s => s.delete(id)); }
export async function clearCaptures() { return tx("readwrite", s => s.clear()); }

// Saves a new capture; the oldest beyond MAX are removed. Resolves the stored record.
export async function addCapture(blob, name, seconds) {
  const rec = { id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, seconds: Math.round(seconds), created: new Date().toISOString(), blob, notation: null };
  await tx("readwrite", s => s.put(rec));
  const all = await listCaptures();
  for (const old of all.slice(MAX)) await deleteCapture(old.id);
  return rec;
}

// A capture from a backup, as it was (same id; the oldest beyond MAX are removed).
export async function putCapture(rec) {
  await tx("readwrite", s => s.put(rec));
  const all = await listCaptures();
  for (const old of all.slice(MAX)) await deleteCapture(old.id);
}

export async function patchCapture(id, patch) {
  const rec = await getCapture(id);
  if (!rec) return null;
  Object.assign(rec, patch);
  await tx("readwrite", s => s.put(rec));
  return rec;
}
