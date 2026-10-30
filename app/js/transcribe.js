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

// Pitch (MIDI number, fractional) and loudness every HOP seconds. Voices go down to about 75 Hz,
// so the range is wider than the flute tuner's. Resolves { track, levels, seconds, truncated }.
export async function pitchTrack(data, sr, opts) {
  const o = Object.assign({ maxSeconds: 360, onProgress: null }, opts || {});
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

// How far the recording sits from A4 = 440 tuning, in semitones (-0.5 to 0.5): a circular mean
// over steady frames, so a song tuned a little sharp or flat still snaps to the right notes.
export function tuningOf(track) {
  let x = 0, y = 0;
  for (let i = 1; i < track.length - 1; i++) {
    const a = track[i - 1], b = track[i], c = track[i + 1];
    if (a === null || b === null || c === null || Math.abs(a - b) > 0.1 || Math.abs(b - c) > 0.1) continue;
    x += Math.cos(2 * Math.PI * b); y += Math.sin(2 * Math.PI * b);
  }
  return x || y ? Math.atan2(y, x) / (2 * Math.PI) : 0;
}

// Notes: a new note starts when the pitch moves more than 0.75 semitone from the current one (so
// vibrato and andolan stay one note), at a silence, or at a clear dip in loudness (a repeated note).
// Runs shorter than 80 ms are glides between notes (meend) or grace notes, and are left out.
export function segmentNotes(track, levels, tune) {
  const runs = [];
  let cur = null;
  const close = i => { if (cur) { cur.i1 = i - 1; runs.push(cur); cur = null; } };
  for (let i = 0; i < track.length; i++) {
    const m = track[i];
    if (m === null) { close(i); continue; }
    const x = m - tune;
    if (cur && Math.abs(x - cur.q) <= 0.75) { cur.vals.push(x); continue; }
    close(i);
    cur = { q: Math.round(x), i0: i, vals: [x] };
  }
  close(track.length);
  // Split at loudness dips: a repeated note sung or tongued again without a silence between.
  const split = [];
  for (const r of runs) {
    const lv = levels.slice(r.i0, r.i1 + 1), med = lv.slice().sort((a, b) => a - b)[lv.length >> 1];
    let start = r.i0, cut = false;
    for (let i = r.i0 + MIN_NOTE; i <= r.i1 - MIN_NOTE; i++) {
      if (levels[i] < 0.45 * med && levels[i] <= levels[i - 1] && levels[i] <= levels[i + 1]) { split.push({ q: r.q, i0: start, i1: i - 1, vals: r.vals.slice(start - r.i0, i - r.i0), cut }); start = i + 1; cut = true; i += MIN_NOTE; }
    }
    split.push({ q: r.q, i0: start, i1: r.i1, vals: r.vals.slice(start - r.i0), cut });
  }
  // Join a note broken by a glide-length wobble to the same note (but not one split at a dip).
  const long = split.filter(r => r.i1 - r.i0 + 1 >= MIN_NOTE);
  const joined = [];
  for (const r of long) {
    const p = joined[joined.length - 1];
    if (p && p.q === r.q && !r.cut && r.i0 - p.i1 <= 4 && track.slice(p.i1 + 1, r.i0).every(v => v !== null)) { p.i1 = r.i1; p.vals = p.vals.concat(r.vals); }
    else joined.push({ ...r });
  }
  return joined.map(r => {
    const v = r.vals.slice().sort((a, b) => a - b), med = v[v.length >> 1];
    return { t0: r.i0 * HOP, t1: (r.i1 + 1) * HOP, midi: r.q, cents: Math.round((med - r.q) * 100) };
  });
}

// The recording's Sa: each candidate pitch class is scored by how well the notes' durations fit
// where Sa, Pa and the other notes of a scale usually sit, plus a bonus for the last note (songs and
// alap usually end on Sa). Returns all 12, most likely first: [{ pc, score }].
const SA_TEMPLATE = [1, -0.3, 0.25, 0.1, 0.25, 0.2, 0.02, 0.75, 0.1, 0.25, 0.15, 0.25];
export function findTonic(notes) {
  const hist = new Array(12).fill(0);
  let tot = 0;
  for (const n of notes) { const d = Math.min(n.t1 - n.t0, 2); hist[((n.midi % 12) + 12) % 12] += d; tot += d; }
  if (!tot) return [];
  for (let i = 0; i < 12; i++) hist[i] /= tot;
  const last = notes.slice(-3).sort((a, b) => (b.t1 - b.t0) - (a.t1 - a.t0))[0];
  return Array.from({ length: 12 }, (_, pc) => {
    let s = 0;
    for (let k = 0; k < 12; k++) s += hist[(pc + k) % 12] * SA_TEMPLATE[k];
    if (last && ((last.midi % 12) + 12) % 12 === pc) s += 0.08;
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
export function toNotation(notes, bpm, phase, sub, semiOf) {
  if (!notes.length) return "";
  const beat = 60 / bpm, step = beat / sub;
  const first = Math.floor(Math.round((notes[0].t0 - phase) / step) / sub) * sub;
  const slots = [];
  const put = (k, v) => { const i = k - first; if (i >= 0) slots[i] = v; };
  notes.forEach((n, j) => {
    let k0 = Math.round((n.t0 - phase) / step);
    while (slots[k0 - first] && slots[k0 - first] !== "-") k0++; // two notes on one step: the later one moves on
    const next = notes[j + 1];
    let k1 = Math.max(k0 + 1, Math.round((n.t1 - phase) / step));
    if (next) k1 = Math.min(k1, Math.max(k0 + 1, Math.round((next.t0 - phase) / step)));
    put(k0, codeOf(semiOf(n)));
    for (let k = k0 + 1; k < k1; k++) if (!slots[k - first]) put(k, "-");
  });
  const beats = [];
  for (let i = 0; i < slots.length; i += sub) {
    const items = [];
    for (let k = 0; k < sub; k++) items.push(slots[i + k] || "_");
    beats.push(beatToken(items));
  }
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
// sargam on the flute's own Sa), bpm, sub (steps per beat: 2 or 4), octave (extra shift) }.
export function transcribe(track, levels, opts) {
  const o = Object.assign({ flute: 72, sameKey: true, sub: 2, octave: 0 }, opts || {});
  const tune = tuningOf(track);
  // Notes far from the melody's range (a drone or bass heard alone, a stray octave) are left out.
  const all = segmentNotes(track, levels, tune), mids = all.map(n => n.midi).sort((a, b) => a - b), mid = mids[mids.length >> 1];
  const notes = all.filter(n => Math.abs(n.midi - mid) <= 17);
  const tonics = findTonic(notes);
  const sa = o.sa !== undefined && o.sa !== null ? o.sa : tonics.length ? tonicMidi(tonics[0].pc, notes) : 72;
  const tempo = o.bpm ? { bpm: o.bpm, phase: beatFit(notes, o.bpm).phase } : estimateTempo(notes);
  const bpm = tempo.bpm;
  const base = o.sameKey ? o.flute : sa;
  const raw = notes.map(n => n.midi - base);
  const shift = bestOctave(raw) + o.octave;
  const semiOf = n => n.midi - base + shift;
  const semis = notes.map(semiOf);
  return {
    notes, tune: Math.round(tune * 100), tonics, sa, bpm, phase: tempo.phase, shift, base,
    fit: fitOf(semis), flute: bestFlute(notes, sa),
    notation: toNotation(notes, bpm, tempo.phase, o.sub, semiOf),
  };
}
