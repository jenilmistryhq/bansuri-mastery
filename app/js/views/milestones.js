// Course > Milestones (#/course/milestones): every milestone, whether it is passed, ready or ahead.
// The same list the course map shows at its top, given its own section.
import { h } from "../util.js";
import { getPlan, current, milestoneState } from "../course.js";

export async function render(main) {
  const plan = getPlan(), cur = current();
  const page = h("div", { class: "page" });
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Course"), h("h1", null, "Milestones"),
    h("p", { class: "muted" }, "Each phase ends with a milestone: a short test of what it taught. Open one to see what is checked and how to take it.")));
  page.append(h("section", { class: "card" }, h("div", { class: "mslist" }, plan.milestones.map(m => {
    const st = milestoneState(m.id).status;
    return h("a", { class: "msrow " + st, href: "#/milestone/" + m.id },
      h("span", { class: "msid" }, m.id), h("span", { class: "mstitle" }, m.title), h("span", { class: "small muted" }, "Day " + m.day),
      h("span", { class: "chip " + (st === "passed" ? "good" : st === "failed" ? "warn" : m.day <= cur ? "info" : "mutedc") }, st === "passed" ? "Passed" : st === "failed" ? "Not yet" : m.day <= cur ? "Ready" : "Ahead"));
  }))));
  main.append(page);
}
