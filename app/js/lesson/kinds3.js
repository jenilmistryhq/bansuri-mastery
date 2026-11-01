// Lesson step kinds for listening and judging: judge (which of two sounds is better, and why:
// the L08 rubric made audible), rubric (score yourself, then one keep and one fix) and order
// (put notes in order by ear, each tap sounding its note).
import { h, icon } from "../util.js";
import { ac, makeVoice, TONE_LEVELS } from "../core/audio.js";
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

export const LISTEN_KINDS = {
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
    const hear = h("button", { type: "button", class: "btn" }, icon("play"), " Hear them in order");
    hear.addEventListener("click", () => s.items.forEach((it, i) => setTimeout(() => sound({ semi: it.semi, seconds: 0.45 }), i * 420)));
    const pool = h("div", { class: "lesson-chips" }, shuffled(s.items).map(it => {
      const b = h("button", { type: "button", class: "lesson-chip mono" }, it.label);
      b.addEventListener("click", () => {
        sound({ semi: it.semi, seconds: 0.5 });
        if (it !== s.items[k]) { slips++; b.classList.add("wrong"); setTimeout(() => b.classList.remove("wrong"), 400); return; }
        line.children[k].textContent = it.label; line.children[k].classList.add("now");
        b.disabled = true; k++;
        if (k === s.items.length) { ding(true); msg.textContent = slips ? s.items.length + " notes in order. Say them aloud as they rise: that is sargam." : "In order, first time. Say them aloud as they rise: that is sargam."; api.data[s.id] = { slips }; api.save(); api.ready(); }
      });
      return b;
    }));
    return { el: h("div", { class: "stack lesson-center" }, line, msg, pool, hear) };
  } },
};
