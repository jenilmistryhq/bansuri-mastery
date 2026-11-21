// An interactive lesson (#/lesson/<id>): a cover (what it is, how long, its chapters), then the
// lesson player (lesson/player.js). Finishing it passes what it covers (for M0: setup and M0).
// The cover is the one cover of a day (#/day/N comes here, docs/redesign 05 L3); "#resume" after
// the address goes straight to the step a part-done lesson stopped on, and closing the player
// comes back to the cover (W32).
import { h, icon } from "../util.js";
import { LESSONS } from "../lessons/index.js";
import { practiceLesson, localise } from "../lessons/practice.js";
import { lessonPlayer, lessonRecord, flatSteps, saveLessonRecord } from "../lesson/player.js";
import { celebrate } from "../fun.js";
import { current, getDay, streaks } from "../course.js";
import { xpState } from "../xp.js";
import { today } from "../util.js";
import { oneDay } from "../lessons/oneday.js";
import { readingList } from "../lesson/learn.js";
import { update } from "../state.js";
import { setSettings, getSettings } from "../core/settings.js";
import { WEST } from "../core/theory.js";
import { ac } from "../core/audio.js";
import { taskList } from "./task-list.js";

export async function render(main, { params, anchor }) {
  const raw = LESSONS[params && params[0]] || practiceLesson(params && params[0]);
  // One Day N: the lesson carries the day's whole session (lessons/oneday.js).
  const isFluteSetup = !!raw && raw.id === "m0";
  const legacySetupLesson = isFluteSetup ? oneDay(raw, getDay(raw.day)) : null;
  const lesson = raw && raw.day !== undefined && !isFluteSetup ? oneDay(raw, getDay(raw.day)) : raw;
  // M0 used to insert reading and practice-plan cards into the interactive setup lesson. Map an
  // unfinished learner to the next real M0 step once, preserving their answers and exact place.
  if (isFluteSetup) {
    const saved = lessonRecord(raw.id);
    if (saved && !saved.done && saved.format !== 2) {
      const oldSteps = flatSteps(legacySetupLesson), newSteps = flatSteps(raw);
      const oldAt = Math.min(Math.max(0, Number(saved.at) || 0), oldSteps.length - 1);
      const nextRealStep = oldSteps.slice(oldAt).find(step => newSteps.some(next => next.id === step.id));
      const mappedAt = nextRealStep ? newSteps.findIndex(step => step.id === nextRealStep.id) : 0;
      saveLessonRecord(raw.id, Object.assign({}, saved, { at: Math.max(0, mappedAt), format: 2 }));
    }
  }
  if (lesson) await localise(lesson);
  const page = h("div", { class: "page lessonpage" });
  main.append(page);
  if (!lesson) { page.append(h("section", { class: "card" }, h("h1", null, "Lesson not found"), h("a", { class: "btn", href: "#/today" }, "Back to today"))); return undefined; }
  let player = null;
  // A day's lesson opens on that day (a lesson already done can always be played again); before
  // then its cover shows what it holds, with when it opens in place of Start (W20).
  const roomLaunch = anchor === "room" || anchor === "start";
  const future = !roomLaunch && lesson.day !== undefined && lesson.day > current() && !(lessonRecord(lesson.id) || {}).done;

  // Points, quiet and last (redesign L5, decision 6): today's XP and the streak, linking to Me.
  function points() {
    const xp = (xpState().days || {})[today()] || 0, st = streaks().current;
    if (!xp && !st) return null;
    return h("a", { class: "small muted lesson-points", href: "#/me" }, [xp ? "+" + xp + " XP today" : "", st ? st + (st === 1 ? " day" : " days") + " in a row" : ""].filter(Boolean).join(", "));
  }

  function play(fresh) {
    if (player) player.destroy();
    const completedBefore = !!(lessonRecord(lesson.id) || {}).done;
    player = lessonPlayer(lesson, {
      // Closing the player keeps the place and comes back to the cover (W32).
      onExit: () => showCover(),
      onFinished: res => {
        celebrate(lesson.title + " complete!");
        page.replaceChildren(h("section", { class: "card lesson-end" },
          h("div", { class: "lesson-burst", "aria-hidden": "true" }, icon("star")),
          h("h1", null, "Well done."),
          h("p", null, res.passed === false ? "A few setup checks still need attention. Review your result and repeat the room when you are ready." : res.advanced ? "Your next learning activity is ready on your Path." : completedBefore ? "You played this lesson again. Your progress is saved." : "This room is complete. Your progress is saved, and you can continue your Path whenever you are ready."),
      h("div", { class: "row" }, h("a", { class: "btn primary big", href: "#/today" }, "Back to today"), lesson.day === 0 ? h("a", { class: "btn", href: "#/me/journal/capsule" }, "View your first recording") : null),
          points()));
      },
    });
    if (fresh) player.restart();
    page.replaceChildren(player.el);
  }

  // The existing talk-through (the step list's hands-free mode, views/session.js): the app says
  // each step and moves on when you play Sa.
  function talkThrough() {
    update(st => { st.prefs.handsFree = true; st.prefs.sessionView = "focus"; });
    setSettings({ talk: true });
    try { ac(); } catch (e) { /* audio unlocks on this tap */ }
    location.hash = "#/session/" + lesson.day;
  }

  // The cover: the day's goal (its pass check), the chapters with their minutes, and the day's
  // readings, each opening in a sheet over the cover. Start, or carry on where you stopped.
  function cover() {
    const rec = lessonRecord(lesson.id), steps = flatSteps(lesson);
    const flute = getSettings();
    const inProgress = rec && !rec.done && rec.at > 0;
    const day = isFluteSetup ? {} : lesson.oneDay || {};
    const isDay = lesson.day !== undefined && !isFluteSetup;
    const completedSteps = rec && rec.done && !(rec.at > 0) ? steps.length : Math.min(steps.length, rec && rec.at || 0);
    const pct = steps.length ? Math.round(completedSteps / steps.length * 100) : 0;
    return h("section", { class: "card lesson-cover" },
      h("a", { class: "backlink", href: "#/course" }, "Course"),
      h("div", { class: "lesson-cover-status" }, h("span", { class: "chip " + (rec && rec.done ? "good" : inProgress ? "info" : "mutedc") }, rec && rec.done ? "Complete" : inProgress ? "In progress" : "Ready when you are"),
        h("span", { class: "small muted" }, lesson.minutes + " min")),
      h("span", { class: "eyebrow" }, isFluteSetup ? "Setup room" : lesson.review ? "Review activity" : lesson.practice ? "Practice activity" : isDay ? "Learning activity" : "Lesson"),
      h("h1", null, lesson.title),
      h("p", { class: "muted" }, isFluteSetup ? "Hear how your flute makes sound, find its home note, and learn to hold it comfortably. Your answers and progress save as you go." : "Listen, explore, and try each skill on your flute. Your progress saves as you go."),
      isFluteSetup ? h("div", { class: "lesson-fit-note" }, "Your current Sa is " + WEST[flute.saNote] + flute.saOct + ".", " ", h("a", { href: "#/me/flute" }, "Change flute setup")) : null,
      h("div", { class: "lesson-cover-progress" }, h("div", { class: "row between small" }, h("span", null, "Lesson progress"), h("b", null, completedSteps + " / " + steps.length)),
        h("div", { class: "progressbar", role: "progressbar", "aria-label": "Lesson progress", "aria-valuemin": "0", "aria-valuemax": String(steps.length), "aria-valuenow": String(completedSteps) }, h("i", { style: { width: pct + "%" } }))),
      day.pass || (isFluteSetup && lesson.goal) ? h("div", { class: "lesson-goal" }, h("span", { class: "eyebrow" }, "Your goal"), h("p", null, day.pass || lesson.goal)) : null,
      h("div", { class: "row between lesson-task-heading" }, h("h2", null, isFluteSetup ? "Learn by doing" : "Tasks"), h("span", { class: "small muted" }, lesson.chapters.length + " tasks · " + steps.length + " short steps")),
      taskList(lesson, rec),
      future ? h("p", { class: "lesson-opens" }, "This activity is coming up on your Path. You can preview each task now.") : null,
      !future && inProgress ? h("p", { class: "small muted" }, "You stopped at step " + (rec.at + 1) + " of " + steps.length + ".") : null,
      future ? null : h("div", { class: "row" },
        h("button", { type: "button", class: "btn primary big", onclick: () => play(false) }, inProgress ? "Continue" : rec && rec.done ? "Play it again" : "Start"),
        inProgress ? h("button", { type: "button", class: "btn", onclick: () => play(true) }, "Start over") : null),
      future || !isDay || roomLaunch ? null : h("div", { class: "row lesson-coverways" },
        h("a", { class: "btn ghost", href: "#/session/" + lesson.day }, lesson.practice ? "The step list" : "The reading version"),
        h("button", { type: "button", class: "btn ghost", onclick: talkThrough }, icon("speaker"), "Talk me through")),
      // Optional reading sits under the interactive lesson tasks.
      !isFluteSetup && day.read && day.read.length ? h("div", { class: "stack tight lesson-coverread" }, h("span", { class: "eyebrow" }, "Optional reading"), readingList(day.read)) : null);
  }
  function showCover() {
    if (player) { player.destroy(); player = null; }
    page.replaceChildren(cover());
    window.scrollTo(0, 0);
  }

  // Opening the day of a part-done lesson goes straight to its step; the cover is one tap away (x).
  const rec0 = lessonRecord(lesson.id);
  // Clear start intent from Today or a room card means enter the activity immediately.
  if (!future && (anchor === "start" || anchor === "room")) play(false);
  else if (!future && anchor === "resume" && rec0 && rec0.at > 0) play(false);
  else page.append(cover());
  return () => { if (player) player.destroy(); document.querySelectorAll("dialog.sheet").forEach(d => { if (d.open) d.close(); d.remove(); }); };
}
