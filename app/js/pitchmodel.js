// Pitch by a trained model: RMVPE (Wei et al. 2023, "a robust model for vocal pitch estimation in
// polyphonic music"; MIT) or FCPE (MIT), in the ONNX exports by Scicom-intl, whose graphs contain
// their own front end: 16 kHz mono audio in, 360 pitch bins (20 cents apart) every 10 ms out. The
// result is turned into the app's pitch line (one value every HOP = 20 ms, MIDI or null) so the
// rest of transcribe.js names the notes as usual. Used by separate-worker.js in the browser and by
// the tests in Node (with onnxruntime-node), so it takes the runtime and the session as given.
import { HOP } from "./transcribe.js";

export const SR16 = 16000;
const FRAME = 0.01, CHUNK = 30, OVERLAP = 1; // seconds: long recordings go through in pieces
// Bin centres in cents above 10 Hz: RMVPE uses CREPE's bins; FCPE spreads 360 bins from 32.7 Hz to 1975.5 Hz.
const RMVPE_CENTS = Float64Array.from({ length: 360 }, (_, k) => 1997.3794084376191 + 20 * k);
const FCPE_CENTS = Float64Array.from({ length: 360 }, (_, k) => { const a = 1200 * Math.log2(32.7 / 10), b = 1200 * Math.log2(1975.5 / 10); return a + (b - a) * k / 359; });
// Voicing thresholds on the peak salience. The exports' defaults (0.35, 0.33) were tuned on
// speech and leave much singing unvoiced; these lower ones scored best on the melody benchmark.
export const THRESHOLD = { rmvpe: 0.03, fcpe: 0.006 };

// Any rate to 16 kHz (linear interpolation after a short box filter: enough for pitch).
export function to16k(x, sr) {
  if (sr === SR16) return x;
  const r = sr / SR16, n = Math.floor(x.length / r), out = new Float32Array(n), w = Math.max(1, Math.round(r));
  for (let i = 0; i < n; i++) {
    const c = i * r, k = Math.floor(c);
    let s = 0, m = 0;
    for (let j = k - (w >> 1); j <= k + (w >> 1); j++) if (j >= 0 && j < x.length) { s += x[j]; m++; }
    out[i] = m ? s / m : 0;
  }
  return out;
}

// audio: Float32Array at 16 kHz. Resolves { f0: Float32Array (Hz, 0 when unvoiced), conf } every
// 10 ms (frame i centred at i * 10 ms). onProgress(done, total) after each piece; threshold:
// the voicing threshold (default THRESHOLD[kind]).
export async function modelPitch(ort, session, kind, audio, onProgress, stop, threshold) {
  const T = Math.floor(audio.length / (SR16 * FRAME)) + 1, f0 = new Float32Array(T), conf = new Float32Array(T);
  const cents = kind === "fcpe" ? FCPE_CENTS : RMVPE_CENTS, thr = threshold !== undefined ? threshold : THRESHOLD[kind];
  const step = CHUNK * SR16, pad = OVERLAP * SR16, pieces = Math.ceil(audio.length / step);
  for (let p = 0; p < pieces; p++) {
    if (stop && stop()) throw { cancelled: true };
    const a = Math.max(0, p * step - pad), b = Math.min(audio.length, (p + 1) * step + pad);
    const out = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", audio.slice(a, b), [1, b - a]) });
    const sal = out[session.outputNames[0]], data = sal.data, frames = sal.dims[sal.dims.length - 2], bins = sal.dims[sal.dims.length - 1];
    const first = Math.round(a / (SR16 * FRAME));
    for (let t = 0; t < frames; t++) {
      const g = first + t, at = g * FRAME * SR16;
      if (g >= T || at < p * step || at >= (p + 1) * step) continue; // the overlap belongs to the neighbouring piece
      let arg = 0, max = -Infinity;
      for (let k = 0; k < bins; k++) { const v = data[t * bins + k]; if (v > max) { max = v; arg = k; } }
      // The salience-weighted mean of the bins around the peak (the models' own decoder).
      let ws = 0, cs = 0;
      for (let k = Math.max(0, arg - 4); k <= Math.min(bins - 1, arg + 4); k++) { const w = Math.max(0, data[t * bins + k]); ws += w; cs += w * cents[k]; }
      conf[g] = max;
      f0[g] = max > thr && ws > 0 ? 10 * Math.pow(2, cs / ws / 1200) : 0;
    }
    if (onProgress) onProgress(p + 1, pieces);
  }
  return { f0, conf };
}

// The 10 ms pitch to the app's pitch line: { track (MIDI or null every HOP), levels }. Levels come
// from the audio's loudness in each frame times the model's confidence, so a break between two
// sung syllables (a repeated note) shows as a dip.
export function toTrack(f0, conf, audio) {
  const per = Math.round(HOP / FRAME), n = Math.floor(f0.length / per), track = new Array(n), levels = new Array(n);
  const win = Math.round(HOP * SR16);
  for (let i = 0; i < n; i++) {
    const vals = [];
    let c = 0;
    for (let k = 0; k < per; k++) { const v = f0[i * per + k]; if (v > 0) vals.push(69 + 12 * Math.log2(v / 440)); c = Math.max(c, conf[i * per + k]); }
    track[i] = vals.length === per ? vals.reduce((x, y) => x + y, 0) / per : vals.length ? vals[0] : null;
    let sq = 0; const a = Math.max(0, i * win - (win >> 1)), b = Math.min(audio.length, a + win);
    for (let j = a; j < b; j++) sq += audio[j] * audio[j];
    levels[i] = Math.sqrt(sq / Math.max(1, b - a)) * c;
  }
  return { track, levels, seconds: n * HOP, truncated: false };
}
