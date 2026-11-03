// Music > Songs (#/music, #/songs): the song you were learning first ("Carry on"), what you have in
// Music (songs ready, ragas open, your own tunes, Listen), then every melody in EX-MEL and your own
// (from Transcribe) as one list, filtered All / Ready now / Mine. A song (#/music/song/<id>, redesign
// U3): its notation, Hear it with the tempo, drone and taal, Play along (the microphone checks each
// note), Falling notes with that song, and "I can play it". Melodies are read from the exercise file
// itself, and marked ready when every note they use has been taught by the learner's current day.
import { h, store, storeSet, icon } from "../util.js";
import { fetchDoc } from "../content.js";
import { getDay, current } from "../course.js";
import { parseNotation, buildEvents, analyzeRange, playEvents } from "../core/notation.js";
import { tanpura } from "../core/audio.js";
import { mountBench } from "../bench/bench.js";
import { getState } from "../state.js";
import { backHead } from "../backhead.js";
import { GAME_FROM } from "./skills.js";

const FILE = "exercises/EX-MEL-practice-melodies.md";
const LEARNED = "bansuri.songs.learned", LAST = "bansuri.songs.last", FILTER = "bansuri.songs.filter";

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
export function lessonReached() {
  let max = 0;
  for (let n = 0; n <= current(); n++) {
    const d = getDay(n);
    if (d && d.lessons) for (const id of d.lessons) max = Math.max(max, Number(String(id).replace(/\D/g, "")) || 0);
  }
  return max;
}

const after = s => "After L" + String(s.lesson).padStart(2, "0");
// Every song in one list: the learner's own (from Transcribe) first, then the course's melodies.
async function allSongs() {
  const course = parseSongs(await fetchDoc(FILE)), reached = lessonReached();
  const mine = store("bansuri.mysongs", []).map(m => ({ id: m.id, title: m.title, name: m.title, meta: "From Transcribe, " + m.bpm + " BPM", notation: m.notation, bpm: m.bpm, mine: true, ready: true, level: "My songs" }));
  return mine.concat(course.map(s => Object.assign(s, { name: s.id + " " + s.title, ready: s.lesson <= reached })));
}
// The song you played last: the one opened last here, else the latest play-along of a course song.
function lastSong(songs, plays) {
  const id = store(LAST, null), byId = songs.find(s => s.id === id);
  if (byId) return byId;
  for (let i = plays.length - 1; i >= 0; i--) { const s = songs.find(x => plays[i].piece === x.name); if (s) return s; }
  return null;
}

async function list(main) {
  const page = h("div", { class: "page" }, h("h1", { class: "sr-only" }, "Songs"));
  main.append(page);
  let songs;
  try { songs = await allSongs(); }
  catch (e) { page.append(h("p", null, "Could not load the melodies: " + e.message)); return; }
  const learned = store(LEARNED, {});
  // Carry on: the piece you were learning, first (repertoire is learned over many sessions).
  const last = lastSong(songs, getState().live.plays || []);
  if (last) page.append(h("section", { class: "card carryon" }, h("span", { class: "eyebrow" }, "Carry on"), h("h2", null, last.name),
    learned[last.id] ? h("p", { class: "small" }, icon("check"), " I can play it") : null,
    h("a", { class: "btn primary big", href: "#/music/song/" + last.id + "#play" }, "Play along")));
  // What there is in Music, counted.
  const counts = h("div", { class: "hublist" });
  const crow = (href, title, aside) => h("a", { class: "hubrow", href }, h("b", null, title), aside ? h("span", { class: "small muted" }, aside) : null, h("span", { class: "chev", "aria-hidden": "true" }, ">"));
  const ready = songs.filter(s => s.ready && !s.mine).length, tunes = store("bansuri.compose.saved", []).length;
  const ragaRow = crow("#/music/ragas", "Ragas", null);
  counts.append(crow("#/music/songs#songlist", "Songs", "{n} ready now".replace("{n}", ready)), ragaRow, crow("#/music/mine", "Your own tunes", "{n} saved".replace("{n}", tunes)), crow("#/music/listen", "Listen and watch", null));
  page.append(h("section", { class: "card hubgroup" }, counts));
  import("./ragas.js").then(m => m.ragaList()).then(rs => { ragaRow.children[0].after(h("span", { class: "small muted" }, "{n} open".replace("{n}", rs.filter(r => r.open).length))); }).catch(() => {});

  // The songs, one list, with All / Ready now / Mine.
  let filter = store(FILTER, store("bansuri.songs.onlyReady", true) ? "ready" : "all");
  const chips = h("div", { class: "chips songfilter", role: "group", "aria-label": "Show songs" });
  const listEl = h("div", { class: "hublist songlist" });
  const draw = () => {
    chips.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.f === filter)));
    const shown = songs.filter(s => filter === "all" || (filter === "ready" ? s.ready : s.mine));
    let head = null;
    listEl.replaceChildren();
    for (const s of shown) {
      if (s.level !== head) { head = s.level; listEl.append(h("h3", { class: "songlevel" }, s.level)); }
      const status = s.mine ? h("span", { class: "chip info" }, "Mine") : s.ready ? h("span", { class: "chip good" }, "Ready") : h("span", { class: "chip mutedc" }, after(s));
      listEl.append(h("a", { class: "hubrow songrow" + (learned[s.id] ? " learned" : ""), href: "#/music/song/" + s.id },
        h("span", { class: "stack" }, h("b", null, s.name), s.meta ? h("span", { class: "small muted" }, s.meta) : null), status, h("span", { class: "chev", "aria-hidden": "true" }, ">")));
    }
    if (!shown.length) listEl.append(h("p", { class: "notice info" }, filter === "mine" ? "Songs you turn into sargam from a recording appear here." : "No melody is unlocked yet: the first ones open with L09 (Sa, Re, Ga). Choose All to see them all."));
  };
  for (const [k, label] of [["all", "All"], ["ready", "Ready now"], ["mine", "Mine"]]) chips.append(h("button", { type: "button", class: "chipbtn", dataset: { f: k }, onclick: () => { filter = k; storeSet(FILTER, k); draw(); } }, label));
  page.append(h("section", { class: "card", id: "songlist" }, chips, listEl,
    h("div", { class: "row songfrom" }, h("span", { class: "small muted" }, "Have a recording of a song?"), h("a", { class: "btn", href: "#/music/transcribe" }, "+ From a recording"))));
  draw();
}

async function song(main, id, anchor) {
  let songs;
  try { songs = await allSongs(); } catch (e) { songs = []; }
  const s = songs.find(x => x.id === id);
  if (!s) { location.replace("#/music"); return; }
  storeSet(LAST, s.id);
  const cleanups = [];
  let stopHear = null, bench = null, droneMine = false;
  const stopIt = () => { if (stopHear) { stopHear(); stopHear = null; hearBtn.replaceChildren(icon("play"), " Hear it"); } };
  cleanups.push(() => { stopIt(); if (bench) bench.destroy(); if (droneMine) tanpura.stop(); });

  const notation = h("div", { class: "songnotation mono", translate: "no" }, s.notation.split("\n").map(l => h("div", null, l)));
  const bpmIn = h("input", { class: "input", type: "number", min: "30", max: "220", value: String(s.bpm), "aria-label": "Tempo in BPM" });
  const drone = h("input", { type: "checkbox", id: "song-drone" }), taal = h("input", { type: "checkbox", id: "song-taal" });
  const tempo = () => Math.min(220, Math.max(30, Number(bpmIn.value) || s.bpm));
  // Hear it: the melody on the flute voice, at the tempo, with the drone and the taal's beat if chosen.
  const hearBtn = h("button", { type: "button", class: "btn" }, icon("play"), " Hear it");
  hearBtn.addEventListener("click", () => {
    if (stopHear) { stopIt(); return; }
    const b = buildEvents(parseNotation(s.notation).tokens, tempo());
    stopHear = playEvents(b.ev, b.beats, { bpm: tempo(), click: taal.checked, onEnd: () => stopIt() });
    hearBtn.replaceChildren(icon("stop"), " Stop");
  });
  drone.addEventListener("change", () => {
    if (drone.checked && !tanpura.isOn()) { tanpura.start(); droneMine = true; }
    else if (!drone.checked && droneMine) { tanpura.stop(); droneMine = false; }
  });
  bpmIn.addEventListener("change", () => { if (stopHear) { stopIt(); hearBtn.click(); } });

  // Play along: the Bench's player with this song, the microphone checking each note.
  const host = h("div", { class: "toolhost", id: "play", hidden: true });
  const playBtn = h("button", { type: "button", class: "btn primary big" }, "Play along");
  const openPlay = () => {
    stopIt();
    if (bench) { bench.destroy(); bench = null; host.hidden = true; playBtn.textContent = "Play along"; return; }
    host.hidden = false; playBtn.textContent = "Close";
    bench = mountBench(host, { compact: true, tabs: ["play"], tab: "play", notation: s.notation, bpm: tempo(), checkMe: true, title: s.mine ? s.title : s.id + " " + s.title });
    // The song's choices carry over: the drone (if this screen started it, the player takes over) and the taal's beat.
    const set = (ref, on) => { const box = host.querySelector("[data-ref=" + ref + "]"); if (box && box.checked !== on) { box.checked = on; box.dispatchEvent(new Event("change")); } };
    if (droneMine) { tanpura.stop(); droneMine = false; drone.checked = false; set("droneWithPlay", true); }
    set("clickOn", taal.checked);
  };
  playBtn.addEventListener("click", openPlay);

  const learned = store(LEARNED, {});
  const done = h("input", { type: "checkbox", id: "song-learned" });
  done.checked = !!learned[s.id];
  done.addEventListener("change", () => { const l = store(LEARNED, {}); l[s.id] = done.checked; storeSet(LEARNED, l); });
  const game = h("a", { class: "btn", href: "#/skills/game/falling/" + s.id }, "Play it as a game: Falling notes");
  game.addEventListener("click", () => { try { sessionStorage.setItem(GAME_FROM, location.hash); } catch (e) { /* Close goes to the games */ } });
  const status = s.mine ? h("span", { class: "chip info" }, "Mine") : s.ready ? h("span", { class: "chip good" }, "Ready") : h("span", { class: "chip mutedc" }, after(s));
  const extra = [];
  if (s.mine) {
    const remove = h("button", { type: "button", class: "btn small ghost" }, "Remove");
    remove.addEventListener("click", () => { if (remove.dataset.armed !== "1") { remove.dataset.armed = "1"; remove.textContent = "Tap again to remove"; return; } storeSet("bansuri.mysongs", store("bansuri.mysongs", []).filter(x => x.id !== s.id)); location.hash = "#/music"; });
    extra.push(h("div", { class: "row" }, remove));
  }
  main.append(h("div", { class: "page songpage", dataset: { noswipe: "1" } },
    backHead("#/music", "Songs", s.mine ? s.title : s.id + " " + s.title, status),
    s.meta ? h("p", { class: "small muted" }, s.meta) : null,
    h("section", { class: "card stack" }, notation,
      h("div", { class: "row songcontrols" }, hearBtn, h("label", { class: "field songbpm" }, "Tempo (BPM)", bpmIn),
        h("label", { class: "check", for: "song-drone" }, drone, "Drone"), h("label", { class: "check", for: "song-taal" }, taal, "Taal"))),
    h("section", { class: "card stack" }, playBtn, host, game,
      h("label", { class: "check", for: "song-learned" }, done, "I can play it")),
    ...extra));
  if (anchor === "play") openPlay();
  return () => cleanups.forEach(f => f());
}

export async function render(main, { params, view, anchor }) {
  if (view === "song") return song(main, params[0], anchor);
  return list(main);
}
