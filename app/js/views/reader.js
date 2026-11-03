// Reader (#/read/<path>): renders a curriculum Markdown file inside the app. Its tools (W40):
// the page's contents, hearing it read in the app's natural voice, and A A for its text size.
import { getSettings, setSettings } from "../core/settings.js";
import { h, store, storeSet, icon } from "../util.js";
import { fetchDoc, renderMarkdown, filesList } from "../content.js";
import { makePlayable, stopPlayable } from "../playable.js";
import { lessonCards, cardDeck } from "../lessoncards.js";
import { loadGlossary, glossify } from "../glossary.js";
import { parseNotation } from "../core/notation.js";
import { tanpura } from "../core/audio.js";
import { echoGame, ragaQuiz } from "../core/live.js";
import { award } from "../xp.js";
import { readButton, sayButton, textOf, stopSpeaking } from "../voice.js";

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
  // Cards without a pakad (Pahadi) give their typical movement instead.
  for (const m of row("Typical movement").matchAll(/`([^`]+)`/g)) add(m[1]);
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

// The reader's text sizes (A A), on top of the app's own text size.
export const READER_SIZES = [0.85, 1, 1.15, 1.3, 1.45, 1.6];

// The text a page reads aloud: headings, paragraphs, list items and table cells, each once (an
// item inside another is read with it), leaving out the tools placed in the page.
export function pageText(root) {
  const sel = "h1, h2, h3, p, li, td";
  return [...root.querySelectorAll(sel)].filter(n => !n.parentElement.closest(sel) && !n.closest(".toolhost, .origtext, .hititle"))
    .map(n => n.textContent.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
}

// Contents (W40): the page's sections in a sheet; choosing one goes to it.
function openContents(heads, go) {
  const closeBtn = h("button", { type: "button", class: "btn ghost small", "aria-label": "Close the contents" }, icon("x"));
  const dlg = h("dialog", { class: "sheet rd-toc", "aria-label": "Contents" },
    h("header", { class: "sheet-head" }, h("h2", { class: "sheet-title" }, "Contents"), closeBtn),
    h("nav", { class: "sheet-body" }, h("ol", { class: "rd-toclist", translate: "no" }, heads.map(x => h("li", { class: x.tagName === "H3" ? "sub" : "" },
      h("button", { type: "button", class: "linkbtn", onclick: () => { dlg.close(); go(x.id); } }, x.textContent.trim()))))));
  closeBtn.addEventListener("click", () => dlg.close());
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  dlg.showModal();
}

const GROUP_LABEL = { lessons: "Lessons", phases: "Roadmap", exercises: "Exercises", ragas: "Ragas", projects: "Milestones", troubleshooting: "Troubleshooting", "knowledge-tree": "Knowledge tree", tools: "Practice Bench" };

export async function render(main, { params }) {
  const path = params[0].replace(/^\/+/, "");
  const page = h("div", { class: "page readerpage" });
  main.append(page);
  if (!/^[A-Za-z0-9._\/-]+\.md$/.test(path) || path.includes("..")) {
    page.append(h("div", { class: "card" }, h("h2", null, "Page not found"), h("p", null, "That address does not point to a course page."), h("a", { href: "#/course/book" }, "Open the course book")));
    return;
  }
  let md;
  try { md = await fetchDoc(path); }
  catch (e) { page.append(h("div", { class: "card" }, h("h2", null, "Could not open this page"), h("p", null, String(e.message)), h("a", { href: "#/course/book" }, "Open the course book"))); return; }

  const { node, title } = renderMarkdown(md, path);
  const cleanups = [];
  document.title = title + " - Bansuri Mastery";
  const folder = path.includes("/") ? path.split("/")[0] : "";
  const crumbs = h("nav", { class: "crumbs", "aria-label": "Breadcrumbs" }, h("a", { href: "#/course/book" }, "Course book"), folder ? [" / ", h("span", null, GROUP_LABEL[folder] || folder)] : null);
  node.classList.add("reader");
  const full = h("article", { class: "card" }, node);
  // The tools row sits under the breadcrumbs; it is filled once the page knows its mode.
  const tools = h("div", { class: "row rd-tools" });
  page.append(crumbs, tools);
  let showFull = null;
  // Lessons open as cards (one idea at a time); the full text is one tap away.
  // In Hindi, lessons show their Hindi text (title, objectives, explanation, steps) where it exists.
  let hiLesson = null;
  // Raga cards have their prose sections in Hindi too (shown above the English card, below).
  const isRagaCard = /^ragas\/(?!README)[a-z-]+\.md$/.test(path);
  if (getSettings().lang === "hi" && (/^lessons\/L\d\d/.test(path) || isRagaCard)) {
    try { hiLesson = ((await (await fetch("app/i18n/lessons-hi.json")).json()) || {})[path] || null; } catch (e) { /* English only */ }
  }
  const cards = /^lessons\/L\d\d/.test(path) ? lessonCards(node, path, hiLesson) : [];
  if (hiLesson && hiLesson.title) { const h1 = node.querySelector("h1"); if (h1) h1.after(h("p", { class: "hititle", lang: "hi" }, hiLesson.title)); }
  if (cards.length >= 3) {
    let mode = store("bansuri.readerMode", "cards");
    const cardsBtn = h("button", { type: "button", class: "seg-btn" }, "Cards");
    const fullBtn = h("button", { type: "button", class: "seg-btn" }, "Full lesson");
    cards.forEach(c => { if (c.cleanup) cleanups.push(c.cleanup); });
    const deck = cardDeck(cards, path, { doneLabel: "Done", onDone: () => { if (!award("lesson", { key: path })) award("lessonAgain"); location.hash = "#/today"; } });
    showFull = () => show("full");
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
  if (hiLesson && isRagaCard && hiLesson.sections) {
    const HEAD = { "Character": "स्वभाव", "Notes to treat carefully": "जिन स्वरों में सावधानी चाहिए", "On your C flute": "आपकी C बाँसुरी पर", "Similar ragas": "मिलते-जुलते राग",
      "Movement and resting notes (sourced)": "चलन और न्यास के स्वर (स्रोत सहित)", "Practice steps": "अभ्यास के चरण" };
    const hiMd = Object.entries(hiLesson.sections).map(([k, v]) => "## " + (HEAD[k] || k) + "\n\n" + v).join("\n\n");
    const hiNode = renderMarkdown(hiMd, path).node;
    hiNode.classList.add("reader"); hiNode.setAttribute("lang", "hi");
    page.insertBefore(h("details", { class: "card hiraga", open: true }, h("summary", null, "हिन्दी में पढ़िए (स्वरलिपि, सुनने की सूची और रचना नीचे अंग्रेज़ी कार्ड में)"), hiNode), full);
  }
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
      h("div", { class: "row" }, btn), host), tools.nextSibling);
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
        h("div", { class: "row" }, echoBtn, droneBtn), echoHost), tools.nextSibling);
      cleanups.push(() => { if (mine) tanpura.stop(); if (echo) echo.destroy(); });
    }
  }
  makePlayable(node);

  // Contents: the page's sections (h2, and h3 when there are few h2).
  const h2s = [...node.querySelectorAll("h2")].filter(x => x.id);
  const heads = h2s.length >= 4 ? h2s : [...node.querySelectorAll("h2, h3")].filter(x => x.id);
  if (heads.length >= 2) {
    const contents = h("button", { type: "button", class: "btn small ghost rd-contents" }, icon("read"), "Contents");
    contents.addEventListener("click", () => openContents(heads, id => {
      if (showFull) showFull();
      const t = document.getElementById(id);
      if (t) { t.scrollIntoView({ block: "start" }); t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: true }); }
    }));
    tools.append(contents);
  }
  // Hear this: the whole page in the app's natural voice (Kokoro, never the device's voice). A
  // lesson with its Hindi recording plays that in Hindi.
  const hear = h("span", { class: "rd-hear" }, readButton(() => pageText(node), "Hear this"));
  tools.append(hear);
  if (hiLesson) textOf(["lesson", path]).then(t => { if (t) hear.replaceChildren(sayButton([["lesson", path]], "Hear this")); }).catch(() => {});
  cleanups.push(() => stopSpeaking());
  // A A: the reader's text size, remembered in the settings.
  const smaller = h("button", { type: "button", class: "btn small ghost rd-size rd-smaller", "aria-label": "Smaller text" }, "A");
  const larger = h("button", { type: "button", class: "btn small ghost rd-size rd-larger", "aria-label": "Larger text" }, "A");
  const applySize = v => {
    page.style.setProperty("--reader-scale", String(v));
    smaller.disabled = v <= READER_SIZES[0]; larger.disabled = v >= READER_SIZES[READER_SIZES.length - 1];
  };
  const stepSize = d => {
    const cur = getSettings().readerSize;
    const at = READER_SIZES.reduce((best, v, i) => Math.abs(v - cur) < Math.abs(READER_SIZES[best] - cur) ? i : best, 0);
    const v = READER_SIZES[Math.max(0, Math.min(READER_SIZES.length - 1, at + d))];
    setSettings({ readerSize: v }); applySize(v);
  };
  smaller.addEventListener("click", () => stepSize(-1));
  larger.addEventListener("click", () => stepSize(1));
  applySize(getSettings().readerSize);
  tools.append(h("span", { class: "rd-sizes", role: "group", "aria-label": "Text size" }, smaller, larger));

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
      // Moving between lessons is a quiet block of its own, so it is not confused with the cards' Back and Next.
      page.append(h("nav", { class: "morelessons", "aria-label": "More lessons" },
        i > 0 ? h("a", { href: "#/read/" + same[i - 1].path }, h("span", { class: "small muted" }, "Previous lesson"), h("b", null, same[i - 1].title)) : h("span"),
        i < same.length - 1 ? h("a", { class: "next", href: "#/read/" + same[i + 1].path }, h("span", { class: "small muted" }, "Next lesson"), h("b", null, same[i + 1].title)) : h("span")));
    }
  } catch (e) { /* the pager is optional */ }
  return () => { stopPlayable(); cleanups.forEach(f => f()); document.title = "Bansuri Mastery"; };
}
