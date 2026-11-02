// An interactive lesson (#/lesson/<id>): a cover (what it is, how long, its chapters), then the
// lesson player (lesson/player.js). Finishing it passes what it covers (for M0: Day 0 and M0).
import { h, icon } from "../util.js";
import { LESSONS } from "../lessons/index.js";
import { practiceLesson, localise } from "../lessons/practice.js";
import { lessonPlayer, lessonRecord, flatSteps } from "../lesson/player.js";
import { celebrate } from "../fun.js";
import { current } from "../course.js";

export async function render(main, { params }) {
  const lesson = LESSONS[params && params[0]] || practiceLesson(params && params[0]);
  if (lesson && lesson.practice) await localise(lesson);
  const page = h("div", { class: "page lessonpage" });
  main.append(page);
  if (!lesson) { page.append(h("section", { class: "card" }, h("h1", null, "Lesson not found"), h("a", { class: "btn", href: "#/today" }, "Back to today"))); return undefined; }
  let player = null;
  // A day's lesson opens on that day (a lesson already done can always be played again).
  if (lesson.day !== undefined && lesson.day > current() && !(lessonRecord(lesson.id) || {}).done) {
    page.append(h("section", { class: "card lesson-cover" }, h("span", { class: "eyebrow" }, "Day " + lesson.day + " lesson"), h("h1", null, lesson.title),
      h("p", null, "This lesson opens on Day " + lesson.day + ". Each day builds on the one before."), h("a", { class: "btn primary", href: "#/today" }, "Back to today")));
    return undefined;
  }

  function play(fresh) {
    if (player) player.destroy();
    player = lessonPlayer(lesson, {
      onExit: () => { location.hash = "#/today"; },
      onFinished: res => {
        celebrate(lesson.day !== undefined ? "Day " + lesson.day + " complete!" : "Lesson complete!");
        page.replaceChildren(h("section", { class: "card lesson-end" },
          h("div", { class: "lesson-burst", "aria-hidden": "true" }, icon("star")),
          h("h1", null, "Well done."),
          h("p", null, res.advanced ? "Day " + (lesson.day + 1) + " is open. Come back tomorrow for it: the day's practice is what makes it stick." : "You went through the lesson again."),
          h("div", { class: "row" }, h("a", { class: "btn primary big", href: "#/today" }, "Back to today"), lesson.day === 0 ? h("a", { class: "btn", href: "#/journal" }, "See your time capsule") : null)));
      },
    });
    if (fresh) player.restart();
    page.replaceChildren(player.el);
  }

  // The cover: start, or carry on where you stopped.
  const rec = lessonRecord(lesson.id), steps = flatSteps(lesson);
  const inProgress = rec && !rec.done && rec.at > 0;
  page.append(h("section", { class: "card lesson-cover" },
    h("span", { class: "eyebrow" }, lesson.practice ? "Day " + lesson.day + " practice" : lesson.day !== undefined ? "Day " + lesson.day + " lesson" : "Lesson"),
    h("h1", null, lesson.title),
    h("p", { class: "muted" }, "About " + lesson.minutes + " minutes. Have your flute with you, and headphones or a speaker."),
    h("ol", { class: "lesson-chapters" }, lesson.chapters.map(c => h("li", null, c.title))),
    inProgress ? h("p", { class: "small muted" }, "You stopped at step " + (rec.at + 1) + " of " + steps.length + ".") : null,
    h("div", { class: "row" },
      h("button", { type: "button", class: "btn primary big", onclick: () => play(false) }, inProgress ? "Continue" : rec && rec.done ? "Play it again" : "Start"),
      inProgress ? h("button", { type: "button", class: "btn", onclick: () => play(true) }, "Start over") : null,
      lesson.day !== undefined ? h("a", { class: "btn ghost", href: "#/session/" + lesson.day }, lesson.practice ? "The step list" : "The reading version") : null)));
  return () => { if (player) player.destroy(); };
}
