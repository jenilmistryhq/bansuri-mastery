// Compatibility resolver for old day URLs and existing schedule data. Learners enter the activity
// directly; numeric days remain internal to the curriculum structure.
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
  if (id) return "#/lesson/" + id + "#start";
  const d = getDay(n);
  if (d && d.kind === "milestone" && d.milestone) return "#/milestone/" + d.milestone;
  return null;
}
