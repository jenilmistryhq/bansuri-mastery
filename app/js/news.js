// "What's new": a short note after an update, shown once on Today (as the day's one notice).
// New learners do not see notes about changes they never knew the app without.
import { h } from "./util.js";
import { getState, update } from "./state.js";

export const NEWS = {
  id: "2026-11-progress",
  title: "New: a progress dashboard",
  items: [
    "Me now answers five questions: am I improving, am I practising regularly, where am I, what to work on, and level and badges.",
    "Today is simpler: Resume, one thing to fix, and the session.",
    "Lessons read in plain words, and the Hindi lessons include quizzes and checklists.",
  ],
};

export function newsCard() {
  const s = getState();
  if (!s.startedAt) { if (s.prefs.newsSeen !== NEWS.id) update(st => { st.prefs.newsSeen = NEWS.id; }); return null; }
  if (s.prefs.newsSeen === NEWS.id) return null;
  const card = h("section", { class: "card newscard" },
    h("div", { class: "row between" }, h("h2", null, NEWS.title),
      h("button", { type: "button", class: "btn ghost small", onclick: () => { update(st => { st.prefs.newsSeen = NEWS.id; }); card.remove(); } }, "Got it")),
    h("ul", { class: "small" }, NEWS.items.map(t => h("li", null, t))),
    h("a", { href: "#/progress" }, "See your progress"));
  return card;
}
