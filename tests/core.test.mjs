// Tests for the pure core modules (no DOM). Run: node tests/core.test.mjs
import assert from "node:assert/strict";
import { codeOf, fingOf, lessonFor, octName } from "../app/js/core/theory.js";
import { parseNotation, buildEvents, analyzeRange, PRESETS } from "../app/js/core/notation.js";
import { getSettings, saHz } from "../app/js/core/settings.js";
import { CHECK_PLANS, verdict, segmentsFrom, compareToExpected, cleanFrames, tuningOffset, playableOnly } from "../app/js/core/pitch.js";

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (e) { console.error("FAIL:", name); throw e; }
}
function events(text, bpm = 60) {
  const p = parseNotation(text);
  return { ...buildEvents(p.tokens, bpm), skipped: p.skipped };
}
const fmt = ev => ev.map(e => `${codeOf(e.semi)}@${+e.start.toFixed(2)}/${+e.dur.toFixed(2)}`).join(" ");

test("settings defaults without a browser", () => {
  assert.deepEqual(getSettings(), { saNote: 0, saOct: 5, a4: 440, volume: 0.75, deva: false });
  assert.ok(Math.abs(saHz() - 523.25) < 0.01);
});

test("codeOf / octName", () => {
  assert.equal(codeOf(-5), ".P");
  assert.equal(codeOf(12), "S'");
  assert.equal(codeOf(0), "S");
  assert.equal(codeOf(18), "M'");
  assert.equal(octName(-1), "mandra");
});

test("fingOf", () => {
  assert.deepEqual(fingOf(7), { f: "XXXXXX", reg: 2 });
  assert.deepEqual(fingOf(0), { f: "XXXOOO", reg: 1 });
  assert.deepEqual(fingOf(5), { f: "HOOOOO", reg: 1 });
  assert.deepEqual(fingOf(-6), { f: null, reg: 0 });
  assert.deepEqual(fingOf(19), { f: null, reg: 3 });
});

test("lessonFor", () => {
  assert.equal(lessonFor(0), 9);    // S
  assert.equal(lessonFor(-5), 11);  // .P
  assert.equal(lessonFor(6), 14);   // M
  assert.equal(lessonFor(5), 16);   // m
  assert.equal(lessonFor(1), 25);   // r
  assert.equal(lessonFor(14), 22);  // R'
  assert.equal(lessonFor(-6), 99);
});

test("two notes per beat and holds", () => {
  assert.equal(fmt(events(".P.P | .D .P S | .N - .P.P").ev), ".P@0/0.5 .P@0.5/0.5 .D@1/1 .P@2/1 S@3/1 .N@4/2 .P@6/0.5 .P@6.5/0.5");
});

test("dotted rhythm -R", () => {
  assert.equal(fmt(events("G G m P | G -R R -").ev), "G@0/1 G@1/1 m@2/1 P@3/1 G@4/1.5 R@5.5/0.5 R@6/2");
});

test("kan and meend", () => {
  const { ev } = events("{G}R - {R}S - | G~R - S -");
  assert.equal(fmt(ev), "R@0/2 S@2/2 G@4/0.5 R@4.5/1.5 S@6/2");
  assert.equal(ev[0].kan, 4);
  assert.equal(ev[1].kan, 2);
  assert.equal(ev[3].from, 4);
  assert.equal(ev[4].from, null);
});

test("breath marks shorten the note", () => {
  const { ev } = events("G R S .D S R G, P G, D P G R S");
  assert.equal(+ev[6].dur.toFixed(2), 0.88);
  assert.equal(+ev[8].dur.toFixed(2), 0.88);
  assert.equal(ev.length, 14);
});

test("non-notation tokens are skipped", () => {
  const r = events("Line 1:  .P .P .D");
  assert.deepEqual(r.skipped, ["Line", "1:"]);
  assert.equal(fmt(r.ev), ".P@0/1 .P@1/1 .D@2/1");
});

test("andolan and rests", () => {
  const { ev } = events("G^ - _ R");
  assert.equal(ev[0].andolan, true);
  assert.equal(fmt(ev), "G@0/2 R@3/1");
});

test("analyzeRange flags", () => {
  assert.equal(analyzeRange(events("S R G P D S'").ev).fit, "ok");
  assert.equal(analyzeRange(events("S M'").ev).fit, "ceiling");
  assert.equal(analyzeRange(events("S P'").ev).fit, "reg3");
  const below = analyzeRange(events("S .M").ev);
  assert.equal(below.fit, "below");
  assert.equal(below.lesson, 99);
  const tw = analyzeRange(events(PRESETS.find(p => p[0].startsWith("Twinkle"))[1]).ev);
  assert.equal(tw.fit, "ok");
  assert.deepEqual(tw.halves, [5]);
  assert.equal(tw.lesson, 16);
  assert.equal(analyzeRange([]), null);
  assert.deepEqual(analyzeRange(events("{m}R").ev).notes, [2, 5]);
});

test("presets all parse without skipped tokens", () => {
  assert.equal(PRESETS.length, 23);
  PRESETS.forEach(([title, text]) => {
    const r = events(text, 72);
    assert.equal(r.skipped.length, 0, title);
    assert.ok(r.ev.length > 0, title);
  });
});

test("pitch helpers", () => {
  assert.equal(CHECK_PLANS.length, 8);
  assert.deepEqual(verdict(5), ["In tune", "good"]);
  assert.deepEqual(verdict(-20), ["Close", "warn"]);
  assert.deepEqual(verdict(40), ["Adjust", "bad"]);
  const frames = [];
  for (let i = 0; i < 20; i++) frames.push({ s: 0.05 });
  frames.push(null);
  for (let i = 0; i < 20; i++) frames.push({ s: 2.3 });
  const segs = segmentsFrom(frames, 0.03);
  assert.equal(segs.length, 2);
  const rows = compareToExpected(segs, [0, 2, 4]);
  assert.equal(rows[0].status, "ok");
  assert.equal(rows[0].cents, 5);
  assert.equal(rows[1].status, "ok");
  assert.equal(rows[1].verdict[1], "bad");
  assert.equal(rows[2].status, "missing");
  assert.equal(compareToExpected(segs, [])[0].status, "free");
});

test("pitch analysis on real-world recordings", () => {
  const seg = (med, t0, t1) => ({ med, t0, t1 });
  // A short slide between notes must not shift the later notes out of line with the plan.
  const rows = compareToExpected([seg(0, 0, 1), seg(7, 1, 1.3), seg(2, 1.4, 2.4), seg(4, 2.5, 3.5)], [0, 2, 4]);
  assert.deepEqual(rows.map(r => r.status), ["ok", "ok", "ok"]);
  assert.deepEqual(rows.map(r => r.n), [1, 2, 3]);
  // A long wrong note is reported as different; a skipped note as missing.
  assert.deepEqual(compareToExpected([seg(0, 0, 1), seg(5, 1, 2), seg(4, 2, 3)], [0, 2, 4]).map(r => r.status), ["ok", "different", "ok"]);
  assert.deepEqual(compareToExpected([seg(0, 0, 1), seg(4, 1, 2)], [0, 2, 4]).map(r => r.status), ["ok", "missing", "ok"]);
  // Octave errors are folded back and single dropouts filled, so one note stays one segment.
  const fr = [];
  for (let i = 0; i < 12; i++) fr.push({ s: 4.1, f: 1 });
  fr.push({ s: -7.9, f: 0.5 }, null);
  for (let i = 0; i < 12; i++) fr.push({ s: 4.1, f: 1 });
  const clean = cleanFrames(fr);
  assert.ok(clean.every(f => f && Math.abs(f.s - 4.1) < 0.01));
  assert.equal(segmentsFrom(clean, 0.03).length, 1);
  // A flute tuned about half a semitone sharp: notes land near +48 or -50 cents, which is one offset.
  const off = tuningOffset([seg(0.48, 0, 2), seg(9.5, 2, 4), seg(1.52, 4, 6), seg(4.47, 6, 8)]);
  assert.ok(Math.abs(Math.abs(off.cents) - 50) <= 3 && off.spread <= 5, JSON.stringify(off));
  assert.ok(Math.abs(tuningOffset([seg(0.2, 0, 2), seg(2.21, 2, 4)]).cents - 20.5) <= 1);
  const rnd = tuningOffset([seg(0.3, 0, 2), seg(1.9, 2, 4), seg(4.0, 4, 6), seg(6.75, 6, 8)]);
  assert.ok(Math.abs(rnd.cents) < 20 || rnd.spread > 12, "uneven intonation is not mistaken for a flute offset: " + JSON.stringify(rnd));
  // Impossible notes (far below .P) are dropped when most of the recording is playable...
  assert.equal(playableOnly([seg(0, 0, 3), seg(-24, 3, 3.4), seg(2, 3.5, 6)]).length, 2);
  // ...but kept when most of it is out of range (the Sa setting is probably wrong).
  assert.equal(playableOnly([seg(-12, 0, 3), seg(-10, 3, 6), seg(0, 6, 7)]).length, 3);
});

test("beat click accents follow the bar lines", () => {
  const downs = txt => buildEvents(parseNotation(txt).tokens, 60).beats.map(b => b.down ? "X" : ".").join("");
  assert.equal(downs("G R S R | G G G - | R R R - ||"), "X...X...X...");
  // A short first bar is a pickup: the accent falls on the first full bar.
  const hb = buildEvents(parseNotation(".P.P | .D .P S | .N - .P.P | .D .P R ||").tokens, 60);
  assert.equal(hb.barLen, 3);
  assert.equal(hb.beats.map(b => b.down ? "X" : ".").join(""), ".X..X..X..");
  // No bar lines: only the first beat is accented.
  assert.equal(downs("S R G"), "X..");
});

console.log(`core tests: ${passed} passed`);
