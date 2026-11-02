// Skills > Games (#/skills/games, also #/play): every game grouped by the skill it trains, with a
// "No microphone" filter; a game at #/skills/game/<game> (also #/play/<game>) plays full focus; and
// challenges shared as links (#/challenge/<payload>). Falling notes can start on one song
// (#/skills/game/falling/<song id>, from the song's screen in Music).
import { h, store, storeSet } from "../util.js";
import { getDay, current } from "../course.js";
import { fetchDoc } from "../content.js";
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
import { SKILLS, MUSIC_GAMES, NO_MIC } from "../skillmap.js";
import { GAME_FROM } from "./skills.js";

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
  // The new address (#/skills/game/<game>) and the old one (#/play/<game>) open the same game; a
  // game opened from a skill's screen (or the For you card) closes back to it.
  const newRoute = /^#\/skills\/game\//.test(location.hash);
  let fromHub = null;
  try { fromHub = sessionStorage.getItem(GAME_FROM); sessionStorage.removeItem(GAME_FROM); } catch (e) { fromHub = null; }
  // Close: back to the list or the skill (the previous history entry when the game was opened from it).
  const leave = () => {
    if (view === "play" && params[0]) { if (fromList || fromHub) { fromList = false; history.back(); } else location.replace(newRoute ? "#/skills/games" : "#/play"); }
    else closeGame();
  };
  const closeGame = () => { if (game) { game.destroy(); game = null; } stage.hidden = true; stage.replaceChildren(); stage.classList.remove("game-full"); document.documentElement.classList.remove("noscroll", "fullfocus"); document.removeEventListener("keydown", onKey); };
  cleanups.push(closeGame);
  function open(title, make, note) {
    closeGame();
    game = make();
    stage.append(...[h("div", { class: "row between" }, h("h2", null, title), h("button", { type: "button", class: "btn ghost small", onclick: leave }, "Close")), note, game.el].filter(Boolean));
    // Full screen and full focus while playing (redesign W2): a bigger playing field, no top bar or
    // tabs, and nothing else to scroll past; Close leads out.
    stage.hidden = false; stage.classList.add("game-full"); stage.scrollTop = 0;
    document.documentElement.classList.add("noscroll", "fullfocus"); document.addEventListener("keydown", onKey);
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

  // The section tab names the screen; the heading is for screen readers (the quest card lives on
  // Skills > For you, the songs and ragas in Music).
  page.append(h("h1", { class: "sr-only" }, "Games"));

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

  const ragasP = loadRagas().catch(() => []);
  const songsP = fetchDoc("exercises/EX-MEL-practice-melodies.md").then(parseSongs).catch(() => []);
  const GAMES = {
    steer: ["Steer by pitch", "Fly a bird through gates by playing their notes.", () => open("Steer by pitch", withShare("steer", done => pitchSteer({ onEnd: done })))],
    balloon: ["Balloon", "Hold the note in tune to blow up the balloon. Pop as many as you can.", () => open("Balloon", withShare("balloon", done => balloon({ onEnd: done })))],
    falling: ["Falling notes", "A song's notes fall in time: play each as it lands.", async songId => {
      const reached = lessonReached(), songs = (await songsP).map(s => ({ id: s.id, title: s.id + " " + s.title, notation: s.notation, bpm: s.bpm, ready: s.lesson <= reached }));
      let list = songs.filter(s => s.ready).concat(songs.filter(s => !s.ready));
      // Opened from a song's screen: that song first (a course song, or one of My songs).
      if (songId) {
        const mine = store("bansuri.mysongs", []).find(m => m.id === songId);
        const one = mine ? { id: mine.id, title: mine.title, notation: mine.notation, bpm: mine.bpm, ready: true } : list.find(s => s.id === songId);
        if (one) list = [one].concat(list.filter(s => s !== one));
      }
      open("Falling notes", () => fallingNotes({ songs: list }));
    }],
    jam: ["Jam with the band", "Tanpura and tabla in a raga: improvise, and the app keeps you in the raga.", async ragaId => {
      let ragas = await ragasP;
      // Opened from a raga's screen (#/skills/game/jam/<raga>): that raga first.
      const one = ragaId ? ragas.find(r => r.file === ragaId + ".md") : null;
      if (one) ragas = [one].concat(ragas.filter(r => r !== one));
      open("Jam with the band", () => jam({ ragas }));
    }],
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
  // Opening a game goes to its address (the old #/play/<game> from the old list); the route then opens it (below).
  const go = key => { fromList = true; location.hash = (/^#\/play/.test(location.hash) ? "#/play/" : "#/skills/game/") + key; };
  const NAV_ONLY = new Set(["compose", "quick"]);

  // Every game, grouped by the skill it trains (see skillmap.js), then the games that are pieces of
  // music; "No microphone" keeps the games played by ear or by tapping.
  const FILTER = "bansuri.games.filter";
  let noMic = store(FILTER, "all") === "nomic";
  const card = (k, title, text, onClick) => h("button", { type: "button", class: "gamecard", dataset: { game: k }, onclick: onClick }, h("b", null, title), h("span", { class: "small muted" }, text));
  const GROUPS = SKILLS.map(s => [s.title, s.games]).concat([["Music", MUSIC_GAMES], ["Make and practise", ["compose", "quick"]]]);
  const list = h("div", { class: "gamelist" });
  const chip = (label, on) => h("button", { type: "button", class: "chipbtn", "aria-pressed": String(on) }, label);
  const allBtn = chip("All", !noMic), micBtn = chip("No microphone", noMic);
  const draw = () => {
    allBtn.setAttribute("aria-pressed", String(!noMic)); micBtn.setAttribute("aria-pressed", String(noMic));
    list.replaceChildren();
    for (const [head, keys] of GROUPS) {
      const shown = keys.filter(k => !noMic || NO_MIC.includes(k));
      if (shown.length) list.append(h("h2", { class: "grouphead" }, head), h("section", { class: "games" }, shown.map(k => card(k, GAMES[k][0], GAMES[k][1], NAV_ONLY.has(k) ? GAMES[k][2] : () => go(k)))));
    }
  };
  const setFilter = v => { noMic = v; storeSet(FILTER, v ? "nomic" : "all"); draw(); };
  allBtn.addEventListener("click", () => setFilter(false));
  micBtn.addEventListener("click", () => setFilter(true));
  page.append(h("div", { class: "chips gamefilter", role: "group", "aria-label": "Show games" }, allBtn, micBtn), stage, list);
  draw();
  // #/skills/game/<game> or #/play/<game>: open that game (the list stays underneath).
  if (view === "play" && params[0]) {
    if (GAMES[params[0]] && !NAV_ONLY.has(params[0])) await GAMES[params[0]][2](params[1]);
    else location.replace(newRoute ? "#/skills/games" : "#/play");
  }

  return () => cleanups.forEach(f => f());
}
