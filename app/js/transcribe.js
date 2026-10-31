// Notation from a recording: the pitch of every 20 ms, the recording's Sa, the notes, the beat, and
// sargam for the chosen flute. Works on one clear melody (a solo flute, a single voice, a tune much
// louder than its accompaniment); it is a draft to check by ear, not a finished transcription.
// Pure functions (no DOM), so tests/transcribe.test.mjs can run them on synthetic recordings.
import { yin } from "./core/pitch.js";
import { codeOf, fingOf, WEST } from "./core/theory.js";

export const HOP = 0.02;
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
        const x = Math.cos(Math.PI / 2 * (b - c) / 5); out[b] += w * x * x;
      }
    }
  }
  return out;
}

// o.stereo: { L, R, part: "singer" | "background" } follows that part of a stereo mix (data is
// then the mid signal); o.mags (one magnitude spectrum per frame, as from repetitionParts) with
// o.part follows a part separated another way; without either, the whole mix.
export async function melodyTrack(data, sr, o) {
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
  for (let i = 0; i < track.length; i++) {
    const m = track[i];
    if (m === null) { close(i); continue; }
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
      if (levels[i] < 0.45 * med && levels[i] <= levels[i - 1] && levels[i] <= levels[i + 1]) { split.push({ i0: start, i1: i - 1, vals: r.vals.slice(start - r.i0, i - r.i0), cut }); start = i + 1; cut = true; i += MIN_NOTE; }
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

// Names each stretch as a note. Players drift (a flute warms up, a singer sags) and real
// instruments are not tuned in equal temperament, so the reference is allowed to move slowly: a
// dynamic programme over a tuning offset (-0.6 to +0.6 semitone, in 2-cent steps) picks the path
// that keeps every note close to a whole semitone while changing as little as possible over time.
// A second pass makes rarely used notes a little less likely, so a Ga played 40 cents low reads
// as Ga, not komal Ga, when komal Ga is not otherwise in the music.
export function labelNotes(runs) {
  if (!runs.length) return [];
  const OFF = []; for (let k = -30; k <= 30; k++) OFF.push(k / 50);
  const pass = rare => {
    const n = runs.length, S = OFF.length, cost = new Float64Array(S), back = [];
    const emit = (p, o) => { const q = Math.round(p - o), d = p - o - q; return d * d / 0.045 + o * o * 0.3 + (rare && rare.has(((q % 12) + 12) % 12) ? 1.5 : 0); };
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
// Pa and the other swaras usually sit, plus a bonus for the first and last held notes (scales,
// songs and alap usually start or end on Sa). Returns all 12, most likely first: [{ pc, score }].
const SA_TEMPLATE = [1, -0.3, 0.25, 0.1, 0.25, 0.2, 0.02, 0.75, 0.1, 0.25, 0.15, 0.25];
export function findTonic(notes) {
  const hist = new Array(12).fill(0);
  let tot = 0;
  for (const n of notes) { const d = Math.min(n.t1 - n.t0, 2); hist[((n.midi % 12) + 12) % 12] += d; tot += d; }
  if (!tot) return [];
  for (let i = 0; i < 12; i++) hist[i] /= tot;
  const held = notes.filter(n => n.t1 - n.t0 >= 0.25);
  const firstPc = held.length ? ((held[0].midi % 12) + 12) % 12 : -1, lastPc = held.length ? ((held[held.length - 1].midi % 12) + 12) % 12 : -1;
  return Array.from({ length: 12 }, (_, pc) => {
    let s = 0;
    for (let k = 0; k < 12; k++) s += hist[(pc + k) % 12] * SA_TEMPLATE[k];
    if (pc === firstPc) s += 0.05;
    if (pc === lastPc) s += 0.15;
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

// A note's code, with its grace note (kan) in braces before it: {G}R.
const noteCode = (n, semiOf) => (n.kan !== undefined ? "{" + codeOf(semiOf({ midi: n.kan })) + "}" : "") + codeOf(semiOf(n));

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
  return notes.filter(n => (anyRange || (n.midi >= lo && n.midi <= hi)) && n.t1 - n.t0 >= 0.1 && !(medLv > 0 && (n.lv || 0) < 0.2 * medLv));
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
export function graceNotes(notes) {
  const out = [];
  for (let j = 0; j < notes.length; j++) {
    const n = notes[j], next = notes[j + 1];
    if (next && n.t1 - n.t0 < 0.13 && next.t0 - n.t1 < 0.05 && next.t1 - next.t0 >= 0.15 && next.midi !== n.midi && Math.abs(next.midi - n.midi) <= 4) {
      notes[j + 1] = { ...next, kan: n.midi, t0: n.t0 };
      continue;
    }
    out.push(n);
  }
  return out;
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
function beatTokens(notes, bpm, phase, sub, semiOf) {
  const beat = 60 / bpm, step = beat / sub;
  const first = Math.floor(Math.round((notes[0].t0 - phase) / step) / sub) * sub;
  const slots = [];
  const put = (k, v) => { const i = k - first; if (i >= 0) slots[i] = v; };
  notes.forEach((n, j) => {
    let k0 = Math.round((n.t0 - phase) / step);
    while (slots[k0 - first] && slots[k0 - first] !== "-") k0++; // two notes on one step: the later one moves on
    const next = notes[j + 1];
    let k1 = Math.max(k0 + 1, Math.round((n.t1 - phase) / step));
    // A gap shorter than most of a beat is a breath or a re-articulation, not a rest: hold on.
    if (next && next.t0 - n.t1 < 0.75 * beat) k1 = Math.round((next.t0 - phase) / step);
    if (next) k1 = Math.min(k1, Math.max(k0 + 1, Math.round((next.t0 - phase) / step)));
    put(k0, noteCode(n, semiOf));
    for (let k = k0 + 1; k < k1; k++) if (!slots[k - first]) put(k, "-");
  });
  const beats = [];
  for (let i = 0; i < slots.length; i += sub) {
    const items = [];
    for (let k = 0; k < sub; k++) items.push(slots[i + k] || "_");
    beats.push(beatToken(items));
  }
  return beats;
}

export function toNotation(notes, bpm, phase, sub, semiOf) {
  if (!notes.length) return "";
  const beats = beatTokens(notes, bpm, phase, sub, semiOf);
  while (beats.length % 4) beats.push("_");
  const bars = [];
  for (let i = 0; i < beats.length; i += 4) {
    const bar = beats.slice(i, i + 4);
    if (bar.every(b => b === "_")) continue;
    bars.push(bar.join(" "));
  }
  const lines = [];
  for (let i = 0; i < bars.length; i += 4) lines.push(bars.slice(i, i + 4).join(" | ") + " ||");
  return lines.join("\n");
}

// Phrases: the notes in order, easy to read: "-" for each further beat a note is held (up to
// three), "," at a pause and a new line at a longer pause. The exact timing is kept with the notes
// (the page plays them as found); the bars layout writes the rhythm into the text.
export function toPhrases(notes, bpm, semiOf) {
  const beat = 60 / bpm, lines = [];
  let line = [];
  notes.forEach((n, j) => {
    const next = notes[j + 1], gap = next ? next.t0 - n.t1 : Infinity;
    const held = (gap < 0.75 * beat ? next.t0 : n.t1) - n.t0;
    line.push(noteCode(n, semiOf));
    for (let k = 1; k < Math.min(4, Math.round(held / beat)); k++) line.push("-");
    if (gap >= 1.2 || (gap >= 0.3 && line.length >= 12) || line.length >= 24) { lines.push(line.join(" ")); line = []; }
    else if (gap >= 0.5) line.push(",");
  });
  if (line.length) lines.push(line.join(" "));
  return lines.join("\n");
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
// (stretches made already, as from bestRuns) and playable (phrases moved into the flute's range) }.
export function transcribe(track, levels, opts) {
  const o = Object.assign({ flute: 72, sameKey: true, sub: 2, octave: 0 }, opts || {});
  // o.notes: notes given exactly (a MIDI file, or notes corrected by ear): used as they are.
  if (o.notes) return fromNotes(o.notes.filter(n => n.t0 >= (o.from || 0) && n.t1 <= (o.to || Infinity)).map(n => ({ off: 0, cents: 0, lv: 1, ...n })), o, o.tonics);
  // Notes far from the melody's range (a drone or bass heard alone, a stray octave) are left out.
  const all = labelNotes(o.runs || stableRuns(track, levels)), mids = all.map(n => n.midi).sort((a, b) => a - b), mid = mids[mids.length >> 1];
  const from = o.from || 0, to = o.to || Infinity;
  const folded = foldOctaves(all.filter(n => Math.abs(n.midi - mid) <= 17 && n.t0 >= from && n.t1 <= to));
  // o.main (default): the main melody, plain; o.main false: every note found, with grace notes.
  return fromNotes(o.main === false ? graceNotes(folded) : mainMelody(folded, o.playable), o);
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
  // o.playable (Best to play): every phrase moved by octaves into the flute's range.
  if (o.playable) notes = phraseOctaves(notes, semiOf);
  const semis = notes.map(semiOf);
  notes.forEach((n, k) => { n.semi = semis[k]; });
  return {
    notes, tune: Math.round(tune * 100), tonics, sa, bpm, phase: tempo.phase, shift, base,
    fit: fitOf(semis), flute: bestFlute(notes, sa),
    notation: o.layout === "phrases" ? toPhrases(notes, bpm, semiOf) : toNotation(notes, bpm, tempo.phase, o.sub, semiOf),
  };
}
