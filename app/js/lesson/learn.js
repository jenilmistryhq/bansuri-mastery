// The day's knowledge inside its lesson (docs/redesign/13-one-day.md). Every block of the day's
// session (app/data/plan.json) has a home in the lesson: a "learn" card that opens a chapter (the
// block's instruction in plain words, its minutes, its readings and, folded, the course's own
// wording), or a "Why and how" fold under the steps that already do it. Readings open in a sheet
// over the lesson and close back to the same step. No new course text: everything shown here is
// the plan's block text, its plain spoken version (app/voice/<lang>/index.json) and the course's
// Markdown pages.
import { h, icon } from "../util.js";
import { renderInline, fetchDoc, renderMarkdown } from "../content.js";
import { plainText } from "../steps.js";
import { plainCodes } from "../codes.js";
import { sayButton, lang, stopSpeaking } from "../voice.js";
import { makePlayable, stopPlayable } from "../playable.js";
import { flutePlayer } from "../demo.js";

// A block's text without notation marks or links, for when no plain spoken version exists.
const bare = text => String(text || "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*]/g, "").replace(/\s+/g, " ").trim();

// The block's instruction in plain words: the spoken version in the learner's language when there
// is one (with a button that plays its natural voice clip), else the course's sentence as written.
function lead(b, cls) {
  const p = h("p", { class: cls, translate: "no" }, bare(b.text));
  const row = h("div", { class: "lesson-learn-lead" }, p);
  plainText(b).then(t => {
    if (!t) return;
    p.textContent = t; p.removeAttribute("translate");
    row.append(sayButton([["step", b.text]], "Listen"));
  });
  return row;
}

// The lessons' Hindi titles and texts (app/i18n/lessons-hi.json), loaded once when needed.
let hiLessons = null;
const lessonsHi = () => (hiLessons = hiLessons || fetch("app/i18n/lessons-hi.json").then(r => (r.ok ? r.json() : {})).catch(() => ({})));

// The block's readings, as buttons that open the page in a sheet over the lesson. In Hindi, a
// lesson is named by its Hindi title.
export function readingList(read) {
  if (!read || !read.length) return null;
  return h("div", { class: "lesson-reads" }, read.map(r => {
    const name = h("span", null, plainCodes(r.label));
    if (lang() === "hi" && /^lessons\/L\d\d/.test(r.path)) lessonsHi().then(all => { const t = all && all[r.path] && all[r.path].title; if (t) { name.textContent = t; name.setAttribute("lang", "hi"); } });
    return h("button", { type: "button", class: "lesson-read", onclick: () => openReading(r) }, icon("read"), name);
  }));
}

// Everything a block carries, below its plain words: the readings and the course's wording.
function more(b) {
  const orig = h("p", { class: "small", translate: "no" }, renderInline(b.text || "", "phases/README.md"));
  makePlayable(orig);
  return [readingList(b.read), b.text ? h("details", { class: "small muted origtext" }, h("summary", null, "Original wording"), orig) : null];
}

const minutes = b => (b.minutes ? h("span", { class: "small muted" }, b.minutes + " min") : null);

// The chapter's intro card: { block, demo? (notation the flute picture plays) }.
function learnStep(s, api) {
  const b = s.block || {};
  let demo = null;
  if (s.demo) demo = flutePlayer({ notation: s.demo, bpm: 60, title: "Watch the fingers" });
  const el = h("div", { class: "stack lesson-learn" },
    h("div", { class: "row between lesson-learn-head" }, h("span", { class: "eyebrow" }, "Why and how"), minutes(b)),
    lead(b, "lesson-lead"),
    demo ? demo.el : null,
    ...more(b));
  setTimeout(() => api.ready(), 0);
  return { el, destroy() { if (demo) demo.destroy(); stopPlayable(); } };
}

export const LEARN_KINDS = { learn: { make: learnStep } };

// The same knowledge folded under a step that does the block's work: closed until asked for, so
// it never stands between the learner and the playing.
export function whyLayer(blocks) {
  if (!blocks || !blocks.length) return null;
  const body = h("div", { class: "stack lesson-why-body" });
  let filled = false;
  const fold = h("details", { class: "lesson-why" },
    h("summary", null, icon("read"), h("span", null, "Why and how"), h("span", { class: "small muted lesson-why-what" }, blocks.map(b => b.label).filter(Boolean).join(", "))),
    body);
  fold.addEventListener("toggle", () => {
    if (!fold.open || filled) return;
    filled = true;
    for (const b of blocks) body.append(h("div", { class: "stack tight" }, blocks.length > 1 ? h("div", { class: "row between" }, h("b", null, b.label), minutes(b)) : null, lead(b, ""), ...more(b)));
  });
  return fold;
}

// A course page in a sheet: the lesson stays where it is underneath, and closing the sheet goes
// back to the same step. Links to other course pages open in the same sheet (with Back); any other
// link leaves the lesson as usual (it resumes where it was left).
export function openReading(r) {
  const history = [];
  const titleEl = h("h2", { class: "sheet-title" });
  const backBtn = h("button", { type: "button", class: "btn ghost small", hidden: true }, "Back");
  const closeBtn = h("button", { type: "button", class: "btn primary small" }, "Back to the step");
  const body = h("div", { class: "sheet-body" });
  const dlg = h("dialog", { class: "sheet", "aria-label": plainCodes(r.label || "") || "Reading" },
    h("header", { class: "sheet-head" }, backBtn, titleEl, closeBtn), body);
  const cleanups = [];
  const clean = () => { while (cleanups.length) { try { cleanups.pop()(); } catch (e) { /* ignore */ } } stopPlayable(); stopSpeaking(); };
  const close = () => { clean(); if (dlg.open) dlg.close(); dlg.remove(); };
  closeBtn.addEventListener("click", close);
  dlg.addEventListener("cancel", e => { e.preventDefault(); close(); });
  dlg.addEventListener("click", e => {
    if (e.target === dlg) { close(); return; }
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    const m = /^#\/read\/([^#]+\.md)(?:#(.+))?$/.exec(href);
    if (m) { e.preventDefault(); history.push(cur); load({ path: m[1], anchor: m[2] || "", label: a.textContent }); return; }
    if (href.startsWith("#/")) close();
  });
  backBtn.addEventListener("click", () => { if (history.length) load(history.pop()); });
  let cur = r;
  async function load(page) {
    cur = page; clean();
    backBtn.hidden = !history.length;
    titleEl.textContent = plainCodes(page.label || "");
    body.replaceChildren(h("p", { class: "muted" }, "Loading..."));
    body.scrollTop = 0;
    let md;
    try { md = await fetchDoc(page.path); } catch (e) { body.replaceChildren(h("p", null, "Could not open this page"), h("p", { class: "small muted" }, String(e.message))); return; }
    if (cur !== page) return;
    const { node, title } = renderMarkdown(md, page.path);
    node.classList.add("reader");
    titleEl.textContent = title;
    const full = h("div", null, node);
    const isLesson = /^lessons\/L\d\d/.test(page.path);
    let cards = [];
    if (isLesson) {
      // Lessons read as cards, one idea at a time, as in the reader; in Hindi, with their Hindi text.
      const { lessonCards, cardDeck } = await import("../lessoncards.js");
      let hi = null;
      if (lang() === "hi") hi = ((await lessonsHi()) || {})[page.path] || null;
      if (cur !== page) return;
      if (hi && hi.title) titleEl.textContent = hi.title;
      cards = lessonCards(node, page.path, hi);
      cards.forEach(c => { if (c.cleanup) cleanups.push(c.cleanup); });
      if (cards.length >= 3) {
        const deck = cardDeck(cards, page.path, { doneLabel: "Back to the step", onDone: close });
        const cardsBtn = h("button", { type: "button", class: "seg-btn" }, "Cards");
        const fullBtn = h("button", { type: "button", class: "seg-btn" }, "Full lesson");
        const show = m => { deck.hidden = m !== "cards"; full.hidden = m === "cards"; cardsBtn.setAttribute("aria-pressed", String(m === "cards")); fullBtn.setAttribute("aria-pressed", String(m !== "cards")); };
        cardsBtn.addEventListener("click", () => show("cards"));
        fullBtn.addEventListener("click", () => show("full"));
        body.replaceChildren(h("div", { class: "row end" }, h("div", { class: "seg", role: "group", "aria-label": "View" }, cardsBtn, fullBtn)), deck, full);
        show(page.anchor ? "full" : "cards");
      } else body.replaceChildren(full);
    } else body.replaceChildren(full);
    makePlayable(node);
    if (page.anchor) {
      const target = node.querySelector("#" + CSS.escape(page.anchor));
      if (target) setTimeout(() => target.scrollIntoView({ block: "start" }), 0);
    }
    // Glossary terms become tap-to-define, as in the reader.
    import("../glossary.js").then(({ loadGlossary, glossify }) => loadGlossary().then(entries => {
      if (!entries.length || cur !== page) return;
      glossify(node, entries);
      for (const c of cards) { const seen = new Set(); (c.body || []).forEach(n => { if (n && n.nodeType === 1) glossify(n, entries, { seen }); }); }
    })).catch(() => {});
  }
  document.body.append(dlg);
  dlg.showModal();
  load(r);
  return { el: dlg, close };
}
