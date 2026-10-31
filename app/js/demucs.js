// Singer and background by a separation model: HTDemucs (Defossez, Meta; MIT), exported to ONNX
// and run through ONNX Runtime (the steps around the model are from demucs-web, MIT, in
// app/vendor/demucs). The model hears 7.8 s at a time at 44.1 kHz stereo, with a quarter of
// overlap; of its four stems only two are kept, as mono: the vocals (the singer) and "other"
// (the melodic instruments: the background melody). Used by separate-worker.js in the browser and
// by the tests in Node (with onnxruntime-node), so it takes the runtime and the session as given.
import { prepareModelInput, standaloneMask, standaloneIspec } from "../vendor/demucs/processor.js";
import { CONSTANTS } from "../vendor/demucs/constants.js";

const { TRAINING_SAMPLES, MODEL_SPEC_BINS, MODEL_SPEC_FRAMES, SEGMENT_OVERLAP } = CONSTANTS;
export const SAMPLE_RATE = CONSTANTS.SAMPLE_RATE;
const VOCALS = 3, OTHER = 2;

// left, right: Float32Array at 44.1 kHz. Resolves { vocals, other } (mono Float32Array, same
// length). onProgress(done, total) after each 7.8 s piece; stop() returning true ends early.
export async function separate(ort, session, left, right, onProgress, stop) {
  const total = left.length, stride = Math.floor(TRAINING_SAMPLES * (1 - SEGMENT_OVERLAP));
  const pieces = Math.max(1, Math.ceil(Math.max(0, total - TRAINING_SAMPLES) / stride) + 1);
  const vocals = new Float32Array(total), other = new Float32Array(total), weight = new Float32Array(total);
  let done = 0;
  for (let start = 0; start < total; start += stride) {
    if (stop && stop()) throw { cancelled: true };
    const len = Math.min(TRAINING_SAMPLES, total - start);
    const segL = new Float32Array(TRAINING_SAMPLES), segR = new Float32Array(TRAINING_SAMPLES);
    segL.set(left.subarray(start, start + len)); segR.set(right.subarray(start, start + len));
    const input = prepareModelInput(segL, segR);
    const feeds = { [session.inputNames[0]]: new ort.Tensor("float32", input.waveform, [1, 2, TRAINING_SAMPLES]) };
    if (session.inputNames.length > 1) feeds[session.inputNames[1]] = new ort.Tensor("float32", input.magSpec, [1, 4, MODEL_SPEC_BINS, MODEL_SPEC_FRAMES]);
    const out = await session.run(feeds);
    let time = null, dims = null, freq = null;
    for (const name of session.outputNames) {
      const t = out[name];
      if (t.dims.length === 4 && t.dims[2] === 2) { time = t.data; dims = t.dims; }
      else if (t.dims.length === 5 && t.dims[2] === 4) freq = t.data;
    }
    if (!time) throw new Error("The separation model gave no sound.");
    const specs = freq ? standaloneMask(freq) : null, ch = dims[2], n = dims[3];
    // Each stem: the time branch plus (when the model has one) the frequency branch, both channels averaged.
    const stem = k => {
      const f = specs ? standaloneIspec(specs[k], TRAINING_SAMPLES) : null, o = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        let v = time[k * ch * n + i] + time[k * ch * n + n + i];
        if (f) v += (f.left[i] || 0) + (f.right[i] || 0);
        o[i] = v / 2;
      }
      return o;
    };
    const voc = stem(VOCALS), oth = stem(OTHER);
    // Cross-fade the overlapping pieces.
    for (let i = 0; i < len; i++) {
      const w = Math.min(1, i / (stride * 0.5), (len - i) / (stride * 0.5)) || 1e-3;
      vocals[start + i] += voc[i] * w; other[start + i] += oth[i] * w; weight[start + i] += w;
    }
    done++;
    if (onProgress) onProgress(done, pieces);
    if (start + TRAINING_SAMPLES >= total) break;
  }
  for (let i = 0; i < total; i++) if (weight[i] > 0) { vocals[i] /= weight[i]; other[i] /= weight[i]; }
  return { vocals, other };
}
