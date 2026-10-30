// Small pieces of the app's visual language: a progress ring, this week's practice strip and a
// badge emblem. Plain SVG and DOM, sized by CSS.
import { h, today, addDays, parseDate } from "./util.js";

const NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v)); return e; }

// A ring that fills to pct (0-100), with a label in the middle.
export function ring(pct, label, opts) {
  const o = Object.assign({ size: 64, stroke: 7, cls: "" }, opts || {});
  const r = (o.size - o.stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct || 0));
  const svg = svgEl("svg", { viewBox: `0 0 ${o.size} ${o.size}`, class: "ring " + o.cls, width: o.size, height: o.size, role: "img", "aria-label": Math.round(p) + "%" });
  svg.append(svgEl("circle", { cx: o.size / 2, cy: o.size / 2, r, class: "ring-track", "stroke-width": o.stroke, fill: "none" }));
  svg.append(svgEl("circle", { cx: o.size / 2, cy: o.size / 2, r, class: "ring-fill", "stroke-width": o.stroke, fill: "none", "stroke-linecap": "round",
    "stroke-dasharray": c.toFixed(1), "stroke-dashoffset": (c * (1 - p / 100)).toFixed(1), transform: `rotate(-90 ${o.size / 2} ${o.size / 2})` }));
  const t = svgEl("text", { x: "50%", y: "50%", "dominant-baseline": "central", "text-anchor": "middle", class: "ring-label" });
  t.textContent = label === undefined ? Math.round(p) + "%" : label;
  svg.append(t);
  return svg;
}

// Monday to Sunday of this week: a dot per day, filled when practised, today outlined.
export function weekStrip(practised) {
  const t = today(), d0 = parseDate(t), monday = addDays(t, -((d0.getDay() + 6) % 7));
  const names = ["M", "T", "W", "T", "F", "S", "S"];
  return h("div", { class: "weekstrip", role: "list", "aria-label": "This week" }, names.map((n, i) => {
    const d = addDays(monday, i), on = practised.has(d);
    return h("span", { role: "listitem", class: "wkday" + (on ? " on" : "") + (d === t ? " today" : "") + (d > t ? " future" : ""), title: d + (on ? ": practised" : "") }, h("i", { "aria-hidden": "true" }), h("span", null, n));
  }));
}

// A badge emblem: a hexagon with an icon path, coloured when earned.
export function emblem(iconPath, earned) {
  const svg = svgEl("svg", { viewBox: "0 0 48 54", class: "emblem" + (earned ? " earned" : ""), "aria-hidden": "true" });
  svg.append(svgEl("path", { d: "M24 2 45 14v26L24 52 3 40V14z", class: "emblem-hex" }));
  svg.append(svgEl("path", { d: "M24 8 40 17v20L24 46 8 37V17z", class: "emblem-inner" }));
  const g = svgEl("g", { transform: "translate(12 15)" });
  g.append(svgEl("path", { d: iconPath, class: "emblem-icon", fill: "none", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  svg.append(g);
  return svg;
}
