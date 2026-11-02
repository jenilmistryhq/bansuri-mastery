// What the day lessons share: the learner's holding side (chosen in the Day 0 lesson), the
// reward step that ends a day, and finishing the day's session.
import { h, icon } from "../util.js";
import { lessonRecord } from "../lesson/player.js";
import { finishSession, current, getDay } from "../course.js";
import { award } from "../xp.js";
import { playNote } from "../core/audio.js";
import { nameOf } from "../core/theory.js";
import { getState } from "../state.js";
import { today } from "../util.js";
import { holdGrowth } from "../livestats.js";

export const holdingSide = () => { const r = lessonRecord("m0"); return (r && r.data && r.data.side) || "right"; };
// The hand on holes 1-3 (the top hand): the left hand when the flute points right.
export const topHand = () => (holdingSide() === "left" ? "right" : "left");
export const bottomHand = () => (holdingSide() === "left" ? "left" : "right");

// The reward's lists (redesign L5): successes first, then what is left, gently, as "for later".
// rows: [text, done]
export function rewardLists(rows) {
  const done = rows.filter(r => r[1]), later = rows.filter(r => !r[1]);
  const list = (cls, items) => h("ul", { class: "lesson-done" }, items.map(([t]) => h("li", { class: cls }, h("span", { class: "lesson-tick", "aria-hidden": "true" }, cls === "ok" ? icon("check") : ""), h("span", null, t))));
  return [
    done.length ? h("div", { class: "stack tight lesson-well" }, h("span", { class: "eyebrow" }, "What went well"), list("ok", done)) : null,
    later.length ? h("div", { class: "stack tight lesson-later" }, h("span", { class: "eyebrow" }, "For later"), list("later", later)) : null,
  ];
}

// Your sound: the note held longest today against the same note about a month back, from the holds
// the app already keeps (nothing when nothing was held today).
export function rewardSound() {
  const g = holdGrowth(getState().live.holds, today());
  if (!g) return null;
  const name = g.key === "any" ? "note" : nameOf(Number(g.key));
  return h("div", { class: "stack tight lesson-sound" }, h("span", { class: "eyebrow" }, "Your sound"),
    h("p", null, "Longest steady " + name + ": ", g.then !== null ? h("span", { class: "muted" }, g.then.toFixed(1) + " s a few weeks ago, ") : null, h("b", null, g.now.toFixed(1) + " s today")));
}

// Tomorrow's taste: { when, title, text, notes: [semitones] (played as a little tune) | audio: url }
function rewardTeaser(teaser) {
  let audio = null;
  const hear = h("button", { type: "button", class: "btn" }, icon("play"), " Hear it");
  hear.addEventListener("click", () => {
    if (teaser.audio) { if (!audio) audio = new Audio(teaser.audio); audio.currentTime = 0; audio.play().catch(() => {}); return; }
    (teaser.notes || []).forEach((n, i) => setTimeout(() => playNote(n, 0.55), i * 450));
  });
  return { el: h("div", { class: "lesson-teaser" }, h("div", { class: "stack tight" }, h("span", { class: "eyebrow" }, teaser.when || "Tomorrow"), h("b", null, teaser.title), h("span", { class: "small muted" }, teaser.text)), hear), stop() { if (audio) audio.pause(); } };
}

// The reward, in the order the end is remembered (redesign L5): the star, what went well, for later,
// your sound, any extra notes, tomorrow. Points come last, quietly, on the card after Finish.
export function rewardView(rows, teaser, extra) {
  const t = rewardTeaser(teaser);
  return {
    el: h("div", { class: "stack lesson-reward" },
      h("div", { class: "lesson-burst", "aria-hidden": "true" }, icon("star")),
      ...rewardLists(rows), rewardSound(), ...(extra || []), t.el),
    destroy() { t.stop(); },
  };
}

// The last step of a day: what was done (rows: [text, done]), and a taste of tomorrow.
export function dayReward(rows, teaser) {
  return (s, api) => {
    setTimeout(() => api.ready(), 0);
    return rewardView(typeof rows === "function" ? rows(api.data) : rows, teaser);
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
