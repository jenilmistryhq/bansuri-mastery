// Music > Mine (#/music/mine): what the learner made. Melodies saved in Make a melody, and songs made
// from a recording in Transcribe (the ones Songs lists under "My songs").
import { h, store } from "../util.js";

export async function render(main) {
  const page = h("div", { class: "page" });
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Music"), h("h1", null, "Mine"),
    h("p", { class: "muted" }, "Your own tunes, and songs you turned into sargam from a recording.")));
  const melodies = store("bansuri.compose.saved", []), songs = store("bansuri.mysongs", []);
  const row = (href, title, sub) => h("a", { class: "hubrow", href }, h("span", { class: "stack" }, h("b", null, title), sub ? h("span", { class: "small muted mono", translate: "no" }, sub) : null), h("span", { class: "chev", "aria-hidden": "true" }, ">"));
  page.append(h("section", { class: "card hubgroup" }, h("h2", { class: "grouphead" }, "Your tunes"),
    h("div", { class: "hublist" }, melodies.length ? melodies.map(m => row("#/music/compose", m.name, m.notation)) : h("p", { class: "small muted" }, "Melodies you save in Make a melody appear here.")),
    h("a", { class: "btn primary", href: "#/music/compose" }, "Make a melody")));
  page.append(h("section", { class: "card hubgroup" }, h("h2", { class: "grouphead" }, "From your recordings"),
    h("div", { class: "hublist" }, songs.length ? songs.map(m => row("#/music/songs", m.title, m.notation ? String(m.notation).slice(0, 40) : null)) : h("p", { class: "small muted" }, "Songs you turn into sargam appear here, and under Songs.")),
    h("a", { class: "btn", href: "#/music/transcribe" }, "Turn a recording into sargam")));
  main.append(page);
}
