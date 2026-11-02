// The top of a screen inside a section (a training tool, a song, a raga): a back link to where it
// belongs and the screen's title, in place of the section tabs (redesign W1).
import { h } from "./util.js";
import { micActive } from "./core/listen.js";

export function backHead(href, label, title, aside) {
  return h("header", { class: "backhead" },
    h("a", { class: "backlink", href, "aria-label": "Back to " + label }, h("span", { class: "chev", "aria-hidden": "true" }, "<"), h("span", null, label)),
    h("h1", null, title), aside || null);
}

// Playing mode (redesign 09): while the microphone listens, el gets the shared "playmode" class
// (the note, the ring and the word grow, see app.css) and its own extra class. Returns a stop function.
export function followMic(el, extra) {
  const set = on => { el.classList.toggle("playmode", on); if (extra) el.classList.toggle(extra, on); };
  const onMic = e => set(!!(e.detail && e.detail.on));
  document.addEventListener("bansuri:mic", onMic);
  set(micActive());
  return () => { document.removeEventListener("bansuri:mic", onMic); set(false); };
}
