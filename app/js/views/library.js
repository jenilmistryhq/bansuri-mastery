// Library (#/library): every course page, grouped, with title filter and full-text search.
import { h, clear } from "../util.js";
import { filesList, fetchDoc } from "../content.js";

const GROUPS = [
  ["start", "Start here"], ["phases", "Roadmap"], ["lessons", "Lessons"], ["exercises", "Exercises"], ["ragas", "Ragas"],
  ["projects", "Milestones"], ["troubleshooting", "Troubleshooting"], ["reference", "Reference"], ["knowledge-tree", "Knowledge tree"],
];

function groupOf(path) {
  if (!path.includes("/")) return /^0[0359]-|^README/.test(path) ? "start" : "reference";
  const f = path.split("/")[0];
  return f === "tools" ? "start" : f;
}

export async function render(main) {
  const files = await filesList();
  const page = h("div", { class: "page" });
  const input = h("input", { class: "input", type: "search", id: "lib-q", placeholder: "Filter by title, e.g. meend, Yaman, L12", "aria-label": "Filter pages" });
  const fullBtn = h("button", { type: "button", class: "btn" }, "Search all text");
  const results = h("div", { class: "stack" });
  const listHost = h("div", { class: "stack" });

  function drawList() {
    const q = input.value.trim().toLowerCase();
    clear(listHost);
    for (const [key, label] of GROUPS) {
      const docs = files.docs.filter(d => groupOf(d.path) === key && (!q || (d.title + " " + d.path).toLowerCase().includes(q)));
      if (!docs.length) continue;
      listHost.append(h("section", { class: "card" }, h("h2", null, label),
        h("div", { class: "libgroup" }, docs.map(d => h("a", { href: "#/read/" + d.path }, d.title)))));
    }
    if (!listHost.childNodes.length) listHost.append(h("p", { class: "muted" }, "No page titles match. Try Search all text."));
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

  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Library"), h("h1", null, "The whole course"),
    h("p", { class: "muted" }, "Every lesson, exercise, raga card and reference page. Also available as a ", h("a", { href: "docs/" }, "website"), ".")),
    h("div", { class: "row" }, h("div", { style: { flex: "1 1 260px" } }, input), fullBtn), results, listHost);
  drawList();
  main.append(page);
}
