// Music > Ragas (#/music/ragas): the raga cards in the course's learning order, each with its status
// worked out from the learner's progress ("open", or "after Lnn" while its lesson is still ahead).
// A raga (#/music/raga/<id>, redesign U6): About (aroh, avroh, pakad, Hear the scale, the card's own
// text) and Play (Jam with the band, Raga phrases, play back phrases in its notes, and where it comes
// in the course). The words are the course's raga cards (bansuri-mastery/ragas/).
import { h, pad2 } from "../util.js";
import { fetchDoc, renderMarkdown } from "../content.js";
import { getPlan } from "../course.js";
import { codeOf } from "../core/theory.js";
import { tanpura } from "../core/audio.js";
import { echoGame } from "../core/live.js";
import { flutePlayer } from "../demo.js";
import { lessonReached } from "./songs.js";
import { ragaInfo } from "./reader.js";
import { backHead } from "../backhead.js";
import { GAME_FROM } from "./skills.js";

export function parseRagaIndex(md) {
  return [...md.matchAll(/^\|\s*(\d+)\s*\|\s*\[([^\]]+)\]\(([a-z-]+\.md)\)\s*\|\s*([^|]*)\|\s*([^|]*)\|[^|]*\|[^|]*\|\s*([^|]*)\|/gm)]
    .map(m => ({ n: Number(m[1]), name: m[2], file: m[3], thaat: m[4].trim(), notes: m[5].trim(), when: m[6].replace(/\(\[[^\]]*\]\([^)]*\)\)/g, "").trim(), lesson: Number((/\[L(\d\d)\]/.exec(m[6]) || [])[1]) || 0 }));
}

const lessonsOf = d => Math.max(0, ...((d && d.lessons) || []).map(id => Number(String(id).replace(/\D/g, "")) || 0));

// Each raga with where it comes in the course: the first day that names it (its "In the course" day),
// the lesson that opens it (the card's own lesson link, else that day's newest lesson, else the
// first day of its phase), and whether the learner has reached that lesson.
export async function ragaList() {
  const rows = parseRagaIndex(await fetchDoc("ragas/README.md"));
  const plan = getPlan(), reached = lessonReached();
  return rows.map(r => {
    const re = new RegExp("\\b" + r.name + "\\b");
    const day = plan ? plan.days.find(d => re.test(d.title || "")) : null;
    let lesson = r.lesson || lessonsOf(day);
    if (!lesson && plan) {
      const ph = plan.phases.find(p => p.id === Number((/Phase (\d)/.exec(r.when) || [])[1]));
      if (ph) lesson = lessonsOf(plan.days[ph.firstDay]);
    }
    return Object.assign({}, r, { id: r.file.replace(/\.md$/, ""), day: day ? day.n : null, lesson, open: !lesson || reached >= lesson });
  });
}
export const ragaStatus = r => (r.open ? "open" : "after L" + pad2(r.lesson));

async function list(main) {
  const page = h("div", { class: "page" }, h("h1", { class: "sr-only" }, "Ragas"));
  const box = h("div", { class: "hublist" }, h("p", { class: "small muted" }, "Loading..."));
  page.append(h("section", { class: "card hubgroup" }, box));
  main.append(page);
  try {
    const rows = await ragaList();
    box.replaceChildren(...rows.map(r => h("a", { class: "hubrow ragarow", href: "#/music/raga/" + r.id },
      h("span", { class: "stack" }, h("b", null, r.name), h("span", { class: "small muted mono", translate: "no" }, r.notes)),
      h("span", { class: "chip " + (r.open ? "good" : "mutedc") }, ragaStatus(r)), h("span", { class: "chev", "aria-hidden": "true" }, ">"))));
  } catch (e) {
    box.replaceChildren(h("p", { class: "small muted" }, "The raga cards could not be loaded."));
  }
}

// One row of the card's table ("| Aroh | `S R G` |"), as its notation.
const cardRow = (md, label) => {
  const m = new RegExp("^\\|\\s*" + label + "[^|]*\\|\\s*(.+?)\\s*\\|\\s*$", "m").exec(md);
  const codes = m ? [...m[1].matchAll(/`([^`]+)`/g)].map(x => x[1]) : [];
  return codes.join(", ");
};

async function raga(main, id) {
  const all = await ragaList().catch(() => []);
  const r = all.find(x => x.id === id);
  if (!r) { location.replace("#/music/ragas"); return; }
  const path = "ragas/" + r.file, md = await fetchDoc(path);
  const title = ((/^# (.+)$/m.exec(md) || [])[1] || "Raga " + r.name).trim();
  const cleanups = [];
  let player = null, echo = null, droneMine = false;
  cleanups.push(() => { if (player) player.destroy(); if (echo) echo.destroy(); if (droneMine) tanpura.stop(); });

  // About: the scale, Hear the scale (on the flute picture), and the card's own text.
  const info = ragaInfo(md);
  const stage = h("div", { class: "ragastage", hidden: true });
  const hearBtn = h("button", { type: "button", class: "btn" }, "Hear the scale");
  hearBtn.addEventListener("click", () => {
    if (player) { player.destroy(); player = null; stage.hidden = true; stage.replaceChildren(); return; }
    const up = [...new Set(info.notes)].sort((a, b) => a - b).filter(n => n >= 0 && n <= 12);
    if (!up.includes(12)) up.push(12);
    player = flutePlayer({ notation: up.concat(up.slice(0, -1).reverse()).map(codeOf).join(" ") + " -", bpm: 60, title });
    stage.replaceChildren(player.el); stage.hidden = false; player.play();
  });
  const scale = h("dl", { class: "ragascale" }, [["Aroh", "Aroh"], ["Avroh", "Avroh"], ["Pakad", "Pakad"]].map(([label, key]) => {
    const v = cardRow(md, key);
    return v ? [h("dt", null, label), h("dd", { class: "mono", translate: "no" }, v)] : [];
  }).flat());
  const text = renderMarkdown(md.replace(/^# .*\n+(\[.*\n+)?/, ""), path).node;
  text.classList.add("reader");
  const about = h("div", { class: "stack" }, h("section", { class: "card" }, scale, h("div", { class: "row" }, hearBtn), stage), h("section", { class: "card" }, text),
    h("a", { class: "small", href: "#/read/" + path }, "Open the full card in the course book"));

  // Play: the two games for a raga, call and response in its notes, and its days in the course.
  const markFrom = () => { try { sessionStorage.setItem(GAME_FROM, location.hash); } catch (e) { /* Close goes to the games */ } };
  const jamLink = h("a", { class: "btn primary big", href: "#/skills/game/jam/" + r.id }, "Jam with the band");
  jamLink.addEventListener("click", markFrom);
  const phraseRow = h("a", { class: "hubrow", href: "#/skills/game/phrase" }, h("span", { class: "stack" }, h("b", null, "Raga phrases"), h("span", { class: "small muted" }, "Ornaments inside a raga's own phrases: Bhairav's andolan, Bhimpalasi's meend and kan, and more.")), h("span", { class: "chev", "aria-hidden": "true" }, ">"));
  phraseRow.addEventListener("click", markFrom);
  const echoHost = h("div", { class: "toolhost", hidden: true });
  const echoBtn = h("button", { type: "button", class: "btn" }, "Play back phrases in this raga");
  echoBtn.addEventListener("click", () => {
    if (echo) { echo.destroy(); echo = null; echoHost.hidden = true; echoBtn.textContent = "Play back phrases in this raga"; return; }
    echo = echoGame({ notes: info.notes, notesLabel: title + " notes", levelId: "raga:" + r.id });
    echoHost.replaceChildren(echo.el); echoHost.hidden = false; echoBtn.textContent = "Close";
  });
  const droneBtn = h("button", { type: "button", class: "btn", "aria-pressed": "false" }, "Drone for this raga");
  droneBtn.addEventListener("click", () => {
    if (droneMine) { tanpura.stop(); droneMine = false; droneBtn.setAttribute("aria-pressed", "false"); droneBtn.textContent = "Drone for this raga"; return; }
    tanpura.setFirst(info.first); if (!tanpura.isOn()) tanpura.start();
    droneMine = true; droneBtn.setAttribute("aria-pressed", "true"); droneBtn.textContent = "Stop the drone";
  });
  const play = h("div", { class: "stack" },
    h("section", { class: "card hubgroup" }, h("h2", { class: "grouphead" }, "Play it"), jamLink,
      h("div", { class: "hublist" }, phraseRow,
        r.day !== null ? h("a", { class: "hubrow", href: "#/day/" + r.day }, h("span", { class: "stack" }, h("b", null, "In the course: Day {n}".replace("{n}", r.day))), h("span", { class: "chip " + (r.open ? "good" : "mutedc") }, ragaStatus(r)), h("span", { class: "chev", "aria-hidden": "true" }, ">")) : null)),
    info.notes.length >= 4 ? h("section", { class: "card" }, h("div", { class: "row" }, echoBtn, droneBtn), echoHost) : null);

  // The two views, as a switch at the top.
  const views = { about, play };
  const sw = h("div", { class: "seg toolswitch", role: "group", "aria-label": "View" });
  const body = h("div");
  const show = k => { sw.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === k))); body.replaceChildren(views[k]); };
  for (const [k, label] of [["about", "About the raga"], ["play", "Play it"]]) sw.append(h("button", { type: "button", dataset: { v: k }, "aria-pressed": "false", onclick: () => show(k) }, label));
  main.append(h("div", { class: "page ragapage", dataset: { noswipe: "1" } }, backHead("#/music/ragas", "Ragas", title, h("span", { class: "chip " + (r.open ? "good" : "mutedc") }, ragaStatus(r))), sw, body));
  show("about");
  return () => cleanups.forEach(f => f());
}

export async function render(main, { params, view }) {
  if (view === "raga") return raga(main, params[0]);
  return list(main);
}
