// The separation model (app/js/demucs.js) in Node, for tests and benchmarks: writes
// <out>-vocals.wav and <out>-other.wav (44.1 kHz mono). Needs onnxruntime-node (not a project
// dependency: npm i --no-save onnxruntime-node) and the model file (DEMUCS_MODEL).
//
//   DEMUCS_MODEL=htdemucs_embedded.onnx node tests/separate-node.mjs in.wav out [seconds]
import fs from "node:fs";

const MODEL = process.env.DEMUCS_MODEL, [inp, out, seconds] = process.argv.slice(2);
if (!MODEL || !inp || !out) { console.log("usage: DEMUCS_MODEL=model.onnx node tests/separate-node.mjs in.wav out [seconds]"); process.exit(0); }
const ort = await import("onnxruntime-node").catch(() => { console.log("needs onnxruntime-node: npm i --no-save onnxruntime-node"); process.exit(1); });
const { separate, SAMPLE_RATE } = await import("../app/js/demucs.js");

function readWav(file) {
  const b = fs.readFileSync(file);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) { const id = b.toString("ascii", p, p + 4), len = b.readUInt32LE(p + 4); if (id === "fmt ") fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12) }; if (id === "data") data = b.subarray(p + 8, p + 8 + len); p += 8 + len + (len & 1); }
  let n = Math.floor(data.length / 2 / fmt.ch); if (seconds) n = Math.min(n, Math.floor(Number(seconds) * fmt.sr));
  const chs = Array.from({ length: fmt.ch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < fmt.ch; c++) chs[c][i] = data.readInt16LE((i * fmt.ch + c) * 2) / 32768;
  return { chs, sr: fmt.sr };
}
// Linear resampling to the model's rate (enough for a test).
const resample = (x, sr) => { if (sr === SAMPLE_RATE) return x; const m = Math.floor(x.length * SAMPLE_RATE / sr), o = new Float32Array(m); for (let i = 0; i < m; i++) { const t = i * sr / SAMPLE_RATE, k = Math.floor(t), f = t - k; o[i] = x[k] * (1 - f) + (x[Math.min(x.length - 1, k + 1)] || 0) * f; } return o; };
function writeWav(x, file) {
  const n = x.length, buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SAMPLE_RATE, 24); buf.writeUInt32LE(SAMPLE_RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, buf);
}

const { chs, sr } = readWav(inp), L = resample(chs[0], sr), R = resample(chs[1] || chs[0], sr);
const session = await ort.InferenceSession.create(fs.readFileSync(MODEL), { executionProviders: ["cpu"] });
const t0 = Date.now();
const res = await separate(ort, session, L, R, (d, t) => process.stderr.write("\r" + d + "/" + t));
console.log("\nseparated " + (L.length / SAMPLE_RATE).toFixed(1) + " s in " + ((Date.now() - t0) / 1000).toFixed(1) + " s");
writeWav(res.vocals, out + "-vocals.wav");
writeWav(res.other, out + "-other.wav");
process.exit(0);
