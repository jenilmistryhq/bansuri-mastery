// Pitch detection (YIN), recording analysis, live microphone tuner and the pitch plot.
import { saHz } from "./settings.js";
import { codeOf, pcOf } from "./theory.js";
import { ac } from "./audio.js";

export const CHECK_PLANS = [
  ["Day 0: Sa only (XXX OOO, gentle air)", [0]],
  ["Register 1 tour: .P .D .N S R G M", [-5, -3, -1, 0, 2, 4, 6]],
  ["Middle octave, Kalyan: S R G M P D N S'", [0, 2, 4, 6, 7, 9, 11, 12]],
  ["Middle octave, Bilawal: S R G m P D N S'", [0, 2, 4, 5, 7, 9, 11, 12]],
  ["Octave pairs: .P P .D D .N N S S'", [-5, 7, -3, 9, -1, 11, 0, 12]],
  ["Half-holes: r g m d n (middle)", [1, 3, 5, 8, 10]],
  ["Upper octave: S' R' G' m' M'", [12, 14, 16, 17, 18]],
  ["Anything: just list what I played", []]
];

export function yin(buf, sr) {
  const fmin = 170, fmax = 3000, tauMin = Math.floor(sr / fmax), tauMax = Math.min(Math.floor(sr / fmin), (buf.length >> 1) - 1);
  let rms = 0; for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i]; rms = Math.sqrt(rms / buf.length);
  if (rms < 0.006) return null;
  const W = buf.length - tauMax, d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) { let s = 0; for (let i = 0; i < W; i++) { const df = buf[i] - buf[i + tau]; s += df * df; } d[tau] = s; }
  const cm = new Float32Array(tauMax + 1); cm[0] = 1; let run = 0;
  for (let tau = 1; tau <= tauMax; tau++) { run += d[tau]; cm[tau] = run ? d[tau] * tau / run : 1; }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) { if (cm[t] < 0.15) { while (t + 1 <= tauMax && cm[t + 1] < cm[t]) t++; tau = t; break; } }
  if (tau < 1) return null;
  const x0 = cm[tau - 1], x2 = tau < tauMax ? cm[tau + 1] : cm[tau], den = x0 + x2 - 2 * cm[tau];
  const best = den ? tau + (x0 - x2) / (2 * den) : tau;
  return { f: sr / best, clarity: 1 - cm[tau], rms };
}

export function relSemi(f) { return 12 * Math.log2(f / saHz()); }

export function verdict(cents) {
  const a = Math.abs(cents);
  return a <= 10 ? ["In tune", "good"] : a <= 25 ? ["Close", "warn"] : ["Adjust", "bad"];
}

// Repair the two common detector errors on real, breathy flute recordings:
// - octave errors: a frame one or two octaves away from its neighbours is folded back to them;
// - dropouts: a single unvoiced frame inside a steady note is filled, so the note is not split.
export function cleanFrames(frames) {
  const out = frames.map(f => f && { s: f.s, f: f.f });
  for (let i = 0; i < out.length; i++) {
    if (!out[i]) continue;
    const near = [];
    for (let k = Math.max(0, i - 5); k <= Math.min(out.length - 1, i + 5); k++) if (k !== i && frames[k]) near.push(frames[k].s);
    if (near.length < 3) continue;
    near.sort((a, b) => a - b);
    const med = near[near.length >> 1];
    for (const oct of [12, -12, 24, -24]) {
      if (Math.abs(out[i].s + oct - med) < 0.6 && Math.abs(out[i].s - med) > 6) { out[i].s += oct; out[i].f *= Math.pow(2, oct / 12); break; }
    }
  }
  for (let i = 1; i < out.length - 1; i++) {
    if (!out[i] && out[i - 1] && out[i + 1] && Math.abs(out[i - 1].s - out[i + 1].s) < 0.35) out[i] = { s: (out[i - 1].s + out[i + 1].s) / 2, f: (out[i - 1].f + out[i + 1].f) / 2 };
  }
  return out;
}

// How far the whole recording sits from the equal-tempered notes of the set Sa, in cents.
// Cents wrap (+50 and -50 are the same place), so this is a circular average weighted by duration.
// Returns { cents, spread, seconds } or null. A consistent offset with a small spread means the
// flute itself is tuned away from Sa at A4 = 440 (common), not that every note was played out of tune.
export function tuningOffset(segments) {
  let x = 0, y = 0, w = 0;
  for (const sg of segments) {
    const held = sg.t1 - sg.t0, a = (sg.med - Math.round(sg.med)) * 2 * Math.PI;
    x += Math.cos(a) * held; y += Math.sin(a) * held; w += held;
  }
  if (w < 1) return null;
  const cents = Math.atan2(y, x) / (2 * Math.PI) * 100;
  const devs = segments.map(sg => { let d = (sg.med - Math.round(sg.med)) * 100 - cents; d -= 100 * Math.round(d / 100); return Math.abs(d); }).sort((a, b) => a - b);
  return { cents: Math.round(cents), spread: Math.round(devs[devs.length >> 1]), seconds: w };
}

// A 6-hole bansuri cannot sound far below .P or above register 3, so "notes" there are detector
// errors (breath noise, a wrong octave). Drop them, unless most of the recording is out of range:
// then the flute's Sa setting is probably wrong, and the learner needs to see those notes.
export function playableOnly(segments) {
  const ok = sg => sg.med > -7.5 && sg.med < 26.5, dur = sg => sg.t1 - sg.t0;
  const inside = segments.filter(ok);
  const tot = segments.reduce((s, sg) => s + dur(sg), 0), inDur = inside.reduce((s, sg) => s + dur(sg), 0);
  return tot && inDur / tot >= 0.6 ? inside : segments;
}

export function segmentsFrom(frames, hopS) {
  const segs = []; let cur = null;
  frames.forEach((fr, i) => {
    if (fr && cur && Math.abs(fr.s - cur.mean) < 0.35) { cur.vals.push(fr.s); cur.end = i; cur.mean = cur.vals.reduce((a, b) => a + b, 0) / cur.vals.length; }
    else { if (cur) segs.push(cur); cur = fr ? { start: i, end: i, vals: [fr.s], mean: fr.s } : null; }
  });
  if (cur) segs.push(cur);
  return segs.filter(s => (s.end - s.start + 1) * hopS >= 0.3).map(s => {
    const v = s.vals.slice().sort((a, b) => a - b);
    return { t0: s.start * hopS, t1: (s.end + 1) * hopS, med: v[Math.floor(v.length / 2)] };
  });
}

export async function decodeAudioFile(file) {
  const arr = await file.arrayBuffer();
  return ac().decodeAudioData(arr);
}

// Analyse a decoded AudioBuffer. Resolves { frames, hopS, segments, seconds, truncated }.
export async function analyzeAudioBuffer(audio, opts) {
  opts = opts || {};
  const maxSeconds = opts.maxSeconds || 180;
  const raw = audio.getChannelData(0);
  let data = raw, sr = audio.sampleRate;
  if (sr > 32000) { const n = Math.floor(raw.length / 2); data = new Float32Array(n); for (let i = 0; i < n; i++) data[i] = (raw[2 * i] + raw[2 * i + 1]) * 0.5; sr = sr / 2; }
  const maxLen = Math.min(data.length, Math.floor(sr * maxSeconds));
  const size = 1024, hop = Math.round(sr * 0.03), frames = [];
  let pos = 0;
  await new Promise(resolve => {
    const step = () => {
      const until = Math.min(maxLen - size, pos + hop * 120);
      for (; pos < until; pos += hop) {
        const r = yin(data.subarray(pos, pos + size), sr);
        frames.push(r && r.clarity > 0.8 ? { s: relSemi(r.f), f: r.f } : null);
      }
      if (opts.onProgress) opts.onProgress(Math.min(100, Math.round(pos / Math.max(1, maxLen - size) * 100)));
      if (pos < maxLen - size) setTimeout(step, 0); else resolve();
    };
    step();
  });
  const hopS = hop / sr, clean = cleanFrames(frames);
  return { frames: clean, hopS, segments: playableOnly(segmentsFrom(clean, hopS)), seconds: maxLen / sr, truncated: data.length > maxLen };
}

// rows[i] = { n, expected, near, cents, held, t0, t1, status, verdict: [label, kind] }
// status: "ok" (expected note found), "different", "missing", "extra" (beyond the plan), "free" (no plan)
// With a plan, segments are aligned to the expected notes (an edit-distance alignment), so one stray
// sound does not shift every later row. Short stray sounds (slides between notes) are dropped.
export function compareToExpected(segments, expected) {
  expected = expected || [];
  const row = (sg, exp, status) => {
    if (!sg) return { expected: exp, near: null, cents: null, held: 0, status: "missing", verdict: ["Missing", "bad"] };
    const near = Math.round(sg.med), cents = Math.round((sg.med - near) * 100), held = sg.t1 - sg.t0;
    const v = status === "extra" ? ["Extra", "info"] : status === "different" ? ["Different note", "bad"] : verdict(cents);
    return { expected: exp === undefined ? null : exp, near, cents, held, t0: sg.t0, t1: sg.t1, status, verdict: v };
  };
  let rows = [];
  if (!expected.length) rows = segments.map(sg => row(sg, undefined, "free"));
  else {
    const m = segments.length, n = expected.length, near = segments.map(sg => Math.round(sg.med));
    const skipSeg = i => (segments[i].t1 - segments[i].t0 < 0.6 ? 0.3 : 1);
    const D = Array.from({ length: m + 1 }, () => new Float64Array(n + 1));
    for (let i = 1; i <= m; i++) D[i][0] = D[i - 1][0] + skipSeg(i - 1);
    for (let j = 1; j <= n; j++) D[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      D[i][j] = Math.min(D[i - 1][j - 1] + (near[i - 1] === expected[j - 1] ? 0 : 1), D[i - 1][j] + skipSeg(i - 1), D[i][j - 1] + 1);
    }
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (near[i - 1] === expected[j - 1] ? 0 : 1)) { rows.push(row(segments[i - 1], expected[j - 1], near[i - 1] === expected[j - 1] ? "ok" : "different")); i--; j--; }
      else if (i > 0 && D[i][j] === D[i - 1][j] + skipSeg(i - 1)) { const sg = segments[i - 1]; if (sg.t1 - sg.t0 >= 0.6) rows.push(row(sg, undefined, "extra")); i--; }
      else { rows.push(row(null, expected[j - 1])); j--; }
    }
    rows.reverse();
  }
  rows.forEach((r, k) => { r.n = k + 1; });
  return rows;
}

export function drawPitchPlot(canvas, result) {
  const frames = result.frames, hopS = result.hopS, segs = result.segments;
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1, W = canvas.clientWidth || 600, H = canvas.clientHeight || 260;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const css = getComputedStyle(canvas);
  const col = (k, d) => (css.getPropertyValue(k) || "").trim() || d;
  const C = { ink: col("--ink", "#1b2420"), line: col("--line", "#cfd6ca"), muted: col("--muted", "#56645d"), accent: col("--accent", "#0d6a6e"), good: col("--good", "#2e7a3a"), warn: col("--warn", "#9a6512"), bad: col("--bad", "#b3261e"), mono: col("--mono", "monospace") };
  const vals = frames.filter(Boolean).map(f => f.s);
  let lo = -1, hi = 13; vals.forEach(v => { if (v < lo) lo = v; if (v > hi) hi = v; });
  lo = Math.floor(lo) - 1; hi = Math.ceil(hi) + 1;
  const tot = Math.max(0.001, frames.length * hopS);
  const padL = 44, padR = 10, padT = 10, padB = 22;
  const x = t => padL + (t / tot) * (W - padL - padR), y = s => padT + (hi - s) / (hi - lo) * (H - padT - padB);
  g.font = "12px " + C.mono; g.textBaseline = "middle";
  for (let s = lo; s <= hi; s++) {
    const pc = pcOf(s), natural = [0, 2, 4, 5, 7, 9, 11].includes(pc);
    g.strokeStyle = C.line; g.globalAlpha = natural ? 1 : 0.45; g.beginPath(); g.moveTo(padL, y(s)); g.lineTo(W - padR, y(s)); g.stroke(); g.globalAlpha = 1;
    if (natural || pc === 6) { g.fillStyle = pc === 0 ? C.accent : C.muted; g.fillText(codeOf(s), 6, y(s)); }
  }
  g.fillStyle = C.muted; g.fillText("0 s", padL, H - 8);
  g.textAlign = "right"; g.fillText(tot.toFixed(1) + " s", W - padR, H - 8); g.textAlign = "left";
  g.fillStyle = C.ink;
  frames.forEach((f, i) => { if (f && f.s >= lo && f.s <= hi) g.fillRect(x(i * hopS), y(f.s) - 1, 2, 2); });
  segs.forEach(sg => {
    const near = Math.round(sg.med), k = verdict(Math.round((sg.med - near) * 100))[1];
    g.strokeStyle = k === "good" ? C.good : k === "warn" ? C.warn : C.bad; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x(sg.t0), y(sg.med)); g.lineTo(x(sg.t1), y(sg.med)); g.stroke(); g.lineWidth = 1;
  });
}

// Live tuner. Calls onReading({ semi, near, cents, f }) about 60 times a second.
// Resolves to a stop() function, or rejects with an Error whose message explains why.
export async function startMicTuner(onReading) {
  if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("unavailable");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const c = ac(), src = c.createMediaStreamSource(stream), an = c.createAnalyser();
  an.fftSize = 2048; src.connect(an);
  const buf = new Float32Array(an.fftSize), hist = [];
  let on = true, raf = 0;
  const loop = () => {
    if (!on) return;
    an.getFloatTimeDomainData(buf);
    const r = yin(buf, c.sampleRate);
    if (r && r.clarity > 0.85) {
      hist.push(relSemi(r.f)); if (hist.length > 6) hist.shift();
      const s = hist.slice().sort((a, b) => a - b)[hist.length >> 1], near = Math.round(s);
      onReading({ semi: s, near, cents: Math.round((s - near) * 100), f: r.f });
    }
    raf = requestAnimationFrame(loop);
  };
  loop();
  return function stop() {
    on = false; cancelAnimationFrame(raf);
    try { src.disconnect(); } catch (e) { /* ignore */ }
    stream.getTracks().forEach(t => t.stop());
  };
}
