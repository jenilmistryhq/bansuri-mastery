// Ornament trainer, pure part (no audio, no DOM): the target pitch curve of each ornament, and the
// analysers that measure an attempt from microphone readings and say what to change.
// Readings: [{ t: seconds, semi: semitones from Sa, unsmoothed, or null for no clear note }].
// The page (views/ornaments.js) plays the target, records the attempt and draws both curves.
//
// What a microphone can and cannot judge (Fact, from how the readings are made): readings come
// about every 33 ms over a 46 ms window, so a kan shorter than about 40 ms can be missed, and
// the notes of a very fast murki can run together. The page says so beside the result.

// The ornaments, each with one or two exercises on the learner's own flute (semitones from Sa).
// Shapes and speeds are one common way to play them (Recommendation); teachers and gharanas differ
// on how wide and slow an andolan is and how a murki is shaped (Disputed): copy your teacher and the
// recordings where they differ.
export const ORNAMENTS = [
  { key: "meend", name: "Meend", what: "A smooth glide from one note to another, with no step and no break in the sound.",
    how: "Keep the air steady and slide the finger slowly off (or onto) the hole, rolling it rather than lifting it. The pitch should pass through every point between the two notes.",
    ex: [{ id: "re-ga", label: "Re up to Ga", from: 2, to: 4, dur: 0.9 }, { id: "pa-ga", label: "Pa down to Ga", from: 7, to: 4, dur: 1 }] },
  { key: "kan", name: "Kan", what: "A grace note: the lightest touch of one note just before the main note.",
    how: "Hold the main note's fingering, then flick one finger to sound the grace note for an instant as the note starts. One breath, one tonguing: the kan is part of the main note, not a note of its own.",
    ex: [{ id: "ma-ga", label: "Ma touched before Ga", grace: 5, main: 4 }, { id: "re-sa", label: "Re touched before Sa", grace: 2, main: 0 }] },
  { key: "murki", name: "Murki", what: "A quick, light cluster of notes that turns around the main note.",
    how: "Play the notes as one gesture, lightly and evenly, then settle on the main note. Learn it slowly first, then speed it up until the notes are a flick of the fingers.",
    ex: [{ id: "rsns", label: "Re Sa .Ni Sa", notes: [2, 0, -1, 0], each: 0.11 }, { id: "pmgm", label: "Pa Ma Ga Ma", notes: [7, 5, 4, 5], each: 0.11 }] },
  { key: "andolan", name: "Andolan", what: "A slow, wide swing of one note: the note sways a little below its place and back, again and again.",
    how: "Hold the note and slowly shade its open hole with the finger, a little at a time, then open it again, keeping the air steady. Slow and even, about one swing a second: faster becomes a shake (gamak or vibrato), not an andolan.",
    ex: [{ id: "darbari-ga", label: "Komal Ga, as in Darbari", note: 3, depth: 0.6, rate: 0.8, dur: 5 }, { id: "bhairav-re", label: "Komal Re, as in Bhairav", note: 1, depth: 0.4, rate: 1, dur: 5 }] },
];
export const ornamentOf = key => ORNAMENTS.find(o => o.key === key);

// The target curve of an exercise: points every 20 ms, from 0 s.
export function targetCurve(key, e) {
  const pts = [], add = (t, semi) => pts.push({ t: Math.round(t * 1000) / 1000, semi });
  if (key === "meend") {
    for (let t = 0; t < 0.6; t += 0.02) add(t, e.from);
    for (let t = 0; t <= e.dur; t += 0.02) { const x = t / e.dur; add(0.6 + t, e.from + (e.to - e.from) * (0.5 - Math.cos(Math.PI * x) / 2)); }
    for (let t = 0.02; t < 0.8; t += 0.02) add(0.6 + e.dur + t, e.to);
  } else if (key === "kan") {
    for (let t = 0; t < 0.07; t += 0.02) add(t, e.grace);
    for (let t = 0.08; t < 1.2; t += 0.02) add(t, e.main);
  } else if (key === "murki") {
    e.notes.forEach((n, i) => { for (let t = 0; t < e.each - 0.001; t += 0.02) add(i * e.each + t, n); });
    const end = e.notes.length * e.each;
    for (let t = 0; t < 0.9; t += 0.02) add(end + t, e.notes[e.notes.length - 1]);
  } else if (key === "andolan") {
    for (let t = 0; t <= e.dur; t += 0.02) add(t, e.note - e.depth * (1 - Math.cos(2 * Math.PI * e.rate * Math.max(0, t - 0.5))) / 2);
  }
  return pts;
}

// Clean an attempt: drop single frames an octave (or more) away from both neighbours (pitch-tracker
// slips), and start the clock at the first clear note.
export function cleanReadings(rs) {
  const v = rs.map(r => ({ t: r.t, semi: r.semi === null || r.semi === undefined || !Number.isFinite(r.semi) ? null : r.semi }));
  for (let i = 1; i < v.length - 1; i++) {
    const a = v[i - 1].semi, b = v[i].semi, c = v[i + 1].semi;
    if (b !== null && a !== null && c !== null && Math.abs(b - a) > 9 && Math.abs(b - c) > 9) v[i].semi = null;
  }
  const first = v.findIndex(r => r.semi !== null);
  if (first < 0) return [];
  // Trailing silence is cut too: the attempt ends at the last clear note.
  let last = v.length - 1; while (last > first && v[last].semi === null) last--;
  return v.slice(first, last + 1).map(r => ({ t: Math.round((r.t - v[first].t) * 1000) / 1000, semi: r.semi }));
}

const voiced = rs => rs.filter(r => r.semi !== null);
const pct = (xs, p) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const ok = (pass, text) => ({ ok: !!pass, text });
// Runs of one note: consecutive clear frames rounding to the same semitone.
export function runsOf(rs) {
  const runs = [];
  for (const r of rs) {
    if (r.semi === null) { if (runs.length) runs[runs.length - 1].broken = true; continue; }
    const n = Math.round(r.semi), last = runs[runs.length - 1];
    if (last && last.semi === n && !last.broken) { last.t1 = r.t; last.n++; } else runs.push({ semi: n, t0: r.t, t1: r.t, n: 1 });
  }
  return runs;
}
// A run's length: from its first frame to the start of the next run (the frame step if it is last).
const runDur = (runs, i) => (i + 1 < runs.length ? runs[i + 1].t0 : runs[i].t1 + 0.033) - runs[i].t0;

// Every analyser returns { checks: [{ ok, text }], passed, of, measures } (and an empty checks list
// with a reason when no note was heard).
function result(checks, measures, name) {
  const passed = checks.filter(c => c.ok).length;
  return { checks, passed, of: checks.length, measures, verdict: passed === checks.length ? "A clean " + name + "." : passed >= checks.length - 1 ? "Nearly: one thing to change." : "Keep at it: see below." };
}
const nothing = why => ({ checks: [], passed: 0, of: 0, measures: {}, verdict: why });

export function analyseMeend(rs, e, name) {
  const v = voiced(rs);
  if (v.length < 8) return nothing("No clear note was heard: play a little louder or closer to the microphone.");
  const near = (r, s, tol) => Math.abs(r.semi - s) <= (tol || 0.35), dir = Math.sign(e.to - e.from);
  // The glide starts when the pitch last leaves the first note and ends when it first reaches the second.
  const reach = v.findIndex(r => near(r, e.to));
  const startIdx = reach < 0 ? -1 : (() => { for (let i = reach; i >= 0; i--) if (near(v[i], e.from)) return i; return -1; })();
  if (startIdx < 0) return result([ok(false, "Start on " + name(e.from) + " and hold it a moment before the glide.")].concat(reach < 0 ? [ok(false, "Glide all the way to " + name(e.to) + ".")] : []), {}, "meend");
  if (reach < 0) return result([ok(true, "Started on " + name(e.from) + "."), ok(false, "Glide all the way to " + name(e.to) + ": the pitch did not reach it.")], {}, "meend");
  const t0 = v[startIdx].t, t1 = v[reach].t, glide = t1 - t0;
  const inGlide = rs.filter(r => r.t > t0 && r.t < t1);
  // A break in the sound: no clear note for more than 0.1 s during the glide.
  let gap = 0, run = 0, prevT = t0;
  for (const r of inGlide) { if (r.semi === null) run += r.t - prevT; else { gap = Math.max(gap, run); run = 0; } prevT = r.t; }
  // A step: the pitch rests (within 0.15 semitone for 0.15 s or more) somewhere between the two notes.
  let step = null;
  const g = inGlide.filter(r => r.semi !== null);
  for (let i = 0; i < g.length && !step; i++) {
    let j = i; while (j + 1 < g.length && Math.abs(g[j + 1].semi - g[i].semi) <= 0.15) j++;
    const between = (g[i].semi - e.from) * dir > 0.4 && (e.to - g[i].semi) * dir > 0.4;
    if (between && g[j].t - g[i].t >= 0.15) step = Math.round(g[i].semi);
  }
  // Going the wrong way first, and overshooting the end.
  const after = v.filter(r => r.t >= t1 && r.t <= t1 + 0.4), over = after.length ? Math.max(...after.map(r => (r.semi - e.to) * dir)) : 0;
  // The glide is timed between bands around the two notes, so a one-semitone meend measures shorter:
  // the shortest acceptable glide scales with the interval (a real jump takes 30-60 ms).
  const minGlide = 0.3 * Math.min(1, Math.abs(e.to - e.from) / 2);
  const checks = [
    ok(glide >= minGlide && glide <= 2, glide < minGlide ? "Too quick (" + Math.round(glide * 1000) + " ms): that is a jump, not a meend. Slide the finger more slowly, about a second." : glide > 2 ? "Very slow (" + glide.toFixed(1) + " s): keep it under two seconds." : "Glide length " + glide.toFixed(1) + " s: good."),
    ok(gap <= 0.1, gap > 0.1 ? "The sound broke during the glide: keep the air going while the finger slides." : "No break in the sound."),
    ok(step === null, step !== null ? "It stopped on " + name(step) + " on the way: a meend passes through the notes between without resting." : "Smooth: no step on the way."),
    ok(over <= 0.4, over > 0.4 ? "Went past " + name(e.to) + " and came back: slow down as you arrive." : "Landed on " + name(e.to) + " without overshooting."),
  ];
  return result(checks, { glide: Math.round(glide * 100) / 100, gap: Math.round(gap * 100) / 100, step, over: Math.round(over * 100) / 100 }, "meend");
}

export function analyseKan(rs, e, name) {
  const v = voiced(rs);
  if (v.length < 6) return nothing("No clear note was heard: play a little louder or closer to the microphone.");
  const runs = runsOf(rs.filter(r => r.t <= 1.5));
  const mi = runs.findIndex(r => r.semi === e.main && runDur(runs, runs.indexOf(r)) >= 0.2);
  if (mi < 0) return result([ok(false, "Hold " + name(e.main) + " after the kan for at least half a second.")], {}, "kan");
  const before = runs.slice(0, mi), graceRun = before.find(r => r.semi === e.grace);
  const graceDur = graceRun ? runDur(runs, runs.indexOf(graceRun)) : 0;
  const lead = before.length ? runs[mi].t0 - before[0].t0 : 0;
  const others = before.filter(r => r.semi !== e.grace && r.semi !== e.main);
  const main = rs.filter(r => r.semi !== null && r.t >= runs[mi].t0 + 0.1 && Math.round(r.semi) === e.main), cents = main.length ? Math.round((pct(main.map(r => r.semi), 0.5) - e.main) * 100) : 0;
  const gapBefore = graceRun && rs.some(r => r.semi === null && r.t > graceRun.t1 && r.t < runs[mi].t0 && runs[mi].t0 - graceRun.t1 > 0.09);
  const checks = [
    ok(graceRun, graceRun ? "The kan on " + name(e.grace) + " was heard." : "No kan heard: flick " + name(e.grace) + " just as the note starts. (A kan under about 40 ms can slip past the microphone: if you hear it yourself, record again.)"),
    ok(graceRun && graceDur <= 0.18, !graceRun ? "The kan should last a blink: under about 150 ms." : graceDur > 0.18 ? "The kan lasted " + Math.round(graceDur * 1000) + " ms: that is two notes. Make it a flick, not a note." : "Short and light (" + Math.round(graceDur * 1000) + " ms)."),
    ok(!gapBefore, gapBefore ? "The sound broke between the kan and the note: one breath, no gap." : "Joined to the note in one breath."),
    ok(!others.length && lead <= 0.3, others.length ? "Other notes crept in before " + name(e.main) + " (" + others.map(r => name(r.semi)).join(", ") + "): only " + name(e.grace) + " is touched." : lead > 0.3 ? "The start took " + Math.round(lead * 1000) + " ms before reaching " + name(e.main) + ": quicker." : "Nothing else before the note."),
    ok(Math.abs(cents) <= 25, "The main note " + name(e.main) + " is " + (Math.abs(cents) <= 25 ? "in tune" : cents > 0 ? cents + " cents sharp" : -cents + " cents flat") + "."),
  ];
  return result(checks, { grace: Math.round(graceDur * 1000), lead: Math.round(lead * 1000), cents }, "kan");
}

export function analyseMurki(rs, e, name) {
  const v = voiced(rs);
  if (v.length < 6) return nothing("No clear note was heard: play a little louder or closer to the microphone.");
  const want = e.notes, fin = want[want.length - 1];
  const runs = runsOf(rs);
  // The murki ends where the last note starts to be held (0.3 s or more): the last such hold, since
  // a slow murki can rest on the same note on the way.
  let end = -1; runs.forEach((r, i) => { if (r.semi === fin && runDur(runs, i) >= 0.3) end = i; });
  if (end < 0) return result([ok(false, "Settle on " + name(fin) + " at the end and hold it.")], {}, "murki");
  const seq = runs.slice(0, end + 1).map(r => r.semi);
  // In order: the expected notes as a subsequence of what was played, and anything extra.
  let k = 0; for (const s of seq) if (k < want.length && s === want[k]) k++;
  const missing = want.length - k, extra = seq.length - k;
  const span = runs[end].t0 - runs[0].t0, each = span / Math.max(1, want.length - 1);
  const breaks = runs.slice(0, end).some(r => r.broken);
  const checks = [
    ok(missing === 0, missing ? "Not all the notes were heard in order: play " + want.map(name).join(" ") + ". (Very fast notes can run together for the microphone: try it a little slower.)" : "All the notes, in order."),
    ok(extra <= 1, extra > 1 ? "Extra notes crept in: keep the cluster to the notes shown." : "No extra notes."),
    ok(each <= (e.maxEach || 0.2), each > (e.maxEach || 0.2) ? "About " + Math.round(each * 1000) + " ms a note: lighter and quicker, so it is one gesture." : "Quick and light: about " + Math.round(each * 1000) + " ms a note."),
    ok(!breaks, breaks ? "The sound broke inside the murki: one breath for the whole cluster." : "One breath, no break."),
  ];
  return result(checks, { each: Math.round(each * 1000), missing, extra }, "murki");
}

export function analyseAndolan(rs, e, name) {
  const v = voiced(rs);
  const span = v.length ? v[v.length - 1].t - v[0].t : 0;
  if (span < 2) return nothing("Hold the note for at least three seconds while it swings.");
  // Smooth over 5 frames, then count swings across the middle with some hysteresis.
  const s = v.map((r, i) => { const w = v.slice(Math.max(0, i - 2), i + 3); return { t: r.t, semi: w.reduce((a, x) => a + x.semi, 0) / w.length }; });
  const top = pct(s.map(r => r.semi), 0.9), bottom = pct(s.map(r => r.semi), 0.1), depth = top - bottom, mid = (top + bottom) / 2, hy = Math.max(0.05, depth * 0.2);
  const cross = []; let side = 0;
  for (const r of s) { const d = r.semi - mid; if (d > hy && side <= 0) { if (side < 0) cross.push(r.t); side = 1; } else if (d < -hy && side >= 0) { if (side > 0) cross.push(r.t); side = -1; } }
  const rate = cross.length >= 3 ? (cross.length - 1) / 2 / (cross[cross.length - 1] - cross[0]) : 0;
  const halves = cross.slice(1).map((t, i) => t - cross[i]), mean = halves.reduce((a, x) => a + x, 0) / Math.max(1, halves.length);
  const cv = halves.length >= 3 ? Math.sqrt(halves.reduce((a, x) => a + (x - mean) ** 2, 0) / halves.length) / mean : 1;
  const topCents = Math.round((top - e.note) * 100);
  const checks = [
    ok(depth >= 0.2 && depth <= 1.3, depth < 0.2 ? "The swing is too narrow (" + Math.round(depth * 100) + " cents): shade the hole further." : depth > 1.3 ? "The swing is too wide (" + Math.round(depth * 100) + " cents): it reaches the next note. Shade the hole less." : "Swing width " + Math.round(depth * 100) + " cents: good."),
    ok(rate >= 0.4 && rate <= 2.2, !rate ? "No regular swing was heard: sway the note slowly below its place and back." : rate > 2.2 ? "Too fast (" + rate.toFixed(1) + " swings a second): that is a shake. Slow it to about one a second." : rate < 0.4 ? "Very slow (" + rate.toFixed(1) + " a second): a little quicker." : rate.toFixed(1) + " swings a second: good."),
    ok(cv <= 0.35, cv > 0.35 ? "The swings are uneven: keep them the same length, like a slow pendulum." : "Even swings."),
    ok(Math.abs(topCents) <= 30, Math.abs(topCents) <= 30 ? "The top of the swing is on " + name(e.note) + "." : "The top of the swing is " + (topCents > 0 ? topCents + " cents above " : -topCents + " cents below ") + name(e.note) + ": the note itself is the top; sway below it."),
  ];
  return result(checks, { depth: Math.round(depth * 100), rate: Math.round(rate * 100) / 100, cv: Math.round(cv * 100) / 100, topCents }, "andolan");
}

export const ANALYSE = { meend: analyseMeend, kan: analyseKan, murki: analyseMurki, andolan: analyseAndolan };
// Analyse an attempt: clean readings, then the ornament's analyser. name(semi) gives a note's name.
export function analyse(key, e, readings, name) { return ANALYSE[key](cleanReadings(readings), e, name || String); }

// A teacher's recorded model as a target curve. frames: [{ s: semitones } | null] every hopS
// seconds (core/pitch.js analyzeAudioBuffer). The curve starts at the first clear note and ends
// at the last, and is moved by whole semitones so it starts on the exercise's first note: a model
// recorded on a flute in another key, or an octave away, still lines up with the learner's flute.
export function modelCurve(frames, hopS, startSemi) {
  const first = frames.findIndex(f => f), last = frames.length - 1 - [...frames].reverse().findIndex(f => f);
  if (first < 0 || frames.filter(Boolean).length < 10) return null;
  const head = frames.slice(first, first + Math.max(3, Math.round(0.2 / hopS))).filter(Boolean).map(f => f.s).sort((a, b) => a - b);
  const shift = Math.round(startSemi - head[head.length >> 1]);
  const step = Math.max(1, Math.ceil((last - first + 1) / 800)), curve = [];
  for (let i = first; i <= last; i += step) curve.push({ t: Math.round((i - first) * hopS * 1000) / 1000, semi: frames[i] ? Math.round((frames[i].s + shift) * 100) / 100 : null });
  return { curve, shift };
}
