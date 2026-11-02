// One Day N (docs/redesign/13-one-day.md): the day's lesson carries the whole of the day's session.
// Every block of the day in the plan (app/data/plan.json) gets one home in the lesson:
//   - a "learn" card (lesson/learn.js) just before the step that does the block, so the idea is
//     taught before it is played, or after an opening question, so the guess comes first;
//   - or, when a step already does exactly what the block says, the block folds under that step
//     ("Why and how": the same text, readings and course wording, closed until asked for);
//   - a block the lesson does not teach (often the warm-up, long tones and the recording) becomes a
//     chapter of its own, done as written: warm-up and tone first, as in the session, the others
//     after the lesson's own chapters.
// Every step of a chapter can open its blocks' explanation, and the readings open in a sheet over
// the lesson. The day's pass check is the cover's goal and sits under the reward.
import { blockSteps } from "./practice.js";

// Where each block of a lesson day lives: "step" puts its card before that step, "=step" folds it
// under that step; { at, demo } adds a flute picture that plays the notation. A block not listed
// becomes a chapter of its own.
export const PLACE = {
  m0: { M: { at: "parts", demo: "S R G R S -" }, READ: "inspect", K: "sa", E: "plan", R: "done" },
  m1: { READ: "sit", W: "=scan", K: "lips", T: "=breathe", E: "ear", R: "=done" },
  m2: { W: "=scan", T: "=breathe", K: "sound", E: "hum", R: "=done" },
  m3: { W: "=breathe", T: "=hold", READ: "ears", E: "lines", R: "=rec" },
  m4: { READ: "beats", T: "sa", E: "humsa", R: "=done" },
  m8: { W: "=breathe", T: "=sa", READ: "toy", K: "=long", E: "hl", R: "=done" },
  m9: { T: "=long", K: "toy", E: "method", R: "=done" },
  m12: { T: "=long", K: "formula", M: "waltz", E: "=rhy", R: "=done" },
  m15: { T: "=long", READ: "toy", K: "find", E: "=read", R: "=done" },
  m43: { T: "=long", K: "hear" },
  m50: { K: "dd", E: "keherwa" },
  m64: { K: "slide", E: "ear" },
  m85: { T: "=warm", K: "bend" },
  m99: { M: "steps", E: "dict", R: "=rec" },
  m127: { M: "notes" },
  m141: { M: "which", K: "rr" },
  m177: { M: "rewrite" },
  m183: { K: "ear" },
  m190: { E: "letters" },
  m197: { M: "notes" },
  m211: { K: "ear" },
  m216: { M: "qa" },
  m281: { M: "stand", R: "=mock" },
  m309: { K: "order", E: "ear" },
  m372: { E: "staff" },
  m407: { K: "taan" },
  m408: { M: "s1" },
  m466: { M: "rules" },
  m467: { M: "styles" },
  m498: { K: "ear" },
  m617: { M: "order" },
};

const learnCard = (b, demo) => ({ id: "learn-" + b.id, kind: "learn", title: b.label || "Why and how", block: b, demo, always: true });

// The day's lesson with its session folded in. lesson: a lesson from LESSONS or a practice day
// (lessons/practice.js); day: the plan's day (course.js getDay). Returns a new lesson; the original
// is left as it is.
export function oneDay(lesson, day) {
  if (!lesson || !day || !day.blocks) return lesson;
  const n = day.n !== undefined ? day.n : lesson.day;
  const chapters = lesson.chapters.map(c => Object.assign({}, c, { steps: c.steps.slice(), blocks: c.block ? [c.block] : [] }));
  const lead = [], tail = [];
  if (!lesson.practice) {
    const place = PLACE[lesson.id] || {};
    for (const b of day.blocks) {
      const p = place[b.id];
      if (!p) { (b.id === "W" || b.id === "T" ? lead : tail).push(b); continue; }
      const spec = typeof p === "string" ? { at: p } : p;
      const fold = spec.at[0] === "=", at = fold ? spec.at.slice(1) : spec.at;
      const c = chapters.find(ch => ch.steps.some(s => s.id === at));
      if (!c) { tail.push(b); continue; }
      c.blocks.push(b);
      if (!fold) c.steps.splice(c.steps.findIndex(s => s.id === at), 0, learnCard(b, spec.demo));
    }
    // A block the lesson does not teach: a chapter of its own, done as the session has it.
    const own = b => ({ title: b.label || b.id, block: b, blocks: [b], steps: blockSteps(b, n, n, "day-") });
    chapters.splice(0, 0, ...lead.map(own));
    chapters.splice(chapters.length - 1, 0, ...tail.map(own));
  }
  // A chapter made from one block opens with its card, unless its first step already says it.
  for (const c of chapters) if (c.block && !c.steps.some(s => s.kind === "learn") && (!c.steps[0] || c.steps[0].src !== c.block.text)) c.steps.unshift(learnCard(c.block));
  // Every step of a chapter can open its blocks' explanation; the reward shows the day's pass check.
  for (const c of chapters) c.steps = c.steps.map(s => (s.kind === "learn" || !c.blocks.length ? s : Object.assign({}, s, { blocks: c.blocks })));
  const last = chapters[chapters.length - 1];
  if (last && last.steps.length && day.pass) last.steps[last.steps.length - 1] = Object.assign({}, last.steps[last.steps.length - 1], { goal: day.pass });
  // The day's readings, once each, for the cover.
  const read = [], seen = new Set();
  for (const b of day.blocks) for (const r of b.read || []) { const k = r.path + "#" + (r.anchor || ""); if (!seen.has(k)) { seen.add(k); read.push(r); } }
  // The cover shows the real total: every block of the day now has a home in the lesson, so the
  // day takes the session's whole time (the sum of its blocks), never less than the lesson alone.
  const extra = lead.concat(tail).reduce((a, b) => a + (b.minutes || 0), 0);
  const whole = day.blocks.reduce((a, b) => a + (b.minutes || 0), 0);
  return Object.assign({}, lesson, { chapters, minutes: Math.max((lesson.minutes || 0) + extra, whole), oneDay: { day: n, pass: day.pass || "", read, blocks: day.blocks } });
}

// Where each block of the day ended up: { blockId: { chapter, step, how: "card" | "fold" } }.
// For the tests and the design note: every block of every day has a home.
export function homes(merged) {
  const out = {};
  merged.chapters.forEach((c, ci) => {
    for (const s of c.steps) if (s.kind === "learn") out[s.block.id] = { chapter: ci, step: s.id, how: "card" };
    for (const b of c.blocks || []) if (!out[b.id]) out[b.id] = { chapter: ci, step: (c.steps.find(s => s.blocks && s.blocks.includes(b)) || {}).id, how: "fold" };
  });
  return out;
}
