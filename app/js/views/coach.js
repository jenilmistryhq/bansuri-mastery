// Coach (#/coach): diagnose a practice problem from the course's troubleshooting guides.
// Works offline; no AI and no network beyond the app's own files.
import { h, clear } from "../util.js";
import { renderMarkdown, fetchDoc, tablesOf, sectionOf } from "../content.js";

export async function render(main) {
  const page = h("div", { class: "page" });
  main.append(page);
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Coach"), h("h1", null, "What is going wrong?"),
    h("p", { class: "muted" }, "Pick the closest symptom. The coach shows the most likely causes, quick checks, the drills that fix it, how to know it worked, and when to see a teacher.")));

  const md = await fetchDoc("troubleshooting/README.md");
  const table = tablesOf(md).find(t => t.head.some(x => /symptom/i.test(x)));
  const rows = table ? table.rows : [];
  const causeCol = table ? table.head.find(x => /cause/i.test(x)) : null;
  const out = h("div", { class: "stack", role: "region", "aria-live": "polite", "aria-label": "Diagnosis" });
  const list = h("div", { class: "row", role: "group", "aria-label": "Symptoms" });

  for (const r of rows) {
    const b = h("button", { type: "button", class: "btn", "aria-pressed": "false" }, r.Symptom);
    b.addEventListener("click", async () => {
      list.querySelectorAll("button").forEach(x => { x.classList.toggle("primary", x === b); x.setAttribute("aria-pressed", String(x === b)); });
      const m = /\(([^)]+\.md)\)/.exec(r.Guide || "");
      const path = m ? "troubleshooting/" + m[1] : null;
      clear(out).append(h("p", { class: "muted" }, "Loading..."));
      const parts = [h("h2", null, r.Symptom), h("p", null, h("b", null, "Most likely causes, most likely first: "), (causeCol && r[causeCol]) || "")];
      if (path) {
        const guide = await fetchDoc(path);
        for (const re of [/^quick checks/i, /^fixes and drills/i, /^how to verify/i, /^when to seek a teacher/i]) {
          const sec = sectionOf(guide, re);
          if (sec) { const node = renderMarkdown(sec, path).node; node.classList.add("reader"); parts.push(h("div", { class: "card flat" }, node)); }
        }
        parts.push(h("div", { class: "row" }, h("a", { class: "btn", href: "#/read/" + path }, "Open the full guide"), h("a", { class: "btn", href: "#/read/troubleshooting/README.md" }, "The diagnosis method")));
      }
      clear(out).append(...parts);
      out.querySelector("h2").setAttribute("tabindex", "-1");
      out.querySelector("h2").focus({ preventScroll: false });
    });
    list.append(b);
  }

  page.append(h("section", { class: "card" }, list, out,
    h("p", { class: "small muted" }, "Pain, numbness or tingling that does not go away: stop and see a doctor or physiotherapist. ",
      h("a", { href: "#/read/troubleshooting/TS-08-body-pain-and-tension.md" }, "Read the medical caution"), ". For tone, posture and embouchure, a live teacher sees what no guide can.")));
}
