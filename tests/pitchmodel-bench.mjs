// The melody benchmark (tests/melody-bench.mjs data) with a trained pitch model instead of the
// app's own tracker: RMVPE or FCPE through onnxruntime-node (npm i --no-save onnxruntime-node).
//
//   PITCH_MODEL=rmvpe.onnx node tests/pitchmodel-bench.mjs [--sep] [--notes] [--only pop]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const T = await import("../app/js/transcribe.js");
const P = await import("../app/js/pitchmodel.js");
const ort = await import("onnxruntime-node").catch(() => { console.log("needs onnxruntime-node: npm i --no-save onnxruntime-node"); process.exit(1); });
const MODEL = process.env.PITCH_MODEL, kind = /fcpe/i.test(MODEL || "") ? "fcpe" : "rmvpe";
if (!MODEL) { console.log("usage: PITCH_MODEL=rmvpe.onnx node tests/pitchmodel-bench.mjs [--sep] [--notes]"); process.exit(0); }
const args = process.argv.slice(2), flag = k => args.includes(k), arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DIR = process.env.MELODY_DATA || path.join(os.tmpdir(), "bansuri-melody-data");
function readWav(file) {
  const b = fs.readFileSync(file);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) { const id = b.toString("ascii", p, p + 4), len = b.readUInt32LE(p + 4); if (id === "fmt ") fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12) }; if (id === "data") data = b.subarray(p + 8, p + 8 + len); p += 8 + len + (len & 1); }
  const n = Math.floor(data.length / 2 / fmt.ch), x = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < fmt.ch; c++) s += data.readInt16LE((i * fmt.ch + c) * 2); x[i] = s / fmt.ch / 32768; }
  return { x, sr: fmt.sr };
}
const readRef = file => fs.readFileSync(file, "utf8").trim().split(/\r?\n/).map(l => l.trim().split(/\s+/).map(Number)).filter(r => r.length >= 2 && Number.isFinite(r[0]));
function score(ref, est) {
  let voiced = 0, rp = 0, rc = 0;
  for (const [t, hz] of ref) { if (!(hz > 0)) continue; voiced++; const e = est(t); if (e === null) continue; const d = e - (69 + 12 * Math.log2(hz / 440)); if (Math.abs(d) <= 0.5) rp++; if (Math.abs(d - 12 * Math.round(d / 12)) <= 0.5) rc++; }
  return { rpa: rp / voiced, rca: rc / voiced };
}
const session = await ort.InferenceSession.create(fs.readFileSync(MODEL), { executionProviders: ["cpu"] });
const pct = x => (x * 100).toFixed(0).padStart(3) + "%";
const all = [];
for (const f of fs.readdirSync(DIR).filter(f => /\.wav$/i.test(f) && f.includes(arg("--only", ""))).sort()) {
  const refFile = path.join(DIR, f.replace(/(MIDI)?\.wav$/i, "REF.txt"));
  if (!fs.existsSync(refFile)) continue;
  let { x, sr } = readWav(path.join(DIR, f)), used = "mix";
  const vf = path.join(DIR, "sep", f.replace(/\.wav$/i, "-vocals.wav"));
  if (flag("--sep") && fs.existsSync(vf)) { const v = readWav(vf), rms = a => Math.sqrt(a.reduce((s, y) => s + y * y, 0) / a.length); if (rms(v.x) > 0.25 * rms(x)) { x = v.x; sr = v.sr; used = "voc"; } }
  const a = P.to16k(x, sr), { f0, conf } = await P.modelPitch(ort, session, kind, a);
  let est;
  if (flag("--notes")) {
    const tr = P.toTrack(f0, conf, a), r = T.transcribe(tr.track, tr.levels, { sameKey: false });
    est = t => { const n = r.notes.find(q => t >= q.t0 && t < q.t1); return n ? n.midi + (n.off || 0) : null; };
  } else est = t => { const i = Math.round(t / 0.01); return f0[i] > 0 ? 69 + 12 * Math.log2(f0[i] / 440) : null; };
  const s = score(readRef(refFile), est);
  all.push(s);
  console.log((f.replace(/\.wav$/i, "") + " " + used).padEnd(18) + pct(s.rpa) + pct(s.rca));
}
console.log("mean".padEnd(18) + pct(all.reduce((a, s) => a + s.rpa, 0) / all.length) + pct(all.reduce((a, s) => a + s.rca, 0) / all.length) + "  (" + kind + ", " + all.length + " clips)");
