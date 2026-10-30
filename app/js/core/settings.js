// Flute settings shared by the app and the Practice Bench.
// Stored in localStorage["bansuri.settings"]; always read and write through these functions.

const SETTINGS_KEY = "bansuri.settings";
export const SETTINGS_DEFAULTS = Object.freeze({ saNote: 0, saOct: 5, a4: 440, volume: 0.75, deva: false });
const settingsListeners = new Set();
let settingsCache = null;

function cleanSettings(s) {
  const n = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) && v >= lo && v <= hi ? v : d; };
  return {
    saNote: Math.round(n(s.saNote, 0, 11, SETTINGS_DEFAULTS.saNote)),
    saOct: Number(s.saOct) === 4 ? 4 : 5,
    a4: n(s.a4, 400, 480, SETTINGS_DEFAULTS.a4),
    volume: n(s.volume, 0, 1, SETTINGS_DEFAULTS.volume),
    deva: s.deva === true
  };
}

function readSettings() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(SETTINGS_KEY) : null;
    return cleanSettings(raw ? { ...SETTINGS_DEFAULTS, ...JSON.parse(raw) } : SETTINGS_DEFAULTS);
  } catch (e) {
    return { ...SETTINGS_DEFAULTS };
  }
}

export function getSettings() {
  if (!settingsCache) settingsCache = readSettings();
  return { ...settingsCache };
}

export function setSettings(patch) {
  settingsCache = cleanSettings({ ...getSettings(), ...patch });
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsCache)); } catch (e) { /* storage unavailable */ }
  const s = { ...settingsCache };
  settingsListeners.forEach(fn => { try { fn(s); } catch (e) { /* ignore listener errors */ } });
  return s;
}

export function onSettings(fn) {
  settingsListeners.add(fn);
  return () => settingsListeners.delete(fn);
}

export function saMidi() {
  const s = getSettings();
  return 12 * (s.saOct + 1) + s.saNote;
}

export function saHz() {
  return getSettings().a4 * Math.pow(2, (saMidi() - 69) / 12);
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", e => {
    if (e.key !== SETTINGS_KEY) return;
    settingsCache = null;
    const s = getSettings();
    settingsListeners.forEach(fn => { try { fn(s); } catch (x) { /* ignore */ } });
  });
}
