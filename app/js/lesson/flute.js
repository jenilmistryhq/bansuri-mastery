// A bansuri drawn as SVG, after L00's diagram: the cork end (closed), the blowing hole, the six
// finger holes (numbered from the blowing-hole end), bindings and the open end. Every part can be
// tapped (or reached with Tab and pressed with Enter), so a lesson can ask "where is hole 4?", and
// the finger holes can be opened and closed to hear the note they make.
// side: "right" (pointing right, as most players hold it) or "left" (mirrored).
import { BASE } from "../core/theory.js";

const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v)); return e; };

export const HOLE_X = [142, 184, 226, 286, 328, 370];
export const PARTS = [
  { id: "blow", name: "The blowing hole" },
  { id: "h1", name: "Finger hole 1" }, { id: "h2", name: "Finger hole 2" }, { id: "h3", name: "Finger hole 3" },
  { id: "h4", name: "Finger hole 4" }, { id: "h5", name: "Finger hole 5" }, { id: "h6", name: "Finger hole 6" },
  { id: "cork", name: "The cork end (closed)" },
  { id: "open", name: "The open end" },
  { id: "bind", name: "A binding (thread wrap)" },
];
export const partName = id => (PARTS.find(p => p.id === id) || {}).name || id;

// The note a pattern of closed (X) and open (O) holes gives, in semitones from Sa, or null when it
// is not on the chart (holes closed with a gap above them leak: a cross-fingering).
export function noteOfPattern(pattern) {
  const v = BASE[pattern];
  return v === undefined ? null : v;
}

// opts: { side, numbers (show the hole numbers), holes (true: tapping a hole opens or closes it),
//         onTap(partId) }
export function fluteSvg(opts) {
  const o = Object.assign({ side: "right", numbers: true, holes: false, onTap: null }, opts || {});
  const closed = [false, false, false, false, false, false];
  const svg = el("svg", { viewBox: "0 0 480 120", class: "fl" + (o.side === "left" ? " fl-left" : ""), role: "group", "aria-label": "A bansuri" });
  const g = el("g", o.side === "left" ? { transform: "translate(480 0) scale(-1 1)" } : {});
  svg.append(g);
  // The tube, then the parts on top of it.
  g.append(el("rect", { x: 6, y: 36, width: 468, height: 46, rx: 23, class: "fl-body" }));
  for (const x of [118, 256, 420]) g.append(el("line", { x1: x, y1: 38, x2: x, y2: 80, class: "fl-node" }));
  const parts = {};
  function part(id, shapes, hit) {
    const p = el("g", { class: "fl-part", "data-part": id, tabindex: "0", role: "button", "aria-label": partName(id) });
    shapes.forEach(s => p.append(s));
    p.append(el(hit[0], Object.assign({ class: "fl-hit" }, hit[1])));
    const fire = () => { if (o.holes && /^h\d$/.test(id)) toggle(Number(id[1]) - 1); if (o.onTap) o.onTap(id); };
    p.addEventListener("click", fire);
    p.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(); } });
    g.append(p); parts[id] = p;
    return p;
  }
  part("cork", [el("rect", { x: 6, y: 36, width: 30, height: 46, rx: 18, class: "fl-cork" })], ["rect", { x: 0, y: 20, width: 40, height: 80 }]);
  part("bind", [el("rect", { x: 42, y: 33, width: 9, height: 52, rx: 2, class: "fl-bind" }), el("rect", { x: 98, y: 33, width: 9, height: 52, rx: 2, class: "fl-bind" }), el("rect", { x: 400, y: 33, width: 9, height: 52, rx: 2, class: "fl-bind" })],
    ["rect", { x: 388, y: 20, width: 32, height: 80 }]);
  part("blow", [el("ellipse", { cx: 72, cy: 59, rx: 13, ry: 10, class: "fl-hole" })], ["circle", { cx: 72, cy: 59, r: 22 }]);
  HOLE_X.forEach((x, i) => {
    // A fingertip covers a closed hole (shown only when closed).
    const shapes = [el("circle", { cx: x, cy: 59, r: 12, class: "fl-hole fl-finger" }), el("circle", { cx: x, cy: 59, r: 17, class: "fl-pad" })];
    if (o.numbers) { const t = el("text", { x, y: 108, class: "fl-num", "text-anchor": "middle" }); t.textContent = String(i + 1); shapes.push(t); }
    part("h" + (i + 1), shapes, ["circle", { cx: x, cy: 59, r: 21 }]);
  });
  part("open", [el("ellipse", { cx: 470, cy: 59, rx: 5, ry: 20, class: "fl-open" })], ["rect", { x: 440, y: 20, width: 40, height: 80 }]);
  // Mirrored text would read backwards: turn the numbers back the right way.
  if (o.side === "left") svg.querySelectorAll(".fl-num").forEach(t => t.setAttribute("transform", `translate(${2 * Number(t.getAttribute("x"))} 0) scale(-1 1)`));

  function toggle(i) { setHole(i, !closed[i]); }
  function setHole(i, on) {
    closed[i] = !!on;
    const p = parts["h" + (i + 1)];
    p.classList.toggle("fl-closed", closed[i]);
    p.setAttribute("aria-pressed", String(closed[i]));
    p.setAttribute("aria-label", partName("h" + (i + 1)) + (closed[i] ? ": closed" : ": open"));
  }
  if (o.holes) closed.forEach((_, i) => setHole(i, false));
  return {
    el: svg,
    pattern: () => closed.map(c => (c ? "X" : "O")).join(""),
    setPattern(p) { [...p].forEach((c, i) => setHole(i, c === "X")); },
    mark(id, cls, on) { if (parts[id]) parts[id].classList.toggle(cls, on !== false); },
    clearMarks(cls) { Object.values(parts).forEach(p => p.classList.remove(cls)); },
  };
}
