// The Practice Bench's panels as screens. #/bench and #/bench/<tab> now forward to where each part
// lives (redesign 03: the dock, the Skills tools, Music, Me > Flute; see main.js). This module draws
// Me > Flute's Check my flute (#/me/flute/check): a recording of each note, checked against the chart.
import { h } from "../util.js";
import { mountBench } from "../bench/bench.js";
import { recordEar } from "./session.js";
import { bestHold } from "../livestats.js";
import { backHead } from "../backhead.js";

const TABS = new Set(["play", "tones", "echo", "rhythm", "ear", "chart", "check", "about"]);

export async function render(main, { params, view } = {}) {
  if (view === "benchcheck") {
    const host = h("div");
    main.append(h("div", { class: "page toolpage", dataset: { noswipe: "1" } }, backHead("#/me/flute", "Flute", "Check my flute"), host));
    const bench = mountBench(host, { compact: true, heading: false, flute: false, tabs: ["check"], tab: "check", dockTuner: true });
    return () => bench.destroy();
  }
  const host = h("div");
  const page = h("div", { class: "page wide" }, h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Practice Bench"), h("h1", null, "Practice Bench"),
    h("p", { class: "muted" }, "Finger the holes and hear the note, play any sargam, run the tanpura and tala, check your flute's tuning, and quiz your ear.")), host);
  main.append(page);
  const bench = mountBench(host, { heading: false, onEar: recordEar, ghost: bestHold, tab: params && TABS.has(params[0]) ? params[0] : undefined });
  return () => bench.destroy();
}
