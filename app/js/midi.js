// Standard MIDI files (.mid): read the tracks, their notes in seconds (through every tempo change),
// the key signature and the tempo, and pick the track most likely to be the melody. A MIDI file
// states every note exactly, so its notation is exact; no listening is involved.

function reader(bytes) {
  let p = 0;
  return {
    get pos() { return p; }, set pos(v) { p = v; },
    u8() { return bytes[p++]; },
    u16() { const v = (bytes[p] << 8) | bytes[p + 1]; p += 2; return v; },
    u32() { const v = ((bytes[p] << 24) >>> 0) + (bytes[p + 1] << 16) + (bytes[p + 2] << 8) + bytes[p + 3]; p += 4; return v; },
    str(n) { let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[p + i]); p += n; return s; },
    vlq() { let v = 0, b; do { b = bytes[p++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80 && p < bytes.length); return v; },
  };
}

// General MIDI program names for the track list (a few families are enough to recognise a part).
const FAMILY = ["Piano", "Chromatic percussion", "Organ", "Guitar", "Bass", "Strings", "Ensemble", "Brass", "Reed", "Pipe (flute)", "Synth lead", "Synth pad", "Synth effects", "Ethnic", "Percussive", "Sound effects"];

export function isMidi(bytes) { return bytes.length > 14 && bytes[0] === 0x4d && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64; }

// Returns { tracks: [{ name, program, family, channel, drums, notes: [{ t0, t1, midi, vel }] }], bpm,
// tempoChanges, key: { sf, mi } | null, timeSig: [num, den] | null, duration } or throws an Error.
export function parseMidi(bytes) {
  if (!isMidi(bytes)) throw new Error("This is not a MIDI file.");
  const r = reader(bytes);
  r.str(4); const hl = r.u32(), format = r.u16(), ntrks = r.u16(), division = r.u16();
  r.pos = 8 + hl;
  if (format > 2) throw new Error("This MIDI file's format is not supported.");
  const smpte = division & 0x8000;
  const raw = [], tempos = [];
  let key = null, timeSig = null;
  for (let t = 0; t < ntrks && r.pos < bytes.length - 8; t++) {
    const id = r.str(4), len = r.u32(), end = r.pos + len;
    if (id !== "MTrk") { r.pos = end; continue; }
    const tr = { name: "", program: null, channels: new Set(), events: [] };
    let tick = 0, status = 0;
    while (r.pos < end) {
      tick += r.vlq();
      let b = r.u8();
      if (b === 0xff) {
        const type = r.u8(), l = r.vlq(), at = r.pos;
        if (type === 0x03 && !tr.name) tr.name = r.str(l).replace(/[^\x20-\x7e]/g, "").trim();
        else if (type === 0x51 && l === 3) tempos.push({ tick, us: (bytes[at] << 16) | (bytes[at + 1] << 8) | bytes[at + 2] });
        else if (type === 0x58 && l >= 2 && !timeSig) timeSig = [bytes[at], Math.pow(2, bytes[at + 1])];
        else if (type === 0x59 && l === 2 && !key) key = { sf: (bytes[at] << 24) >> 24, mi: bytes[at + 1] };
        r.pos = at + l;
        if (type === 0x2f) break;
        continue;
      }
      if (b === 0xf0 || b === 0xf7) { r.pos += r.vlq(); continue; }
      if (b & 0x80) status = b; else r.pos--;
      const kind = status & 0xf0, ch = status & 0x0f;
      if (kind === 0xc0 || kind === 0xd0) { const d = r.u8(); if (kind === 0xc0 && tr.program === null) tr.program = d; continue; }
      const d1 = r.u8(), d2 = r.u8();
      if (kind === 0x90 && d2 > 0) { tr.events.push({ tick, on: true, ch, key: d1, vel: d2 }); tr.channels.add(ch); }
      else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) tr.events.push({ tick, on: false, ch, key: d1 });
    }
    r.pos = end;
    raw.push(tr);
  }
  // Ticks to seconds through the tempo map (500000 us per quarter note until the first change).
  tempos.sort((a, b) => a.tick - b.tick);
  const map = [{ tick: 0, us: tempos.length && tempos[0].tick === 0 ? tempos[0].us : 500000, sec: 0 }];
  for (const tc of tempos) {
    const last = map[map.length - 1];
    if (tc.tick === last.tick) { last.us = tc.us; continue; }
    map.push({ tick: tc.tick, us: tc.us, sec: last.sec + (tc.tick - last.tick) * last.us / 1e6 / division });
  }
  const secOf = smpte
    ? tick => tick / ((256 - (division >> 8)) * (division & 0xff))
    : tick => { let m = map[0]; for (const x of map) { if (x.tick <= tick) m = x; else break; } return m.sec + (tick - m.tick) * m.us / 1e6 / division; };
  let duration = 0;
  const tracks = raw.map((tr, i) => {
    const open = new Map(), notes = [];
    for (const e of tr.events) {
      const k = e.ch * 128 + e.key;
      if (e.on) { if (!open.has(k)) open.set(k, []); open.get(k).push(e); }
      else { const q = open.get(k); if (q && q.length) { const s = q.shift(); notes.push({ t0: secOf(s.tick), t1: secOf(e.tick), midi: e.key, vel: s.vel }); } }
    }
    notes.sort((a, b) => a.t0 - b.t0 || b.midi - a.midi);
    if (notes.length) duration = Math.max(duration, notes[notes.length - 1].t1);
    const channel = tr.channels.size ? [...tr.channels][0] : null;
    return { index: i, name: tr.name, program: tr.program, family: tr.program === null ? "" : FAMILY[tr.program >> 3], channel, drums: channel === 9, notes };
  }).filter(t => t.notes.length);
  return { tracks, bpm: Math.round(60e6 / map[0].us), tempoChanges: map.length - 1, key, timeSig, duration };
}

// How likely a track is the melody: one note at a time, in a singing range, with a melody-like
// name ("melody", "vocal", "lead", "flute"...), and enough notes.
export function melodyScore(t) {
  if (t.drums || t.notes.length < 8) return -1;
  let mono = 0;
  for (let i = 1; i < t.notes.length; i++) if (t.notes[i].t0 >= t.notes[i - 1].t1 - 0.03) mono++;
  const share = mono / (t.notes.length - 1), mean = t.notes.reduce((a, n) => a + n.midi, 0) / t.notes.length;
  const named = /melod|vocal|voice|sing|lead|flute|bansuri|tune|main/i.test(t.name) ? 1 : 0;
  return share * 2 + named * 2 + (mean >= 58 && mean <= 86 ? 1 : 0) + Math.min(1, Math.log10(t.notes.length) / 3);
}

// One note at a time: where notes overlap, the higher one is kept (the tune is usually on top).
export function topLine(notes) {
  const out = [];
  for (const n of notes) {
    const p = out[out.length - 1];
    if (p && n.t0 < p.t1 - 0.03) {
      if (n.midi <= p.midi) continue;
      p.t1 = n.t0;
      if (p.t1 - p.t0 < 0.03) out.pop();
    }
    out.push({ ...n });
  }
  return out;
}

// The key signature's tonic as a pitch class (C = 0): Sa for a song in that key.
export function keyTonic(key) {
  if (!key) return null;
  const major = ((key.sf * 7) % 12 + 12) % 12;
  return key.mi ? (major + 9) % 12 : major;
}
