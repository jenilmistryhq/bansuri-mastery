// A teacher's review arriving (#/feedback/<data>): kept in this browser and shown with the earlier
// reviews; its practice task appears on Today until marked done (review.js).
import { h, icon } from "../util.js";
import { RUBRIC, decodeLink, addFeedback, cleanFeedback, feedback, requests } from "../review.js";
import { getRecording } from "../recorder.js";
import { errorState } from "../states.js";

export function scoreRows(f) {
  return RUBRIC.filter(r => f.scores[r.key]).map(r => h("tr", null, h("th", { scope: "row" }, r.name),
    h("td", null, h("span", { class: "rvdots", "aria-label": f.scores[r.key] + " of 5" }, [1, 2, 3, 4, 5].map(i => h("span", { class: "rvdot" + (i <= f.scores[r.key] ? " on" : "") })))),
    h("td", { class: "small" }, r.levels[f.scores[r.key] - 1] + (f.notes[r.key] ? ". " + f.notes[r.key] : ""))));
}
export function reviewCard(f, title) {
  const card = h("section", { class: "card" }, h("h2", null, title || "Review of " + f.what),
    h("p", { class: "small muted" }, (f.teacher ? f.teacher + ", " : "") + f.date),
    h("table", { class: "rvtable" }, h("tbody", null, scoreRows(f))),
    f.comment ? h("p", null, f.comment) : null,
    f.task ? h("div", { class: "rvtask" }, h("b", null, "Practice task"), h("p", null, f.task), f.due ? h("p", { class: "small muted" }, "Next review by " + f.due) : null) : null);
  listenButton(f).then(b => { if (b) card.append(b); }).catch(() => {});
  return card;
}

// Listen (W75): the recording sent with the request, when it is still in the Journal.
async function listenButton(f) {
  const req = requests().find(r => r.id === f.id);
  const rec = req && req.rec ? await getRecording(req.rec) : null;
  if (!rec || !rec.blob) return null;
  const b = h("button", { type: "button", class: "btn rvlisten" }, icon("play"), " ", h("span", null, "Listen"));
  b.addEventListener("click", () => {
    const url = URL.createObjectURL(rec.blob);
    window.addEventListener("hashchange", () => URL.revokeObjectURL(url), { once: true });
    const media = rec.kind === "video" ? h("video", { controls: true, src: url, playsinline: true, class: "selfview" }) : h("audio", { controls: true, src: url });
    b.replaceWith(media);
    media.play().catch(() => {});
  });
  return b;
}

export async function render(main, { params }) {
  const page = h("div", { class: "page reviewpage" });
  main.append(page);
  let f = null;
  try { const o = await decodeLink(params[0]); if (o && o.kind === "feedback") f = cleanFeedback(o); } catch (e) { f = null; }
  if (!f) { page.append(errorState("This review link could not be read", "It may be cut short. Ask your teacher to send it again.", "#/me/teacher")); return; }
  // A link can come from anyone, so nothing is saved until the learner says so, and the page says
  // whether this answers a review they asked for and whether it would replace one already kept.
  const same = x => ["id", "date", "teacher", "what", "comment", "task", "due"].every(k => (x[k] || null) === (f[k] || null)) && JSON.stringify(x.scores) === JSON.stringify(f.scores);
  const kept = feedback().find(x => f.id && x.id === f.id);
  const asked = requests().find(r => f.id && r.id === f.id);
  const done = () => [h("p", { class: "muted" }, "Saved in the app. The practice task is on Today until you mark it done."),
    h("div", { class: "row" }, h("a", { class: "btn primary", href: "#/today" }, icon("today"), " To Today"), h("a", { class: "btn", href: "#/me/teacher/feedback" }, "All reviews"))];
  const status = h("div", { class: "stack rvaccept" });
  if (kept && same(kept)) status.append(...done());
  else {
    const save = h("button", { type: "button", class: "btn primary big" }, "Save this review");
    save.addEventListener("click", () => { addFeedback(f); status.replaceChildren(...done()); });
    status.append(
      asked ? h("p", null, "This answers the review you asked for" + (asked.what ? ": " + asked.what : "") + ".")
        : h("p", { class: "notice" }, "This is not a reply to a review you asked for in this app. Save it only if you know who sent it."),
      kept ? h("p", { class: "small" }, "It replaces the review " + (kept.teacher ? "from " + kept.teacher + " " : "") + "saved on " + kept.date + ".") : null,
      h("div", { class: "row" }, save, h("a", { class: "btn", href: "#/today" }, "Not now")));
  }
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, f.teacher ? [h("span", null, "Sent by"), " " + f.teacher] : "A review"), h("h1", null, f.what || "A review")),
    reviewCard(f, "This review"), status);
  const older = feedback().filter(x => x.id !== f.id).slice(0, 3);
  if (older.length) page.append(h("h2", null, "Earlier reviews"), ...older.map(x => reviewCard(x)));
}
