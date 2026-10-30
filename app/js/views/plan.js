// Course map (#/plan): every phase, week and day, with milestones and where you are.
import { h } from "../util.js";
import { ring } from "../ui.js";
import { getPlan, getDay, current, status, milestoneState, lastIndex } from "../course.js";

export async function render(main) {
  const plan = getPlan();
  const cur = current();
  const page = h("div", { class: "page" });
  page.append(h("section", { class: "hero" },
    h("span", { class: "eyebrow" }, "Course map"),
    h("h1", null, "Your path to independent musicianship"),
    h("p", { class: "muted" }, "Days are practice days, not calendar days. Move on by finishing each day and passing each milestone. Click any day to see its plan.")));

  // Milestones strip.
  page.append(h("section", { class: "card" }, h("h2", null, "Milestones"),
    h("div", { class: "mslist" }, plan.milestones.map(m => {
      const st = milestoneState(m.id).status;
      // A steady grid: the milestone's name wraps on its own line; day and status stay in their columns.
      return h("a", { class: "msrow " + st, href: "#/milestone/" + m.id },
        h("span", { class: "msid" }, m.id), h("span", { class: "mstitle" }, m.title), h("span", { class: "small muted" }, "Day " + m.day),
        h("span", { class: "chip " + (st === "passed" ? "good" : st === "failed" ? "warn" : m.day <= cur ? "info" : "mutedc") }, st === "passed" ? "Passed" : st === "failed" ? "Not yet" : m.day <= cur ? "Ready" : "Ahead"));
    }))));

  const curPhase = (getDay(cur) || {}).phase;
  for (const ph of plan.phases) {
    const days = plan.days.filter(d => d.phase === ph.id);
    if (!days.length) continue;
    const done = days.filter(d => d.n < cur).length;
    const weeks = new Map();
    for (const d of days) { const w = d.week || 0; if (!weeks.has(w)) weeks.set(w, []); weeks.get(w).push(d); }
    const box = h("details", { class: "phasebox" },
      // A phase as a learning path: how far along it is, its status, and a way straight back in.
      h("summary", { class: "pathhead" },
        ring(done / days.length * 100, undefined, { size: 54, stroke: 6, cls: done >= days.length ? "complete" : "" }),
        h("span", { class: "pathtext" }, h("h2", null, "Phase " + ph.id + ": " + ph.title),
          h("span", { class: "small muted" }, "Days " + days[0].n + "-" + days[days.length - 1].n + " - about " + Math.ceil(days.length / 7) + " weeks - " + done + " of " + days.length + " days done")),
        h("span", { class: "chip " + (done >= days.length ? "good" : ph.id === curPhase ? "info" : "mutedc") }, done >= days.length ? "Done" : ph.id === curPhase ? "In progress" : "Ahead")),
      ph.id === curPhase ? h("div", { class: "row" }, h("a", { class: "btn primary", href: "#/session/" + cur }, "Continue: Day " + cur)) : null,
      h("div", { class: "stack" }, h("a", { class: "small", href: "#/read/" + ph.doc }, "Phase " + ph.id + " roadmap"), [...weeks.entries()].map(([w, list]) => h("div", { class: "weekrow" },
        h("span", { class: "small muted" }, w ? "Week " + w : "Day 0"),
        h("div", { class: "days" }, list.map(d => {
          const st = status(d.n);
          const cls = ["dchip", st, d.kind === "milestone" ? "ms" : "", d.kind === "review" ? "review" : ""].join(" ");
          return h("a", { class: cls, href: "#/day/" + d.n, title: "Day " + d.n + ": " + (d.title || "") + (d.milestone ? " (" + d.milestone + ")" : "") }, d.milestone || String(d.n));
        }))))));
    if (ph.id === curPhase) box.open = true;
    page.append(box);
  }
  if (plan.cycle) page.append(h("p", { class: "small muted" }, "After Day " + lastIndex() + ", Phase 5's themed weeks repeat (Days " + plan.cycle.from + "-" + plan.cycle.to + ") for as long as you keep practising."));
  page.append(h("p", { class: "small muted" }, "Legend: filled = done, solid = today, dashed = locked, thick border = milestone, italic = review day."));
  main.append(page);
}
