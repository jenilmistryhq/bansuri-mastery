// An interactive lesson (#/lesson/<id>): a cover (what it is, how long, its chapters), then the
// lesson player (lesson/player.js). Finishing it passes what it covers (for M0: Day 0 and M0).
// The cover is the one cover of a day (#/day/N comes here, docs/redesign 05 L3); "#resume" after
// the address goes straight to the step a part-done lesson stopped on, and closing the player
// comes back to the cover (W32).
import { h, icon } from "../util.js";
import { LESSONS } from "../lessons/index.js";
import { practiceLesson, localise } from "../lessons/practice.js";
import { lessonPlayer, lessonRecord, flatSteps } from "../lesson/player.js";
import { celebrate } from "../fun.js";
import { current, getDay, streaks } from "../course.js";
import { xpState } from "../xp.js";
import { today } from "../util.js";
import { oneDay } from "../lessons/oneday.js";
import { readingList } from "../lesson/learn.js";
import { update } from "../state.js";
import { setSettings } from "../core/settings.js";
import { ac } from "../core/audio.js";

export async function render(main, { params, anchor }) {
  const raw = LESSONS[params && params[0]] || practiceLesson(params && params[0]);
  // One Day N: the lesson carries the day's whole session (lessons/oneday.js).
  const lesson = raw && raw.day !== undefined ? oneDay(raw, getDay(raw.day)) : raw;
  if (lesson) await localise(lesson);
  const page = h("div", { class: "page lessonpage" });
  main.append(page);
  if (!lesson) { page.append(h("section", { class: "card" }, h("h1", null, "Lesson not found"), h("a", { class: "btn", href: "#/today" }, "Back to today"))); return undefined; }
  let player = null;
  // A day's lesson opens on that day (a lesson already done can always be played again); before
  // then its cover shows what it holds, with when it opens in place of Start (W20).
  const future = lesson.day !== undefined && lesson.day > current() && !(lessonRecord(lesson.id) || {}).done;

  // Points, quiet and last (redesign L5, decision 6): today's XP and the streak, linking to Me.
  function points() {
    const xp = (xpState().days || {})[today()] || 0, st = streaks().current;
    if (!xp && !st) return null;
    return h("a", { class: "small muted lesson-points", href: "#/me" }, [xp ? "+" + xp + " XP today" : "", st ? st + (st === 1 ? " day" : " days") + " in a row" : ""].filter(Boolean).join(", "));
  }

  function play(fresh) {
    if (player) player.destroy();
    player = lessonPlayer(lesson, {
      // Closing the player keeps the place and comes back to the cover (W32).
      onExit: () => showCover(),
      onFinished: res => {
        celebrate(lesson.day !== undefined ? "Day " + lesson.day + " complete!" : "Lesson complete!");
        page.replaceChildren(h("section", { class: "card lesson-end" },
          h("div", { class: "lesson-burst", "aria-hidden": "true" }, icon("star")),
          h("h1", null, "Well done."),
          h("p", null, res.advanced ? "Day " + (lesson.day + 1) + " is open. Come back tomorrow for it: the day's practice is what makes it stick." : "You went through the lesson again."),
          h("div", { class: "row" }, h("a", { class: "btn primary big", href: "#/today" }, "Back to today"), lesson.day === 0 ? h("a", { class: "btn", href: "#/me/journal/capsule" }, "See your time capsule") : null),
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
    const inProgress = rec && !rec.done && rec.at > 0;
    const day = lesson.oneDay || {};
    // A chapter made from one block, done as written, shows that block's minutes.
    const mins = c => (c.block ? c.block.minutes || 0 : 0);
    const isDay = lesson.day !== undefined;
    // The chapters (on a practice day, every block of the day: lessons/practice.js outline), each
    // with its tick (W20): done in the step list, or every step of it behind the step the lesson
    // stopped on; all of them once the lesson is finished.
    const firstOf = [];
    lesson.chapters.reduce((k, c, i) => { firstOf[i] = k; return k + c.steps.length; }, 0);
    const chDone = i => !!rec && (rec.done && !(rec.at > 0) ? true : (rec.at || 0) >= firstOf[i] + lesson.chapters[i].steps.length);
    const rows = (lesson.outline || lesson.chapters.map((c, i) => ({ title: c.title, block: c.block, chapter: i })))
      .map(r => Object.assign({}, r, { ticked: !future && (!!r.done || (r.chapter !== undefined && chDone(r.chapter))) }));
    return h("section", { class: "card lesson-cover" },
      h("a", { class: "backlink", href: "#/course" }, "Course"),
      h("span", { class: "eyebrow" }, lesson.review ? "Day " + lesson.day + " review" : lesson.practice ? "Day " + lesson.day + " practice" : isDay ? "Day " + lesson.day + " lesson" : "Lesson"),
      h("h1", null, lesson.title),
      h("p", { class: "muted" }, "About " + lesson.minutes + " minutes. Have your flute with you, and headphones or a speaker."),
      day.pass ? h("div", { class: "lesson-goal" }, h("span", { class: "eyebrow" }, "Today's goal"), h("p", null, day.pass)) : null,
      h("ol", { class: "lesson-chapters" }, rows.map((c, i) => h("li", { class: c.ticked ? "done" : null },
        h("span", { class: "lesson-chapno", "aria-hidden": "true" }, String(i + 1)), h("span", null, c.title),
        mins(c) ? h("span", { class: "small muted" }, mins(c) + " min") : null,
        h("span", { class: "lesson-chaptick", "aria-hidden": "true" }, c.ticked ? icon("check") : null),
        c.ticked ? h("span", { class: "sr-only" }, "Done") : null))),
      future ? h("p", { class: "lesson-opens" }, "Opens after Day " + (lesson.day - 1)) : null,
      !future && inProgress ? h("p", { class: "small muted" }, "You stopped at step " + (rec.at + 1) + " of " + steps.length + ".") : null,
      future ? null : h("div", { class: "row" },
        h("button", { type: "button", class: "btn primary big", onclick: () => play(false) }, inProgress ? "Continue" : rec && rec.done ? "Play it again" : "Start"),
        inProgress ? h("button", { type: "button", class: "btn", onclick: () => play(true) }, "Start over") : null),
      future || !isDay ? null : h("div", { class: "row lesson-coverways" },
        h("a", { class: "btn ghost", href: "#/session/" + lesson.day }, lesson.practice ? "The step list" : "The reading version"),
        h("button", { type: "button", class: "btn ghost", onclick: talkThrough }, icon("speaker"), "Talk me through")),
      // The day's readings, under Start (they open in a sheet; each also sits on its own step).
      day.read && day.read.length ? h("div", { class: "stack tight lesson-coverread" }, h("span", { class: "eyebrow" }, "Read for this day"), readingList(day.read)) : null);
  }
  function showCover() {
    if (player) { player.destroy(); player = null; }
    page.replaceChildren(cover());
    window.scrollTo(0, 0);
  }

  // Opening the day of a part-done lesson goes straight to its step; the cover is one tap away (x).
  const rec0 = lessonRecord(lesson.id);
  if (!future && anchor === "resume" && rec0 && rec0.at > 0) play(false);
  else page.append(cover());
  return () => { if (player) player.destroy(); document.querySelectorAll("dialog.sheet").forEach(d => { if (d.open) d.close(); d.remove(); }); };
}
