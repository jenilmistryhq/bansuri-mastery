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
console.log("game tests: " + n + " passed");
