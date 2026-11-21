// Labs (#/skills): "For you" first, then one section per ability (#/skills/tone ...). Each ability
// shows the learner's latest measure, the tools that train it, its games and the fixes for when it is
// not working. Nothing new happens here: every row opens a screen that already exists.
import { h, icon } from "../util.js";
import { getSettings } from "../core/settings.js";
import { questState } from "../fun.js";
import { SKILLS, GAME_INFO, FIX_INFO, skillById, gameBest, questGame } from "../skillmap.js";

// A game opened from here: Close in the game goes back to this screen (views/play.js reads it).
export const GAME_FROM = "bansuri.game.from";
const markFrom = () => { try { sessionStorage.setItem(GAME_FROM, location.hash); } catch (e) { /* Close then goes to the hub */ } };
// The Flute dock opens on a tab (main.js listens): the tuner, the fingering chart, drone and taal.
export const openDock = tab => document.dispatchEvent(new CustomEvent("bansuri:dock", { detail: { tab } }));

const SKILL_ICON = { tone: "wave", notes: "note", rhythm: "today", ornaments: "bench", ear: "ear" };

const row = (href, title, sub, aside, ic) => h("a", { class: "hubrow", href }, ic ? icon(ic) : null, h("span", { class: "stack" }, h("b", null, title), sub ? h("span", { class: "small muted" }, sub) : null), aside ? h("span", { class: "small muted" }, aside) : null, h("span", { class: "chev", "aria-hidden": "true" }, ">"));
const dockRow = (tab, title, sub) => h("button", { type: "button", class: "hubrow", onclick: () => openDock(tab) }, h("span", { class: "stack" }, h("b", null, title), sub ? h("span", { class: "small muted" }, sub) : null), h("span", { class: "small muted" }, "Flute tools"), h("span", { class: "chev", "aria-hidden": "true" }, ">"));
const group = (title, items) => items.length ? h("section", { class: "card hubgroup" }, h("h2", { class: "grouphead" }, title), h("div", { class: "hublist" }, items)) : document.createDocumentFragment();
const gameHref = k => "#/skills/game/" + k;

function skillCard(s) {
  const m = s.latest();
  const hasData = m && m.text;
  const games = s.games.length;
  const played = s.games.filter(k => gameBest(k) !== null).length;
  const pct = games ? Math.round(played / games * 100) : 0;
  return h("a", { class: "skillcard", href: "#/skills/" + s.id, dataset: { skill: s.id } },
    h("span", { class: "skillcard-icon" }, icon(SKILL_ICON[s.id] || "star")),
    h("b", null, s.title),
    h("span", { class: "skillcard-measure" }, hasData ? h("b", null, m.text) : s.games.length + " games, " + s.train.length + " tools"),
    h("span", { class: "skillcard-bar" }, h("i", { style: { width: pct + "%" } })));
}

function forYou(focus) {
  const page = h("div", { class: "page" });
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Skills"), h("h1", null, "Get better at one thing"),
    h("p", { class: "muted" }, "Pick a skill: its tools, its games and your progress, together.")));
  if (!focus) {
    const { key, quest } = questGame(questState().list);
    const play = h("a", { class: "btn primary big", href: gameHref(key) }, "Play " + GAME_INFO[key][0]);
    play.addEventListener("click", markFrom);
    page.append(h("section", { class: "card playnow" },
      h("span", { class: "small muted quest-eyebrow" }, icon("flame"), quest ? "For today's quest: " + quest.text : "A good one to play now"),
      h("h2", null, GAME_INFO[key][0]), h("p", { class: "small muted" }, GAME_INFO[key][1]), play));
  }
  page.append(h("h2", { class: "grouphead" }, "Your skills"), h("div", { class: "skillgrid" }, SKILLS.map(s => skillCard(s))));
  const links = [];
  if (!focus) links.push(row("#/skills/games", "All 24 games", "Grouped by the skill they train", null, "star"));
  links.push(row("#/quick", "Short on time? 5 minutes", "A long tone, a game and a song", null, "today"));
  page.append(h("div", { class: "skills-bottom" }, links));
  return page;
}

// "Your latest": the measure, the last few results with the best marked, and any other measures.
function latest(m) {
  const box = h("section", { class: "card hublatest" }, h("h2", { class: "grouphead" }, "Your latest"));
  if (!m) {
    box.append(h("div", { class: "hublatest-empty" },
      icon("star"),
      h("p", { class: "small muted" }, "Not measured yet. Use a tool below and your result appears here.")));
    return box;
  }
  if (m.label) {
    box.append(h("div", { class: "hublatest-stat" },
      h("span", { class: "hublatest-value" }, m.value || m.text),
      h("span", { class: "small muted" }, m.label)));
  }
  if (m.history && m.history.length > 1) {
    box.append(h("div", { class: "hubhist", "aria-label": "Your last results, oldest first" }, m.history.map(x =>
      h("span", { class: "hubhist-dot " + (x.best ? "hubbest" : "") },
        h("span", { class: "hubhist-val" }, m.unit.replace("{n}", x.v)),
        x.best ? h("span", { class: "hubhist-label" }, "best") : null))));
  }
  for (const [label, text] of m.more || []) box.append(h("p", { class: "small hublatest-extra" }, h("span", { class: "muted" }, label + ": "), h("b", null, text)));
  if (m.chips) box.append(h("div", { class: "chips hubchips" }, m.chips.map(([name, on]) => h("span", { class: "chip " + (on ? "good" : "mutedc") }, on ? icon("check") : null, h("span", null, name), on ? h("span", { class: "sr-only" }, "(passed)") : null))));
  return box;
}

// The shape of each ornament, drawn small on its tile (W44): a glide, a flick, a turn, a swing.
const GLYPH = {
  meend: "M4 22 C 16 22, 22 6, 40 6", kan: "M4 20 L12 20 L15 5 L18 20 L40 20",
  murki: "M4 16 L10 7 L16 22 L22 7 L28 16 L40 16", andolan: "M4 14 Q 10 2 16 14 T 28 14 T 40 14",
};
function glyph(k) {
  const s = h("span", { class: "orntile-glyph", "aria-hidden": "true" });
  s.innerHTML = '<svg viewBox="0 0 44 28" width="66" height="42"><path d="' + GLYPH[k] + '" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return s;
}

function gameTile(k) {
  const best = gameBest(k);
  const noMic = ["wrong", "bingo", "higherlower", "sam", "nameorn"].includes(k);
  const a = h("a", { class: "gametile", href: gameHref(k) },
    h("div", { class: "gametile-head" },
      h("b", null, GAME_INFO[k][0]),
      best !== null ? h("span", { class: "gametile-best" }, "best " + best) : h("span", { class: "gametile-new" }, "new")),
    h("span", { class: "small muted gametile-desc" }, GAME_INFO[k][1]),
    noMic ? h("span", { class: "chip mutedc gametile-chip" }, "No mic") : null);
  a.addEventListener("click", markFrom);
  return a;
}

function hub(s, focus) {
  const page = h("div", { class: "page skillhub" });
  page.dataset.skill = s.id;

  // Hero with icon and summary stats
  const played = s.games.filter(k => gameBest(k) !== null).length;
  const heroSection = h("section", { class: "hero" },
    h("a", { class: "backlink small", href: "#/skills" }, "Skills"),
    h("div", { class: "skillhub-title" },
      h("span", { class: "skillcard-icon skillhub-icon", dataset: { skill: s.id } }, icon(SKILL_ICON[s.id] || "star")),
      h("div", null,
        h("h1", null, s.title),
        h("div", { class: "skillhub-stats" },
          h("span", { class: "chip mutedc" }, s.train.length + (s.tiles ? s.tiles.length : 0) + " tools"),
          h("span", { class: "chip mutedc" }, s.games.length + " games"),
          played ? h("span", { class: "chip good" }, played + " played") : null))));
  page.append(heroSection);

  page.append(latest(s.latest()));

  // Train it: ornament tiles or tool cards
  if (s.tiles) {
    page.append(h("section", { class: "card hubgroup" }, h("h2", { class: "grouphead" }, "Train it"),
      h("div", { class: "orntiles" }, s.tiles.map(([k, name, href]) => h("a", { class: "orntile", href, dataset: { orn: k } }, h("b", null, name), glyph(k)))),
      h("div", { class: "hublist" }, row(s.judge, "What the microphone can judge"))));
  } else {
    page.append(h("section", { class: "card hubgroup" }, h("h2", { class: "grouphead" }, "Train it"),
      h("div", { class: "toolcards" }, s.train.map(([t, href, sub], i) => {
        const primary = i === 0;
        const isDock = /^dock:/.test(href);
        const el = isDock
          ? h("button", { type: "button", class: "toolcard" + (primary ? " toolcard-primary" : ""), onclick: () => openDock(href.slice(5)) },
              h("span", { class: "toolcard-icon" }, icon(primary ? "play" : "hand")),
              h("span", { class: "stack" }, h("b", null, t), h("span", { class: "small muted" }, sub)),
              isDock ? h("span", { class: "chip mutedc toolcard-chip" }, "Flute tools") : null)
          : h("a", { class: "toolcard" + (primary ? " toolcard-primary" : ""), href },
              h("span", { class: "toolcard-icon" }, icon(primary ? "play" : "hand")),
              h("span", { class: "stack" }, h("b", null, t), h("span", { class: "small muted" }, sub)),
              null);
        return el;
      }))));
  }

  // Games as a tile grid
  if (!focus && s.games.length) {
    page.append(h("section", { class: "card hubgroup" }, h("h2", { class: "grouphead" }, "Games"),
      h("div", { class: "gametiles" }, s.games.map(k => gameTile(k)))));
    if (s.also.length) {
      page.append(h("section", { class: "card hubgroup" }, h("h2", { class: "grouphead" }, "Also good for this"),
        h("div", { class: "gametiles" }, s.also.map(k => gameTile(k)))));
    }
  }

  // Fixes with icons
  if (s.fixes.length) {
    page.append(h("section", { class: "card hubgroup hubfixes" }, h("h2", { class: "grouphead" }, "If it isn't working"),
      h("div", { class: "hublist" }, s.fixes.map(ts =>
        h("a", { class: "hubrow fixrow", href: "#/teacher/fix/" + ts + "/" + s.id },
          h("span", { class: "fixrow-icon" }, icon("hand")),
          h("span", { class: "stack" }, h("b", null, FIX_INFO[ts]), h("span", { class: "small muted" }, ts)),
          h("span", { class: "chev", "aria-hidden": "true" }, ">"))))));
  }

  // Learn more
  if (s.more.length) page.append(group("Learn more", s.more.map(([t, href]) => row(href, t))));
  return page;
}

export async function render(main, { params }) {
  const focus = getSettings().focus;
  const s = params && params[0] ? skillById(params[0]) : null;
  main.append(s ? hub(s, focus) : forYou(focus));
}
