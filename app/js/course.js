// Course logic: loads the generated day plan and moves the learner through it.
import { getState, update } from "./state.js";
import { today, addDays, daysBetween, parseDate, dateStr } from "./util.js";

let plan = null;

export async function loadPlan() {
  if (plan) return plan;
  const res = await fetch("app/data/plan.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("Could not load the course plan (" + res.status + ").");
  plan = await res.json();
  return plan;
}
export function getPlan() { return plan; }
export function lastIndex() { return plan.days.length - 1; }

// Days past the end of the written plan repeat the Phase 5 cycle.
export function resolveIndex(n) {
  const last = lastIndex();
  if (n <= last) return n;
  const c = plan.cycle;
  if (!c) return last;
  const len = c.to - c.from + 1;
  return c.from + ((n - last - 1) % len);
}

export function getDay(n) {
  const idx = resolveIndex(n);
  const base = plan.days[idx];
  if (!base) return null;
  const tpl = base.template ? plan.templates[base.template] : null;
  const merged = Object.assign({}, tpl || {}, base);
  merged.blocks = base.blocks || (tpl && tpl.blocks) || [];
  merged.n = n;
  merged.repeatOf = n !== idx ? idx : null;
  return merged;
}

export function phaseOf(day) { return plan.phases.find(p => p.id === day.phase) || null; }
export function lessonInfo(id) { return plan.lessons[id] || null; }
export function milestoneInfo(id) { return plan.milestones.find(m => m.id === id) || null; }
export function milestoneForDay(n) { const d = getDay(n); return d && d.milestone ? milestoneInfo(d.milestone) : null; }

export function current() { return getState().current; }
export function dayState(n) { return getState().days[n] || null; }
export function isUnlocked(n) { return n <= current(); }

export function status(n) {
  const cur = current();
  const ds = dayState(n);
  if (n === cur) return "current";
  if (n < cur) return "done";
  return ds && ds.done ? "done" : "locked";
}

// Save partial session progress (ticked blocks) without completing the day.
export function saveBlocks(n, blocks) {
  update(s => { s.days[n] = Object.assign({}, s.days[n] || {}, { blocks: Object.assign({}, blocks) }); });
}

// Finish a practice session. `passed` = the day's pass check was met.
export function finishSession(n, { minutes, note, passed, blocks }) {
  const day = getDay(n);
  const date = today();
  let advanced = false;
  update(s => {
    const prev = s.days[n] || {};
    s.days[n] = Object.assign({}, prev, {
      blocks: blocks || prev.blocks || {},
      sessions: (prev.sessions || 0) + 1,
      minutes: (prev.minutes || 0) + (minutes || 0),
      note: note || prev.note || "",
      lastDate: date,
    });
    s.log.push({ date, day: n, minutes: minutes || 0, note: note || "", passed: !!passed });
    const gated = !!day.milestone && !(s.milestones[day.milestone] && s.milestones[day.milestone].status === "passed");
    if (passed && !gated) {
      s.days[n].done = true;
      s.days[n].date = s.days[n].date || date;
      if (n === s.current) { s.current = n + 1; advanced = true; }
      for (const it of day.newItems || []) addReview(s, it, date);
    }
    if (!s.startedAt) s.startedAt = date;
  });
  return { advanced };
}

// Milestones. A passed milestone completes its day and unlocks the next one.
export function milestoneState(id) { return getState().milestones[id] || { status: "open", attempts: [] }; }
export function recordAttempt(id, attempt, passed) {
  const info = milestoneInfo(id);
  const date = today();
  let advanced = false;
  update(s => {
    const m = s.milestones[id] || { status: "open", attempts: [] };
    m.attempts.push(Object.assign({ date, passed }, attempt));
    if (passed) { m.status = "passed"; m.passedOn = m.passedOn || date; }
    else if (m.status !== "passed") m.status = "failed";
    s.milestones[id] = m;
    if (passed && info) {
      const n = info.day;
      s.days[n] = Object.assign({}, s.days[n] || {}, { done: true, date: (s.days[n] && s.days[n].date) || date });
      if (s.current === n) { s.current = n + 1; advanced = true; }
    }
  });
  return { advanced };
}

// Spaced review: 1, 3, 7, 14, 30, 60 days after learning an item.
const INTERVALS = [1, 3, 7, 14, 30, 60];
function addReview(s, item, date) {
  if (!item || !item.id || s.reviews[item.id]) return;
  s.reviews[item.id] = { label: item.label, learned: date, next: addDays(date, INTERVALS[0]), stage: 0, bench: item.bench || null, read: item.read || null, done: 0 };
}
export function dueReviews(date) {
  date = date || today();
  return Object.entries(getState().reviews).filter(([, r]) => r.next <= date).map(([id, r]) => Object.assign({ id }, r)).sort((a, b) => a.next < b.next ? -1 : 1);
}
export function upcomingReviews(limit) {
  const t = today();
  return Object.entries(getState().reviews).filter(([, r]) => r.next > t).map(([id, r]) => Object.assign({ id }, r)).sort((a, b) => a.next < b.next ? -1 : 1).slice(0, limit || 5);
}
export function markReview(id, ok) {
  update(s => {
    const r = s.reviews[id];
    if (!r) return;
    const t = today();
    if (ok) { r.stage = Math.min(r.stage + 1, INTERVALS.length - 1); r.next = addDays(t, INTERVALS[r.stage]); }
    else { r.stage = 0; r.next = addDays(t, 1); }
    r.done = (r.done || 0) + 1;
    r.last = t;
  });
}

// Statistics from the practice log.
export function practiceDates() {
  const m = new Map();
  for (const e of getState().log) m.set(e.date, (m.get(e.date) || 0) + (e.minutes || 0));
  return m;
}
export function streaks() {
  const dates = practiceDates();
  const t = today();
  let cur = 0;
  let d = dates.has(t) ? t : addDays(t, -1);
  while (dates.has(d)) { cur++; d = addDays(d, -1); }
  const sorted = [...dates.keys()].sort();
  let best = 0, run = 0, prev = null;
  for (const s of sorted) { run = prev && daysBetween(prev, s) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = s; }
  return { current: cur, best, practisedToday: dates.has(t) };
}
export function totals() {
  const s = getState();
  const minutes = s.log.reduce((a, e) => a + (e.minutes || 0), 0);
  const daysDone = Object.values(s.days).filter(d => d.done).length;
  const msPassed = Object.values(s.milestones).filter(m => m.status === "passed").length;
  return { minutes, daysDone, msPassed, sessions: s.log.length, practiceDays: practiceDates().size };
}
export function weekdayOf(dateString) { return parseDate(dateString).getDay(); }
export { dateStr };
