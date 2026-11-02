// Course > Path (#/course, #/plan; docs/redesign 05 L2, W18-W19): the current unit as a path of
// days. A unit is a run of days the plan (app/data/plan.json) takes from the same part of a phase's
// roadmap (the day's "doc"), so the structure is the plan's own. Lesson and review days are nodes,
// runs of practice days fold together, the milestone is a larger node. "#u<k>" after the address
// shows unit k, "#earlier" the units before this one, "#phases" every phase and its units.
import { h, icon } from "../util.js";
import { ring } from "../ui.js";
import { getPlan, getDay, current, status, milestoneState, lastIndex, resolveIndex } from "../course.js";
import { fetchDoc, slug } from "../content.js";
import { lessonForDay } from "../lessons/index.js";
import { lessonRecord } from "../lesson/player.js";
import { dayHref } from "../lessons/days.js";

// The plan's days in runs that share a roadmap section: [{ k, phase, doc, from, to }] (plan indices).
let unitsCache = null;
export function units(plan) {
  if (unitsCache && unitsCache.plan === plan) return unitsCache.list;
  const list = [];
  for (const d of plan.days) {
    const u = list[list.length - 1];
    if (u && u.doc === (d.doc || "") && u.phase === d.phase) u.to = d.n;
    else list.push({ k: list.length, phase: d.phase, doc: d.doc || "", from: d.n, to: d.n });
  }
  unitsCache = { plan, list };
  return list;
}

// A unit's name: its roadmap heading without the "(about weeks ...)" note, or the phase's title.
const titles = new Map();
async function unitTitle(u, phase) {
  const [path, anchor] = u.doc.split("#");
  if (!anchor) return phase ? phase.title : "";
  if (titles.has(u.doc)) return titles.get(u.doc);
  let out = "";
  try {
    const md = await fetchDoc(path);
    for (const m of md.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) if (slug(m[1]) === anchor) { out = m[1].replace(/\s*\([^)]*\)\s*$/, "").trim(); break; }
  } catch (e) { /* the phase title stands in */ }
  out = out || (phase ? phase.title : "");
  titles.set(u.doc, out);
  return out;
}

const phaseOfId = (plan, id) => plan.phases.find(p => p.id === id) || null;
const span = (a, b) => (a === b ? "Day " + a : "Days " + a + "-" + b);

// One day's state on the path: done, today or to come.
function dayStatus(n) { const st = status(n); return st === "current" ? "today" : st === "done" ? "done" : "ahead"; }
const STATE_WORD = { done: "Done", today: "Today", ahead: "To come" };
function mark(st) {
  return [h("span", { class: "cpmark", "aria-hidden": "true" }, st === "done" ? icon("check") : null), h("span", { class: "sr-only" }, STATE_WORD[st])];
}

// The nodes of a unit: lesson days, review days, milestones and today on their own; the practice
// days between them folded into one row that opens to list them. Away from today (more than two
// nodes before or after it), practice and review days fold together too, so a long unit stays
// short; lessons and the milestone always keep their own node.
function pathNodes(u, offset) {
  const plan = getPlan(), cur = current(), items = [];
  for (let i = u.from; i <= u.to; i++) {
    const n = i + offset, d = plan.days[i], lesson = lessonForDay(i);
    const type = d.kind === "milestone" && d.milestone ? "ms" : n === cur ? "today" : lesson ? "lesson" : d.kind === "review" ? "review" : "practice";
    const last = items[items.length - 1];
    if (type === "practice" && last && last.type === "practice") last.days.push(n);
    else items.push({ type, days: [n], d, lesson });
  }
  const at = items.findIndex(x => x.type === "today");
  const near = k => at >= 0 && Math.abs(k - at) <= 2;
  const nodes = [];
  items.forEach((x, k) => {
    const prev = nodes[nodes.length - 1];
    if ((x.type === "practice" || x.type === "review") && !near(k) && prev && prev.type === "fold" && !near(k - 1)) { prev.days.push(...x.days); prev.mixed = prev.mixed || x.type === "review"; return; }
    if ((x.type === "practice" || x.type === "review") && !near(k)) nodes.push({ type: "fold", days: x.days.slice(), mixed: x.type === "review", one: x });
    else nodes.push(x);
  });
  return nodes.map(x => {
    const n = x.days[0];
    if (x.type === "ms") {
      const ms = plan.milestones.find(m => m.id === x.d.milestone), ms0 = milestoneState(x.d.milestone);
      const st = ms0.status === "passed" ? "done" : n === cur ? "today" : "ahead";
      return h("li", { class: "cpnode cpms " + st },
        h("a", { href: "#/milestone/" + x.d.milestone }, h("span", { class: "cpmark cpmsmark" }, x.d.milestone),
          h("span", { class: "cpbody" }, h("b", null, ms ? ms.title : x.d.milestone),
            h("span", { class: "small muted" }, "Day " + n + " - " + (ms0.status === "passed" ? "Passed" : ms0.status === "failed" ? "Not passed yet" : n === cur ? "Today" : "Milestone")))));
    }
    if (x.type === "today") return dayRow(n, x.lesson ? "Lesson" : x.d.kind === "review" ? "Review" : "Practice", x.lesson ? x.lesson.title : x.d.title, "today");
    if (x.type === "lesson") return dayRow(n, "Lesson", x.lesson.title, dayStatus(n));
    if (x.type === "review") return reviewRow(n);
    // A fold of one review day is just that day.
    if (x.type === "fold" && x.days.length === 1 && x.mixed) return reviewRow(n);
    return foldRow(x.days, x.mixed);
  });
}
const quizOf = n => { const q = ((lessonRecord("p" + n) || {}).data || {}).quiz; return q && q.of ? "quiz " + q.firstTry + "/" + q.of : null; };
function reviewRow(n) { return dayRow(n, "Review", null, dayStatus(n), quizOf(n)); }
function foldRow(days, mixed) {
  const a = days[0], b = days[days.length - 1], done = days.filter(n => dayStatus(n) === "done").length;
  const st = done === days.length ? "done" : "ahead", what = mixed ? "Practice and review" : "Practice";
  if (days.length === 1) return dayRow(a, what, null, st);
  return h("li", { class: "cpnode cprun " + st },
    h("details", null,
      h("summary", null, mark(st), h("span", { class: "cpday" }, span(a, b)), h("span", { class: "cpwhat" }, what),
        done ? h("span", { class: "cpnote small muted" }, done + " of " + days.length) : null),
      h("ol", { class: "cprundays" }, days.map(n => {
        const d = getDay(n) || {}, q = d.kind === "review" ? quizOf(n) : null;
        return h("li", null, h("a", { href: "#/day/" + n }, "Day " + n), " ", h("span", { class: "small muted" }, d.kind === "review" ? (q ? "Review, " + q : "Review") : d.title || ""));
      }))));
}
function dayRow(n, what, title, st, note) {
  return h("li", { class: "cpnode " + st },
    h("a", { href: n === current() ? (dayHref(n) || "#/session/" + n) : "#/day/" + n },
      mark(st),
      h("span", { class: "cpbody" },
        h("span", { class: "cprow" }, h("span", { class: "cpday" }, "Day " + n), h("span", { class: "cpwhat" }, what), st === "today" ? h("span", { class: "chip info" }, "Today") : null, note ? h("span", { class: "cpnote small muted" }, note) : null),
        title ? h("span", { class: "small muted cptitle" }, title) : null)));
}

async function unitView(page, u, isCurrent, offset) {
  const plan = getPlan(), cur = current(), phase = phaseOfId(plan, u.phase);
  const title = await unitTitle(u, phase);
  const len = u.to - u.from + 1, at = Math.min(len, Math.max(0, resolveIndex(cur) - u.from + 1));
  const done = [...Array(len).keys()].filter(i => dayStatus(u.from + i + offset) === "done").length;
  const go = dayHref(cur) || "#/session/" + cur;
  page.append(h("section", { class: "hero cpunit" },
    h("span", { class: "cpphase" }, phase ? "Phase " + phase.id + ": " + phase.title : "Course"),
    h("h1", null, title),
    isCurrent ? h("div", { class: "journey" },
      h("div", { class: "row between small" }, h("span", null, span(u.from + offset, u.to + offset)), h("b", null, "day " + at + " of " + len)),
      h("div", { class: "progressbar", role: "progressbar", "aria-label": "Progress through this unit", "aria-valuemin": "0", "aria-valuemax": String(len), "aria-valuenow": String(at) },
        h("i", { style: { width: (at / len * 100) + "%" } })))
      : h("p", { class: "small muted" }, span(u.from + offset, u.to + offset) + " - " + done + " of " + len + " days done"),
    isCurrent ? h("a", { class: "btn primary big", href: go }, "Continue: Day " + cur) : h("a", { class: "btn", href: "#/course" }, "Back to this unit")));
  page.append(h("ol", { class: "coursepath", "aria-label": "Days in this unit" }, pathNodes(u, offset)));
}

async function earlierView(page, list, curUnit) {
  const plan = getPlan();
  page.append(h("section", { class: "hero" }, h("a", { class: "backlink", href: "#/course" }, "Course"), h("h1", null, "Earlier units")));
  const before = list.filter(u => u.k < curUnit.k).reverse();
  if (!before.length) { page.append(h("p", { class: "muted" }, "This is the first unit.")); return; }
  const rows = await Promise.all(before.map(async u => {
    const phase = phaseOfId(plan, u.phase);
    return h("li", { class: "cpnode done" }, h("a", { href: "#/course#u" + u.k }, mark("done"),
      h("span", { class: "cpbody" }, h("b", null, await unitTitle(u, phase)), h("span", { class: "small muted" }, "Phase " + u.phase + " - " + span(u.from, u.to)))));
  }));
  page.append(h("ol", { class: "coursepath cpunits" }, rows));
}

async function phasesView(page, list) {
  const plan = getPlan(), cur = current(), curIdx = resolveIndex(cur), curPhase = (getDay(cur) || {}).phase;
  page.append(h("section", { class: "hero" }, h("a", { class: "backlink", href: "#/course" }, "Course"), h("h1", null, "All phases")));
  for (const ph of plan.phases) {
    const days = plan.days.filter(d => d.phase === ph.id);
    if (!days.length) continue;
    const done = days.filter(d => d.n < cur).length;
    const ms = plan.milestones.filter(m => days.some(d => d.n === m.day)).map(m => m.id);
    const us = list.filter(u => u.phase === ph.id);
    const rows = await Promise.all(us.map(async u => {
      const st = u.to < curIdx ? "done" : u.from <= curIdx ? "today" : "ahead";
      return h("li", { class: "cpnode " + st }, h("a", { href: "#/course#u" + u.k }, mark(st),
        h("span", { class: "cpbody" }, h("b", null, await unitTitle(u, ph)), h("span", { class: "small muted" }, span(u.from, u.to)))));
    }));
    const box = h("details", { class: "phasebox" },
      h("summary", { class: "pathhead" },
        ring(done / days.length * 100, undefined, { size: 54, stroke: 6, cls: done >= days.length ? "complete" : "" }),
        h("span", { class: "pathtext" }, h("h2", null, "Phase " + ph.id + ": " + ph.title),
          h("span", { class: "small muted" }, span(days[0].n, days[days.length - 1].n) + (ms.length ? " - " + ms.join(", ") : ""))),
        h("span", { class: "chip " + (done >= days.length ? "good" : ph.id === curPhase ? "info" : "mutedc") }, done >= days.length ? "Done" : ph.id === curPhase ? "In progress" : "Ahead")),
      h("ol", { class: "coursepath cpunits" }, rows),
      h("a", { class: "small", href: "#/read/" + ph.doc }, "Phase " + ph.id + " roadmap"));
    if (ph.id === curPhase) box.open = true;
    page.append(box);
  }
  if (plan.cycle) page.append(h("p", { class: "small muted" }, "After Day " + lastIndex() + ", Phase 5's themed weeks repeat (Days " + plan.cycle.from + "-" + plan.cycle.to + ") for as long as you keep practising."));
}

export async function render(main, { anchor } = {}) {
  const plan = getPlan();
  const list = units(plan);
  const cur = current(), curIdx = resolveIndex(cur);
  const curUnit = list.find(u => u.from <= curIdx && curIdx <= u.to) || list[0];
  const page = h("div", { class: "page coursepage" });
  const m = /^u(\d+)$/.exec(anchor || "");
  if (anchor === "phases") await phasesView(page, list);
  else if (anchor === "earlier") await earlierView(page, list, curUnit);
  else {
    const u = (m && list[Number(m[1])]) || curUnit, isCurrent = u === curUnit;
    // Past the written plan the Phase 5 cycle repeats: today's unit shows today's day numbers.
    await unitView(page, u, isCurrent, isCurrent ? cur - curIdx : 0);
    page.append(h("div", { class: "row cpmore" },
      curUnit.k > 0 ? h("a", { class: "btn", href: "#/course#earlier" }, "Earlier units") : null,
      h("a", { class: "btn", href: "#/course#phases" }, "All phases")));
  }
  main.append(page);
}
