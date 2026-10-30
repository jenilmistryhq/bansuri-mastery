// Tap-to-define: terms from the course glossary (06-GLOSSARY.md) become small buttons in lesson
// text; tapping one shows its plain-English meaning in place.
import { h } from "./util.js";
import { fetchDoc, tablesOf } from "./content.js";

let cache = null;

// [{ term, re, meaning }] from the glossary tables. "**Meend** (mind)" gives "Meend" and "mind".
export function parseGlossary(md) {
  const out = [];
  for (const t of tablesOf(md)) {
    if (!t.head.includes("Term") || !t.head.includes("Meaning")) continue;
    for (const r of t.rows) {
      const m = /\*\*([^*]+)\*\*(?:\s*\(([^)]*)\))?/.exec(r.Term || "");
      if (!m) continue;
      const meaning = (r.Meaning || "").replace(/`([^`]*)`/g, "$1").replace(/\*\*/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
      const names = [m[1]].concat((m[2] || "").split(/[,/]/)).map(x => x.trim()).filter(x => x.length >= 4 && /^[A-Za-z][A-Za-z -]*$/.test(x));
      for (const n of names) out.push({ term: m[1].trim(), name: n, meaning });
    }
  }
  // Longer names first, so "Swar vistar" wins over "Swar".
  out.sort((a, b) => b.name.length - a.name.length);
  return out.map(x => Object.assign(x, { re: new RegExp("\\b" + x.name.replace(/[-\s]+/g, "[- ]") + "s?\\b", "i") }));
}

export async function loadGlossary() {
  if (!cache) cache = fetchDoc("06-GLOSSARY.md").then(parseGlossary).catch(() => []);
  return cache;
}

// Marks the first use of each glossary term in a rendered page. Skips headings, links, code and
// buttons, and terms already defined on the page.
export function glossify(root, entries, opts) {
  const seen = (opts && opts.seen) || new Set();
  const skip = el => el.closest("h1, h2, h3, h4, a, code, pre, button, summary, .gloss, .glossdef, th");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.nodeValue.trim().length > 3 && !skip(n.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    let text = node.nodeValue, hit = null;
    for (const e of entries) {
      if (seen.has(e.term)) continue;
      const m = e.re.exec(text);
      if (m && (!hit || m.index < hit.m.index)) hit = { e, m };
    }
    if (!hit) continue;
    seen.add(hit.e.term);
    const before = text.slice(0, hit.m.index), word = hit.m[0], after = text.slice(hit.m.index + word.length);
    const def = h("span", { class: "glossdef", hidden: true, role: "note" }, h("b", null, hit.e.term + ": "), hit.e.meaning);
    const btn = h("button", { type: "button", class: "gloss", "aria-expanded": "false", title: "What is " + hit.e.term + "?" }, word);
    btn.addEventListener("click", () => { def.hidden = !def.hidden; btn.setAttribute("aria-expanded", String(!def.hidden)); });
    const frag = document.createDocumentFragment();
    frag.append(before, btn, def, after);
    node.replaceWith(frag);
  }
  return seen;
}
