// Ornament trainer analysers (app/js/ornaments.js) on made-up microphone readings: each target,
// sampled the way the microphone reads (every 33 ms, a little noise), passes; typical mistakes
// fail on the check that names them.
import assert from "node:assert/strict";
import * as O from "../app/js/ornaments.js";

let n = 0;
const test = (name, fn) => { fn(); n++; };
// Sample a curve function every 33 ms, with deterministic jitter of +/- 3 cents and silence around it.
function mic(f, dur, opt) {
  const o = Object.assign({ pre: 0.3, post: 0.3, jitter: 0.03 }, opt || {}), rs = [];
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (let t = 0; t < o.pre + dur + o.post; t += 0.033) {
    const x = t - o.pre, s = x < 0 || x > dur ? null : f(x);
    rs.push({ t: 10 + t, semi: s === null ? null : s + rnd() * 2 * o.jitter });
  }
  return rs;
}
const fromCurve = pts => x => { let p = pts[0]; for (const q of pts) { if (q.t > x) break; p = q; } return p.semi; };
const name = s => ["S", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"][((s % 12) + 12) % 12];
const failed = r => r.checks.filter(c => !c.ok).map(c => c.text).join(" | ");
const E = (k, id) => O.ornamentOf(k).ex.find(e => e.id === id);

test("every exercise's own target passes", () => {
  for (const o of O.ORNAMENTS) for (const e of o.ex) {
    const pts = O.targetCurve(o.key, e), r = O.analyse(o.key, e, mic(fromCurve(pts), pts[pts.length - 1].t), name);
    assert.ok(r.of > 0 && r.passed === r.of, o.key + "/" + e.id + ": " + failed(r) + " " + JSON.stringify(r.measures));
  }
});

test("meend: a jump, a stepped glide and a break are named", () => {
  const e = E("meend", "re-ga");
  const jump = O.analyse("meend", e, mic(x => x < 0.6 ? 2 : 4, 1.4), name);
  assert.ok(!jump.checks[0].ok, "a jump is too quick: " + JSON.stringify(jump.measures));
  const stepped = O.analyse("meend", e, mic(x => x < 0.6 ? 2 : x < 1.1 ? 3 : 4, 1.8), name);
  assert.ok(!stepped.checks[2].ok && /stopped on g/.test(stepped.checks[2].text), failed(stepped));
  const broken = O.analyse("meend", e, mic(x => x < 0.6 ? 2 : x < 0.8 ? 2.4 : x < 1.05 ? null : x < 1.6 ? 2.4 + (x - 1.05) * 3 : 4, 2.2), name);
  assert.ok(!broken.checks[1].ok, "a 0.25 s gap is a break: " + failed(broken));
  assert.match(O.analyse("meend", e, mic(() => 2, 2), name).checks.map(c => c.text).join(), /all the way to G/);
});

test("kan: too long is two notes; none heard; other notes first", () => {
  const e = E("kan", "ma-ga");
  const long = O.analyse("kan", e, mic(x => x < 0.35 ? 5 : 4, 1.2), name);
  assert.ok(long.checks[0].ok && !long.checks[1].ok, failed(long));
  const none = O.analyse("kan", e, mic(() => 4, 1.2), name);
  assert.ok(!none.checks[0].ok, "no kan");
  const mess = O.analyse("kan", e, mic(x => x < 0.07 ? 7 : x < 0.14 ? 5 : 4, 1.2), name);
  assert.ok(!mess.checks[3].ok && /P/.test(mess.checks[3].text), failed(mess));
  const flat = O.analyse("kan", e, mic(x => x < 0.07 ? 5 : 3.6, 1.2), name);
  assert.ok(!flat.checks[4].ok && /flat/.test(flat.checks[4].text), failed(flat));
});

test("murki: too slow, a missing note, extra notes", () => {
  const e = E("murki", "rsns");
  const slow = O.analyse("murki", e, mic(fromCurve(O.targetCurve("murki", { ...e, each: 0.4 })), 2.5), name);
  assert.ok(slow.checks[0].ok && !slow.checks[2].ok, failed(slow));
  const miss = O.analyse("murki", e, mic(x => x < 0.12 ? 2 : 0, 1.2), name);
  assert.ok(!miss.checks[0].ok, failed(miss));
  const extra = O.analyse("murki", e, mic(fromCurve(O.targetCurve("murki", { ...e, notes: [4, 2, 0, -1, -3, 0] })), 1.6), name);
  assert.ok(!extra.checks[1].ok, failed(extra));
});

test("andolan: a fast shake, too narrow, centred on the wrong note", () => {
  const e = E("andolan", "darbari-ga");
  const shake = O.analyse("andolan", e, mic(x => 3 - 0.3 * (1 - Math.cos(2 * Math.PI * 5 * x)), 4), name);
  assert.ok(!shake.checks[1].ok && /shake/.test(shake.checks[1].text), failed(shake) + JSON.stringify(shake.measures));
  const narrow = O.analyse("andolan", e, mic(x => 3 - 0.05 * (1 - Math.cos(2 * Math.PI * 0.8 * x)), 4), name);
  assert.ok(!narrow.checks[0].ok, failed(narrow));
  const off = O.analyse("andolan", e, mic(x => 3.5 - 0.3 * (1 - Math.cos(2 * Math.PI * 0.8 * x)), 4), name);
  assert.ok(!off.checks[3].ok && /above/.test(off.checks[3].text), failed(off));
  assert.match(O.analyse("andolan", e, mic(() => 3, 1), name).verdict, /three seconds/);
});

test("readings: octave slips dropped, clock starts at the first note", () => {
  const rs = [{ t: 5, semi: null }, { t: 5.033, semi: 4 }, { t: 5.066, semi: 16 }, { t: 5.1, semi: 4 }, { t: 5.133, semi: null }];
  assert.deepEqual(O.cleanReadings(rs), [{ t: 0, semi: 4 }, { t: 0.033, semi: null }, { t: 0.067, semi: 4 }]);
  assert.deepEqual(O.cleanReadings([{ t: 1, semi: null }]), []);
});

console.log("ornament tests: " + n + " passed");
