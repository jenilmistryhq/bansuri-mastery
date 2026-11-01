// The lesson player: a lesson is a short run of steps (a hook, theory toys, play-it moments, a
// reward), grouped in chapters, one step on screen at a time. Each step says when it is done
// (api.ready()), which lights up Continue. Where the learner is, and what they chose, is kept in
// this browser (bansuri.lessons), so a lesson resumes where it was left.
//
// lesson: { id, title, chapters: [{ title, steps: [step] }], finish(data) }
// step:   { id, kind, title, ... } - kinds in ./steps.js; kind "custom" takes make(step, api).
import { h, store, storeSet, today, icon } from "../util.js";
import { STEP_KINDS } from "./steps.js";
import { stopAll } from "../core/audio.js";

const KEY = "bansuri.lessons";
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
  const bar = h("div", { class: "lesson-bar", role: "progressbar", "aria-label": "Lesson progress", "aria-valuemin": "1", "aria-valuemax": String(steps.length) },
    steps.map((s, i) => h("i", { class: (i && s.chapter !== steps[i - 1].chapter ? "gap" : "") })));
  const count = h("span", { class: "lesson-count small muted" });
  const chapterEl = h("span", { class: "lesson-chapter" });
  const stage = h("div", { class: "lesson-stage", "aria-live": "polite" });
  const backBtn = h("button", { type: "button", class: "btn ghost" }, "Back");
  const nextBtn = h("button", { type: "button", class: "btn primary big lesson-next" }, "Continue");
  const el = h("div", { class: "lesson" },
    h("header", { class: "lesson-top" }, closeBtn, bar, count),
    chapterEl, stage,
    h("footer", { class: "lesson-foot" }, backBtn, nextBtn));

  const api = {
    data: rec.data,
    ready(on = true) {
      isReady = !!on; nextBtn.disabled = !isReady;
      nextBtn.classList.toggle("lesson-go", isReady);
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
    bar.setAttribute("aria-valuenow", String(at + 1));
    bar.querySelectorAll("i").forEach((b, i) => { b.classList.toggle("on", i <= at); b.classList.toggle("now", i === at); });
    count.textContent = (at + 1) + " / " + steps.length;
    chapterEl.textContent = s.chapterTitle;
    backBtn.hidden = at === 0;
    nextBtn.textContent = s.next || (at === steps.length - 1 ? "Finish" : "Continue");
    api.ready(false);
    const kind = s.kind === "custom" ? { make: s.make } : STEP_KINDS[s.kind];
    live = kind ? kind.make(s, api) : { el: h("p", null, "This step is missing.") };
    const head = s.title ? h("h2", { class: "lesson-title", tabindex: "-1" }, s.title) : null;
    stage.replaceChildren(...[head, s.intro ? h("p", { class: "lesson-intro" }, s.intro) : null, live.el].filter(Boolean));
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
    try { result = lesson.finish ? lesson.finish(rec.data, { first }) : null; } catch (e) { result = null; }
    if (o.onFinished) o.onFinished(result || {});
  }
  nextBtn.addEventListener("click", () => { if (isReady) go(at + 1); });
  backBtn.addEventListener("click", () => go(at - 1));
  closeBtn.addEventListener("click", () => { if (o.onExit) o.onExit(); });
  const onKey = e => {
    if (e.key !== "Enter" || !isReady) return;
    const t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName) || (t.getAttribute && t.getAttribute("role") === "button"))) return;
    go(at + 1);
  };
  document.addEventListener("keydown", onKey);
  show();
  return {
    el,
    destroy() { document.removeEventListener("keydown", onKey); if (live && live.destroy) { try { live.destroy(); } catch (e) { /* ignore */ } } stopAll(); },
    restart() { rec.at = 0; save(); go(0); },
  };
}
