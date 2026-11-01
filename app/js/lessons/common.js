// What the day lessons share: the learner's holding side (chosen in the Day 0 lesson), the
// reward step that ends a day, and finishing the day's session.
import { h, icon } from "../util.js";
import { lessonRecord } from "../lesson/player.js";
import { finishSession, current, getDay } from "../course.js";
import { award } from "../xp.js";
import { playNote } from "../core/audio.js";

export const holdingSide = () => { const r = lessonRecord("m0"); return (r && r.data && r.data.side) || "right"; };
// The hand on holes 1-3 (the top hand): the left hand when the flute points right.
export const topHand = () => (holdingSide() === "left" ? "right" : "left");
export const bottomHand = () => (holdingSide() === "left" ? "left" : "right");

// The last step of a day: what was done (rows: [text, done]), and a taste of tomorrow.
// teaser: { title, text, notes: [semitones] (played as a little tune) | audio: url }
export function dayReward(rows, teaser) {
  return (s, api) => {
    let audio = null;
    const hear = h("button", { type: "button", class: "btn" }, icon("play"), " Hear it");
    hear.addEventListener("click", () => {
      if (teaser.audio) { if (!audio) audio = new Audio(teaser.audio); audio.currentTime = 0; audio.play().catch(() => {}); return; }
      (teaser.notes || []).forEach((n, i) => setTimeout(() => playNote(n, 0.55), i * 450));
    });
    setTimeout(() => api.ready(), 0);
    const list = typeof rows === "function" ? rows(api.data) : rows;
    return {
      el: h("div", { class: "stack" },
        h("div", { class: "lesson-burst", "aria-hidden": "true" }, icon("star")),
        h("ul", { class: "lesson-done" }, list.map(([t, ok]) => h("li", { class: ok ? "ok" : "later" }, h("span", { class: "lesson-tick", "aria-hidden": "true" }, ok ? icon("check") : ""), h("span", null, t), ok ? null : h("span", { class: "small muted" }, " (later)")))),
        h("div", { class: "lesson-teaser" }, h("div", { class: "stack tight" }, h("span", { class: "eyebrow" }, teaser.when || "Tomorrow"), h("b", null, teaser.title), h("span", { class: "small muted" }, teaser.text)), hear)),
      destroy() { if (audio) audio.pause(); },
    };
  };
}

// Finish a day taught by a lesson: its session counts as done (and passed), the note goes to the
// log, and the lesson earns its experience once.
export function finishDay(day, lessonId, minutes, note, first) {
  const was = current();
  const blocks = {};
  for (const b of (getDay(day) || {}).blocks || []) blocks[b.id] = true;
  finishSession(day, { minutes, note, passed: true, blocks });
  if (first) award("lesson", { key: lessonId }); else award("lessonAgain");
  return { advanced: was === day && current() > day };
}
