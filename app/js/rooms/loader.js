const cache = new Map();

export async function loadRoom(id) {
  if (cache.has(id)) return cache.get(id);
  const res = await fetch("app/data/rooms/" + id + ".json");
  if (!res.ok) return null;
  const room = await res.json();
  room.id = room.id || id;
  cache.set(id, room);
  return room;
}

export async function loadRoomIndex() {
  const res = await fetch("app/data/rooms/index.json");
  if (!res.ok) return [];
  return res.json();
}

let pathsCache = null;
export async function loadPaths() {
  if (pathsCache) return pathsCache;
  const res = await fetch("app/data/rooms/paths.json");
  if (!res.ok) return [];
  pathsCache = await res.json();
  return pathsCache;
}

export function clearRoomCache() { cache.clear(); pathsCache = null; }
