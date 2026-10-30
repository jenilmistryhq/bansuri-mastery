// Go anywhere in two keystrokes: "/" (or the search button) opens a box that finds screens, tools,
// settings and every course page by name; Enter or a tap opens it, Escape closes.
import { h, icon } from "./util.js";
import { filesList } from "./content.js";
import { current } from "./course.js";

const SCREENS = () => [
  ["Today", "#/today", "today"], ["Today's session", "#/session/" + current(), "play"], ["Course map", "#/plan", "plan"], ["Library", "#/library", "library"],
  ["Practice Bench: flute, tuner, tanpura, tala", "#/bench", "bench"], ["Coach: check my tone", "#/coach", "coach"], ["Listen", "#/listen", "listen"],
  ["Songs: play along", "#/songs", "note"], ["Games", "#/play", "star"], ["Make a melody", "#/compose", "note"], ["Notation from a recording (YouTube, a file)", "#/transcribe", "note"], ["5-minute practice", "#/quick", "today"],
  ["Progress and level", "#/progress", "progress"], ["Journal: record and log", "#/journal", "journal"], ["Settings", "#/settings", "settings"], ["Privacy", "#/privacy", "settings"], ["My students (for teachers)", "#/students", "me"],
  ["Settings: your flute", "#/settings#g-flute", "settings"], ["Settings: voice and language", "#/settings#g-voice", "speaker"],
  ["Settings: accessibility", "#/settings#g-access", "settings"], ["Settings: backup and data", "#/settings#g-data", "settings"],
];

let box = null;
export async function openPalette() {
  if (box) return;
  const input = h("input", { class: "input", type: "search", placeholder: "Go to... a screen, a lesson, a raga", "aria-label": "Search", autocomplete: "off" });
  const list = h("ul", { class: "pal-list", role: "listbox", "aria-label": "Results" });
  box = h("div", { class: "palette", role: "dialog", "aria-modal": "true", "aria-label": "Search" },
    h("div", { class: "pal-panel" }, h("div", { class: "pal-input" }, icon("search"), input), list, h("p", { class: "small muted pal-hint" }, "Enter to open, arrows to move, Esc to close")));
  document.body.append(box);
  let items = SCREENS().map(([t, href, ic]) => ({ t, href, ic, kind: "Screen" }));
  try { const f = await filesList(); items = items.concat(f.docs.map(d => ({ t: d.title, href: "#/read/" + d.path, ic: "read", kind: "Page" }))); } catch (e) { /* screens only */ }
  let shown = [], sel = 0;
  const draw = () => {
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    shown = (words.length ? items.filter(x => words.every(w => (x.t + " " + x.href).toLowerCase().includes(w))) : items.filter(x => x.kind === "Screen")).slice(0, 12);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.replaceChildren(...(shown.length ? shown.map((x, i) => h("li", { role: "option", "aria-selected": String(i === sel), class: i === sel ? "on" : "" },
      h("a", { href: x.href, onclick: close }, icon(x.ic), h("span", null, x.t), h("span", { class: "small muted" }, x.kind)))) : [h("li", { class: "small muted pal-empty" }, "Nothing found. Try the Library's full-text search.")]));
  };
  function close() { if (!box) return; box.remove(); box = null; document.removeEventListener("keydown", onKey, true); }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === "Enter" && shown[sel]) { e.preventDefault(); location.hash = shown[sel].href; close(); }
  }
  input.addEventListener("input", () => { sel = 0; draw(); });
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
