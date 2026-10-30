// Lessons as cards: the rendered lesson is split at its headings into short cards, one idea per
// card, with the quiz as flashcards, common mistakes as tap-to-reveal and the mastery criteria as
// a checklist that is remembered. Built from the lesson's own sections, so no extra writing is needed.
import { h, store, storeSet } from "./util.js";
import { makePlayable, isNotation } from "./playable.js";
import { mountBench } from "./bench/bench.js";
import { holdMeter } from "./core/live.js";
import { listRecordings } from "./recorder.js";
import { postureCheck } from "./posture.js";
import { bestHold } from "./livestats.js";
import { toneDemo } from "./core/audio.js";
import { readButton, stopSpeaking } from "./voice.js";
import { flutePlayer } from "./demo.js";

function toneLevelsRow() {
  const words = { 1: "1: mostly air", 2: "2: some tone, much breath", 3: "3: clear, a little breath", 4: "4: full and clear" };
  let v = null;
  return h("div", { class: "chips" }, [1, 2, 3, 4].map(l => h("button", { type: "button", class: "chipbtn", onclick: () => { if (v) v.stop(); v = toneDemo(l, 3); } }, words[l])));
}

// Lessons whose main skill is a held sound: the practice card offers the live long-tone meter.
const TONE_DRILLS = {
  L04: { targets: [0], seconds: 3, cents: 40, label: "Hold Sa for 3 s" },
  L07: { targets: [0], seconds: 8, cents: 30, label: "Hold Sa for 8 s" },
  L09: { targets: [0, 2, 4], seconds: 4, cents: 30, label: "Hold S, R and G" },
  L11: { targets: [-1, -3, -5], seconds: 4, cents: 30, label: "Hold .N, .D and .P" },
  L14: { targets: [6, 7, 9, 11], seconds: 4, cents: 30, label: "Hold M, P, D and N" },
  L16: { targets: [5], seconds: 4, cents: 25, label: "Hold shuddha m (half-hole)" },
  L17: { targets: [0, 4, 7], seconds: 6, cents: 15, label: "Hold S, G and P in tune" },
  L22: { targets: [12, 14, 16], seconds: 4, cents: 30, label: "Hold S', R' and G'" },
  L25: { targets: [1, 3, 8, 10], seconds: 4, cents: 20, label: "Hold the komal notes" },
};

// Openly licensed recordings of a real bansuri bundled with the app (credits in app/audio/CREDITS.txt),
// played on a lesson's last card until the learner marks a teacher's recording for it.
const SANKALP = "sankalp on Freesound, CC BY 4.0";
const BUNDLED = {
  L04: ["bansuri-sa-middle-octave-sankalp.mp3", "A held middle Sa", SANKALP],
  L05: ["bansuri-sa-middle-octave-sankalp.mp3", "A held middle Sa", SANKALP],
  L07: ["bansuri-sa-middle-octave-sankalp.mp3", "A held middle Sa (11 s)", SANKALP],
  L09: ["bansuri-sargam-sa-to-taar-sa-roguentropy.mp3", "Sa to upper Sa and back", "roguentropy on Freesound, CC0"],
  L10: ["bansuri-sargam-sa-to-taar-sa-roguentropy.mp3", "Sa to upper Sa and back", "roguentropy on Freesound, CC0"],
  L11: ["bansuri-sa-lower-octave-sankalp.mp3", "A held lower Sa", SANKALP],
  L12: ["bansuri-major-scale-sankalp.mp3", "The Bilawal (major) scale", SANKALP],
  L13: ["bansuri-major-scale-staccato-sankalp.mp3", "A tongued (staccato) scale", SANKALP],
  L16: ["bansuri-major-scale-sankalp.mp3", "The Bilawal scale, with shuddha Ma", SANKALP],
  L19: ["bansuri-raag-jog-phrase-ninad-p.mp3", "A short phrase in raga Jog", "Ninad_P on Freesound, CC0"],
  L22: ["bansuri-sa-three-octaves-sankalp.mp3", "Sa in three octaves", SANKALP],
  L25: ["carnatic-flute-mayamalavagowla.ogg", "Raga Mayamalavagowla (the Bhairav scale) on a Carnatic flute, not a bansuri", "Bansuri.arvind on Wikimedia Commons, CC BY-SA 3.0"],
};

// The last card: do the lesson's main exercise now, with the microphone, and hear a reference.
function practiceCard(node, path) {
  const id = (/L\d\d/.exec(path) || [])[0];
  const notations = [...new Set([...node.querySelectorAll("code")].map(c => c.textContent.trim()).filter(t => t.split(/\s+/).length >= 3 && isNotation(t)))].slice(0, 15);
  const tone = TONE_DRILLS[id];
  // L02 (posture and holding): the live posture check is the exercise.
  if (id === "L02") {
    let pc = null;
    const host = h("div");
    const b = h("button", { type: "button", class: "btn primary" }, "Check my posture with the camera");
    b.addEventListener("click", () => { if (pc) { pc.destroy(); pc = null; host.replaceChildren(); return; } pc = postureCheck(); host.append(pc.el); });
    return { kind: "Practise it now", title: "Your turn", body: [h("p", null, "Hold the flute as if playing, facing the camera; the check watches your shoulders, head and arms."), h("div", { class: "row" }, b), host], cleanup: () => pc && pc.destroy() };
  }
  // L08 (recording and self-assessment): hear the four tone levels before scoring yourself.
  if (id === "L08") {
    return { kind: "Practise it now", title: "Your turn", body: [h("p", null, "Listen to the four tone levels, then record a long Sa in the Journal and score it. The Journal also gives a measured tone estimate to compare with your own score."), toneLevelsRow(), h("a", { class: "btn primary", href: "#/journal" }, "Record in the Journal")] };
  }
  if (!tone && !notations.length) return null;
  let widget = null, refUrl = null;
  const host = h("div", { class: "toolhost", hidden: true });
  const close = () => { if (widget) { widget.destroy(); widget = null; } host.hidden = true; host.replaceChildren(); };
  const buttons = [];
  if (tone) {
    const b = h("button", { type: "button", class: "btn primary" }, tone.label);
    b.addEventListener("click", () => { close(); widget = holdMeter(Object.assign({ ghost: bestHold }, tone)); host.append(widget.el); host.hidden = false; });
    buttons.push(b);
  }
  let pick = null;
  if (notations.length) {
    pick = h("select", { class: "input", "aria-label": "Exercise", style: { width: "auto", maxWidth: "100%" } }, notations.map((t, i) => h("option", { value: String(i) }, t.length > 48 ? t.slice(0, 46) + " ..." : t)));
    const b = h("button", { type: "button", class: "btn" + (tone ? "" : " primary") }, "Play along");
    b.addEventListener("click", () => {
      close();
      const bench = mountBench(host, { compact: true, tabs: ["play"], tab: "play", notation: notations[Number(pick.value)], bpm: 60, checkMe: true, title: id + " exercise" });
      widget = { destroy: () => bench.destroy() };
      host.hidden = false;
    });
    buttons.push(b);
    const show = h("button", { type: "button", class: "btn" }, "Show me");
    show.addEventListener("click", () => { close(); const p = flutePlayer({ notation: notations[Number(pick.value)], bpm: 60 }); widget = p; host.append(p.el); host.hidden = false; p.play(); });
    buttons.push(show);
  }
  // A reference recording for this lesson: the learner's teacher, or their own best take, marked in the Journal.
  const ref = h("div", { class: "small muted" }, "Reference sound: ask your teacher to play this lesson's sound, record it in the Journal and mark it \"Reference for " + id + "\". It will play here.");
  const bundled = BUNDLED[id];
  if (bundled) ref.replaceChildren(h("b", null, "Hear a real bansuri: " + bundled[1] + " "), h("audio", { controls: true, src: "app/audio/" + bundled[0], preload: "none" }),
    h("span", { class: "small muted" }, " Recording: " + bundled[2] + ". Your teacher's recording, marked \"Reference for " + id + "\" in the Journal, replaces it."));
  listRecordings().then(recs => {
    const r = recs.find(x => x.ref === "lesson:" + id);
    if (!r) return;
    refUrl = URL.createObjectURL(r.blob);
    ref.replaceChildren(h("b", null, "Reference: " + (r.label || id) + " "), h("audio", { controls: true, src: refUrl, preload: "none" }));
  }).catch(() => {});
  const body = [h("p", null, "Do it now, with the microphone listening. Short and focused beats long and distracted."),
    pick ? h("label", { class: "field" }, "Exercise from this lesson", pick) : null, h("div", { class: "row" }, buttons), host, ref];
  return { kind: "Practise it now", title: "Your turn", body, cleanup: () => { close(); if (refUrl) URL.revokeObjectURL(refUrl); } };
}

const SKIP = /learning objectives|prerequisites|watch and listen|next lesson|independent exercises/i;
const plain = el => el.textContent.replace(/^\s*\d+\.\s*/, "").trim();

// Sections of the rendered lesson: [{ title, level, nodes }] split at h2 and h3.
function sections(node) {
  const out = []; let cur = null, h2 = "";
  for (const el of [...node.children]) {
    if (el.tagName === "H1") continue;
    if (el.tagName === "H2" || el.tagName === "H3") {
      if (el.tagName === "H2") h2 = plain(el);
      cur = { title: plain(el), level: el.tagName, parent: h2, nodes: [] };
      out.push(cur);
    } else if (cur) cur.nodes.push(el);
  }
  return out;
}

function mistakesCard(sec) {
  const table = sec.nodes.find(n => n.querySelector && n.querySelector("table")) || sec.nodes.find(n => n.tagName === "TABLE");
  const t = table && (table.tagName === "TABLE" ? table : table.querySelector("table"));
  if (!t) return null;
  const rows = [...t.querySelectorAll("tbody tr")].map(tr => [...tr.children]);
  const list = h("div", { class: "reveal-list" }, rows.map(cells => {
    const fix = cells[cells.length - 1].cloneNode(true);
    const item = h("button", { type: "button", class: "reveal", "aria-expanded": "false" },
      h("b", null, cells[0].textContent.trim()), cells.length > 2 ? h("span", { class: "small muted" }, " - " + cells[1].textContent.trim()) : null);
    const ans = h("div", { class: "reveal-ans", hidden: true }, h("span", { class: "eyebrow" }, "Fix"), fix);
    item.addEventListener("click", () => { ans.hidden = !ans.hidden; item.setAttribute("aria-expanded", String(!ans.hidden)); });
    return h("div", { class: "reveal-item" }, item, ans);
  }));
  return { kind: "Watch out", title: "Common mistakes", body: [h("p", { class: "small muted" }, "Tap a mistake to see the fix."), list] };
}

function quizCard(sec) {
  const qList = sec.nodes.find(n => n.tagName === "OL");
  const key = sec.nodes.find(n => n.tagName === "DETAILS");
  const aList = key && key.querySelector("ol");
  if (!qList || !aList) return null;
  const qs = [...qList.children].map((li, i) => [li, aList.children[i]]).filter(([, a]) => a);
  if (!qs.length) return null;
  let i = 0, known = 0;
  const box = h("div", { class: "flash" });
  const draw = () => {
    box.replaceChildren();
    if (i >= qs.length) {
      box.append(h("p", { class: "flash-q" }, `You knew ${known} of ${qs.length}.`),
        h("p", { class: "small muted" }, known === qs.length ? "Excellent. On to the next card." : "Read the cards for the ones you missed, then try again."),
        h("button", { type: "button", class: "btn", onclick: () => { i = 0; known = 0; draw(); } }, "Again"));
      return;
    }
    const [q, a] = qs[i];
    const ans = h("div", { class: "flash-a", hidden: true }, [...a.cloneNode(true).childNodes]);
    const show = h("button", { type: "button", class: "btn primary" }, "Show answer");
    const grade = h("div", { class: "row", hidden: true },
      h("button", { type: "button", class: "btn primary", onclick: () => { known++; i++; draw(); } }, "I knew it"),
      h("button", { type: "button", class: "btn", onclick: () => { i++; draw(); } }, "Not yet"));
    show.addEventListener("click", () => { ans.hidden = false; show.hidden = true; grade.hidden = false; });
    box.append(h("span", { class: "eyebrow" }, `Question ${i + 1} of ${qs.length}`), h("div", { class: "flash-q" }, [...q.cloneNode(true).childNodes]), ans, show, grade);
    makePlayable(box);
  };
  draw();
  return { kind: "Quick quiz", title: "Test yourself", body: [box] };
}

function masteryCard(sec, path) {
  const key = "bansuri.mastery." + path, saved = store(key, {});
  const body = sec.nodes.map(n => n.cloneNode(true));
  let k = 0;
  body.forEach(n => n.querySelectorAll && n.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    const id = String(k++);
    cb.disabled = false; cb.checked = !!saved[id];
    cb.addEventListener("change", () => { const s = store(key, {}); s[id] = cb.checked; storeSet(key, s); });
  }));
  return { kind: "Can you do this?", title: "Mastery criteria", body: [h("p", { class: "small muted" }, "Tick what you can already do. When every box is ticked, the lesson is learned."), ...body] };
}

// Splits a long card into parts of about 700 characters, at element boundaries; a table or a
// code block always stays whole.
function splitLong(card) {
  const len = n => n.textContent.length;
  const total = card.body.reduce((a, n) => a + len(n), 0);
  if (total <= 900 || card.body.length < 2) return [card];
  const parts = []; let cur = [], size = 0;
  for (const n of card.body) {
    if (cur.length && size + len(n) > 700) { parts.push(cur); cur = []; size = 0; }
    cur.push(n); size += len(n);
  }
  if (cur.length) parts.push(cur);
  if (parts.length > 1 && parts[parts.length - 1].reduce((a, n) => a + len(n), 0) < 200) { const tail = parts.pop(); parts[parts.length - 1].push(...tail); }
  return parts.map((body, i) => Object.assign({}, card, { title: card.title + (parts.length > 1 ? ` (${i + 1} of ${parts.length})` : ""), body }));
}

export function lessonCards(node, path) {
  const secs = sections(node), cards = [];
  const steps = secs.filter(s => s.level === "H3" && /step-by-step/i.test(s.parent) && /^step\b/i.test(s.title)).length;
  let step = 0;
  for (const s of secs) {
    const parentSkip = SKIP.test(s.parent) && s.level === "H3";
    if (SKIP.test(s.title) || parentSkip) continue;
    if (/common mistakes/i.test(s.title)) { const c = mistakesCard(s); if (c) cards.push(c); continue; }
    if (/^quiz$/i.test(s.title)) { const c = quizCard(s); if (c) cards.push(c); continue; }
    if (/mastery criteria/i.test(s.title)) { cards.push(masteryCard(s, path)); continue; }
    if (!s.nodes.length) continue; // a heading that only introduces its subsections
    let kind = s.parent && s.level === "H3" ? s.parent : "", title = s.title;
    if (/simple explanation/i.test(s.title) || /simple explanation/i.test(kind)) kind = "The idea";
    else if (/step-by-step/i.test(s.parent) && s.level === "H3") {
      if (/^step\b/i.test(s.title)) { kind = `Step ${++step} of ${steps}`; title = s.title.replace(/^step\s*\d+\s*[:.-]\s*/i, ""); }
      else kind = "Steps";
    }
    if (/simple explanation/i.test(s.title)) title = "In short";
    cards.push(...splitLong({ kind, title: title.charAt(0).toUpperCase() + title.slice(1), body: s.nodes.map(n => n.cloneNode(true)) }));
  }
  const practice = practiceCard(node, path);
  if (practice) cards.push(practice);
  return cards;
}

// The deck: one card at a time, with progress, buttons, arrow keys and swipe.
export function cardDeck(cards, path, opts) {
  const posKey = "bansuri.cardpos." + path;
  let i = Math.min(store(posKey, 0), Math.max(0, cards.length - 1));
  const bar = h("i", { style: { width: "0%" } });
  const count = h("span", { class: "small muted" });
  const stage = h("div", { class: "deck-stage", "aria-live": "polite" });
  const back = h("button", { type: "button", class: "btn" }, "Back");
  const next = h("button", { type: "button", class: "btn primary" }, "Next");
  const el = h("section", { class: "deck", tabindex: "-1" },
    h("div", { class: "row between" }, count, h("div", { class: "progressbar deck-progress" }, bar)),
    stage, h("div", { class: "row between deck-nav" }, back, next));
  function draw(dir) {
    const c = cards[i];
    const body = h("div", { class: "reader lbody" }, c.body);
    // Every card can be heard: a natural voice reads its title and text.
    const speakIt = readButton(() => c.title + ". " + [...body.querySelectorAll("p, li, h3, td")].filter(n => !n.closest(".toolhost, .row, label")).map(n => n.textContent).join(" "), "Read aloud");
    const card = h("article", { class: "card lcard" + (dir ? " in-" + dir : "") },
      h("div", { class: "row between" }, c.kind ? h("span", { class: "eyebrow" }, c.kind) : h("span"), speakIt), h("h2", null, c.title), body);
    makePlayable(card);
    stage.replaceChildren(card);
    bar.style.width = ((i + 1) / cards.length * 100) + "%";
    count.textContent = `${i + 1} of ${cards.length}`;
    back.disabled = i === 0;
    next.textContent = i === cards.length - 1 ? (opts && opts.doneLabel) || "Finish" : "Next";
    storeSet(posKey, i);
  }
  function go(d) {
    if (d > 0 && i === cards.length - 1) { storeSet(posKey, 0); if (opts && opts.onDone) opts.onDone(); return; }
    const j = Math.max(0, Math.min(cards.length - 1, i + d));
    if (j === i) return;
    i = j; draw(d > 0 ? "next" : "prev");
    // Bring the new card's top into view, below the sticky app bar.
    const y = el.getBoundingClientRect().top + window.scrollY - 76;
    if (y < window.scrollY) window.scrollTo({ top: y, behavior: "smooth" });
  }
  back.addEventListener("click", () => { stopSpeaking(); go(-1); });
  next.addEventListener("click", () => { stopSpeaking(); go(1); });
  el.addEventListener("keydown", e => {
    if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName)) return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(1); } else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  });
  let x0 = null, y0 = null;
  stage.addEventListener("pointerdown", e => { if (e.pointerType !== "mouse") { x0 = e.clientX; y0 = e.clientY; } });
  stage.addEventListener("pointerup", e => {
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
  });
  draw();
  return el;
}
