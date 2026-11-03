// Flute settings shared by the app and the Practice Bench.
// Stored in localStorage["bansuri.settings"]; always read and write through these functions.

const SETTINGS_KEY = "bansuri.settings";
// Accessibility and language settings live here too, because the shared widgets read them:
// lang (en | hi), talk (speak prompts and feedback), notesAs (letters | pictures), simple (Simple mode),
// textSize (1 = normal), easyFont, contrast, beatFlash, vibrate, gameSpeed (slow | normal | fast),
// noTimer (games without a clock), bigTargets, cues (game sounds and spoken notes for blind players),
// hints (a guide tone after an off note), countdown (seconds to get the flute ready before the app
// starts listening or recording; 0 = none), readerSize (the course reader's A A text size).
export const SETTINGS_DEFAULTS = Object.freeze({ saNote: 0, saOct: 5, a4: 440, volume: 0.75, deva: false,
  lang: "en", talk: false, notesAs: "letters", simple: false, textSize: 1, easyFont: false, contrast: false,
  beatFlash: false, vibrate: false, gameSpeed: "normal", noTimer: false, bigTargets: false, cues: false, hints: true, countdown: 5, showCodes: false, maStyle: "app", focus: false, intonation: "equal", pilot: false, readerSize: 1 });
const settingsListeners = new Set();
let settingsCache = null;

function cleanSettings(s) {
  const n = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) && v >= lo && v <= hi ? v : d; };
  return {
    saNote: Math.round(n(s.saNote, 0, 11, SETTINGS_DEFAULTS.saNote)),
    saOct: Number(s.saOct) === 4 ? 4 : 5,
    a4: n(s.a4, 400, 480, SETTINGS_DEFAULTS.a4),
    volume: n(s.volume, 0, 1, SETTINGS_DEFAULTS.volume),
    deva: s.deva === true,
    lang: s.lang === "hi" ? "hi" : "en",
    talk: s.talk === true,
    notesAs: s.notesAs === "pictures" ? "pictures" : "letters",
    simple: s.simple === true,
    textSize: n(s.textSize, 0.85, 1.6, 1),
    easyFont: s.easyFont === true,
    contrast: s.contrast === true,
    beatFlash: s.beatFlash === true,
    vibrate: s.vibrate === true,
    gameSpeed: ["slow", "normal", "fast"].includes(s.gameSpeed) ? s.gameSpeed : "normal",
    noTimer: s.noTimer === true,
    bigTargets: s.bigTargets === true,
    cues: s.cues === true,
    hints: s.hints !== false,
    countdown: Math.round(n(s.countdown, 0, 30, 5)),
    showCodes: s.showCodes === true,
    // Ma in notation: "app" (m shuddha, M tivra) or "common" (M shuddha, M# tivra, as most websites).
    maStyle: s.maStyle === "common" ? "common" : "app",
    // Focus mode: no games, points, levels or badges; practice and listening only.
    focus: s.focus === true,
    // The tuning notes are judged and played in: "equal" (like a keyboard) or "just" (tuned to
    // the tanpura: whole-number ratios from Sa, as many teachers tune by ear).
    intonation: s.intonation === "just" ? "just" : "equal",
    // Pilot study: note anonymous results on this device (pilot.js); off unless chosen.
    pilot: s.pilot === true,
    // The reader's own text size (its A A buttons), on top of textSize.
    readerSize: n(s.readerSize, 0.85, 1.6, 1)
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
