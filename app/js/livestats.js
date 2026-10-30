// What the learner has played into the microphone: best long tones per note, echo levels, tap
// timing and play-along scores. The listening widgets announce results as "bansuri:live" events
// (see core/listen.js emitLive); this module stores them in the progress state and summarises them.
import { getState, update } from "./state.js";
import { today, addDays } from "./util.js";

const CAP = { holds: 60, taps: 60, plays: 120 };

export function recordLive(d) {
  if (!d || typeof d.type !== "string") return;
  const day = today();
  update(s => {
    const L = s.live;
    if (d.type === "hold" && Number.isFinite(d.seconds)) {
      const key = d.target === null || d.target === undefined ? "any" : String(d.target);
      const list = L.holds[key] || (L.holds[key] = []);
      const last = list[list.length - 1];
      // One entry per note per day: the day's best.
      if (last && last.d === day) last.s = Math.max(last.s, d.seconds); else list.push({ d: day, s: d.seconds });
      if (list.length > CAP.holds) list.splice(0, list.length - CAP.holds);
    } else if (d.type === "echo" && typeof d.level === "string") {
      const e = L.echo[d.level] || (L.echo[d.level] = { best: 0, len: 1, right: 0, total: 0, label: d.levelLabel || d.level, d: day });
      e.total++; if (d.correct) { e.right++; e.best = Math.max(e.best, d.len); }
      e.len = d.len; e.d = day; if (d.levelLabel) e.label = d.levelLabel;
    } else if (d.type === "tap" && Number.isFinite(d.mean)) {
      L.taps.push({ d: day, mean: d.mean, spread: d.spread, within: d.within, silent: !!d.silent, bpm: d.bpm });
      if (L.taps.length > CAP.taps) L.taps.splice(0, L.taps.length - CAP.taps);
    } else if (d.type === "play" && Number.isFinite(d.n) && d.n > 0) {
      L.plays.push({ d: day, piece: String(d.piece || "").slice(0, 80), ok: d.ok, n: d.n, onTime: d.onTime, timed: d.timed, bpm: d.bpm });
      if (L.plays.length > CAP.plays) L.plays.splice(0, L.plays.length - CAP.plays);
    }
  });
}

// Best hold per note: [{ key, best, first, last, days }], where first and last are the earliest and
// latest day's best, to show progress.
export function holdSummary() {
  return Object.entries(getState().live.holds).map(([key, list]) => ({
    key, best: Math.max(...list.map(x => x.s)), first: list[0].s, last: list[list.length - 1].s, days: list.length, lastDay: list[list.length - 1].d,
  })).sort((a, b) => (a.key === "any") - (b.key === "any") || Number(a.key) - Number(b.key));
}

// The learner's best steady hold on a note (semitone, or null for "any note"), in seconds.
export function bestHold(target) {
  const list = getState().live.holds[target === null || target === undefined ? "any" : String(target)] || [];
  return list.reduce((m, x) => Math.max(m, x.s), 0);
}

// Everything played on one day, for "yesterday" on Today.
export function dayResults(day) {
  const L = getState().live;
  const holds = Object.entries(L.holds).map(([key, list]) => [key, list.find(x => x.d === day)]).filter(([, x]) => x).map(([key, x]) => ({ key, s: x.s }));
  const plays = L.plays.filter(p => p.d === day);
  const taps = L.taps.filter(t => t.d === day);
  const echo = Object.entries(L.echo).filter(([, e]) => e.d === day).map(([k, e]) => ({ level: k, label: e.label, len: e.len, best: e.best }));
  return { holds, plays, taps, echo, any: holds.length + plays.length + taps.length + echo.length > 0 };
}

export function lastPlayedDay() {
  const L = getState().live, t = today(), days = [];
  for (const list of Object.values(L.holds)) list.forEach(x => days.push(x.d));
  L.plays.forEach(x => days.push(x.d)); L.taps.forEach(x => days.push(x.d));
  Object.values(L.echo).forEach(e => days.push(e.d));
  const before = days.filter(d => d < t).sort();
  return before.length ? before[before.length - 1] : null;
}

export function yesterday() { return addDays(today(), -1); }
