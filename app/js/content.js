// Fetches curriculum Markdown, renders it with marked, sanitizes it with an allowlist,
// gives headings GitHub-style ids, and rewrites links into app routes.
import { patternSvg } from "./core/fingers.js";
import { plainCodesIn } from "./codes.js";
import { marked } from "../vendor/marked.esm.js";

const ROOT = "bansuri-mastery/";
const cache = new Map();
let filesIndex = null;

export async function fetchDoc(path) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(ROOT + path);
  if (!res.ok) throw new Error("Could not open " + path + " (" + res.status + ").");
  const text = await res.text();
  cache.set(path, text);
  return text;
}

export async function filesList() {
  if (filesIndex) return filesIndex;
  const res = await fetch("app/data/files.json");
  filesIndex = res.ok ? await res.json() : { docs: [] };
  return filesIndex;
}

// Full-text search over every course page (the Book's "Search all text", and the top bar's search):
// [{ d, line }] for each line that contains q, at most limit of them, in the course's page order.
export async function searchText(q, limit) {
  const needle = String(q || "").trim().toLowerCase(), max = limit || 80, hits = [];
  if (needle.length < 2) return hits;
  const files = await filesList();
  for (const d of files.docs) {
    let text;
    try { text = await fetchDoc(d.path); } catch (e) { continue; }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length && hits.length < max; i++) {
      if (lines[i].toLowerCase().includes(needle)) hits.push({ d, line: lines[i].replace(/[#|*`>]/g, " ").replace(/\s+/g, " ").trim() });
    }
    if (hits.length >= max) break;
  }
  return hits;
}

// GitHub-style heading slug (matches the curriculum's links and scripts/validate.py).
export function slug(text) {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
}

export function resolvePath(fromPath, rel) {
  const base = fromPath.split("/").slice(0, -1);
  for (const part of rel.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") base.pop(); else base.push(part);
  }
  return base.join("/");
}

const ALLOWED = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "a", "strong", "em", "b", "i", "code", "pre", "blockquote",
  "table", "thead", "tbody", "tr", "th", "td", "hr", "br", "details", "summary", "del", "s", "sup", "sub", "span", "div", "input", "kbd", "img", "section"]);
const ATTRS = { a: ["href", "title"], th: ["align", "colspan", "rowspan"], td: ["align", "colspan", "rowspan"], details: ["open"], input: ["type", "checked", "disabled"], img: ["src", "alt", "title", "loading"], ol: ["start"] };
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "form", "template", "noscript", "svg", "math", "link", "meta", "base"]);

function sanitize(root) {
  const walk = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 8) { child.remove(); continue; }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName.toLowerCase();
      if (DROP_WITH_CONTENT.has(tag)) { child.remove(); continue; }
      if (!ALLOWED.has(tag)) {
        walk(child);
        child.replaceWith(...child.childNodes);
        continue;
      }
      const keep = ATTRS[tag] || [];
      for (const attr of [...child.attributes]) {
        if (!keep.includes(attr.name)) child.removeAttribute(attr.name);
      }
      if (tag === "a") {
        const href = (child.getAttribute("href") || "").trim();
        if (/^(javascript|data|vbscript):/i.test(href)) child.removeAttribute("href");
      }
      if (tag === "img") {
        const src = child.getAttribute("src") || "";
        if (!/^(https?:)?\/\//i.test(src) && /^[a-z]+:/i.test(src)) child.removeAttribute("src");
      }
      if (tag === "input") {
        if (child.getAttribute("type") !== "checkbox") { child.remove(); continue; }
        child.setAttribute("disabled", "");
      }
      walk(child);
    }
  };
  walk(root);
}

// Render Markdown at `path` into a DocumentFragment-like container element.
export function renderMarkdown(md, path) {
  const html = marked.parse(md, { gfm: true, async: false });
  const doc = new DOMParser().parseFromString("<div id=\"r\">" + html + "</div>", "text/html");
  const root = doc.getElementById("r");
  sanitize(root);

  // Heading ids, deduplicated like GitHub.
  const seen = new Map();
  for (const hEl of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const base = slug(hEl.textContent);
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    hEl.id = n ? base + "-" + n : base;
    hEl.classList.add("anchor-target");
  }
  // Wide tables scroll inside their own box.
  for (const t of root.querySelectorAll("table")) {
    const w = doc.createElement("div");
    w.className = "tablewrap";
    t.replaceWith(w);
    w.appendChild(t);
  }
  // Links.
  for (const a of root.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
      continue;
    }
    a.setAttribute("href", routeFor(path, href));
  }
  // Images in the course (diagrams) are relative to the page; the app serves pages from the site root.
  for (const img of root.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src");
    if (/^(https?:)?\/\//i.test(src) || /^(data|blob):/i.test(src)) continue;
    img.setAttribute("src", "bansuri-mastery/" + resolvePath(path, src));
    img.setAttribute("loading", "lazy");
    if (!img.getAttribute("alt")) img.setAttribute("alt", "");
  }
  const title = (root.querySelector("h1") || {}).textContent || path;
  // Lessons speak plainly: reference codes become words (after the heading ids above, so links keep working).
  if (/^lessons\//.test(path || "")) plainCodesIn(root);
  // A written fingering ("XXX OOO") gets a small picture of the holes beside it.
  for (const code of root.querySelectorAll("code")) {
    const pic = /^[XOH]{3} ?[XOH]{3}$/i.test(code.textContent.trim()) ? patternSvg(code.textContent) : null;
    if (pic) code.before(pic);
  }
  // Course text is English; the interface translator must not swap single words inside it.
  root.setAttribute("translate", "no");
  return { node: document.importNode(root, true), title };
}

// Map a link inside a curriculum file to an app route.
export function routeFor(fromPath, href) {
  if (href.startsWith("#/")) return href;
  if (href.startsWith("#")) return "#/read/" + fromPath + href;
  const [rel, anchor] = href.split("#");
  const target = resolvePath(fromPath, rel);
  if (/practice-bench\.html$|interactive-flute\.html$/.test(target)) return "#/bench";
  if (target.endsWith(".md")) return "#/read/" + target + (anchor ? "#" + anchor : "");
  return ROOT + target + (anchor ? "#" + anchor : "");
}

// Extract a "## Heading" section's Markdown (up to the next heading of the same or higher level).
export function sectionOf(md, headingRegex) {
  const lines = md.split("\n");
  let start = -1, level = 0, inCode = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("```")) inCode = !inCode;
    if (inCode) continue;
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (!m) continue;
    if (start < 0 && headingRegex.test(m[2])) { start = i; level = m[1].length; continue; }
    if (start >= 0 && m[1].length <= level) return lines.slice(start, i).join("\n");
  }
  return start >= 0 ? lines.slice(start).join("\n") : "";
}

// Parse Markdown tables into arrays of row objects keyed by header text.
export function tablesOf(md) {
  const out = [];
  const lines = md.split("\n");
  let i = 0, inCode = false;
  const cells = l => l.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map(c => c.trim());
  while (i < lines.length) {
    if (lines[i].startsWith("```")) inCode = !inCode;
    if (!inCode && lines[i].trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const head = cells(lines[i]);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const c = cells(lines[i]);
        const row = {};
        head.forEach((hd, k) => { row[hd] = c[k] || ""; });
        rows.push(row);
        i++;
      }
      out.push({ head, rows });
      continue;
    }
    i++;
  }
  return out;
}

// Render a short inline Markdown string (for table cells shown in app UI) safely.
export function renderInline(md, path) {
  const html = marked.parseInline(md || "", { gfm: true, async: false });
  const doc = new DOMParser().parseFromString("<span id=\"r\">" + html + "</span>", "text/html");
  const root = doc.getElementById("r");
  sanitize(root);
  root.setAttribute("translate", "no");
  for (const a of root.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    if (/^https?:\/\//i.test(href)) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer"); }
    else a.setAttribute("href", routeFor(path, href));
  }
  return document.importNode(root, true);
}
