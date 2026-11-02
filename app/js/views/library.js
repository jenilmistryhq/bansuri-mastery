// Course > Book (#/course/book, was the Library): every course page, grouped, with a title filter
// and full-text search.
import { h, clear } from "../util.js";
import { filesList, fetchDoc } from "../content.js";
import { getPlan, current } from "../course.js";
import { xpState } from "../xp.js";
import { store } from "../util.js";

// Lessons as a catalogue: each card shows the day it is taught and how far you got
// (done, in progress, or not started), so the next one to open is obvious.
function lessonCatalogue(docs) {
  const plan = getPlan(), cur = current(), once = xpState().once || {};
  const firstDay = {};
  for (const d of plan.days) for (const id of d.lessons || []) if (firstDay[id] === undefined) firstDay[id] = d.n;
  return h("div", { class: "catalogue" }, docs.map(d => {
    const id = (/L\d\d/.exec(d.path) || [])[0], day = id ? firstDay[id] : undefined;
    const done = !!once["lesson:" + d.path], started = !done && store("bansuri.cardpos." + d.path, 0) > 0;
    const state = done ? "done" : started ? "started" : day !== undefined && day > cur ? "ahead" : "open";
    const title = d.title.replace(/^L\d\d\s*-\s*/, "");
    return h("a", { class: "catcard " + state, href: "#/read/" + d.path },
      h("span", { class: "row between" }, h("span", { class: "chip mutedc mono" }, id || "Page"), done ? h("span", { class: "chip good" }, "✓ Done") : started ? h("span", { class: "chip info" }, "In progress") : day !== undefined ? h("span", { class: "small muted" }, day > cur ? "From Day " + day : "Day " + day) : null),
      h("b", null, title));
  }));
}

const GROUPS = [
  ["start", "Start here"], ["phases", "Roadmap"], ["lessons", "Lessons"], ["exercises", "Exercises"],
  ["projects", "Milestones"], ["reference", "Reference"], ["knowledge-tree", "Knowledge tree"],
];
// The book in three parts (docs/redesign 05 L8): the course's own text, things to look up, and the
// things that have their one home elsewhere (raga cards, listening, fixes, the fingering chart),
// linked instead of copied here [IA1]. Full-text search still reads every page.
const PARTS = [["The course", ["start", "phases", "lessons", "exercises", "projects"]], ["Look it up", ["reference", "knowledge-tree"]]];
const ELSEWHERE = [["In Music: raga cards", "#/music/ragas"], ["In Music: listening", "#/music/listen"], ["In Skills: fix a problem", "#/skills/fix"], ["In Skills: the fingering chart", "#/bench/chart"]];

function groupOf(path) {
  if (!path.includes("/")) return /^0[0359]-|^README/.test(path) ? "start" : "reference";
  const f = path.split("/")[0];
  return f === "tools" ? "start" : f;
}

export async function render(main) {
  const files = await filesList();
  const page = h("div", { class: "page" });
  const input = h("input", { class: "input", type: "search", id: "lib-q", placeholder: "Search the course: meend, alankar, L12", "aria-label": "Filter pages" });
  const fullBtn = h("button", { type: "button", class: "btn" }, "Search all text");
  const results = h("div", { class: "stack" });
  const listHost = h("div", { class: "stack" });

  function drawList() {
    const q = input.value.trim().toLowerCase();
    clear(listHost);
    for (const [part, keys] of PARTS) {
      const cards = [];
      for (const [key, label] of GROUPS.filter(g => keys.includes(g[0]))) {
        const docs = files.docs.filter(d => groupOf(d.path) === key && (!q || (d.title + " " + d.path).toLowerCase().includes(q)));
        if (!docs.length) continue;
        cards.push(h("section", { class: "card" }, h("h3", null, label),
          key === "lessons" ? lessonCatalogue(docs) : h("div", { class: "libgroup" }, docs.map(d => h("a", { href: "#/read/" + d.path }, d.title)))));
      }
      if (cards.length) listHost.append(h("h2", { class: "bookpart" }, part), ...cards);
    }
    if (!listHost.childNodes.length) listHost.append(h("p", { class: "muted" }, "No page titles match. Try Search all text."));
    listHost.append(h("h2", { class: "bookpart" }, "Elsewhere"),
      h("nav", { class: "card bookelse", "aria-label": "Elsewhere" }, ELSEWHERE.map(([label, href]) => h("a", { class: "bookrow", href }, h("span", null, label), h("span", { class: "chev", "aria-hidden": "true" }, ">")))));
  }

  fullBtn.addEventListener("click", async () => {
    const q = input.value.trim();
    clear(results);
    if (q.length < 2) { results.append(h("p", { class: "small muted" }, "Type at least 2 characters.")); return; }
    results.append(h("p", { class: "small muted" }, "Searching..."));
    const needle = q.toLowerCase();
    const hits = [];
    for (const d of files.docs) {
      let text;
      try { text = await fetchDoc(d.path); } catch (e) { continue; }
      const lines = text.split("\n");
      for (let i = 0; i < lines.length && hits.length < 80; i++) {
        if (lines[i].toLowerCase().includes(needle)) hits.push({ d, line: lines[i].replace(/[#|*`>]/g, " ").replace(/\s+/g, " ").trim() });
      }
    }
    clear(results);
    results.append(h("section", { class: "card" }, h("h2", null, hits.length + (hits.length >= 80 ? "+" : "") + " matches for \"" + q + "\""),
      h("div", { class: "libgroup" }, hits.map(x => h("a", { href: "#/read/" + x.d.path }, h("b", null, x.d.title), h("br"), h("span", { class: "small muted" }, x.line.slice(0, 160)))))));
  });
  input.addEventListener("input", drawList);
  input.addEventListener("keydown", e => { if (e.key === "Enter") fullBtn.click(); });

  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Course book"), h("h1", null, "The whole course"),
    h("p", { class: "muted" }, "Every lesson, exercise and reference page. Also available as a ", h("a", { href: "docs/" }, "website"), ".")),
    h("div", { class: "row" }, h("div", { style: { flex: "1 1 260px" } }, input), fullBtn), results, listHost);
  drawList();
  main.append(page);
}
