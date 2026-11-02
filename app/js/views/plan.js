// Course map (#/plan): every phase, week and day, with milestones and where you are.
import { h } from "../util.js";
import { ring } from "../ui.js";
import { getPlan, getDay, current, status, milestoneState, lastIndex } from "../course.js";

// "Day 0 (one session)", "Days 1-42 - about 6 weeks".
function span(days) {
  const a = days[0].n, b = days[days.length - 1].n, wk = Math.round(days.length / 7);
  if (a === b) return "Day " + a + " (one session)";
  return "Days " + a + "-" + b + (wk >= 2 ? " - about " + wk + " weeks" : wk === 1 ? " - about a week" : "");
}

export async function render(main) {
  const plan = getPlan();
  const cur = current();
  const page = h("div", { class: "page" });
  page.append(h("section", { class: "hero" },
    h("span", { class: "eyebrow" }, "Course map"),
    h("h1", null, "Your path to independent musicianship"),
    h("p", { class: "muted" }, "Days are practice days, not calendar days. Move on by finishing each day and passing each milestone. Click any day to see its plan.")));

  // The next milestone, in one line; every milestone is listed under Course > Milestones.
  const nextMs = plan.milestones.find(m => milestoneState(m.id).status !== "passed");
  if (nextMs) page.append(h("a", { class: "card row between nextms", href: "#/milestone/" + nextMs.id },
    h("span", null, h("span", { class: "small muted" }, "Next milestone: "), h("b", null, nextMs.id + " " + nextMs.title)), h("span", { class: "small muted" }, "Day " + nextMs.day)));

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
          h("span", { class: "small muted" }, span(days) + " - " + done + " of " + days.length + (days.length === 1 ? " day" : " days") + " done")),
        h("span", { class: "chip " + (done >= days.length ? "good" : ph.id === curPhase ? "info" : "mutedc") }, done >= days.length ? "Done" : ph.id === curPhase ? "In progress" : "Ahead")),
      h("div", { class: "phaseacts" }, ph.id === curPhase ? h("a", { class: "btn primary", href: "#/session/" + cur }, "Continue: Day " + cur) : null,
        h("a", { class: "small", href: "#/read/" + ph.doc }, "Phase " + ph.id + " roadmap")),
      h("div", { class: "stack" }, [...weeks.entries()].map(([w, list]) => h("div", { class: "weekrow" },
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
