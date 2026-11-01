// Raga phrases with their ornaments (pure: no audio, no DOM). Each phrase is a list of segments:
// { n, d } a held note; { kan: [grace, main], d } a kan then the main note; { meend: [from, to], d }
// a glide; { andolan: note, d, depth, rate } a slow swing below the note. Only ornaments the raga
// cards' sources name for that raga and that phrase are used (each phrase links its source); the
// shapes and lengths are one way to play them (Recommendation), not the only one.
// judgePhrase aligns an attempt with the target (dynamic time warping), then judges each segment:
// the right note, and for an ornament the ornament trainer's checks (ornaments.js) on that slice.
import { cleanReadings, analyseKan, analyseMeend, analyseAndolan } from "./ornaments.js";

const WJ = "https://ragajunglism.org/ragas/";
const WP = "https://en.wikipedia.org/wiki/";
export const PHRASES = [
  { id: "bhairav-1", raga: "Bhairav", file: "bhairav.md", text: "G m r~ S", src: WJ + "bhairav/", what: "Andolan on komal Re (the paired pakad)",
    segs: [{ n: 4, d: 0.6 }, { n: 5, d: 0.6 }, { andolan: 1, d: 2.6, depth: 0.4, rate: 0.8 }, { n: 0, d: 1 }] },
  { id: "bhairav-2", raga: "Bhairav", file: "bhairav.md", text: "(G)r S", src: WJ + "bhairav/", what: "Komal Re touched from Ga above (a kan)",
    segs: [{ kan: [4, 1], d: 1 }, { n: 0, d: 1 }] },
  { id: "bhairav-3", raga: "Bhairav", file: "bhairav.md", text: "N S' N d~ P", src: WJ + "bhairav/", what: "Andolan on komal Dha (the paired pakad)",
    segs: [{ n: 11, d: 0.5 }, { n: 12, d: 0.5 }, { n: 11, d: 0.5 }, { andolan: 8, d: 2.6, depth: 0.4, rate: 0.8 }, { n: 7, d: 1 }] },
  { id: "bhairav-4", raga: "Bhairav", file: "bhairav.md", text: "(N)d P", src: WJ + "bhairav/", what: "Komal Dha touched from Ni above (a kan)",
    segs: [{ kan: [11, 8], d: 1 }, { n: 7, d: 1 }] },
  { id: "bhimpalasi-1", raga: "Bhimpalasi", file: "bhimpalasi.md", text: "P \\ g", src: WP + "Bhimpalasi", what: "A slow meend from Pa down to komal Ga",
    segs: [{ n: 7, d: 0.7 }, { meend: [7, 3], d: 1.1 }, { n: 3, d: 0.9 }] },
  { id: "bhimpalasi-2", raga: "Bhimpalasi", file: "bhimpalasi.md", text: "(m)g R S", src: WP + "Bhimpalasi", what: "Komal Ga with a kan of Ma",
    segs: [{ kan: [5, 3], d: 0.9 }, { n: 2, d: 0.6 }, { n: 0, d: 1 }] },
  { id: "bhimpalasi-3", raga: "Bhimpalasi", file: "bhimpalasi.md", text: "(S).n S", src: WP + "Bhimpalasi", what: "Komal Ni with a kan from Sa",
    segs: [{ kan: [0, -2], d: 0.9 }, { n: 0, d: 1 }] },
  { id: "des-1", raga: "Des", file: "des.md", text: "m \\ R (through G)", src: WP + "Desh_%28raga%29", what: "The meend from Ma down to Re, passing through Ga",
    segs: [{ n: 5, d: 0.7 }, { meend: [5, 2], d: 1.2 }, { n: 2, d: 0.9 }] },
  { id: "malkauns-1", raga: "Malkauns", file: "malkauns.md", text: "m g~ S", src: WP + "Malkauns", what: "Andolan on komal Ga",
    segs: [{ n: 5, d: 0.6 }, { andolan: 3, d: 2.6, depth: 0.4, rate: 0.8 }, { n: 0, d: 1 }] },
  { id: "malkauns-2", raga: "Malkauns", file: "malkauns.md", text: "n d~ m", src: WP + "Malkauns", what: "Andolan on komal Dha",
    segs: [{ n: 10, d: 0.6 }, { andolan: 8, d: 2.6, depth: 0.4, rate: 0.8 }, { n: 5, d: 1 }] },
  { id: "bhairavi-1", raga: "Bhairavi", file: "bhairavi.md", text: "m g r~ S", src: WP + "Bhairavi_%28Hindustani%29", what: "Andolan on komal Re",
    segs: [{ n: 5, d: 0.6 }, { n: 3, d: 0.6 }, { andolan: 1, d: 2.6, depth: 0.4, rate: 0.8 }, { n: 0, d: 1 }] },
  { id: "bhupali-1", raga: "Bhupali", file: "bhupali.md", text: "(S).D S", src: WJ + "bhupali/", what: "Dha with a kan of Sa (after Parrikar)",
    segs: [{ kan: [0, -3], d: 0.9 }, { n: 0, d: 1 }] },
];

// The target pitch curve of a phrase (points every 20 ms) and where each segment starts and ends.
export function phraseCurve(segs) {
  const pts = [], bounds = [];
  let t = 0;
  const add = (tt, semi) => pts.push({ t: Math.round(tt * 1000) / 1000, semi });
  for (const s of segs) {
    const t0 = t;
    if (s.n !== undefined) for (let x = 0; x < s.d - 0.001; x += 0.02) add(t + x, s.n);
    else if (s.kan) { for (let x = 0; x < 0.07; x += 0.02) add(t + x, s.kan[0]); for (let x = 0.08; x < s.d - 0.001; x += 0.02) add(t + x, s.kan[1]); }
    else if (s.meend) for (let x = 0; x < s.d - 0.001; x += 0.02) { const k = x / s.d; add(t + x, s.meend[0] + (s.meend[1] - s.meend[0]) * (0.5 - Math.cos(Math.PI * k) / 2)); }
    else if (s.andolan !== undefined) for (let x = 0; x < s.d - 0.001; x += 0.02) add(t + x, s.andolan - s.depth * (1 - Math.cos(2 * Math.PI * s.rate * Math.max(0, x - 0.3))) / 2);
    t += s.d;
    bounds.push({ t0, t1: t });
  }
  return { pts, bounds, seconds: t };
}

// Dynamic time warping of two pitch lists (semitones; the cost of a pair is capped at 3).
// Returns the mean cost along the path and, for each index of b, the indices of a matched to it.
export function dtw(a, b) {
  const n = a.length, m = b.length, INF = 1e9;
  if (!n || !m) return { cost: Infinity, match: [] };
  const D = new Float64Array((n + 1) * (m + 1)).fill(INF), at = (i, j) => i * (m + 1) + j;
  D[0] = 0;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const c = Math.min(3, Math.abs(a[i - 1] - b[j - 1]));
    D[at(i, j)] = c + Math.min(D[at(i - 1, j)], D[at(i, j - 1)], D[at(i - 1, j - 1)]);
  }
  const match = Array.from({ length: m }, () => []);
  let i = n, j = m, steps = 0;
  while (i > 0 && j > 0) {
    match[j - 1].push(i - 1); steps++;
    const d = D[at(i - 1, j - 1)], u = D[at(i - 1, j)], l = D[at(i, j - 1)];
    if (d <= u && d <= l) { i--; j--; } else if (u <= l) i--; else j--;
  }
  return { cost: D[at(n, m)] / Math.max(1, steps), match };
}

// Judge an attempt (readings: [{ t, semi }]) against a phrase. name(semi) names a note.
export function judgePhrase(readings, phrase, name) {
  const rs = cleanReadings(readings), voiced = rs.filter(r => r.semi !== null);
  if (voiced.length < 10) return { ok: false, verdict: "No clear phrase was heard: play a little louder or closer to the microphone.", parts: [], points: 0, max: 0 };
  const { pts, bounds } = phraseCurve(phrase.segs), tgt = pts.filter((p, i) => i % 2 === 0);
  const al = dtw(voiced.map(r => r.semi), tgt.map(p => p.semi));
  if (al.cost > 1.2) return { ok: false, verdict: "The phrase was not recognised: play the notes shown, in order, then the ornaments.", parts: [], points: 0, max: 0, cost: al.cost };
  // The attempt's time span for each target segment.
  const spanOf = b => {
    let lo = Infinity, hi = -Infinity;
    tgt.forEach((p, j) => { if (p.t >= b.t0 && p.t < b.t1) for (const i of al.match[j]) { lo = Math.min(lo, voiced[i].t); hi = Math.max(hi, voiced[i].t); } });
    return lo === Infinity ? null : { t0: lo, t1: hi };
  };
  const slice = (t0, t1) => rs.filter(r => r.t >= t0 && r.t <= t1).map(r => ({ t: r.t - t0, semi: r.semi }));
  const parts = [];
  phrase.segs.forEach((s, k) => {
    const sp = spanOf(bounds[k]);
    if (!sp) { parts.push({ k, ok: false, points: 0, max: 1, text: "A note was missing." }); return; }
    if (s.n !== undefined) {
      const v = slice(sp.t0, sp.t1).filter(r => r.semi !== null).map(r => r.semi).sort((a, b) => a - b), med = v.length ? v[v.length >> 1] : null;
      const good = med !== null && Math.abs(med - s.n) <= 0.4;
      parts.push({ k, ok: good, points: good ? 1 : 0, max: 1, text: good ? name(s.n) + ": right." : name(s.n) + ": " + (med === null ? "not heard." : "you played " + name(Math.round(med)) + ".") });
    } else if (s.kan) {
      const prev = k ? spanOf(bounds[k - 1]) : null, r = analyseKan(slice(Math.max(prev ? prev.t1 : sp.t0 - 0.15, sp.t0 - 0.15), sp.t1), { grace: s.kan[0], main: s.kan[1] }, name);
      const pick = r.checks.slice(0, 2), got = pick.filter(c => c.ok).length;
      parts.push({ k, ok: got === 2, points: got, max: 2, text: (pick.find(c => !c.ok) || pick[1] || { text: r.verdict }).text });
    } else if (s.meend) {
      const prev = k ? spanOf(bounds[k - 1]) : null, next = k + 1 < bounds.length ? spanOf(bounds[k + 1]) : null;
      const r = analyseMeend(slice(prev ? prev.t0 : sp.t0, next ? next.t1 : sp.t1), { from: s.meend[0], to: s.meend[1], dur: s.d }, name);
      // A jump is not a meend at all: no points for "no break" or "no step" when there was no glide.
      const pick = r.checks.slice(0, 3), got = pick.length === 3 && pick[0].ok ? pick.filter(c => c.ok).length : 0;
      parts.push({ k, ok: pick.length === 3 && got === 3, points: got, max: 3, text: (pick.find(c => !c.ok) || { text: "Meend " + name(s.meend[0]) + " to " + name(s.meend[1]) + ": smooth and unbroken." }).text });
    } else if (s.andolan !== undefined) {
      const r = analyseAndolan(slice(sp.t0, sp.t1), { note: s.andolan }, name);
      const pick = r.checks.length ? [r.checks[0], r.checks[1], r.checks[3]] : [], got = pick.filter(c => c.ok).length;
      parts.push({ k, ok: pick.length === 3 && got === 3, points: got, max: 3, text: (pick.find(c => !c.ok) || { text: r.checks.length ? "Andolan on " + name(s.andolan) + ": a slow, even swing." : r.verdict }).text });
    }
  });
  const points = parts.reduce((a, p) => a + p.points, 0), max = parts.reduce((a, p) => a + p.max, 0);
  return { ok: true, parts, points, max, cost: Math.round(al.cost * 100) / 100, verdict: points === max ? "The whole phrase, ornaments and all." : points >= max * 0.7 ? "Close: see the parts below." : "Keep at it: see the parts below." };
}

// How closely an attempt follows a model curve (a teacher's recording): 100% when the shapes
// match, falling by 1% for each average cent of difference after alignment.
export function shapeMatch(readings, model) {
  const v = cleanReadings(readings).filter(r => r.semi !== null), m = model.filter(p => p.semi !== null);
  if (v.length < 5 || m.length < 5) return null;
  const al = dtw(v.map(r => r.semi), m.filter((p, i) => i % 2 === 0).map(p => p.semi));
  return Math.max(0, Math.round(100 - al.cost * 100));
}
