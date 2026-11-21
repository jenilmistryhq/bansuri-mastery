// Placement test for learners who already play: a few short items, from a held Sa to the upper
// octave, each checked by the microphone. The last item passed in a row decides where to start.
import { h, today, toast } from "./util.js";
import { holdMeter, phraseCheck, noteQuiz, tapGame } from "./core/live.js";
import { getPlan } from "./course.js";
import { update } from "./state.js";

// Start the course at a phase (the playing test's advice): earlier milestones are marked as skipped,
// and can still be taken. Returns the day started on, or null for an unknown phase.
export function startAtPhase(phaseId) {
  const plan = getPlan(), ph = plan.phases.find(p => String(p.id) === String(phaseId));
  if (!ph) return null;
  update(st => {
    st.current = ph.firstDay;
    if (!st.startedAt) st.startedAt = today();
    for (const m of plan.milestones) if (m.day < ph.firstDay && (!st.milestones[m.id] || st.milestones[m.id].status !== "passed")) st.milestones[m.id] = Object.assign({ attempts: [] }, st.milestones[m.id] || {}, { status: "skipped" });
  });
  toast("Your path now starts at Phase " + ph.id + ". Earlier milestones remain available in your course.");
  return ph.firstDay;
}

// Each item, and the phase that passing it (and every item before it) leads to.
export const PLACEMENT = [
  { title: "Hold your Sa steadily for 4 seconds", skill: "tone", make: done => holdMeter({ targets: [0], seconds: 4, cents: 35, onPass: () => done({ passed: true }) }), phase: 1 },
  { title: "Play a clean phrase: S R G R S", skill: "notes", make: done => phraseCheck({ phrase: [0, 2, 4, 2, 0], reps: 1, onPass: () => done({ passed: true }) }), phase: 1 },
  { title: "Find and hold low Pa (.P) for 4 seconds", skill: "range", make: done => holdMeter({ targets: [-5], seconds: 4, cents: 35, onPass: () => done({ passed: true }) }), phase: 2 },
  { title: "Play the Kalyan scale: S R G M P D N S'", skill: "notes", make: done => phraseCheck({ phrase: [0, 2, 4, 6, 7, 9, 11, 12], reps: 1, onPass: () => done({ passed: true }) }), phase: 2 },
  { title: "Play Bilawal, including the half-holed m", skill: "intonation", make: done => phraseCheck({ phrase: [0, 2, 4, 5, 7, 9, 11, 12], reps: 1, onPass: () => done({ passed: true }) }), phase: 3 },
  { title: "Play into the upper octave: S' R' G' R' S'", skill: "range", make: done => phraseCheck({ phrase: [12, 14, 16, 14, 12], reps: 1, onPass: () => done({ passed: true }) }), phase: 4 },
  { title: "Hear and name notes from Sa", skill: "ear", make: observeResult(() => noteQuiz({ notes: [0, 2, 4, 7], count: 6, pass: 4 }), "earTest", r => r.right >= 4) },
  { title: "Tap a steady pulse", skill: "rhythm", make: observeResult(() => tapGame({ bpm: 60 }), "tap", r => r.within >= 0.65) },
];

function observeResult(create, type, passes) {
  return done => {
    let settled = false;
    const listener = e => {
      const r = e.detail || {};
      if (settled || r.type !== type) return;
      settled = true;
      document.removeEventListener("bansuri:live", listener);
      done({ passed: passes(r), result: r });
    };
    document.addEventListener("bansuri:live", listener);
    const widget = create();
    return { el: widget.el, destroy() { document.removeEventListener("bansuri:live", listener); widget.destroy(); } };
  };
}

// The phase to start: the phase of the last item passed in an unbroken run from the first.
export function placementPhase(passedCount) {
  if (passedCount <= 0) return 0;
  return PLACEMENT[Math.min(passedCount, PLACEMENT.length) - 1].phase;
}

// opts.onResult(phaseId) when the learner finishes or stops.
export function placementTest(opts) {
  let i = 0, widget = null, settled = false;
  const results = [];
  const step = h("p", { class: "small muted" });
  const title = h("h3");
  const host = h("div");
  const skip = h("button", { type: "button", class: "btn" }, "Not yet — next check");
  const el = h("div", { class: "stack placement" }, step, title, host, h("div", { class: "row" }, skip));
  function record(result) {
    if (settled) return;
    settled = true;
    const it = PLACEMENT[i];
    results.push({ skill: it.skill, title: it.title, passed: !!(result && result.passed), score: result && result.result ? result.result : null });
    i++;
    setTimeout(show, 700);
  }
  function show() {
    if (widget) { widget.destroy(); widget = null; }
    settled = false;
    if (i >= PLACEMENT.length) return finish();
    const it = PLACEMENT[i];
    step.textContent = "Check " + (i + 1) + " of " + PLACEMENT.length + ". This is a starting snapshot, not a pass-or-fail exam.";
    title.textContent = it.title;
    widget = it.make(record);
    host.replaceChildren(widget.el);
  }
  function finish() {
    if (widget) { widget.destroy(); widget = null; }
    skip.hidden = true;
    const base = results.slice(0, 6);
    let passedBase = 0;
    while (passedBase < base.length && base[passedBase].passed) passedBase++;
    const phase = placementPhase(passedBase), skills = {};
    for (const r of results) {
      const item = skills[r.skill] || (skills[r.skill] = { passed: 0, total: 0, tests: [] });
      item.total++; if (r.passed) item.passed++;
      if (r.score && Number.isFinite(r.score.right) && Number.isFinite(r.score.total)) { item.right = r.score.right; item.questions = r.score.total; }
      if (r.score && Number.isFinite(r.score.within)) item.onBeat = Math.round(r.score.within * 100);
      item.tests.push({ title: r.title, passed: r.passed });
    }
    const profile = { at: today(), phase, skills, results };
    title.textContent = "Baseline complete";
    step.textContent = "";
    const skillNames = { tone: "Tone", notes: "Note control", range: "Range", intonation: "Intonation", ear: "Ear", rhythm: "Rhythm" };
    host.replaceChildren(h("p", null, phase === 0 ? "Start with the foundations. Your snapshot highlights what to practise first." : "Your current technique suggests starting around Phase " + phase + ". Your skill snapshot will help you choose what to work on next."),
      h("div", { class: "assessment-results" }, Object.entries(skills).map(([key, v]) => h("div", { class: "assessment-result" }, h("b", null, skillNames[key] || key), h("span", { class: "chip " + (v.passed === v.total ? "good" : "mutedc") }, v.passed + "/" + v.total + " checks"),
        v.right !== undefined ? h("span", { class: "small muted" }, v.right + "/" + v.questions + " right") : null,
        v.onBeat !== undefined ? h("span", { class: "small muted" }, v.onBeat + "% on the beat") : null))));
    if (opts && opts.onResult) opts.onResult(phase, profile);
  }
  skip.addEventListener("click", () => record({ passed: false }));
  show();
  return { el, destroy() { if (widget) widget.destroy(); } };
}
