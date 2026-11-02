// A practice day as a lesson (#/lesson/p<n>). The ~600 practice days keep their written blocks
// (warm-up, tone, technique, music, ear, record) and their minutes; each block becomes a chapter
// with something to do, drawn from the interactive lessons already reached, then a timer for the
// rest of the block's time with its instructions and readings. The choice of drills rotates
// with the day, so no two neighbouring days are the same: technique from the current lesson,
// music from recent ones, and one ear game from any lesson so far (spaced review).
import { LESSONS } from "./index.js";
import { dayReward } from "./common.js";
import { getDay, current, finishSession } from "../course.js";
import { holdSpec } from "../views/session.js";
import { plainText } from "../steps.js";

// Step kinds a practice day can reuse, by role. Lesson-only steps (rewards, setup choices,
// first-time explanations) are left out.
const TECH = new Set(["phrase", "ornament", "rhythm", "clapwave", "tihai", "answer", "halfhole", "bend", "swell", "hold", "improv"]);
const EAR = new Set(["judge", "curves", "nyas", "styles", "dictate", "staff", "higherlower", "complete", "pick", "bhatkhande"]);
const ROLE = { W: "warm", T: "tone", K: "tech", M: "music", E: "ear", R: "record", READ: "read" };

// Long-tone notes when a tone block names none: the registers reached so far, one a day in turn
// (the second octave from Day 50, the upper octave from Day 141).
export function toneNotes(n, latestDay) {
  if (latestDay < 15) return [0, 2, 4];
  if (latestDay < 50) return [-1, 0, 2, 4, 5, 7];
  const sets = [[-5, -3, -1, 0], [0, 4, 7, 9]];
  if (latestDay >= 141) sets.push([11, 12, 14]);
  return sets[n % sets.length];
}

// A small seeded generator: the same day always gets the same drills.
function rng(seed) { let x = (seed * 2654435761) >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
const steps = l => l.chapters.flatMap(c => c.steps);
// Plain words from a block's text: no backticks, links or bold marks.
export function plainBlock(text) {
  return String(text || "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*]/g, "").replace(/\s+/g, " ").trim();
}

// The lessons taught by day n, oldest first.
export function taughtBy(n, lessons = LESSONS) {
  return Object.values(lessons).filter(l => l.day !== undefined && l.day <= n).sort((a, b) => a.day - b.day);
}

// Build day n's practice lesson from its plan entry. next: the following day (for the teaser).
export function buildPractice(n, day, next, lessons = LESSONS) {
  if (!day || day.kind !== "practice" || !day.blocks || !day.blocks.length) return null;
  const taught = taughtBy(n, lessons);
  if (!taught.length || taught[taught.length - 1].day === n) return null;
  const rand = rng(n + 7);
  const latest = taught[taught.length - 1], recent = taught.slice(-5, -1);
  const pool = (ls, set) => ls.flatMap(l => steps(l).filter(s => set.has(s.kind) && (s.kind !== "hold" || s.target !== undefined || s.targets)).map(s => ({ s, l })));
  const used = new Set();
  const pick = (cands, k) => {
    const out = [];
    const free = cands.filter(c => !used.has(c.l.id + "/" + c.s.id));
    if (!free.length) return out;
    let i = Math.floor(rand() * free.length);
    while (out.length < k && out.length < free.length) { const c = free[i % free.length]; used.add(c.l.id + "/" + c.s.id); out.push(c); i++; }
    return out;
  };
  const copy = (c, prefix) => Object.assign({}, c.s, { id: prefix + "-" + c.l.id + "-" + c.s.id, from: "Day " + c.l.day + ": " + c.l.title });
  const keepGoing = (b, seconds) => ({ id: b.id + "-time", kind: "timer", title: "Keep going: " + (b.label || "practice"), intro: plainBlock(b.text), src: b.text, seconds, start: "Start " + Math.round(seconds / 60) + " minutes", checks: ["Done for today"], read: b.read || [] });
  const chapters = [], rows = [];
  for (const b of day.blocks) {
    const role = ROLE[b.id] || "read", secs = Math.max(60, (b.minutes || 5) * 60);
    const st = [];
    if (role === "warm") {
      st.push(keepGoing(b, secs));
    } else if (role === "tone") {
      const spec = holdSpec(b) || {};
      const targets = (spec.targets || toneNotes(n, latest.day)).slice(0, 6);
      st.push({ id: "T-long", kind: "hold", title: "Long tones", intro: plainBlock(b.text), src: b.text, targets, seconds: spec.seconds || 8, cents: 30, giveUp: 90 });
      st.push(keepGoing(b, Math.max(60, secs - 180)));
    } else if (role === "tech" || role === "music") {
      const cands = role === "tech" ? pick(pool([latest], TECH), 2).concat([]) : pick(pool(recent.length ? recent : [latest], TECH), 1);
      if (role === "tech" && cands.length < 2) cands.push(...pick(pool(recent, TECH), 2 - cands.length));
      cands.forEach(c => st.push(copy(c, b.id)));
      st.push(keepGoing(b, Math.max(60, secs - 180 * cands.length)));
    } else if (role === "ear") {
      const c = pick(pool(taught, EAR), 1);
      c.forEach(x => st.push(copy(x, "E")));
      st.push(keepGoing(b, Math.max(60, secs - 120 * c.length)));
    } else if (role === "record") {
      st.push({ id: "R-rec", kind: "record", title: b.record || "Today's recording", intro: "Play something from today, once, as if for a listener. Then listen back: one thing to keep, one to fix.", seconds: 30, day: n, label: "Day " + n + ": " + (b.record || "practice") });
    } else {
      st.push(keepGoing(b, secs));
    }
    chapters.push({ title: b.label || b.id, steps: st });
    rows.push(b.label || b.id);
  }
  const teaser = next ? { when: "Tomorrow", title: "Day " + next.n + ": " + next.title, text: next.kind === "milestone" ? "A milestone: show what you can do." : next.kind === "review" ? "A review day." : "Another step on the way.", notes: [0, 2, 4, 2, 0] } : { when: "Tomorrow", title: "Keep going", text: "", notes: [0, 2, 4, 2, 0] };
  chapters.push({ title: "Done", steps: [{ id: "done", kind: "custom", title: "Day " + n + " practised", next: "Finish Day " + n,
    make: dayReward(d => chapters.slice(0, -1).map((c, i) => [rows[i], c.steps.some(s => d[s.id])]), teaser) }] });
  return {
    id: "p" + n, day: n, practice: true, title: day.title, minutes: day.minutes || 45, chapters,
    finish(d) {
      const was = current(), blocks = {};
      day.blocks.forEach((b, i) => { blocks[b.id] = chapters[i].steps.some(s => d[s.id]); });
      finishSession(n, { minutes: day.minutes || 45, note: "Day " + n + " practice.", passed: true, blocks });
      return { advanced: was === n && current() > n };
    },
  };
}

// The practice lesson for an id "p<n>", or null (lesson days, review days and milestones keep
// their own pages).
export function practiceLesson(id) {
  const m = /^p(\d+)$/.exec(id || "");
  if (!m) return null;
  const n = Number(m[1]), day = getDay(n);
  const next = getDay(n + 1);
  return buildPractice(n, day, next && Object.assign({}, next, { n: n + 1 }));
}

// The block instructions in plain words, in the learner's language (the same texts the session
// reads aloud), where a version exists; the plan's own wording otherwise.
export async function localise(lesson) {
  const all = lesson.chapters.flatMap(c => c.steps).filter(s => s.src);
  await Promise.all(all.map(async s => { const t = await plainText({ text: s.src }); if (t) s.intro = t; }));
  return lesson;
}
