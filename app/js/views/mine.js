// Music > Mine (#/music/mine, redesign W67a): what the learner made. Melodies saved in Make a melody
// (each opens in the composer, with its length in beats), and songs made from a recording in
// Transcribe (each opens as that song, with its length and the "Mine" tag).
import { h, store } from "../util.js";
import { parseNotation, buildEvents } from "../core/notation.js";

const clock = s => Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0");
// A song's length: the recording's part it was made from, else the notation played at its tempo.
export function songSeconds(m) {
  if (m.seconds > 0) return m.seconds;
  try { return Math.round(buildEvents(parseNotation(String(m.notation || "")).tokens, m.bpm || 80).total) || 0; } catch (e) { return 0; }
}

export async function render(main) {
  const page = h("div", { class: "page" }, h("h1", { class: "sr-only" }, "Mine"));
  const melodies = store("bansuri.compose.saved", []), songs = store("bansuri.mysongs", []);
  const row = (href, title, aside) => h("a", { class: "hubrow", href }, h("b", null, title), aside, h("span", { class: "chev", "aria-hidden": "true" }, ">"));
  page.append(h("section", { class: "card hubgroup minetunes" }, h("h2", { class: "grouphead" }, "Your tunes"),
    h("div", { class: "hublist" }, melodies.length
      ? melodies.map((m, i) => row("#/music/compose/" + i, m.name, h("span", { class: "small muted" }, (Array.isArray(m.cells) ? m.cells.length : 16) + " beats")))
      : h("p", { class: "small muted" }, "Melodies you save in Make a melody appear here.")),
    h("a", { class: "btn primary", href: "#/music/compose" }, "+ Make a melody")));
  page.append(h("section", { class: "card hubgroup minesongs" }, h("h2", { class: "grouphead" }, "From your recordings"),
    h("div", { class: "hublist" }, songs.length
      ? songs.map(m => { const s = songSeconds(m); return row("#/music/song/" + m.id, h("span", { translate: "no" }, s ? m.title + ", " + clock(s) : m.title), h("span", { class: "chip info" }, "Mine")); })
      : h("p", { class: "small muted" }, "Songs you turn into sargam appear here, and under Songs.")),
    h("a", { class: "btn", href: "#/music/transcribe" }, "+ Turn a recording into sargam")));
  main.append(page);
}
