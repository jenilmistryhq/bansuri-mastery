// Show, don't tell: an animated bansuri that plays a melody. Fingers settle on the holes just before
// each note, air flows into the blowing hole while a note sounds, and the note glows in its colour.
// Used by Listen (#/listen), "Show me" on lesson cards and the hands-free sessions.
import { h } from "./util.js";
import { fingOf, codeOf, nameOf } from "./core/theory.js";
import { noteColor, noteLabel } from "./core/fingers.js";
import { parseNotation, buildEvents, playEvents } from "./core/notation.js";
import { ac } from "./core/audio.js";

const NS = "http://www.w3.org/2000/svg";
const HOLES = [330, 400, 470, 590, 660, 730];

function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.append(e);
  return e;
}

// The flute drawing: body, blowing hole, six holes, a finger pad over each hole, and an air stream.
export function fluteFigure() {
  const svg = svgEl("svg", { viewBox: "0 0 860 150", class: "demoflute", role: "img", "aria-label": "A bansuri: the blowing hole on the left, six finger holes" });
  svgEl("rect", { x: 40, y: 62, width: 780, height: 34, rx: 17, class: "df-body" }, svg);
  for (const x of [70, 250, 800]) svgEl("rect", { x, y: 60, width: 8, height: 38, rx: 2, class: "df-bind" }, svg);
  svgEl("ellipse", { cx: 150, cy: 79, rx: 13, ry: 10, class: "df-hole df-mouth" }, svg);
  const air = svgEl("g", { class: "df-air" }, svg);
  for (let i = 0; i < 5; i++) svgEl("path", { d: `M${60 + i * 6} ${30 + i * 4} q 40 ${18 - i} 82 ${40 - i * 3}`, class: "df-stream", style: `animation-delay:${i * 0.12}s` }, air);
  const fingers = HOLES.map(x => {
    svgEl("circle", { cx: x, cy: 79, r: 11, class: "df-hole" }, svg);
    return svgEl("ellipse", { cx: x, cy: 79, rx: 19, ry: 24, class: "df-finger" }, svg);
  });
  const halves = HOLES.map(x => svgEl("path", { d: `M${x} 55 a19 24 0 0 0 0 48 z`, class: "df-finger df-half" }, svg));
  const note = h("div", { class: "df-note", "aria-live": "off" });
  const el = h("div", { class: "demo" }, note, svg);
  return {
    el,
    // Shows the fingering of a note (null: all fingers lifted).
    set(semi) {
      const f = semi === null || semi === undefined ? null : fingOf(semi).f;
      fingers.forEach((p, i) => p.classList.toggle("on", !!f && f[i] === "X"));
      halves.forEach((p, i) => p.classList.toggle("on", !!f && f[i] === "H"));
      el.style.setProperty("--nc", semi === null || semi === undefined ? "var(--accent)" : noteColor(semi));
      note.replaceChildren(...(semi === null || semi === undefined ? [] : [].concat(noteLabel(semi))));
      svg.setAttribute("aria-label", semi === null || semi === undefined ? "A bansuri" : "Bansuri fingering for " + nameOf(semi) + " (" + codeOf(semi) + ")");
    },
    blow(on) { el.classList.toggle("blowing", on); },
  };
}

// A melody played on the animated flute. opts: { notation, bpm, title }
export function flutePlayer(opts) {
  const o = Object.assign({ bpm: 66 }, opts || {});
  const fig = fluteFigure();
  let stop = null, timers = [];
  const btn = h("button", { type: "button", class: "btn primary" }, "Play");
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const end = () => { clear(); if (stop) { stop(); stop = null; } fig.blow(false); btn.textContent = "Play"; };
  btn.addEventListener("click", () => {
    if (stop) { end(); return; }
    const b = buildEvents(parseNotation(o.notation).tokens, o.bpm);
    if (!b.ev.length) return;
    const c = ac();
    stop = playEvents(b.ev, b.beats, { bpm: o.bpm, lead: 0.25, onPreview: e => fig.set(e.semi), onEnd: end });
    // The air flows while each note sounds.
    for (const e of b.ev) {
      const at = (stop.t0 + e.start - c.currentTime) * 1000;
      timers.push(setTimeout(() => fig.blow(true), Math.max(0, at)));
      timers.push(setTimeout(() => fig.blow(false), Math.max(0, at + e.dur * 1000 * 0.92)));
    }
    btn.textContent = "Stop";
  });
  fig.set(b0(o.notation));
  return { el: h("div", { class: "stack" }, o.title ? h("b", null, o.title) : null, fig.el, h("div", { class: "row" }, btn)), play: () => btn.click(), destroy: end };
}

function b0(notation) {
  const ev = buildEvents(parseNotation(notation || "").tokens, 60).ev;
  return ev.length ? ev[0].semi : 0;
}
