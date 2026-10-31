// Melody benchmark on public clips with known answers: the ADC2004 set and the LabROSA MIREX-05
// training set (pop, jazz, opera, MIDI, voice and instruments; about 30 clips with the melody's
// pitch every 6-10 ms). They are downloaded once into the system's temp folder (or MELODY_DATA),
// never into the project. Not run in CI (it needs the network).
//
//   node tests/melody-bench.mjs [--notes] [--only pop] [--offset 0.046] [--sep]
//
// --sep: the melody from the separation model's vocals, where tests/separate-node.mjs has written
// them (DIR/sep/<clip>-vocals.wav); a clip whose vocals are much quieter than the mix (an
// instrumental) keeps the mix, as the page does.
//
// Scores, as in MIREX (frames where the answer has a melody): pitch right within 50 cents (RPA),
// right in any octave (RCA), melody frames heard as melody (voicing recall), silent frames taken
// for melody (false alarm), and overall accuracy. --notes scores the notes the page writes (their
// pitch over their length) instead of the raw pitch line.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const T = await import("../app/js/transcribe.js");

const args = process.argv.slice(2), flag = k => args.includes(k), arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DIR = process.env.MELODY_DATA || path.join(os.tmpdir(), "bansuri-melody-data");
const SETS = ["adc2004_full_set.zip", "mirex05TrainFiles.zip"];
const BASE = "http://labrosa.ee.columbia.edu/projects/melody/";

// A zip's files (stored or deflated), from its central directory.
function unzip(buf, dest) {
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  let p = buf.readUInt32LE(e + 16);
  const count = buf.readUInt16LE(e + 10);
  for (let k = 0; k < count; k++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (name.endsWith("/") || !/\.(wav|txt)$/i.test(name) || name.includes("..")) continue;
    const lstart = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), data = buf.subarray(lstart, lstart + csize);
    fs.writeFileSync(path.join(dest, path.basename(name)), method === 8 ? zlib.inflateRawSync(data) : data);
  }
}
async function ensureData() {
  fs.mkdirSync(DIR, { recursive: true });
  for (const z of SETS) {
    const mark = path.join(DIR, z + ".done");
    if (fs.existsSync(mark)) continue;
    console.log("downloading " + BASE + z);
    const res = await fetch(BASE + z);
    if (!res.ok) throw new Error("download failed: " + res.status);
    unzip(Buffer.from(await res.arrayBuffer()), DIR);
    fs.writeFileSync(mark, "");
  }
}

function readWav(file) {
  const b = fs.readFileSync(file);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) { const id = b.toString("ascii", p, p + 4), len = b.readUInt32LE(p + 4); if (id === "fmt ") fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12) }; if (id === "data") data = b.subarray(p + 8, p + 8 + len); p += 8 + len + (len & 1); }
  const n = Math.floor(data.length / 2 / fmt.ch), chs = Array.from({ length: fmt.ch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < fmt.ch; c++) chs[c][i] = data.readInt16LE((i * fmt.ch + c) * 2) / 32768;
  return { chs, sr: fmt.sr };
}
// The answer: [time, Hz] rows (0 Hz: no melody).
const readRef = file => fs.readFileSync(file, "utf8").trim().split(/\r?\n/).map(l => l.trim().split(/\s+/).map(Number)).filter(r => r.length >= 2 && Number.isFinite(r[0]));

// MIREX scores of an estimate (MIDI or null at time t, from est(t)) against the answer.
function score(ref, est) {
  let voiced = 0, unvoiced = 0, rp = 0, rc = 0, vr = 0, fa = 0, oa = 0;
  for (const [t, hz] of ref) {
    const e = est(t);
    if (hz > 0) {
      voiced++;
      if (e !== null) {
        vr++;
        const d = e - (69 + 12 * Math.log2(hz / 440));
        if (Math.abs(d) <= 0.5) { rp++; oa++; }
        if (Math.abs(d - 12 * Math.round(d / 12)) <= 0.5) rc++;
      }
    } else { unvoiced++; if (e !== null) fa++; else oa++; }
  }
  return { rpa: rp / voiced, rca: rc / voiced, vr: vr / voiced, vfa: unvoiced ? fa / unvoiced : 0, oa: oa / ref.length };
}

await ensureData();
const only = arg("--only", ""), offset = Number(arg("--offset", "0"));
const files = fs.readdirSync(DIR).filter(f => /\.wav$/i.test(f) && f.includes(only)).sort();
const pct = x => (x * 100).toFixed(0).padStart(3) + "%";
const all = [];
console.log("clip".padEnd(14) + "  RPA  RCA   VR  VFA   OA");
for (const f of files) {
  const refFile = path.join(DIR, f.replace(/(MIDI)?\.wav$/i, "REF.txt"));
  if (!fs.existsSync(refFile)) continue;
  let { chs, sr } = readWav(path.join(DIR, f)), used = "mix";
  const vf = path.join(DIR, "sep", f.replace(/\.wav$/i, "-vocals.wav"));
  if (flag("--sep") && fs.existsSync(vf)) {
    const v = readWav(vf), rms = x => Math.sqrt(x.reduce((a, y) => a + y * y, 0) / x.length);
    const mixR = rms(chs[0]), vR = rms(v.chs[0].map((y, i) => (y + (v.chs[1] || v.chs[0])[i]) / 2));
    if (vR > 0.25 * mixR) { chs = v.chs; sr = v.sr; used = "voc"; }
  }
  const m = T.monoDown(chs, sr);
  const tr = await T.pitchTrack(m.data, m.sr, {});
  let est;
  if (flag("--notes")) {
    const r = T.transcribe(tr.track, tr.levels, { sameKey: false, main: !flag("--every") });
    est = t => { const n = r.notes.find(x => t + offset >= x.t0 && t + offset < x.t1); return n ? n.midi + (n.off || 0) : null; };
  } else est = t => { const i = Math.round((t + offset) / T.HOP); const v = tr.track[i]; return v === null || v === undefined ? null : v; };
  const s = score(readRef(refFile), est);
  all.push(s);
  console.log((f.replace(/\.wav$/i, "") + (flag("--sep") ? " " + used : "")).padEnd(14) + " " + pct(s.rpa) + " " + pct(s.rca) + " " + pct(s.vr) + " " + pct(s.vfa) + " " + pct(s.oa));
}
const mean = k => all.reduce((a, s) => a + s[k], 0) / all.length;
console.log("mean".padEnd(14) + " " + ["rpa", "rca", "vr", "vfa", "oa"].map(k => pct(mean(k))).join(" ") + "  (" + all.length + " clips)");
