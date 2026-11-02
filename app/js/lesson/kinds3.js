// Lesson step kinds for listening and judging: judge (which of two sounds is better, and why:
// the L08 rubric made audible), rubric (score yourself, then one keep and one fix) and order
// (put notes in order by ear, each tap sounding its note).
import { h, icon } from "../util.js";
import { ac, makeVoice, TONE_LEVELS, playCurve, master, tablaBol } from "../core/audio.js";
import { hzOf, codeOf } from "../core/theory.js";
import { ding } from "./sound.js";

// A held Sa (or another note) of a tone level (1 airy .. 4 clear), off by some cents.
function sound({ semi = 0, level = 4, cents = 0, seconds = 2.2, seq = null, dur = 0.5, gap = 0, crisp = false }, at = 0) {
  try {
    const c = ac(), t = c.currentTime + 0.05 + at;
    if (seq) {
      if (!gap) {
        // Slurred: one breath, only the pitch changes.
        const v = makeVoice(hzOf(seq[0]), t, TONE_LEVELS[level]);
        seq.forEach((n, i) => { if (i) v.ramp(hzOf(seq[i - 1]), hzOf(n), t + i * dur - 0.012, 0.012); });
        v.stop(t + seq.length * dur);
      } else {
        // Separated: each note its own start; a tongued start is crisper (less breath, no scoop).
        seq.forEach((n, i) => { const at2 = t + i * dur; const v = makeVoice(hzOf(n), at2, crisp ? { breath: 0.3, body: 1 } : TONE_LEVELS[3]); v.stop(at2 + dur - gap); });
      }
      return;
    }
    const v = makeVoice(hzOf(semi) * Math.pow(2, cents / 1200), t, TONE_LEVELS[level] || TONE_LEVELS[4]);
    v.stop(t + seconds);
  } catch (e) { /* audio unavailable */ }
}

// Shuffle that never returns the list in its own order (so there is something to do).
function shuffled(list) {
  let a = list.slice();
  for (let k = 0; k < 10; k++) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (a.some((x, i) => x !== list[i])) break;
  }
  return a;
}

// The taals of L15: beats, and the marks at section starts (X sam, 2 and 3 tali: clap; 0 khali: wave).
export const TAALS = {
  keherwa: { beats: 8, marks: { 1: "X", 5: "0" }, bols: "Dha Ge Na Ti Na Ka Dhi Na".split(" ") },
  dadra: { beats: 6, marks: { 1: "X", 4: "0" }, bols: "Dha Dhi Na Dha Ti Na".split(" ") },
  teentaal: { beats: 16, marks: { 1: "X", 5: "2", 9: "0", 13: "3" }, bols: "Dha Dhin Dhin Dha Dha Dhin Dhin Dha Dha Tin Tin Ta Ta Dhin Dhin Dha".split(" ") },
};
// Clap or wave on each marked beat: [{ beat (1..n), act: "clap"|"wave" }] for one cycle.
export const taalActions = name => Object.entries(TAALS[name].marks).map(([b, m]) => ({ beat: Number(b), act: m === "0" ? "wave" : "clap" }));
// Presses [{ t, act }] against the expected [{ t, act }] (seconds): each expected one takes the
// nearest unused press of the same kind within 0.3 s. Returns { hit, of, wrong }.
export function clapScore(presses, expected) {
  const used = new Set();
  let hit = 0;
  for (const e of expected) {
    let best = -1, d = 0.3;
    presses.forEach((p, i) => { const x = Math.abs(p.t - e.t); if (!used.has(i) && p.act === e.act && x <= d) { d = x; best = i; } });
    if (best >= 0) { used.add(best); hit++; }
  }
  return { hit, of: expected.length, wrong: presses.length - used.size };
}

// Beats per second between two notes a few cents apart (at Sa's frequency).
export const beatRate = (cents, hz) => Math.abs(hz * (Math.pow(2, cents / 1200) - 1));

// The half-hole: the note for a hole 1 covered by a fraction (1 = closed: Ga; 0 = open: tivra
// Ma). Shuddha Ma sits where the cover equals the flute's own sweet spot (about half).
export function halfHoleSemi(cover, sweet, lo = 4, hi = 6) {
  // Piecewise: from open (hi) to the sweet spot (the half-hole note, between), then to closed (lo).
  const mid = (lo + hi) / 2;
  return cover <= sweet ? hi - (hi - mid) * cover / sweet : mid - (mid - lo) * (cover - sweet) / (1 - sweet);
}

export const LISTEN_KINDS = {
  // Slide a finger across hole 1 and hear Ga glide up to tivra Ma; find shuddha Ma by the cents
  // readout. The sweet spot differs from flute to flute (40-60%): the tuner decides, not the eye.
  halfhole: { make(s, api) {
    let v = null, held = 0, timer = 0;
    const sweet = 0.4 + Math.random() * 0.2;
    const NS = "http://www.w3.org/2000/svg";
    const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, x] of Object.entries(attrs)) e.setAttribute(k, String(x)); return e; };
    const svg = svgEl("svg", { viewBox: "0 0 200 120", class: "lesson-half", "aria-hidden": "true" });
    svg.append(svgEl("rect", { x: 0, y: 20, width: 200, height: 80, rx: 40, class: "fl-body" }), svgEl("circle", { cx: 100, cy: 60, r: 26, class: "fl-hole" }));
    const pad = svgEl("rect", { x: 40, y: 22, width: 90, height: 76, rx: 36, class: "fl-pad", style: "opacity:1" });
    svg.append(pad);
    const slider = h("input", { type: "range", min: "0", max: "100", step: "1", value: s.mode === "slide" ? "0" : "100", "aria-label": s.mode === "slide" ? "How much of the hole is covered" : "How much of hole 1 is covered", class: "lesson-slider" });
    const name = h("b", { class: "lesson-note" }, "G");
    const cents = h("span", { class: "small muted" });
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" }, s.mode === "slide" ? "Press Play, then slide your finger slowly across the hole, all the way." : "Press Play, then slide your finger off the hole, slowly.");
    const play = h("button", { type: "button", class: "btn primary" }, icon("play"), " Play");
    const slide = s.mode === "slide", lo = s.closed === undefined ? 4 : s.closed, hi = s.open === undefined ? 6 : s.open;
    const mid = (lo + hi) / 2, midName = s.midName || "shuddha Ma";
    const semi = () => (slide ? hi - (hi - lo) * Number(slider.value) / 100 : halfHoleSemi(Number(slider.value) / 100, sweet, lo, hi));
    let path = [];
    const draw = () => {
      const cover = Number(slider.value) / 100, x = semi();
      pad.setAttribute("x", String(-16 + 71 * cover)); // centred on the hole when covered; clear of it when open
      if (slide) {
        name.textContent = cover >= 0.97 ? codeOf(lo) : cover <= 0.03 ? codeOf(hi) : codeOf(hi) + " ~ " + codeOf(lo);
        cents.textContent = Math.round(cover * 100) + "% covered";
        // A meend: from open to covered (or back), slowly (over 1.2 s or more), with no jumps.
        const t = performance.now() / 1000;
        path.push({ t, c: cover });
        path = path.filter(p => t - p.t < 6);
        const start = path.findIndex(p => p.c <= 0.03), end = path.length - 1;
        if (v && !api.data[s.id] && cover >= 0.97 && start >= 0 && path[end].t - path[start].t >= 1.2 * (window.__lessonTime ? 0.05 : 1)) {
          const steps = path.slice(start).every((p, k, a) => !k || p.c - a[k - 1].c <= 0.25);
          if (steps) { ding(true); msg.textContent = "A meend: " + codeOf(hi) + " melted into " + codeOf(lo) + ", through every pitch between."; api.data[s.id] = { slid: true }; api.save(); api.ready(); }
          else msg.textContent = "That was a jump. Slower: the glide is the journey.";
        }
      } else {
        const near = Math.round(x), c = Math.round((x - mid) * 100);
        name.textContent = codeOf(Math.abs(x - mid) < 0.5 ? mid : near <= lo ? lo : hi);
        cents.textContent = (c > 0 ? "+" : "") + c + " cents from " + midName;
      }
      if (v) v.setPitch(hzOf(x));
    };
    const stop = () => { clearInterval(timer); if (v) { v.voice.stop(ac().currentTime + 0.05); v = null; } play.replaceChildren(icon("play"), " Play"); };
    play.addEventListener("click", () => {
      if (v) { stop(); return; }
      const c = ac(), t = c.currentTime + 0.02, voice = makeVoice(hzOf(semi()), t);
      voice.stop(t + 60);
      let last = hzOf(semi());
      v = { voice, setPitch(f) { const now = ac().currentTime; voice.ramp(last, f, now, 0.06); last = f; } };
      play.replaceChildren(icon("stop"), " Stop");
      timer = setInterval(() => {
        if (slide) return;
        held = Math.abs(semi() - mid) <= 0.1 ? held + 0.2 : 0;
        if (held >= 1 && !api.data[s.id]) { ding(true); msg.textContent = midName === "shuddha Ma" ? "Shuddha Ma: about " + Math.round(sweet * 100) + "% covered on this flute. On yours, the tuner decides." : "Found: about " + Math.round(sweet * 100) + "% covered on this flute. On yours, the tuner decides."; api.data[s.id] = { sweet: Math.round(sweet * 100) }; api.save(); api.ready(); }
      }, 200);
    });
    slider.addEventListener("input", draw);
    draw();
    return { el: h("div", { class: "stack lesson-center" }, svg, h("label", { class: "lesson-sliderwrap" }, slider, h("span", { class: "small muted lesson-humscale" }, h("span", null, "open"), h("span", null, "covered"))), name, cents, msg, play), destroy: stop };
  } },

  // Keep a taal with the hands: the tabla plays its theka round a beat clock; clap on sam and
  // tali, wave on khali. The last cycle can be silent: keep the count inside and land on sam.
  // { taal, bpm, cycles, silent (last cycles without the tabla) }
  clapwave: { make(s, api) {
    const T = TAALS[s.taal], n = T.beats, cycles = s.cycles || 3, silent = s.silent || 0;
    const gap = 60 / (s.bpm || 60) * (window.__lessonTime ? 0.25 : 1);
    let presses = [], timers = [], running = false;
    const dots = h("div", { class: "lesson-taal", style: "--n:" + n, "aria-hidden": "true" }, Array.from({ length: n }, (_, i) => {
      const m = T.marks[i + 1];
      return h("span", { class: "lesson-taalbeat" + (m ? " mark" : "") + (m === "0" ? " khali" : ""), style: "--i:" + i }, m || "");
    }));
    const bol = h("b", { class: "lesson-bol", "aria-live": "off" }, "");
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" }, "Press Start. Clap on X, 2 and 3; wave on 0. Count the other beats on your fingers.");
    const clap = h("button", { type: "button", class: "btn big lesson-act", disabled: true }, "Clap");
    const wave = h("button", { type: "button", class: "btn big lesson-act", disabled: true }, "Wave");
    const start = h("button", { type: "button", class: "btn primary" }, "Start");
    const press = act => { if (running) presses.push({ t: ac().currentTime, act }); };
    clap.addEventListener("click", () => press("clap"));
    wave.addEventListener("click", () => press("wave"));
    start.addEventListener("click", () => {
      if (running) return;
      running = true; presses = []; start.disabled = true; clap.disabled = wave.disabled = false;
      const c = ac(), t0 = c.currentTime + 0.4, expected = [];
      for (let cy = 0; cy < cycles; cy++) {
        const quiet = cy >= cycles - silent;
        for (let b = 0; b < n; b++) {
          const t = t0 + (cy * n + b) * gap;
          if (!quiet) tablaBol(t, T.bols[b], gap, b === 0);
          if (T.marks[b + 1]) expected.push({ t, act: T.marks[b + 1] === "0" ? "wave" : "clap" });
          timers.push(setTimeout(() => {
            dots.querySelectorAll(".now").forEach(x => x.classList.remove("now"));
            dots.children[b].classList.add("now");
            bol.textContent = quiet ? (b === 0 ? "?" : "") : T.bols[b];
            if (quiet && b === 0 && cy === cycles - silent) msg.textContent = "Silent now: keep counting, and clap on sam.";
          }, (t - c.currentTime) * 1000));
        }
      }
      // The sam after the last cycle closes the round: arriving there counts too.
      const end = t0 + cycles * n * gap;
      expected.push({ t: end, act: "clap" });
      timers.push(setTimeout(() => {
        running = false; start.disabled = false; start.textContent = "Again"; clap.disabled = wave.disabled = true;
        dots.querySelectorAll(".now").forEach(x => x.classList.remove("now")); bol.textContent = "";
        const r = clapScore(presses, expected), good = r.hit >= r.of - 1 && r.wrong <= 2;
        ding(good);
        msg.textContent = (good ? "In the cycle: " : "") + r.hit + " of " + r.of + " claps and waves in place" + (r.wrong ? ", " + r.wrong + " extra." : ".") + (good ? "" : " Try again: say the beats aloud.");
        api.data[s.id] = { hit: r.hit, of: r.of }; api.save(); api.ready();
      }, (end - c.currentTime + 0.6) * 1000));
    });
    return { el: h("div", { class: "stack lesson-center" }, h("div", { class: "lesson-taalwrap" }, dots, bol), msg, h("div", { class: "row" }, clap, wave), start), destroy() { timers.forEach(clearTimeout); running = false; } };
  } },

  // Air speed and the octave: the same fingering, slow air gives the low note, faster and
  // narrower air flips it up an octave (the second register). { note (semitones, register 1) }
  overblow: { make(s, api) {
    let v = null, cur = null, flips = 0, timer = 0;
    const low = s.note === undefined ? -5 : s.note;
    const slider = h("input", { type: "range", min: "0", max: "100", step: "1", value: "20", "aria-label": "Air speed", class: "lesson-slider" });
    const name = h("b", { class: "lesson-note" }, "-");
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" }, "Press Blow, then slide the air speed up, slowly.");
    const blow = h("button", { type: "button", class: "btn primary" }, icon("play"), " Blow");
    const reg = () => (Number(slider.value) >= 60 ? 2 : 1);
    const play = () => {
      const r = reg(), semi = r === 2 ? low + 12 : low, c = ac(), t = c.currentTime + 0.02;
      if (v) v.stop(t + 0.04);
      v = makeVoice(hzOf(semi), t, { breath: 1 + Number(slider.value) / 25 });
      v.stop(t + 30);
      name.textContent = codeOf(semi);
      if (cur && cur !== r) { flips++; msg.textContent = r === 2 ? "Flip! Same fingers, an octave higher: the second register." : "Back down: slower, warmer air, the low note."; }
      if (flips >= 2 && !api.data[s.id]) { ding(true); api.data[s.id] = { flips }; api.save(); api.ready(); }
      cur = r;
    };
    const stop = () => { clearInterval(timer); if (v) { v.stop(ac().currentTime + 0.05); v = null; } cur = null; blow.replaceChildren(icon("play"), " Blow"); };
    blow.addEventListener("click", () => { if (v) { stop(); return; } play(); blow.replaceChildren(icon("stop"), " Stop"); });
    slider.addEventListener("input", () => { if (v && reg() !== cur) play(); });
    return { el: h("div", { class: "stack lesson-center" }, name, h("label", { class: "lesson-sliderwrap" }, slider, h("span", { class: "small muted lesson-humscale" }, h("span", null, "slow, warm air"), h("span", null, "fast, narrow air"))), msg, blow), destroy: stop };
  } },

  // Two notes together: one is Sa, the other can be slid. Off by a little, they "beat" (wah-wah);
  // the closer, the slower, until it stops. { start (cents), hold (seconds still) }
  beats: { make(s, api) {
    let nodes = null, cents = s.start || -30, still = 0, timer = 0;
    const hz = hzOf(0);
    const rate = h("b", { class: "lesson-timer-n" }, "-");
    const label = h("span", { class: "small muted" });
    const slider = h("input", { type: "range", min: "-50", max: "50", step: "1", value: String(cents), "aria-label": "Your note", class: "lesson-slider" });
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" }, "Press Play, then slide your note until the wah-wah stops.");
    const play = h("button", { type: "button", class: "btn primary" }, icon("play"), " Play");
    const set = () => {
      label.textContent = cents === 0 ? "on Sa" : (cents > 0 ? "+" : "") + cents + " cents";
      rate.textContent = beatRate(cents, hz).toFixed(1);
      if (nodes) nodes.b.frequency.setTargetAtTime(hz * Math.pow(2, cents / 1200), ac().currentTime, 0.03);
    };
    const stop = () => { clearInterval(timer); if (nodes) { const t = ac().currentTime; nodes.g.gain.setTargetAtTime(0, t, 0.05); const n = nodes; setTimeout(() => { n.a.stop(); n.b.stop(); }, 300); nodes = null; } play.replaceChildren(icon("play"), " Play"); };
    play.addEventListener("click", () => {
      if (nodes) { stop(); return; }
      const c = ac(), g = c.createGain(); g.gain.value = 0; g.connect(master());
      const a = c.createOscillator(), b = c.createOscillator();
      a.type = b.type = "sine"; a.frequency.value = hz; b.frequency.value = hz * Math.pow(2, cents / 1200);
      a.connect(g); b.connect(g); a.start(); b.start(); g.gain.setTargetAtTime(0.18, c.currentTime, 0.05);
      nodes = { a, b, g }; play.replaceChildren(icon("pause"), " Stop");
      timer = setInterval(() => {
        still = Math.abs(cents) <= 2 ? still + 0.2 : 0;
        if (still >= (s.hold || 1.5) && !api.data[s.id]) { ding(true); msg.textContent = "Still. No beats: the two notes are one. That is what in tune sounds like."; api.data[s.id] = { found: true }; api.save(); api.ready(); }
      }, 200);
    });
    slider.addEventListener("input", () => { cents = Number(slider.value); set(); if (Math.abs(cents) > 2 && api.data[s.id]) msg.textContent = "Hear the beats come back as you move away?"; });
    set();
    return { el: h("div", { class: "stack lesson-center" }, h("div", { class: "lesson-timer" }, rate, h("span", { class: "small muted" }, "beats a second")), h("label", { class: "lesson-sliderwrap" }, slider, label), msg, play), destroy: stop };
  } },

  // Hear a held note and name what went wrong (or not). { rounds: [{ curve: [{ t, semi }], options: [{ text, right, why }] }] }
  curves: { make(s, api) {
    let i = 0, right = 0, missed = false;
    const tally = h("p", { class: "small muted" });
    const q = h("p", { class: "lesson-q" }, "What does this long tone do?");
    const play = h("button", { type: "button", class: "btn primary" }, icon("play"), " Play");
    const opts = h("div", { class: "lesson-options" });
    const out = h("div");
    play.addEventListener("click", () => playCurve(s.rounds[i].curve, 1));
    function show() {
      missed = false; q.textContent = s.rounds[i].q || s.q || "What does this long tone do?"; tally.textContent = "Round " + (i + 1) + " of " + s.rounds.length; out.replaceChildren();
      opts.replaceChildren(...s.rounds[i].options.map(op => {
        const b = h("button", { type: "button", class: "lesson-option" }, op.text);
        b.addEventListener("click", () => {
          if (!op.right) { missed = true; b.classList.add("wrong"); b.disabled = true; ding(false); out.replaceChildren(h("div", { class: "lesson-reveal warn" }, h("b", null, "Listen again."), h("p", null, op.why || "Play it again and follow the pitch."))); return; }
          if (!missed) right++;
          b.classList.add("right"); opts.querySelectorAll("button").forEach(x => { x.disabled = true; }); ding(true);
          const last = i === s.rounds.length - 1;
          const next = last ? null : h("button", { type: "button", class: "btn" }, "Next one");
          if (next) next.addEventListener("click", () => { i++; show(); });
          out.replaceChildren(...[h("div", { class: "lesson-reveal good" }, h("b", null, "Right."), h("p", null, op.why)), next].filter(Boolean));
          if (last) { api.data[s.id] = { right, of: s.rounds.length }; api.save(); api.ready(); }
        });
        return b;
      }));
    }
    show();
    return { el: h("div", { class: "stack lesson-center" }, tally, q, play, opts, out) };
  } },

  // Two sounds, A and B: which is better on one point? { rounds: [{ q, a, b, right: "a"|"b", why }] }
  // a and b: { semi, level, cents }.
  judge: { make(s, api) {
    let i = 0, right = 0, answered = false;
    const q = h("p", { class: "lesson-q" });
    const out = h("div");
    const tally = h("p", { class: "small muted" });
    const playA = h("button", { type: "button", class: "btn" }, icon("play"), " A");
    const playB = h("button", { type: "button", class: "btn" }, icon("play"), " B");
    const both = h("button", { type: "button", class: "btn primary" }, icon("play"), " A, then B");
    const pickA = h("button", { type: "button", class: "lesson-chip" }, "A");
    const pickB = h("button", { type: "button", class: "lesson-chip" }, "B");
    const r = () => s.rounds[i];
    function show() {
      answered = false; q.textContent = r().q; out.replaceChildren();
      tally.textContent = "Round " + (i + 1) + " of " + s.rounds.length;
      [pickA, pickB].forEach(b => { b.disabled = false; b.classList.remove("picked"); });
    }
    playA.addEventListener("click", () => sound(r().a));
    playB.addEventListener("click", () => sound(r().b));
    const len = x => (x.seq ? x.seq.length * (x.dur || 0.5) : x.seconds || 2.2);
    both.addEventListener("click", () => { sound(r().a); sound(r().b, len(r().a) + 0.4); });
    const pick = which => {
      if (answered) return;
      answered = true;
      const ok = which === r().right;
      if (ok) right++;
      (which === "a" ? pickA : pickB).classList.add("picked");
      [pickA, pickB].forEach(b => { b.disabled = true; });
      ding(ok);
      const last = i === s.rounds.length - 1;
      const next = last ? null : h("button", { type: "button", class: "btn" }, "Next pair");
      if (next) next.addEventListener("click", () => { i++; show(); });
      out.replaceChildren(...[h("div", { class: "lesson-reveal " + (ok ? "good" : "warn") }, h("b", null, ok ? "Yes." : "Listen again."), h("p", null, r().why)), next].filter(Boolean));
      if (last) { api.data[s.id] = { right, of: s.rounds.length }; api.save(); api.ready(); }
    };
    pickA.addEventListener("click", () => pick("a"));
    pickB.addEventListener("click", () => pick("b"));
    show();
    return { el: h("div", { class: "stack lesson-center" }, tally, q, h("div", { class: "row" }, playA, both, playB), h("div", { class: "lesson-chips" }, pickA, pickB), out) };
  } },

  // Score yourself with rubric rows (1-4), then one keep and one fix.
  // { cats: [{ key, name, levels: [4 texts] }], keeps: [text], fixes: [text] }
  rubric: { make(s, api) {
    const got = Object.assign({ scores: {} }, api.data[s.id] || {});
    const check = () => { if (s.cats.every(c => got.scores[c.key]) && got.keep && got.fix) { api.data[s.id] = got; api.save(); api.ready(); } };
    const rows = s.cats.map(c => {
      const desc = h("p", { class: "small muted lesson-rubdesc" }, got.scores[c.key] ? c.levels[got.scores[c.key] - 1] : "Choose 1-4.");
      const chips = h("div", { class: "lesson-chips" }, [1, 2, 3, 4].map(n => {
        const b = h("button", { type: "button", class: "lesson-chip" + (got.scores[c.key] === n ? " picked" : ""), "aria-pressed": String(got.scores[c.key] === n) }, String(n));
        b.addEventListener("click", () => {
          chips.querySelectorAll("button").forEach(x => { x.classList.remove("picked"); x.setAttribute("aria-pressed", "false"); });
          b.classList.add("picked"); b.setAttribute("aria-pressed", "true");
          got.scores[c.key] = n; desc.textContent = c.levels[n - 1]; check();
        });
        return b;
      }));
      return h("fieldset", { class: "lesson-group" }, h("legend", null, c.name), chips, desc);
    });
    const pickOne = (label, list, key) => h("fieldset", { class: "lesson-group" }, h("legend", null, label),
      h("div", { class: "lesson-chips" }, list.map(t => {
        const b = h("button", { type: "button", class: "lesson-chip" + (got[key] === t ? " picked" : "") }, t);
        b.addEventListener("click", () => { b.parentElement.querySelectorAll("button").forEach(x => x.classList.remove("picked")); b.classList.add("picked"); got[key] = t; check(); });
        return b;
      })));
    check();
    return { el: h("div", { class: "stack" }, rows, pickOne("One keep (something good)", s.keeps, "keep"), pickOne("One fix (the most important problem)", s.fixes, "fix")) };
  } },

  // Continue a pattern: a sequence with its last item missing; choose what comes next. When the
  // items are notes (semis), the finished sequence plays. { rounds: [{ seq: [label], semis, options, answer, why }] }
  complete: { make(s, api) {
    let i = 0, right = 0, missed = false;
    const tally = h("p", { class: "small muted" });
    const line = h("div", { class: "lesson-line mono" });
    const opts = h("div", { class: "lesson-chips" });
    const out = h("div");
    const playSeq = r => (r.semis || []).forEach((n, k) => setTimeout(() => sound({ semi: n, seconds: 0.42 }), k * 380));
    function show() {
      const r = s.rounds[i]; missed = false; out.replaceChildren();
      tally.textContent = "Round " + (i + 1) + " of " + s.rounds.length;
      line.replaceChildren(...r.seq.map(x => h("span", { class: "lesson-beat" + (x === "|" ? " bar" : "") }, x)), h("span", { class: "lesson-beat blank" }, "?"));
      opts.replaceChildren(...r.options.map(o => {
        const b = h("button", { type: "button", class: "lesson-chip mono" }, o);
        b.addEventListener("click", () => {
          if (o !== r.answer) { missed = true; b.classList.add("wrong"); b.disabled = true; ding(false); return; }
          if (!missed) right++;
          line.lastChild.textContent = o; line.lastChild.classList.replace("blank", "now");
          opts.querySelectorAll("button").forEach(x => { x.disabled = true; });
          ding(true); setTimeout(() => playSeq(r), 350);
          const last = i === s.rounds.length - 1;
          const next = last ? null : h("button", { type: "button", class: "btn" }, "Next pattern");
          if (next) next.addEventListener("click", () => { i++; show(); });
          out.replaceChildren(...[r.why ? h("div", { class: "lesson-reveal good" }, h("b", null, "Right."), h("p", null, r.why)) : null, next].filter(Boolean));
          if (last) { api.data[s.id] = { right, of: s.rounds.length }; api.save(); api.ready(); }
        });
        return b;
      }));
    }
    show();
    return { el: h("div", { class: "stack lesson-center" }, tally, line, opts, out) };
  } },

  // Dictation: hear a phrase, write it by tapping note names (each tap sounds), then check it.
  // { rounds: [[semi]], notes: [{ label, semi }] (the keys) }
  dictate: { make(s, api) {
    let i = 0, written = [], tries = 0, right = 0, closed = false;
    const tally = h("p", { class: "small muted" });
    const slots = h("div", { class: "lesson-line mono" });
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" });
    const out = h("div");
    // A round is the answer's notes, or { notes, show } where show is a melody written another way
    // (in another key) that the learner rewrites in the flute's own sargam.
    const target = () => (Array.isArray(s.rounds[i]) ? s.rounds[i] : s.rounds[i].notes);
    const shown = h("p", { class: "lesson-shown mono" });
    const label = n => (s.notes.find(x => x.semi === n) || {}).label || "?";
    const hear = h("button", { type: "button", class: "btn primary" }, icon("play"), " Hear the phrase");
    hear.addEventListener("click", () => target().forEach((n, k) => setTimeout(() => sound({ semi: n, seconds: 0.5 }), k * 560)));
    const undo = h("button", { type: "button", class: "btn" }, "Undo");
    const check = h("button", { type: "button", class: "btn" }, "Check");
    const keys = h("div", { class: "lesson-chips" }, s.notes.map(nt => {
      const b = h("button", { type: "button", class: "lesson-chip mono" }, nt.label);
      b.addEventListener("click", () => { sound({ semi: nt.semi, seconds: 0.45 }); if (!closed && written.length < target().length) { written.push(nt.semi); draw(); } });
      return b;
    }));
    function draw(marks) {
      slots.replaceChildren(...target().map((_, k) => h("span", { class: "lesson-beat" + (marks ? (marks[k] ? " now" : " wrongslot") : written[k] !== undefined ? "" : " blank") }, written[k] !== undefined ? label(written[k]) : "?")));
      check.disabled = closed || written.length < target().length;
      undo.disabled = closed;
    }
    function show() {
      written = []; tries = 0; closed = false; out.replaceChildren();
      tally.textContent = "Phrase " + (i + 1) + " of " + s.rounds.length + ": " + target().length + " notes";
      shown.textContent = s.rounds[i].show || ""; shown.hidden = !s.rounds[i].show;
      msg.textContent = s.rounds[i].show ? (s.say || "Write it in your flute's own sargam.") : "Hear it, sing it, then write it: the first note against Sa, then up or down, step or leap.";
      draw();
    }
    undo.addEventListener("click", () => { if (closed) return; written.pop(); draw(); });
    check.addEventListener("click", () => {
      tries++;
      const marks = target().map((n, k) => written[k] === n), ok = marks.every(Boolean);
      draw(marks); ding(ok);
      if (!ok) { msg.textContent = marks.filter(x => !x).length + " notes to fix (in red). Listen again, then Undo back to the first wrong one."; if (tries < 3) return; }
      if (ok && tries === 1) right++;
      closed = true; // this phrase is finished: only Next phrase (or Hear) from here
      const last = i === s.rounds.length - 1;
      const next = last ? null : h("button", { type: "button", class: "btn" }, "Next phrase");
      if (next) next.addEventListener("click", () => { i++; show(); });
      msg.textContent = ok ? "Verified: every note matches." : "The answer: " + target().map(label).join(" ") + ". Play it to hear it.";
      if (!ok) { written = target().slice(); draw(target().map(() => true)); }
      out.replaceChildren(...[next].filter(Boolean));
      if (last) { api.data[s.id] = { right, of: s.rounds.length }; api.save(); api.ready(); }
    });
    show();
    return { el: h("div", { class: "stack lesson-center" }, tally, shown, hear, slots, msg, keys, h("div", { class: "row" }, undo, check), out) };
  } },

  // Put notes in order by ear: tap the names in order; each tap plays its note.
  // { items: [{ label, semi }] (in the right order), prompt }
  order: { make(s, api) {
    let k = 0, slips = 0;
    const line = h("div", { class: "lesson-line mono" }, s.items.map(() => h("span", { class: "lesson-beat" }, "?")));
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" }, s.prompt || "Tap the notes in order, from the lowest.");
    const hear = s.items.some(it => it.semi === undefined) ? null : h("button", { type: "button", class: "btn" }, icon("play"), " Hear them in order");
    if (hear) hear.addEventListener("click", () => s.items.forEach((it, i) => setTimeout(() => sound({ semi: it.semi, seconds: 0.45 }), i * 420)));
    const pool = h("div", { class: "lesson-chips" }, shuffled(s.items).map(it => {
      const b = h("button", { type: "button", class: "lesson-chip mono" }, it.label);
      b.addEventListener("click", () => {
        if (it.semi !== undefined) sound({ semi: it.semi, seconds: 0.5 });
        if (it !== s.items[k]) { slips++; b.classList.add("wrong"); setTimeout(() => b.classList.remove("wrong"), 400); return; }
        line.children[k].textContent = it.label; line.children[k].classList.add("now");
        b.disabled = true; k++;
        if (k === s.items.length) { ding(true); msg.textContent = s.done || (slips ? s.items.length + " notes in order. Say them aloud as they rise: that is sargam." : "In order, first time. Say them aloud as they rise: that is sargam."); api.data[s.id] = { slips }; api.save(); api.ready(); }
      });
      return b;
    }));
    return { el: h("div", { class: "stack lesson-center" }, line, msg, pool, hear) };
  } },
};
