// Skills > Games (#/skills/games, also #/play): every game grouped by the skill it trains, with a
// "No microphone" filter; a game at #/skills/game/<game> (also #/play/<game>) plays full focus; and
// challenges shared as links (#/challenge/<payload>). Falling notes can start on one song
// (#/skills/game/falling/<song id>, from the song's screen in Music).
import { h, store, storeSet, icon } from "../util.js";
import { tanpura } from "../core/audio.js";
import { getSettings } from "../core/settings.js";
import { questState } from "../fun.js";
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
import { SKILLS, MUSIC_GAMES, NO_MIC, gameBest } from "../skillmap.js";
import { GAME_FROM } from "./skills.js";

// The games a friend can be challenged in: those whose score means the same for both players (06 S6).
// Steer by pitch and Balloon also replay the same course (notes and seed); Raga phrases can also
// carry a phrase to play. Jam and Falling notes are left out (their score depends on the song or the
// raga chosen and how long you play).
export const CHALLENGE = new Set(["steer", "balloon", "phrase", "boat", "road", "lanterns", "bullseye", "floors", "wrong", "bingo", "higherlower", "sam",
  "meendbridge", "kanflick", "murkichase", "andolanlamp", "nameorn", "swell", "tongue", "laya", "tihai", "taar"]);
// Games with their own drone or band: the shell offers no drone of its own.
const NO_DRONE = new Set(["jam", "bingo"]);
const DRONE = "bansuri.game.drone";

export function decodeChallenge(p) {
  try {
    const bin = atob(String(p).replace(/-/g, "+").replace(/_/g, "/"));
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    if (!o || typeof o !== "object" || !CHALLENGE.has(o.g)) return null;
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
  const closeGame = () => { if (shellOff) { shellOff(); shellOff = null; } stage.classList.remove("gshell"); delete stage.dataset.phase; if (game) { game.destroy(); game = null; } stage.hidden = true; stage.replaceChildren(); stage.classList.remove("game-full"); document.documentElement.classList.remove("noscroll", "fullfocus"); document.removeEventListener("keydown", onKey); };
  cleanups.push(closeGame);
  // The game shell (redesign W52-W54) around each game's own widget: How to play (the game's own
  // instructions and options, then Play and the drone), Playing (the game, nothing else), Result
  // (the score, your best, a quest moved on, the game's own result, Again, Another game). The games
  // keep their logic and buttons; the shell presses the game's own Start for Play and Again, and
  // hears the score from the result the game sends out ("bansuri:live", type "game").
  let key = params[0] || null, chal = null, lastEnd = null;
  const ended = res => { lastEnd = res; };
  function open(title, make, opts = {}) {
    closeGame();
    game = make();
    const head = h("div", { class: "row between gs-head" }, h("h2", null, title), h("button", { type: "button", class: "btn ghost small", onclick: leave }, "Close"));
    // Full screen and full focus while playing (redesign W2): a bigger playing field, no top bar or
    // tabs, and nothing else to scroll past; Close leads out.
    stage.hidden = false; stage.classList.add("game-full"); stage.scrollTop = 0;
    document.documentElement.classList.add("noscroll", "fullfocus"); document.addEventListener("keydown", onKey);
    if (opts.plain) { stage.append(head, game.el); return; }
    shell(head, game, opts);
  }
  function shell(head, widget, opts) {
    const el = widget.el, start = el.querySelector(".btn.primary");
    // How to play shows the game's first row (its options) and its instructions; the rest waits.
    const optsRow = el.querySelector(":scope > .row"), instr = el.querySelector(":scope > p[aria-live]");
    for (const c of el.children) if (c !== optsRow && c !== instr) c.classList.add("gs-later");
    if (optsRow) optsRow.querySelectorAll("button").forEach(b => b.classList.add("gs-later"));
    if (start) start.classList.add("gs-start");
    stage.classList.add("gshell");
    const setPhase = p => { stage.dataset.phase = p; stage.scrollTop = 0; };
    // The drone under the game (a game with its own drone or band leaves it out).
    let droneMine = false;
    const droneBox = h("input", { type: "checkbox", id: "gs-drone", checked: tanpura.isOn() || store(DRONE, false) });
    droneBox.addEventListener("change", () => storeSet(DRONE, droneBox.checked));
    const droneOff = () => { if (droneMine) { tanpura.stop(); droneMine = false; } };
    const play = h("button", { type: "button", class: "btn primary big gs-play" }, "Play");
    play.addEventListener("click", () => { if (start) start.click(); });
    const intro = h("div", { class: "gs-intro" }, play, NO_DRONE.has(key) ? null : h("label", { class: "check gs-drone", for: "gs-drone" }, droneBox, "Drone"));
    // Result: above the game's own result, the score, your best and a moved quest; under it, Again
    // and Another game (and the challenge links).
    const resTop = h("div", { class: "gs-result gs-restop", "aria-live": "polite" }), resEnd = h("div", { class: "gs-result gs-resend" });
    const again = h("button", { type: "button", class: "btn primary big gs-again" }, "Play again");
    again.addEventListener("click", () => { if (start) start.click(); });
    const other = h("button", { type: "button", class: "btn gs-other", onclick: leave }, "Another game");
    let before = null;
    const questSnap = () => JSON.stringify(questState().list.map(q => [q.id, q.progress, q.done]));
    if (start) start.addEventListener("click", () => {
      if (stage.dataset.phase === "play") return;
      before = getSettings().focus ? null : questSnap(); lastEnd = null;
      if (droneBox.checked && !NO_DRONE.has(key) && !tanpura.isOn()) { tanpura.start(); droneMine = true; }
      setPhase("play");
    }, true);
    const onResult = e => {
      const d = e.detail || {};
      if (d.type !== "game" || !game || game.el !== el) return;
      droneOff();
      const best = gameBest(key), moved = before !== null && questSnap() !== before;
      resTop.replaceChildren(...[
        h("p", { class: "gs-score" }, h("span", null, "Score"), " ", h("b", null, String(d.score === undefined ? 0 : d.score))),
        d.best && d.score ? h("p", { class: "gs-best" }, "A new best!") : best !== null ? h("p", { class: "gs-best" }, h("span", null, "Your best:"), " ", h("b", null, String(best))) : null,
        moved ? h("p", { class: "chip good gs-quest" }, icon("check"), h("span", null, "Quest moved on")) : null,
        chal ? h("p", { class: "gs-vs" }, (d.score || 0) > chal.n ? "You beat " + (chal.by || "your friend") + "'s " + chal.n + "!" : "To beat: " + chal.n) : null].filter(Boolean));
      resEnd.replaceChildren(again, other);
      // A challenge: send your score back; a game that has challenges: challenge a friend.
      if (CHALLENGE.has(key) && d.score) resEnd.append(shareBox(chal, d.score));
      setPhase("result");
    };
    document.addEventListener("bansuri:live", onResult);
    shellOff = () => { document.removeEventListener("bansuri:live", onResult); droneOff(); };
    stage.append(head, h("p", { class: "eyebrow gs-howto" }, "How to play"), resTop, el, intro, resEnd);
    setPhase(opts.phase || "intro");
  }
  let shellOff = null;
  // A finished round offers a link that replays the same course for a friend; from a challenge, the
  // same course goes back with your score ("Send your score back").
  const shareBox = (from, score) => {
    const name = store("bansuri.share.name", "");
    // The course (notes and seed) travels only for the games that replay it.
    const course = key === "steer" || key === "balloon";
    const l = !course ? undefined : lastEnd && lastEnd.level ? lastEnd.level : from ? from.l : undefined, s = !course ? undefined : lastEnd && lastEnd.seed ? lastEnd.seed : from ? from.s : undefined;
    const link = challengeLink(Object.assign({ g: key, n: score, by: name }, l ? { l } : {}, s ? { s } : {}));
    const input = h("input", { class: "input", readonly: true, value: link, "aria-label": "Challenge link" });
    return h("div", { class: "stack challenge-share" }, h("span", { class: "small" }, from ? "Send this link to your friend:" : "Challenge a friend to beat " + score + ":"),
      h("div", { class: "row" }, input, h("button", { type: "button", class: "btn small", onclick: async () => { try { if (navigator.share) await navigator.share({ title: "Bansuri challenge", url: link }); else { await navigator.clipboard.writeText(link); input.select(); } } catch (e) { input.select(); } } }, from ? "Send your score back" : "Share")));
  };

  // The section tab names the screen; the heading is for screen readers (the quest card lives on
  // Skills > For you, the songs and ragas in Music).
  page.append(h("h1", { class: "sr-only" }, "Games"));

  const ragasP = loadRagas().catch(() => []);
  const songsP = fetchDoc("exercises/EX-MEL-practice-melodies.md").then(parseSongs).catch(() => []);
  const GAMES = {
    // From a challenge, the same course (its notes and seed).
    steer: ["Steer by pitch", "Fly a bird through gates by playing their notes.", () => open("Steer by pitch", () => pitchSteer(chal ? { level: chal.l, seed: chal.s, onEnd: ended } : { onEnd: ended }))],
    balloon: ["Balloon", "Hold the note in tune to blow up the balloon. Pop as many as you can.", () => open("Balloon", () => balloon(chal ? { level: chal.l, seed: chal.s, onEnd: ended } : { onEnd: ended }))],
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
  // A challenge opened from a friend's link (W55; the view "challenge", from any address that names
  // it): who scored what, in which game, and Take it on; then the game's How to play.
  if (view === "challenge" && params[0]) {
    const c = decodeChallenge(params[0]);
    if (!c) page.prepend(h("p", { class: "notice" }, "This challenge link could not be read."));
    else {
      const who = c.by ? c.by : "Your friend";
      const phrase = c.g === "phrase" && c.p.length;
      const title = phrase ? "Play the phrase" : GAMES[c.g][0];
      const take = h("button", { type: "button", class: "btn primary big gs-take" }, "Take it on");
      const label = (NOTE_SETS.find(s => s[0] === c.l) || NOTE_SETS[0])[1];
      const card = h("section", { class: "challenge stack" },
        phrase ? h("p", { class: "gs-chal" }, h("b", null, who + " challenges you")) : h("p", { class: "gs-chal" }, who + " scored " + c.n + " in " + title + "."),
        phrase ? h("p", null, "Play this phrase cleanly on your flute: ", h("b", { class: "mono" }, c.p.map(codeOf).join(" ")))
          : h("p", { class: "small muted" }, c.g === "steer" || c.g === "balloon" ? "Notes " + label + ", the same course. Can you beat it?" : "Can you beat it?"),
        take);
      key = c.g;
      open("A challenge", () => ({ el: card, destroy() {} }), { plain: true });
      take.addEventListener("click", () => {
        if (phrase) open("Play the phrase", () => phraseCheck({ phrase: c.p, reps: 1 }), { plain: true });
        else { chal = c; GAMES[c.g][2](); }
      });
    }
  }

  return () => cleanups.forEach(f => f());
}
