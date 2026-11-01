// Lesson step kinds for listening and judging: judge (which of two sounds is better, and why:
// the L08 rubric made audible), rubric (score yourself, then one keep and one fix) and order
// (put notes in order by ear, each tap sounding its note).
import { h, icon } from "../util.js";
import { ac, makeVoice, TONE_LEVELS, playCurve, master } from "../core/audio.js";
import { hzOf } from "../core/theory.js";
import { ding } from "./sound.js";

// A held Sa (or another note) of a tone level (1 airy .. 4 clear), off by some cents.
function sound({ semi = 0, level = 4, cents = 0, seconds = 2.2 }, at = 0) {
  try {
    const c = ac(), t = c.currentTime + 0.05 + at;
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

// Beats per second between two notes a few cents apart (at Sa's frequency).
export const beatRate = (cents, hz) => Math.abs(hz * (Math.pow(2, cents / 1200) - 1));

export const LISTEN_KINDS = {
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
    both.addEventListener("click", () => { sound(r().a); sound(r().b, 2.6); });
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
