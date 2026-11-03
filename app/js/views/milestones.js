// Course > Milestones (#/course/milestones): every milestone, whether it is passed, ready or ahead.
// The same list the course map shows at its top, given its own section. Passed rows show their
// rubric score (W19a: "3/4"); the next one ahead says how many days away it is.
import { h } from "../util.js";
import { getPlan, current, milestoneState } from "../course.js";

// The average of a saved rubric (1-4), or null when it was not scored.
export function rubricScore(rubric) {
  const v = Object.values(rubric || {}).map(Number).filter(x => x >= 1 && x <= 4);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

export async function render(main) {
  const plan = getPlan(), cur = current();
  const page = h("div", { class: "page" });
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Course"), h("h1", null, "Milestones"),
    h("p", { class: "muted" }, "Each phase ends with a milestone: a short test of what it taught. Open one to see what is checked and how to take it.")));
  const next = plan.milestones.find(m => m.day > cur && milestoneState(m.id).status !== "passed");
  page.append(h("section", { class: "card" }, h("div", { class: "mslist" }, plan.milestones.map(m => {
    const ms = milestoneState(m.id), st = ms.status;
    // The score of the attempt that passed (the first one), from its rubric.
    const won = st === "passed" ? (ms.attempts || []).find(a => a && a.passed) : null;
    const score = won ? rubricScore(won.rubric) : null;
    const away = m === next ? m.day - cur : 0;
    const extra = score ? h("span", { class: "msextra mono", "aria-label": "Rubric " + score + " of 4" }, score + "/4")
      : away ? h("span", { class: "msextra" }, away === 1 ? "1 day away" : away + " days away") : h("span", { class: "msextra" });
    return h("a", { class: "msrow " + st + (m === next ? " msnext" : ""), href: "#/milestone/" + m.id },
      h("span", { class: "msid" }, m.id), h("span", { class: "mstitle" }, m.title), h("span", { class: "small muted" }, "Day " + m.day), extra,
      h("span", { class: "chip " + (st === "passed" ? "good" : st === "failed" ? "warn" : m.day <= cur ? "info" : "mutedc") }, st === "passed" ? "Passed" : st === "failed" ? "Not yet" : m.day <= cur ? "Ready" : "Ahead"));
  }))));
  main.append(page);
}
