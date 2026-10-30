// Full Practice Bench (#/bench).
import { h } from "../util.js";
import { mountBench } from "../bench/bench.js";
import { recordEar } from "./session.js";

export async function render(main) {
  const host = h("div");
  const page = h("div", { class: "page wide" }, h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Practice Bench"), h("h1", null, "Practice Bench"),
    h("p", { class: "muted" }, "Finger the holes and hear the note, play any sargam, run the tanpura and tala, check your flute's tuning, and quiz your ear.")), host);
  main.append(page);
  const bench = mountBench(host, { heading: false, onEar: recordEar });
  return () => bench.destroy();
}
