// Songs (#/songs): every melody in EX-MEL as something to listen to and play along with, with the
// microphone checking each note. Melodies are read from the exercise file itself, and marked
// ready when every note they use has been taught by the learner's current day.
import { h, store, storeSet } from "../util.js";
import { fetchDoc } from "../content.js";
import { getDay, current } from "../course.js";
import { parseNotation, buildEvents, analyzeRange } from "../core/notation.js";
import { mountBench } from "../bench/bench.js";
import { makePlayable } from "../playable.js";

const FILE = "exercises/EX-MEL-practice-melodies.md";

// [{ level, title, meta, notation, bpm, lesson }] from the "### n.n Title (meta)" sections.
export function parseSongs(md) {
  const out = []; let level = "", cur = null;
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if ((m = /^## (Level \d+[^(]*)/.exec(line))) { level = m[1].trim().replace(/:$/, ""); cur = null; continue; }
    if (/^## /.test(line)) { level = ""; cur = null; continue; }
    if (level && (m = /^### (\d+\.\d+\w?) (.+?)(?: \((.+)\))?\s*$/.exec(line))) { cur = { level, id: m[1], title: m[2], meta: m[3] || "", notation: null }; out.push(cur); continue; }
    if (cur && /^```/.test(line)) {
      const body = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) body.push(lines[i]);
      const text = body.join("\n").trim(), p = parseNotation(text);
      if (!p.skipped.length && p.tokens.some(t => t.type === "beat")) cur.notation = text;
    }
  }
  return out.filter(s => s.notation).map(s => {
    const bpm = (/(\d+)(?:\s*-\s*\d+)?\s*BPM/i.exec(s.meta) || [])[1];
    const range = analyzeRange(buildEvents(parseNotation(s.notation).tokens, 60).ev);
    return Object.assign(s, { bpm: bpm ? Number(bpm) : 60, lesson: range ? range.lesson : 99 });
  });
}

// The highest lesson number the plan has reached by the learner's current day.
function lessonReached() {
  let max = 0;
  for (let n = 0; n <= current(); n++) {
    const d = getDay(n);
    if (d && d.lessons) for (const id of d.lessons) max = Math.max(max, Number(String(id).replace(/\D/g, "")) || 0);
  }
  return max;
}

export async function render(main) {
  const page = h("div", { class: "page" });
  main.append(page);
  let songs;
  try { songs = parseSongs(await fetchDoc(FILE)); }
  catch (e) { page.append(h("p", null, "Could not load the melodies: " + e.message)); return; }
  const reached = lessonReached(), learned = store("bansuri.songs.learned", {});
  const cleanups = [];
  let onlyReady = store("bansuri.songs.onlyReady", true);
  const ready = s => s.lesson <= reached;
  const filter = h("input", { type: "checkbox", id: "songs-ready" });
  filter.checked = onlyReady;
  const list = h("div", { class: "stack" });
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Songs"), h("h1", null, "Play a melody"),
    h("p", { class: "muted" }, "Listen, then play along: the app keeps the beat and drone while the microphone checks every note."),
    h("p", { class: "small" }, "A song you want that is not here? ", h("a", { href: "#/transcribe" }, "Make its notation from a recording"), " (a YouTube video, the microphone or a file)."),
    h("label", { class: "check", for: "songs-ready" }, filter, "Only songs I can play now (" + songs.filter(ready).length + " of " + songs.length + ")")), list);

  function draw() {
    cleanups.splice(0).forEach(f => f());
    list.replaceChildren();
    let lastLevel = null;
    for (const s of songs) {
      if (onlyReady && !ready(s)) continue;
      if (s.level !== lastLevel) { list.append(h("h2", { class: "songlevel" }, s.level)); lastLevel = s.level; }
      const host = h("div", { class: "toolhost", hidden: true });
      let bench = null;
      const playBtn = h("button", { type: "button", class: "btn primary" }, "Play along");
      playBtn.addEventListener("click", () => {
        if (bench) { bench.destroy(); bench = null; host.hidden = true; playBtn.textContent = "Play along"; return; }
        host.hidden = false; playBtn.textContent = "Close";
        bench = mountBench(host, { compact: true, tabs: ["play"], tab: "play", notation: s.notation, bpm: s.bpm, checkMe: true, title: s.id + " " + s.title });
      });
      cleanups.push(() => bench && bench.destroy());
      const done = h("input", { type: "checkbox", "aria-label": "Learned " + s.title });
      done.checked = !!learned[s.id];
      done.addEventListener("change", () => { learned[s.id] = done.checked; storeSet("bansuri.songs.learned", learned); card.classList.toggle("learned", done.checked); });
      // A plain-text preview of the first line; the play button belongs to the full melody (hidden code).
      const code = h("span", { class: "songpreview" }, s.notation.split("\n")[0] + (s.notation.includes("\n") ? " ..." : ""));
      const card = h("article", { class: "card song" + (done.checked ? " learned" : "") },
        h("div", { class: "songhead" },
          h("div", { class: "stack", style: { gap: "2px" } }, h("b", null, s.id + " " + s.title), h("span", { class: "small muted" }, s.meta)),
          ready(s) ? h("span", { class: "chip good" }, "Ready") : h("span", { class: "chip mutedc" }, "After L" + String(s.lesson).padStart(2, "0"))),
        h("div", { class: "small mono songline" }, h("code", { hidden: true }, s.notation), code),
        h("div", { class: "row between" }, playBtn, h("label", { class: "check small" }, done, "I can play it")), host);
      makePlayable(card);
      list.append(card);
    }
    if (!list.children.length) list.append(h("p", { class: "notice info" }, "No melody is unlocked yet: the first ones open with L09 (Sa, Re, Ga). Untick the box above to see them all."));
  }
  filter.addEventListener("change", () => { onlyReady = filter.checked; storeSet("bansuri.songs.onlyReady", onlyReady); draw(); });
  draw();
  return () => cleanups.forEach(f => f());
}
