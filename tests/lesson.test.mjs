// The lesson player's pure parts (app/js/lesson/) and the shape of the Day 0 lesson (app/js/lessons/m0.js).
import assert from "node:assert/strict";
const F = await import("../app/js/lesson/flute.js").catch(e => { console.error(e); process.exit(1); });
const S = await import("../app/js/lesson/steps.js");
const P = await import("../app/js/lesson/player.js");
const { M0 } = await import("../app/js/lessons/m0.js");
const { LESSONS, lessonForDay } = await import("../app/js/lessons/index.js");
let n = 0;
const test = (name, fn) => { try { fn(); n++; } catch (e) { console.error("FAIL " + name); throw e; } };

test("holes: closing from the top lowers the note; a gap is not on the chart", () => {
  assert.equal(F.noteOfPattern("XXXOOO"), 0, "Sa: top three closed");
  assert.equal(F.noteOfPattern("XXOOOO"), 2, "Re");
  assert.equal(F.noteOfPattern("XOOOOO"), 4, "Ga");
  assert.equal(F.noteOfPattern("XXXXXX"), -5, "all closed: lower Pa");
  const order = ["OOOOOO", "XOOOOO", "XXOOOO", "XXXOOO", "XXXXOO", "XXXXXO", "XXXXXX"].map(F.noteOfPattern);
  for (let i = 1; i < order.length; i++) assert.ok(order[i] < order[i - 1], "each extra closed hole is lower");
  assert.equal(F.noteOfPattern("XOXOOO"), null, "a gap above a closed hole leaks");
  assert.equal(F.noteOfPattern("OOOXXX"), null);
});
test("the flute has every part the lesson asks for, each with a name", () => {
  for (const id of ["blow", "h1", "h2", "h3", "h4", "h5", "h6", "cork", "open", "bind"]) assert.ok(F.PARTS.some(p => p.id === id), id);
  assert.equal(F.partName("h4"), "Finger hole 4");
  assert.equal(F.HOLE_X.length, 6);
  for (let i = 1; i < 6; i++) assert.ok(F.HOLE_X[i] - F.HOLE_X[i - 1] >= 40, "holes far enough apart to tap");
});
test("tapping: on the beat after a steady device delay; early and late taps count as off", () => {
  const beats = [0, 0.8, 1.6, 2.4, 3.2, 4.0, 4.8, 5.6];
  assert.deepEqual(S.beatScore(beats.map(b => b + 0.2), beats), { on: 8, of: 8, lag: 200 }, "a steady 200 ms delay is left out");
  const ragged = beats.map((b, i) => b + (i % 2 ? 0.25 : 0));
  assert.ok(S.beatScore(ragged, beats).on <= 4, "every other tap 250 ms late");
  assert.deepEqual(S.beatScore([], beats), { on: 0, of: 8, lag: 0 });
});
test("Day 0 lesson: every step is a known kind, ids are unique, and each chapter has steps", () => {
  const steps = P.flatSteps(M0);
  assert.ok(steps.length >= 10);
  const ids = steps.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length, "unique ids");
  for (const s of steps) assert.ok(s.kind === "custom" ? typeof s.make === "function" : S.STEP_KINDS[s.kind], s.id + ": kind " + s.kind);
  for (const c of M0.chapters) assert.ok(c.steps.length > 0, c.title);
  assert.equal(steps[steps.length - 1].id, "done", "it ends on the reward");
  assert.equal(steps[0].kind, "listen", "it starts with a hook");
});
test("Day 0 lesson: a quiz question always has one right answer, and wrong ones explain themselves", () => {
  const quiz = P.flatSteps(M0).find(s => s.kind === "quiz");
  for (const q of quiz.questions) {
    assert.equal(q.options.filter(o => o.right).length, 1, q.q);
    for (const o of q.options.filter(o => !o.right)) assert.ok(o.why, "explains: " + o.text);
  }
  const hook = P.flatSteps(M0).find(s => s.kind === "listen");
  assert.equal(hook.options.filter(o => o.right).length, 1);
});
test("lessons: Day 0 has the lesson, other days none yet", () => {
  assert.equal(lessonForDay(0), M0);
  assert.equal(lessonForDay(5), null);
  assert.equal(LESSONS.m0, M0);
});
console.log("lesson tests: " + n + " passed");
