// Unit tests for the live-listening logic (core/listen.js) and for how sessions and milestones
// decide what the microphone checks. Readings are simulated: { t, semi, near, cents }.
import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { holdTracker, noteSequencer, phraseMatcher, judgeNote, tapStats, distinctNotes } = await import("../app/js/core/listen.js");
const { echoPhrase } = await import("../app/js/core/live.js");
const { holdSpec } = await import("../app/js/views/session.js");
const { micSpec } = await import("../app/js/views/milestone.js");
const { diagnose } = await import("../app/js/views/coach.js");
const { weeklyMinutes } = await import("../app/js/views/progress.js");

let passed = 0;
const test = (name, fn) => { fn(); passed++; };
const reading = (t, semi) => semi === null ? { t, semi: null, near: null, cents: null } : { t, semi, near: Math.round(semi), cents: Math.round((semi - Math.round(semi)) * 100) };
// Feeds a run of readings 1/30 s apart; returns the last snapshot.
function run(tracker, from, secs, semi) { let s; for (let t = from; t < from + secs; t += 1 / 30) s = tracker.feed(reading(t, typeof semi === "function" ? semi(t) : semi)); return s; }

test("a steady, in-tune note completes the hold", () => {
  const h = holdTracker({ target: 0, seconds: 4, cents: 20 });
  assert.equal(run(h, 0, 3, 0.05).done, false);
  assert.equal(run(h, 3, 1.2, 0.05).done, true);
});

test("a note out of tune, or the wrong note, does not count", () => {
  const h = holdTracker({ target: 0, seconds: 2, cents: 20 });
  assert.equal(run(h, 0, 3, 0.35).held, 0);
  assert.equal(run(h, 3, 3, 2).held, 0);
});

test("a short dropout is forgiven, a real break restarts the hold", () => {
  const h = holdTracker({ target: 0, seconds: 4, cents: 20, gap: 0.3 });
  run(h, 0, 2, 0); run(h, 2, 0.15, null);
  assert.ok(run(h, 2.15, 2, 0).done, "0.15 s gap bridged");
  const h2 = holdTracker({ target: 0, seconds: 4, cents: 20, gap: 0.3 });
  run(h2, 0, 2, 0); run(h2, 2, 0.6, null);
  const s = run(h2, 2.6, 2, 0);
  assert.equal(s.done, false); assert.ok(s.best >= 1.9);
});

test("any-note mode follows a steady note and rejects a wandering one", () => {
  const h = holdTracker({ target: null, seconds: 3, cents: 25 });
  assert.ok(run(h, 0, 3.2, 4.1).done);
  const w = holdTracker({ target: null, seconds: 3, cents: 25 });
  assert.equal(run(w, 0, 4, t => 4 + Math.sin(t * 3) * 0.8).done, false);
});

test("the drone's low strings are not taken for a held note", () => {
  const h = holdTracker({ target: null, seconds: 2, cents: 25 });
  assert.equal(run(h, 0, 3, -12).held, 0);
});

test("the sequencer reports each steady note once", () => {
  const s = noteSequencer(), notes = [];
  const feed = (from, secs, semi) => { for (let t = from; t < from + secs; t += 1 / 30) { const n = s.feed(reading(t, semi)); if (n) notes.push(n.semi); } };
  feed(0, 0.5, 0); feed(0.5, 0.05, 1.4); feed(0.55, 0.5, 2); feed(1.05, 0.3, null); feed(1.35, 0.5, 2); feed(1.85, 0.5, 4.1);
  assert.deepEqual(notes, [0, 2, 2, 4]);
});

test("phrases are matched note by note", () => {
  assert.deepEqual(distinctNotes([4, 4, 4, 2, 2, 0]), [4, 2, 0]);
  const m = phraseMatcher([0, 2, 4]);
  m.feed(0); m.feed(2);
  const st = m.feed(16);
  assert.deepEqual(st.marks, ["ok", "ok", "octave"]);
  assert.equal(st.done, true); assert.equal(st.clean, false);
  assert.equal(judgeNote(7, 4), "wrong");
});

test("repeated notes: heard twice, or accepted when the next note arrives", () => {
  const a = phraseMatcher([4, 4, 2]);
  a.feed(4); a.feed(4);
  assert.equal(a.feed(2).clean, true, "a detected repeat");
  const b = phraseMatcher([4, 4, 2]);
  b.feed(4);
  assert.equal(b.feed(2).clean, true, "a repeat too smooth to detect");
  const c = phraseMatcher([0, 2, 2]);
  c.feed(0); c.feed(2);
  assert.equal(c.onlyRepeatsLeft(), true);
  assert.equal(c.completeRepeats().clean, true, "a trailing repeat");
  const d = phraseMatcher([4, 4, 2]);
  d.feed(5);
  assert.equal(d.feed(2).clean, false, "a wrong first note still fails");
  const e = phraseMatcher([0, 2, 4, 4]);
  e.feed(0); e.feed(2); e.feed(4);
  const st = e.feed(7);
  assert.equal(st.done, true); assert.equal(st.clean, false, "a wrong note in place of a final repeat fails");
  const f = phraseMatcher([0, 0]);
  f.feed(0);
  assert.equal(f.feed(12).clean, false, "an octave in place of a repeat fails");
  const g = phraseMatcher([0, 2]);
  g.feed(0); g.feed(2);
  assert.deepEqual(g.feed(4), g.state(), "notes after the end change nothing");
});

test("a tongued repeat (volume dip, same pitch) is a new note", () => {
  const s = noteSequencer(), notes = [];
  const feed = (from, secs, semi, level) => { for (let t = from; t < from + secs; t += 1 / 30) { const n = s.feed(Object.assign(reading(t, semi), { level })); if (n) notes.push(n.semi); } };
  feed(0, 0.5, 4, 0.2); feed(0.5, 0.07, 4, 0.05); feed(0.57, 0.5, 4, 0.2);
  feed(1.07, 0.6, 4, 0.17); // a gentle swell is not a new note
  assert.deepEqual(notes, [4, 4]);
});

test("tap statistics", () => {
  const st = tapStats([-20, -10, 0, 10, 20, 90]);
  assert.equal(st.n, 6); assert.equal(st.mean, 15);
  assert.ok(Math.abs(st.within - 5 / 6) < 1e-9);
  assert.equal(tapStats([]), null);
});

test("echo phrases move by step and never repeat a note back to back", () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 200; k++) {
    const p = echoPhrase([0, 2, 4, 5, 7], 5, rnd);
    assert.equal(p.length, 5);
    for (let i = 1; i < p.length; i++) assert.notEqual(p[i], p[i - 1]);
  }
});

test("long-tone session steps get the right live check", () => {
  assert.deepEqual(holdSpec({ id: "T", text: "Long tones on `.P .D .N S R G`, 8-10 s each, with the drone." }), { targets: [-5, -3, -1, 0, 2, 4], seconds: 8, cents: 30 });
  assert.deepEqual(holdSpec({ id: "T", text: "S R G long tones, 6 s each." }).targets, [0, 2, 4]);
  assert.deepEqual(holdSpec({ id: "K", text: "First sound on Sa (`XXX OOO`), 3 x 4 min with 1-min rests." }), { targets: [0], seconds: 3, cents: 30 });
  assert.equal(holdSpec({ id: "T", text: "Long tones with the drone." }).targets, null);
  assert.equal(holdSpec({ id: "READ", text: "Read L07: long tones, tuner and drone." }), null);
  assert.equal(holdSpec({ id: "W", text: "Read L02 (posture and holding) and L03 (breathing)." }), null);
});

test("milestone items the microphone can judge", () => {
  assert.deepEqual(micSpec("Long tone Sa", "Held 8 s; tuner stays within +/-20 cents; no breaks or cracks"), { kind: "hold", targets: [0], seconds: 8, cents: 20 });
  assert.deepEqual(micSpec("Long tones Re and Ga", "Each held 6 s, clear").targets, [2, 4]);
  assert.deepEqual(micSpec("`S R G R S` at 50 BPM, 1 note per beat", "3 clean repetitions in a row, no blips between notes"), { kind: "phrase", phrase: [0, 2, 4, 2, 0], reps: 3 });
  assert.deepEqual(micSpec("Kalyan scale `S R G M P D N S'` and back, 60 BPM", "No missed notes").phrase, [0, 2, 4, 6, 7, 9, 11, 12, 11, 9, 7, 6, 4, 2, 0]);
  assert.equal(micSpec("Posture video (30 s, side view)", "Tall relaxed spine"), null);
});

test("the coach hears common problems in a held Sa", () => {
  const hold = (secs, f) => { const out = []; for (let t = 0; t < secs; t += 1 / 30) out.push(f(t)); return out; };
  const tone = (t, semi, level) => Object.assign(reading(t, semi), { level: level === undefined ? 0.2 : level });
  assert.deepEqual(diagnose(hold(6, t => tone(t, 0.03))), [], "a clear, steady, in-tune Sa: nothing to fix");
  assert.equal(diagnose(hold(6, t => tone(t, null, 0.002)))[0].ts, "TS-01", "silence");
  assert.ok(diagnose(hold(6, t => tone(t, t % 1 < 0.5 ? null : 0, 0.2))).some(f => f.ts === "TS-01"), "half the sound is air");
  assert.ok(diagnose(hold(6, t => tone(t, Math.floor(t * 2) % 3 === 0 ? 12 : 0))).some(f => f.ts === "TS-02"), "octave jumps are squeaks");
  assert.ok(diagnose(hold(6, t => tone(t, -0.35))).some(f => f.ts === "TS-05" && /flat/.test(f.text)), "35 cents flat");
  assert.ok(diagnose(hold(6, t => tone(t, 2))).some(f => f.ts === "TS-06"), "Re instead of Sa: a fingering problem");
  assert.ok(diagnose(hold(2.5, t => tone(t, 0))).some(f => f.ts === "TS-07"), "a short hold: breath");
});

test("minutes per week", () => {
  const dates = new Map([["2026-10-26", 30], ["2026-10-30", 15], ["2026-10-25", 40], ["2026-10-12", 20]]);
  const w = weeklyMinutes(dates, "2026-10-30", 3);
  assert.deepEqual(w.map(x => x.start), ["2026-10-12", "2026-10-19", "2026-10-26"]);
  assert.deepEqual(w.map(x => x.mins), [20, 40, 45]);
});

console.log(`live tests: ${passed} passed`);
