// Sargam notation in the curriculum's ASCII form: parse, time, analyse and play.
import { SEMI, fingOf, lessonFor, hzOf } from "./theory.js";
import { ac, master, makeVoice, click } from "./audio.js";

export const PRESETS = [
  ["Sa long tones (Day 0, L07)", "S - - - _ _ S - - - _ _ S - - -"],
  ["Fingering tour: register 1", ".P - .D - .N - S - R - G - M - _ - m - - -"],
  ["Fingering tour: octave pairs (L14)", ".P - P - | .D - D - | .N - N - | S - S' - ||"],
  ["Bilawal (major) scale (L16)", "S R G m P D N S' | S' N D P m G R S ||"],
  ["Kalyan scale (L14)", "S R G M P D N S' | S' N D P M G R S ||"],
  ["Two-octave scale (L22)", ".P .D .N S R G m P D N S' R' G' - - - | G' R' S' N D P m G R S .N .D .P - - - ||"],
  ["Chromatic scale (L25)", "S r R g G m M P d D n N S' - - - ||"],
  ["Alankar 1, Version A (L12)", ".P .D S R G - - - | G R S .D .P - - - ||"],
  ["Alankar 3, Version A (L12)", ".P .D S .D S R S R G | G R S R S .D S .D .P ||"],
  ["Alankar 10, Version A (L12)", ".P .D S .D .P .D S R S .D S R G R S | G R S R G R S .D S R S .D .P .D S ||"],
  ["Hot Cross Buns (EX-MEL 1.2)", "G R S - | G R S - | SS SS RR RR | G R S - ||"],
  ["Evening Lamp (EX-MEL 2.1, original)", "S - R  | G - R  ||\nS - .N | .D - - ||\n.D .N S | R - G ||\nR S .N | S - -  ||"],
  ["Mary Had a Little Lamb (EX-MEL 3.1)", "G R S R | G G G - | R R R - | G P P - |\nG R S R | G G G G | R R G R | S - - - ||"],
  ["Twinkle Twinkle (EX-MEL 4.1)", "S S P P | D D P - | m m G G | R R S - |\nP P m m | G G R - | P P m m | G G R - |\nS S P P | D D P - | m m G G | R R S - ||"],
  ["Ode to Joy (EX-MEL 4.2)", "G G m P | P m G R | S S R G | G -R R - ||\nG G m P | P m G R | S S R G | R -S S - ||"],
  ["Jingle Bells chorus (EX-MEL 4.3)", "G G G - | G G G - | G P S R | G - - - |\nm m m m | m G G GG | G R R G | R - P - ||"],
  ["Happy Birthday (EX-MEL 4.4, rhythm approx.)", ".P.P | .D .P S | .N - .P.P | .D .P R | S - .P.P |\nP G S | .N .D mm | G S R | S - - ||"],
  ["Raga Bhupali: aroh, avroh, pakad (L20)", "S R G P D S' - - | S' D P G R S - - ||\nG R S .D S R G, P G, D P G R S - - ||"],
  ["Raga Yaman: aroh, avroh, pakad (L21)", ".N R G M D N S' - | S' N D P M G R S ||\n.N R G R, .N R S, P M G R, .N R S - - ||"],
  ["Raga Durga: aroh, avroh (card)", "S R m P D S' - - | S' D P m R S - - ||"],
  ["Meend demo (L23)", "G~R - S - | R~S - .N - | S - - - ||"],
  ["Kan demo (L24)", "{G}R - {R}S - | {S}.N - S - ||"],
  ["Tihai, worked example 1 (L32): start on beat 7", "G R S - | G R S - | G R S ||"]
];

function noteAt(str, i) {
  let low = 0; while (str[i] === ".") { low++; i++; }
  const L = str[i]; if (!(L in SEMI)) return null; i++;
  let high = 0; while (str[i] === "'") { high++; i++; }
  return { semi: SEMI[L] + 12 * (high - low), next: i };
}

export function parseNotation(text) {
  const tokens = [], skipped = [];
  String(text || "").split(/\s+/).filter(Boolean).forEach(raw => {
    if (/^\|+$/.test(raw)) { tokens.push({ type: "bar", text: raw }); return; }
    if (raw === ",") { tokens.push({ type: "breath", text: "," }); return; }
    if (!/^[.SrRgGmMPdDnN'\-_{}~()^,|]+$/.test(raw)) { skipped.push(raw); tokens.push({ type: "skip", text: raw }); return; }
    const items = []; let i = 0, kan = null, glide = false, breathAfter = false;
    while (i < raw.length) {
      const ch = raw[i];
      if (ch === "{") {
        const j = raw.indexOf("}", i);
        const k = noteAt(j > i ? raw.slice(i + 1, j) : "", 0);
        kan = k ? k.semi : null; i = j > i ? j + 1 : raw.length; continue;
      }
      if (ch === "(" || ch === ")" || ch === "|") { i++; continue; }
      if (ch === "~") { glide = true; i++; continue; }
      if (ch === "-") { items.push({ hold: true }); i++; continue; }
      if (ch === "_") { items.push({ rest: true }); i++; continue; }
      if (ch === "^") { for (let k = items.length - 1; k >= 0; k--) if (items[k].semi !== undefined) { items[k].andolan = true; break; } i++; continue; }
      if (ch === ",") { breathAfter = true; i++; continue; }
      const n = noteAt(raw, i);
      if (!n) { i++; continue; }
      items.push({ semi: n.semi, kan, glide }); kan = null; glide = false; i = n.next;
    }
    if (items.length) tokens.push({ type: "beat", text: raw, items, breathAfter });
    else if (breathAfter) tokens.push({ type: "breath", text: raw });
    else tokens.push({ type: "bar", text: raw });
  });
  return { tokens, skipped };
}

// ev[i] = { semi, start, dur, kan, from, andolan, ti } with times in seconds.
// beats[i] = { t, ti, down } where down marks the first beat of a bar (from the | bar lines).
// barLen is the usual number of beats per bar. A short first bar is a pickup, so its first beat
// is not a downbeat (Happy Birthday starts on the upbeat).
export function buildEvents(tokens, bpm) {
  const beat = 60 / (Number(bpm) || 72), ev = [], beats = [];
  let t = 0, cur = null, prev = null, afterBar = true;
  const bars = []; let n = 0;
  tokens.forEach(tk => { if (tk.type === "beat") n++; else if (tk.type === "bar" && n) { bars.push(n); n = 0; } });
  if (n) bars.push(n);
  const count = {}; bars.forEach(b => { count[b] = (count[b] || 0) + 1; });
  const barLen = bars.length > 1 ? Number(Object.keys(count).sort((a, b) => count[b] - count[a] || b - a)[0]) : 0;
  const pickup = bars.length > 1 && bars[0] < barLen;
  tokens.forEach((tk, ti) => {
    if (tk.type === "bar") { afterBar = true; return; }
    if (tk.type === "breath") { if (cur) { cur.dur = Math.max(0.06, cur.dur - 0.12); cur = null; } return; }
    if (tk.type !== "beat") return;
    const down = afterBar && !(pickup && beats.length === 0);
    afterBar = false;
    const sub = beat / tk.items.length;
    tk.items.forEach((it, k) => {
      const st = t + k * sub;
      if (it.hold) { if (cur) cur.dur += sub; }
      else if (it.rest) { cur = null; }
      else {
        cur = { semi: it.semi, start: st, dur: sub, kan: it.kan, from: it.glide && prev !== null ? prev : null, andolan: !!it.andolan, ti };
        ev.push(cur); prev = it.semi;
      }
    });
    if (tk.breathAfter && cur) { cur.dur = Math.max(0.06, cur.dur - 0.12); cur = null; }
    beats.push({ t, ti, down: barLen ? down : beats.length === 0 }); t += beat;
  });
  return { ev, total: t, beats, barLen: barLen || 4 };
}

// fit: "ok" (within .P..G'), "ceiling" (above G', up to M'), "reg3" (above M'), "below" (under .P).
export function analyzeRange(ev) {
  if (!ev || !ev.length) return null;
  const kans = ev.filter(e => e.kan !== null && e.kan !== undefined).map(e => e.kan);
  const notes = [...new Set(ev.map(e => e.semi).concat(kans))].sort((a, b) => a - b);
  const lo = notes[0], hi = notes[notes.length - 1];
  const fit = lo < -5 ? "below" : hi > 18 ? "reg3" : hi > 16 ? "ceiling" : "ok";
  const halves = notes.filter(s => { const f = fingOf(s).f; return !!f && f.includes("H"); });
  const lesson = Math.max(...notes.map(lessonFor));
  const last = ev[ev.length - 1];
  return { lo, hi, fit, halves, lesson, notes, seconds: last.start + last.dur };
}

// Schedules the events; returns a stop() function, with stop.setClick(on) to switch the beat
// click on or off while playing and stop.t0 (the audio time the music starts). opts: { bpm, click,
// countIn (beats, played only with the click), mute (no melody: the learner plays it), onNote(e), onEnd() }.
export function playEvents(ev, beats, opts) {
  opts = opts || {};
  const c = ac(), beatS = 60 / (Number(opts.bpm) || 72);
  const countIn = opts.click && opts.countIn ? opts.countIn : 0;
  // opts.at: an exact audio time to start (a loop continuing on the beat); otherwise just after now.
  const tStart = opts.at ? Math.max(opts.at, c.currentTime + 0.02) : c.currentTime + 0.25, t0 = tStart + countIn * beatS, voices = [], timers = [];
  ev.forEach(e => {
    const f = hzOf(e.semi), at = t0 + e.start;
    if (opts.onNote) timers.push(setTimeout(() => opts.onNote(e), Math.max(0, (at - c.currentTime) * 1000)));
    if (opts.mute) return;
    let v;
    if (e.kan !== null && e.kan !== undefined) {
      const k = Math.min(0.08, e.dur * 0.3);
      v = makeVoice(hzOf(e.kan), at, { andolan: e.andolan }); v.jump(hzOf(e.kan), f, at, k);
    } else if (e.from !== null && e.from !== undefined) {
      v = makeVoice(hzOf(e.from), at, { andolan: e.andolan }); v.ramp(hzOf(e.from), f, at, Math.max(0.08, e.dur * 0.7));
    } else {
      v = makeVoice(f, at, { andolan: e.andolan });
    }
    v.stop(at + e.dur - 0.01); voices.push(v);
  });
  // Clicks are always scheduled, into their own bus, so the click can be switched on mid-piece.
  const clickBus = c.createGain(); clickBus.gain.value = opts.click ? 1 : 0; clickBus.connect(master());
  for (let i = 0; i < countIn; i++) click(tStart + i * beatS, i === 0 ? "sam" : "tick", clickBus);
  (beats || []).forEach(bt => click(t0 + bt.t, bt.down ? "sam" : "tick", clickBus));
  if (opts.onCount && countIn) for (let i = 0; i < countIn; i++) timers.push(setTimeout(() => opts.onCount(countIn - i), Math.max(0, (tStart + i * beatS - c.currentTime) * 1000)));
  const lastEnd = ev.length ? ev[ev.length - 1].start + ev[ev.length - 1].dur : 0;
  const total = beats ? Math.max(lastEnd, beats.length * beatS) : lastEnd;
  timers.push(setTimeout(() => { if (opts.onEnd) opts.onEnd(); }, (t0 - c.currentTime + total) * 1000 + 300));
  let stopped = false;
  const stop = function () {
    if (stopped) return; stopped = true;
    const now = c.currentTime;
    voices.forEach(v => v.stop(now)); timers.forEach(clearTimeout);
    clickBus.disconnect();
  };
  stop.t0 = t0;
  stop.setClick = on => { if (!stopped) clickBus.gain.setTargetAtTime(on ? 1 : 0, c.currentTime, 0.01); };
  return stop;
}
