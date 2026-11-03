// Make a melody (#/music/compose, a saved one at #/music/compose/<n>): full screen (redesign W67).
// Tap notes on a grid of beats, using only a raga's (or a note set's) notes, then play it at the
// chosen tempo, clear it, play along with it, save it, or send it to a friend as a challenge.
import { h, store, storeSet, toast, icon } from "../util.js";
import { codeOf } from "../core/theory.js";
import { parseNotation, buildEvents, playEvents } from "../core/notation.js";
import { mountBench } from "../bench/bench.js";
import { fetchDoc } from "../content.js";
import { ragaInfo } from "./reader.js";
import { challengeLink } from "./play.js";
import { noteLabel } from "../core/fingers.js";

const SETS = [["Bilawal (major)", [0, 2, 4, 5, 7, 9, 11]], ["S R G P D (pentatonic)", [0, 2, 4, 7, 9]], ["Kalyan", [0, 2, 4, 6, 7, 9, 11]]];
const SAVED = "bansuri.compose.saved";
const DEFAULT_BPM = 72;

// Grid cells to notation: one note per beat, "-" holds the previous note, "_" is a rest; a bar
// line every four beats.
export function gridNotation(cells) {
  return cells.map((c, i) => (c === null ? "_" : c === "hold" ? "-" : codeOf(c)) + ((i + 1) % 4 === 0 && i < cells.length - 1 ? " |" : "")).join(" ") + " ||";
}

export async function render(main, ctx) {
  const params = (ctx && ctx.params) || [];
  const page = h("div", { class: "page composepage", dataset: { noswipe: "1" } });
  main.append(page);
  // Full focus (W67): no top bar and no tabs; (x) leads back to Music > Mine.
  document.documentElement.classList.add("fullfocus");
  const cleanups = [() => document.documentElement.classList.remove("fullfocus")];
  let beats = 16, cells = Array(beats).fill(null), notes = SETS[0][1], stopPlay = null, bench = null;
  // The saved melody being edited (its place in the saved list), or null for a new one.
  let editing = null;
  const setSel = h("select", { class: "input", "aria-label": "Notes", style: { width: "auto" } }, SETS.map(([l], i) => h("option", { value: "set:" + i }, l)));
  const lenSel = h("select", { class: "input", "aria-label": "Length", style: { width: "auto" } }, [8, 16, 24, 32].map(n => h("option", { value: String(n) }, n + " beats")));
  lenSel.value = "16";
  const bpmIn = h("input", { class: "input", type: "number", min: "40", max: "160", step: "4", value: String(DEFAULT_BPM), "aria-label": "Tempo (BPM)" });
  const tempo = () => Math.min(160, Math.max(40, Math.round(Number(bpmIn.value) || DEFAULT_BPM)));
  const grid = h("div", { class: "cgrid", role: "group", "aria-label": "Melody grid: rows are notes, columns are beats. Arrow keys move between cells." });
  const out = h("pre", { class: "mono small cout" });
  const benchHost = h("div", { class: "toolhost", hidden: true });
  const saved = h("div", { class: "hublist" });
  const nameEl = h("span", { class: "small muted composename" });

  // Ragas from the raga index: their aroh and avroh notes become the grid's rows.
  fetchDoc("ragas/README.md").then(async readme => {
    const files = [...readme.matchAll(/\]\(([a-z-]+\.md)\)/g)].map(m => m[1]).filter((f, i, a) => a.indexOf(f) === i);
    for (const f of files) {
      const md = await fetchDoc("ragas/" + f).catch(() => "");
      const info = md ? ragaInfo(md) : null, name = (/^# (?:Raga )?(.+)$/m.exec(md) || [])[1];
      if (info && info.notes.length >= 4 && name) setSel.append(h("option", { value: "raga:" + [...new Set(info.notes.map(n => ((n % 12) + 12) % 12))].join(",") }, "Raga " + name.replace(/\s*\(.*\)/, "")));
    }
  }).catch(() => {});

  const rows = () => { const pcs = notes; const r = []; for (const o of [12, 0, -12]) for (const p of pcs.slice().reverse()) { const s = p + o; if (s >= -5 && s <= 12) r.push(s); } return r; };
  // After a redraw the same cell keeps the keyboard focus.
  const refocus = (row, i) => { const r = grid.querySelector(`.crow[data-row="${row}"]`); const b = r && r.querySelectorAll(".ccell")[i]; if (b) b.focus(); };
  // A chosen cell shows its note (letter or fingering picture), so colour is not the only sign.
  const noteMark = (s, on) => on ? h("span", { class: "cmark" }, noteLabel(s)) : null;
  function draw() {
    const rs = rows();
    grid.style.setProperty("--beats", String(beats));
    grid.replaceChildren(...rs.map(s => h("div", { class: "crow", "data-row": String(s) }, h("span", { class: "clabel" }, noteLabel(s)),
      ...cells.map((c, i) => h("button", { type: "button", class: "ccell" + (c === s ? " on" : "") + (i % 4 === 0 ? " bar" : ""), "aria-label": codeOf(s) + " on beat " + (i + 1), "aria-pressed": String(c === s),
        onclick: () => { cells[i] = cells[i] === s ? null : s; draw(); refocus(String(s), i); } }, noteMark(s, c === s))))),
      h("div", { class: "crow", "data-row": "hold" }, h("span", { class: "clabel small" }, "hold"), ...cells.map((c, i) => h("button", { type: "button", class: "ccell hold" + (c === "hold" ? " on" : "") + (i % 4 === 0 ? " bar" : ""), "aria-label": "Hold on beat " + (i + 1), onclick: () => { cells[i] = cells[i] === "hold" ? null : "hold"; draw(); refocus("hold", i); } }))));
    out.textContent = gridNotation(cells);
  }
  // Arrow keys move between cells (one tab stop for the whole grid); Space or Enter toggles a cell.
  grid.addEventListener("keydown", e => {
    const cell = e.target.closest && e.target.closest(".ccell"); if (!cell) return;
    const rowsEl = [...grid.querySelectorAll(".crow")], r = rowsEl.findIndex(x => x.contains(cell)), c = [...rowsEl[r].querySelectorAll(".ccell")].indexOf(cell);
    const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const nr = Math.max(0, Math.min(rowsEl.length - 1, r + d[0])), nc = Math.max(0, Math.min(beats - 1, c + d[1]));
    const next = rowsEl[nr].querySelectorAll(".ccell")[nc]; if (next) next.focus();
  });
  const playBtn = h("button", { type: "button", class: "btn primary" }, icon("play"), " Play it");
  const stopIt = () => { if (stopPlay) { stopPlay(); stopPlay = null; } playBtn.replaceChildren(icon("play"), " Play it"); };
  const play = () => {
    if (stopPlay) { stopIt(); return; }
    const bpm = tempo(), b = buildEvents(parseNotation(gridNotation(cells)).tokens, bpm);
    if (!b.ev.length) { toast("Tap some notes on the grid first."); return; }
    stopPlay = playEvents(b.ev, b.beats, { bpm, click: true, onEnd: () => { stopPlay = null; playBtn.replaceChildren(icon("play"), " Play it"); } });
    playBtn.replaceChildren(icon("stop"), " Stop");
  };
  playBtn.addEventListener("click", play);
  // A new tempo while it plays: it starts again at the new tempo.
  bpmIn.addEventListener("change", () => { bpmIn.value = String(tempo()); if (stopPlay) { stopIt(); play(); } });
  cleanups.push(() => { stopIt(); if (bench) bench.destroy(); });
  const melodyNotes = () => cells.filter(c => typeof c === "number");

  // Clear (W88): a risky action, so tap once and it asks; tap again within 4 s to clear.
  const clearBtn = h("button", { type: "button", class: "btn" }, "Clear");
  let clearTimer = 0;
  const disarm = () => { clearTimeout(clearTimer); clearBtn.dataset.armed = ""; clearBtn.classList.remove("danger"); clearBtn.textContent = "Clear"; };
  clearBtn.addEventListener("click", () => {
    if (!cells.some(c => c !== null)) { toast("The grid is already empty."); return; }
    if (clearBtn.dataset.armed !== "1") {
      clearBtn.dataset.armed = "1"; clearBtn.classList.add("danger"); clearBtn.textContent = "Tap again to clear";
      clearTimer = setTimeout(disarm, 4000);
      return;
    }
    disarm(); stopIt();
    cells = Array(beats).fill(null); draw();
  });
  cleanups.push(() => clearTimeout(clearTimer));

  // Opens a saved melody (its notes, length and tempo) for editing; Save then updates it.
  function openSaved(i) {
    const m = store(SAVED, [])[i];
    if (!m || !Array.isArray(m.cells)) return false;
    editing = i; stopIt();
    beats = m.cells.length; lenSel.value = String(beats); cells = m.cells.slice();
    bpmIn.value = String(m.bpm || DEFAULT_BPM);
    nameEl.textContent = m.name;
    draw(); drawSaved();
    return true;
  }
  function saveIt() {
    const l = store(SAVED, []);
    const entry = { cells: cells.slice(), notation: gridNotation(cells), bpm: tempo() };
    let name;
    if (editing !== null && l[editing]) { name = l[editing].name; l[editing] = Object.assign({}, l[editing], entry); storeSet(SAVED, l); toast("Saved: " + name + "."); }
    else {
      name = "Melody " + (l.length + 1);
      l.push(Object.assign({ name }, entry));
      const kept = l.slice(-20);
      storeSet(SAVED, kept);
      editing = kept.length - 1;
      toast("Saved as " + name + ".");
    }
    nameEl.textContent = name;
    drawSaved();
  }
  function drawSaved() {
    const list = store(SAVED, []);
    saved.replaceChildren(...(list.length ? list.map((m, i) => {
      const del = h("button", { type: "button", class: "btn small ghost", "aria-label": "Delete " + m.name }, "Delete");
      del.addEventListener("click", () => {
        if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "Tap again to delete"; setTimeout(() => { if (del.isConnected) { del.dataset.armed = ""; del.textContent = "Delete"; } }, 4000); return; }
        const l = store(SAVED, []); l.splice(i, 1); storeSet(SAVED, l);
        if (editing === i) { editing = null; nameEl.textContent = ""; } else if (editing !== null && editing > i) editing--;
        drawSaved();
      });
      return h("div", { class: "hubrow composerow" + (editing === i ? " current" : "") },
        h("span", { class: "stack" }, h("b", null, m.name), h("span", { class: "small muted" }, (m.cells ? m.cells.length : 16) + " beats")),
        h("div", { class: "row tight" }, h("button", { type: "button", class: "btn small", onclick: () => { openSaved(i); window.scrollTo(0, 0); } }, "Open"), del));
    }) : [h("p", { class: "small muted" }, "Melodies you save appear here.")]));
  }
  setSel.addEventListener("change", () => { const v = setSel.value; notes = v.startsWith("set:") ? SETS[Number(v.slice(4))][1] : v.slice(5).split(",").map(Number); cells = cells.map(c => typeof c === "number" && !notes.includes(((c % 12) + 12) % 12) ? null : c); draw(); });
  lenSel.addEventListener("change", () => { beats = Number(lenSel.value); cells = cells.slice(0, beats).concat(Array(Math.max(0, beats - cells.length)).fill(null)); draw(); });

  page.append(
    h("header", { class: "composehead" },
      h("a", { class: "lesson-close", href: "#/music/mine", "aria-label": "Close" }, icon("x")),
      h("div", { class: "stack tight" }, h("h1", null, "Make a melody"), nameEl),
      h("button", { type: "button", class: "btn", onclick: saveIt }, "Save")),
    h("p", { class: "small muted" }, "Tap one note per beat (rows are notes, columns are beats). Only the chosen raga's notes are offered, so the tune always stays in the raga."),
    h("section", { class: "card stack" }, h("div", { class: "row" }, h("label", { class: "field" }, "Notes", setSel), h("label", { class: "field" }, "Length", lenSel)),
      h("div", { class: "cwrap" }, grid), out,
      h("div", { class: "row composectl" }, playBtn, clearBtn, h("label", { class: "field composebpm" }, "Tempo (BPM)", bpmIn)),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn", onclick: () => { if (bench) { bench.destroy(); bench = null; benchHost.hidden = true; return; } stopIt(); bench = mountBench(benchHost, { compact: true, tabs: ["play"], tab: "play", notation: gridNotation(cells), bpm: tempo(), checkMe: true, title: nameEl.textContent || "My melody" }); benchHost.hidden = false; } }, "Play along"),
        h("button", { type: "button", class: "btn", onclick: async () => {
          const p = melodyNotes(); if (p.length < 2) { toast("A challenge needs at least two notes."); return; }
          const link = challengeLink({ g: "phrase", p: p.slice(0, 32), by: store("bansuri.share.name", "") });
          try { if (navigator.share) await navigator.share({ title: "Can you play my tune?", url: link }); else { await navigator.clipboard.writeText(link); toast("Challenge link copied."); } } catch (e) { toast("Copy this link: " + link); }
        } }, "Challenge a friend")),
      benchHost),
    h("section", { class: "card hubgroup" }, h("h2", { class: "grouphead" }, "Saved melodies"), saved));
  draw();
  // #/music/compose/<n>: that saved melody, ready to change.
  if (params[0] !== undefined && !openSaved(Number(params[0]))) toast("That melody is no longer saved.");
  drawSaved();
  return () => cleanups.forEach(f => f());
}
