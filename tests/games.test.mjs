// The pure parts of the games in app/js/games2.js: scoring, rounds and judging.
import assert from "node:assert/strict";
const G = await import("../app/js/games2.js").catch(e => { console.error(e); process.exit(1); });
const { seeded } = await import("../app/js/games.js");
let n = 0;
const test = (name, fn) => { try { fn(); n++; } catch (e) { console.error("FAIL " + name); throw e; } };

test("bullseye: 10 points within 5 cents, nothing beyond 40, either side", () => {
  assert.deepEqual([0, 5, -5, 9, 14, -20, 39, 41, -80].map(G.bullseyeScore), [10, 10, 10, 8, 6, 4, 2, 0, 0]);
});
test("glide road: holds, then glides smoothly to a different note; before the start it is the first note", () => {
  const set = [0, 2, 4, 5, 7], road = G.makeRoad(set, seeded(3), 20);
  assert.ok(road[road.length - 1].t1 >= 20);
  assert.equal(G.roadAt(road, -1), set[0]);
  for (let i = 0; i < road.length; i += 2) { assert.equal(road[i].from, road[i].to, "a hold"); assert.notEqual(road[i + 1].from, road[i + 1].to, "a glide moves"); }
  const g = road[1], mid = G.roadAt(road, (g.t0 + g.t1) / 2);
  assert.ok(Math.abs(mid - (g.from + g.to) / 2) < 0.01, "half way through a glide is half way between");
  for (let t = 0; t < 20; t += 0.05) assert.ok(Math.abs(G.roadAt(road, t + 0.05) - G.roadAt(road, t)) < 0.5, "no jumps");
});
test("wrong note: one note changes, never the first, to a nearby note of the set", () => {
  const set = [0, 2, 4, 5, 7];
  for (let s = 1; s < 200; s++) {
    const r = G.wrongNoteRound(set, 5, seeded(s));
    const diff = r.phrase.map((x, i) => x !== r.changed[i] ? i : -1).filter(i => i >= 0);
    assert.deepEqual(diff, [r.pos]); assert.ok(r.pos >= 1);
    assert.ok(set.includes(r.changed[r.pos]) && Math.abs(r.changed[r.pos] - r.phrase[r.pos]) <= 4);
  }
});
test("bingo: 9 different notes from the pool; lines are rows, columns and diagonals", () => {
  const card = G.bingoCard(seeded(9));
  assert.equal(new Set(card).size, 9); assert.ok(card.every(x => G.BINGO_POOL.includes(x)));
  const m = Array(9).fill(false);
  assert.equal(G.bingoLine(m), null);
  [0, 4, 8].forEach(i => { m[i] = true; }); assert.deepEqual(G.bingoLine(m), [0, 4, 8]);
  assert.equal(G.bingoLine([true, true, false, false, false, true, false, false, false]), null);
  assert.equal(G.shuffled(G.BINGO_POOL, seeded(2)).slice().sort((a, b) => a - b).join(), G.BINGO_POOL.slice().sort((a, b) => a - b).join());
});
test("higher or lower: answers, and pairs that narrow as the streak grows", () => {
  assert.deepEqual([G.compareNotes(0, 4), G.compareNotes(4, 0), G.compareNotes(2, 2)], ["higher", "lower", "same"]);
  const gaps = streak => { const r = seeded(5), out = []; for (let i = 0; i < 300; i++) { const [a, b] = G.higherLowerPair(r, streak); if (a !== b) out.push(Math.abs(b - a)); } return out; };
  assert.ok(Math.min(...gaps(0)) >= 3 && Math.max(...gaps(10)) <= 2);
});
test("catch the sam: perfect within 60 ms, good within 150 ms, early or late", () => {
  const sams = [10, 15.6, 21.2], beat = 0.7;
  assert.equal(G.samJudge(15.63, sams, beat).kind, "perfect");
  const late = G.samJudge(15.7, sams, beat); assert.equal(late.kind, "good"); assert.equal(late.off, 100);
  assert.equal(G.samJudge(21.05, sams, beat).off, -150);
  assert.equal(G.samJudge(18, sams, beat).kind, "miss");
});
test("three floors: the floor of a note", () => {
  assert.deepEqual([-5, -1, 0, 11, 12, 16].map(G.floorOf), [0, 0, 1, 1, 2, 2]);
  for (const [, , set] of G.FLOORS) assert.ok(new Set(set.map(G.floorOf)).size >= 2);
});

// Ornament and technique games (app/js/games3.js).
{
  const G3 = await import("../app/js/games3.js");
  const O = await import("../app/js/ornaments.js");
  const mic = (pts, step) => { const out = []; let k = 0; for (let t = 0; t <= pts[pts.length - 1].t; t += step || 0.033) { while (k + 1 < pts.length && pts[k + 1].t <= t) k++; out.push({ t: 5 + t, semi: pts[k].semi + ((k * 7) % 5 - 2) * 0.01 }); } return out; };
  test("every generated ornament exercise is playable: its own target passes the trainer's checks", () => {
    for (const [key, make] of [["meend", G3.meendEx], ["kan", G3.kanEx], ["murki", G3.murkiEx], ["andolan", G3.andolanEx]])
      for (let s = 1; s <= 40; s++) for (const level of key === "murki" ? [0, 2, 5] : [0]) {
        const e = make(seeded(s), level), r = O.analyse(key, e, mic(O.targetCurve(key, e)), String);
        assert.ok(r.of && r.passed === r.of, key + " seed " + s + " level " + level + ": " + r.checks.filter(c => !c.ok).map(c => c.text).join(" | "));
      }
  });
  test("meend bridge: a one-semitone jump is still a jump", () => {
    const jump = []; for (let t = 0; t < 1.6; t += 0.033) jump.push({ t, semi: t < 0.6 ? 4 : 5 });
    assert.ok(!O.analyse("meend", { from: 4, to: 5, dur: 0.9 }, jump, String).checks[0].ok);
  });
  test("murki chase: the speed limit tightens with the level", () => {
    const a = G3.murkiEx(seeded(1), 0), b = G3.murkiEx(seeded(1), 4);
    assert.ok(b.each < a.each && b.maxEach < a.maxEach && b.each < b.maxEach);
    const slow = O.analyse("murki", b, mic(O.targetCurve("murki", { ...b, each: 0.2 })), String);
    assert.ok(!slow.checks[2].ok, "a murki at 200 ms a note is too slow at level 4");
  });
  test("name the ornament: every kind comes up, with a curve to play", () => {
    const seen = new Set(), r = seeded(4);
    for (let i = 0; i < 60; i++) { const q = G3.ornamentQuestion(r); seen.add(q.kind); assert.ok(q.curve.length > 10); }
    assert.equal(seen.size, G3.KINDS.length);
  });
  test("swell and fade: a clean swell scores high; a flat level or a rising pitch scores lower", () => {
    const make = (lev, semi) => Array.from({ length: 180 }, (_, i) => { const t = i / 30, x = t / 6; return { t, semi: semi(x), level: lev(x) }; });
    const tri = x => 0.1 + 0.9 * (1 - Math.abs(2 * x - 1));
    const good = G3.swellScore(make(tri, () => 0)), flat = G3.swellScore(make(() => 0.5, () => 0)), rising = G3.swellScore(make(tri, x => 0.6 * (1 - Math.abs(2 * x - 1))));
    assert.ok(good.score >= 90, JSON.stringify(good));
    assert.ok(flat.score < 60 && flat.ratio < 1.5, JSON.stringify(flat));
    assert.ok(rising.drift > 40 && rising.follows > 0.8 && rising.score < good.score, JSON.stringify(rising));
    assert.equal(G3.swellScore(make(tri, () => 0).slice(0, 30)), null);
  });
  test("tongued beats: even notes with a steady lag score well; uneven and extra notes do not", () => {
    const beats = Array.from({ length: 16 }, (_, i) => 10 + i * 0.8);
    const even = G3.tongueScore(beats.map(b => b + 0.09), beats);
    assert.deepEqual([even.hits, even.extra, even.spread], [16, 0, 0]);
    const uneven = G3.tongueScore(beats.map((b, i) => b + 0.09 + (i % 2 ? 0.12 : -0.1)), beats);
    assert.ok(uneven.spread > 90 && uneven.score < even.score);
    const extra = G3.tongueScore(beats.map(b => b + 0.09).concat([10.5, 11.3]), beats);
    assert.equal(extra.extra, 2);
  });
}
// Raga phrases, laya, tihai, taar saptak (app/js/phrases.js, games4.js), raga grammar and models.
{
  const P = await import("../app/js/phrases.js");
  const G4 = await import("../app/js/games4.js");
  const RG = await import("../app/js/ragagrammar.js");
  const O = await import("../app/js/ornaments.js");
  const fs = await import("node:fs");
  const sample = (pts, jitter) => { const out = []; let k = 0, seed = 3; const end = pts[pts.length - 1].t;
    for (let t = 0; t <= end; t += 0.033) { while (k + 1 < pts.length && pts[k + 1].t <= t) k++; seed = (seed * 16807) % 2147483647; out.push({ t: 7 + t, semi: pts[k].semi + (seed / 2147483647 - 0.5) * (jitter || 0.04) }); } return out; };
  const plainOf = segs => segs.map(s => s.n !== undefined ? s : s.kan ? { n: s.kan[1], d: s.d } : s.meend ? { n: s.meend[1], d: s.d } : { n: s.andolan, d: s.d });
  test("raga phrases: each phrase's own target scores full marks; plain notes lose the ornament's points", () => {
    for (const ph of P.PHRASES) {
      const r = P.judgePhrase(sample(P.phraseCurve(ph.segs).pts), ph, String);
      assert.ok(r.ok && r.points === r.max, ph.id + ": " + r.points + "/" + r.max + " " + r.parts.filter(x => !x.ok).map(x => x.text).join(" | "));
      const p = P.judgePhrase(sample(P.phraseCurve(plainOf(ph.segs)).pts), ph, String);
      assert.ok(p.points <= r.max - 2, ph.id + " plain: " + p.points + "/" + p.max);
    }
  });
  test("raga phrases: every phrase has a source link and a raga card that exists", () => {
    for (const ph of P.PHRASES) { assert.match(ph.src, /^https:\/\/(ragajunglism\.org|en\.wikipedia\.org)\//); assert.ok(fs.existsSync("bansuri-mastery/ragas/" + ph.file), ph.file); }
  });
  test("raga phrases: a different phrase is not recognised", () => {
    const other = P.judgePhrase(sample(P.phraseCurve([{ n: 12, d: 1 }, { n: 14, d: 1 }, { n: 16, d: 1 }]).pts), P.PHRASES[0], String);
    assert.equal(other.ok, false);
  });
  test("shape match: 100% against itself, lower against a different shape", () => {
    const m = P.phraseCurve(P.PHRASES[4].segs).pts;
    assert.ok(P.shapeMatch(sample(m), m) >= 95);
    assert.ok(P.shapeMatch(sample(P.phraseCurve(plainOf(P.PHRASES[4].segs)).pts), m) < P.shapeMatch(sample(m), m));
  });
  test("teacher's model: trimmed to the notes, and moved to the learner's flute by whole semitones", () => {
    const frames = [null, null].concat(Array.from({ length: 40 }, (_, i) => ({ s: i < 20 ? -3 : -1 }))).concat([null]);
    const mc = O.modelCurve(frames, 0.03, 2);
    assert.equal(mc.shift, 5); assert.equal(mc.curve[0].t, 0); assert.equal(mc.curve[0].semi, 2); assert.equal(mc.curve[mc.curve.length - 1].semi, 4);
    assert.equal(O.modelCurve([null, { s: 1 }], 0.03, 0), null);
  });
  test("raga grammar: Bhimpalasi does not use Re and Dha going up; resting on weak notes is reported", () => {
    const g = RG.ragaGrammar(fs.readFileSync("bansuri-mastery/ragas/bhimpalasi.md", "utf8"));
    assert.deepEqual(g.aroh, [0, 3, 5, 7, 10]); assert.ok(g.avroh.includes(2) && g.avroh.includes(9)); assert.ok(g.strong.includes(5));
    const notes = [0, 2, 3, 5, 7, 9, 10].map((s, i) => ({ semi: s, t0: i * 0.5 })).concat([{ semi: 2, t0: 3.5 }, { semi: 0, t0: 5 }]);
    const a = RG.alapCheck(notes, g, 7);
    assert.deepEqual(Object.keys(a.up).map(Number).sort((x, y) => x - y), [2, 9]);
    assert.equal(a.rests, 2); assert.deepEqual(a.weak, { 2: 1 });
  });
  test("laya ladder: on-time notes with a steady lag score in every section; a gap is counted", () => {
    const beat = 1, ev = G4.layaEvents(8, 8).map(e => ({ ...e, t: 10 + e.beat * beat }));
    assert.deepEqual(G4.LAYA_SECTIONS.map(([s]) => ev.filter(e => e.sec === s).length), [8, 16, 24]);
    const on = ev.map(e => ({ t: e.t + 0.09, semi: e.semi }));
    const r = G4.layaJudge(on, ev);
    for (const [s] of G4.LAYA_SECTIONS) { assert.equal(r[s].hits, r[s].of); assert.equal(r[s].right, r[s].of); assert.equal(r[s].spread, 0); }
    const r2 = G4.layaJudge(on.filter(o => o.t < 26.5), ev);
    assert.ok(r2.tigun.hits < r2.tigun.of && r2.thah.hits === 8);
  });
  test("tihai: it starts where it must for the last note to land on sam", () => {
    for (const [len, cyc] of [[3, 8], [5, 8], [4, 16], [3, 16], [4, 6]]) {
      const ev = G4.tihaiEvents(Array(len).fill(0), 1, cyc, cyc);
      assert.equal(ev.length, len * 3); assert.equal(ev[ev.length - 1].beat % cyc, 0, len + " in " + cyc); assert.ok(ev[ev.length - 1].last);
      assert.ok(ev[0].beat >= cyc && ev[0].beat < 2 * cyc);
    }
    assert.equal(G4.tihaiStart(3, 1, 8), 6);
  });
  test("taar saptak: steady, clear and in tune scores high; wavering or airy scores lower", () => {
    const steady = Array.from({ length: 90 }, () => ({ semi: 12.02, clarity: 0.97 }));
    const waver = Array.from({ length: 90 }, (_, i) => ({ semi: 12 + 0.3 * Math.sin(i / 3), clarity: 0.97 }));
    const airy = Array.from({ length: 90 }, () => ({ semi: 12.02, clarity: 0.86 }));
    const a = G4.taarScore(steady, 12), b = G4.taarScore(waver, 12), c = G4.taarScore(airy, 12);
    assert.ok(a.score >= 95 && b.score < a.score - 20 && c.score < a.score - 20, JSON.stringify([a, b, c]));
    assert.equal(G4.taarScore(steady.slice(0, 5), 12), null);
  });
}
console.log("game tests: " + n + " passed");
