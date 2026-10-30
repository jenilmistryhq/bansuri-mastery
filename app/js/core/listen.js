// Live listening: one shared microphone turned into pitch readings, and the pure logic the
// interactive exercises build on (steady holds, note sequences, tap timing). The logic takes
// readings as plain objects { t, semi, near, cents }, so it is unit-tested without a microphone.
import { ac } from "./audio.js";
import { yin, relSemi } from "./pitch.js";

let micShared = null, micPending = null, micMuteUntil = 0;

// While the app itself plays a note (a reference, a phrase to echo), the microphone would hear it.
// Readings are suppressed until the given audio time.
export function muteListening(untilAudioTime) { micMuteUntil = Math.max(micMuteUntil, untilAudioTime); }

async function openMic() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("unavailable");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const c = ac(), src = c.createMediaStreamSource(stream), an = c.createAnalyser();
  an.fftSize = 2048; src.connect(an);
  const m = { stream, src, an, buf: new Float32Array(an.fftSize), subs: new Set(), hist: [], timer: 0 };
  // An interval, not animation frames, so listening continues while the page scrolls or redraws.
  m.stats = { frames: 0, voiced: 0, ms: 0, sampleRate: c.sampleRate, peak: 0 };
  m.timer = setInterval(() => {
    const t = c.currentTime, t0 = performance.now();
    let r = { t, semi: null, near: null, cents: null, f: 0, level: 0 };
    if (t >= micMuteUntil) {
      an.getFloatTimeDomainData(m.buf);
      let sq = 0; for (let i = 0; i < m.buf.length; i++) sq += m.buf[i] * m.buf[i];
      const level = Math.sqrt(sq / m.buf.length);
      r.level = level;
      const y = yin(m.buf, c.sampleRate);
      if (y && y.clarity > 0.85) {
        m.hist.push(relSemi(y.f)); if (m.hist.length > 5) m.hist.shift();
        const semi = m.hist.slice().sort((a, b) => a - b)[m.hist.length >> 1], near = Math.round(semi);
        r = { t, semi, near, cents: Math.round((semi - near) * 100), f: y.f, level, clarity: y.clarity };
        m.stats.voiced++;
      } else m.hist = [];
      m.stats.frames++; m.stats.peak = Math.max(m.stats.peak, level);
      m.stats.ms += performance.now() - t0;
    } else m.hist = [];
    m.subs.forEach(fn => { try { fn(r); } catch (e) { /* one listener must not stop the others */ } });
  }, 33);
  return m;
}

// What the open microphone has measured so far (for the diagnostics page), or null.
export function micStats() {
  if (!micShared) return null;
  const st = micShared.stats, tr = micShared.stream.getAudioTracks()[0], set = tr && tr.getSettings ? tr.getSettings() : {};
  return { frames: st.frames, voiced: st.voiced, msPerFrame: st.frames ? st.ms / st.frames : 0, sampleRate: st.sampleRate, peak: st.peak, device: tr ? tr.label : "", settings: set };
}

// listenMic(fn) calls fn about 30 times a second with a reading ({ semi: null } when no clear note).
// Resolves to an unsubscribe function; the microphone closes when the last listener leaves.
export async function listenMic(fn) {
  if (!micShared) {
    if (!micPending) micPending = openMic().then(m => { micShared = m; micPending = null; return m; }, e => { micPending = null; throw e; });
    await micPending;
  }
  const m = micShared;
  m.subs.add(fn);
  let off = false;
  return () => {
    if (off) return; off = true;
    m.subs.delete(fn);
    if (!m.subs.size && micShared === m) {
      clearInterval(m.timer);
      try { m.src.disconnect(); } catch (e) { /* already disconnected */ }
      m.stream.getTracks().forEach(tr => tr.stop());
      micShared = null;
    }
  };
}

// Tracks one steady held note. target: a semitone (relative to Sa) the note must match within
// +/- cents, or null for "any steady note". A dropout shorter than gap seconds does not break the hold.
export function holdTracker(opts) {
  const o = Object.assign({ target: null, seconds: 8, cents: 25, gap: 0.3 }, opts || {});
  let start = null, last = null, anchor = null, n = 0, best = 0, done = false;
  return {
    feed(r) {
      const playable = r && r.semi !== null && r.semi > -7.5 && r.semi < 26.5;
      let ok = false;
      if (playable) {
        if (o.target !== null && o.target !== undefined) ok = Math.abs(r.semi - o.target) * 100 <= o.cents;
        else ok = anchor === null || Math.abs(r.semi - anchor) * 100 <= o.cents;
      }
      if (ok) {
        if (start === null) { start = r.t; anchor = r.semi; n = 1; }
        else if (o.target === null || o.target === undefined) { n++; anchor += (r.semi - anchor) / Math.min(n, 30); }
        last = r.t;
      } else if (start !== null && r && r.t - last > o.gap) { start = null; anchor = null; }
      const held = start === null ? 0 : last - start;
      best = Math.max(best, held);
      if (held >= o.seconds) done = true;
      return { held, best, done, ok, reading: r };
    },
    reset() { start = null; last = null; anchor = null; best = 0; done = false; },
  };
}

// Turns the reading stream into notes: a note is reported once, after it has sounded steadily
// for minDur seconds within +/- tol cents of a semitone. A repeated note is a new note when there
// is a break, or when the volume dips and comes back (a tongued repeat: "G G G"). Short dropouts
// (under 0.1 s) inside a note are ignored.
export function noteSequencer(opts) {
  const o = Object.assign({ minDur: 0.18, tol: 45 }, opts || {});
  let run = null, runStart = 0, lastSeen = 0, emitted = false, peak = 0, dipped = false;
  return {
    feed(r) {
      const level = r && r.level ? r.level : 0;
      const cand = r && r.near !== null && Math.abs(r.cents) <= o.tol && r.semi > -7.5 && r.semi < 26.5 ? r.near : null;
      if (cand === null) {
        if (run !== null && level && level < peak * 0.4) dipped = true;
        if (run !== null && r.t - lastSeen > 0.1) run = null;
        return null;
      }
      lastSeen = r.t;
      if (cand !== run) { run = cand; runStart = r.t; emitted = false; peak = level; dipped = false; return null; }
      if (level) {
        if (emitted && level < peak * 0.4) dipped = true;
        else if (dipped && level > peak * 0.7) { dipped = false; runStart = r.t; emitted = false; peak = level; }
        peak = Math.max(peak * 0.995, level);
      }
      if (!emitted && r.t - runStart >= o.minDur) { emitted = true; return { semi: run, t0: runStart }; }
      return null;
    },
    reset() { run = null; emitted = false; dipped = false; },
  };
}

// Compares played notes to the expected ones, in order. Each result is "ok", "octave" (right
// note, wrong octave) or "wrong".
export function judgeNote(played, expected) {
  if (played === expected) return "ok";
  return ((played - expected) % 12 + 12) % 12 === 0 ? "octave" : "wrong";
}

// The notes a listener can tell apart: repeated notes (G G G) merge into one, because a tongued
// repeat on the flute has no pitch break to detect.
export function distinctNotes(semis) { return semis.filter((s, i) => i === 0 || s !== semis[i - 1]); }

// Follows one pass through a phrase: each played note fills the next slot. Wrong notes use up a
// slot, so the learner sees exactly where the phrase went wrong. A repeated note (G G) that was not
// heard as two notes is accepted when the next, different note arrives, because a soft tongued
// repeat can be too smooth to detect.
export function phraseMatcher(expected) {
  const exp = expected.slice(), marks = exp.map(() => null);
  let pos = 0;
  return {
    expected: exp,
    feed(semi) {
      // Skip an unheard repeat only when this note is exactly the next different note of the phrase;
      // anything else is judged against the repeat it replaces.
      if (pos > 0 && pos < exp.length && exp[pos] === exp[pos - 1] && marks[pos - 1] === "ok" && semi !== exp[pos]) {
        let j = pos; while (j < exp.length && exp[j] === exp[pos - 1]) j++;
        if (j < exp.length && semi === exp[j]) while (pos < j) { marks[pos] = "ok"; pos++; }
      }
      if (pos >= exp.length) return this.state();
      marks[pos] = judgeNote(semi, exp[pos]); pos++;
      return this.state();
    },
    // Only repeats of the last note remain: count them, as the learner has stopped playing.
    completeRepeats() {
      while (pos > 0 && pos < exp.length && exp[pos] === exp[pos - 1] && marks[pos - 1] === "ok") { marks[pos] = "ok"; pos++; }
      return this.state();
    },
    onlyRepeatsLeft() { return pos > 0 && pos < exp.length && marks[pos - 1] === "ok" && exp.slice(pos).every(x => x === exp[pos - 1]); },
    state() { return { pos, marks: marks.slice(), done: pos >= exp.length, clean: pos >= exp.length && marks.every(m => m === "ok") }; },
  };
}

// The device's tap delay in ms (touch screen plus audio output), measured by the tap calibration.
export function tapLatency(v) {
  try {
    if (v === undefined) return Number(localStorage.getItem("bansuri.live.latency")) || 0;
    localStorage.setItem("bansuri.live.latency", String(Math.round(v)));
  } catch (e) { /* storage unavailable */ }
  return v || 0;
}

// Whether the tap delay has been measured on this device (a measured 0 ms counts).
export function tapCalibrated() {
  try { return localStorage.getItem("bansuri.live.latency") !== null; } catch (e) { return false; }
}

// Results of the listening exercises go out as a "bansuri:live" event; the app records them, the
// standalone bench simply has no listener.
export function emitLive(detail) {
  try { if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent("bansuri:live", { detail })); } catch (e) { /* no DOM */ }
}

// Timing of taps against a beat. offsets: milliseconds, negative = early.
// Returns { n, mean, spread, within } (within = share of taps inside +/- 50 ms) or null.
export function tapStats(offsets) {
  const v = (offsets || []).filter(x => Number.isFinite(x));
  if (!v.length) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const spread = Math.sqrt(v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / v.length);
  return { n: v.length, mean: Math.round(mean), spread: Math.round(spread), within: v.filter(x => Math.abs(x) <= 50).length / v.length };
}

// Advice for a held note that is off pitch, in the course's own terms (L07, L17).
export function pitchAdvice(cents) {
  if (cents === null || cents === undefined) return "";
  if (cents < -15) return "A little flat: blow slightly faster, or roll the flute out a touch.";
  if (cents > 15) return "A little sharp: slow the air, or roll the flute in a touch.";
  return "In tune. Keep it steady.";
}
