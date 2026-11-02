// Skills (#/skills): "For you" first, then one section per ability (#/skills/tone ...). Each ability
// shows the learner's latest measure, the tools that train it, its games and the fixes for when it is
// not working. Nothing new happens here: every row opens a screen that already exists.
import { h } from "../util.js";
import { getSettings } from "../core/settings.js";
import { questState } from "../fun.js";
import { SKILLS, GAME_INFO, FIX_INFO, MUSIC_GAMES, skillById } from "../skillmap.js";

// Which game moves which quest on (the same choice the games list makes).
const FOR_QUEST = { phrase: "phrase", laya: "laya", tihai: "tihai", ornament: "meendbridge", swell: "swell", boat: "boat", bullseye: "bullseye", wrong: "wrong", sam: "sam", road: "road", hold: "boat", steer: "steer", balloon: "balloon", falling: "falling", jam: "jam", song: "falling", echo: "steer", tap: "jam" };

const row = (href, title, sub, aside) => h("a", { class: "hubrow", href }, h("span", { class: "stack" }, h("b", null, title), sub ? h("span", { class: "small muted" }, sub) : null), aside ? h("span", { class: "small muted" }, aside) : null, h("span", { class: "chev", "aria-hidden": "true" }, ">"));
const group = (title, items) => items.length ? h("section", { class: "card hubgroup" }, h("h2", { class: "grouphead" }, title), h("div", { class: "hublist" }, items)) : null;
const gameRow = k => row("#/play/" + k, GAME_INFO[k][0], GAME_INFO[k][1]);

function forYou(focus) {
  const page = h("div", { class: "page" });
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Skills"), h("h1", null, "Get better at one thing"),
    h("p", { class: "muted" }, "Pick a skill: its tools, its games and the fixes for when it is not working, together.")));
  if (!focus) {
    const qs = questState(), left = qs.list.filter(q => !q.done && FOR_QUEST[q.id]);
    const key = left.length ? FOR_QUEST[left[0].id] : "balloon";
    page.append(h("section", { class: "card playnow" },
      h("span", { class: "small muted" }, left.length ? "For today's quest: " + left[0].text : "A good one to play now"),
      h("h2", null, GAME_INFO[key][0]), h("p", { class: "small muted" }, GAME_INFO[key][1]),
      h("a", { class: "btn primary big", href: "#/play/" + key }, "Play " + GAME_INFO[key][0])));
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

function hub(s, focus) {
  const page = h("div", { class: "page" });
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Skills"), h("h1", null, s.title)));
  const m = s.latest();
  page.append(h("section", { class: "card hublatest" }, h("h2", { class: "grouphead" }, "Your latest"),
    m ? h("p", null, h("span", { class: "small muted" }, m.label + ": "), h("b", null, m.text)) : h("p", { class: "small muted" }, "Not measured yet. Use a tool below and your result appears here.")));
  page.append(group("Train it", s.train.map(([t, href, sub]) => row(href, t, sub))));
  if (!focus) {
    page.append(group("Games", s.games.map(gameRow)));
    if (s.also.length) page.append(group("Also good for this", s.also.map(k => row("#/play/" + k, GAME_INFO[k][0], MUSIC_GAMES.includes(k) ? "In Music" : (SKILLS.find(x => x.games.includes(k)) || {}).title))));
  }
  page.append(group("If it isn't working", s.fixes.map(ts => row("#/skills/fix/" + ts, FIX_INFO[ts], null, ts))));
  page.append(group("Learn more", s.more.map(([t, href]) => row(href, t))));
  return page;
}

export async function render(main, { params }) {
  const focus = getSettings().focus;
  const s = params && params[0] ? skillById(params[0]) : null;
  main.append(s ? hub(s, focus) : forYou(focus));
}
