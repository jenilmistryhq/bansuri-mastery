// Skills (#/skills): "For you" first, then one section per ability (#/skills/tone ...). Each ability
// shows the learner's latest measure, the tools that train it, its games and the fixes for when it is
// not working. Nothing new happens here: every row opens a screen that already exists.
import { h } from "../util.js";
import { getSettings } from "../core/settings.js";
import { questState } from "../fun.js";
import { SKILLS, GAME_INFO, FIX_INFO, MUSIC_GAMES, skillById, gameBest } from "../skillmap.js";

// Which game moves which quest on (the same choice the games list makes).
const FOR_QUEST = { phrase: "phrase", laya: "laya", tihai: "tihai", ornament: "meendbridge", swell: "swell", boat: "boat", bullseye: "bullseye", wrong: "wrong", sam: "sam", road: "road", hold: "boat", steer: "steer", balloon: "balloon", falling: "falling", jam: "jam", song: "falling", echo: "steer", tap: "jam" };

// A game opened from here: Close in the game goes back to this screen (views/play.js reads it).
export const GAME_FROM = "bansuri.game.from";
const markFrom = () => { try { sessionStorage.setItem(GAME_FROM, location.hash); } catch (e) { /* Close then goes to the hub */ } };
// The Flute dock opens on a tab (main.js listens): the tuner, the fingering chart, drone and taal.
export const openDock = tab => document.dispatchEvent(new CustomEvent("bansuri:dock", { detail: { tab } }));

const row = (href, title, sub, aside) => h("a", { class: "hubrow", href }, h("span", { class: "stack" }, h("b", null, title), sub ? h("span", { class: "small muted" }, sub) : null), aside ? h("span", { class: "small muted" }, aside) : null, h("span", { class: "chev", "aria-hidden": "true" }, ">"));
const dockRow = (tab, title, sub) => h("button", { type: "button", class: "hubrow", onclick: () => openDock(tab) }, h("span", { class: "stack" }, h("b", null, title), sub ? h("span", { class: "small muted" }, sub) : null), h("span", { class: "small muted" }, "Flute tools"), h("span", { class: "chev", "aria-hidden": "true" }, ">"));
const group = (title, items) => items.length ? h("section", { class: "card hubgroup" }, h("h2", { class: "grouphead" }, title), h("div", { class: "hublist" }, items)) : document.createDocumentFragment(); // an empty part is left out
const gameHref = k => "#/skills/game/" + k;
// A game's row: "best N" from its stored results, or "new" when it has never been played.
const bestAside = k => { const b = gameBest(k); return b === null ? "new" : b > 0 ? "best {n}".replace("{n}", b) : null; };
const gameRow = (k, sub) => { const a = row(gameHref(k), GAME_INFO[k][0], sub === undefined ? GAME_INFO[k][1] : sub, MUSIC_GAMES.includes(k) ? null : bestAside(k)); a.addEventListener("click", markFrom); return a; };

function forYou(focus) {
  const page = h("div", { class: "page" });
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Skills"), h("h1", null, "Get better at one thing"),
    h("p", { class: "muted" }, "Pick a skill: its tools, its games and the fixes for when it is not working, together.")));
  if (!focus) {
    const qs = questState(), left = qs.list.filter(q => !q.done && FOR_QUEST[q.id]);
    const key = left.length ? FOR_QUEST[left[0].id] : "balloon";
    const play = h("a", { class: "btn primary big", href: gameHref(key) }, "Play " + GAME_INFO[key][0]);
    play.addEventListener("click", markFrom);
    page.append(h("section", { class: "card playnow" },
      h("span", { class: "small muted" }, left.length ? "For today's quest: " + left[0].text : "A good one to play now"),
      h("h2", null, GAME_INFO[key][0]), h("p", { class: "small muted" }, GAME_INFO[key][1]), play));
  }
  page.append(h("section", { class: "card row between fixcta" }, h("span", null, "Something wrong with the sound?"), h("a", { class: "btn", href: "#/skills/fix" }, "Fix a problem")));
  page.append(h("h2", { class: "grouphead" }, "Your skills"), h("div", { class: "skillgrid" }, SKILLS.map(s => {
    const m = s.latest();
    return h("a", { class: "skillcard", href: "#/skills/" + s.id }, h("b", null, s.title), h("span", { class: "small muted" }, m ? m.text : "Not measured yet"));
  })));
  const links = [];
  if (!focus) links.push(row("#/skills/games", "All 24 games", "Grouped by the skill they train"));
  links.push(row("#/quick", "Short on time? 5 minutes", "A long tone, a game and a song"));
  page.append(h("div", { class: "hublist" }, links));
  return page;
}

// "Your latest": the measure, the last few results with the best marked, and any other measures.
function latest(m) {
  const box = h("section", { class: "card hublatest" }, h("h2", { class: "grouphead" }, "Your latest"));
  if (!m) { box.append(h("p", { class: "small muted" }, "Not measured yet. Use a tool below and your result appears here.")); return box; }
  box.append(h("p", null, h("span", { class: "small muted" }, h("span", null, m.label), ": "), h("b", null, m.value || m.text)));
  if (m.history && m.history.length > 1) {
    box.append(h("p", { class: "hubhist", "aria-label": "Your last results, oldest first" }, m.history.map(x =>
      h("span", { class: x.best ? "hubbest" : null }, h("span", null, m.unit.replace("{n}", x.v)), x.best ? h("span", { class: "small" }, " (best)") : null))));
  }
  for (const [label, text] of m.more || []) box.append(h("p", { class: "small" }, h("span", { class: "muted" }, h("span", null, label), ": "), h("b", null, text)));
  if (m.chips) box.append(h("div", { class: "chips" }, m.chips.map(([name, on]) => h("span", { class: "chip " + (on ? "good" : "mutedc") }, on ? name + " (passed)" : name))));
  return box;
}

function hub(s, focus) {
  const page = h("div", { class: "page" });
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Skills"), h("h1", null, s.title)));
  page.append(latest(s.latest()));
  // Train it: the hub's main tool as its one primary button, the others as rows under it.
  const [first, ...rest] = s.train;
  const main = /^dock:/.test(first[1]) ? h("button", { type: "button", class: "btn primary big hubmain", onclick: () => openDock(first[1].slice(5)) }, first[0])
    : h("a", { class: "btn primary big hubmain", href: first[1] }, first[0]);
  page.append(h("section", { class: "card hubgroup" }, h("h2", { class: "grouphead" }, "Train it"), main, h("p", { class: "small muted hubmainsub" }, first[2]),
    rest.length ? h("div", { class: "hublist" }, rest.map(([t, href, sub]) => (/^dock:/.test(href) ? dockRow(href.slice(5), t, sub) : row(href, t, sub)))) : null));
  if (!focus) {
    page.append(group("Games", s.games.map(k => gameRow(k))));
    if (s.also.length) page.append(group("Also good for this", s.also.map(k => gameRow(k, MUSIC_GAMES.includes(k) ? "In Music" : (SKILLS.find(x => x.games.includes(k)) || {}).title))));
  }
  page.append(group("If it isn't working", s.fixes.map(ts => row("#/skills/fix/" + ts + "/" + s.id, FIX_INFO[ts], null, ts))));
  page.append(group("Learn more", s.more.map(([t, href]) => row(href, t))));
  return page;
}

export async function render(main, { params }) {
  const focus = getSettings().focus;
  const s = params && params[0] ? skillById(params[0]) : null;
  main.append(s ? hub(s, focus) : forYou(focus));
}
