// Unit tests for the live-listening logic (core/listen.js) and for how sessions and milestones
// decide what the microphone checks. Readings are simulated: { t, semi, near, cents }.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { holdTracker, noteSequencer, phraseMatcher, judgeNote, tapStats, distinctNotes } = await import("../app/js/core/listen.js");
const { echoPhrase } = await import("../app/js/core/live.js");
const { holdSpec } = await import("../app/js/views/session.js");
const { micSpec } = await import("../app/js/views/milestone.js");
const { diagnose } = await import("../app/js/views/coach.js");
const { weeklyMinutes } = await import("../app/js/views/progress.js");
const { postureChecks } = await import("../app/js/posture.js");
const { analyzeAudioBuffer } = await import("../app/js/core/pitch.js");

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; };
const reading = (t, semi) => semi === null ? { t, semi: null, near: null, cents: null } : { t, semi, near: Math.round(semi), cents: Math.round((semi - Math.round(semi)) * 100) };
// Feeds a run of readings 1/30 s apart; returns the last snapshot.
function run(tracker, from, secs, semi) { let s; for (let t = from; t < from + secs; t += 1 / 30) s = tracker.feed(reading(t, typeof semi === "function" ? semi(t) : semi)); return s; }

await test("a steady, in-tune note completes the hold", () => {
  const h = holdTracker({ target: 0, seconds: 4, cents: 20 });
  assert.equal(run(h, 0, 3, 0.05).done, false);
  assert.equal(run(h, 3, 1.2, 0.05).done, true);
});

await test("a note out of tune, or the wrong note, does not count", () => {
  const h = holdTracker({ target: 0, seconds: 2, cents: 20 });
  assert.equal(run(h, 0, 3, 0.35).held, 0);
  assert.equal(run(h, 3, 3, 2).held, 0);
});

await test("a short dropout is forgiven, a real break restarts the hold", () => {
  const h = holdTracker({ target: 0, seconds: 4, cents: 20, gap: 0.3 });
  run(h, 0, 2, 0); run(h, 2, 0.15, null);
  assert.ok(run(h, 2.15, 2, 0).done, "0.15 s gap bridged");
  const h2 = holdTracker({ target: 0, seconds: 4, cents: 20, gap: 0.3 });
  run(h2, 0, 2, 0); run(h2, 2, 0.6, null);
  const s = run(h2, 2.6, 2, 0);
  assert.equal(s.done, false); assert.ok(s.best >= 1.9);
});

await test("any-note mode follows a steady note and rejects a wandering one", () => {
  const h = holdTracker({ target: null, seconds: 3, cents: 25 });
  assert.ok(run(h, 0, 3.2, 4.1).done);
  const w = holdTracker({ target: null, seconds: 3, cents: 25 });
  assert.equal(run(w, 0, 4, t => 4 + Math.sin(t * 3) * 0.8).done, false);
});

await test("the drone's low strings are not taken for a held note", () => {
  const h = holdTracker({ target: null, seconds: 2, cents: 25 });
  assert.equal(run(h, 0, 3, -12).held, 0);
});

await test("the sequencer reports each steady note once", () => {
  const s = noteSequencer(), notes = [];
  const feed = (from, secs, semi) => { for (let t = from; t < from + secs; t += 1 / 30) { const n = s.feed(reading(t, semi)); if (n) notes.push(n.semi); } };
  feed(0, 0.5, 0); feed(0.5, 0.05, 1.4); feed(0.55, 0.5, 2); feed(1.05, 0.3, null); feed(1.35, 0.5, 2); feed(1.85, 0.5, 4.1);
  assert.deepEqual(notes, [0, 2, 2, 4]);
});

await test("phrases are matched note by note", () => {
  assert.deepEqual(distinctNotes([4, 4, 4, 2, 2, 0]), [4, 2, 0]);
  const m = phraseMatcher([0, 2, 4]);
  m.feed(0); m.feed(2);
  const st = m.feed(16);
  assert.deepEqual(st.marks, ["ok", "ok", "octave"]);
  assert.equal(st.done, true); assert.equal(st.clean, false);
  assert.equal(judgeNote(7, 4), "wrong");
});

await test("repeated notes: heard twice, or accepted when the next note arrives", () => {
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

await test("a tongued repeat (volume dip, same pitch) is a new note", () => {
  const s = noteSequencer(), notes = [];
  const feed = (from, secs, semi, level) => { for (let t = from; t < from + secs; t += 1 / 30) { const n = s.feed(Object.assign(reading(t, semi), { level })); if (n) notes.push(n.semi); } };
  feed(0, 0.5, 4, 0.2); feed(0.5, 0.07, 4, 0.05); feed(0.57, 0.5, 4, 0.2);
  feed(1.07, 0.6, 4, 0.17); // a gentle swell is not a new note
  assert.deepEqual(notes, [4, 4]);
});

await test("tap statistics", () => {
  const st = tapStats([-20, -10, 0, 10, 20, 90]);
  assert.equal(st.n, 6); assert.equal(st.mean, 15);
  assert.ok(Math.abs(st.within - 5 / 6) < 1e-9);
  assert.equal(tapStats([]), null);
});

await test("echo phrases move by step and never repeat a note back to back", () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 200; k++) {
    const p = echoPhrase([0, 2, 4, 5, 7], 5, rnd);
    assert.equal(p.length, 5);
    for (let i = 1; i < p.length; i++) assert.notEqual(p[i], p[i - 1]);
  }
});

await test("long-tone session steps get the right live check", () => {
  assert.deepEqual(holdSpec({ id: "T", text: "Long tones on `.P .D .N S R G`, 8-10 s each, with the drone." }), { targets: [-5, -3, -1, 0, 2, 4], seconds: 8, cents: 30 });
  assert.deepEqual(holdSpec({ id: "T", text: "S R G long tones, 6 s each." }).targets, [0, 2, 4]);
  assert.deepEqual(holdSpec({ id: "K", text: "First sound on Sa (`XXX OOO`), 3 x 4 min with 1-min rests." }), { targets: [0], seconds: 3, cents: 30 });
  assert.equal(holdSpec({ id: "T", text: "Long tones with the drone." }).targets, null);
  assert.equal(holdSpec({ id: "READ", text: "Read L07: long tones, tuner and drone." }), null);
  assert.equal(holdSpec({ id: "W", text: "Read L02 (posture and holding) and L03 (breathing)." }), null);
});

await test("milestone items the microphone can judge", () => {
  assert.deepEqual(micSpec("Long tone Sa", "Held 8 s; tuner stays within +/-20 cents; no breaks or cracks"), { kind: "hold", targets: [0], seconds: 8, cents: 20 });
  assert.deepEqual(micSpec("Long tones Re and Ga", "Each held 6 s, clear").targets, [2, 4]);
  assert.deepEqual(micSpec("`S R G R S` at 50 BPM, 1 note per beat", "3 clean repetitions in a row, no blips between notes"), { kind: "phrase", phrase: [0, 2, 4, 2, 0], reps: 3 });
  assert.deepEqual(micSpec("Kalyan scale `S R G M P D N S'` and back, 60 BPM", "No missed notes").phrase, [0, 2, 4, 6, 7, 9, 11, 12, 11, 9, 7, 6, 4, 2, 0]);
  assert.equal(micSpec("Posture video (30 s, side view)", "Tall relaxed spine"), null);
});

await test("the coach hears common problems in a held Sa", () => {
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

await test("minutes per week", () => {
  const dates = new Map([["2026-10-26", 30], ["2026-10-30", 15], ["2026-10-25", 40], ["2026-10-12", 20]]);
  const w = weeklyMinutes(dates, "2026-10-30", 3);
  assert.deepEqual(w.map(x => x.start), ["2026-10-12", "2026-10-19", "2026-10-26"]);
  assert.deepEqual(w.map(x => x.mins), [20, 40, 45]);
});

await test("source files contain no control characters (a lost backslash in a regex)", () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const root = fileURLToPath(new URL("../app/js", import.meta.url));
  const bad = walk(root).filter(f => f.endsWith(".js")).filter(f => /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(bad, []);
});

await test("posture checks from body landmarks", () => {
  // A relaxed player facing the camera: ears level, shoulders level and low, elbows down, hands level.
  const lm = [];
  const set = (i, x, y) => { lm[i] = { x, y, visibility: 0.99 }; };
  const good = () => { set(7, 0.45, 0.30); set(8, 0.55, 0.30); set(11, 0.40, 0.45); set(12, 0.60, 0.45); set(13, 0.35, 0.62); set(14, 0.65, 0.62); set(15, 0.42, 0.50); set(16, 0.62, 0.52); };
  good();
  assert.ok(postureChecks(lm).every(c => c.ok), JSON.stringify(postureChecks(lm)));
  set(11, 0.40, 0.40); // the left shoulder rises
  assert.equal(postureChecks(lm).find(c => c.id === "shoulders").ok, false);
  good(); set(11, 0.40, 0.355); set(12, 0.60, 0.355); // both shoulders up toward the ears
  assert.equal(postureChecks(lm).find(c => c.id === "raised").ok, false);
  good(); set(7, 0.45, 0.26); set(8, 0.55, 0.34); // head tilted
  assert.equal(postureChecks(lm).find(c => c.id === "head").ok, false);
  good(); lm[15].visibility = 0.1;
  assert.equal(postureChecks(lm).some(c => c.id === "flute"), false, "unseen hands are not judged");
});

await test("tone estimate: clearer, steadier tone scores higher", async () => {
  const make = (noise, wobble, secs = 5, sr = 44100) => {
    const n = sr * secs, d = new Float32Array(n); let ph = 0, seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 * 2 - 1;
    for (let i = 0; i < n; i++) {
      const t = i / sr; ph += 2 * Math.PI * 523.25 * Math.pow(2, wobble * Math.sin(2 * Math.PI * 4.5 * t) / 1200) / sr;
      d[i] = 0.3 * (Math.sin(ph) + 0.2 * Math.sin(2 * ph) + noise * rnd()) * Math.min(1, t * 20, (secs - t) * 20);
    }
    return { getChannelData: () => d, sampleRate: sr, length: n, duration: secs };
  };
  const scores = [];
  for (const [noise, wob] of [[0.05, 3], [0.6, 10], [1.4, 18], [3, 30]]) scores.push((await analyzeAudioBuffer(make(noise, wob))).tone.score);
  assert.deepEqual(scores, [4, 3, 2, 1]);
});

await test("game courses are reproducible from a seed, and stay in the note set", async () => {
  const { seeded, nextNote } = await import("../app/js/games.js");
  const course = seed => { const r = seeded(seed); let n = 0; const out = []; for (let i = 0; i < 30; i++) { n = nextNote([0, 2, 4, 5, 7], n, r); out.push(n); } return out; };
  assert.deepEqual(course(42), course(42));
  assert.notDeepEqual(course(42), course(43));
  assert.ok(course(7).every(n => [0, 2, 4, 5, 7].includes(n)));
});

await test("quests: the same three all day, and results complete them once", async () => {
  const { questsFor, advanceQuests, questState } = await import("../app/js/fun.js");
  const { getState } = await import("../app/js/state.js");
  const s = getState();
  const a = questsFor("2026-10-30", s), b = questsFor("2026-10-30", s);
  assert.deepEqual(a, b);
  assert.equal(a.length, 3); assert.equal(a[0].id, "session");
  assert.equal(new Set(a.map(q => q.id)).size, 3);
  // Steer is "once": a high score completes it; a second one adds no more XP.
  const q = questState().list.find(x => x.id !== "session");
  const results = { hold: { type: "hold", seconds: 30 }, echo: { type: "echo", correct: true }, steer: { type: "game", game: "steer", score: 99 }, balloon: { type: "game", game: "balloon", score: 99 },
    falling: { type: "game", game: "falling", stars: 3 }, jam: { type: "game", game: "jam", minutes: 5 }, tap: { type: "tap", within: 0.9 }, song: { type: "play", n: 10, ok: 10 },
    boat: { type: "game", game: "boat", score: 99 }, bullseye: { type: "game", game: "bullseye", score: 99 }, road: { type: "game", game: "road", score: 99 }, wrong: { type: "game", game: "wrong", score: 9 },
    sam: { type: "game", game: "sam", hits: 7 }, ornament: { type: "game", game: "kanflick", score: 90 }, swell: { type: "game", game: "swell", score: 90 },
    phrase: { type: "game", game: "phrase", score: 90 }, laya: { type: "game", game: "laya", score: 90 }, tihai: { type: "game", game: "tihai", landed: true } };
  const before = questState().xp;
  for (let i = 0; i < 3; i++) advanceQuests(results[q.id]);
  const after = questState();
  assert.ok(after.list.find(x => x.id === q.id).done, q.id + " done");
  assert.ok(after.xp >= before + 20 && after.xp <= before + 44, "XP once (plus a possible bonus)");
  advanceQuests(results[q.id]);
  assert.equal(questState().xp, after.xp);
  // Every quest in the pool can be completed by some result.
  const { POOL } = await import("../app/js/fun.js");
  for (const def of POOL) assert.ok(results[def.id] && def.step(results[def.id], def.goal(s)) > 0, "a result completes the " + def.id + " quest");
  assert.equal(advanceQuests({ type: "nothing" }).length, 0);
});

await test("challenge links round-trip and reject junk", async () => {
  globalThis.location = { origin: "https://x.test", pathname: "/app/" };
  const { encodePayload } = await import("../app/js/views/progress.js");
  const { decodeChallenge } = await import("../app/js/views/play.js");
  const c = decodeChallenge(encodePayload({ g: "steer", l: "srgmp", s: 1234, n: 17, by: "Asha" }));
  assert.deepEqual(c, { g: "steer", l: "srgmp", s: 1234, n: 17, p: [], by: "Asha" });
  assert.deepEqual(decodeChallenge(encodePayload({ g: "phrase", p: [0, 2, "x", 99, 4] })).p, [0, 2, 4]);
  assert.equal(decodeChallenge(encodePayload({ g: "evil" })), null);
  // The other scored games can be challenges too (06 S6); Jam cannot.
  assert.equal(decodeChallenge(encodePayload({ g: "bullseye", n: 34, by: "Asha" })).n, 34);
  assert.equal(decodeChallenge(encodePayload({ g: "jam", n: 3 })), null);
  assert.equal(decodeChallenge("%%%"), null);
});

await test("tone check: a result as three chips (Steady, In tune, Air), each with its fix", async () => {
  const { toneChips } = await import("../app/js/views/tone.js");
  const good = { pitchSD: 4, levelCV: 9, air: 0.5, attack: 100, overshoot: 20, cents: -5 };
  assert.deepEqual(toneChips(good).map(c => [c.key, c.ok, c.ts]), [["steady", true, "TS-07"], ["tune", true, "TS-05"], ["air", true, "TS-01"]]);
  assert.deepEqual(toneChips(Object.assign({}, good, { air: 6, cents: 30 })).map(c => c.ok), [true, false, false]);
  assert.deepEqual(toneChips(Object.assign({}, good, { pitchSD: 25 })).map(c => c.ok), [false, true, true]);
});

await test("a composed grid becomes notation with holds, rests and bars", async () => {
  const { gridNotation } = await import("../app/js/views/compose.js");
  assert.equal(gridNotation([0, "hold", 2, null, 4, 5, 7, "hold"]), "S - R _ | G m P - ||");
});

await test("levels: named, from Level 1 at 0 XP, each harder than the last", async () => {
  const { LEVELS, levelOf } = await import("../app/js/xp.js");
  assert.equal(LEVELS[0].level, 1); assert.equal(LEVELS[0].xp, 0);
  assert.equal(levelOf(0).level, 1); assert.equal(levelOf(499).level, 1); assert.equal(levelOf(500).level, 2);
  assert.equal(levelOf(150000).level, 25);
  for (let i = 2; i < LEVELS.length; i++) assert.ok(LEVELS[i].xp - LEVELS[i - 1].xp > LEVELS[i - 1].xp - LEVELS[i - 2].xp, "gaps grow");
  assert.ok(LEVELS.every(l => l.en && /[ऀ-ॿ]/.test(l.hi)), "English and Hindi names");
  const top = levelOf(1e9); assert.equal(top.level, LEVELS.length); assert.equal(top.next, null);
  assert.deepEqual([levelOf(750).into, levelOf(750).need, levelOf(750).pct], [250, 1000, 25]);
});

await test("XP: daily caps, once-only rewards, small XP for every game round", async () => {
  const { award, xpState } = await import("../app/js/xp.js");
  const t0 = xpState().total;
  let echo = 0; for (let i = 0; i < 20; i++) echo += award("echo");
  assert.equal(echo, 30, "play back is capped at 30 a day");
  assert.equal(award("milestone", { key: "M9" }), 300);
  assert.equal(award("milestone", { key: "M9" }), 0, "a milestone pays once");
  let games = 0; for (let i = 0; i < 50; i++) games += award("game");
  assert.equal(games, 150, "every game round: 3 XP, no cap");
  assert.equal(award("minutes", { amount: 90 }), 60, "practice minutes are capped at 60 a day");
  assert.equal(award("nonsense"), 0);
  assert.equal(xpState().total, t0 + 30 + 300 + 150 + 60);
});

await test("XP is rebuilt from history for learners who practised before levels existed", async () => {
  const { xpFromHistory } = await import("../app/js/xp.js");
  const s = { days: { 1: { done: true, blocks: { W: true, T: true } }, 2: { done: false } }, log: [{ date: "2026-01-01", minutes: 90 }, { date: "2026-01-02", minutes: 20 }],
    milestones: { M1: { status: "passed" }, M2: { status: "failed" } }, reviews: { a: { stage: 2 } }, live: { points: 40 }, recordings: 1 };
  assert.equal(xpFromHistory(s), (50 + 20) + (60 + 20) + 300 + 20 + 40 + 15);
});

console.log(`live tests: ${passed} passed`);
