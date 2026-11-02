// The lesson player: a lesson is a short run of steps (a hook, theory toys, play-it moments, a
// reward), grouped in chapters, one step on screen at a time. Each step says when it is done
// (api.ready()), which lights up Continue. Where the learner is, and what they chose, is kept in
// this browser (bansuri.lessons), so a lesson resumes where it was left.
//
// lesson: { id, title, chapters: [{ title, steps: [step] }], finish(data) }
// step:   { id, kind, title, ... } - kinds in ./steps.js; kind "custom" takes make(step, api).
import { h, store, storeSet, today, icon } from "../util.js";
import { STEP_KINDS } from "./steps.js";
import { stopAll, tanpura } from "../core/audio.js";
import { micActive } from "../core/listen.js";
import { whyLayer, openReading } from "./learn.js";
import { FIX_INFO, FIX_FILE } from "../skillmap.js";

const KEY = "bansuri.lessons";
// The steps you play on the flute (they get the drone switch), and the drone's remembered state.
const PLAYS = new Set(["hold", "phrase", "firstSound", "ornament", "bend", "swell", "improv", "answer", "fills", "timer"]);
const DRONE_KEY = "bansuri.lessons.drone";
// Why Continue waits, by the kind of step.
const WHY = {
  quiz: "Finish the step first: answer the questions above.",
  listen: "Finish the step first: choose an answer above.", choose: "Finish the step first: choose an answer above.",
  record: "Finish the step first: record it, or skip it for now.",
  timer: "Finish the step first: start the timer, then tick what you did.",
  cards: "Finish the step first: go through each card above.",
  form: "Finish the step first: choose your answers above.", plan: "Finish the step first: write your answers above.",
};
const WHY_PLAY = "Finish the step first: play it while the app listens.";
const WHY_ANY = "Finish the step first: do what it asks above.";
export const lessonRecord = id => store(KEY, {})[id] || null;
function saveRecord(id, rec) { const all = store(KEY, {}); all[id] = rec; storeSet(KEY, all); }

// All steps in order, each with its chapter.
export function flatSteps(lesson) {
  const out = [];
  lesson.chapters.forEach((c, ci) => c.steps.forEach(s => out.push(Object.assign({ chapter: ci, chapterTitle: c.title }, s))));
  return out;
}

// opts: { onExit(), onFinished(result) }
export function lessonPlayer(lesson, opts) {
  const o = Object.assign({ onExit: null, onFinished: null }, opts || {});
  const steps = flatSteps(lesson);
  const rec = lessonRecord(lesson.id) || { at: 0, data: {}, done: null, started: today() };
  if (!rec.data) rec.data = {};
  let at = Math.min(rec.at || 0, steps.length - 1), live = null, isReady = false;
  const save = () => saveRecord(lesson.id, rec);

  const closeBtn = h("button", { type: "button", class: "lesson-close", "aria-label": "Close the lesson (it resumes where you left it)" }, icon("x"));
  // The chapter strip (W23): the chapters by number, the current one marked; the step count beside it.
  const bar = h("ol", { class: "lesson-chaps", "aria-label": "Chapters" },
    lesson.chapters.map((c, i) => h("li", null, h("span", { "aria-hidden": "true" }, String(i + 1)), h("span", { class: "sr-only" }, c.title))));
  const count = h("span", { class: "lesson-count small muted" });
  const chapterEl = h("span", { class: "lesson-chapter" });
  const stage = h("div", { class: "lesson-stage", "aria-live": "polite" });
  const backBtn = h("button", { type: "button", class: "btn ghost" }, "Back");
  const nextBtn = h("button", { type: "button", class: "btn primary big lesson-next" }, "Continue");
  // A tap on Continue while it waits says why, in one line (09: disabled, with the reason on tap).
  const whyBtn = h("button", { type: "button", class: "lesson-nextwhy", "aria-label": "Why is Continue not ready?" });
  const whyMsg = h("p", { class: "lesson-whymsg small", role: "status", hidden: true });
  let whyTimer = 0;
  whyBtn.addEventListener("click", () => {
    whyMsg.textContent = WHY[steps[at].kind] || (PLAYS.has(steps[at].kind) ? WHY_PLAY : WHY_ANY);
    whyMsg.hidden = false; clearTimeout(whyTimer); whyTimer = setTimeout(() => { whyMsg.hidden = true; }, 5000);
  });
  // A drone for the steps that play (W23): one switch, remembered, under the step.
  const droneBox = h("input", { type: "checkbox" });
  const tools = h("div", { class: "lesson-tools", hidden: true }, h("label", { class: "lesson-drone" }, droneBox, "Drone"));
  let droneMine = false;
  const droneStart = () => { if (!tanpura.isOn()) { try { tanpura.start(); droneMine = true; } catch (e) { /* no audio */ } } };
  const droneLeave = () => { if (droneMine && tanpura.isOn()) tanpura.stop(); droneMine = false; };
  droneBox.addEventListener("change", () => {
    storeSet(DRONE_KEY, droneBox.checked);
    if (droneBox.checked) droneStart(); else { if (tanpura.isOn()) tanpura.stop(); droneMine = false; }
  });
  // After two misses on a step (redesign L4c, F9): help that fits the miss, and a respectable skip.
  const trouble = h("div", { class: "lesson-trouble", hidden: true });
  let misses = 0, lastFix = null;
  const el = h("div", { class: "lesson" },
    h("header", { class: "lesson-top" }, closeBtn, bar, count),
    chapterEl, stage, tools, trouble, whyMsg,
    h("footer", { class: "lesson-foot" }, backBtn, h("span", { class: "lesson-nextwrap" }, nextBtn, whyBtn)));

  const api = {
    data: rec.data,
    ready(on = true) {
      isReady = !!on; nextBtn.disabled = !isReady;
      nextBtn.classList.toggle("lesson-go", isReady);
      whyBtn.hidden = isReady;
      if (isReady) { trouble.hidden = true; whyMsg.hidden = true; }
    },
    save() { save(); },
    next() { go(at + 1); },
    lesson, steps,
  };

  function show() {
    if (live && live.destroy) { try { live.destroy(); } catch (e) { /* ignore */ } }
    stopAll();
    const s = steps[at];
    rec.at = at; save();
    bar.querySelectorAll("li").forEach((b, i) => {
      b.classList.toggle("done", i < s.chapter); b.classList.toggle("now", i === s.chapter);
      if (i === s.chapter) { b.setAttribute("aria-current", "step"); if (bar.scrollWidth > bar.clientWidth) bar.scrollLeft = Math.max(0, b.offsetLeft - bar.offsetLeft - bar.clientWidth / 2); } else b.removeAttribute("aria-current");
    });
    count.textContent = (at + 1) + " / " + steps.length;
    // The drone switch shows on the steps that play, as it was left; elsewhere a drone it started stops.
    const plays = PLAYS.has(s.kind);
    tools.hidden = !plays;
    if (plays) { const want = !!store(DRONE_KEY, false); droneBox.checked = want || tanpura.isOn(); if (want) droneStart(); } else droneLeave();
    whyMsg.hidden = true;
    chapterEl.textContent = s.chapterTitle;
    backBtn.hidden = at === 0;
    nextBtn.textContent = s.next || (at === steps.length - 1 ? "Finish" : "Continue");
    api.ready(false);
    misses = 0; lastFix = null; trouble.hidden = true; trouble.replaceChildren(); el.classList.remove("lesson-introuble");
    const kind = s.kind === "custom" ? { make: s.make } : STEP_KINDS[s.kind];
    live = kind ? kind.make(s, api) : { el: h("p", null, "This step is missing.") };
    const head = s.title ? h("h2", { class: "lesson-title", tabindex: "-1" }, s.title) : null;
    // A practice-day drill names the lesson it comes from.
    const from = s.from ? h("p", { class: "small muted lesson-from" }, "Practice from Day " + s.from.day + ": " + s.from.title) : null;
    // The day's explanation for this step's chapter, folded under the step (lesson/learn.js), and
    // under the reward, the day's pass check.
    const goal = s.goal ? h("div", { class: "lesson-goal" }, h("span", { class: "eyebrow" }, "Today's goal"), h("p", null, s.goal)) : null;
    stage.replaceChildren(...[from, head, s.intro ? h("p", { class: "lesson-intro" }, s.intro) : null, live.el, goal, whyLayer(s.blocks)].filter(Boolean));
    stage.dataset.kind = s.kind; stage.dataset.step = s.id; stage.dataset.target = s.target === undefined ? "" : String(s.target);
    stage.dataset.notes = (s.phrase || s.targets || (s.ex ? [s.ex.from ?? s.ex.grace ?? s.ex.note ?? (s.ex.notes || [])[0], s.ex.to ?? s.ex.main].filter(x => x !== undefined) : [])).join(","); // for the tests' lesson walker
    if (head) head.focus({ preventScroll: true });
    el.scrollIntoView({ block: "start" });
    if (s.always) api.ready(true);
  }
  function go(i) {
    if (i >= steps.length) return finish();
    at = Math.max(0, i); show();
  }
  function finish() {
    const first = !rec.done;
    rec.done = rec.done || today(); rec.at = 0; save();
    let result = null;
    // The end card is an ordinary screen again: the top bar and tabs come back (and a level reached
    // by finishing is celebrated there).
    document.documentElement.classList.remove("fullfocus");
    droneLeave();
    try { result = lesson.finish ? lesson.finish(rec.data, { first }) : null; } catch (e) { result = null; }
    if (o.onFinished) o.onFinished(result || {});
  }
  nextBtn.addEventListener("click", () => { if (isReady) go(at + 1); });
  backBtn.addEventListener("click", () => go(at - 1));
  closeBtn.addEventListener("click", () => { if (o.onExit) o.onExit(); });
  const onKey = e => {
    if (e.key !== "Enter" || !isReady || document.querySelector("dialog.sheet[open]")) return;
    const t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName) || (t.getAttribute && t.getAttribute("role") === "button"))) return;
    go(at + 1);
  };
  document.addEventListener("keydown", onKey);
  // Playing mode (docs/redesign 09): while the microphone listens, the step is read from a music
  // stand, so the note, the ring and one word grow and everything else steps back.
  const onMic = e => el.classList.toggle("lesson-playing", !!(e.detail && e.detail.on));
  document.addEventListener("bansuri:mic", onMic);
  function showTrouble() {
    const s = steps[at], fix = lastFix && FIX_FILE[lastFix] ? lastFix : "TS-01";
    const help = h("button", { type: "button", class: "linkbtn" }, "Having trouble? ", h("span", { class: "muted" }, FIX_INFO[fix]));
    help.addEventListener("click", () => openReading({ path: "troubleshooting/" + FIX_FILE[fix], label: fix + " - " + FIX_INFO[fix] }));
    const skip = h("button", { type: "button", class: "linkbtn" }, "Skip for now");
    skip.addEventListener("click", () => { if (!api.data[s.id]) api.data[s.id] = { passed: false, skipped: true }; save(); go(at + 1); });
    trouble.replaceChildren(help, skip);
    trouble.hidden = false;
    el.classList.add("lesson-introuble");
  }
  const onAttempt = e => {
    const d = e.detail || {};
    if (d.ok || isReady) return;
    misses++; if (d.fix) lastFix = d.fix;
    if (misses >= 2) showTrouble();
  };
  document.addEventListener("bansuri:attempt", onAttempt);
  el.classList.toggle("lesson-playing", micActive());
  // Full focus: while the player is on screen, no top bar and no tabs (W2); the close button leads out.
  document.documentElement.classList.add("fullfocus");
  show();
  return {
    el,
    destroy() {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("bansuri:mic", onMic);
      document.removeEventListener("bansuri:attempt", onAttempt);
      document.documentElement.classList.remove("fullfocus");
      clearTimeout(whyTimer); droneLeave();
      if (live && live.destroy) { try { live.destroy(); } catch (e) { /* ignore */ } }
      stopAll();
      // A reading left open over the lesson goes with it.
      document.querySelectorAll("dialog.sheet").forEach(d => { if (d.open) d.close(); d.remove(); });
    },
    restart() { rec.at = 0; save(); go(0); },
  };
}
