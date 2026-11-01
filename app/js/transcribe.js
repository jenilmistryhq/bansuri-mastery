// Notation from a recording: the pitch of every 20 ms, the recording's Sa, the notes, the beat, and
// sargam for the chosen flute. Works on one clear melody (a solo flute, a single voice, a tune much
// louder than its accompaniment); it is a draft to check by ear, not a finished transcription.
// Pure functions (no DOM), so tests/transcribe.test.mjs can run them on synthetic recordings.
import { yin } from "./core/pitch.js";
import { codeOf, fingOf, WEST } from "./core/theory.js";

export const HOP = 0.02;
// Frame i is centred on time i * HOP: the signal is analysed with `half` samples of silence in
// front (half a window), so a note's time is when it is heard, not half a window early.
function padFront(x, half) { const o = new Float32Array(x.length + half); o.set(x, half); return o; }
const MIN_NOTE = 4; // frames (80 ms): anything shorter is a glide or a grace note, not a note

// Mono, at about 22-24 kHz (enough for melody pitch), scaled so the loudest sample is 0.5.
export function monoDown(channels, sr) {
  const k = sr > 32000 ? 2 : 1, n = Math.floor(channels[0].length / k), out = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const ch of channels) for (let j = 0; j < k; j++) s += ch[i * k + j];
    out[i] = s / (channels.length * k);
    const a = Math.abs(out[i]); if (a > peak) peak = a;
  }
  if (peak > 0) for (let i = 0; i < n; i++) out[i] *= 0.5 / peak;
  return { data: out, sr: sr / k };
}

// Left, right and mid at about 22-24 kHz, scaled together, and how much the channels differ (side
// energy against mid energy): under about 2% the recording is effectively mono and cannot be split.
export function stereoDown(channels, sr) {
  if (channels.length < 2) return null;
  const k = sr > 32000 ? 2 : 1, n = Math.floor(channels[0].length / k);
  const L = new Float32Array(n), R = new Float32Array(n), M = new Float32Array(n);
  let peak = 0, em = 0, es = 0;
  for (let i = 0; i < n; i++) {
    let l = 0, r = 0;
    for (let j = 0; j < k; j++) { l += channels[0][i * k + j]; r += channels[1][i * k + j]; }
    l /= k; r /= k; L[i] = l; R[i] = r; M[i] = (l + r) / 2;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    em += M[i] * M[i]; es += (l - r) * (l - r) / 4;
  }
  if (peak > 0) for (let i = 0; i < n; i++) { L[i] *= 0.5 / peak; R[i] *= 0.5 / peak; M[i] *= 0.5 / peak; }
  return { L, R, M, sr: sr / k, side: em ? es / em : 0 };
}

// Singer and background from a mono recording, by repetition (REPET-SIM, Rafii and Pardo 2012):
// the backing music of a song repeats (the same chords, rhythm and accompaniment bar after bar),
// the melody changes. Every 0.1 s block is compared with every other (log-band spectra, cosine);
// the background at each moment is the median of the 10 most similar moments at least a second
// away, and the singer is what is left. Less exact than the stereo split; it needs a song whose
// backing repeats. Resolves { singer, background }: magnitude spectra (bins up to 5 kHz) per frame,
// framed like melodyTrack, for pitchTrack's o.mags.
export async function repetitionParts(data, sr, o) {
  o = Object.assign({ maxSeconds: 360, onProgress: null }, o || {});
  data = padFront(data, FFT_N / 2);
  const hop = Math.round(sr * HOP), end = Math.min(data.length, Math.floor(sr * o.maxSeconds)) - FFT_N;
  const KB = Math.min(FFT_N / 2, Math.ceil(5000 * FFT_N / sr) + 2);
  const win = new Float32Array(FFT_N); for (let i = 0; i < FFT_N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_N - 1));
  const re = new Float64Array(FFT_N), im = new Float64Array(FFT_N), S = [];
  const tick = async (p) => { if (o.onProgress) o.onProgress(p); await new Promise(res => setTimeout(res, 0)); };
  for (let pos = 0, n = 0; pos < end; pos += hop, n++) {
    S.push(spectrum(data.subarray(pos, pos + FFT_N), win, re, im).slice(0, KB));
    if (n % 300 === 299) await tick(Math.round(pos / end * 30));
  }
  const T = S.length, BL = 5, NBL = Math.floor(T / BL), BANDS = Math.ceil(KB / 10);
  // Block features: log band energies, centred and normalised (cosine similarity = dot product).
  const F = [];
  for (let i = 0; i < NBL; i++) {
    const f = new Float32Array(BANDS);
    for (let t = i * BL; t < i * BL + BL; t++) for (let k = 1; k < KB; k++) f[Math.floor(k / 10)] += S[t][k];
    let mean = 0; for (let b = 0; b < BANDS; b++) { f[b] = Math.log(1 + f[b]); mean += f[b]; }
    mean /= BANDS;
    let norm = 0; for (let b = 0; b < BANDS; b++) { f[b] -= mean; norm += f[b] * f[b]; }
    norm = Math.sqrt(norm) || 1; for (let b = 0; b < BANDS; b++) f[b] /= norm;
    F.push(f);
  }
  const K = 10, AWAY = Math.round(1 / (HOP * BL)), nearest = [];
  for (let i = 0; i < NBL; i++) {
    const best = [];
    for (let j = 0; j < NBL; j++) {
      if (Math.abs(i - j) < AWAY) continue;
      let d = 0; const a = F[i], b = F[j]; for (let x = 0; x < BANDS; x++) d += a[x] * b[x];
      if (best.length < K) { best.push([d, j]); best.sort((p, q) => q[0] - p[0]); }
      else if (d > best[K - 1][0]) { best[K - 1] = [d, j]; best.sort((p, q) => q[0] - p[0]); }
    }
    nearest.push(best.map(x => x[1]));
    if (i % 200 === 199) await tick(30 + Math.round(i / NBL * 40));
  }
  const singer = [], background = [], vals = [];
  for (let t = 0; t < T; t++) {
    const i = Math.min(NBL - 1, Math.floor(t / BL)), r = t - i * BL, mix = S[t];
    const sg = new Float32Array(KB), bg = new Float32Array(KB), srcs = (nearest[i] || []).map(j => S[j * BL + r]).filter(Boolean);
    for (let k = 0; k < KB; k++) {
      vals.length = 0; for (const x of srcs) vals.push(x[k]);
      let m = mix[k];
      if (vals.length) { vals.sort((p, q) => p - q); m = Math.min(mix[k], vals[vals.length >> 1]); }
      bg[k] = m; sg[k] = mix[k] - m;
    }
    singer.push(sg); background.push(bg);
    if (t % 500 === 499) await tick(70 + Math.round(t / T * 30));
  }
  return { singer, background };
}

// Pitch (MIDI number, fractional) and loudness every HOP seconds. Voices go down to about 75 Hz,
// so the range is wider than the flute tuner's. Resolves { track, levels, seconds, truncated }.
// opts.engine: "melody" (default: follows the main melody through accompaniment, see melodyTrack)
// or "yin" (one pitch at a time; fine for a solo instrument).
export async function pitchTrack(data, sr, opts) {
  const o = Object.assign({ maxSeconds: 360, onProgress: null, engine: "melody" }, opts || {});
  if (o.engine !== "yin") return melodyTrack(data, sr, o);
  const size = 1024, hop = Math.round(sr * HOP);
  data = padFront(data, size / 2);
  const end = Math.min(data.length, Math.floor(sr * o.maxSeconds)) - size;
  const track = [], levels = [];
  for (let pos = 0, n = 0; pos < end; pos += hop, n++) {
    const buf = data.subarray(pos, pos + size);
    const r = yin(buf, sr, 75, 2200, 0.2);
    // Loudness over the middle 20 ms only, so a short break between repeated notes shows as a dip.
    const mid = buf.subarray(size / 2 - hop / 2, size / 2 + hop / 2);
    let sq = 0; for (let i = 0; i < mid.length; i++) sq += mid[i] * mid[i];
    levels.push(Math.sqrt(sq / mid.length));
    track.push(r ? 69 + 12 * Math.log2(r.f / 440) : null);
    if (n % 250 === 249) { if (o.onProgress) o.onProgress(Math.round(pos / end * 100)); await new Promise(res => setTimeout(res, 0)); }
  }
  return { track: cleanTrack(track), levels, seconds: Math.max(0, end) / sr, truncated: data.length - size > end };
}

// ---- Melody through accompaniment ----
// The usual way to pull a melody out of a mix (harmonic summation, as in Salamon and Gomez's
// MELODIA): each 20 ms, the spectrum's peaks vote for every pitch they could be a harmonic of
// (fewer votes for higher harmonics); sounds that hold still through the whole recording (a
// tanpura, a drone, a sustained pad) are subtracted bin by bin; then a path through the votes is
// chosen that is strong and moves smoothly (a dynamic programme, with a cost for every jump).
// Frames where the chosen pitch is weak count as silence.
const FFT_N = 2048, BIN = 0.2, LO_MIDI = 69 + 12 * Math.log2(75 / 440), HI_MIDI = 69 + 12 * Math.log2(2200 / 440);
const NB = Math.ceil((HI_MIDI - LO_MIDI) / BIN) + 1;

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

// The magnitude spectrum of one windowed frame (FFT_N / 2 bins).
function spectrum(frame, win, re, im) {
  re.fill(0); im.fill(0);
  for (let i = 0; i < frame.length; i++) re[i] = frame[i] * win[i];
  fft(re, im);
  const mag = new Float32Array(FFT_N / 2);
  for (let k = 1; k < FFT_N / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
  return mag;
}

// Singer or background, from a stereo frame. In a stereo mix the singer is almost always in the
// centre (the same in both channels) and many instruments are to the sides. Per frequency bin, the
// centre share is how small the left-right difference is against the sum: "singer" keeps the
// centre part of the mix, "background" the rest. Bass and drums are usually central too (they go
// with the singer; the melody tracker mostly ignores drums). Returns the magnitude spectrum.
function partSpectrum(L, R, part, win, bufs) {
  const [lr, li, rr, ri] = bufs;
  lr.fill(0); li.fill(0); rr.fill(0); ri.fill(0);
  for (let i = 0; i < FFT_N; i++) { lr[i] = L[i] * win[i]; rr[i] = R[i] * win[i]; }
  fft(lr, li); fft(rr, ri);
  const mag = new Float32Array(FFT_N / 2);
  for (let k = 1; k < FFT_N / 2; k++) {
    const mr = (lr[k] + rr[k]) / 2, mi = (li[k] + ri[k]) / 2, sr_ = (lr[k] - rr[k]) / 2, si = (li[k] - ri[k]) / 2;
    const m = Math.hypot(mr, mi), sd = Math.hypot(sr_, si), ratio = m > 1e-9 ? sd / m : 1;
    const centre = ratio <= 0.3 ? 1 : ratio >= 0.6 ? 0 : (0.6 - ratio) / 0.3;
    mag[k] = m * (part === "singer" ? centre : 1 - centre);
  }
  return mag;
}

// A melody is rarely the lowest line: a bass under the tune also gets votes, so pitches below the
// singing range count a little less (full weight from MIDI LOW_FULL up, falling to LOW_MIN at 75 Hz).
const LOW_FULL = 55, LOW_MIN = 0.3;
const PRIOR = Float32Array.from({ length: Math.ceil((HI_MIDI - LO_MIDI) / BIN) + 1 }, (_, b) => { const m = LO_MIDI + b * BIN; return m >= LOW_FULL ? 1 : LOW_MIN + (1 - LOW_MIN) * (m - LO_MIDI) / (LOW_FULL - LO_MIDI); });
// Votes for one frame's spectrum: Float32Array(NB), pitch bins of 20 cents from 75 Hz.
function salience(mag, sr) {
  const half = mag.length;
  let max = 0;
  for (let k = 1; k < half; k++) if (mag[k] > max) max = mag[k];
  const out = new Float32Array(NB);
  if (max < 1e-4) return out;
  const peaks = [];
  for (let k = 2; k < half - 1; k++) {
    if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1] && mag[k] > max * 0.01) {
      const a = Math.log(mag[k - 1] + 1e-9), b = Math.log(mag[k]), c = Math.log(mag[k + 1] + 1e-9), den = a - 2 * b + c;
      const d = den ? 0.5 * (a - c) / den : 0, f = (k + d) * sr / FFT_N;
      if (f >= 70 && f <= 5000) peaks.push([f, Math.exp(b - 0.25 * (a - c) * d)]);
    }
  }
  peaks.sort((x, y) => y[1] - x[1]);
  for (const [f, amp] of peaks.slice(0, 30)) {
    const w0 = Math.sqrt(amp / max);
    for (let h = 1; h <= 8; h++) {
      const m = 69 + 12 * Math.log2(f / h / 440), c = (m - LO_MIDI) / BIN;
      if (c < -5 || c > NB + 5) continue;
      const w = w0 * Math.pow(0.8, h - 1);
      for (let b = Math.max(0, Math.ceil(c - 5)); b <= Math.min(NB - 1, Math.floor(c + 5)); b++) {
        const x = Math.cos(Math.PI / 2 * (b - c) / 5); out[b] += w * x * x * PRIOR[b];
      }
    }
  }
  return out;
}

// o.stereo: { L, R, part: "singer" | "background" } follows that part of a stereo mix (data is
// then the mid signal); o.mags (one magnitude spectrum per frame, as from repetitionParts) with
// o.part follows a part separated another way; without either, the whole mix.
export async function melodyTrack(data, sr, o) {
  data = padFront(data, FFT_N / 2);
  if (o.stereo) o = { ...o, stereo: { ...o.stereo, L: padFront(o.stereo.L, FFT_N / 2), R: padFront(o.stereo.R, FFT_N / 2) } };
  const hop = Math.round(sr * HOP), end = Math.min(data.length, Math.floor(sr * o.maxSeconds)) - FFT_N;
  const win = new Float32Array(FFT_N); for (let i = 0; i < FFT_N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_N - 1));
  const re = new Float64Array(FFT_N), im = new Float64Array(FFT_N), bufs = [0, 0, 0, 0].map(() => new Float64Array(FFT_N));
  const st = o.stereo, sal = [], levels = [], yins = [], mixSal = o.mags ? [] : null;
  for (let pos = 0, n = 0; pos < end; pos += hop, n++) {
    const frame = data.subarray(pos, pos + FFT_N);
    const mag = o.mags ? o.mags[n] : st ? partSpectrum(st.L.subarray(pos, pos + FFT_N), st.R.subarray(pos, pos + FFT_N), st.part, win, bufs) : spectrum(frame, win, re, im);
    if (!mag) break;
    sal.push(salience(mag, sr));
    // A part separated by repetition shows which line to follow; the exact pitch is read from the
    // whole mix near it (subtracting the background shifts the part's own peaks a little).
    if (mixSal) mixSal.push(salience(spectrum(frame, win, re, im), sr));
    // A very confident single-pitch reading of the frame's middle, to check the octave below
    // (not for the background: the mid signal there is mostly the singer).
    const y = (st && st.part === "background") || o.part === "background" ? null : yin(frame.subarray(FFT_N / 2 - 512, FFT_N / 2 + 512), sr, 75, 2200, 0.1);
    yins.push(y && y.clarity >= 0.93 ? 69 + 12 * Math.log2(y.f / 440) : null);
    if (st || o.mags) {
      // The part's own loudness, from its spectrum (the mix's loudness would hide the other part's gaps).
      let sq = 0; for (let k = 1; k < mag.length; k++) sq += mag[k] * mag[k];
      levels.push(Math.sqrt(sq) / FFT_N);
    } else {
      const mid = frame.subarray(FFT_N / 2 - hop / 2, FFT_N / 2 + hop / 2);
      let sq = 0; for (let i = 0; i < mid.length; i++) sq += mid[i] * mid[i];
      levels.push(Math.sqrt(sq / mid.length));
    }
    if (n % 200 === 199) { if (o.onProgress) o.onProgress(Math.round(pos / end * 90)); await new Promise(res => setTimeout(res, 0)); }
  }
  const T = sal.length;
  if (!T) return { track: [], levels, seconds: 0, truncated: false };
  // What holds still all through: the 40th percentile of each bin over time (sampled), subtracted.
  const step = Math.max(1, Math.floor(T / 400)), base = new Float32Array(NB), col = [];
  for (let b = 0; b < NB; b++) {
    col.length = 0;
    for (let t = 0; t < T; t += step) col.push(sal[t][b]);
    col.sort((x, y) => x - y);
    base[b] = col[Math.floor(col.length * 0.4)];
  }
  for (let t = 0; t < T; t++) { const v = sal[t]; for (let b = 0; b < NB; b++) v[b] = Math.max(0, v[b] - base[b]); }
  // Drum strokes are short bursts that vote everywhere at once; a 5-frame (100 ms) median of each
  // pitch over time removes them and keeps notes, which last longer.
  const orig = sal.map(v => v.slice());
  {
    const w = [0, 0, 0, 0, 0];
    for (let t = 2; t < T - 2; t++) for (let b = 0; b < NB; b++) {
      for (let k = 0; k < 5; k++) w[k] = orig[t - 2 + k][b];
      w.sort((x, y) => x - y); sal[t][b] = w[2];
    }
  }
  // The path: strong and smooth. Cost per frame = -log(share of the frame's strongest vote), plus
  // 0.15 per 20-cent step moved (within 2.4 semitones a frame), or a jump anywhere for a fixed cost.
  const W = 12, LAM = 0.15, JUMP = 2.5;
  let cost = new Float64Array(NB), next = new Float64Array(NB);
  const back = new Array(T), emit = (v, mx, b) => -Math.log((v[b] + 1e-6 * mx + 1e-9) / (mx + 1e-9));
  { const v = sal[0]; let mx = 0; for (let b = 0; b < NB; b++) mx = Math.max(mx, v[b]); for (let b = 0; b < NB; b++) cost[b] = emit(v, mx, b); }
  for (let t = 1; t < T; t++) {
    const v = sal[t]; let mx = 0; for (let b = 0; b < NB; b++) mx = Math.max(mx, v[b]);
    let gmin = Infinity, garg = 0; for (let b = 0; b < NB; b++) if (cost[b] < gmin) { gmin = cost[b]; garg = b; }
    const from = new Int16Array(NB);
    for (let b = 0; b < NB; b++) {
      let best = gmin + JUMP, arg = garg;
      for (let r = Math.max(0, b - W); r <= Math.min(NB - 1, b + W); r++) { const c = cost[r] + LAM * Math.abs(r - b); if (c < best) { best = c; arg = r; } }
      next[b] = best + emit(v, mx, b); from[b] = arg;
    }
    back[t] = from;
    const tmp = cost; cost = next; next = tmp;
    if (t % 400 === 0) { if (o.onProgress) o.onProgress(90 + Math.round(t / T * 10)); await new Promise(res => setTimeout(res, 0)); }
  }
  let b = 0; for (let k = 1; k < NB; k++) if (cost[k] < cost[b]) b = k;
  const path = new Int16Array(T); path[T - 1] = b;
  for (let t = T - 1; t > 0; t--) { b = back[t][b]; path[t - 1] = b; }
  // Voicing: the path's strength against the typical strength where there is sound.
  const strength = Array.from(path, (pb, t) => sal[t][pb]);
  let loud = 0; for (const l of levels) if (l > loud) loud = l;
  const sounding = strength.filter((x, t) => levels[t] > loud * 0.05).sort((x, y) => x - y);
  const ref = sounding.length ? sounding[Math.floor(sounding.length * 0.5)] : 0;
  if (mixSal) for (let t = 0; t < T; t++) {
    const v = mixSal[t], pb = path[t];
    let best = pb; for (let b = Math.max(0, pb - 5); b <= Math.min(NB - 1, pb + 5); b++) if (v[b] > v[best]) best = b;
    if (v[best] > 0) { path[t] = best; sal[t] = v; }
  }
  const track = Array.from(path, (pb, t) => {
    if (levels[t] < loud * 0.02 || strength[t] < ref * 0.3) return null;
    const v = sal[t], a = pb > 0 ? v[pb - 1] : 0, c = pb < NB - 1 ? v[pb + 1] : 0, den = a - 2 * v[pb] + c;
    const d = den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den)) : 0;
    const m = LO_MIDI + (pb + d) * BIN, y = yins[t];
    // Harmonic votes can settle an octave (or two) below a clean note; a
    // confident single-pitch reading exactly that far above wins.
    if (y !== null) for (const k of [12, 24]) if (Math.abs(y - m - k) < 0.4) return y;
    return m;
  });
  // Breaks in the melody, such as the short gap before a repeated note: a dip in the loudness (clear
  // in a solo recording) or in the melody's own strength before the drum filter (clearer when
  // accompaniment fills the loudness). Their product dips when either does.
  let own = Array.from(path, (pb, t) => levels[t] * orig[t][pb]);
  // A separated part flickers in loudness; a 9-frame median keeps it from splitting every note.
  if (o.mags) { const raw = own; own = raw.map((x, t) => { const w = raw.slice(Math.max(0, t - 4), t + 5).sort((p, q) => p - q); return w[w.length >> 1]; }); }
  return { track: cleanTrack(track), levels: own, seconds: Math.max(0, end) / sr, truncated: data.length - FFT_N > end };
}

// The detector's usual slips: a frame an octave away from its neighbours is folded back, a single
// missing frame inside a note is filled, and a 5-frame median smooths the rest.
export function cleanTrack(raw) {
  const t = raw.slice(), n = t.length;
  for (let i = 0; i < n; i++) {
    if (t[i] === null) continue;
    const near = [];
    for (let k = Math.max(0, i - 5); k <= Math.min(n - 1, i + 5); k++) if (k !== i && raw[k] !== null) near.push(raw[k]);
    if (near.length < 4) continue;
    near.sort((a, b) => a - b);
    const med = near[near.length >> 1];
    for (const oct of [12, -12, 24, -24]) if (Math.abs(t[i] + oct - med) < 1 && Math.abs(t[i] - med) > 6) { t[i] += oct; break; }
  }
  for (let i = 1; i < n - 1; i++) if (t[i] === null && t[i - 1] !== null && t[i + 1] !== null && Math.abs(t[i - 1] - t[i + 1]) < 0.5) t[i] = (t[i - 1] + t[i + 1]) / 2;
  const out = t.slice();
  for (let i = 0; i < n; i++) {
    if (t[i] === null) continue;
    const w = [];
    for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < n && t[k] !== null) w.push(t[k]);
    if (w.length >= 3) { w.sort((a, b) => a - b); out[i] = w[w.length >> 1]; }
  }
  return out;
}

// Steady stretches of pitch, not yet named: a stretch goes on while the pitch stays within 0.6
// semitone of its recent average (so vibrato and andolan stay one note) and ends at a silence or a
// clear dip in loudness (a repeated note). Stretches shorter than 80 ms are glides (meend) or grace
// notes and are left out. Each keeps its median pitch, unrounded: naming it is labelNotes' job.
export function stableRuns(track, levels) {
  const runs = [];
  let cur = null;
  const close = i => { if (cur) { cur.i1 = i - 1; runs.push(cur); cur = null; } };
  const moving = slides(track);
  for (let i = 0; i < track.length; i++) {
    const m = track[i];
    if (m === null || moving[i]) { close(i); continue; }
    if (cur) {
      const recent = cur.vals.slice(-6), avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      if (Math.abs(m - avg) <= 0.6) { cur.vals.push(m); continue; }
    }
    close(i);
    cur = { i0: i, vals: [m] };
  }
  close(track.length);
  const split = [];
  for (const r of runs) {
    const lv = levels.slice(r.i0, r.i1 + 1), med = lv.slice().sort((a, b) => a - b)[lv.length >> 1];
    let start = r.i0, cut = false;
    for (let i = r.i0 + MIN_NOTE; i <= r.i1 - MIN_NOTE; i++) {
      if ((levels[i] < 0.45 * med || valley(levels, i, r.i0, r.i1)) && levels[i] <= levels[i - 1] && levels[i] <= levels[i + 1]) { split.push({ i0: start, i1: i - 1, vals: r.vals.slice(start - r.i0, i - r.i0), cut }); start = i + 1; cut = true; i += MIN_NOTE; }
    }
    split.push({ i0: start, i1: r.i1, vals: r.vals.slice(start - r.i0), cut });
  }
  const median = v => v.slice().sort((a, b) => a - b)[v.length >> 1];
  const joined = [];
  for (const r of split.filter(x => x.i1 - x.i0 + 1 >= MIN_NOTE)) {
    const p = joined[joined.length - 1];
    // A note broken by a short wobble joins back up (not one split at a loudness dip).
    if (p && !r.cut && r.i0 - p.i1 <= 4 && Math.abs(median(p.vals) - median(r.vals)) < 0.4 && track.slice(p.i1 + 1, r.i0).every(v => v !== null)) { p.i1 = r.i1; p.vals = p.vals.concat(r.vals); }
    else joined.push({ ...r });
  }
  // lv: how strong the melody was in the stretch (its median level), to drop weak, unsure ones.
  return joined.map(r => ({ t0: r.i0 * HOP, t1: (r.i1 + 1) * HOP, p: median(r.vals), lv: median(levels.slice(r.i0, r.i1 + 1)) }));
}

// Frames in the middle of a slide: over 140 ms around them the pitch never turns back, moves on in
// most frames, and by 0.6 semitone or more in all. Vibrato turns back sooner, and the quick glide into a
// note is shorter, so neither counts; a slow meend does, and is kept out of the notes on each side.
function slides(track) {
  const out = new Uint8Array(track.length);
  for (let i = 3; i < track.length - 3; i++) {
    if (track[i - 3] === null || track[i + 3] === null) continue;
    const dir = Math.sign(track[i + 3] - track[i - 3]);
    if (Math.abs(track[i + 3] - track[i - 3]) < 0.6) continue;
    let ok = true, steps = 0;
    for (let k = i - 3; k < i + 3 && ok; k++) {
      const st = track[k] === null || track[k + 1] === null ? null : (track[k + 1] - track[k]) * dir;
      ok = st !== null && st >= -0.01;
      if (st >= 0.03) steps++;
    }
    if (ok && steps >= 4) out[i] = 1;
  }
  return out;
}

// A syllable break inside a held pitch: the level at i is a valley at least VALLEY times lower
// than the peaks on both sides within 200 ms (a consonant between two vowels on one note: "Hap-py").
const VALLEY = 1.6;
function valley(levels, i, a, z) {
  let l = 0, r = 0;
  for (let k = Math.max(a, i - 10); k < i; k++) l = Math.max(l, levels[k]);
  for (let k = i + 1; k <= Math.min(z, i + 10); k++) r = Math.max(r, levels[k]);
  return levels[i] * VALLEY < Math.min(l, r);
}

// Names each stretch as a note. Players drift (a flute warms up, a singer sags) and real
// instruments are not tuned in equal temperament, so the reference is allowed to move slowly: a
// dynamic programme over a tuning offset (-0.6 to +0.6 semitone, in 2-cent steps) picks the path
// that keeps every note close to a whole semitone while changing as little as possible over time.
// A second pass makes rarely used notes a little less likely, so a Ga played 40 cents low reads
// as Ga, not komal Ga, when komal Ga is not otherwise in the music.
// ref (optional, semitones): a tuning known already (the band's, when the singer is named on her
// own); the reference then stays within 0.3 semitone of it, so a singer singing flat or sharp
// against the band keeps the band's note names.
export function labelNotes(runs, ref) {
  if (!runs.length) return [];
  const OFF = [];
  if (ref === undefined || ref === null) for (let k = -30; k <= 30; k++) OFF.push(k / 50);
  else for (let k = -15; k <= 15; k++) OFF.push(ref + k / 50);
  const c0 = ref || 0;
  const pass = rare => {
    const n = runs.length, S = OFF.length, cost = new Float64Array(S), back = [];
    const emit = (p, o) => { const q = Math.round(p - o), d = p - o - q; return d * d / 0.045 + (o - c0) * (o - c0) * 0.3 + (rare && rare.has(((q % 12) + 12) % 12) ? 1.5 : 0); };
    for (let s = 0; s < S; s++) cost[s] = emit(runs[0].p, OFF[s]);
    for (let j = 1; j < n; j++) {
      const dt = Math.max(0.1, (runs[j].t0 + runs[j].t1 - runs[j - 1].t0 - runs[j - 1].t1) / 2), sig = 0.04 + 0.05 * dt, k2 = 1 / (2 * sig * sig);
      const next = new Float64Array(S), from = new Int16Array(S);
      for (let s = 0; s < S; s++) {
        let best = Infinity, arg = 0;
        for (let r = 0; r < S; r++) { const d = OFF[s] - OFF[r], c = cost[r] + d * d * k2; if (c < best) { best = c; arg = r; } }
        next[s] = best + emit(runs[j].p, OFF[s]); from[s] = arg;
      }
      back.push(from); cost.set(next);
    }
    let s = 0; for (let k = 1; k < S; k++) if (cost[k] < cost[s]) s = k;
    const path = new Array(n); path[n - 1] = s;
    for (let j = n - 1; j > 0; j--) { s = back[j - 1][s]; path[j - 1] = s; }
    return runs.map((r, j) => { const o = OFF[path[j]], q = Math.round(r.p - o); return { t0: r.t0, t1: r.t1, midi: q, cents: Math.round((r.p - o - q) * 100), off: o, lv: r.lv }; });
  };
  const first = pass(null);
  const share = new Array(12).fill(0); let tot = 0;
  for (const nt of first) { const d = nt.t1 - nt.t0; share[((nt.midi % 12) + 12) % 12] += d; tot += d; }
  const rare = new Set(share.map((x, pc) => x / tot < 0.04 ? pc : -1).filter(pc => pc >= 0));
  return pass(rare);
}

// The recording's Sa: each pitch class is scored by how well the notes' durations fit where Sa,
// Pa and the other swaras usually sit, and by how much of the melody falls in the scale it makes
// (below), with a little for the last held note. Returns all 12, most likely first: [{ pc, score }].
const SCALE_FITS = [[0, 2, 4, 5, 7, 9, 11], [0, 2, 4, 6, 7, 9, 11], [0, 2, 4, 5, 7, 9, 10], [0, 2, 3, 5, 7, 9, 10]];
const SA_TEMPLATE = [1, -0.3, 0.25, 0.1, 0.25, 0.2, 0.02, 0.75, 0.1, 0.25, 0.15, 0.25];
export function findTonic(notes) {
  const hist = new Array(12).fill(0);
  let tot = 0;
  for (const n of notes) { const d = Math.min(n.t1 - n.t0, 2); hist[((n.midi % 12) + 12) % 12] += d; tot += d; }
  if (!tot) return [];
  for (let i = 0; i < 12; i++) hist[i] /= tot;
  const held = notes.filter(n => n.t1 - n.t0 >= 0.25), lastPc = held.length ? ((held[held.length - 1].midi % 12) + 12) % 12 : -1;
  // A little for the last held note (a whole tune ends on Sa); more pulls a part-recording's Sa
  // to wherever it stopped (0.05 kept all real recordings and 12 of the 14 songs right).
  const LAST_BONUS = 0.05;
  return Array.from({ length: 12 }, (_, pc) => {
    let s = 0;
    for (let k = 0; k < 12; k++) s += hist[(pc + k) % 12] * SA_TEMPLATE[k];
    // How much of the melody fits the scale this Sa makes: Bilawal (all shuddh), or Kalyan,
    // Khamaj or Kafi a little less. Tutorials pick the Sa that needs the fewest komal notes, and a
    // melody resting on Ga, Pa or Dha otherwise pulls the Sa there (measured on 14 songs against
    // their tutorials: 12 right, against 8 without this).
    const fitOf = sc => sc.reduce((a, k) => a + hist[(pc + k) % 12], 0);
    s += Math.max(fitOf(SCALE_FITS[0]), ...SCALE_FITS.slice(1).map(sc => fitOf(sc) - 0.05));
    if (pc === lastPc) s += LAST_BONUS;

    return { pc, score: Math.round(s * 1000) / 1000 };
  }).sort((a, b) => b.score - a.score);
}

// Sa as a MIDI number: the octave that puts most of the melody in the middle octave.
export function tonicMidi(pc, notes) {
  const v = notes.map(n => n.midi).sort((a, b) => a - b), med = v.length ? v[v.length >> 1] : 72;
  let best = pc + 12 * Math.floor((med - pc) / 12);
  if (med - best > 9) best += 12; // a melody centred on Dha or Ni belongs to the Sa above
  return best;
}

// The beat: for each tempo from 40 to 180 BPM, how well the note starts line up with a regular
// pulse (phase coherence), weighted toward everyday tempos (around 95 BPM). Returns { bpm, phase }:
// phase is the time of a beat, in seconds. Half or double the result can be just as right.
export function estimateTempo(notes) {
  if (notes.length < 4) return { bpm: 80, phase: notes.length ? notes[0].t0 : 0 };
  let best = { score: -1, bpm: 80 };
  for (let bpm = 40; bpm <= 180; bpm += 0.5) {
    const score = beatFit(notes, bpm).r * Math.exp(-0.5 * Math.pow(Math.log2(bpm / 95) / 0.8, 2));
    if (score > best.score) best = { score, bpm };
  }
  const bpm = Math.round(best.bpm);
  return { bpm, phase: beatFit(notes, bpm).phase };
}

// How well note starts fit a pulse at this tempo (r, 0 to 1), and where its beats fall (phase, s).
export function beatFit(notes, bpm) {
  const T = 60 / bpm;
  let x = 0, y = 0, w = 0;
  for (const n of notes) {
    const wt = Math.min(1, (n.t1 - n.t0) / 0.25) + 0.25, a = 2 * Math.PI * n.t0 / T;
    x += wt * Math.cos(a); y += wt * Math.sin(a); w += wt;
  }
  let phase = Math.atan2(y, x) / (2 * Math.PI) * T;
  if (phase < 0) phase += T;
  return { r: w ? Math.hypot(x, y) / w : 0, phase };
}

// The beats as a list of times. o.follow: the beats follow the music's own tempo as it drifts or
// changes (beat tracking by dynamic programming, as in Ellis 2007: beats that land on note starts,
// with a cost for every change of the beat's length); otherwise a steady pulse from `phase`.
// o.beats: beat times known already (a MIDI file's tempo map). o.taps: beats tapped by the
// learner, used as they are where they were tapped.
export function beatGrid(notes, bpm, phase, o) {
  o = o || {};
  if (!notes.length) return [];
  const P = 60 / bpm, a = notes[0].t0 - 2 * P, z = notes[notes.length - 1].t1 + 2 * P;
  let grid;
  if (o.beats && o.beats.length > 1) grid = extend(o.beats.slice(), a, z);
  else if (o.follow) grid = extend(trackBeats(notes, P, a, z), a, z);
  else { grid = []; for (let t = phase + Math.ceil((a - phase) / P) * P; t <= z; t += P) grid.push(t); }
  if (o.taps && o.taps.length >= 4) grid = withTaps(grid, o.taps, a, z);
  return grid;
}
// Beats before the first and after the last, at the length of the nearest beat, to cover a..z.
function extend(grid, a, z) {
  if (grid.length < 2) return grid;
  while (grid[0] > a) grid.unshift(grid[0] - (grid[1] - grid[0]));
  while (grid[grid.length - 1] < z) grid.push(2 * grid[grid.length - 1] - grid[grid.length - 2]);
  return grid;
}
// Onsets (note starts, longer notes counting more) every 10 ms; then the best chain of beats, by
// dynamic programming over (beat time, beat length): each beat scores the onsets it lands on, minus
// BETA times the squared log-ratio of its length to the beat before (the tempo changes smoothly)
// and a little for straying from the expected tempo. A slow drift costs almost nothing; a jump to
// catch one off-beat note costs more than it gains.
function trackBeats(notes, P, a, z) {
  const F = 0.01, n = Math.ceil((z - a) / F) + 1, env = new Float32Array(n);
  for (const nt of notes) {
    const i = Math.round((nt.t0 - a) / F), w = Math.min(1, (nt.t1 - nt.t0) / 0.25) + 0.25;
    for (let d = -6; d <= 6; d++) if (i + d >= 0 && i + d < n) env[i + d] += w * Math.exp(-d * d / 8);
  }
  const p = P / F, dLo = Math.max(2, Math.round(p * 0.6)), dHi = Math.round(p * 1.6), D = dHi - dLo + 1;
  const ALPHA = 4, BETA = 150, W = 4, logd = Float64Array.from({ length: D }, (_, k) => Math.log(dLo + k));
  const score = new Float32Array(n * D), back = new Int32Array(n * D).fill(-1);
  for (let t = 0; t < n; t++) for (let k = 0; k < D; k++) {
    const d = dLo + k, tp = t - d, dev = logd[k] - Math.log(p);
    let best = 0, arg = -1;
    if (tp >= 0) for (let k2 = Math.max(0, k - W); k2 <= Math.min(D - 1, k + W); k2++) {
      const l = logd[k] - logd[k2], c = score[tp * D + k2] - BETA * l * l;
      if (c > best) { best = c; arg = tp * D + k2; }
    }
    score[t * D + k] = env[t] + best - ALPHA * dev * dev; back[t * D + k] = arg;
  }
  let end = (n - 1) * D;
  for (let t = Math.max(0, n - dHi); t < n; t++) for (let k = 0; k < D; k++) if (score[t * D + k] > score[end]) end = t * D + k;
  const out = [];
  for (let s = end; s >= 0; s = back[s]) out.push(a + Math.floor(s / D) * F);
  return out.reverse();
}
// Tapped beats replace the grid where they were tapped: taps much closer than the usual gap are
// left out, a missed tap is filled in.
function withTaps(grid, taps, a, z) {
  const ts = taps.slice().sort((x, y) => x - y), gaps = ts.slice(1).map((x, i) => x - ts[i]).sort((x, y) => x - y), T = gaps[gaps.length >> 1];
  const beats = [ts[0]];
  for (const t of ts.slice(1)) {
    const g = t - beats[beats.length - 1];
    if (g < 0.5 * T) continue;
    const k = Math.round(g / T);
    for (let j = 1; j < k; j++) beats.push(beats[beats.length - 1] + g / k);
    beats.push(t);
  }
  const first = beats[0], last = beats[beats.length - 1];
  return extend(grid.filter(t => t < first - 0.5 * T).concat(beats, grid.filter(t => t > last + 0.5 * T)), a, z);
}
// Where a time falls on the grid: the beat before it, how far into that beat, and the beat's length.
function beatAt(grid, t) {
  let lo = 0, hi = grid.length - 1;
  if (t <= grid[0]) return { i: 0, frac: (t - grid[0]) / (grid[1] - grid[0]), len: grid[1] - grid[0] };
  if (t >= grid[hi]) return { i: hi, frac: (t - grid[hi]) / (grid[hi] - grid[hi - 1]), len: grid[hi] - grid[hi - 1] };
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (grid[m] <= t) lo = m; else hi = m; }
  const len = grid[lo + 1] - grid[lo];
  return { i: lo, frac: (t - grid[lo]) / len, len };
}
// The step (1/sub of a beat) nearest a time.
const slotOf = (grid, t, sub) => { const b = beatAt(grid, t); return Math.round((b.i + b.frac) * sub); };

// The tempo range of a grid (BPM, from the middle 80% of its beats), to show when it changes.
export function tempoRange(grid) {
  if (grid.length < 4) return null;
  const bpms = grid.slice(1).map((t, i) => 60 / (t - grid[i])).sort((x, y) => x - y);
  return [Math.round(bpms[Math.floor(bpms.length * 0.1)]), Math.round(bpms[Math.floor(bpms.length * 0.9)])];
}

// A note's code: "~" when it is reached by a slide (meend), its grace note (kan) in braces: ~{G}R.
// Grace notes in braces: one is a kan, more a murki ({G R}S is written {GR}S); "^" after a note is
// andolan (a slow swing of the note).
const noteCode = (n, semiOf) => (n.glide ? "~" : "") + (n.murki ? "{" + n.murki.map(m => codeOf(semiOf({ midi: m }))).join("") + "}" : n.kan !== undefined ? "{" + codeOf(semiOf({ midi: n.kan })) + "}" : "") + codeOf(semiOf(n)) + (n.andolan ? "^" : "");

// Main melody only: what a listener would sing back. Leaves out notes outside the melody's main
// range (an instrument above or below the singer in an interlude), weak and unsure stretches, and
// notes shorter than 100 ms (slides and quick ornaments).
// anyRange: keep every range (Best to play moves whole phrases into range instead).
export function mainMelody(notes, anyRange) {
  if (notes.length < 8) return notes;
  const byPitch = notes.slice().sort((a, b) => a.midi - b.midi), tot = notes.reduce((x, n) => x + n.t1 - n.t0, 0);
  const pct = q => { let acc = 0; for (const n of byPitch) { acc += n.t1 - n.t0; if (acc >= q * tot) return n.midi; } return byPitch[byPitch.length - 1].midi; };
  const lo = pct(0.1) - 3, hi = pct(0.9) + 3;
  const lvs = notes.map(n => n.lv || 0).sort((a, b) => a - b), medLv = lvs[lvs.length >> 1];
  const kept = notes.filter(n => (anyRange || (n.midi >= lo && n.midi <= hi)) && n.t1 - n.t0 >= 0.1 && !(medLv > 0 && (n.lv || 0) < 0.2 * medLv));
  return fragments(kept, 0.15);
}

// Fragments: a short note (under `short` s) straight after a longer one, on the same pitch or a
// semitone away, is the end of that note (its decay or a bend), not a note: the longer note keeps it.
function fragments(notes, short) {
  const out = [];
  for (const n of notes) {
    const p = out[out.length - 1];
    if (p && n.t1 - n.t0 < short && n.t0 - p.t1 < 0.06 && Math.abs(n.midi - p.midi) <= 1 && p.t1 - p.t0 > n.t1 - n.t0) { p.t1 = n.t1; continue; }
    out.push({ ...n });
  }
  return out;
}

// Best to play: the singer's line where the singer sings, the background melody in the gaps of two
// seconds or more (intros and interludes), as one list of stretches to name together (one tuning
// for both). Each part is a { track, levels } from pitchTrack.
export function bestRuns(singer, background) {
  const s = stableRuns(singer.track, singer.levels), b = stableRuns(background.track, background.levels);
  const gaps = [];
  let prev = 0;
  for (const r of s) { if (r.t0 - prev >= 2) gaps.push([prev + 0.3, r.t0 - 0.3]); prev = Math.max(prev, r.t1); }
  gaps.push([prev + 0.3, Infinity]);
  const fill = b.filter(r => gaps.some(([a, z]) => r.t0 >= a && r.t1 <= z));
  return s.concat(fill).sort((x, y) => x.t0 - y.t0);
}

// Each phrase (notes up to a pause of 0.6 s) moves as a whole by octaves into the flute's range,
// so the tune keeps its shape and no note is left out of reach. semis: from the flute's Sa.
export function phraseOctaves(notes, semiOf) {
  const out = [];
  let i = 0;
  while (i < notes.length) {
    let j = i + 1;
    while (j < notes.length && notes[j].t0 - notes[j - 1].t1 < 0.6) j++;
    const ph = notes.slice(i, j), shift = bestOctave(ph.map(semiOf));
    for (const n of ph) out.push({ ...n, midi: n.midi + shift });
    i = j;
  }
  return out;
}

// One register for the whole melody: a phrase (notes up to a pause of 0.6 s) whose middle lies more
// than STEADY semitones from the melody's middle moves by octaves towards it. Voices singing the
// tune an octave apart (a man and a woman, a choir, a child) are written as one line, as a
// tutorial writes it and a flute plays it.
const STEADY = 7;
export function steadyRegister(notes) {
  if (notes.length < 8) return notes;
  const med = list => { const v = []; for (const n of list) for (let k = 0; k < Math.max(1, Math.round((n.t1 - n.t0) * 10)); k++) v.push(n.midi); v.sort((a, b) => a - b); return v[v.length >> 1]; };
  const all = med(notes), out = [];
  let i = 0;
  while (i < notes.length) {
    let j = i + 1;
    while (j < notes.length && notes[j].t0 - notes[j - 1].t1 < 0.6) j++;
    const ph = notes.slice(i, j), d = med(ph) - all, k = Math.abs(d) > STEADY ? -12 * Math.round(d / 12) : 0;
    for (const n of ph) out.push(k ? { ...n, midi: n.midi + k } : n);
    i = j;
  }
  return out;
}

// Octave slips: a melody rarely leaps more than about an octave and straight back, so a note
// further than 9 semitones from the notes around it (the median of up to four on each side) moves
// by an octave or two when that brings it at least 6 semitones closer. Two passes.
export function foldOctaves(notes) {
  const out = notes.map(n => ({ ...n }));
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < out.length; j++) {
      const near = [];
      for (let k = Math.max(0, j - 4); k <= Math.min(out.length - 1, j + 4); k++) if (k !== j) near.push(out[k].midi);
      if (near.length < 2) continue;
      near.sort((a, b) => a - b);
      const ref = near[near.length >> 1], d = out[j].midi - ref;
      if (Math.abs(d) <= 9) continue;
      let best = 0;
      for (const k of [12, -12, 24, -24]) if (Math.abs(d + k) < Math.abs(d + best)) best = k;
      if (best && Math.abs(d) - Math.abs(d + best) >= 6) out[j].midi += best;
    }
  }
  return out;
}

// Quick grace notes: a note under 130 ms that runs straight into a longer note close by becomes
// that note's kan, as a player would write it, instead of a note of its own.
// Two or three such quick notes in a row before the longer note are a murki (a quick turn).
export function graceNotes(notes) {
  const out = [];
  for (let j = 0; j < notes.length; j++) {
    // A run of quick notes (each under 130 ms, joined) straight into a longer note close by.
    let k = j;
    while (k < notes.length && k - j < 3 && notes[k].t1 - notes[k].t0 < 0.13 && notes[k + 1] && notes[k + 1].t0 - notes[k].t1 < 0.05) k++;
    const target = notes[k];
    if (k > j && target && target.t1 - target.t0 >= 0.15) {
      const grace = notes.slice(j, k).map(n => n.midi);
      if (grace.every(m => Math.abs(m - target.midi) <= 4) && grace[grace.length - 1] !== target.midi) {
        notes[k] = { ...target, kan: grace[0], murki: grace.length > 1 ? grace : undefined, t0: notes[j].t0 };
        j = k - 1;
        continue;
      }
    }
    out.push(notes[j]);
  }
  return out;
}

// Andolan: a held note (0.6 s or more) whose pitch swings slowly, 0.7 to 3.5 times a second,
// by a quarter of a semitone to a semitone and a half. A singer's or flute's vibrato swings
// faster (5 to 7 times a second) and is left alone. Marks .andolan = true.
export function markAndolan(notes, track) {
  for (const n of notes) {
    if (n.t1 - n.t0 < 0.6) continue;
    const v = [];
    for (let i = Math.ceil(n.t0 / HOP); i < n.t1 / HOP; i++) if (track[i] !== null && track[i] !== undefined) v.push(track[i]);
    if (v.length < 0.8 * (n.t1 - n.t0) / HOP) continue;
    // Smoothed over 100 ms (vibrato mostly averages out), then centred on the note's median.
    const sm = v.map((_, i) => { let s = 0, c = 0; for (let k = Math.max(0, i - 2); k <= Math.min(v.length - 1, i + 2); k++) { s += v[k]; c++; } return s / c; });
    const med = sm.slice().sort((a, b) => a - b)[sm.length >> 1], d = sm.map(x => x - med);
    let cross = 0, side = 0;
    for (const x of d) { const s = x > 0.06 ? 1 : x < -0.06 ? -1 : 0; if (s && side && s !== side) cross++; if (s) side = s; }
    const swings = cross / 2 / (v.length * HOP), sorted = d.slice().sort((a, b) => a - b), amp = sorted[Math.floor(sorted.length * 0.9)] - sorted[Math.floor(sorted.length * 0.1)];
    if (swings >= 0.7 && swings <= 3.5 && amp >= 0.25 && amp <= 1.5) n.andolan = true;
  }
  return notes;
}

// One beat's items to the shortest notation that means the same: [S, -] -> S, [S, -, R, -] -> SR.
function beatToken(items) {
  let it = items.slice();
  while (it.length > 1 && it.length % 2 === 0 && it.every((x, i) => i % 2 === 0 || x === "-")) it = it.filter((_, i) => i % 2 === 0);
  if (it.length > 1 && it.every(x => x === "_")) it = ["_"];
  if (it.length > 1 && it.every(x => x === "-")) it = ["-"];
  return it.join("");
}

// Notes (with semis relative to the flute's Sa) to notation: notes snap to a grid of `sub` steps per
// beat, held notes continue with "-", silences become "_", four beats to a bar, four bars to a line.
// Bars of silence are left out, so long gaps do not fill the page.
// The notes on a beat grid: one token per beat ("S", "SR", "-", "_"), shared by both layouts.
function beatTokens(notes, grid, sub, semiOf) {
  const first = Math.floor(slotOf(grid, notes[0].t0, sub) / sub) * sub;
  const slots = [];
  const put = (k, v) => { const i = k - first; if (i >= 0) slots[i] = v; };
  notes.forEach((n, j) => {
    let k0 = slotOf(grid, n.t0, sub);
    while (slots[k0 - first] && slots[k0 - first] !== "-") k0++; // two notes on one step: the later one moves on
    const next = notes[j + 1];
    let k1 = Math.max(k0 + 1, slotOf(grid, n.t1, sub));
    // A gap shorter than most of a beat is a breath or a re-articulation, not a rest: hold on.
    if (next && next.t0 - n.t1 < 0.75 * beatAt(grid, n.t1).len) k1 = slotOf(grid, next.t0, sub);
    if (next) k1 = Math.min(k1, Math.max(k0 + 1, slotOf(grid, next.t0, sub)));
    put(k0, noteCode(n, semiOf));
    for (let k = k0 + 1; k < k1; k++) if (!slots[k - first]) put(k, "-");
  });
  const beats = [];
  for (let i = 0; i < slots.length; i += sub) {
    const items = [];
    for (let k = 0; k < sub; k++) items.push(slots[i + k] || "_");
    beats.push(beatToken(items));
  }
  return { beats, first: first / sub };
}

// x (optional): { grid (beat times; else a steady pulse from phase), times (filled with the time
// each line starts) }.
// Taals, as Bhatkhande writes them: the matras of one cycle (avartan), its vibhags, and the mark
// before each vibhag (X sam, 0 khali, 2 3 4 the other taalis). Rupak's sam is a khali, written 0.
// perLine: cycles on one line of notation.
export const TAALS = {
  keherwa: { name: "Keherwa", beats: 8, vibhags: [4, 4], marks: ["X", "0"], perLine: 2 },
  dadra: { name: "Dadra", beats: 6, vibhags: [3, 3], marks: ["X", "0"], perLine: 2 },
  rupak: { name: "Rupak", beats: 7, vibhags: [3, 2, 2], marks: ["0", "2", "3"], perLine: 2 },
  teentaal: { name: "Teentaal", beats: 16, vibhags: [4, 4, 4, 4], marks: ["X", "2", "0", "3"], perLine: 1 },
  jhaptaal: { name: "Jhaptaal", beats: 10, vibhags: [2, 3, 2, 3], marks: ["X", "2", "0", "3"], perLine: 1 },
  ektaal: { name: "Ektaal", beats: 12, vibhags: [2, 2, 2, 2, 2, 2], marks: ["X", "0", "2", "0", "3", "4"], perLine: 1 },
};

// How strongly each beat of the grid is marked by the melody: notes starting on it, longer
// notes counting more (up to a second).
function beatAccents(notes, grid) {
  const acc = new Float64Array(grid.length);
  for (const n of notes) {
    const b = beatAt(grid, n.t0), k = Math.round(b.i + b.frac);
    if (k >= 0 && k < acc.length) acc[k] += Math.min(1, n.t1 - n.t0) + 0.2;
  }
  return acc;
}
// The taal and where sam falls: grouping in threes (Dadra) or fours (Keherwa), or Rupak's 3+2+2,
// from how the melody's accents repeat; sam on the beat of the cycle with the strongest accents.
// Returns { taal (a TAALS key), sam (a beat index on the grid), sure (0 to 1) }. Film songs are
// mostly Keherwa or Dadra; Teentaal and the others are chosen by hand.
export function detectTaal(notes, grid) {
  if (notes.length < 8 || grid.length < 16) return { taal: "keherwa", sam: 0, sure: 0 };
  const acc = beatAccents(notes, grid), n = acc.length, mean = acc.reduce((a, b) => a + b, 0) / n;
  const corr = lag => { let s = 0, s0 = 0; for (let i = 0; i + lag < n; i++) { s += (acc[i] - mean) * (acc[i + lag] - mean); s0 += (acc[i] - mean) * (acc[i] - mean); } return s0 ? s / s0 : 0; };
  const score = { dadra: corr(3) + corr(6), keherwa: corr(4) + corr(8), rupak: corr(7) * 2 - 0.1 };
  const taal = Object.keys(score).sort((a, b) => score[b] - score[a])[0], L = TAALS[taal].beats;
  // Sam: the beat position (mod the cycle) with the most accent, the first vibhag of each cycle
  // counting a little too.
  let best = 0, bs = -1;
  for (let o = 0; o < L; o++) {
    let s = 0;
    for (let i = o; i < n; i += L) s += acc[i];
    if (s > bs) { bs = s; best = o; }
  }
  const sorted = Object.values(score).sort((a, b) => b - a);
  return { taal, sam: best, sure: Math.max(0, Math.min(1, (sorted[0] - sorted[1]) * 2)) };
}

// x.taal: { key (a TAALS key), sam (the grid beat where a cycle starts) }: cycles of that taal with
// vibhags and their marks; without it, bars of four beats, four bars to a line.
export function toNotation(notes, bpm, phase, sub, semiOf, x) {
  if (!notes.length) return "";
  x = x || {};
  const grid = x.grid || beatGrid(notes, bpm, phase);
  const { beats, first } = beatTokens(notes, grid, sub, semiOf);
  if (x.taal && TAALS[x.taal.key]) return taalNotation(beats, first, grid, TAALS[x.taal.key], x.taal.sam || 0, x.times);
  while (beats.length % 4) beats.push("_");
  const bars = [];
  for (let i = 0; i < beats.length; i += 4) {
    const bar = beats.slice(i, i + 4);
    if (bar.every(b => b === "_")) continue;
    bars.push({ text: bar.join(" "), t: grid[Math.min(grid.length - 1, Math.max(0, first + i))] });
  }
  const lines = [];
  for (let i = 0; i < bars.length; i += 4) {
    lines.push(bars.slice(i, i + 4).map(b => b.text).join(" | ") + " ||");
    if (x.times) x.times.push(bars[i].t);
  }
  return lines.join("\n");
}

// The beats (from beatToken, starting at grid beat `first`) in cycles of a taal starting at sam.
function taalNotation(beats0, first, grid, T, sam, times) {
  const L = T.beats, lead = ((first - sam) % L + L) % L, start = first - lead;
  const beats = new Array(lead).fill("_").concat(beats0);
  while (beats.length % L) beats.push("_");
  const cycles = [];
  for (let c = 0; c < beats.length; c += L) {
    const cyc = beats.slice(c, c + L);
    if (cyc.every(b => b === "_")) continue;
    const parts = [];
    let k = 0;
    T.vibhags.forEach((v, i) => { parts.push(T.marks[i] + " " + cyc.slice(k, k + v).join(" ")); k += v; });
    cycles.push({ text: parts.join(" | ") + " ||", t: grid[Math.min(grid.length - 1, Math.max(0, start + c))] });
  }
  const lines = [];
  for (let i = 0; i < cycles.length; i += T.perLine) {
    lines.push(cycles.slice(i, i + T.perLine).map(c => c.text).join(" "));
    if (times) times.push(cycles[i].t);
  }
  return lines.join("\n");
}

// Phrases: the notes in order, easy to read: "-" for each further beat a note is held (up to
// three), "," at a pause and a new line at a longer pause. The exact timing is kept with the notes
// (the page plays them as found); the bars layout writes the rhythm into the text.
// x (optional): { grid (beat times, so a held note's beats follow the tempo where it is), times }.
export function toPhrases(notes, bpm, semiOf, x) {
  x = x || {};
  const lines = [];
  let line = [];
  notes.forEach((n, j) => {
    const next = notes[j + 1], gap = next ? next.t0 - n.t1 : Infinity, beat = x.grid && x.grid.length > 1 ? beatAt(x.grid, n.t0).len : 60 / bpm;
    const held = (gap < 0.75 * beat ? next.t0 : n.t1) - n.t0;
    if (!line.length && x.times) x.times.push(n.t0);
    line.push(noteCode(n, semiOf));
    for (let k = 1; k < Math.min(4, Math.round(held / beat)); k++) line.push("-");
    if (gap >= 1.2 || (gap >= 0.3 && line.length >= 12) || line.length >= 24) { lines.push(line.join(" ")); line = []; }
    else if (gap >= 0.5) line.push(",");
  });
  if (line.length) lines.push(line.join(" "));
  return lines.join("\n");
}

// The notes a melody uses, as a thaat (the ten parent scales of Hindustani music) or, when it uses
// exactly five notes, the pentatonic raga with those notes. It names the notes, not the raga:
// ragas sharing notes differ in movement and emphasis, which this does not judge.
const THAATS = [
  ["Bilawal", [0, 2, 4, 5, 7, 9, 11], "like the major scale"], ["Kalyan", [0, 2, 4, 6, 7, 9, 11], "tivra Ma"],
  ["Khamaj", [0, 2, 4, 5, 7, 9, 10], "komal Ni"], ["Kafi", [0, 2, 3, 5, 7, 9, 10], "komal Ga and Ni"],
  ["Asavari", [0, 2, 3, 5, 7, 8, 10], "komal Ga, Dha and Ni"], ["Bhairavi", [0, 1, 3, 5, 7, 8, 10], "komal Re, Ga, Dha and Ni"],
  ["Bhairav", [0, 1, 4, 5, 7, 8, 11], "komal Re and Dha"], ["Purvi", [0, 1, 4, 6, 7, 8, 11], "komal Re and Dha, tivra Ma"],
  ["Marwa", [0, 1, 4, 6, 7, 9, 11], "komal Re, tivra Ma"], ["Todi", [0, 1, 3, 6, 7, 8, 11], "komal Re, Ga and Dha, tivra Ma"],
];
const FIVE = [["Bhupali", [0, 2, 4, 7, 9]], ["Durga", [0, 2, 5, 7, 9]], ["Malkauns", [0, 3, 5, 8, 10]], ["Dhani", [0, 3, 5, 7, 10]], ["Madhmad Sarang", [0, 2, 5, 7, 10]], ["Shivranjani", [0, 2, 3, 7, 9]]];
// Returns { name, kind ("thaat", "raga" or "mixed"), note (how it differs from Bilawal), pcs, used,
// odd } or null for too few notes. used: the pitch classes from Sa with at least 3% of the time;
// odd: pitch classes outside the scale, each under 6% of the time (a real scale note is used more).
// Notes with an odd pitch class get .odd = true: they are the ones most worth checking by ear.
export function scaleOf(notes, sa) {
  for (const n of notes) delete n.odd;
  if (notes.length < 8) return null;
  const share = new Array(12).fill(0); let tot = 0;
  const pcOf = n => (((n.midi - sa) % 12) + 12) % 12;
  for (const n of notes) { const d = Math.min(2, n.t1 - n.t0); share[pcOf(n)] += d; tot += d; }
  for (let i = 0; i < 12; i++) share[i] /= tot;
  const used = share.map((x, pc) => (x >= 0.03 ? pc : -1)).filter(pc => pc >= 0);
  let best = null;
  if (used.length === 5) for (const [name, pcs] of FIVE) if (pcs.every(pc => used.includes(pc))) best = { name, kind: "raga", note: "", pcs };
  if (!best) for (const [name, pcs, note] of THAATS) {
    // In-scale share, minus a little for each scale note the melody never uses.
    const fit = pcs.reduce((a, pc) => a + share[pc], 0) - 0.01 * pcs.filter(pc => share[pc] < 0.01).length;
    if (!best || fit > best.fit) best = { name, kind: "thaat", note, pcs, fit };
  }
  // A scale that leaves out a much-used note does not describe the melody.
  if (share.some((x, pc) => x >= 0.06 && !best.pcs.includes(pc))) return { name: null, kind: "mixed", note: "", pcs: used, used, odd: [] };
  const odd = [];
  for (let pc = 0; pc < 12; pc++) if (!best.pcs.includes(pc) && share[pc] > 0) odd.push(pc);
  for (const n of notes) if (odd.includes(pcOf(n))) n.odd = true;
  return { name: best.name, kind: best.kind, note: best.note, pcs: best.pcs, used, odd };
}

// Slides (meend): between two notes, a gap of 80 to 600 ms where the pitch was heard all along,
// moved steadily from the one to the other (a step of 1 to 7 semitones) and spent 80 ms or more
// in between. The second note gets
// .glide = true (written "~" before it). The short glide into most notes (under 80 ms) is left alone.
export function markGlides(notes, track) {
  for (let j = 0; j + 1 < notes.length; j++) {
    const a = notes[j], b = notes[j + 1], d = b.midi - a.midi, gap = b.t0 - a.t1;
    if (gap < 0.08 || gap > 0.6 || Math.abs(d) < 1 || Math.abs(d) > 7) continue;
    const i0 = Math.ceil(a.t1 / HOP), i1 = Math.floor(b.t0 / HOP), vals = [];
    for (let i = i0; i < i1; i++) vals.push(track[i]);
    const v = vals.filter(x => x !== null && x !== undefined).map(x => x - (b.off || 0));
    if (vals.length < 3 || v.length < 0.8 * vals.length) continue;
    const lo = Math.min(a.midi, b.midi) - 0.6, hi = Math.max(a.midi, b.midi) + 0.6;
    if (v.some(x => x < lo || x > hi)) continue;
    let along = 0, moves = 0;
    for (let k = 1; k < v.length; k++) { const st = v[k] - v[k - 1]; if (Math.abs(st) > 0.02) { moves++; if (Math.sign(st) === Math.sign(d)) along++; } }
    // The pitch spends at least 80 ms between the two notes (a quick glide into a note is shorter).
    const between = v.filter(x => x > Math.min(a.midi, b.midi) + 0.3 && x < Math.max(a.midi, b.midi) - 0.3).length;
    const covered = (v[v.length - 1] - v[0]) / d;
    if (moves && along >= 0.7 * moves && covered >= 0.4 && between >= 4) b.glide = true;
  }
  return notes;
}

// An easier version for a learner: quick runs (notes under 0.2 s straight after another note)
// fold into the note before, grace notes and slides go, every phrase moves into the flute's easy
// range (and any note still above G' or below .P by an octave), and a rarely used half-hole note
// that only passes by (under 0.3 s) becomes the nearest open note. semiOf: from the flute's Sa.
export function easier(notes, semiOf) {
  const out = [];
  for (const n of notes) {
    const p = out[out.length - 1];
    if (p && n.t1 - n.t0 < 0.2 && n.t0 - p.t1 < 0.1) { p.t1 = n.t1; continue; }
    const plain = { ...n }; delete plain.kan; delete plain.glide;
    out.push(plain);
  }
  const moved = phraseOctaves(out, semiOf).map(n => { const s = semiOf(n); return s > 16 ? { ...n, midi: n.midi - 12 } : s < -5 ? { ...n, midi: n.midi + 12 } : n; });
  const share = {}; let tot = 0;
  for (const n of moved) { const s = semiOf(n); share[s] = (share[s] || 0) + n.t1 - n.t0; tot += n.t1 - n.t0; }
  const half = s => { const f = fingOf(s).f; return !!f && f.includes("H"); };
  return moved.map(n => {
    const s = semiOf(n);
    if (!half(s) || n.t1 - n.t0 >= 0.3 || (share[s] || 0) / tot >= 0.05) return n;
    const near = [s - 1, s + 1].filter(x => !half(x) && x >= -5 && x <= 16).sort((x, y) => (share[y] || 0) - (share[x] || 0));
    return near.length ? { ...n, midi: n.midi + near[0] - s } : n;
  });
}

// Doubtful notes, for the guided check (eartools.js): why note k may be wrong, from the pitch line
// under it (frames: MIDI every HOP, tune: the recording's tuning in semitones). Empty: no doubt.
// scale: the song's scale as MIDI pitch classes, or null. A note marked .ok is never doubtful.
function heardUnder(n, frames, tune) {
  const vals = [];
  for (let i = Math.ceil(n.t0 / HOP); i < n.t1 / HOP; i++) { const m = frames[i]; if (m !== null && m !== undefined) vals.push(m - tune); }
  return vals.sort((a, b) => a - b);
}
export function noteDoubts(notes, k, frames, tune, scale) {
  const n = notes[k];
  if (n.ok) return [];
  const why = [], prev = notes[k - 1], next = notes[k + 1], vals = heardUnder(n, frames, tune);
  if (n.odd || (scale && !scale.includes(((n.midi % 12) + 12) % 12))) why.push("outside the song's scale");
  if (vals.length >= 3) {
    // Compared within the octave (the note may be written an octave from where it was sung).
    const med = vals[vals.length >> 1], raw = med - n.midi, dev = raw - 12 * Math.round(raw / 12), spread = vals[Math.floor(vals.length * 0.75)] - vals[Math.floor(vals.length * 0.25)];
    if (Math.abs(dev) >= DOUBT_CENTS / 100) why.push("heard " + Math.round(Math.abs(dev) * 100) + " cents " + (dev > 0 ? "higher" : "lower"));
    if (spread >= 0.7) why.push("the pitch moves a lot");
  }
  if (n.t1 - n.t0 < 0.1 && why.length) why.push("very short");
  if (prev && next && Math.abs(n.midi - prev.midi) >= 8 && Math.abs(n.midi - next.midi) >= 8) why.push("a big jump from the notes around it");
  return why;
}
const DOUBT_CENTS = 35;
// The likely notes for a doubtful one: itself, the pitch heard, its neighbours in the scale (or a
// semitone each way), and the octave towards its neighbours after a big jump. MIDI numbers.
export function noteChoices(notes, k, frames, tune, scale) {
  const n = notes[k], out = [n.midi], add = m => { if (m !== null && !out.includes(m)) out.push(m); };
  const vals = heardUnder(n, frames, tune);
  if (vals.length) { const m = Math.round(vals[vals.length >> 1]); add(m + 12 * Math.round((n.midi - m) / 12)); }
  const inScale = m => !scale || scale.includes(((m % 12) + 12) % 12);
  for (const dir of [1, -1]) { let m = n.midi + dir; while (!inScale(m) && Math.abs(m - n.midi) < 3) m += dir; add(m); }
  const prev = notes[k - 1], next = notes[k + 1];
  if (prev && next && Math.abs(n.midi - prev.midi) >= 8) add(n.midi + (prev.midi > n.midi ? 12 : -12));
  return out.slice(0, 5);
}

// How a take went, for Practise with the recording: each note (t0 and t1 in the recording's time,
// semi from the flute's Sa) against the microphone's readings ({ t in the recording's time, semi })
// in its middle: "right" (at least 40% of the clear readings within half a semitone), "octave"
// (the right note in another octave), "wrong" (another note) or "missed" (hardly any sound).
export function scoreTake(notes, readings) {
  const marks = notes.map(n => {
    const a = n.t0 + Math.min(0.08, (n.t1 - n.t0) * 0.25), b = n.t1 - 0.02;
    const rs = readings.filter(r => r.t >= a && r.t <= b), heard = rs.filter(r => r.semi !== null && r.semi !== undefined);
    if (!rs.length || heard.length < Math.max(1, rs.length * 0.3)) return "missed";
    const near = d => heard.filter(r => Math.abs(r.semi - n.semi - d) <= 0.5).length / heard.length;
    if (near(0) >= 0.4) return "right";
    if (near(12) >= 0.4 || near(-12) >= 0.4) return "octave";
    return "wrong";
  });
  return { marks, right: marks.filter(m => m === "right").length };
}

// How well a melody (semis from the flute's Sa) suits a 6-hole bansuri: below .P cannot be played,
// above M' (18) is the third register, above G' (16) is hard; half-holes are harder than open notes.
export function fitOf(semis) {
  if (!semis.length) return { lo: 0, hi: 0, below: 0, high: 0, reg3: 0, halves: 0, cost: 0 };
  const lo = Math.min(...semis), hi = Math.max(...semis);
  const below = semis.filter(s => s < -5).length, reg3 = semis.filter(s => s > 18).length, high = semis.filter(s => s > 16 && s <= 18).length;
  const halves = semis.filter(s => { const f = fingOf(s).f; return !!f && f.includes("H"); }).length;
  return { lo, hi, below, high, reg3, halves, cost: below * 4 + reg3 * 4 + high + halves * 0.15 };
}

// The octave (-12, 0 or +12) that suits the flute best for these semis.
export function bestOctave(semis) {
  let best = { shift: 0, cost: Infinity };
  for (const shift of [0, -12, 12]) {
    const c = fitOf(semis.map(s => s + shift)).cost;
    if (c < best.cost - 0.01) best = { shift, cost: c };
  }
  return best.shift;
}

// Flutes by their Sa (MIDI 60 = C4 to 81 = A5); the size names are the usual rough ones.
export function fluteLabel(midi) {
  const name = WEST[((midi % 12) + 12) % 12], size = midi < 70 ? "bass" : midi <= 77 ? "medium" : "small";
  return name + " " + size + " (Sa = " + name + (Math.floor(midi / 12) - 1) + ")";
}
export const FLUTES = Array.from({ length: 22 }, (_, i) => 60 + i);

// The flute whose Sa matches the recording's Sa and suits the melody best (medium sizes preferred).
export function bestFlute(notes, saMidi) {
  let best = null;
  for (const f of FLUTES) {
    if (((f - saMidi) % 12 + 12) % 12) continue;
    const cost = fitOf(notes.map(n => n.midi - f)).cost + Math.abs(f - 74) * 0.05;
    if (!best || cost < best.cost) best = { midi: f, cost };
  }
  return best ? best.midi : null;
}

// Everything above, in one call. opts: { sa (MIDI of the recording's Sa, else detected), flute (MIDI
// of the flute's Sa), sameKey (true: play along with the recording; false: keep the recording's
// sargam on the flute's own Sa), bpm, sub (steps per beat: 1, 2 or 4), octave (extra shift),
// layout ("beats" or "phrases"), from and to (seconds: only that part of the recording), main
// (true by default: the main melody only; false: every note found, with grace notes), runs
// (stretches made already, as from bestRuns), playable (phrases moved into the flute's range),
// easy (the easier version), follow (the beats follow tempo changes), beats (beat times known
// already), taps (tapped beat times) and tuneRef (the tuning to name notes against, semitones) }.
export function transcribe(track, levels, opts) {
  const o = Object.assign({ flute: 72, sameKey: true, sub: 2, octave: 0 }, opts || {});
  // o.notes: notes given exactly (a MIDI file, or notes corrected by ear): used as they are.
  if (o.notes) return fromNotes(o.notes.filter(n => n.t0 >= (o.from || 0) && n.t1 <= (o.to || Infinity)).map(n => ({ off: 0, cents: 0, lv: 1, ...n })), o, o.tonics);
  // Notes far from the melody's range (a drone or bass heard alone, a stray octave) are left out.
  const all = labelNotes(o.runs || stableRuns(track, levels), o.tuneRef), mids = all.map(n => n.midi).sort((a, b) => a - b), mid = mids[mids.length >> 1];
  const from = o.from || 0, to = o.to || Infinity;
  const folded = foldOctaves(all.filter(n => Math.abs(n.midi - mid) <= 17 && n.t0 >= from && n.t1 <= to));
  // o.main (default): the main melody, plain; o.main false: every note found, with grace notes.
  // Grace notes (kan, murki) attach to their note first, so the main melody keeps them as ornaments
  // instead of dropping them as too short.
  const list = steadyRegister(o.main === false ? graceNotes(folded) : mainMelody(graceNotes(folded), o.playable));
  return fromNotes(track ? markAndolan(markGlides(list, track), track) : list, o);
}

// The rest of transcribe, from named notes: Sa, tempo, the flute's octave and the notation.
// knownTonics: Sa candidates known already (a MIDI file's key signature), put first.
function fromNotes(notes, o, knownTonics) {
  let tonics = findTonic(notes);
  if (knownTonics && knownTonics.length) tonics = knownTonics.concat(tonics.filter(c => !knownTonics.some(k => k.pc === c.pc)));
  const sa = o.sa !== undefined && o.sa !== null ? o.sa : tonics.length ? tonicMidi(tonics[0].pc, notes) : 72;
  const tune = notes.length ? notes.reduce((a, n) => a + n.off, 0) / notes.length : 0;
  const tempo = o.bpm ? { bpm: o.bpm, phase: o.phase !== undefined ? o.phase : beatFit(notes, o.bpm).phase } : estimateTempo(notes);
  const bpm = tempo.bpm;
  const base = o.sameKey ? o.flute : sa;
  const raw = notes.map(n => n.midi - base);
  const shift = bestOctave(raw) + o.octave;
  const semiOf = n => n.midi - base + shift;
  // o.playable (Best to play): every phrase moved by octaves into the flute's range; o.easy: the
  // easier version (which moves phrases too).
  if (o.easy) notes = easier(notes, semiOf);
  else if (o.playable) notes = phraseOctaves(notes, semiOf);
  const scale = scaleOf(notes, sa);
  const semis = notes.map(semiOf);
  notes.forEach((n, k) => { n.semi = semis[k]; });
  // The beats: o.beats (a MIDI file's), o.follow (follow the tempo as it changes), o.taps (tapped).
  const grid = notes.length ? beatGrid(notes, bpm, tempo.phase, { follow: o.follow, beats: o.beats, taps: o.taps }) : [];
  const inside = notes.length ? grid.filter(t => t >= notes[0].t0 && t <= notes[notes.length - 1].t1) : [];
  // o.taal: "auto" (detected), a TAALS key, or nothing (bars of four). o.samShift moves sam by
  // beats; o.samAt gives a time that is sam.
  let taalUsed = null;
  if (o.taal && notes.length && grid.length) {
    const d = o.taal === "auto" ? detectTaal(notes, grid) : { taal: o.taal, sam: detectTaal(notes, grid).sam, sure: 1 };
    // o.samAt: a time known to be sam (a MIDI file's first bar line).
    if (o.samAt !== undefined && TAALS[d.taal]) { const b = beatAt(grid, o.samAt); d.sam = Math.round(b.i + b.frac); }
    if (TAALS[d.taal]) taalUsed = { key: d.taal, sam: d.sam + (o.samShift || 0), sure: d.sure, auto: o.taal === "auto" };
  }
  const lineTimes = [];
  return {
    notes, tune: Math.round(tune * 100), tonics, sa, bpm, phase: tempo.phase, shift, base, scale, grid,
    tempoRange: o.follow || o.beats || o.taps ? tempoRange(inside) : null,
    fit: fitOf(semis), flute: bestFlute(notes, sa),
    notation: o.layout === "phrases" ? toPhrases(notes, bpm, semiOf, { grid, times: lineTimes }) : toNotation(notes, bpm, tempo.phase, o.sub, semiOf, { grid, times: lineTimes, taal: taalUsed }),
    taal: taalUsed,
    lineTimes,
  };
}
