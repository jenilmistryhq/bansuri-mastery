// My students (Me > Teacher > Students; #/students), for teachers: students send their teacher link (Me > Teacher > Share, "for my
// teacher"); paste the links here to see everyone in one table. Kept on this device only; a newer
// link from the same student replaces the older one.
import { h, toast, fmtDate, fmtMinutes } from "../util.js";
import { decode } from "./share.js";
import { codeOf } from "../core/theory.js";

const KEY = "bansuri.students";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } };
const save = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ } };

export function addStudentLinks(text) {
  const found = [...String(text).matchAll(/#\/share\/([A-Za-z0-9_-]+)/g)].map(m => m[1]);
  let list = load(), added = 0;
  for (const p of found) {
    const c = decode(p);
    if (!c) continue;
    // A newer link from the same student replaces the older one. The same student means the same
    // learner id (made on their device); a name alone, which anyone could type, replaces only an
    // older link that also had no id.
    const name = (c.name || "").trim();
    list = list.filter(x => {
      const old = decode(x.p) || {};
      if (c.id || old.id) return c.id !== old.id;
      return !name || old.name !== name;
    });
    list.push({ p, added: new Date().toISOString().slice(0, 10) });
    added++;
  }
  save(list);
  return added;
}

// The students view (Me > Teacher > Students): the paste box and the table.
export function studentsBody() {
  const input = h("textarea", { class: "input", rows: "3", placeholder: "Paste one or more teacher links from your students", "aria-label": "Student links" });
  const tableHost = h("div");
  const draw = () => {
    const rows = load().map(x => ({ x, c: decode(x.p) })).filter(r => r.c).sort((a, b) => (a.c.name || "").localeCompare(b.c.name || ""));
    if (!rows.length) { tableHost.replaceChildren(h("p", { class: "emptystate" }, "No students yet. Ask each student to open Me, Teacher, Share progress, tick \"For my teacher\", and send you the link.")); return; }
    const weakest = c => { const hb = (c.holds || []).filter(([k]) => k !== "any").sort((a, b) => a[1] - b[1])[0]; return hb ? codeOf(Number(hb[0])) + " " + hb[1] + " s" : "-"; };
    const lastPlay = c => { const p = (c.plays || [])[c.plays ? c.plays.length - 1 : 0]; return p ? p[1] + "% (" + p[0] + ")" : "-"; };
    tableHost.replaceChildren(h("div", { class: "tablewrap" }, h("table", null,
      h("thead", null, h("tr", null, ["Student", "Day", "Phase", "Streak", "Practice", "Milestones", "Shortest hold", "Last play-along", "Link from", ""].map(t => h("th", null, t)))),
      h("tbody", null, rows.map(({ x, c }) => h("tr", null,
        h("td", null, h("a", { href: "#/share/" + x.p }, c.name || "Unnamed")), h("td", null, String(c.day)), h("td", null, String(c.phase)), h("td", null, String(c.streak)),
        h("td", null, fmtMinutes(c.minutes || 0) + (c.weeks && c.weeks.length ? " (" + c.weeks[c.weeks.length - 1] + " min this week)" : "")),
        h("td", null, c.ms.length ? c.ms.join(" ") : "-"), h("td", null, weakest(c)), h("td", null, lastPlay(c)), h("td", null, c.date ? fmtDate(c.date) : "-"),
        h("td", null, h("button", { type: "button", class: "btn small ghost", onclick: () => { save(load().filter(y => y.p !== x.p)); draw(); } }, "Remove"))))))));
  };
  draw();
  return [h("section", { class: "hero" }, h("h1", null, "My students"),
    h("p", { class: "muted" }, "For teachers. Students send you their progress link; this table keeps them together on this device. Nothing is uploaded, so it updates when a student sends a new link.")),
  h("section", { class: "card" }, input, h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => { const n = addStudentLinks(input.value); input.value = ""; toast(n ? n + " student link" + (n === 1 ? "" : "s") + " added." : "No student links found in that text."); draw(); } }, "Add"))),
  h("section", { class: "card" }, tableHost, h("p", { class: "small muted" }, "Each row is what that student's app reported; the app cannot check it."))];
}

export async function render(main) {
  main.append(h("div", { class: "page" }, studentsBody()));
}
