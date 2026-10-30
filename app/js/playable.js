// Makes notation in course pages playable: inline code and code blocks that are pure sargam
// notation (`S R G R S`, `.P .D .N`) get a play button next to them.
import { h, icon } from "./util.js";
import { parseNotation, buildEvents, playEvents } from "./core/notation.js";

let playing = null; // { stop, btn }

export function isNotation(text) {
  const p = parseNotation(text);
  return !p.skipped.length && p.tokens.some(t => t.type === "beat" && t.items.some(i => i.semi !== undefined));
}

export function stopPlayable() {
  if (!playing) return;
  playing.stop();
  playing.btn.replaceChildren(icon("play", "Play"));
  playing.btn.setAttribute("aria-pressed", "false");
  playing = null;
}

function play(text, btn, bpm) {
  const again = playing && playing.btn === btn;
  stopPlayable();
  if (again) return;
  const b = buildEvents(parseNotation(text).tokens, bpm);
  const stop = playEvents(b.ev, b.beats, { bpm, onEnd: () => { if (playing && playing.btn === btn) stopPlayable(); } });
  playing = { stop, btn };
  btn.replaceChildren(icon("pause", "Stop"));
  btn.setAttribute("aria-pressed", "true");
}

export function makePlayable(root) {
  root.querySelectorAll("code").forEach(code => {
    if (code.dataset.playable || code.closest("a, button, summary")) return;
    const text = code.textContent.trim();
    if (!text || text.length > 600 || !isNotation(text)) return;
    code.dataset.playable = "1";
    const block = code.parentElement && code.parentElement.tagName === "PRE";
    const btn = h("button", { type: "button", class: "playnote" + (block ? " block" : ""), "aria-pressed": "false", title: "Play this notation" }, icon("play", "Play"));
    btn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); play(text, btn, block ? 72 : 60); });
    if (block) code.parentElement.before(btn); else code.after(btn);
  });
}
