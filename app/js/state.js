// Learner progress, stored in this browser only (localStorage). Versioned, with backup export/import.
import { today } from "./util.js";
import { cleanSettings } from "./core/settings.js";

const KEY = "bansuri.progress";
const listeners = new Set();

function fresh() {
  return { v: 1, startedAt: null, current: 0, days: {}, milestones: {}, reviews: {}, log: [], ear: {}, badges: {}, prefs: { chimes: true, theme: "auto" }, live: freshLive() };
}

function freshLive() { return { holds: {}, echo: {}, taps: [], plays: [] }; }

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    return migrate(JSON.parse(raw));
  } catch (e) { return fresh(); }
}

// Accepts only well-formed entries, so a damaged backup or storage cannot break the app.
const isObj = x => !!x && typeof x === "object" && !Array.isArray(x);
const isDate = x => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
function pick(obj, ok) {
  const out = {};
  if (isObj(obj)) for (const [k, v] of Object.entries(obj)) if (ok(v)) out[k] = v;
  return out;
}
function migrate(s) {
  const out = fresh();
  if (!isObj(s)) return out;
  out.startedAt = isDate(s.startedAt) ? s.startedAt : null;
  out.current = Number.isInteger(s.current) && s.current >= 0 && s.current < 100000 ? s.current : 0;
  out.days = pick(s.days, isObj);
  out.milestones = {};
  for (const [k, m] of Object.entries(pick(s.milestones, isObj))) {
    out.milestones[k] = Object.assign({ status: "open" }, m, { attempts: Array.isArray(m.attempts) ? m.attempts.filter(isObj) : [] });
    if (typeof out.milestones[k].status !== "string") out.milestones[k].status = "open";
  }
  out.reviews = pick(s.reviews, r => isObj(r) && isDate(r.next) && typeof r.label === "string");
  for (const r of Object.values(out.reviews)) if (!Number.isInteger(r.stage) || r.stage < 0 || r.stage > 5) r.stage = 0;
  out.log = Array.isArray(s.log) ? s.log.filter(e => isObj(e) && isDate(e.date)).map(e => Object.assign({}, e, { minutes: Math.max(0, Math.min(1440, Number(e.minutes) || 0)) })) : [];
  out.ear = pick(s.ear, e => isObj(e) && Number.isFinite(e.right) && Number.isFinite(e.total));
  out.badges = pick(s.badges, isDate);
  out.prefs = Object.assign(fresh().prefs, isObj(s.prefs) ? s.prefs : {});
  out.recordings = Number.isInteger(s.recordings) && s.recordings >= 0 ? s.recordings : 0;
  out.lastBackup = isDate(s.lastBackup) ? s.lastBackup : null;
  // Results from the listening exercises (livestats.js).
  const lv = isObj(s.live) ? s.live : {};
  out.live = freshLive();
  for (const [k, list] of Object.entries(pick(lv.holds, Array.isArray))) {
    const ok = list.filter(x => isObj(x) && isDate(x.d) && Number.isFinite(x.s) && x.s >= 0 && x.s < 600).slice(-60);
    if (ok.length && (k === "any" || /^-?\d+$/.test(k))) out.live.holds[k] = ok;
  }
  const num = (x, lo, hi) => Number.isFinite(x) && x >= lo && x <= hi;
  out.live.echo = pick(lv.echo, e => isObj(e) && isDate(e.d) && num(e.best, 0, 50) && num(e.len, 0, 50) && num(e.right, 0, 1e6) && num(e.total, 0, 1e6) && typeof e.label === "string");
  out.live.taps = Array.isArray(lv.taps) ? lv.taps.filter(x => isObj(x) && isDate(x.d) && num(x.mean, -1000, 1000) && num(x.spread, 0, 1000) && num(x.within, 0, 1) && num(x.bpm, 1, 400)).slice(-60) : [];
  out.live.points = num(lv.points, 0, 1e7) ? Math.round(lv.points) : 0;
  const q = isObj(lv.quests) ? lv.quests : null;
  if (q && isDate(q.date) && Array.isArray(q.list) && q.list.every(x => isObj(x) && typeof x.id === "string" && typeof x.text === "string" && num(x.goal, 0, 1e4)))
    out.live.quests = { date: q.date, list: q.list.slice(0, 5), progress: pick(q.progress, x => num(x, 0, 1e6)), done: pick(q.done, x => x === true) };
  out.live.plays = Array.isArray(lv.plays) ? lv.plays.filter(x => isObj(x) && isDate(x.d) && num(x.n, 1, 1e4) && num(x.ok, 0, x.n) && num(x.onTime, 0, 1e4) && num(x.timed, 0, 1e4) && num(x.bpm, 0, 400) && typeof x.piece === "string").slice(-120) : [];
  // Experience and levels (xp.js). Missing: rebuilt from history on first use.
  const x = isObj(s.xp) ? s.xp : null;
  if (x && num(x.total, 0, 1e9)) {
    out.xp = {
      total: Math.round(x.total), day: isDate(x.day) ? x.day : null,
      caps: pick(x.caps, v => num(v, 0, 1e6)), once: pick(x.once, isDate),
      recent: Array.isArray(x.recent) ? x.recent.filter(r => isObj(r) && isDate(r.d) && typeof r.src === "string" && num(r.n, 0, 1e6)).slice(0, 40) : [],
      days: pick(x.days, v => num(v, 0, 1e6)), seen: num(x.seen, 1, 1000) ? x.seen : null,
    };
    for (const k of Object.keys(out.xp.days)) if (!isDate(k)) delete out.xp.days[k];
  }
  out.v = 1;
  return out;
}

let state = load();
let storageOk = true;

export function getState() { return state; }
export function isStorageOk() { return storageOk; }

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; } catch (e) { storageOk = false; }
  listeners.forEach(fn => { try { fn(state); } catch (e) { /* listener errors must not break saving */ } });
}

export function update(fn) { fn(state); save(); return state; }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function ensureStarted() {
  if (!state.startedAt) update(s => { s.startedAt = today(); });
}

export function addLog(entry) {
  update(s => { s.log.push(Object.assign({ date: today() }, entry)); });
}

export function resetAll() { state = fresh(); save(); }

// Backup: a JSON document. Recordings are added by the caller (backup.js) when requested.
// Besides progress and settings it carries what the learner made: My songs, saved notations,
// compositions, learned songs, students and coach history (STORES, as stored).
const STORES = ["bansuri.feedback", "bansuri.review.requests", "bansuri.tone.history", "bansuri.tone.checks", "bansuri.ornaments", "bansuri.ornament.models", "bansuri.mysongs", "bansuri.transcribed", "bansuri.compose.saved", "bansuri.songs.learned", "bansuri.students", "bansuri.coach.history", "bansuri.lessons"];
// What each store holds (a list or a keyed object), and the most one may take: a backup comes
// from a file anyone could have made, and one oversized entry would fill the browser's storage so
// that progress could no longer be saved.
const LISTS = new Set(["bansuri.feedback", "bansuri.review.requests", "bansuri.tone.history", "bansuri.mysongs", "bansuri.transcribed", "bansuri.compose.saved", "bansuri.students", "bansuri.coach.history"]);
const MAX_STORE = 1024 * 1024;
export function backupObject() {
  const stores = {};
  for (const k of STORES) { try { const v = localStorage.getItem(k); if (v !== null) stores[k] = v; } catch (e) { /* storage unavailable */ } }
  return { app: "bansuri-mastery", kind: "backup", exportedAt: new Date().toISOString(), progress: state, settings: readSettingsRaw(), stores };
}

function readSettingsRaw() {
  try { return JSON.parse(localStorage.getItem("bansuri.settings") || "null"); } catch (e) { return null; }
}

// What a backup or a move link would put in place: progress and settings checked exactly as they
// will be saved, so a preview can show the truth.
export function cleanedImport(obj) {
  return { progress: migrate(obj && obj.progress), settings: obj && isObj(obj.settings) ? cleanSettings(obj.settings) : null };
}

export function restoreFrom(obj) {
  if (!obj || obj.app !== "bansuri-mastery" || obj.kind !== "backup" || !obj.progress) throw new Error("This file is not a Bansuri Mastery backup.");
  const clean = cleanedImport(obj);
  state = clean.progress;
  if (clean.settings) {
    try { localStorage.setItem("bansuri.settings", JSON.stringify(clean.settings)); } catch (e) { /* ignore */ }
  }
  // Only the known keys, and only values that are valid JSON of the right kind and size.
  if (obj.stores && typeof obj.stores === "object") for (const k of STORES) {
    const v = obj.stores[k];
    if (typeof v !== "string" || v.length > MAX_STORE) continue;
    try {
      const parsed = JSON.parse(v);
      if (LISTS.has(k) ? !Array.isArray(parsed) : !isObj(parsed)) continue;
      localStorage.setItem(k, v);
    } catch (e) { /* not valid, or storage full */ }
  }
  save();
}
