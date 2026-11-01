// The lesson player's pure parts (app/js/lesson/) and the shape of the Day 0 lesson (app/js/lessons/m0.js).
import assert from "node:assert/strict";
const F = await import("../app/js/lesson/flute.js").catch(e => { console.error(e); process.exit(1); });
const S = await import("../app/js/lesson/steps.js");
const K = await import("../app/js/lesson/kinds2.js");
const K3 = await import("../app/js/lesson/kinds3.js");
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
test("lessons: each day has at most one lesson, and Day 0 has M0", () => {
  assert.equal(lessonForDay(0), M0);
  assert.equal(LESSONS.m0, M0);
  const days = Object.values(LESSONS).map(l => l.day);
  assert.equal(new Set(days).size, days.length, "one lesson a day");
});
test("every lesson: known step kinds, unique ids, a reward at the end, a finish, and right answers", () => {
  for (const l of Object.values(LESSONS)) {
    const steps = P.flatSteps(l), ids = steps.map(s => s.id);
    assert.equal(new Set(ids).size, ids.length, l.id + ": unique ids");
    for (const s of steps) assert.ok(s.kind === "custom" ? typeof s.make === "function" : S.STEP_KINDS[s.kind], l.id + "/" + s.id + ": kind " + s.kind);
    assert.equal(steps[steps.length - 1].kind, "custom", l.id + ": ends on the reward");
    assert.equal(typeof l.finish, "function", l.id + ": finish");
    assert.ok(l.title && l.minutes > 0, l.id + ": title and minutes");
    for (const s of steps.filter(x => x.kind === "quiz")) for (const q of s.questions) {
      assert.equal(q.options.filter(o => o.right).length, 1, l.id + ": one right answer: " + q.q);
      for (const o of q.options.filter(o => !o.right)) assert.ok(o.why, l.id + ": a wrong answer explains itself: " + o.text);
    }
    for (const s of steps.filter(x => x.kind === "tapquiz")) for (const q of s.questions) assert.ok(/^h[1-6]$|^blow$|^cork$|^open$|^bind$/.test(q.answer), l.id + ": a flute part: " + q.answer);
  }
});
test("hiss: timed from the first sound to the end, evenness as the spread of the level", () => {
  const frames = [];
  for (let t = 0; t < 20; t += 0.05) frames.push({ t, level: t >= 1 && t < 17 ? 0.05 : 0.001 });
  const r = K.hissResult(frames, 0.001);
  assert.ok(Math.abs(r.seconds - 16) < 0.2, "16 s: " + r.seconds);
  assert.equal(r.spread, 0, "perfectly even");
  const fading = frames.map(f => ({ t: f.t, level: f.t >= 1 && f.t < 17 ? 0.08 * (1 - (f.t - 1) / 20) : 0.001 }));
  assert.ok(K.hissResult(fading, 0.001).spread > 10, "a fading hiss is uneven");
  assert.equal(K.hissResult([{ t: 0, level: 0.001 }], 0.001).seconds, 0, "no hiss");
  const gap = frames.map(f => ({ t: f.t, level: f.t >= 8 && f.t < 9 ? 0.001 : f.level }));
  assert.ok(Math.abs(K.hissResult(gap, 0.001).seconds - 7) < 0.2, "a second of silence ends the hiss");
});
test("first sound: L04's table from one reading", () => {
  assert.equal(K.soundVerdict({ level: 0.001, semi: null }), "quiet");
  assert.equal(K.soundVerdict({ level: 0.05, semi: null }), "air");
  assert.equal(K.soundVerdict({ level: 0.05, semi: 0.1, near: 0 }), "note");
  assert.equal(K.soundVerdict({ level: 0.05, semi: 12, near: 12 }), "squeal");
  assert.equal(K.soundVerdict({ level: 0.05, semi: 2, near: 2 }), "other");
});
test("rhythm: note starts from the course notation, and taps scored against them", () => {
  assert.deepEqual(K.lineOnsets("S S SS S"), { onsets: [0, 1, 2, 2.5, 3], beats: 4 });
  assert.deepEqual(K.lineOnsets("S - S -"), { onsets: [0, 2], beats: 4 }, "a held note has one start");
  assert.deepEqual(K.lineOnsets("S _ S _").onsets, [0, 2], "a rest has none");
  assert.deepEqual(K.lineOnsets("SSSS S").onsets, [0, 0.25, 0.5, 0.75, 1]);
  const exp = [0, 1, 2, 3];
  assert.deepEqual(K.rhythmScore([0.15, 1.15, 2.15, 3.15], exp), { hit: 4, of: 4, extra: 0, lag: 150 }, "a steady delay is left out");
  assert.equal(K.rhythmScore([0, 1, 2.5, 3], exp).hit, 3, "a tap half a beat off misses");
  assert.equal(K.rhythmScore([0, 0.5, 1, 2, 3], exp).extra, 1, "an extra tap");
  assert.equal(K.rhythmScore([], exp).hit, 0);
});
test("hum: any octave of Sa is Sa; the distance is the shorter way round", () => {
  assert.equal(K.centsFromSa(0), 0);
  assert.equal(K.centsFromSa(-12), 0, "an octave down");
  assert.equal(K.centsFromSa(-24.2), -20);
  assert.equal(K.centsFromSa(11.7), -30, "just below the upper Sa");
  assert.equal(K.centsFromSa(6), 600);
  assert.equal(K.centsFromSa(null), null);
});
test("beats: two notes a few cents apart waver; in tune, they do not", () => {
  const L = K3;
  assert.equal(L.beatRate(0, 523.25), 0);
  assert.ok(Math.abs(L.beatRate(-30, 523.25) - 9) < 0.2, "30 cents at Sa: about 9 beats a second");
  assert.ok(L.beatRate(10, 523.25) < L.beatRate(20, 523.25), "closer is slower");
});
test("taal: claps on sam and tali, waves on khali; presses scored by kind and time", () => {
  assert.deepEqual(K3.taalActions("teentaal"), [{ beat: 1, act: "clap" }, { beat: 5, act: "clap" }, { beat: 9, act: "wave" }, { beat: 13, act: "clap" }]);
  assert.deepEqual(K3.taalActions("keherwa").map(a => a.act), ["clap", "wave"]);
  for (const [k, t] of Object.entries(K3.TAALS)) assert.equal(t.bols.length, t.beats, k + ": one bol a beat");
  const exp = [{ t: 0, act: "clap" }, { t: 2, act: "wave" }, { t: 4, act: "clap" }];
  assert.deepEqual(K3.clapScore([{ t: 0.1, act: "clap" }, { t: 2.05, act: "wave" }, { t: 4.2, act: "clap" }], exp), { hit: 3, of: 3, wrong: 0 });
  assert.deepEqual(K3.clapScore([{ t: 0, act: "clap" }, { t: 2, act: "clap" }], exp), { hit: 1, of: 3, wrong: 1 }, "a clap on khali is wrong");
});
test("half-hole: covered is Ga, open is tivra Ma, the sweet spot is shuddha Ma", () => {
  for (const sweet of [0.4, 0.5, 0.6]) {
    assert.equal(K3.halfHoleSemi(1, sweet), 4);
    assert.equal(K3.halfHoleSemi(0, sweet), 6);
    assert.ok(Math.abs(K3.halfHoleSemi(sweet, sweet) - 5) < 1e-9);
    assert.ok(K3.halfHoleSemi(sweet + 0.05, sweet) < 5 && K3.halfHoleSemi(sweet - 0.05, sweet) > 5, "more cover, lower");
  }
});
console.log("lesson tests: " + n + " passed");
