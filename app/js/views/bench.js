// Full Practice Bench (#/bench).
import { h } from "../util.js";
import { mountBench } from "../bench/bench.js";
import { recordEar } from "./session.js";
import { bestHold } from "../livestats.js";

// #/bench/<tab> opens that tab (the Skills sections link to the tool they need).
const TABS = new Set(["play", "tones", "echo", "rhythm", "ear", "chart", "check", "about"]);

export async function render(main, { params } = {}) {
  const host = h("div");
  const page = h("div", { class: "page wide" }, h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Practice Bench"), h("h1", null, "Practice Bench"),
    h("p", { class: "muted" }, "Finger the holes and hear the note, play any sargam, run the tanpura and tala, check your flute's tuning, and quiz your ear.")), host);
  main.append(page);
  const bench = mountBench(host, { heading: false, onEar: recordEar, ghost: bestHold, tab: params && TABS.has(params[0]) ? params[0] : undefined });
  return () => bench.destroy();
}
