// A teacher's review arriving (#/feedback/<data>): kept in this browser and shown with the earlier
// reviews; its practice task appears on Today until marked done (review.js).
import { h, icon } from "../util.js";
import { RUBRIC, decodeLink, addFeedback, feedback } from "../review.js";

export function scoreRows(f) {
  return RUBRIC.filter(r => f.scores[r.key]).map(r => h("tr", null, h("th", { scope: "row" }, r.name),
    h("td", null, h("span", { class: "rvdots", "aria-label": f.scores[r.key] + " of 5" }, [1, 2, 3, 4, 5].map(i => h("span", { class: "rvdot" + (i <= f.scores[r.key] ? " on" : "") })))),
    h("td", { class: "small" }, r.levels[f.scores[r.key] - 1] + (f.notes[r.key] ? ". " + f.notes[r.key] : ""))));
}
export function reviewCard(f, title) {
  return h("section", { class: "card" }, h("h2", null, title || "Review: " + f.what),
    h("p", { class: "small muted" }, (f.teacher ? f.teacher + ", " : "") + f.date),
    h("table", { class: "rvtable" }, h("tbody", null, scoreRows(f))),
    f.comment ? h("p", null, f.comment) : null,
    f.task ? h("div", { class: "rvtask" }, h("b", null, "Practice task"), h("p", null, f.task), f.due ? h("p", { class: "small muted" }, "Next review by " + f.due) : null) : null);
}

export async function render(main, { params }) {
  const page = h("div", { class: "page reviewpage" });
  main.append(page);
  let f = null;
  try { const o = await decodeLink(params[0]); if (o && o.kind === "feedback") f = addFeedback(o); } catch (e) { f = null; }
  if (!f) { page.append(h("section", { class: "card" }, h("h1", null, "This review link could not be read"), h("p", null, "Ask your teacher to send it again."))); return; }
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "From your teacher"), h("h1", null, f.what), h("p", { class: "muted" }, "Saved in the app. The practice task is on Today until you mark it done.")),
    reviewCard(f, "This review"),
    h("div", { class: "row" }, h("a", { class: "btn primary", href: "#/today" }, icon("today"), " To Today"), h("a", { class: "btn", href: "#/me/teacher/feedback" }, "All reviews")));
  const older = feedback().slice(1, 4);
  if (older.length) page.append(h("h2", null, "Earlier reviews"), ...older.map(x => reviewCard(x)));
}
