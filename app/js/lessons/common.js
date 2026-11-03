// What the day lessons share: the learner's holding side (chosen in the Day 0 lesson), the
// reward step that ends a day, and finishing the day's session.
import { h, icon } from "../util.js";
import { lessonRecord } from "../lesson/player.js";
import { finishSession, current, getDay, INTERVALS } from "../course.js";
import { award } from "../xp.js";
import { playNote } from "../core/audio.js";
import { nameOf } from "../core/theory.js";
import { getState } from "../state.js";
import { today, addDays } from "../util.js";
import { holdGrowth, monthGrowth } from "../livestats.js";
import { listRecordings } from "../recorder.js";

// The newest audio recording kept in this browser whose date passes test(date), or null.
async function newestRecording(test) {
  try { return (await listRecordings()).find(r => r && r.blob && r.kind !== "video" && test(r.date || "")) || null; }
  catch (e) { return null; }
}
// A recording played on the spot (the lesson is not left): one button, play and pause.
function playButton(rec, label) {
  let audio = null, url = null;
  const b = h("button", { type: "button", class: "btn lesson-recplay" }, icon("play"), label);
  const stop = () => { if (audio) audio.pause(); if (url) URL.revokeObjectURL(url); audio = null; url = null; b.replaceChildren(icon("play"), label); };
  b.addEventListener("click", () => {
    if (audio && !audio.paused) { stop(); return; }
    url = URL.createObjectURL(rec.blob); audio = new Audio(url);
    audio.addEventListener("ended", stop);
    audio.play().catch(stop);
    b.replaceChildren(icon("pause"), label);
  });
  return { el: b, stop };
}

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
// the app already keeps; under it, today's recording when one was saved today (W33). Hidden when
// there is neither. stops: where the recording's player is registered, to stop when the step goes.
export function rewardSound(stops) {
  const g = holdGrowth(getState().live.holds, today());
  const name = g ? (g.key === "any" ? "note" : nameOf(Number(g.key))) : "";
  const box = h("div", { class: "stack tight lesson-sound", hidden: !g }, h("span", { class: "eyebrow" }, "Your sound"),
    g ? h("p", null, "Longest steady " + name + ": ", g.then !== null ? h("span", { class: "muted" }, g.then.toFixed(1) + " s a few weeks ago, ") : null, h("b", null, g.now.toFixed(1) + " s today")) : null);
  const day = today();
  newestRecording(d => d === day).then(rec => {
    if (!rec) return;
    const p = playButton(rec, "Today's recording");
    if (stops) stops.push(p.stop);
    box.append(h("div", { class: "row" }, p.el)); box.hidden = false;
  });
  return box;
}

// A review day's growth (F6, W34): this month's longest holds against a month back, and this
// week's recording next to last week's, when both are kept. { els, destroy() }.
export function reviewGrowth() {
  const stops = [], day = today();
  const growth = monthGrowth(getState().live.holds, day).filter(x => x.then === null || x.now > x.then);
  const month = growth.length ? h("div", { class: "stack tight lesson-growth" }, h("span", { class: "eyebrow" }, "Growth this month"),
    h("ul", { class: "lesson-done" }, growth.map(x => {
      const name = x.key === "any" ? "Any note" : nameOf(Number(x.key));
      return h("li", { class: "ok" }, h("span", { class: "lesson-tick", "aria-hidden": "true" }, icon("check")),
        h("span", null, x.then === null ? name + ": " + x.now.toFixed(1) + " s this month" : name + ": " + x.then.toFixed(1) + " s a month ago, " + x.now.toFixed(1) + " s now"));
    }))) : null;
  const weeks = h("div", { class: "stack tight lesson-weeks", hidden: true });
  Promise.all([newestRecording(d => d >= addDays(day, -6) && d <= day), newestRecording(d => d >= addDays(day, -13) && d < addDays(day, -6))]).then(([now, before]) => {
    if (!now || !before) return;
    const a = playButton(before, "Last week"), b = playButton(now, "This week");
    stops.push(a.stop, b.stop);
    weeks.append(h("span", { class: "eyebrow" }, "Your recordings"), h("div", { class: "row" }, a.el, b.el));
    weeks.hidden = false;
  });
  return { els: [month, weeks], destroy() { stops.forEach(f => f()); } };
}

// A review day's own reward (W34), from what the day kept (d: the lesson's data): the quiz, each
// question marked (right first time, or for another look); the pieces played, each with its next
// review; and what you wrote in the look back. pieces: [{ step, item, label }]. Returns elements.
export function reviewSummary(d, pieces) {
  const out = [];
  const mark = ok => h("span", { class: "lesson-tick" + (ok ? "" : " warn"), "aria-hidden": "true" }, ok ? icon("check") : "!");
  const q = d.quiz;
  if (q && q.of) {
    out.push(h("div", { class: "stack tight lesson-rquiz" },
      h("p", { class: "row lesson-rhead" }, h("span", { class: "eyebrow" }, "Quiz"), h("b", null, q.firstTry + " of " + q.of)),
      (q.marks || []).length ? h("ul", { class: "lesson-qmarks" }, q.marks.map((ok, i) => h("li", { class: ok ? "ok" : "later", title: (q.qs || [])[i] || "" },
        mark(ok), h("span", { class: "sr-only" }, ok ? "Right first time: " : "Look again: "), h("span", { class: "lesson-qtext" }, (q.qs || [])[i] || String(i + 1))))) : null));
  }
  const reviews = getState().reviews || {};
  const played = pieces.filter(p => d[p.step]);
  if (played.length) {
    out.push(h("div", { class: "stack tight lesson-rpieces" }, h("span", { class: "eyebrow" }, "Your pieces"),
      h("ul", { class: "lesson-done" }, played.map(p => {
        const ok = !!d[p.step].passed, r = reviews[p.item];
        // The schedule the piece moves to when the day is finished (course.js markReview).
        const days = ok ? INTERVALS[Math.min(((r && r.stage) || 0) + 1, INTERVALS.length - 1)] : 1;
        return h("li", { class: ok ? "ok" : "later" }, mark(ok), h("span", null, p.label),
          h("span", { class: "small muted lesson-rnext" }, ok ? (days === 1 ? "next tomorrow" : "next in " + days + " days") : "again tomorrow"));
      }))));
  }
  const w = d["R-reflect"];
  if (w && (w.changed || "").trim()) {
    out.push(h("div", { class: "stack tight lesson-rwrote" }, h("span", { class: "eyebrow" }, "You wrote"),
      h("p", { class: "lesson-wrote" }, h("q", { translate: "no" }, w.changed.trim()), (w.next || "").trim() ? h("span", { class: "muted" }, " . ") : null,
        (w.next || "").trim() ? h("span", null, h("span", null, "next:"), " ", h("q", { translate: "no" }, w.next.trim())) : null)));
  }
  return out;
}

// Tomorrow's taste:{ when, title, text, notes: [semitones] (played as a little tune) | audio: url }
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
// lead: parts that come first, under the star (a review day's quiz, pieces and words, W34).
export function rewardView(rows, teaser, extra, lead) {
  const t = rewardTeaser(teaser), stops = [];
  return {
    el: h("div", { class: "stack lesson-reward" },
      h("div", { class: "lesson-burst", "aria-hidden": "true" }, icon("star")),
      ...(lead || []), ...rewardLists(rows), rewardSound(stops), ...(extra || []), t.el),
    destroy() { t.stop(); stops.forEach(f => f()); },
  };
}

// The last step of a day: what was done (rows: [text, done]), and a taste of tomorrow. more(): extra
// parts for the reward, { els, destroy() } (a review day's growth).
export function dayReward(rows, teaser, more) {
  return (s, api) => {
    setTimeout(() => api.ready(), 0);
    const m = more ? more(api.data) : null;
    const v = rewardView(typeof rows === "function" ? rows(api.data) : rows, teaser, m ? m.els : null, m ? m.lead : null);
    return m ? { el: v.el, destroy() { v.destroy(); m.destroy(); } } : v;
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
