// Song benchmark: how much of a trusted notation (a tutorial's) the app writes, song by song. The
// goal is 90% of the notes right (letter and octave; rhythm and grace notes not counted).
//
//   node tests/song-bench.mjs <folder> [--pitch ours|rmvpe|fcpe] [--source mix|vocals] [--show]
//
// The folder holds, per song, the audio (name.wav) and its notation (name.txt). The audio stays
// outside the project (songs are copyrighted); so do the separated vocals (name.vocals.wav), made
// once with DEMUCS_MODEL=htdemucs_embedded.onnx when --source vocals asks for them. --pitch rmvpe
// or fcpe needs PITCH_MODEL (the .onnx file) and onnxruntime-node (npm i --no-save onnxruntime-node).
//
// name.txt, in the app's sargam (m shuddha Ma, M tivra Ma, small r g d n komal, . lower octave,
// ' upper octave; - , _ | ~ and grace notes in ( ) or { } are ignored):
//   # Hothon se chhu lo tum (flutesangam.com)
//   sa: F            optional: the song's Sa as a note name (else the app's own choice is scored)
//   from: 0  to: 360 optional: the part of the recording to use (seconds)
//   G R G R S S R S .N
//   .N S S R R S G G R S S
//
// Score: each line of the notation is looked for all through the app's notes (in order, a few
// notes wrong allowed); every place it is found with at most 40% of its notes wrong counts, and
// the score is the share of notes right over all of them ("typical"), with the best single place
// ("best") alongside. A line never found counts as 0% right.
import fs from "node:fs";
import path from "node:path";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const T = await import("../app/js/transcribe.js");
const args = process.argv.slice(2), flag = k => args.includes(k), arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DIR = args.find(a => !a.startsWith("--") && !["ours", "rmvpe", "fcpe", "mix", "vocals"].includes(a));
if (!DIR) { console.log("usage: node tests/song-bench.mjs <folder> [--pitch ours|rmvpe|fcpe] [--source mix|vocals] [--show]"); process.exit(0); }
const PITCH = arg("--pitch", "ours"), SOURCE = arg("--source", "mix");
const SEMI = { S: 0, r: 1, R: 2, g: 3, G: 4, m: 5, M: 6, P: 7, d: 8, D: 9, n: 10, N: 11 };
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const name = s => { const L = ["S", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"][((s % 12) + 12) % 12], o = Math.floor(s / 12); return (o < 0 ? ".".repeat(-o) : "") + L + (o > 0 ? "'".repeat(o) : ""); };
export function parseLine(line) {
  const s = line.replace(/\([^)]*\)|\{[^}]*\}/g, " "), out = [];
  for (let i = 0; i < s.length; i++) {
    let low = 0; while (s[i] === ".") { low++; i++; }
    const c = s[i]; if (!(c in SEMI)) continue;
    let high = 0; while (s[i + 1] === "'") { high++; i++; }
    out.push(SEMI[c] + 12 * (high - low));
  }
  return out;
}
function readRef(file) {
  const ref = { lines: [], sa: null, from: 0, to: Infinity, title: path.basename(file, ".txt") };
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) continue;
    if (l.startsWith("#")) { ref.title = l.slice(1).trim(); continue; }
    const kv = /^(sa|from|to)\s*:\s*(\S+)(?:\s+(to)\s*:\s*(\S+))?/i.exec(l);
    if (kv) { const set = (k, v) => { if (k.toLowerCase() === "sa") ref.sa = NAMES.indexOf(v.replace("b", "").toUpperCase()); else ref[k.toLowerCase()] = Number(v); }; set(kv[1], kv[2]); if (kv[3]) set(kv[3], kv[4]); continue; }
    const notes = parseLine(l);
    // A line written twice (a repeated part) is one line: its places count once.
    if (notes.length >= 3 && !ref.lines.some(x => x.notes.join() === notes.join())) ref.lines.push({ text: l, notes });
  }
  return ref;
}
function readWav(file) {
  const b = fs.readFileSync(file);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) { const id = b.toString("ascii", p, p + 4), len = b.readUInt32LE(p + 4); if (id === "fmt ") fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12) }; if (id === "data") data = b.subarray(p + 8, p + 8 + len); p += 8 + len + (len & 1); }
  const n = Math.floor(data.length / 2 / fmt.ch), chs = Array.from({ length: fmt.ch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < fmt.ch; c++) chs[c][i] = data.readInt16LE((i * fmt.ch + c) * 2) / 32768;
  return { chs, sr: fmt.sr };
}
function writeWav(x, sr, file) {
  const n = x.length, buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, buf);
}
let ort = null;
const needOrt = async () => ort || (ort = await import("onnxruntime-node").catch(() => { console.log("needs onnxruntime-node: npm i --no-save onnxruntime-node"); process.exit(1); }));
// The separated vocals (made once, kept next to the song).
async function vocalsOf(wav) {
  const out = wav.replace(/\.wav$/i, ".vocals.wav");
  if (fs.existsSync(out)) return readWav(out);
  if (!process.env.DEMUCS_MODEL) { console.log("  (no " + path.basename(out) + ": set DEMUCS_MODEL to make it)"); process.exit(1); }
  await needOrt();
  const { separate, SAMPLE_RATE } = await import("../app/js/demucs.js");
  const { chs, sr } = readWav(wav), rs = x => { if (sr === SAMPLE_RATE) return x; const m = Math.floor(x.length * SAMPLE_RATE / sr), o = new Float32Array(m); for (let i = 0; i < m; i++) { const t = i * sr / SAMPLE_RATE, k = Math.floor(t), f = t - k; o[i] = x[k] * (1 - f) + (x[Math.min(x.length - 1, k + 1)] || 0) * f; } return o; };
  const session = await ort.InferenceSession.create(fs.readFileSync(process.env.DEMUCS_MODEL), { executionProviders: ["cpu"] });
  const res = await separate(ort, session, rs(chs[0]), rs(chs[1] || chs[0]), (d, t) => process.stderr.write("\r  separating " + d + "/" + t));
  process.stderr.write("\n");
  writeWav(res.vocals, SAMPLE_RATE, out);
  return { chs: [res.vocals], sr: SAMPLE_RATE };
}
// The pitch line: the app's own tracker, or a trained model.
async function trackOf(chs, sr) {
  if (PITCH === "ours") { const m = T.monoDown(chs, sr); return T.pitchTrack(m.data, m.sr, { maxSeconds: 600 }); }
  await needOrt();
  const P = await import("../app/js/pitchmodel.js");
  const session = await ort.InferenceSession.create(fs.readFileSync(process.env.PITCH_MODEL), { executionProviders: ["cpu"] });
  const mono = chs.length > 1 ? chs[0].map((v, i) => (v + chs[1][i]) / 2) : chs[0], a = P.to16k(mono, sr);
  const { f0, conf } = await P.modelPitch(ort, session, PITCH, a);
  return P.toTrack(f0, conf, a);
}
// Edits to match `want` ending at each place in `got` (the line may start anywhere).
function endsAt(want, got) {
  let prev = new Array(got.length + 1).fill(0);
  for (let i = 1; i <= want.length; i++) { const cur = [i]; for (let j = 1; j <= got.length; j++) cur[j] = Math.min(prev[j - 1] + (want[i - 1] === got[j - 1] ? 0 : 1), prev[j] + 1, cur[j - 1] + 1); prev = cur; }
  return prev;
}
// What the edits are, at a place: notes missing from the app's (del), extra in it (ins), and
// wrong ones (sub, as "want>got" in semitones from Sa), by backtracking the alignment.
function ops(want, got, j) {
  const m = want.length, D = [];
  const lo = Math.max(0, j - 2 * m);
  for (let i = 0; i <= m; i++) { D.push(new Array(j - lo + 1).fill(0)); D[i][0] = i; }
  for (let i = 1; i <= m; i++) for (let k = 1; k <= j - lo; k++) D[i][k] = Math.min(D[i - 1][k - 1] + (want[i - 1] === got[lo + k - 1] ? 0 : 1), D[i - 1][k] + 1, D[i][k - 1] + 1);
  let k = j - lo; for (let x = 0; x <= j - lo; x++) if (D[m][x] < D[m][k]) k = x;
  const out = { del: 0, ins: 0, sub: [] };
  let i = m;
  while (i > 0 && k > 0) {
    if (D[i][k] === D[i - 1][k - 1] + (want[i - 1] === got[lo + k - 1] ? 0 : 1)) { if (want[i - 1] !== got[lo + k - 1]) out.sub.push(want[i - 1] + ">" + got[lo + k - 1]); i--; k--; }
    else if (D[i][k] === D[i - 1][k] + 1) { out.del++; i--; }
    else { out.ins++; k--; }
  }
  out.del += i;
  return out;
}
const why = { del: 0, ins: 0, sub: 0, pairs: {} };
// Every place (local minimum of edits) with at most 40% wrong; places closer than half a line merge.
function places(want, got) {
  const e = endsAt(want, got), out = [], limit = Math.floor(want.length * 0.4);
  for (let j = 1; j < e.length; j++) {
    if (e[j] > limit || e[j] > e[j - 1] || (j + 1 < e.length && e[j + 1] < e[j])) continue;
    const last = out[out.length - 1];
    if (last && j - last.j < want.length / 2) { if (e[j] < last.e) { last.e = e[j]; last.j = j; } continue; }
    out.push({ j, e: e[j] });
  }
  return out;
}

// Typical and best scores of a note list (semitones from Sa) against a reference. The whole
// notation may sit an octave higher or lower than the reference's (which octave Sa is written in
// is a choice for the flute's range, made with the page's Octave buttons): the best of the three.
function scoreOf(ref, got) {
  return [0, -12, 12].map(k => scoreAt(ref, got.map(x => x + k))).sort((a, b) => b.typ - a.typ)[0];
}
// Each stretch of the app's notes counts for one line at most: all places of all lines are taken
// closest first (fewest wrong for their length), and a place overlapping one taken already is
// left out. So a perfect transcription scores 100% (--selftest checks it).
function claim(ref, got) {
  const cands = [];
  ref.lines.forEach((line, li) => { for (const p of places(line.notes, got)) cands.push({ li, a: Math.max(0, p.j - line.notes.length), z: p.j, e: p.e, n: line.notes.length }); });
  cands.sort((x, y) => x.e / x.n - y.e / y.n || y.n - x.n);
  const taken = [], used = new Uint8Array(got.length + 1);
  for (const c of cands) {
    let free = true;
    for (let k = c.a; k < c.z && free; k++) if (used[k]) free = false;
    if (!free) continue;
    for (let k = c.a; k < c.z; k++) used[k] = 1;
    taken.push(c);
  }
  return taken;
}
// Lines that are versions of one sung line (a tutorial writes both: they differ in under a quarter
// of their notes) form a group; a group none of whose lines is found counts once as 0% right.
function groups(ref) {
  const g = ref.lines.map((_, i) => i);
  const dist = (a, b) => { const e = endsAt(a, b); return Math.min(...e.slice(Math.max(0, b.length - 2))); };
  for (let i = 0; i < ref.lines.length; i++) for (let j = 0; j < i; j++) {
    const a = ref.lines[i].notes, b = ref.lines[j].notes;
    if (Math.abs(a.length - b.length) <= 2 && dist(a, b) < 0.25 * Math.max(a.length, b.length)) { const from = g[i], to = g[j]; for (let k = 0; k < g.length; k++) if (g[k] === from) g[k] = to; }
  }
  return g;
}
function scoreAt(ref, got) {
  const taken = claim(ref, got), grp = groups(ref);
  let right = 0, total = 0;
  for (const c of taken) { right += c.n - c.e; total += c.n; }
  for (const id of new Set(grp)) {
    const members = ref.lines.filter((_, i) => grp[i] === id);
    if (!taken.some(c => grp[c.li] === id)) total += Math.max(...members.map(l => l.notes.length));
  }
  return { typ: total ? right / total : 0, best: 0, taken };
}
const oracle = [];
// --selftest: the reference itself, three times over, must score 100%.
if (flag("--selftest")) {
  for (const f of fs.readdirSync(DIR).filter(f => /\.txt$/i.test(f))) {
    const ref = readRef(path.join(DIR, f)), got = [];
    for (let k = 0; k < 3; k++) for (const l of ref.lines) got.push(...l.notes);
    console.log(f + ": " + Math.round(scoreAt(ref, got).typ * 100) + "% for a perfect transcription");
  }
  process.exit(0);
}
const songs = fs.readdirSync(DIR).filter(f => /\.txt$/i.test(f)).map(f => path.join(DIR, f));
let sumTyp = 0, sumBest = 0, count = 0;
console.log("pitch: " + PITCH + ", source: " + SOURCE);
for (const txt of songs) {
  const wav = txt.replace(/\.txt$/i, ".wav");
  if (!fs.existsSync(wav)) { console.log("(no audio for " + path.basename(txt) + ")"); continue; }
  const ref = readRef(txt);
  const { chs, sr } = SOURCE === "vocals" ? await vocalsOf(wav) : readWav(wav);
  const tr = await trackOf(chs, sr);
  // --sa-mix: Sa from the whole recording (the music names the key), notes from --source.
  let mixSa = null;
  if (flag("--sa-mix") && SOURCE === "vocals") { const w = readWav(wav), m = T.monoDown(w.chs, w.sr), t2 = await T.pitchTrack(m.data, m.sr, { maxSeconds: 600 }); mixSa = T.transcribe(t2.track, t2.levels, { sameKey: false }).tonics[0].pc; if (ref.sa === null || ref.sa < 0) ref.sa = mixSa; }
  const opts = { sameKey: false, layout: "phrases", from: ref.from, to: ref.to, main: !flag("--every") };
  const first = T.transcribe(tr.track, tr.levels, opts);
  // The reference Sa, in the octave the app chose for its own Sa (only the pitch class is given).
  // --oracle: also score with every Sa, to tell a wrong Sa from wrong notes.
  if (flag("--oracle")) {
    const res = [];
    for (let pc = 0; pc < 12; pc++) {
      const rr = T.transcribe(tr.track, tr.levels, { ...opts, sa: T.tonicMidi(pc, first.notes) });
      res.push({ pc, s: scoreOf(ref, rr.notes.map(n => n.midi - rr.sa)) });
    }
    res.sort((a, b) => b.s.typ - a.s.typ);
    oracle.push(res[0].s.typ);
    console.log("  best Sa would be " + NAMES[res[0].pc] + ": typical " + Math.round(res[0].s.typ * 100) + "%" + (res[0].pc === first.sa % 12 ? " (the app's own Sa)" : "") + "; next " + NAMES[res[1].pc] + " " + Math.round(res[1].s.typ * 100) + "%");
  }
  const sa = ref.sa !== null && ref.sa >= 0 ? T.tonicMidi(ref.sa, first.notes) : first.sa;
  const r = ref.sa !== null && ref.sa >= 0 ? T.transcribe(tr.track, tr.levels, { ...opts, sa }) : first;
  const got0 = r.notes.map(n => n.midi - r.sa), shift = [0, -12, 12].map(k => ({ k, s: scoreAt(ref, got0.map(x => x + k)).typ })).sort((a, b) => b.s - a.s)[0].k;
  const got = got0.map(x => x + shift);
  let right = 0, total = 0, bestRight = 0, bestTotal = 0;
  const rows = [], taken = claim(ref, got);
  for (const [li, line] of ref.lines.entries()) {
    const ps = taken.filter(c => c.li === li).map(c => ({ j: c.z, e: c.e })), n = line.notes.length;
    const best = ps.length ? Math.min(...ps.map(p => p.e)) : n;
    if (ps.length) for (const p of ps) {
      right += n - p.e; total += n;
      const o = ops(line.notes, got, p.j);
      why.del += o.del; why.ins += o.ins; why.sub += o.sub.length;
      for (const x of o.sub) why.pairs[x] = (why.pairs[x] || 0) + 1;
    } else total += n;
    bestRight += n - best; bestTotal += n;
    rows.push("    " + String(ps.length).padStart(2) + " found, best " + Math.round((n - best) / n * 100) + "%: " + line.text);
    // --dump: what the app wrote at each place (its notes, with times), to see what goes wrong.
    if (flag("--dump")) for (const p of ps) { const a = Math.max(0, p.j - n - 2), z = Math.min(r.notes.length, p.j + 2); rows.push("       " + p.e + " wrong at " + r.notes[a].t0.toFixed(1) + "s: " + r.notes.slice(a, z).map(q => name(q.midi - r.sa) + "(" + Math.round((q.t1 - q.t0) * 100) + ")").join(" ")); }
  }
  const sc = scoreAt(ref, got), typ = sc.typ, bst = bestRight / bestTotal;
  sumTyp += typ; sumBest += bst; count++;
  console.log(ref.title + ": typical " + Math.round(typ * 100) + "%, best " + Math.round(bst * 100) + "% | app's Sa " + NAMES[first.sa % 12] + (ref.sa !== null && ref.sa >= 0 ? ", reference Sa " + NAMES[ref.sa] + (first.sa % 12 === ref.sa ? " (same)" : " (DIFFERENT: scored on the reference Sa)") : "") + " | " + r.notes.length + " notes");
  if (flag("--show")) console.log(rows.join("\n"));
}
if (flag("--why")) console.log("errors in the places found: " + why.del + " notes missing, " + why.ins + " extra, " + why.sub + " wrong; most common wrong (want>got): " + Object.entries(why.pairs).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => k + " x" + v).join(", "));
if (oracle.length) console.log("with the best Sa for each song: typical " + Math.round(oracle.reduce((a, b) => a + b, 0) / oracle.length * 100) + "%");
if (count) console.log("ALL " + count + " songs: typical " + Math.round(sumTyp / count * 100) + "%, best " + Math.round(sumBest / count * 100) + "% (goal: 90% typical)");
