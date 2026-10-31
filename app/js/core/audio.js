// Web Audio engine: synthesised flute voice, clicks, and a four-string tanpura.
import { getSettings, onSettings, saHz } from "./settings.js";
import { hzOf } from "./theory.js";

let audioCtx = null, masterGain = null, noiseBuffer = null;
const liveVoices = new Set();

export function ac() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    // A browser without Web Audio: a clear error the app turns into one message, not a crash.
    if (!AC) throw new Error("audio unavailable: this browser cannot play sound");
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = getSettings().volume;
    masterGain.connect(audioCtx.destination);
    const len = audioCtx.sampleRate * 2;
    noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

export function master() { ac(); return masterGain; }

onSettings(s => { if (masterGain) masterGain.gain.value = s.volume; });

// opts.ctx and opts.dest render into another context (an OfflineAudioContext, to save a file).
const noiseFor = new WeakMap();
function noiseOf(c) {
  if (!noiseFor.has(c)) {
    const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseFor.set(c, b);
  }
  return noiseFor.get(c);
}

export function makeVoice(freq, t, opts) {
  opts = opts || {};
  const c = opts.ctx || ac(), level = opts.level || 0.26;
  const out = c.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(level, t + 0.05);
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = Math.min(10000, freq * 6);
  // A bansuri-like voice: a strong fundamental with weak overtones (stronger on low notes), breath
  // noise around the fundamental and the second harmonic, a short breathy "chiff" at the start, a slight
  // scoop up into the pitch, and vibrato that fades in rather than starting at once.
  // opts.breath scales the breath noise (1 = normal); opts.wobble adds a slow unsteadiness, in cents.
  const breath = opts.breath === undefined ? 1 : opts.breath;
  const parts = [[1, 1], [2, freq < 700 ? 0.2 : 0.09], [3, freq < 700 ? 0.06 : 0.03], [4, 0.02]];
  const oscs = parts.map(([h, a]) => {
    const o = c.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(freq * h * 0.985, t); o.frequency.exponentialRampToValueAtTime(freq * h, t + 0.06);
    const g = c.createGain(); g.gain.value = a * (opts.body === undefined ? 1 : opts.body); o.connect(g); g.connect(lp); o.start(t);
    return { o, h };
  });
  const lfo = c.createOscillator(); lfo.frequency.value = opts.andolan ? 1.2 : 5.2;
  const lg = c.createGain(); lfo.connect(lg);
  if (opts.andolan) lg.gain.value = 38;
  else { lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(5, t + 0.5); }
  oscs.forEach(({ o }) => lg.connect(o.detune)); lfo.start(t);
  const wob = c.createOscillator(); wob.frequency.value = 0.9;
  const wg = c.createGain(); wg.gain.value = opts.wobble || 0; wob.connect(wg);
  oscs.forEach(({ o }) => wg.connect(o.detune)); wob.start(t);
  const ns = c.createBufferSource(); ns.buffer = opts.ctx ? noiseOf(c) : noiseBuffer; ns.loop = true;
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq * 2; bp.Q.value = 0.9;
  const ng = c.createGain(); ng.gain.value = (freq < 650 ? 0.05 : 0.03) * breath;
  ns.connect(bp); bp.connect(ng); ng.connect(out);
  const bp1 = c.createBiquadFilter(); bp1.type = "bandpass"; bp1.frequency.value = freq; bp1.Q.value = 4;
  const ng1 = c.createGain(); ng1.gain.value = 0.05 * breath;
  ns.connect(bp1); bp1.connect(ng1); ng1.connect(out);
  // Broadband air: what makes a weak embouchure sound breathy (only above normal breath).
  if (breath > 1) {
    const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 700;
    const ga = c.createGain(); ga.gain.value = 0.045 * (breath - 1);
    ns.connect(hp); hp.connect(ga); ga.connect(out);
  }
  const bpc = c.createBiquadFilter(); bpc.type = "bandpass"; bpc.frequency.value = 2600; bpc.Q.value = 0.8;
  const gc = c.createGain(); gc.gain.setValueAtTime(0.0001, t); gc.gain.exponentialRampToValueAtTime(0.09 * Math.max(0.5, breath), t + 0.012); gc.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  ns.connect(bpc); bpc.connect(gc); gc.connect(out);
  ns.start(t);
  lp.connect(out); out.connect(opts.dest || masterGain);
  let stopped = false, endAt = Infinity;
  const voice = {
    ramp(from, to, at, dur) { oscs.forEach(({ o, h }) => { o.frequency.cancelScheduledValues(at); o.frequency.setValueAtTime(from * h, at); o.frequency.exponentialRampToValueAtTime(to * h, at + dur); }); },
    jump(from, to, at, k) { oscs.forEach(({ o, h }) => { o.frequency.cancelScheduledValues(at); o.frequency.setValueAtTime(from * h, at); o.frequency.setValueAtTime(from * h, at + k - 0.012); o.frequency.exponentialRampToValueAtTime(to * h, at + k); }); },
    glideNow(f) {
      const now = c.currentTime;
      oscs.forEach(({ o, h }) => o.frequency.setTargetAtTime(f * h, now, 0.014));
      bp.frequency.setTargetAtTime(f * 2, now, 0.02);
      lp.frequency.setTargetAtTime(Math.min(10000, f * 6), now, 0.02);
    },
    stop(at) {
      at = Math.max(at === undefined ? c.currentTime : at, c.currentTime);
      if (stopped) {
        // Already scheduled to end (a sequenced note): a stop that comes sooner cuts it short.
        // Oscillators can only be stopped once, so fade the output and disconnect it instead.
        if (at >= endAt) return;
        endAt = at;
        out.gain.cancelScheduledValues(0);
        out.gain.setValueAtTime(Math.min(out.gain.value, level), at);
        out.gain.setTargetAtTime(0.0001, at, 0.015);
        setTimeout(() => { out.disconnect(); liveVoices.delete(voice); }, Math.max(0, (at - c.currentTime) * 1000) + 150);
        return;
      }
      stopped = true; endAt = at;
      out.gain.setTargetAtTime(0.0001, at, 0.03);
      const end = at + 0.4; oscs.forEach(({ o }) => o.stop(end)); lfo.stop(end); wob.stop(end); ns.stop(end);
      setTimeout(() => liveVoices.delete(voice), Math.max(0, (end - c.currentTime) * 1000) + 50);
    }
  };
  if (!opts.ctx) liveVoices.add(voice);
  return voice;
}

// ---------- Synthesised tabla ----------
// A simple model of the two drums: the dayan (right, tuned to Sa an octave below the flute) rings
// with harmonic overtones; the bayan (left, bass) is a low tone whose pitch rises with palm pressure.
// Each bol of a theka maps to one or two strokes. It is a practice aid, not a recording.
function tablaNoise(c) {
  const len = Math.floor(c.sampleRate * 0.05), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  return buf;
}
let tablaNoiseBuf = null, tablaOut = null;
// All strokes go through one bus with a limiter, so an accented sam (both drums at once) cannot clip.
// The tabla's own volume (0-1), so it can sit under the flute and the tanpura.
let tablaLevel = 0.85;
export function setTablaLevel(x) { tablaLevel = Math.max(0, Math.min(1, Number(x))); if (tablaOut) tablaOut.gain.value = tablaLevel; }

function tablaBus() {
  const c = ac();
  if (!tablaOut) {
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -3; lim.knee.value = 2; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
    tablaOut = c.createGain(); tablaOut.gain.value = tablaLevel;
    tablaOut.connect(lim); lim.connect(masterGain);
  }
  return tablaOut;
}
function dayan(t, gain, decay, bright) {
  const c = ac(), f = saHz() / 2;
  const out = c.createGain(); out.connect(tablaBus());
  out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(gain, t + 0.004); out.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  [[1, 1], [2, bright ? 0.7 : 0.35], [3, bright ? 0.45 : 0.15], [4, bright ? 0.25 : 0.05]].forEach(([h, a]) => {
    const o = c.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(f * h, t);
    const g = c.createGain(); g.gain.value = a; o.connect(g); g.connect(out); o.start(t); o.stop(t + decay + 0.05);
  });
  if (!tablaNoiseBuf) tablaNoiseBuf = tablaNoise(c);
  const n = c.createBufferSource(); n.buffer = tablaNoiseBuf;
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3200; bp.Q.value = 0.8;
  const ng = c.createGain(); ng.gain.value = gain * (bright ? 0.5 : 0.25);
  n.connect(bp); bp.connect(ng); ng.connect(tablaBus()); n.start(t);
}
// The bayan's fundamental (about 80-110 Hz) is below what phone and laptop speakers reproduce, so
// each stroke also has overtones and a short attack in the range small speakers can play.
function bayan(t, gain, open) {
  const c = ac(), bus = tablaBus();
  if (!tablaNoiseBuf) tablaNoiseBuf = tablaNoise(c);
  if (open) {
    const g = c.createGain(); g.connect(bus);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    [[1, 1.1], [2, 0.5], [3, 0.3], [4.2, 0.12]].forEach(([h, a]) => {
      const o = c.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(78 * h, t); o.frequency.exponentialRampToValueAtTime(112 * h, t + 0.12); o.frequency.exponentialRampToValueAtTime(100 * h, t + 0.5);
      const og = c.createGain(); og.gain.value = a; o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.6);
    });
    const n = c.createBufferSource(); n.buffer = tablaNoiseBuf;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 700; bp.Q.value = 1.2;
    const ng = c.createGain(); ng.gain.value = gain * 0.6;
    n.connect(bp); bp.connect(ng); ng.connect(bus); n.start(t);
  } else {
    // Closed stroke (Ka, Ki, Kat): a flat-palm slap, short and dry.
    const n = c.createBufferSource(); n.buffer = tablaNoiseBuf;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1100; bp.Q.value = 0.9;
    const ng = c.createGain(); ng.gain.setValueAtTime(gain * 2.2, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    n.connect(bp); bp.connect(ng); ng.connect(bus); n.start(t);
    const o = c.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.06);
    const og = c.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(gain, t + 0.003); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(og); og.connect(bus); o.start(t); o.stop(t + 0.1);
  }
}
const STROKES = {
  dha: (t, a) => { dayan(t, 0.32 * a, 0.45, true); bayan(t, 0.5 * a, true); },
  dhin: (t, a) => { dayan(t, 0.3 * a, 0.7, false); bayan(t, 0.5 * a, true); },
  dhi: (t, a) => { dayan(t, 0.28 * a, 0.55, false); bayan(t, 0.45 * a, true); },
  ge: (t, a) => bayan(t, 0.5 * a, true), ghe: (t, a) => bayan(t, 0.5 * a, true),
  na: (t, a) => dayan(t, 0.3 * a, 0.4, true),
  ta: (t, a) => dayan(t, 0.28 * a, 0.3, true),
  tin: (t, a) => dayan(t, 0.26 * a, 0.65, false),
  tu: (t, a) => dayan(t, 0.3 * a, 0.8, false),
  ti: (t, a) => dayan(t, 0.18 * a, 0.07, true), te: (t, a) => dayan(t, 0.18 * a, 0.07, true), ra: (t, a) => dayan(t, 0.15 * a, 0.06, true),
  ki: (t, a) => bayan(t, 0.35 * a, false), ka: (t, a) => bayan(t, 0.4 * a, false), ke: (t, a) => bayan(t, 0.4 * a, false), kat: (t, a) => bayan(t, 0.45 * a, false),
};
// Beats can also be seen and felt (for learners who cannot hear the click well): onBeat(fn) gets
// "sam", "tali", "khali" or "tick" at the moment each beat sounds.
const beatFns = new Set();
export function onBeat(fn) { beatFns.add(fn); return () => beatFns.delete(fn); }
function beatAt(t, kind) {
  if (!beatFns.size) return;
  const c = ac(), ms = Math.max(0, (t - c.currentTime) * 1000);
  setTimeout(() => beatFns.forEach(fn => { try { fn(kind); } catch (e) { /* ignore */ } }), ms);
}

// Play one bol (e.g. "Dha", "DhaGe", "TiRaKiTa") spread across one beat starting at time t.
export function tablaBol(t, bol, beatSeconds, accent) {
  beatAt(t, accent ? "sam" : "tick");
  const syl = (bol || "").match(/[A-Z][a-z]*/g) || [];
  const step = beatSeconds / Math.max(1, syl.length);
  syl.forEach((s, i) => { const f = STROKES[s.toLowerCase()] || STROKES.na; f(t + i * step, accent ? 1.3 : 1); });
}

// dest: optional node to play into (a sequence's own bus, so stopping it silences its clicks).
export function click(t, kind, dest) {
  const c = ac(), to = dest || masterGain;
  beatAt(t, kind || "tick");
  const g = c.createGain(); g.connect(to);
  const o = c.createOscillator(); o.type = "triangle";
  // Every beat must be clearly audible on phone and laptop speakers; sam and tali stand out by
  // their extra bass stroke, khali by its lower, hollow tone.
  const spec = { sam: [1700, 0.55], tali: [1300, 0.45], khali: [700, 0.4], tick: [1100, 0.32] }[kind] || [1100, 0.32];
  o.frequency.value = spec[0]; g.gain.setValueAtTime(spec[1], t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  o.connect(g); o.start(t); o.stop(t + 0.09);
  if (kind === "sam" || kind === "tali") {
    const b = c.createOscillator(); b.type = "sine"; const bg = c.createGain(); bg.connect(to);
    b.frequency.setValueAtTime(kind === "sam" ? 140 : 190, t); b.frequency.exponentialRampToValueAtTime(70, t + 0.25);
    bg.gain.setValueAtTime(kind === "sam" ? 0.7 : 0.35, t); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    b.connect(bg); b.start(t); b.stop(t + 0.32);
  }
}

// The four tone levels of the L08 rubric, demonstrated on Sa: 1 = mostly air, 4 = full and clear.
export const TONE_LEVELS = { 1: { breath: 18, wobble: 25, body: 0.25 }, 2: { breath: 10, wobble: 20, body: 0.45 }, 3: { breath: 3.5, wobble: 15, body: 0.85 }, 4: { breath: 0.6, wobble: 0, body: 1 } };
export function toneDemo(level, seconds) {
  const c = ac(), t = c.currentTime + 0.05, p = TONE_LEVELS[level] || TONE_LEVELS[4];
  const v = makeVoice(hzOf(0), t, p); v.stop(t + (seconds || 3));
  return v;
}

export function playNote(semi, dur) {
  const c = ac(), t = c.currentTime + 0.02;
  const v = makeVoice(hzOf(semi), t);
  v.stop(t + (dur || 0.9));
  return v;
}

export function stopAll() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  Array.from(liveVoices).forEach(v => v.stop(now));
}

// Karplus-Strong plucked string with a soft clip for a buzzy tanpura tone.
function pluckBuffer(freq, secs) {
  const c = ac(), sr = c.sampleRate, len = Math.floor(sr * secs), buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const N = Math.max(2, Math.round(sr / freq)), ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const a = ring[idx], b = ring[(idx + 1) % N];
    ring[idx] = 0.5 * (a + b) * 0.9994;
    d[i] = Math.tanh(a * 1.8) * 0.45;
    idx = (idx + 1) % N;
  }
  return buf;
}

export const tanpura = (() => {
  const st = { on: false, timer: null, next: 0, step: 0, bufs: null, key: "", gain: null, first: "pa", speed: 1, level: 0.55 };
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => { try { fn(st.on); } catch (e) { /* ignore */ } });
  function bufs() {
    const base = saHz() / 4, key = st.first + ":" + base.toFixed(2);
    if (st.key !== key) {
      const r = { pa: 1.5, ma: 4 / 3, ni: 15 / 8 }[st.first] || 1.5;
      st.bufs = [pluckBuffer(base * r, 5), pluckBuffer(base * 2, 5), pluckBuffer(base * 2 * 1.0015, 5), pluckBuffer(base, 6)];
      st.key = key;
    }
    return st.bufs;
  }
  function tick() {
    const c = ac(), gaps = [0.75, 0.62, 0.62, 1.35].map(g => g / st.speed);
    while (st.next < c.currentTime + 0.25) {
      const src = c.createBufferSource(); src.buffer = bufs()[st.step];
      const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200;
      src.connect(lp); lp.connect(st.gain); src.start(st.next);
      st.next += gaps[st.step]; st.step = (st.step + 1) % 4;
    }
  }
  return {
    start() {
      if (st.on) return;
      const c = ac();
      st.gain = c.createGain(); st.gain.gain.value = st.level * 0.9; st.gain.connect(masterGain);
      st.on = true; st.next = c.currentTime + 0.1; st.step = 0; bufs();
      st.timer = setInterval(tick, 60); tick(); emit();
    },
    stop() {
      if (!st.on) return;
      st.on = false; clearInterval(st.timer);
      if (st.gain) {
        const g = st.gain, c = ac();
        g.gain.setTargetAtTime(0.0001, c.currentTime, 0.08);
        setTimeout(() => g.disconnect(), 700);
        st.gain = null;
      }
      emit();
    },
    isOn() { return st.on; },
    setFirst(k) { st.first = k; st.key = ""; },
    setSpeed(x) { st.speed = Math.max(0.3, Math.min(2, Number(x) || 1)); },
    setLevel(x) { st.level = Math.max(0, Math.min(1, Number(x))); if (st.gain) st.gain.gain.value = st.level * 0.9; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
})();
