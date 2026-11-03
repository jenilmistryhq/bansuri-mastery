// Go anywhere in two keystrokes: "/" (or the search button) opens a box that finds screens, tools,
// settings and every course page by name, then (redesign W8) the course's own search: glossary terms
// and the lines of the course text that use the words. Enter or a tap opens one, Escape closes.
import { h, icon } from "./util.js";
import { filesList, searchText } from "./content.js";
import { loadGlossary } from "./glossary.js";
import { current } from "./course.js";

// "dock:<tab>" opens the Flute dock on that tab, over the screen you are on.
const SCREENS = () => [
  ["Today", "#/today", "today"], ["Today's session", "#/session/" + current(), "play"], ["Course", "#/course", "plan"], ["Course book", "#/course/book", "library"],
  ["Tuner: which note, how many cents", "dock:tuner", "mic"], ["Drone (tanpura)", "dock:drone", "wave"], ["Taal: tabla and metronome", "dock:taal", "wave"], ["Fingering chart", "dock:fingers", "hand"],
  ["Fix a problem: tone check and symptoms", "#/skills/fix", "coach"], ["Listen", "#/music/listen", "listen"],
  ["Long tones", "#/skills/tone/longtones", "mic"], ["Tone check", "#/skills/tone/check", "coach"], ["Tap the beat", "#/skills/rhythm/tap", "mic"], ["Ear quiz", "#/skills/ear/quiz", "listen"], ["Play it back", "#/skills/ear/playback", "mic"], ["Ragas", "#/music/ragas", "note"],
  ["Songs: play along", "#/music", "note"], ["Games", "#/skills/games", "star"], ["Make a melody", "#/music/compose", "note"], ["Notation from a recording (YouTube, a file)", "#/music/transcribe", "note"], ["5-minute practice", "#/today/quick", "today"],
  ["Progress and level", "#/me", "progress"], ["Journal: record and log", "#/me/journal", "journal"], ["Settings", "#/me/settings", "settings"], ["Privacy", "#/me/privacy", "settings"], ["My students (for teachers)", "#/me/teacher/students", "me"],
  ["Your flute", "#/me/flute", "settings"], ["Check my flute", "#/me/flute/check", "mic"], ["Settings: voice and language", "#/me/settings/voice", "speaker"],
  ["Settings: accessibility", "#/me/settings/display", "settings"], ["Settings: backup and data", "#/me/settings/data", "settings"],
];

// A line of course text, cut to the words around the first match: "...the pakad of Khamaj...".
function snippet(line, needle) {
  const i = line.toLowerCase().indexOf(needle);
  if (i < 0) return line.slice(0, 90);
  const a = Math.max(0, i - 36), z = Math.min(line.length, i + needle.length + 48);
  return (a > 0 ? "..." : "") + line.slice(a, z).trim() + (z < line.length ? "..." : "");
}

let box = null;
export async function openPalette() {
  if (box) return;
  const input = h("input", { class: "input", type: "search", placeholder: "Search: a screen, a word, a lesson", "aria-label": "Search", autocomplete: "off" });
  const list = h("ul", { class: "pal-list", role: "listbox", "aria-label": "Results" });
  const shut = h("button", { type: "button", class: "iconbtn pal-close", "aria-label": "Close the search" }, icon("x"));
  box = h("div", { class: "palette", role: "dialog", "aria-modal": "true", "aria-label": "Search" },
    h("div", { class: "pal-panel" }, h("div", { class: "pal-input" }, icon("search"), input, shut), list, h("p", { class: "small muted pal-hint" }, "Enter to open, arrows to move, Esc to close")));
  document.body.append(box);
  let items = SCREENS().map(([t, href, ic]) => ({ t, href, ic, kind: "Screen" }));
  try { const f = await filesList(); items = items.concat(f.docs.map(d => ({ t: d.title, href: "#/read/" + d.path, ic: "read", kind: "Page" }))); } catch (e) { /* screens only */ }
  let gloss = [];
  loadGlossary().then(g => { gloss = g || []; if (box && input.value.trim().length >= 2) draw(); }).catch(() => {});
  // groups: [label, [item...]]; shown: the items in order, for the arrow keys.
  let groups = [], shown = [], sel = 0, textHits = null, textFor = "", timer = 0, gen = 0;
  const open = x => {
    close();
    if (/^dock:/.test(x.href)) document.dispatchEvent(new CustomEvent("bansuri:dock", { detail: { tab: x.href.slice(5) } }));
    else location.hash = x.href;
  };
  const draw = () => {
    const q = input.value.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean);
    const named = (words.length ? items.filter(x => words.every(w => (x.t + " " + x.href).toLowerCase().includes(w))) : items.filter(x => x.kind === "Screen")).slice(0, words.length ? 8 : 12);
    groups = [[words.length ? "Screens and pages" : "", named]];
    if (q.length >= 2) {
      const seen = new Set(), terms = [];
      for (const g of gloss) if (!seen.has(g.term) && (g.term.toLowerCase().includes(q) || g.name.toLowerCase().includes(q))) { seen.add(g.term); terms.push(g); }
      if (terms.length) groups.push(["Glossary", terms.slice(0, 4).map(g => ({ t: g.term, sub: g.meaning.length > 90 ? g.meaning.slice(0, 88) + "..." : g.meaning, href: "#/read/06-GLOSSARY.md", ic: "library", kind: "Glossary" }))]);
      if (textHits && textFor === q) {
        // One line per page, the page's own name first.
        const pages = new Set(), lines = [];
        for (const x of textHits) if (!pages.has(x.d.path)) { pages.add(x.d.path); lines.push({ t: x.d.title, sub: snippet(x.line, q), href: "#/read/" + x.d.path, ic: "read", kind: "Course" }); }
        if (lines.length) groups.push(["In the course", lines.slice(0, 8)]);
      } else groups.push(["In the course", [{ wait: true }]]);
    }
    shown = groups.flatMap(g => g[1]).filter(x => !x.wait);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    const rows = [];
    for (const [label, its] of groups) {
      if (!its.length) continue;
      if (label) rows.push(h("li", { class: "pal-group", role: "presentation" }, label));
      for (const x of its) {
        if (x.wait) { rows.push(h("li", { class: "small muted pal-empty", role: "presentation" }, "Searching the course...")); continue; }
        const i = shown.indexOf(x);
        rows.push(h("li", { role: "option", "aria-selected": String(i === sel), class: i === sel ? "on" : "" },
          h("a", { href: /^dock:/.test(x.href) ? "#" : x.href, onclick: e => { e.preventDefault(); open(x); } }, icon(x.ic),
            h("span", { class: "pal-t" }, h("span", null, x.t), x.sub ? h("span", { class: "small muted pal-sub" }, x.sub) : null), h("span", { class: "small muted" }, x.kind))));
      }
    }
    list.replaceChildren(...(rows.length ? rows : [h("li", { class: "small muted pal-empty" }, "Nothing found. Try another word.")]));
    if (textHits && textFor === q && q.length >= 2 && !groups.some(g => g[0] === "In the course")) list.append(h("li", { class: "small muted pal-empty", role: "presentation" }, "Not in the course text."));
  };
  // The course text is searched once typing pauses (it reads every page; they are kept after the first time).
  const searchSoon = () => {
    clearTimeout(timer);
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { textHits = null; return; }
    const g = ++gen;
    timer = setTimeout(async () => {
      const hits = await searchText(q, 60).catch(() => []);
      if (g !== gen || !box) return;
      textHits = hits; textFor = q; draw();
    }, 250);
  };
  function close() { if (!box) return; clearTimeout(timer); gen++; box.remove(); box = null; document.removeEventListener("keydown", onKey, true); }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === "Enter" && shown[sel]) { e.preventDefault(); open(shown[sel]); }
  }
  input.addEventListener("input", () => { sel = 0; textHits = null; draw(); searchSoon(); });
  shut.addEventListener("click", close);
  box.addEventListener("click", e => { if (e.target === box) close(); });
  document.addEventListener("keydown", onKey, true);
  draw(); input.focus();
}

// "/" opens it from anywhere (except while typing in a field).
export function installPaletteKey() {
  document.addEventListener("keydown", e => {
    const t = e.target, tag = (t && t.tagName || "").toLowerCase();
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || ["input", "textarea", "select"].includes(tag) || (t && t.isContentEditable)) return;
    e.preventDefault(); openPalette();
  });
}
