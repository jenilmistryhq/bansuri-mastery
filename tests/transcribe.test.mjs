// Accuracy tests for notation from a recording (app/js/transcribe.js), on synthetic recordings with
// a known answer: a voice with vibrato, glides and breath noise, a flute, and a tune over a drone.
// Real recordings are harder than these; the numbers here are a floor, not a promise.
import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const T = await import("../app/js/transcribe.js");
const { parseNotation, buildEvents } = await import("../app/js/core/notation.js");

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log("  ok   " + name); };

// A melody as [semitones from Sa, beats]; null is a rest.
const TWINKLE = [[0, 1], [0, 1], [7, 1], [7, 1], [9, 1], [9, 1], [7, 2], [5, 1], [5, 1], [4, 1], [4, 1], [2, 1], [2, 1], [0, 2]];
const YAMAN = [[-1, 0.5], [2, 0.5], [4, 1], [6, 0.5], [4, 0.5], [2, 1], [-1, 0.5], [2, 0.5], [0, 2], [7, 1], [6, 0.5], [4, 0.5], [2, 1], [4, 1], [2, 0.5], [-1, 0.5], [2, 0.5], [0, 2.5]];

// Synthesis: harmonics, vibrato, a short glide into each new note, breath noise, and a short gap
// before a repeated note (re-articulation). Optional drone on Sa and Pa underneath.
function synth(melody, o) {
  o = Object.assign({ sr: 22050, sa: 62, bpm: 96, vibrato: 30, detune: 0, harmonics: [1, 0.5, 0.3, 0.15], noise: 0.02, drone: 0, chords: 0, harmonium: 0, tabla: 0, lead: 0.4 }, o);
  const beat = 60 / o.bpm;
  const total = o.lead + melody.reduce((a, [, b]) => a + b, 0) * beat + 0.5;
  const n = Math.floor(total * o.sr), out = new Float32Array(n);
  let t = o.lead, phase = 0, prev = null, seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (const [semi, beats, slide] of melody) {
    const gl = slide || 0.05; // the glide into the note (a meend when long)
    const dur = beats * beat, i0 = Math.floor(t * o.sr), i1 = Math.floor((t + dur) * o.sr);
    if (semi !== null) {
      const target = o.sa + semi + o.detune / 100, from = prev === null ? target : o.sa + prev + o.detune / 100;
      const gap = prev === semi ? 0.04 : 0;
      for (let i = i0; i < i1; i++) {
        const tt = (i - i0) / o.sr;
        if (tt < gap) continue;
        const glide = prev !== null && prev !== semi && tt < gl ? from + (target - from) * (tt / gl) : target;
        const vib = tt > 0.2 ? o.vibrato / 100 * Math.sin(2 * Math.PI * 5.5 * tt) : 0;
        const f = 440 * Math.pow(2, (glide + vib - 69) / 12);
        phase += 2 * Math.PI * f / o.sr;
        const env = Math.min(1, (tt - gap) / 0.02, (dur - tt) / 0.03);
        let s = 0; o.harmonics.forEach((a, k) => { s += a * Math.sin((k + 1) * phase); });
        out[i] += 0.3 * env * s + o.noise * rnd();
      }
    }
    prev = semi; t += dur;
  }
  if (o.drone) for (let i = 0; i < n; i++) {
    const tt = i / o.sr, fs = 440 * Math.pow(2, (o.sa - 12 - 69) / 12);
    out[i] += o.drone * (Math.sin(2 * Math.PI * fs * tt) + 0.6 * Math.sin(2 * Math.PI * fs * 1.5 * tt));
  }
  // A chord accompaniment (Sa-Ga-Pa, then Ma-Dha-Sa, changing every 2 beats, an octave below).
  if (o.chords) for (let i = 0; i < n; i++) {
    const tt = i / o.sr, k = Math.floor(tt / (2 * beat)) % 2, ch = k ? [5, 9, 12] : [0, 4, 7];
    for (const c of ch) out[i] += o.chords * Math.sin(2 * Math.PI * 440 * Math.pow(2, (o.sa - 12 + c - 69) / 12) * tt);
  }
  // Harmonium-like chords: reedy (many harmonics), in the melody's own octave, changing every 2 beats.
  if (o.harmonium) for (let i = 0; i < n; i++) {
    const tt = i / o.sr, k = Math.floor(tt / (2 * beat)) % 2, ch = k ? [5, 9, 12] : [0, 4, 7];
    for (const c of ch) { const f = 440 * Math.pow(2, (o.sa + c - 69) / 12); for (let h = 1; h <= 6; h++) out[i] += o.harmonium * Math.pow(0.7, h - 1) * Math.sin(2 * Math.PI * f * h * tt + h); }
  }
  // Tabla-like hits on every beat: a low thump and a burst of noise, both decaying fast.
  if (o.tabla) for (let k = 0; k * beat < total; k++) {
    const i0 = Math.floor((o.lead + k * beat) * o.sr);
    for (let i = 0; i < 0.15 * o.sr && i0 + i < n; i++) {
      const tt = i / o.sr, env = Math.exp(-tt * 30);
      out[i0 + i] += o.tabla * env * (Math.sin(2 * Math.PI * 110 * tt * (1 + 0.5 * Math.exp(-tt * 40))) + 0.8 * rnd());
    }
  }
  return { data: out, sr: o.sr };
}

// Notes of a notation, in order (rests and holds left out).
const notesOf = text => buildEvents(parseNotation(text).tokens, 60).ev.map(e => e.semi);
// Edit distance between two note lists, as a share of the expected length.
function errorRate(got, want) {
  const D = Array.from({ length: got.length + 1 }, (_, i) => [i, ...new Array(want.length).fill(0)]);
  for (let j = 1; j <= want.length; j++) D[0][j] = j;
  for (let i = 1; i <= got.length; i++) for (let j = 1; j <= want.length; j++) D[i][j] = Math.min(D[i - 1][j - 1] + (got[i - 1] === want[j - 1] ? 0 : 1), D[i - 1][j] + 1, D[i][j - 1] + 1);
  return D[got.length][want.length] / want.length;
}
const run = async (melody, o, opts, engine) => {
  const { data, sr } = synth(melody, o);
  const { track, levels } = await T.pitchTrack(data, sr, { engine });
  const r = T.transcribe(track, levels, opts);
  // DBG=1 prints what was found, for tuning.
  if (process.env.DBG) console.log(JSON.stringify({ bpm: r.bpm, phase: r.phase, notes: r.notes.map(n => [n.t0.toFixed(2), n.t1.toFixed(2), n.midi]) }));
  return r;
};
const wantNotes = (melody, shift) => melody.filter(([s]) => s !== null).map(([s]) => s + shift);
const near = (bpm, want) => [want, want / 2, want * 2].some(w => Math.abs(bpm - w) / w <= 0.04);

await test("a sung tune in D (vibrato, glides, tuned 15 cents sharp): Sa, notes and tempo", async () => {
  const r = await run(TWINKLE, { sa: 62, detune: 15 }, { flute: 74 });
  assert.equal(((r.sa % 12) + 12) % 12, 2, "Sa is D, got " + r.sa);
  assert.ok(near(r.bpm, 96), "tempo near 96 (or half/double), got " + r.bpm);
  const err = errorRate(notesOf(r.notation), wantNotes(TWINKLE, 0));
  assert.ok(err <= 0.1, "note error " + err + " in " + r.notation);
  assert.ok(Math.abs(r.tune - 15) <= 5, "tuning offset about +15 cents, got " + r.tune);
});

await test("the same tune on a C flute (play with the recording): transposed so it still sounds in D", async () => {
  const r = await run(TWINKLE, { sa: 62, detune: 15 }, { flute: 72, sameKey: true });
  // D is 2 semitones above the C flute's Sa, so every note moves up 2 (the octave may change to fit).
  const got = notesOf(r.notation), want = wantNotes(TWINKLE, 2);
  const err = Math.min(errorRate(got, want), errorRate(got, want.map(s => s + 12)), errorRate(got, want.map(s => s - 12)));
  assert.ok(err <= 0.1, "transposed note error " + err + " in " + r.notation);
  assert.equal(r.flute % 12, 2, "the best flute for it is a D flute");
});

await test("keep the sargam: the same notation on any flute", async () => {
  const r = await run(TWINKLE, { sa: 62 }, { flute: 72, sameKey: false });
  assert.ok(errorRate(notesOf(r.notation), wantNotes(TWINKLE, 0)) <= 0.1, r.notation);
});

await test("a flute phrase in Yaman (half-beat notes, C5 flute)", async () => {
  const r = await run(YAMAN, { sa: 72, vibrato: 8, harmonics: [1, 0.15, 0.05], noise: 0.03, bpm: 80 }, { flute: 72, sub: 2 });
  assert.equal(r.sa % 12, 0, "Sa is C, got " + r.sa);
  const err = errorRate(notesOf(r.notation), wantNotes(YAMAN, 0));
  assert.ok(err <= 0.12, "note error " + err + " in " + r.notation);
});

await test("a tune over a tanpura-like drone still comes out", async () => {
  const r = await run(TWINKLE, { sa: 65, drone: 0.06 }, { flute: 77 });
  assert.equal(((r.sa % 12) + 12) % 12, 5, "Sa is F, got " + r.sa);
  const err = errorRate(notesOf(r.notation), wantNotes(TWINKLE, 0));
  assert.ok(err <= 0.15, "note error " + err + " in " + r.notation);
});

await test("a drone heard alone before the tune does not become notes", async () => {
  const r = await run(TWINKLE, { sa: 65, drone: 0.06 }, { flute: 77 });
  assert.ok(r.notes.every(n => n.midi >= 60), "no notes from the low drone: " + r.notes.map(n => n.midi).join(" "));
});

await test("a tempo you type in keeps the notes on the beat", async () => {
  const r = await run(TWINKLE, { sa: 62 }, { flute: 74, bpm: 48 });
  assert.equal(r.bpm, 48);
  assert.ok(errorRate(notesOf(r.notation), wantNotes(TWINKLE, 0)) <= 0.1, r.notation);
});

await test("a low male voice (Sa = A2 region) is tracked", async () => {
  const r = await run(TWINKLE, { sa: 50 }, { flute: 74 });
  assert.equal(((r.sa % 12) + 12) % 12, 2, "Sa is D, got " + r.sa);
  const got = notesOf(r.notation), want = wantNotes(TWINKLE, 0);
  assert.ok(Math.min(errorRate(got, want), errorRate(got, want.map(s => s + 12)), errorRate(got, want.map(s => s - 12))) <= 0.1, r.notation);
});

// How the error grows as the accompaniment gets louder, for both pitch methods. Printed so the
// limits stay visible; the melody method must stay usable with each chord note at half the melody's level.
await test("accompaniment: error by loudness, melody method vs single pitch (printed)", async () => {
  const pct = r => Math.round(errorRate(notesOf(r.notation), wantNotes(TWINKLE, 0)) * 100);
  for (const [label, mix] of [["chords", l => ({ chords: l })], ["chords + tabla", l => ({ chords: l, tabla: l * 1.5, drone: l / 2 })], ["harmonium (same octave) + tabla", l => ({ harmonium: l, tabla: l * 1.5 })]]) {
    const rows = [];
    for (const level of [0.06, 0.1, 0.15, 0.2, 0.3]) {
      const m = await run(TWINKLE, { sa: 62, ...mix(level) }, { flute: 74 }), y = await run(TWINKLE, { sa: 62, ...mix(level) }, { flute: 74 }, "yin");
      rows.push(level + ": " + pct(m) + "% (yin " + pct(y) + "%)" + (m.sa % 12 === 2 ? "" : " Sa wrong"));
      if (process.env.SHOWMIX) console.log(label, level, m.sa, m.notes.map(n => n.midi + "@" + n.t0.toFixed(2)).join(" "));
      if (level === 0.15 && !label.startsWith("harmonium") && !process.env.NOASSERT) assert.ok(pct(m) <= 15, label + " at 0.15: the melody method got " + pct(m) + "% wrong");
    }
    console.log("       " + label + ", per-note level vs melody 0.3, notes wrong: " + rows.join("; "));
  }
});

await test("octave slips fold back; real leaps stay", () => {
  const mk = ms => ms.map((m, i) => ({ t0: i, t1: i + 0.5, midi: m }));
  assert.deepEqual(T.foldOctaves(mk([62, 64, 66, 43, 64, 62, 66])).map(n => n.midi), [62, 64, 66, 67, 64, 62, 66]);
  assert.deepEqual(T.foldOctaves(mk([62, 64, 81, 64, 62])).map(n => n.midi), [62, 64, 69, 64, 62]);
  // An octave leap is music (S to S'), not a slip.
  assert.deepEqual(T.foldOctaves(mk([60, 64, 67, 72, 67, 64, 60])).map(n => n.midi), [60, 64, 67, 72, 67, 64, 60]);
});

// A stereo song: a violin-like intro and outro panned left, a singer in the centre (with the
// drum and drone, also central, as in most mixes), and a soft panned pad under the singing.
const INTRO = [[7, 1], [9, 1], [11, 1], [12, 2]], OUTRO = [[12, 1], [11, 1], [9, 1], [7, 2]];
function stereoSong() {
  const sr = 22050, beat = 60 / 96, sa = 62;
  const violin = { sa, bpm: 96, vibrato: 15, harmonics: [1, 0.7, 0.5, 0.35, 0.2], noise: 0.005 };
  const intro = synth(INTRO, { ...violin, lead: 0.4 }).data, singer = synth(TWINKLE, { sa, bpm: 96, lead: 4 }).data;
  const outroAt = 4 + 16 * beat + 1, outro = synth(OUTRO, { ...violin, lead: outroAt }).data;
  const pad = synth([[0, 16]], { sa: sa - 12, bpm: 96, lead: 4, vibrato: 0, harmonics: [1, 0.5, 0.3], noise: 0 }).data;
  const drums = synth([[null, 30]], { sa, bpm: 96, lead: 0.4, tabla: 0.05, drone: 0.03, noise: 0 }).data;
  const n = Math.max(intro.length, singer.length, outro.length, drums.length), L = new Float32Array(n), R = new Float32Array(n);
  const at = (x, i) => (i < x.length ? x[i] : 0);
  for (let i = 0; i < n; i++) {
    const side = at(intro, i) + at(outro, i), mid = at(singer, i) + at(drums, i);
    L[i] = mid + 0.9 * side + 0.25 * at(pad, i); R[i] = mid + 0.2 * side + 0.05 * at(pad, i);
  }
  return { channels: [L, R], sr, outroAt };
}
const partRun = async (st, part, opts) => {
  const { track, levels } = await T.pitchTrack(st.M, st.sr, part ? { stereo: { L: st.L, R: st.R, part } } : {});
  return { track, levels, r: T.transcribe(track, levels, { sameKey: false, ...opts }) };
};

await test("stereo song: singer, background and best to play", async () => {
  const song = stereoSong(), st = T.stereoDown(song.channels, song.sr);
  assert.ok(st.side > 0.02, "a stereo mix is seen as stereo: " + st.side);
  const singer = await partRun(st, "singer", { sa: 62 }), back = await partRun(st, "background", { sa: 62 });
  const sErr = errorRate(notesOf(singer.r.notation), wantNotes(TWINKLE, 0));
  assert.ok(sErr <= 0.15, "singer: " + Math.round(sErr * 100) + "% wrong: " + singer.r.notation);
  const bNotes = notesOf(back.r.notation), bWant = wantNotes(INTRO, 0).concat(wantNotes(OUTRO, 0));
  const bErr = errorRate(bNotes, bWant);
  assert.ok(bErr <= 0.25, "background: " + Math.round(bErr * 100) + "% wrong: " + back.r.notation);
  const best = T.transcribe(null, null, { sa: 62, sameKey: false, runs: T.bestRuns(singer, back), playable: true });
  const want = wantNotes(INTRO, 0).concat(wantNotes(TWINKLE, 0), wantNotes(OUTRO, 0));
  const got = notesOf(best.notation), err = Math.min(errorRate(got, want), errorRate(got.map(x => ((x % 12) + 12) % 12), want.map(x => x % 12)));
  assert.ok(err <= 0.2, "best to play: " + Math.round(err * 100) + "% wrong: " + best.notation);
  assert.equal(best.fit.below + best.fit.reg3, 0, "best to play stays in the flute's range");
  console.log("       stereo song, notes wrong: singer " + Math.round(sErr * 100) + "%, background " + Math.round(bErr * 100) + "%, best to play " + Math.round(err * 100) + "%");
});

// Mono: the singer by repetition (the harmonium and tabla repeat every 4 beats, the tune does not).
await test("mono song: the singer by repetition, under harmonium and tabla (printed)", async () => {
  const rows = [];
  for (const level of [0.03, 0.06, 0.1, 0.15]) {
    const tune = TWINKLE.concat(YAMAN.map(([x, b]) => [x, b * 2])), { data, sr } = synth(tune, { sa: 62, harmonium: level, tabla: level * 1.5 });
    const whole = await T.pitchTrack(data, sr), parts = await T.repetitionParts(data, sr);
    const sing = await T.pitchTrack(data, sr, { mags: parts.singer, part: "singer" });
    // Strict (every repeated note counts) and the melody (repeats merged: S S -> S).
    const dedup = a => a.filter((x, i) => i === 0 || x !== a[i - 1]);
    const want = wantNotes(tune, 0), notesFor = tr => notesOf(T.transcribe(tr.track, tr.levels, { sa: 62, sameKey: false }).notation);
    const pct = tr => Math.round(errorRate(notesFor(tr), want) * 100), mel = tr => Math.round(errorRate(dedup(notesFor(tr)), dedup(want)) * 100);
    const w = pct(whole), sg = pct(sing);
    rows.push(level + ": whole " + w + "% (melody " + mel(whole) + "%), singer " + sg + "% (melody " + mel(sing) + "%)");
    if (process.env.SHOWMIX) console.log(level, T.transcribe(sing.track, sing.levels, { sa: 62, sameKey: false }).notes.map(x => (x.midi - 62) + "@" + x.t0.toFixed(1)).join(" "));
    if (level === 0.1 && !process.env.NOASSERT) assert.ok(mel(sing) <= 20, "singer by repetition at 0.1: melody " + mel(sing) + "% wrong");
  }
  console.log("       harmonium + tabla, mono, notes wrong: " + rows.join("; "));
});

await test("a mono recording cannot be split", () => {
  const x = synth(TWINKLE, {}).data;
  assert.ok(T.stereoDown([x, x], 22050).side < 0.001);
  assert.equal(T.stereoDown([x], 22050), null);
});

// A small MIDI file, written here: tempo 120, key of D major, a melody track (S R G m P - in D),
// a chord track (lower, several notes at once) and a drum track.
function midiFile() {
  const vlq = n => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
  const track = evs => { const body = []; for (const [dt, ...bytes] of evs) body.push(...vlq(dt), ...bytes); body.push(0, 0xff, 0x2f, 0); return [0x4d, 0x54, 0x72, 0x6b, body.length >>> 24, (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255, ...body]; };
  const name = s => [0xff, 0x03, s.length, ...[...s].map(c => c.charCodeAt(0))];
  const meta = track([[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20], [0, 0xff, 0x59, 2, 2, 0], [0, 0xff, 0x58, 4, 4, 2, 24, 8]]);
  const mel = [[0, ...name("Melody")]]; for (const [m, beats] of [[62, 1], [64, 1], [66, 1], [67, 1], [69, 2]]) { mel.push([0, 0x90, m, 90], [beats * 480, 0x80, m, 0]); }
  const chords = [[0, ...name("Piano")], [0, 0xc1, 0]]; for (const c of [[50, 54, 57], [55, 59, 62]]) { c.forEach(m => chords.push([0, 0x91, m, 70])); c.forEach((m, i) => chords.push([i ? 0 : 1440, 0x81, m, 0])); }
  const drums = [[0, ...name("Drums")]]; for (let i = 0; i < 6; i++) drums.push([0, 0x99, 36, 100], [480, 0x89, 36, 0]);
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 4, 0x01, 0xe0];
  return new Uint8Array([...head, ...meta, ...track(mel), ...track(chords), ...track(drums)]);
}

await test("MIDI: the melody track, its exact notes, the key and the tempo", async () => {
  const M = await import("../app/js/midi.js");
  const mf = M.parseMidi(midiFile());
  assert.equal(mf.bpm, 120);
  assert.equal(M.keyTonic(mf.key), 2, "key of D");
  const best = mf.tracks.slice().sort((a, b) => M.melodyScore(b) - M.melodyScore(a))[0];
  assert.equal(best.name, "Melody");
  assert.deepEqual(best.notes.map(n => n.midi), [62, 64, 66, 67, 69]);
  assert.ok(Math.abs(best.notes[4].t0 - 2) < 1e-6 && Math.abs(best.notes[4].t1 - 3) < 1e-6, "times in seconds at 120 BPM");
  assert.equal(M.topLine(mf.tracks.find(t => t.name === "Piano").notes).length, 2, "chords reduce to their top notes");
  const r = T.transcribe(null, null, { notes: best.notes, tonics: [{ pc: 2, score: 1 }], bpm: mf.bpm, phase: 0, sameKey: false, layout: "beats", sub: 2 });
  assert.match(r.notation, /^S R G m \| P - /, r.notation);
  assert.equal(((r.sa % 12) + 12) % 12, 2);
});

await test("notes corrected by ear are used exactly", () => {
  const notes = [{ t0: 0, t1: 0.5, midi: 72 }, { t0: 0.5, t1: 1, midi: 75 }, { t0: 1, t1: 2, midi: 79 }];
  const r = T.transcribe(null, null, { notes, sa: 72, sameKey: false, layout: "phrases", bpm: 120 });
  assert.equal(r.notation.replace(/\s+/g, " ").trim(), "S g P -");
});

await test("notation helpers: beats compress, fit and flute names", () => {
  const notes = [{ t0: 0, t1: 0.6, midi: 72 }, { t0: 0.625, t1: 0.9, midi: 74 }, { t0: 0.9375, t1: 1.2, midi: 76 }];
  const text = T.toNotation(notes, 96, 0, 2, n => n.midi - 72);
  assert.match(text, /^S RG/);
  assert.equal(T.fitOf([-7, 0, 20]).below, 1);
  assert.equal(T.bestOctave([-14, -12, -10]), 12);
  assert.equal(T.fluteLabel(72), "C medium (Sa = C5)");
});

await test("beats that follow a tempo slowing from 120 to 76 BPM keep the bars in place", async () => {
  // Quarter notes and half notes; each note's length shrinks or grows with the tempo where it is.
  const tune = TWINKLE.concat(TWINKLE, TWINKLE), total = tune.reduce((a, [, b]) => a + b, 0);
  let at = 0;
  const slowing = tune.map(([s, b]) => { const bpm = 120 - 44 * (at / total); at += b; return [s, b * 96 / bpm]; });
  const { data, sr } = synth(slowing, { sa: 62, bpm: 96 });
  const tr = await T.pitchTrack(data, sr);
  // The notation as beats, with one note (or "-") a beat: the expected tokens.
  const want = tune.flatMap(([s, b]) => [s, ...new Array(b - 1).fill("-")]);
  const tokensOf = text => text.replace(/[|]/g, " ").split(/\s+/).filter(Boolean).map(t => (t === "-" ? "-" : t === "_" ? "_" : notesOf(t)[0]));
  const score = follow => {
    const r = T.transcribe(tr.track, tr.levels, { sa: 62, sameKey: false, layout: "beats", sub: 1, bpm: 96, follow });
    const got = tokensOf(r.notation).filter(t => t !== "_");
    return { err: errorRate(got, want), r };
  };
  const steady = score(false), followed = score(true);
  console.log("       slowing tempo, beat tokens wrong: steady pulse " + Math.round(steady.err * 100) + "%, following " + Math.round(followed.err * 100) + "%, range " + followed.r.tempoRange);
  assert.ok(followed.err <= 0.1, "following the tempo: " + followed.err + " in " + followed.r.notation);
  assert.ok(followed.err < steady.err, "following beats a steady pulse");
  assert.ok(followed.r.tempoRange[0] <= 86 && followed.r.tempoRange[1] >= 108, "tempo range " + followed.r.tempoRange);
});

await test("tapped beats are used where they were tapped", () => {
  const notes = [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ t0: i * 0.5, t1: i * 0.5 + 0.4, midi: 72 }));
  const grid = T.beatGrid(notes, 120, 0, { taps: [1.02, 1.51, 2.0, 2.52, 3.0] });
  assert.ok(grid.includes(1.51) && grid.includes(2.52), "taps kept");
  assert.ok(grid.some(t => Math.abs(t - 0.5) < 0.05), "beats before the taps continue");
});

await test("a slide (meend) between two notes is written with ~; quick glides are not", async () => {
  const slide = [[4, 2], [2, 2, 0.3], [0, 2], [4, 1], [7, 2, 0.32], [4, 2]];
  const r = await run(slide, { sa: 62, vibrato: 0 }, { sa: 62, sameKey: false, flute: 74 });
  assert.ok(/~R/.test(r.notation) && /~P/.test(r.notation), "slides into R and P: " + r.notation);
  assert.equal((r.notation.match(/~/g) || []).length, 2, r.notation);
  const plain = await run(TWINKLE, { sa: 62 }, { flute: 74 });
  assert.ok(!/~/.test(plain.notation), "no slides in a plain tune: " + plain.notation);
});

await test("the scale: thaat or raga, and odd notes marked", () => {
  const mk = semis => semis.map((s, i) => ({ t0: i * 0.5, t1: i * 0.5 + 0.45, midi: 60 + s }));
  const yaman = T.scaleOf(mk([-1, 2, 4, 6, 7, 9, 11, 12, 11, 9, 7, 6, 4, 2, 0]), 60);
  assert.equal(yaman.name, "Kalyan");
  const bhupali = T.scaleOf(mk([0, 2, 4, 7, 9, 12, 9, 7, 4, 2, 0, 2, 4, 7]), 60);
  assert.deepEqual([bhupali.kind, bhupali.name], ["raga", "Bhupali"]);
  // A major-scale tune with one stray komal Ga (a likely mistake).
  const notes = mk([0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 3, 2, 0, 0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0]);
  const sc = T.scaleOf(notes, 60);
  assert.equal(sc.name, "Bilawal");
  assert.deepEqual(sc.odd, [3]);
  assert.deepEqual(notes.filter(n => n.odd).map(n => n.midi), [63]);
});

await test("the easier version: quick runs fold, high notes come down, passing half-holes go", () => {
  const sa = 72, semiOf = n => n.midi - sa;
  const notes = [[0, 0, 0.5], [2, 0.5, 0.62], [4, 0.62, 0.74], [5, 0.74, 1.4], [3, 1.45, 1.6], [2, 1.6, 2.2], [19, 2.4, 3], [17, 3, 3.5], [16, 3.5, 4]].map(([s, t0, t1]) => ({ t0, t1, midi: sa + s }));
  const e = T.easier(notes, semiOf);
  const semis = e.map(semiOf);
  assert.ok(!semis.includes(4) || !semis.includes(2) || e.length < notes.length, "the quick run folded: " + semis);
  assert.ok(semis.every(s => s <= 16 && s >= -5), "all in the easy range: " + semis);
  assert.ok(!semis.includes(3), "the passing komal Ga became an open note: " + semis);
});

await test("practice: a take is scored note by note", () => {
  const notes = [0, 2, 4, 2].map((semi, i) => ({ t0: i * 0.5, t1: i * 0.5 + 0.45, semi }));
  // Readings every 33 ms: right, an octave up, wrong, silent.
  const played = [0, 14, 5, null], readings = [];
  for (let t = 0; t < 2; t += 0.033) { const k = Math.min(3, Math.floor(t / 0.5)); readings.push({ t, semi: played[k] === null ? null : played[k] + 0.1 }); }
  const sc = T.scoreTake(notes, readings);
  assert.deepEqual(sc.marks, ["right", "octave", "wrong", "missed"]);
  assert.equal(sc.right, 1);
});

console.log("transcribe tests: " + passed + " passed");
