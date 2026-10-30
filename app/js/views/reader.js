// Reader (#/read/<path>): renders a curriculum Markdown file inside the app.
import { h, store, storeSet } from "../util.js";
import { fetchDoc, renderMarkdown, filesList } from "../content.js";
import { makePlayable, stopPlayable } from "../playable.js";
import { lessonCards, cardDeck } from "../lessoncards.js";
import { loadGlossary, glossify } from "../glossary.js";
import { parseNotation } from "../core/notation.js";
import { tanpura } from "../core/audio.js";
import { echoGame, ragaQuiz } from "../core/live.js";

// Phrases from a raga card for "Name that raga": the aroh, the avroh and each pakad phrase
// (pakad phrases are separated by commas).
export function ragaPhrases(md) {
  const name = ((/^# (?:Raga )?(.+)$/m.exec(md) || [])[1] || "").trim();
  const row = label => { const m = new RegExp("^\\|\\s*" + label + "[^|]*\\|\\s*(.+?)\\s*\\|\\s*$", "m").exec(md); return m ? m[1] : ""; };
  const phrases = [];
  const add = text => {
    const notes = [];
    for (const tk of parseNotation(text).tokens) if (tk.type === "beat") for (const it of tk.items) if (it.semi !== undefined) notes.push(it.semi);
    if (notes.length >= 4) phrases.push(notes);
  };
  for (const label of ["Aroh", "Avroh"]) { const c = /`([^`]+)`/.exec(row(label)); if (c) add(c[1]); }
  const pk = /`([^`]+)`/.exec(row("Pakad"));
  if (pk) { add(pk[1].replace(/,/g, " ")); pk[1].split(",").forEach(add); }
  const notes = row("Notes").split("(")[0].trim();
  return { name, phrases, hint: notes ? "Its notes: " + notes + "." : "" };
}

// The notes of a raga card (from its Aroh, Avroh and Notes rows) and the tanpura's first string:
// Pa, or Ma when the raga omits Pa, or Ni when it omits both.
export function ragaInfo(md) {
  const row = name => { const m = new RegExp("^\\|\\s*" + name + "\\s*\\|\\s*(.+?)\\s*\\|\\s*$", "m").exec(md); return m ? m[1] : ""; };
  const notes = [];
  for (const cell of [row("Aroh"), row("Avroh")]) {
    const code = /`([^`]+)`/.exec(cell);
    if (!code) continue;
    const p = parseNotation(code[1]);
    for (const tk of p.tokens) if (tk.type === "beat") for (const it of tk.items) if (it.semi !== undefined && !notes.includes(it.semi)) notes.push(it.semi);
  }
  notes.sort((a, b) => a - b);
  const letters = (row("Notes").split("(")[0].match(/\b[SrRgGmMPdDnN]\b/g) || []);
  const has = l => letters.includes(l) || notes.some(s => ((s % 12) + 12) % 12 === { P: 7, m: 5, M: 6 }[l]);
  const first = has("P") ? "pa" : (has("m") || has("M")) ? "ma" : "ni";
  return { notes, first };
}

const GROUP_LABEL = { lessons: "Lessons", phases: "Roadmap", exercises: "Exercises", ragas: "Ragas", projects: "Milestones", troubleshooting: "Troubleshooting", "knowledge-tree": "Knowledge tree", tools: "Practice Bench" };

export async function render(main, { params }) {
  const path = params[0].replace(/^\/+/, "");
  const page = h("div", { class: "page" });
  main.append(page);
  if (!/^[A-Za-z0-9._\/-]+\.md$/.test(path) || path.includes("..")) {
    page.append(h("div", { class: "card" }, h("h2", null, "Page not found"), h("p", null, "That address does not point to a course page."), h("a", { href: "#/library" }, "Open the library")));
    return;
  }
  let md;
  try { md = await fetchDoc(path); }
  catch (e) { page.append(h("div", { class: "card" }, h("h2", null, "Could not open this page"), h("p", null, String(e.message)), h("a", { href: "#/library" }, "Open the library"))); return; }

  const { node, title } = renderMarkdown(md, path);
  const cleanups = [];
  document.title = title + " - Bansuri Mastery";
  const folder = path.includes("/") ? path.split("/")[0] : "";
  const crumbs = h("nav", { class: "crumbs", "aria-label": "Breadcrumbs" }, h("a", { href: "#/library" }, "Library"), folder ? [" / ", h("span", null, GROUP_LABEL[folder] || folder)] : null);
  node.classList.add("reader");
  const full = h("article", { class: "card" }, node);
  page.append(crumbs);
  // Lessons open as cards (one idea at a time); the full text is one tap away.
  const cards = /^lessons\/L\d\d/.test(path) ? lessonCards(node, path) : [];
  if (cards.length >= 3) {
    let mode = store("bansuri.readerMode", "cards");
    const cardsBtn = h("button", { type: "button", class: "seg-btn" }, "Cards");
    const fullBtn = h("button", { type: "button", class: "seg-btn" }, "Full lesson");
    cards.forEach(c => { if (c.cleanup) cleanups.push(c.cleanup); });
    const deck = cardDeck(cards, path, { doneLabel: "Done", onDone: () => { location.hash = "#/today"; } });
    const show = m => {
      mode = m; storeSet("bansuri.readerMode", m);
      deck.hidden = m !== "cards"; full.hidden = m === "cards";
      cardsBtn.setAttribute("aria-pressed", String(m === "cards")); fullBtn.setAttribute("aria-pressed", String(m !== "cards"));
    };
    cardsBtn.addEventListener("click", () => show("cards"));
    fullBtn.addEventListener("click", () => show("full"));
    page.append(h("div", { class: "row between" }, h("h1", { class: "lesson-title" }, title), h("div", { class: "seg", role: "group", "aria-label": "View" }, cardsBtn, fullBtn)), deck, full);
    // A link to a section of the lesson opens the full text at that section.
    const anchored = location.hash.split("#").length > 2;
    show(anchored || mode === "full" ? "full" : "cards");
  } else page.append(full);
  // The raga index: a "Name that raga" ear game built from every raga card.
  if (path === "ragas/README.md") {
    const files = [...new Set([...md.matchAll(/\]\(([a-z-]+\.md)\)/g)].map(m => m[1]))];
    const host = h("div", { class: "toolhost", hidden: true });
    const btn = h("button", { type: "button", class: "btn primary" }, "Play Name that raga");
    let quiz = null;
    btn.addEventListener("click", async () => {
      if (quiz) { quiz.destroy(); quiz = null; host.hidden = true; btn.textContent = "Play Name that raga"; return; }
      btn.disabled = true;
      const ragas = (await Promise.all(files.map(f => fetchDoc("ragas/" + f).then(ragaPhrases).catch(() => null)))).filter(r => r && r.phrases.length);
      btn.disabled = false;
      quiz = ragaQuiz({ ragas });
      host.replaceChildren(quiz.el); host.hidden = false; btn.textContent = "Close the game";
    });
    page.insertBefore(h("section", { class: "card" }, h("h2", null, "Name that raga"),
      h("p", { class: "small muted" }, "A phrase from one of these ragas plays over the drone; name the raga. Listen for the missing notes and the notes the phrase leans on (EAR-12)."),
      h("div", { class: "row" }, btn), host), page.children[1] || null);
    cleanups.push(() => { if (quiz) quiz.destroy(); });
  }

  // Raga cards: a drone tuned for the raga and call-and-response in its notes.
  if (/^ragas\/(?!README)[a-z-]+\.md$/.test(path)) {
    const info = ragaInfo(md);
    if (info.notes.length >= 4) {
      const droneBtn = h("button", { type: "button", class: "btn", "aria-pressed": "false" }, "Drone for this raga");
      let mine = false;
      droneBtn.addEventListener("click", () => {
        if (mine) { tanpura.stop(); mine = false; droneBtn.setAttribute("aria-pressed", "false"); droneBtn.textContent = "Drone for this raga"; return; }
        tanpura.setFirst(info.first); if (!tanpura.isOn()) tanpura.start();
        mine = true; droneBtn.setAttribute("aria-pressed", "true"); droneBtn.textContent = "Stop the drone";
      });
      const echoHost = h("div", { class: "toolhost", hidden: true });
      let echo = null;
      const echoBtn = h("button", { type: "button", class: "btn primary" }, "Play back phrases in this raga");
      echoBtn.addEventListener("click", () => {
        if (echo) { echo.destroy(); echo = null; echoHost.hidden = true; echoBtn.textContent = "Play back phrases in this raga"; return; }
        echo = echoGame({ notes: info.notes, notesLabel: title + " notes", levelId: "raga:" + path.replace(/^ragas\//, "").replace(/\.md$/, "") });
        echoHost.replaceChildren(echo.el); echoHost.hidden = false; echoBtn.textContent = "Close";
      });
      page.insertBefore(h("section", { class: "card" }, h("h2", null, "Practise this raga"),
        h("p", { class: "small muted" }, "The drone's first string is " + { pa: "Pa", ma: "Ma (this raga leaves out Pa)", ni: "Ni" }[info.first] + ". Play-back phrases use only the raga's notes; its phrases and movement still need the lesson and a teacher's ear."),
        h("div", { class: "row" }, echoBtn, droneBtn), echoHost), page.children[1] || null);
      cleanups.push(() => { if (mine) tanpura.stop(); if (echo) echo.destroy(); });
    }
  }
  makePlayable(node);
  // Glossary terms become tap-to-define, in the full text and in each card (not in the glossary itself).
  if (path !== "06-GLOSSARY.md") {
    loadGlossary().then(entries => {
      if (!entries.length) return;
      glossify(node, entries);
      // In place, card by card (each card defines its terms once), so the card on screen updates too.
      for (const c of cards) { const seen = new Set(); c.body.forEach(n => { if (n && n.nodeType === 1) glossify(n, entries, { seen }); }); }
    });
  }

  // Previous / next within the same folder.
  try {
    const files = await filesList();
    const same = files.docs.filter(d => (d.path.includes("/") ? d.path.split("/")[0] : "") === folder && !/README\.md$/.test(d.path));
    const i = same.findIndex(d => d.path === path);
    if (i >= 0) {
      page.append(h("nav", { class: "pager" },
        i > 0 ? h("a", { class: "btn ghost", href: "#/read/" + same[i - 1].path }, "Previous: " + same[i - 1].title) : h("span"),
        i < same.length - 1 ? h("a", { class: "btn ghost", href: "#/read/" + same[i + 1].path }, "Next: " + same[i + 1].title) : h("span")));
    }
  } catch (e) { /* the pager is optional */ }
  return () => { stopPlayable(); cleanups.forEach(f => f()); document.title = "Bansuri Mastery"; };
}
