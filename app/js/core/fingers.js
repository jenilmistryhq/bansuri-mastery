// Notes as pictures, for learners who do not read letters: a small flute with its six holes filled
// (closed), half filled (half-hole) or empty (open), and a colour per note. The register is shown as
// dots above (overblown) or below (lower octave). Used by the widgets, the games and the composer
// when the setting notesAs is "pictures"; the letter stays underneath, small.
import { fingOf, codeOf, nameOf, pcOf, devaOf } from "./theory.js";
import { getSettings } from "./settings.js";

const SVG_NS = "http://www.w3.org/2000/svg";
// One colour per swara; komal and tivra share their note's colour (drawn with a dashed ring).
const HUE = { 0: "#d64541", 1: "#e8833a", 2: "#e8833a", 3: "#c9a227", 4: "#c9a227", 5: "#2f9e57", 6: "#2f9e57", 7: "#2f7bd6", 8: "#8a5cd1", 9: "#8a5cd1", 10: "#c2508f", 11: "#c2508f" };
export const noteColor = semi => HUE[pcOf(semi)];
const variant = semi => [1, 3, 6, 8, 10].includes(pcOf(semi));
export const picturesOn = () => getSettings().notesAs === "pictures";

export function holesText(semi) {
  const f = fingOf(semi).f;
  if (!f) return "not playable on this flute";
  const n = { X: 0, O: 0, H: 0 }; for (const c of f) n[c]++;
  return [[n.X, "closed"], [n.H, "half"], [n.O, "open"]].filter(x => x[0]).map(x => x[0] + " " + x[1]).join(", ");
}

// An SVG picture of the fingering (holes 1-6 from the top, left to right).
export function fingSvg(semi, opts) {
  const o = Object.assign({ size: 22 }, opts || {});
  const { f, reg } = fingOf(semi);
  const col = noteColor(semi), W = 6 * 10 + 8, H = 22;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "fingpic");
  svg.setAttribute("width", String(Math.round(o.size * W / H)));
  svg.setAttribute("height", String(o.size));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", nameOf(semi) + ": " + holesText(semi));
  const add = (tag, attrs) => { const e = document.createElementNS(SVG_NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); svg.append(e); return e; };
  add("rect", { x: 1, y: 6, width: W - 2, height: 10, rx: 5, fill: "none", stroke: col, "stroke-width": 1.6, "stroke-dasharray": variant(semi) ? "3 2" : "none" });
  for (let i = 0; i < 6; i++) {
    const cx = 9 + i * 10 + (i >= 3 ? 2 : 0), c = f ? f[i] : "O";
    add("circle", { cx, cy: 11, r: 3.6, fill: c === "X" ? col : "none", stroke: col, "stroke-width": 1.3 });
    if (c === "H") add("path", { d: `M${cx} ${11 - 3.6}a3.6 3.6 0 0 0 0 7.2z`, fill: col });
  }
  // Register: one dot above for the second register, one below for the lower octave.
  if (reg === 2) add("circle", { cx: W / 2, cy: 2.6, r: 1.8, fill: col });
  if (semi < 0) add("circle", { cx: W / 2, cy: H - 2.4, r: 1.8, fill: col });
  return svg;
}

// The note label used everywhere in the widgets: letters (and Devanagari when chosen), or the
// picture with the letter small underneath.
export function noteLabel(semi) {
  const s = getSettings();
  const code = codeOf(semi);
  if (s.notesAs !== "pictures") {
    if (!s.deva) return code;
    const sm = document.createElement("small"); sm.className = "lv-deva"; sm.textContent = devaOf(semi);
    return [code, sm];
  }
  const wrap = document.createElement("span");
  wrap.className = "notepic";
  wrap.style.setProperty("--nc", noteColor(semi));
  const sm = document.createElement("small");
  sm.textContent = s.deva ? devaOf(semi) : code;
  wrap.append(fingSvg(semi), sm);
  return wrap;
}

// The same picture on a canvas (games). Draws centred on x, y.
export function drawFing(g, x, y, semi, size) {
  const { f, reg } = fingOf(semi);
  const col = noteColor(semi), k = (size || 22) / 22, W = 68 * k;
  g.save();
  g.translate(x - W / 2, y - 11 * k);
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.5;
  if (variant(semi)) g.setLineDash([3, 2]);
  g.beginPath(); if (g.roundRect) g.roundRect(1 * k, 6 * k, W - 2 * k, 10 * k, 5 * k); else g.rect(1 * k, 6 * k, W - 2 * k, 10 * k); g.stroke();
  g.setLineDash([]);
  for (let i = 0; i < 6; i++) {
    const cx = (9 + i * 10 + (i >= 3 ? 2 : 0)) * k, c = f ? f[i] : "O";
    g.beginPath(); g.arc(cx, 11 * k, 3.6 * k, 0, Math.PI * 2);
    if (c === "X") g.fill(); else g.stroke();
    if (c === "H") { g.beginPath(); g.arc(cx, 11 * k, 3.6 * k, Math.PI / 2, Math.PI * 1.5); g.fill(); }
  }
  if (reg === 2) { g.beginPath(); g.arc(W / 2, 2.6 * k, 1.8 * k, 0, Math.PI * 2); g.fill(); }
  if (semi < 0) { g.beginPath(); g.arc(W / 2, 19.6 * k, 1.8 * k, 0, Math.PI * 2); g.fill(); }
  g.restore();
}
