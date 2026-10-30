// Play (#/play, #/challenge/<payload>): daily quests, games played with the real flute, the
// collection of songs and ragas, and challenges shared as links.
import { h, store } from "../util.js";
import { getState } from "../state.js";
import { getDay, current, phaseOf } from "../course.js";
import { fetchDoc } from "../content.js";
import { questState } from "../fun.js";
import { levelBar } from "../levelui.js";
import { pitchSteer, balloon, fallingNotes, jam, NOTE_SETS } from "../games.js";
import { phraseCheck } from "../core/live.js";
import { codeOf } from "../core/theory.js";
import { parseSongs } from "./songs.js";
import { ragaPhrases, ragaInfo } from "./reader.js";
import { encodePayload } from "./progress.js";

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
    return { name: m[1], file: m[2], notes, first: info.first, phrases: ph.phrases, phase };
  }))).filter(r => r && r.notes.length >= 4);
}

export async function render(main, { params, view }) {
  const page = h("div", { class: "page" });
  main.append(page);
  const cleanups = [];
  let game = null;
  const stage = h("div", { class: "card game-card", hidden: true });
  const onKey = e => { if (e.key === "Escape" && game) closeGame(); };
  const closeGame = () => { if (game) { game.destroy(); game = null; } stage.hidden = true; stage.replaceChildren(); stage.classList.remove("game-full"); document.documentElement.classList.remove("noscroll"); document.removeEventListener("keydown", onKey); };
  cleanups.push(closeGame);
  function open(title, make, note) {
    closeGame();
    game = make();
    stage.append(...[h("div", { class: "row between" }, h("h2", null, title), h("button", { type: "button", class: "btn ghost small", onclick: closeGame }, "Close")), note, game.el].filter(Boolean));
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

  // Quests and level.
  const qs = questState();
  page.append(h("section", { class: "card quests" },
    h("h2", null, "Today's quests"),
    h("a", { class: "levellink", href: "#/progress#level" }, levelBar({ compact: true })),
    h("ul", { class: "questlist" }, qs.list.map(q => h("li", { class: q.done ? "done" : "" }, h("span", { class: "qmark", "aria-hidden": "true" }, q.done ? "✓" : ""), h("span", null, q.text), q.goal > 1 && !q.done ? h("span", { class: "small muted" }, " " + Math.min(q.goal, Math.floor(q.progress)) + " of " + q.goal) : null))),
    h("p", { class: "small muted" }, "20 XP per quest, 20 more for finishing all three. New quests every day. Every game round earns a little XP too.")));

  // Games.
  const ragasP = loadRagas().catch(() => []);
  const songsP = fetchDoc("exercises/EX-MEL-practice-melodies.md").then(parseSongs).catch(() => []);
  const card = (title, text, onClick) => h("button", { type: "button", class: "gamecard", onclick: onClick }, h("b", null, title), h("span", { class: "small muted" }, text));
  page.append(h("section", { class: "games" },
    card("Steer by pitch", "Fly a bird through gates by playing their notes.", () => open("Steer by pitch", withShare("steer", done => pitchSteer({ onEnd: done })))),
    card("Balloon", "Hold the note in tune to blow up the balloon. Pop as many as you can.", () => open("Balloon", withShare("balloon", done => balloon({ onEnd: done })))),
    card("Falling notes", "A song's notes fall in time: play each as it lands.", async () => {
      const reached = lessonReached(), songs = (await songsP).map(s => ({ title: s.id + " " + s.title, notation: s.notation, bpm: s.bpm, ready: s.lesson <= reached }));
      open("Falling notes", () => fallingNotes({ songs: songs.filter(s => s.ready).concat(songs.filter(s => !s.ready)) }));
    }),
    card("Jam with the band", "Tanpura and tabla in a raga: improvise, and the app keeps you in the raga.", async () => { const ragas = await ragasP; open("Jam with the band", () => jam({ ragas })); }),
    card("Make a melody", "Build a tune from a raga's notes, play it, and challenge a friend.", () => { location.hash = "#/compose"; }),
    card("5-minute practice", "Short on time? A long tone, a game and a song.", () => { location.hash = "#/quick"; })), stage);

  // Collection.
  const coll = h("section", { class: "card" }, h("h2", null, "Your collection"), h("p", { class: "small muted" }, "Songs and ragas unlock as the course reaches them. A song is mastered when you mark it \"I can play it\" or get 2 stars on it."));
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
