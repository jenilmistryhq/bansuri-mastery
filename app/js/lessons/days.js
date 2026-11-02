// One way into a day (docs/redesign 05 L3, 13-one-day): a day opens on its lesson's cover
// (#/lesson/<id>), or straight at the step when its lesson is part done; a test day opens its
// milestone. #/day/N and the Course path both use this, so a day has one cover.
import { lessonForDay } from "./index.js";
import { practiceLesson } from "./practice.js";
import { lessonRecord } from "../lesson/player.js";
import { getDay } from "../course.js";

// The id of day n's lesson (an interactive lesson, or a practice or review day), or null.
export function dayLessonId(n) {
  const l = lessonForDay(n);
  if (l) return l.id;
  const d = getDay(n);
  if (d && (d.kind === "practice" || d.kind === "review") && practiceLesson("p" + n)) return "p" + n;
  return null;
}

// A lesson started and not finished: opening its day goes on at the step it stopped on.
export const inProgress = id => { const r = lessonRecord(id); return !!(r && !r.done && r.at > 0); };

// Where day n opens: its lesson's cover ("#resume" goes straight to the step when part done), its
// milestone, or null (the day keeps its own page).
export function dayHref(n, resume = true) {
  const id = dayLessonId(n);
  if (id) return "#/lesson/" + id + (resume && inProgress(id) ? "#resume" : "");
  const d = getDay(n);
  if (d && d.kind === "milestone" && d.milestone) return "#/milestone/" + d.milestone;
  return null;
}
