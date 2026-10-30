// Placement test for learners who already play: a few short items, from a held Sa to the upper
// octave, each checked by the microphone. The last item passed in a row decides where to start.
import { h } from "./util.js";
import { holdMeter, phraseCheck } from "./core/live.js";

// Each item, and the phase that passing it (and every item before it) leads to.
export const PLACEMENT = [
  { title: "Hold Sa for 4 seconds", make: done => holdMeter({ targets: [0], seconds: 4, cents: 35, onPass: done }), phase: 1 },
  { title: "Play S R G R S", make: done => phraseCheck({ phrase: [0, 2, 4, 2, 0], reps: 1, onPass: done }), phase: 1 },
  { title: "Hold low Pa (.P) for 4 seconds", make: done => holdMeter({ targets: [-5], seconds: 4, cents: 35, onPass: done }), phase: 2 },
  { title: "Play the Kalyan scale up: S R G M P D N S'", make: done => phraseCheck({ phrase: [0, 2, 4, 6, 7, 9, 11, 12], reps: 1, onPass: done }), phase: 2 },
  { title: "Play the Bilawal scale up, with the half-holed m: S R G m P D N S'", make: done => phraseCheck({ phrase: [0, 2, 4, 5, 7, 9, 11, 12], reps: 1, onPass: done }), phase: 3 },
  { title: "Play into the upper octave: S' R' G' R' S'", make: done => phraseCheck({ phrase: [12, 14, 16, 14, 12], reps: 1, onPass: done }), phase: 4 },
];

// The phase to start: the phase of the last item passed in an unbroken run from the first.
export function placementPhase(passedCount) {
  if (passedCount <= 0) return 0;
  return PLACEMENT[Math.min(passedCount, PLACEMENT.length) - 1].phase;
}

// opts.onResult(phaseId) when the learner finishes or stops.
export function placementTest(opts) {
  let i = 0, widget = null;
  const step = h("p", { class: "small muted" });
  const title = h("h3");
  const host = h("div");
  const skip = h("button", { type: "button", class: "btn" }, "I cannot play this yet");
  const el = h("div", { class: "stack placement" }, step, title, host, h("div", { class: "row" }, skip));
  function show() {
    if (widget) { widget.destroy(); widget = null; }
    if (i >= PLACEMENT.length) return finish();
    const it = PLACEMENT[i];
    step.textContent = "Item " + (i + 1) + " of " + PLACEMENT.length + ". Warm up first; take your time.";
    title.textContent = it.title;
    widget = it.make(() => { i++; setTimeout(show, 900); });
    host.replaceChildren(widget.el);
  }
  function finish() {
    if (widget) { widget.destroy(); widget = null; }
    skip.hidden = true;
    const phase = placementPhase(i);
    title.textContent = i === PLACEMENT.length ? "You passed every item." : "You passed " + i + " of " + PLACEMENT.length + " items.";
    step.textContent = "";
    host.replaceChildren(h("p", null, phase === 0 ? "Start from Day 0: the first weeks build the tone and habits everything else rests on, and they move quickly if you already play." : "Recommended start: Phase " + phase + ". You can still take the earlier milestone tests to check for gaps."));
    if (opts && opts.onResult) opts.onResult(phase);
  }
  skip.addEventListener("click", finish);
  show();
  return { el, destroy() { if (widget) widget.destroy(); } };
}
