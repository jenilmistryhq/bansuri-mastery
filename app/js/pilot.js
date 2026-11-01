// Pilot study (opt-in, Settings): while it is on, the app notes a few anonymous results on this
// device (bansuri.pilot): whether the taal and sam it found were kept, and how many lines of a
// line-by-line check were right as written. The pilot file (Settings > Download my pilot file)
// adds the Tone checks and the teacher reviews (paired with a Tone check when the review was asked
// from one). No names, no recordings, nothing sent: the learner hands the file over.
// scripts/pilot-report.mjs turns many files into calibrated bands and accuracy figures.
import { store, storeSet, today } from "./util.js";
import { getSettings } from "./core/settings.js";

const KEY = "bansuri.pilot";
export function pilotOn() { try { return getSettings().pilot === true; } catch (e) { return false; } }
// kind: "taal" ({ auto, chosen, samShift }) or "line" ({ fixed, notes }).
export function pilotLog(kind, data) {
  if (!pilotOn()) return;
  const l = store(KEY, []);
  l.push({ kind, date: today(), ...data });
  storeSet(KEY, l.slice(-2000));
}
// The anonymous file: a random id (so files from one learner can be told apart), the flute's key
// and tuning setting, the logs, the Tone checks, and the teacher's ratings.
export function pilotFile() {
  let id = store("bansuri.pilot.id", null);
  if (!id) { id = "p" + Math.random().toString(36).slice(2, 10); storeSet("bansuri.pilot.id", id); }
  const s = getSettings(), reqs = store("bansuri.review.requests", []);
  const reviews = store("bansuri.feedback", []).map(f => {
    const r = reqs.find(x => x.id === f.id);
    return { date: f.date, what: f.what, scores: f.scores, measures: r && r.measures ? r.measures : null };
  });
  return {
    app: "bansuri-mastery", kind: "pilot", v: 1, id, made: today(), flute: { saNote: s.saNote, saOct: s.saOct }, intonation: s.intonation,
    logs: store(KEY, []), tone: store("bansuri.tone.history", []).map(x => ({ date: x.date, note: x.note, p: x.p, score: x.score })), reviews,
  };
}
