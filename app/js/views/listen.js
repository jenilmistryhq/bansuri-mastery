// Listen (#/listen): learning by ear, no reading needed. Real bansuri recordings, songs played on an
// animated flute (watch the fingers), the four tone levels, and the course's listening library.
import { h, icon } from "../util.js";
import { fetchDoc } from "../content.js";
import { parseSongs } from "./songs.js";
import { flutePlayer } from "../demo.js";
import { toneDemo, stopAll } from "../core/audio.js";
import { getDay, current } from "../course.js";
import { speak } from "../voice.js";

const RECORDINGS = [
  ["bansuri-sa-middle-octave-sankalp.mp3", "Sa, held"],
  ["bansuri-sa-lower-octave-sankalp.mp3", "Low Sa"],
  ["bansuri-sargam-sa-to-taar-sa-roguentropy.mp3", "Sa to upper Sa"],
  ["bansuri-major-scale-sankalp.mp3", "A scale"],
  ["bansuri-major-scale-staccato-sankalp.mp3", "A tongued scale"],
  ["bansuri-sa-three-octaves-sankalp.mp3", "Sa in three octaves"],
  ["bansuri-raag-jog-phrase-ninad-p.mp3", "A raga phrase"],
];

function lessonReached() {
  let max = 0;
  for (let n = 0; n <= current(); n++) { const d = getDay(n); if (d && d.lessons) for (const id of d.lessons) max = Math.max(max, Number(String(id).replace(/\D/g, "")) || 0); }
  return max;
}

export async function render(main) {
  const page = h("div", { class: "page" });
  main.append(page);
  let player = null, audio = null;
  const stage = h("section", { class: "card", hidden: true });
  const stopAllHere = () => { if (player) { player.destroy(); player = null; } if (audio) { audio.pause(); audio = null; } document.querySelectorAll("#main .listentile.on").forEach(t => t.classList.remove("on")); };
  const tile = (ic, label, onClick) => h("button", { type: "button", class: "listentile", onclick: e => onClick(e.currentTarget) }, icon(ic), h("b", null, label));

  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Listen"), h("h1", null, "Listen and watch"),
    h("p", { class: "muted" }, "Learn by ear: hear a real bansuri, watch the fingers play a song, and hear what a good tone sounds like."),
    h("button", { type: "button", class: "btn small ghost", onclick: () => speak("listen_intro") }, icon("speaker"), "Listen")), stage);

  page.append(h("section", { class: "card" }, h("h2", null, "A real bansuri"),
    h("div", { class: "listentiles" }, RECORDINGS.map(([f, label]) => tile("listen", label, t => {
      const was = t.classList.contains("on"); stopAllHere(); if (was) return;
      audio = new Audio("app/audio/" + f); audio.play().catch(() => {}); t.classList.add("on");
      audio.addEventListener("ended", () => t.classList.remove("on"));
    })))));

  page.append(h("section", { class: "card" }, h("h2", null, "Good tone, step by step"),
    h("p", { class: "small muted" }, "From airy (1) to clear (4). Aim for 4."),
    h("div", { class: "listentiles" }, [1, 2, 3, 4].map(l => tile("speaker", "Tone " + l, t => { stopAllHere(); stopAll(); toneDemo(l, 3); t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 3200); })))));

  const songsCard = h("section", { class: "card" }, h("h2", null, "Watch the fingers"), h("p", { class: "small muted" }, "Songs from the course, played on the flute picture. Watch which holes are covered."));
  const songGrid = h("div", { class: "listentiles" });
  songsCard.append(songGrid);
  page.append(songsCard);
  const show = (title, notation, bpm) => {
    stopAllHere();
    player = flutePlayer({ notation, bpm: Math.min(bpm || 66, 72), title });
    stage.replaceChildren(h("div", { class: "row between" }, h("h2", null, title), h("button", { type: "button", class: "btn ghost small", onclick: () => { stopAllHere(); stage.hidden = true; } }, "Close")), player.el);
    stage.hidden = false; stage.scrollIntoView({ behavior: "smooth", block: "start" });
    player.play();
  };
  fetchDoc("exercises/EX-MEL-practice-melodies.md").then(parseSongs).then(songs => {
    const reached = lessonReached();
    const list = songs.filter(s => s.lesson <= Math.max(reached, 9)).slice(0, 16);
    songGrid.replaceChildren(...list.map(s => tile("play", s.title, () => show(s.title, s.notation, s.bpm))));
  }).catch(() => {});

  // The course's listening library (recordings for every raga, and general listening), in the book.
  // Each raga's scale is on its own screen now (Music > Ragas).
  page.append(h("section", { class: "card hubgroup" }, h("div", { class: "hublist" },
    h("a", { class: "hubrow", href: "#/read/08-LISTENING-LIBRARY.md" }, h("span", { class: "stack" }, h("b", null, "Listening library"), h("span", { class: "small muted" }, "Bansuri recordings for every raga in this curriculum, plus general listening.")), h("span", { class: "chev", "aria-hidden": "true" }, ">")),
    h("a", { class: "hubrow", href: "#/music/ragas" }, h("span", { class: "stack" }, h("b", null, "Raga scales"), h("span", { class: "small muted" }, "On each raga's page in Ragas.")), h("span", { class: "chev", "aria-hidden": "true" }, ">")))));

  return () => { stopAllHere(); };
}
