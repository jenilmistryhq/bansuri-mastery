// Play (#/play, #/challenge/<payload>): daily quests, games played with the real flute, the
// collection of songs and ragas, and challenges shared as links.
import { h, store } from "../util.js";
import { getDay, current, phaseOf } from "../course.js";
import { fetchDoc } from "../content.js";
import { questState } from "../fun.js";
import { pitchSteer, balloon, fallingNotes, jam, NOTE_SETS } from "../games.js";
import { ragaPhrases as phraseGame, layaLadder, tihai, taarSaptak } from "../games4.js";
import { meendBridge, kanFlick, murkiChase, andolanLamp, nameOrnament, swellFade, tonguedBeats } from "../games3.js";
import { boat, glideRoad, lanterns, bullseye, threeFloors, wrongNote, bingo, higherLower, catchSam } from "../games2.js";
import { phraseCheck } from "../core/live.js";
import { codeOf } from "../core/theory.js";
import { parseSongs } from "./songs.js";
import { ragaPhrases, ragaInfo } from "./reader.js";
import { ragaGrammar } from "../ragagrammar.js";
import { encodePayload } from "./progress.js";
import { SKILLS, MUSIC_GAMES } from "../skillmap.js";

export function decodeChallenge(p) {
  try {
    const bin = atob(String(p).replace(/-/g, "+").replace(/_/g, "/"));
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    if (!o || typeof o !== "object" || !["steer", "balloon", "phrase"].includes(o.g)) return null;
    return {
      g: o.g, l: NOTE_SETS.some(s => s[0] === o.l) ? o.l : "srg", s: Number.isInteger(o.s) ? o.s : 1, n: Number.isFinite(o.n) ? Math.max(0, Math.min(9999, o.n)) : 0,
      p: Array.isArray(o.p) ? o.p.filter(x => Number.isInteger(x) && x >= -12 && x <= 24).slice(0, 32) : [], by: typeof o.by === "string" ? o.by.slice(0, 30) : "",
    };
  } catch (e) { return null; }
}
export function challengeLink(c) { return location.origin + location.pathname + "#/challenge/" + encodePayload(c); }

function lessonReached() {
  let max = 0;
  for (let n = 0; n <= current(); n++) { const d = getDay(n); if (d && d.lessons) for (const id of d.lessons) max = Math.max(max, Number(String(id).replace(/\D/g, "")) || 0); }
  return max;
}

async function loadRagas() {
  const readme = await fetchDoc("ragas/README.md");
  const rows = [...readme.matchAll(/^\|\s*\d+\s*\|\s*\[([^\]]+)\]\(([a-z-]+\.md)\)(.*)$/gm)];
  return (await Promise.all(rows.map(async m => {
    const md = await fetchDoc("ragas/" + m[2]).catch(() => "");
    if (!md) return null;
    const ph = ragaPhrases(md), info = ragaInfo(md), phase = Number((/Phase (\d)/.exec(m[3]) || [])[1]) || 3;
    const notes = info.notes.length ? info.notes : [...new Set(ph.phrases.flat())].sort((a, b) => a - b);
    return { name: m[1], file: m[2], notes, first: info.first, phrases: ph.phrases, phase, grammar: ragaGrammar(md) };
  }))).filter(r => r && r.notes.length >= 4);
}

// Each game has its own address (#/play/<game>), so the browser's Back button returns to the list.
// fromList: the game was opened from the list in this visit, so Close can simply go back.
let fromList = false;

export async function render(main, { params, view }) {
  const page = h("div", { class: "page" });
  main.append(page);
  const cleanups = [];
  let game = null;
  const stage = h("div", { class: "card game-card", hidden: true });
  const onKey = e => { if (e.key === "Escape" && game) leave(); };
  // Close: back to the list (the previous history entry when the game was opened from it).
  const leave = () => {
    if (view === "play" && params[0]) { if (fromList) { fromList = false; history.back(); } else location.replace("#/play"); }
    else closeGame();
  };
  const closeGame = () => { if (game) { game.destroy(); game = null; } stage.hidden = true; stage.replaceChildren(); stage.classList.remove("game-full"); document.documentElement.classList.remove("noscroll"); document.removeEventListener("keydown", onKey); };
  cleanups.push(closeGame);
  function open(title, make, note) {
    closeGame();
    game = make();
    stage.append(...[h("div", { class: "row between" }, h("h2", null, title), h("button", { type: "button", class: "btn ghost small", onclick: leave }, "Close")), note, game.el].filter(Boolean));
    // Full screen while playing: a bigger playing field and nothing else to scroll past.
    stage.hidden = false; stage.classList.add("game-full"); stage.scrollTop = 0;
    document.documentElement.classList.add("noscroll"); document.addEventListener("keydown", onKey);
  }
  // A finished round offers a link that replays the same course for a friend.
  const shareBox = (g, l, seed, score) => {
    const name = store("bansuri.share.name", "");
    const link = challengeLink({ g, l, s: seed, n: score, by: name });
    const input = h("input", { class: "input", readonly: true, value: link, "aria-label": "Challenge link" });
    return h("div", { class: "row challenge-share" }, h("span", { class: "small" }, "Challenge a friend to beat " + score + ":"), input,
      h("button", { type: "button", class: "btn small", onclick: async () => { try { if (navigator.share) await navigator.share({ title: "Bansuri challenge", url: link }); else { await navigator.clipboard.writeText(link); input.select(); } } catch (e) { input.select(); } } }, "Share"));
  };
  const withShare = (g, make) => () => {
    let widget = null;
    const wrap = h("div");
    widget = make(res => { const old = wrap.querySelector(".challenge-share"); if (old) old.remove(); if (res.score) wrap.append(shareBox(g, res.level, res.seed, res.score)); });
    wrap.prepend(widget.el);
    return { el: wrap, destroy: () => widget.destroy() };
  };

  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Play"), h("h1", null, "Play with your flute"),
    h("p", { class: "muted" }, "Games that listen to your real flute, a band to jam with, and today's quests. Every game counts as practice.")));

  // A challenge opened from a link.
  if (view === "challenge" && params[0]) {
    const c = decodeChallenge(params[0]);
    if (!c) page.append(h("p", { class: "notice" }, "This challenge link could not be read."));
    else {
      const who = c.by ? c.by : "A friend";
      if (c.g === "phrase" && c.p.length) {
        page.append(h("section", { class: "card challenge" }, h("h2", null, who + " challenges you"), h("p", null, "Play this phrase cleanly on your flute: ", h("b", { class: "mono" }, c.p.map(codeOf).join(" ")))));
        open("Play the phrase", () => phraseCheck({ phrase: c.p, reps: 1 }));
      } else {
        const label = (NOTE_SETS.find(s => s[0] === c.l) || NOTE_SETS[0])[1];
        page.append(h("section", { class: "card challenge" }, h("h2", null, who + " scored " + c.n), h("p", null, (c.g === "steer" ? "Steer by pitch" : "Balloon") + ", notes " + label + ", the same course. Can you beat it?")));
        open(c.g === "steer" ? "Steer by pitch" : "Balloon", withShare(c.g, done => (c.g === "steer" ? pitchSteer : balloon)({ level: c.l, seed: c.s, onEnd: done })));
      }
    }
  }

  // One clear action: the game that moves today's quests on (or a favourite), then everything else.
  const ragasP = loadRagas().catch(() => []);
  const songsP = fetchDoc("exercises/EX-MEL-practice-melodies.md").then(parseSongs).catch(() => []);
  const GAMES = {
    steer: ["Steer by pitch", "Fly a bird through gates by playing their notes.", () => open("Steer by pitch", withShare("steer", done => pitchSteer({ onEnd: done })))],
    balloon: ["Balloon", "Hold the note in tune to blow up the balloon. Pop as many as you can.", () => open("Balloon", withShare("balloon", done => balloon({ onEnd: done })))],
    falling: ["Falling notes", "A song's notes fall in time: play each as it lands.", async () => {
      const reached = lessonReached(), songs = (await songsP).map(s => ({ title: s.id + " " + s.title, notation: s.notation, bpm: s.bpm, ready: s.lesson <= reached }));
      open("Falling notes", () => fallingNotes({ songs: songs.filter(s => s.ready).concat(songs.filter(s => !s.ready)) }));
    }],
    jam: ["Jam with the band", "Tanpura and tabla in a raga: improvise, and the app keeps you in the raga.", async () => { const ragas = await ragasP; open("Jam with the band", () => jam({ ragas })); }],
    boat: ["Long-breath boat", "Sail while you hold one long, steady note; in tune, it sails twice as fast.", () => open("Long-breath boat", () => boat())],
    road: ["Glide road", "Keep your pitch on a road that holds and glides between notes (meend).", () => open("Glide road", () => glideRoad())],
    lanterns: ["Light the lanterns", "Play a lantern's note to light it before it fades.", () => open("Light the lanterns", () => lanterns())],
    bullseye: ["Bullseye", "Hold a note: the arrow lands as far from the centre as you are out of tune.", () => open("Bullseye", () => bullseye())],
    floors: ["Three floors", "A lift between the octaves: play the note on the floor shown.", () => open("Three floors", () => threeFloors())],
    wrong: ["Spot the wrong note", "A phrase plays twice with one note changed. Which one? (no microphone)", () => open("Spot the wrong note", () => wrongNote())],
    bingo: ["Sargam bingo", "Notes play over the drone: mark them on your card. (no microphone)", () => open("Sargam bingo", () => bingo())],
    higherlower: ["Higher or lower", "Is the second note higher, lower or the same? (no microphone)", () => open("Higher or lower", () => higherLower())],
    sam: ["Catch the sam", "Tap on beat 1 of each cycle of the taal, even when it is not stressed. (no microphone)", () => open("Catch the sam", () => catchSam())],
    meendbridge: ["Meend bridge", "Six glides between notes: no step, no break, landing on the note.", () => open("Meend bridge", () => meendBridge())],
    kanflick: ["Kan flick", "A flick of the grace note before each note; clean kans build a streak.", () => open("Kan flick", () => kanFlick())],
    murkichase: ["Murki chase", "Quick turns of notes; each clean murki makes the next one faster.", () => open("Murki chase", () => murkiChase())],
    andolanlamp: ["Andolan lamp", "Swing komal Re, Ga or Dha slowly below its place and back.", () => open("Andolan lamp", () => andolanLamp())],
    swell: ["Swell and fade", "Louder, then softer, on one note, without the pitch moving.", () => open("Swell and fade", () => swellFade())],
    tongue: ["Tongued beats", "Tongue a short Sa on every beat of the metronome, evenly.", () => open("Tongued beats", () => tonguedBeats())],
    phrase: ["Raga phrases", "Ornaments inside a raga's own phrases: Bhairav's andolan, Bhimpalasi's meend and kan, and more.", () => open("Raga phrases", () => phraseGame())],
    taar: ["Taar saptak", "Hold the upper octave steady, clear and in tune: S', R', G', m'.", () => open("Taar saptak", () => taarSaptak())],
    laya: ["Laya ladder", "Over the theka: one note a beat, then two (dugun), then three (tigun).", () => open("Laya ladder", () => layaLadder())],
    tihai: ["Tihai", "A phrase three times, so its last note lands on sam.", () => open("Tihai", () => tihai())],
    nameorn: ["Name the ornament", "Hear a phrase: meend, kan, murki, andolan or a plain note? (no microphone)", () => open("Name the ornament", () => nameOrnament())],
    compose: ["Make a melody", "Build a tune from a raga's notes, play it, and challenge a friend.", () => { location.hash = "#/compose"; }],
    quick: ["5-minute practice", "Short on time? A long tone, a game and a song.", () => { location.hash = "#/quick"; }],
  };
  // Which game helps with which quest.
  const FOR_QUEST = { phrase: "phrase", laya: "laya", tihai: "tihai", ornament: "meendbridge", swell: "swell", boat: "boat", bullseye: "bullseye", wrong: "wrong", sam: "sam", road: "road", hold: "boat", steer: "steer", balloon: "balloon", falling: "falling", jam: "jam", song: "falling", echo: "steer", tap: "jam" };
  // Opening a game goes to its address; the route then opens it (below).
  const go = key => { fromList = true; location.hash = "#/play/" + key; };
  const NAV_ONLY = new Set(["compose", "quick"]);
  const qs = questState(), left = qs.list.filter(q => !q.done && FOR_QUEST[q.id]);
  const pick = left.length ? FOR_QUEST[left[0].id] : "balloon";
  const [pTitle, pText, pGo] = GAMES[pick];
  page.append(h("section", { class: "card playnow" },
    h("span", { class: "small muted" }, left.length ? "For today's quest: " + left[0].text : "A good one to play now"),
    h("h2", null, pTitle), h("p", { class: "small muted" }, pText),
    h("button", { type: "button", class: "btn primary big", onclick: () => (NAV_ONLY.has(pick) ? pGo() : go(pick)) }, "Play " + pTitle)), stage);
  const done = qs.list.filter(q => q.done).length;
  page.append(h("a", { class: "questline small", href: "#/progress" }, "Quests: " + done + " of " + qs.list.length + " done today (20 XP each, 20 more for all three). Every game round earns a little XP."));

  // The other games.
  const card = (title, text, onClick) => h("button", { type: "button", class: "gamecard", onclick: onClick }, h("b", null, title), h("span", { class: "small muted" }, text));
  // Grouped by the skill each game trains (see skillmap.js), then the games that are pieces of music.
  const GROUPS = SKILLS.map(s => [s.title, s.games]).concat([["Music", MUSIC_GAMES], ["Make and practise", ["compose", "quick"]]]);
  for (const [head, keys] of GROUPS) page.append(h("h2", { class: "grouphead" }, head), h("section", { class: "games" }, keys.filter(k => k !== pick).map(k => card(GAMES[k][0], GAMES[k][1], NAV_ONLY.has(k) ? GAMES[k][2] : () => go(k)))));
  // #/play/<game>: open that game (the list stays underneath).
  if (view === "play" && params[0]) {
    if (GAMES[params[0]] && !NAV_ONLY.has(params[0])) await GAMES[params[0]][2]();
    else location.replace("#/play");
  }

  // Collection.
  const coll = h("details", { class: "card" }, h("summary", null, h("b", null, "Your collection: songs and ragas")), h("p", { class: "small muted" }, "Songs and ragas unlock as the course reaches them. A song is mastered when you mark it \"I can play it\" or get 2 stars on it."));
  page.append(coll);
  Promise.all([songsP, ragasP]).then(([songs, ragas]) => {
    const reached = lessonReached(), learned = store("bansuri.songs.learned", {}), d = getDay(current()), phase = d ? (phaseOf(d) || { id: 0 }).id : 0;
    const starred = id => Object.keys(localStorage).some(k => k.startsWith("bansuri.game.falling.best.") && k.includes(id + " ") && Number(localStorage.getItem(k)) > 0);
    coll.append(h("h3", null, "Songs"), h("div", { class: "collection" }, songs.map(s => {
      const state = learned[s.id] || starred(s.id) ? "mastered" : s.lesson <= reached ? "open" : "locked";
      return h("a", { class: "ccard " + state, href: "#/songs", title: state === "locked" ? "Unlocks after L" + String(s.lesson).padStart(2, "0") : s.title },
        h("b", null, state === "locked" ? "?" : s.title), h("span", { class: "small" }, state === "mastered" ? "mastered" : state === "open" ? "ready" : "after L" + String(s.lesson).padStart(2, "0")));
    })), h("h3", null, "Ragas"), h("div", { class: "collection" }, ragas.map(r => {
      const open2 = phase >= r.phase;
      return h("a", { class: "ccard " + (open2 ? "open" : "locked"), href: "#/read/ragas/" + r.file }, h("b", null, open2 ? r.name : "?"), h("span", { class: "small" }, open2 ? r.notes.map(codeOf).join(" ") : "Phase " + r.phase));
    })));
  });

  return () => cleanups.forEach(f => f());
}
