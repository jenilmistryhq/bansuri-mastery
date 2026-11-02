// A practice day as a lesson (#/lesson/p<n>). The ~600 practice days keep their written blocks
// (warm-up, tone, technique, music, ear, record) and their minutes; each block becomes a chapter
// with something to do, drawn from the interactive lessons already reached, then a timer for the
// rest of the block's time with its instructions and readings. The choice of drills rotates
// with the day, so no two neighbouring days are the same: technique from the current lesson,
// music from recent ones, and one ear game from any lesson so far (spaced review).
import { LESSONS } from "./index.js";
import { dayReward } from "./common.js";
import { getDay, current, dayState, finishSession, dueReviews, markReview } from "../course.js";
import { parseNotation } from "../core/notation.js";
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

// A repertoire item's notes to play: the first line of its notation (at most 16 notes).
export function itemNotes(item) {
  const line = String((item && item.bench && item.bench.notation) || "").split("\n")[0];
  const out = [];
  for (const tk of parseNotation(line).tokens) if (tk.type === "beat") for (const it of tk.items) if (it.semi !== undefined) out.push(it.semi);
  return out.slice(0, 16);
}

// A small seeded generator: the same day always gets the same drills.
function rng(seed) { let x = (seed * 2654435761) >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
const steps = l => l.chapters.flatMap(c => c.steps);
// Options in a new order (seeded): in lessons the right answer often comes first.
function shuffle(list, rand) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// Plain words from a block's text: no backticks, links or bold marks.
export function plainBlock(text) {
  return String(text || "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*]/g, "").replace(/\s+/g, " ").trim();
}

// The timed rest of a block, with its instruction and readings. pre: an id prefix.
export const keepGoing = (b, seconds, pre = "") => ({ id: pre + b.id + "-time", kind: "timer", title: "Keep going: " + (b.label || "practice"), intro: plainBlock(b.text), src: b.text, seconds, start: "Start " + Math.round(seconds / 60) + " minutes", checks: ["Done for today"], read: b.read || [] });

// A block done as written, with no drills: long tones for a tone block, a recording for a record
// block, the block's time on a timer for anything else. n: the day; latestDay: the last lesson
// reached (for long-tone notes); pre: an id prefix.
export function blockSteps(b, n, latestDay, pre = "") {
  const role = ROLE[b.id] || "read", secs = Math.max(60, (b.minutes || 5) * 60);
  if (role === "tone") {
    const spec = holdSpec(b) || {};
    const targets = (spec.targets || toneNotes(n, latestDay)).slice(0, 6);
    return [{ id: pre + "T-long", kind: "hold", title: "Long tones", intro: plainBlock(b.text), src: b.text, targets, seconds: spec.seconds || 8, cents: 30, giveUp: 90 },
      keepGoing(b, Math.max(60, secs - 180), pre)];
  }
  if (role === "record") return [{ id: pre + "R-rec", kind: "record", title: b.record || "Today's recording", intro: "Play something from today, once, as if for a listener. Then listen back: one thing to keep, one to fix.", seconds: 30, day: n, label: "Day " + n + ": " + (b.record || "practice") }];
  return [keepGoing(b, secs, pre)];
}

// The lessons taught by day n, oldest first.
export function taughtBy(n, lessons = LESSONS) {
  return Object.values(lessons).filter(l => l.day !== undefined && l.day <= n).sort((a, b) => a.day - b.day);
}

// Build day n's practice lesson from its plan entry. next: the following day (for the teaser).
// done: blocks already ticked in the step list today: they are skipped, and count as done.
// due: the spaced-review items due today (review days play them).
export function buildPractice(n, day, next, lessons = LESSONS, done = {}, due = []) {
  if (!day || !["practice", "review"].includes(day.kind) || !day.blocks || !day.blocks.length) return null;
  const review = day.kind === "review";
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
  // A drill keeps its lesson's step, with the step's own practice wording (drill) where its
  // lesson's words lean on the step before; "from" names the lesson it comes from.
  const copy = (c, prefix) => Object.assign({}, c.s, c.s.drill || {}, { id: prefix + "-" + c.l.id + "-" + c.s.id, from: { day: c.l.day, title: c.l.title } });
  const parts = [];
  for (const b of day.blocks) {
    const role = ROLE[b.id] || "read", secs = Math.max(60, (b.minutes || 5) * 60);
    const st = [];
    if (role === "warm" || role === "tone") {
      st.push(...blockSteps(b, n, latest.day));
    } else if (review && (role === "tech" || role === "music") && due.length && !parts.some(p => p.items)) {
      // Repertoire due in the spaced review: play each, checked note by note (three at most).
      const items = due.filter(it => itemNotes(it).length >= 3).slice(0, 3);
      items.forEach((it, k) => st.push({ id: "rep-" + k, kind: "phrase", title: it.label, intro: "Due for review. Its first line is checked here; play the whole piece in the time that follows, from memory if you can.", phrase: itemNotes(it), giveUp: 90, item: it.id }));
      st.push(keepGoing(b, Math.max(60, secs - 120 * items.length)));
      parts.push({ b, steps: st, done: !!done[b.id], items });
      continue;
    } else if (role === "tech" || role === "music") {
      const cands = role === "tech" ? pick(pool([latest], TECH), 2).concat([]) : pick(pool(recent.length ? recent : [latest], TECH), 1);
      if (role === "tech" && cands.length < 2) cands.push(...pick(pool(recent, TECH), 2 - cands.length));
      cands.forEach(c => st.push(copy(c, b.id)));
      st.push(keepGoing(b, Math.max(60, secs - 180 * cands.length)));
    } else if (role === "ear") {
      const c = pick(pool(taught, EAR), 1);
      c.forEach(x => st.push(copy(x, "E")));
      st.push(keepGoing(b, Math.max(60, secs - 120 * c.length)));
    } else if (role === "record" && review) {
      st.push({ id: "R-reflect", kind: "plan", title: "This week", intro: "Look back over the week's practice and recordings.", fields: [{ key: "changed", label: "What changed this week?", hint: "e.g. Sa steadier; Ga still flat" }, { key: "next", label: "One thing for next week" }], required: ["changed"] });
      st.push({ id: "R-rec", kind: "record", title: b.record || "Today's recording", intro: "Play something from this week, once, as if for a listener. Then listen back.", seconds: 30, day: n, label: "Day " + n + ": " + (b.record || "review") });
    } else {
      st.push(...blockSteps(b, n, latest.day));
    }
    // The drills are chosen for every block first, so skipping a done one never changes the rest.
    parts.push({ b, steps: st, done: !!done[b.id] });
  }
  // Each chapter keeps its block, so the lesson can carry the block's explanation (lessons/oneday.js).
  const chapters = parts.filter(p => !p.done).map(p => ({ title: p.b.label || p.b.id, block: p.b, steps: p.steps }));
  // A review day opens with a quiz: questions from the last six weeks' lessons and a few older
  // ones, answers shuffled, then one ear game.
  if (review) {
    const qs = (ls) => ls.flatMap(l => steps(l).filter(s => s.kind === "quiz").flatMap(s => s.questions.map(q => ({ q, l }))));
    const recentLs = taught.filter(l => l.day > n - 42), olderLs = taught.filter(l => l.day <= n - 42);
    const take = (list, k) => { const out = [], left = list.slice(); while (out.length < k && left.length) out.push(left.splice(Math.floor(rand() * left.length), 1)[0]); return out; };
    let picked = take(qs(recentLs), 4);
    picked = picked.concat(take(qs(olderLs), 6 - picked.length));
    if (picked.length < 6) picked = picked.concat(take(qs(recentLs).filter(x => !picked.includes(x)), 6 - picked.length));
    const questions = picked.map(({ q }) => Object.assign({}, q, { options: shuffle(q.options, rand) }));
    const ear = pick(pool(taught, EAR), 1).map(c => copy(c, "Q"));
    chapters.unshift({ title: "Review quiz", steps: [{ id: "quiz", kind: "quiz", title: "What do you remember?", intro: "Questions from the lessons so far, mostly the last few weeks.", questions }].concat(ear) });
  }
  const teaser = next ? { when: "Tomorrow", title: "Day " + next.n + ": " + next.title, text: next.kind === "milestone" ? "A milestone: show what you can do." : next.kind === "review" ? "A review day." : "Another step on the way.", notes: [0, 2, 4, 2, 0] } : { when: "Tomorrow", title: "Keep going", text: "", notes: [0, 2, 4, 2, 0] };
  chapters.push({ title: "Done", steps: [{ id: "done", kind: "custom", title: review ? "Day " + n + " reviewed" : "Day " + n + " practised", next: "Finish Day " + n,
    make: dayReward(d => (review ? [[d.quiz ? "Quiz: " + d.quiz.firstTry + " of " + d.quiz.of + " right first time" : "Review quiz", !!d.quiz]] : []).concat(parts.map(p => [p.b.label || p.b.id, p.done || p.steps.some(s => d[s.id])])), teaser) }] });
  return {
    id: "p" + n, day: n, practice: true, review, title: day.title, minutes: day.minutes || 45, chapters,
    finish(d) {
      const was = current(), blocks = {};
      for (const p of parts) blocks[p.b.id] = p.done || p.steps.some(s => d[s.id]);
      // Each repertoire item played moves along its review schedule (a miss brings it back tomorrow).
      for (const p of parts) for (const s of p.steps) if (s.item && d[s.id]) markReview(s.item, !!d[s.id].passed);
      const r = d["R-reflect"];
      const note = review ? "Day " + n + " review." + (d.quiz ? " Quiz " + d.quiz.firstTry + "/" + d.quiz.of + "." : "") + (r && r.changed ? " Changed: " + r.changed.trim() + "." : "") + (r && r.next ? " Next: " + r.next.trim() + "." : "") : "Day " + n + " practice.";
      finishSession(n, { minutes: day.minutes || 45, note, passed: true, blocks });
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
  // Today's blocks ticked in the step list carry over; a past day is practised whole again.
  const done = n === current() ? ((dayState(n) || {}).blocks || {}) : {};
  return buildPractice(n, day, next && Object.assign({}, next, { n: n + 1 }), LESSONS, done, day && day.kind === "review" ? dueReviews() : []);
}

// The block instructions in plain words, in the learner's language (the same texts the session
// reads aloud), where a version exists; the plan's own wording otherwise.
export async function localise(lesson) {
  const all = lesson.chapters.flatMap(c => c.steps).filter(s => s.src);
  await Promise.all(all.map(async s => { const t = await plainText({ text: s.src }); if (t) s.intro = t; }));
  return lesson;
}
