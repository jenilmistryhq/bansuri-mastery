// More lesson step kinds, for the body, breath, sound and ear: breathe (a guided breath), hiss
// (the microphone times an even hiss), firstSound (the microphone tells air, a squeal and a note
// apart, as in L04's table), higherlower (ear) and tapquiz (questions answered on the flute).
import { h, icon } from "../util.js";
import { listenMic } from "../core/listen.js";
import { micIntro, countdown, holdMeter } from "../core/live.js";
import { yin, relSemi } from "../core/pitch.js";
import { ac, click, tanpura, playNote } from "../core/audio.js";
import { fluteSvg } from "./flute.js";
import { ding, playPair } from "./sound.js";

// Open the microphone the way the app's other exercises do (a first-time explanation, then the
// get-ready countdown). Returns the unsubscribe function, or null when it did not start.
async function openMic(host, btn, onReading) {
  if (!(await micIntro(host))) return null;
  if (!(await countdown(host, { btn }))) return null;
  try { return await listenMic(onReading); } catch (e) { return null; }
}

// ---------- Pure parts (tested in tests/lesson.test.mjs) ----------

// A hiss, from microphone levels [{ t, level }]: when it started and stopped (louder than the
// room for longer than a quarter second), how long it lasted, and how even it was (the spread of
// the level in its middle 80%, as a % of the mean: lower is more even).
export function hissResult(frames, floor) {
  const thr = Math.max(0.006, (floor || 0) * 3);
  let start = null, end = null, quietSince = null;
  for (const f of frames) {
    if (f.level > thr) { if (start === null) start = f.t; end = f.t; quietSince = null; continue; }
    if (start === null) continue;
    if (quietSince === null) quietSince = f.t;
    if (f.t - quietSince > 0.4) break;
  }
  if (start === null || end - start < 0.25) return { seconds: 0, spread: null };
  const inside = frames.filter(f => f.t >= start && f.t <= end).map(f => f.level);
  const cut = Math.floor(inside.length * 0.1), mid = inside.slice(cut, inside.length - cut || undefined);
  const mean = mid.reduce((a, b) => a + b, 0) / mid.length;
  const sd = Math.sqrt(mid.reduce((a, b) => a + (b - mean) * (b - mean), 0) / mid.length);
  return { seconds: Math.round((end - start) * 10) / 10, spread: Math.round(sd / mean * 100) };
}

// What one microphone reading says about a first-sound attempt on Sa (L04's table):
// "quiet" (nothing), "air" (sound without a pitch), "squeal" (upper Sa or higher: too much air),
// "note" (Sa), or "other" (a different note: the fingering).
export function soundVerdict(r, target = 0) {
  if (!r || !r.level || r.level < 0.006) return "quiet";
  if (r.semi === null || r.semi === undefined) return "air";
  if (r.near >= target + 10) return "squeal";
  if (r.near === target) return "note";
  return "other";
}
// Taps against the note starts of a written line (seconds): each expected start takes the
// nearest tap within 0.2 s, after a steady device delay (the median offset) is left out.
export function rhythmScore(taps, expected) {
  if (!taps.length) return { hit: 0, of: expected.length, extra: 0, lag: 0 };
  const near = taps.map(t => { let b = Infinity; for (const e of expected) if (Math.abs(t - e) < Math.abs(b)) b = t - e; return b; });
  const lag = near.slice().sort((a, b) => a - b)[near.length >> 1];
  const used = new Set();
  let hit = 0;
  for (const e of expected) {
    let best = -1, d = 0.2;
    taps.forEach((t, i) => { const x = Math.abs(t - lag - e); if (!used.has(i) && x <= d) { d = x; best = i; } });
    if (best >= 0) { used.add(best); hit++; }
  }
  return { hit, of: expected.length, extra: taps.length - used.size, lag: Math.round(lag * 1000) };
}
// Note starts, in beats, of a line written in the course notation for one note: "S" one beat,
// "S -" held, "SS" two in a beat, "SSSS" four, "_" a rest. Returns { onsets, beats }.
export function lineOnsets(text) {
  const beats = text.trim().split(/\s+/).filter(x => x !== "|" && x !== "||");
  const onsets = [];
  beats.forEach((b, i) => { if (b === "-" || b === "_") return; const n = b.length; for (let k = 0; k < n; k++) onsets.push(i + k / n); });
  return { onsets, beats: beats.length };
}
// How far a hummed pitch is from Sa in any octave, in cents (-600..600).
export function centsFromSa(semi) {
  if (semi === null || semi === undefined) return null;
  let c = ((semi % 12) + 12) % 12 * 100;
  if (c > 600) c -= 1200;
  return Math.round(c);
}

const VERDICT = {
  quiet: ["Listening...", "Blow a gentle, steady 'pooh' across the hole for 3-4 seconds."],
  air: ["Only air", "The air misses the edge: roll the flute slightly toward you, or aim a little lower."],
  squeal: ["A squeal", "Too much air, or too fast: use slower, softer air, and open the lips a tiny bit."],
  other: ["A note, but not Sa", "Check the fingering: holes 1-3 closed, 4-6 open, every hole fully covered."],
  note: ["There it is: Sa!", "Hold still and do it again. Find the sweet spot five times."],
};

export const MORE_KINDS = {
  // A guided breath: a circle grows while you breathe in and shrinks while you breathe out.
  // { inhale, exhale, rounds, inText, outText }
  breathe: { make(s, api) {
    let timers = [], round = 0;
    const ball = h("div", { class: "lesson-breath", "aria-hidden": "true" });
    const say = h("p", { class: "lesson-q", "aria-live": "polite" }, "Press Start, then follow the circle.");
    const count = h("span", { class: "lesson-breath-n" });
    const btn = h("button", { type: "button", class: "btn primary" }, "Start");
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const k = window.__lessonTime || 1; // shortened in the browser tests
    function phase(inhale) {
      const secs = inhale ? s.inhale : s.exhale;
      ball.style.transitionDuration = secs + "s";
      ball.classList.toggle("full", inhale);
      say.textContent = inhale ? (s.inText || "Breathe in through the nose: the belly moves out.") : (s.outText || "Breathe out through the mouth: the belly moves back in.");
      for (let i = 0; i < secs; i++) later(() => { count.textContent = String(i + 1); }, i * 1000 * k);
      later(() => {
        if (inhale) return phase(false);
        round++;
        if (round < s.rounds) return phase(true);
        count.textContent = ""; say.textContent = s.done || "Good. That is low breathing."; btn.disabled = false; btn.textContent = "Again";
        ding(true); api.data[s.id] = { rounds: round }; api.save(); api.ready();
        return undefined;
      }, secs * 1000 * k);
      return undefined;
    }
    btn.addEventListener("click", () => { timers.forEach(clearTimeout); timers = []; round = 0; btn.disabled = true; phase(true); });
    return { el: h("div", { class: "stack lesson-center" }, h("div", { class: "lesson-breathwrap" }, ball, count), say, h("p", { class: "small muted" }, s.inhale + " counts in, " + s.exhale + " counts out, " + s.rounds + " times."), btn), destroy() { timers.forEach(clearTimeout); } };
  } },

  // Hiss through the teeth, evenly, for as long as it stays even. The microphone times it.
  // { target (seconds) }
  hiss: { make(s, api) {
    let unsub = null, frames = [], floor = 0, t0 = null, timer = 0, best = (api.data[s.id] || {}).best || 0;
    const secs = h("b", { class: "lesson-timer-n" }, "0.0");
    const bar = h("i");
    const meter = h("div", { class: "lesson-level", "aria-hidden": "true" }, bar);
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" }, "Take a low breath in 4 counts, press Start, then hiss \"sssss\" evenly.");
    const res = h("div");
    const btn = h("button", { type: "button", class: "btn primary big" }, icon("mic"), " Start");
    const stop = () => { if (unsub) { unsub(); unsub = null; } clearInterval(timer); btn.replaceChildren(icon("mic"), " Try again"); };
    function finish() {
      stop();
      const r = hissResult(frames, floor);
      if (r.seconds < 1) { msg.textContent = "No hiss was heard. Hiss a little louder, closer to the microphone."; return; }
      best = Math.max(best, r.seconds);
      api.data[s.id] = { best, spread: r.spread }; api.save();
      const even = r.spread !== null && r.spread <= 35;
      res.replaceChildren(h("div", { class: "lesson-reveal " + (r.seconds >= s.target ? "good" : "warn") },
        h("b", null, r.seconds + " s" + (r.seconds >= s.target ? ": the Week 1 target reached." : ".")),
        h("p", null, (even ? "Even from start to end. " : "It changed in volume: aim for the same hiss from start to end, no burst, no fading. ") + "Best today: " + best + " s. Week 1 target: " + s.target + " s.")));
      msg.textContent = "Rest two normal breaths before the next one.";
      ding(r.seconds >= s.target); api.ready();
    }
    btn.addEventListener("click", async () => {
      if (unsub) { finish(); return; }
      frames = []; t0 = null; floor = 0; res.replaceChildren();
      const u = await openMic(btn.parentElement, btn, r => {
        if (t0 === null) t0 = r.t;
        const t = r.t - t0;
        if (t < 0.5) { floor = Math.max(floor, r.level || 0); return; }
        frames.push({ t, level: r.level || 0 });
        bar.style.width = Math.min(100, (r.level || 0) / 0.08 * 100) + "%";
        const h0 = hissResult(frames, floor);
        secs.textContent = h0.seconds.toFixed(1);
        const last = frames[frames.length - 1], started = h0.seconds > 0;
        if (started && last.level < Math.max(0.006, floor * 3) && frames.filter(f => f.t > last.t - 0.8).every(f => f.level < Math.max(0.006, floor * 3))) finish();
        if (t > 60) finish();
      });
      if (!u) { msg.textContent = "The microphone is not available here."; return; }
      unsub = u; btn.replaceChildren(icon("stop"), " Stop"); msg.textContent = "Hiss now: \"sssss\", the same from start to end.";
    });
    return { el: h("div", { class: "stack lesson-center" }, h("div", { class: "lesson-timer" }, secs, h("span", { class: "small muted" }, "seconds")), meter, msg, h("div", { class: "row" }, btn), res), destroy: stop };
  } },

  // The first sound on Sa, coached live. Done when Sa sounds for half a second, or after a minute
  // of searching (a first sound can take days: L04). { target, giveUp (seconds) }
  firstSound: { make(s, api) {
    let unsub = null, t0 = null, run = 0, last = null, timer = 0, found = false, count = 0, armed = true;
    const target = s.target || 0, times = s.times || 1;
    const tally = h("span", { class: "lesson-tally", hidden: times < 2 });
    const head = h("b", { class: "lesson-verdict" }, "Ready");
    const tip = h("p", { class: "lesson-q", "aria-live": "polite" }, "Close holes 1-3. Press Start, then blow gently across the blowing hole.");
    const clock = h("span", { class: "small muted" });
    const btn = h("button", { type: "button", class: "btn primary big" }, icon("mic"), " Start");
    const box = h("div", { class: "lesson-sound" }, head, tip);
    const got = h("div", { class: "lesson-reveal good", hidden: true }, h("b", null, times > 1 ? "Found it again and again." : "Your first sound on Sa!"), h("p", null, times > 1 ? "That is the skill: finding the sweet spot quickly. It gets faster every day." : "Take the flute away, then find the sweet spot again, quickly. Five times."));
    const showTally = () => { tally.textContent = count + " of " + times; };
    showTally();
    const stop = () => { if (unsub) { unsub(); unsub = null; } clearInterval(timer); btn.replaceChildren(icon("mic"), found ? " Again" : " Start"); };
    btn.addEventListener("click", async () => {
      if (unsub) { stop(); return; }
      t0 = null; run = 0; last = null;
      const u = await openMic(btn.parentElement, btn, r => {
        if (t0 === null) t0 = r.t;
        const v = soundVerdict(r, target);
        if (v === "note") { run += last === null ? 0 : r.t - last; } else run = 0;
        last = r.t;
        box.className = "lesson-sound " + v;
        if (!(v === "note" && !armed && !found)) { head.textContent = VERDICT[v][0]; tip.textContent = VERDICT[v][1]; }
        if (v === "quiet" || v === "air") armed = true; // a break in the note: the next one counts
        if (v === "note" && run >= 0.5 && armed && !found) {
          armed = false; count++; showTally(); ding(true);
          if (count >= times) { found = true; got.hidden = false; api.data[s.id] = { found: true, times: count }; api.save(); api.ready(); }
          else { head.textContent = "Found! Now take the flute away..."; tip.textContent = "Lower it, breathe, then find the sound again."; }
        }
      });
      if (!u) { tip.textContent = "The microphone is not available here. Try with the flute anyway, then go on."; api.ready(); return; }
      unsub = u; btn.replaceChildren(icon("stop"), " Stop");
      const began = Date.now();
      timer = setInterval(() => {
        const sec = Math.round((Date.now() - began) / 1000);
        clock.textContent = sec + " s";
        if (!found && sec >= (s.giveUp || 60) && !api.data[s.id]) {
          api.data[s.id] = { found: false }; api.save(); api.ready();
          clock.textContent = "Not yet? That is normal: the first sound often takes a few days. Rest, then search again tomorrow.";
        }
      }, 1000);
    });
    return { el: h("div", { class: "stack lesson-center" }, box, tally, got, h("div", { class: "row" }, btn), clock), destroy: stop };
  } },

  // Hold a note on the live ring (core/live.js holdMeter), once or several times with a rest
  // between. { target, seconds, cents, times, giveUp }
  hold: { make(s, api) {
    let timer = 0;
    const meter = holdMeter({ targets: Array(s.times || 1).fill(s.target), seconds: s.seconds, cents: s.cents || 30, onPass: () => { api.data[s.id] = { passed: true }; api.save(); api.ready(); } });
    const later = h("button", { type: "button", class: "linkbtn", hidden: true }, "Not yet? Go on, and try again tomorrow");
    later.addEventListener("click", () => { api.data[s.id] = { passed: false }; api.save(); later.hidden = true; api.ready(); });
    timer = setTimeout(() => { later.hidden = false; }, (s.giveUp || 45) * 1000 * (window.__lessonTime || 1));
    return { el: h("div", { class: "stack" }, meter.el, later), destroy() { clearTimeout(timer); meter.destroy(); } };
  } },

  // Hear Sa from the drone, then hum it from memory (in any octave). The drone stops before the
  // microphone listens, so it hears the voice, not the drone. { seconds (to match) }
  hum: { make(s, api) {
    let stream = null, timer = 0, held = 0, last = 0, droneT = 0, fallbackT = 0;
    const needle = h("i", { class: "lv-needle" });
    const bar = h("div", { class: "lv-bar lesson-humbar" }, h("i", { class: "lv-mid" }), needle);
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" }, s.target ? "First listen: the note plays for three seconds." : "First listen: the drone plays Sa for six seconds.");
    const listen = h("button", { type: "button", class: "btn" }, icon("play"), s.target ? " Hear it" : " Hear Sa");
    const hum = h("button", { type: "button", class: "btn primary big", disabled: true }, icon("mic"), " Hum it");
    const done = h("button", { type: "button", class: "linkbtn", hidden: true }, "I hummed it; go on");
    done.addEventListener("click", () => { api.data[s.id] = { matched: false }; api.save(); done.hidden = true; api.ready(); });
    const stopMic = () => { clearInterval(timer); if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } };
    listen.addEventListener("click", () => {
      stopMic();
      if (s.target) { playNote(s.target, 3); msg.textContent = "Listen to the note. Hum it quietly in your head."; }
      else { tanpura.start(); msg.textContent = "Listen to Sa, the low hum under everything. Hum it quietly in your head."; }
      clearTimeout(droneT);
      droneT = setTimeout(() => { if (tanpura.isOn()) tanpura.stop(); hum.disabled = false; msg.textContent = s.target ? "Now hum that note from memory, any octave that is comfortable." : "Now hum that Sa from memory, any octave that is comfortable."; }, (s.target ? 3000 : 6000) * (window.__lessonTime ? 0.1 : 1));
    });
    hum.addEventListener("click", async () => {
      if (stream) { stopMic(); hum.replaceChildren(icon("mic"), " Hum it"); return; }
      if (tanpura.isOn()) tanpura.stop();
      if (!(await micIntro(hum.parentElement))) return;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
      catch (e) { msg.textContent = "The microphone is not available here."; done.hidden = false; return; }
      const c = ac(), src = c.createMediaStreamSource(stream), an = c.createAnalyser();
      an.fftSize = 4096; src.connect(an);
      const buf = new Float32Array(an.fftSize);
      hum.replaceChildren(icon("stop"), " Stop"); held = 0; last = 0;
      clearTimeout(fallbackT); fallbackT = setTimeout(() => { done.hidden = false; }, 20000 * (window.__lessonTime || 1));
      timer = setInterval(() => {
        an.getFloatTimeDomainData(buf);
        let sq = 0; for (let i = 0; i < buf.length; i++) sq += buf[i] * buf[i];
        const y = Math.sqrt(sq / buf.length) > 0.01 ? yin(buf, c.sampleRate, 70, 1000) : null;
        const now = performance.now() / 1000;
        if (!y || !y.f) { held = 0; last = now; needle.className = "lv-needle"; return; }
        const cents = centsFromSa(relSemi(y.f) - (s.target || 0));
        needle.style.left = (50 + Math.max(-50, Math.min(50, cents / 2))) + "%";
        const ok = Math.abs(cents) <= 40;
        needle.className = "lv-needle " + (ok ? "lv-good" : "lv-warn");
        held = ok ? held + (last ? now - last : 0) : 0; last = now;
        msg.textContent = ok ? (s.target ? "That is the note. Hold it..." : "That is Sa. Hold it...") : cents < 0 ? "A little low: slide your hum up." : "A little high: slide your hum down.";
        if (held >= (s.seconds || 2)) {
          stopMic(); hum.replaceChildren(icon("mic"), " Hum it again"); ding(true); done.hidden = true; clearTimeout(fallbackT);
          msg.textContent = s.target ? "Your voice found the note." : "Your voice found Sa. Hearing Sa inside you is what keeps a flute in tune.";
          api.data[s.id] = { matched: true }; api.save(); api.ready();
        }
      }, 60);
    });
    return { el: h("div", { class: "stack lesson-center" }, h("div", { class: "row" }, listen, hum), bar, h("div", { class: "lv-scale small muted lesson-humscale" }, h("span", null, "low"), h("span", null, "Sa"), h("span", null, "high")), msg, done),
      destroy() { stopMic(); clearTimeout(droneT); clearTimeout(fallbackT); if (tanpura.isOn()) tanpura.stop(); } };
  } },

  // Tap written rhythms with a metronome. { bpm, lines: [text] } (course notation on one note).
  rhythm: { make(s, api) {
    let i = 0, taps = [], timers = [], playing = false, results = [];
    const bpm = s.bpm || 60, gap = 60 / bpm * (window.__lessonTime ? 0.1 : 1); // faster in the browser tests
    const show = h("div", { class: "lesson-line mono", "aria-live": "polite" });
    const pad = h("button", { type: "button", class: "lesson-pad", disabled: true }, "Tap");
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" });
    const start = h("button", { type: "button", class: "btn primary" }, "Start");
    const lights = h("div", { class: "lesson-lights", "aria-hidden": "true" }, [0, 1, 2, 3].map(() => h("i")));
    const flash = k => { const l = lights.children[k % 4]; l.classList.add("on"); timers.push(setTimeout(() => l.classList.remove("on"), 140)); };
    const line = () => lineOnsets(s.lines[i]);
    function showLine() {
      show.replaceChildren(...s.lines[i].trim().split(/\s+/).map(b => h("span", { class: "lesson-beat" }, b)));
      msg.textContent = "Line " + (i + 1) + " of " + s.lines.length + ". Four clicks count you in; tap each note as it starts. Hold a note through its \"-\"; tap nothing on a \"_\".";
    }
    start.addEventListener("click", () => {
      if (playing) return;
      const c = ac(), t0 = c.currentTime + 0.3, L = line();
      timers.forEach(clearTimeout); timers = []; taps = []; playing = true;
      for (let k = 0; k < 4 + L.beats; k++) { const t = t0 + k * gap; click(t, k === 4 ? "sam" : k < 4 ? "khali" : "tick"); timers.push(setTimeout(() => flash(k), (t - c.currentTime) * 1000)); }
      const first = t0 + 4 * gap, expected = L.onsets.map(b => first + b * gap);
      L.onsets.forEach((b, k) => timers.push(setTimeout(() => { const el = show.children[Math.floor(b)]; if (el) el.classList.add("now"); }, (expected[k] - c.currentTime) * 1000)));
      pad.disabled = false; start.disabled = true;
      timers.push(setTimeout(() => {
        playing = false; pad.disabled = true; start.disabled = false;
        show.querySelectorAll(".now").forEach(x => x.classList.remove("now"));
        const r = rhythmScore(taps, expected);
        results[i] = r;
        const good = r.hit >= r.of - 1 && r.extra <= 1;
        ding(good);
        msg.textContent = (good ? "In time: " : "") + r.hit + " of " + r.of + " notes on time" + (r.extra ? ", " + r.extra + " extra taps." : ".") + (good ? "" : " Try it again, or go on.");
        if (i < s.lines.length - 1) { start.textContent = "Next line"; if (good) { i++; timers.push(setTimeout(showLine, 1200)); start.textContent = "Start"; } else start.textContent = "Again"; }
        else { start.textContent = "Again"; api.data[s.id] = { lines: results.map(x => x && x.hit + "/" + x.of) }; api.save(); api.ready(); }
        if (!good && i < s.lines.length - 1) { const skip = h("button", { type: "button", class: "linkbtn" }, "Next line"); skip.addEventListener("click", () => { i++; skip.remove(); showLine(); start.textContent = "Start"; }); msg.append(" ", skip); }
      }, (first + L.beats * gap - c.currentTime + 0.4) * 1000));
    });
    const tap = () => { if (!pad.disabled) { taps.push(ac().currentTime); pad.classList.add("hit"); setTimeout(() => pad.classList.remove("hit"), 90); } };
    pad.addEventListener("pointerdown", e => { e.preventDefault(); tap(); });
    pad.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); tap(); } });
    showLine();
    return { el: h("div", { class: "stack lesson-center" }, show, lights, pad, msg, h("div", { class: "row" }, start)), destroy() { timers.forEach(clearTimeout); } };
  } },

  // Two notes: is the second higher, lower or the same? { rounds, pass }
  higherlower: { make(s, api) {
    let i = 0, right = 0, pair = null, answered = true, streak = 0;
    const rnd = Math.random;
    const score = h("p", { class: "small muted" });
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" }, "Press Play: two notes. Is the second higher, lower or the same?");
    const play = h("button", { type: "button", class: "btn primary big" }, icon("play"), " Play");
    const answers = h("div", { class: "lesson-chips" }, ["Higher", "Lower", "Same"].map(a => {
      const b = h("button", { type: "button", class: "lesson-chip", disabled: true }, a);
      b.addEventListener("click", () => {
        if (answered) return;
        answered = true; i++;
        const want = pair[1] > pair[0] ? "Higher" : pair[1] < pair[0] ? "Lower" : "Same";
        const ok = a === want;
        if (ok) { right++; streak++; } else streak = 0;
        ding(ok);
        // Whole sentences, so each translates as one.
        msg.textContent = ok ? { Higher: "Right: higher.", Lower: "Right: lower.", Same: "Right: the same." }[want]
          : { Higher: "It was higher. Listen again: press Play.", Lower: "It was lower. Listen again: press Play.", Same: "It was the same note. Listen again: press Play." }[want];
        score.textContent = right + " of " + i + " right";
        answers.querySelectorAll("button").forEach(x => { x.disabled = true; });
        if (i >= s.rounds) {
          api.data[s.id] = { right, of: i }; api.save(); api.ready();
          msg.textContent = (right >= s.pass ? "Your ear already hears pitch: " : "A good start: ") + right + " of " + i + ". The same ear will tune your flute.";
          play.replaceChildren(icon("reset"), " Play again"); i = 0; right = 0;
        } else play.replaceChildren(icon("play"), " Next pair");
      });
      return b;
    }));
    play.addEventListener("click", () => {
      if (answered) { const p = [0, 2, 4, 5, 7, 9][Math.floor(rnd() * 6)]; const gap = rnd() < 0.15 ? 0 : (streak < 4 ? 3 : 1) + Math.floor(rnd() * 4); pair = [p, p + (rnd() < 0.5 ? -gap : gap)]; answered = false; }
      playPair(pair[0], pair[1]);
      answers.querySelectorAll("button").forEach(x => { x.disabled = false; });
      msg.textContent = "Higher, lower or the same?";
    });
    return { el: h("div", { class: "stack lesson-center" }, play, msg, answers, score) };
  } },

  // Questions answered by tapping the flute. { questions: [{ q, answer (part id), why }], side }
  tapquiz: { make(s, api) {
    let k = 0, slips = 0;
    const ask = h("p", { class: "lesson-q", "aria-live": "polite" });
    const note = h("p", { class: "small muted" });
    const setAsk = () => ask.replaceChildren(h("span", null, "Tap the hole for:"), " ", h("b", { "data-part": s.questions[k].answer }, s.questions[k].q));
    const fl = fluteSvg({ side: s.side ? s.side() : "right", numbers: true, onTap: id => {
      if (k >= s.questions.length) return;
      const q = s.questions[k];
      if (id === q.answer) {
        fl.mark(id, "fl-found"); ding(true); k++;
        note.textContent = q.why || "";
        if (k < s.questions.length) setAsk();
        else { ask.textContent = slips ? "All placed. Check your own hands against the flute now." : "All placed, first time. Now check your own hands against it."; api.data[s.id] = { slips }; api.save(); api.ready(); }
      } else { slips++; ding(false); note.textContent = "Not that hole. Holes are numbered from the blowing-hole end."; }
    } });
    setAsk();
    return { el: h("div", { class: "stack" }, h("div", { class: "lesson-flute" }, fl.el), ask, note) };
  } },
};

