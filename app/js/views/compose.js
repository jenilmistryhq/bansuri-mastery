// Make a melody (#/music/compose, a saved one at #/music/compose/<n>): full screen (redesign W67).
// Tap notes on a grid of beats, using only a raga's (or a note set's) notes, then play it at the
// chosen tempo, clear it, play along with it, save it, or send it to a friend as a challenge.
// Two input modes: a visual grid (one note per beat) or a text editor where you type sargam notation
// directly (supports subdivision, breath marks and everything parseNotation handles).
import { h, store, storeSet, toast, icon } from "../util.js";
import { codeOf, pcOf } from "../core/theory.js";
import { parseNotation, buildEvents, playEvents } from "../core/notation.js";
import { mountBench } from "../bench/bench.js";
import { fetchDoc } from "../content.js";
import { ragaInfo } from "./reader.js";
import { challengeLink } from "./play.js";
import { noteLabel } from "../core/fingers.js";

const SETS = [
  ["Bilawal (major)", [0, 2, 4, 5, 7, 9, 11]],
  ["Kalyan (Lydian)", [0, 2, 4, 6, 7, 9, 11]],
  ["Khamaj (Mixolydian)", [0, 2, 4, 5, 7, 9, 10]],
  ["Kafi (Dorian)", [0, 2, 3, 5, 7, 9, 10]],
  ["Asavari (minor)", [0, 2, 3, 5, 7, 8, 10]],
  ["Bhairavi (Phrygian)", [0, 1, 3, 5, 7, 8, 10]],
  ["Bhairav", [0, 1, 4, 5, 7, 8, 11]],
  ["Poorvi", [0, 1, 4, 6, 7, 8, 11]],
  ["Marwa", [0, 1, 4, 6, 7, 9, 11]],
  ["Todi", [0, 1, 3, 6, 7, 8, 11]],
  ["S R G P D (pentatonic)", [0, 2, 4, 7, 9]],
];
const SAVED = "bansuri.compose.saved";
const DEFAULT_BPM = 72;

const TEMPLATES = [
  ["Blank (16 beats)", ""],
  ["Sa long tones", "S - - - _ _ S - - - _ _ S - - -"],
  ["Bilawal scale", "S R G m P D N S' | S' N D P m G R S ||"],
  ["Kalyan scale", "S R G M P D N S' | S' N D P M G R S ||"],
  ["Hot Cross Buns", "G R S - | G R S - | SS SS RR RR | G R S - ||"],
  ["Twinkle Twinkle", "S S P P | D D P - | m m G G | R R S - |\nP P m m | G G R - | P P m m | G G R - |\nS S P P | D D P - | m m G G | R R S - ||"],
  ["Mary Had a Little Lamb", "G R S R | G G G - | R R R - | G P P - |\nG R S R | G G G G | R R G R | S - - - ||"],
  ["Raga Bhupali: aroh + avroh", "S R G P D S' - - | S' D P G R S - - ||"],
  ["Raga Yaman: aroh + avroh", ".N R G M D N S' - | S' N D P M G R S ||"],
];

// Grid cells to notation: one note per beat, "-" holds the previous note, "_" is a rest; a bar
// line every four beats.
export function gridNotation(cells) {
  return cells.map((c, i) => (c === null ? "_" : c === "hold" ? "-" : codeOf(c)) + ((i + 1) % 4 === 0 && i < cells.length - 1 ? " |" : "")).join(" ") + " ||";
}

export async function render(main, ctx) {
  const params = (ctx && ctx.params) || [];
  const page = h("div", { class: "page composepage", dataset: { noswipe: "1" } });
  main.append(page);
  document.documentElement.classList.add("fullfocus");
  const cleanups = [() => document.documentElement.classList.remove("fullfocus")];
  let beats = 16, cells = Array(beats).fill(null), notes = SETS[0][1], stopPlay = null, bench = null;
  let editing = null;
  let mode = "grid"; // "grid" or "text"

  // --- Controls ---
  const setSel = h("select", { class: "input", "aria-label": "Notes", style: { width: "auto" } }, SETS.map(([l], i) => h("option", { value: "set:" + i }, l)));
  const lenSel = h("select", { class: "input", "aria-label": "Length", style: { width: "auto" } }, [8, 16, 24, 32].map(n => h("option", { value: String(n) }, n + " beats")));
  lenSel.value = "16";
  const bpmIn = h("input", { class: "input", type: "number", min: "40", max: "160", step: "4", value: String(DEFAULT_BPM), "aria-label": "Tempo (BPM)" });
  const tempo = () => Math.min(160, Math.max(40, Math.round(Number(bpmIn.value) || DEFAULT_BPM)));

  // Ragas from the raga index
  fetchDoc("ragas/README.md").then(async readme => {
    const files = [...readme.matchAll(/\]\(([a-z-]+\.md)\)/g)].map(m => m[1]).filter((f, i, a) => a.indexOf(f) === i);
    for (const f of files) {
      const md = await fetchDoc("ragas/" + f).catch(() => "");
      const info = md ? ragaInfo(md) : null, name = (/^# (?:Raga )?(.+)$/m.exec(md) || [])[1];
      if (info && info.notes.length >= 4 && name) setSel.append(h("option", { value: "raga:" + [...new Set(info.notes.map(n => ((n % 12) + 12) % 12))].join(",") }, "Raga " + name.replace(/\s*\(.*\)/, "")));
    }
  }).catch(() => {});

  // --- Grid mode ---
  const grid = h("div", { class: "cgrid", role: "group", "aria-label": "Melody grid: rows are notes, columns are beats. Arrow keys move between cells." });
  const out = h("pre", { class: "mono small cout" });
  const gridWrap = h("div", { class: "cwrap" }, grid);

  const rows = () => { const pcs = notes; const r = []; for (const o of [12, 0, -12]) for (const p of pcs.slice().reverse()) { const s = p + o; if (s >= -5 && s <= 12) r.push(s); } return r; };
  const refocus = (row, i) => { const r = grid.querySelector(`.crow[data-row="${row}"]`); const b = r && r.querySelectorAll(".ccell")[i]; if (b) b.focus(); };
  const noteMark = (s, on) => on ? h("span", { class: "cmark" }, noteLabel(s)) : null;

  function draw() {
    const rs = rows();
    grid.style.setProperty("--beats", String(beats));
    // Beat numbers header row
    const beatNums = h("div", { class: "crow crow-header", "data-row": "header" },
      h("span", { class: "clabel" }),
      ...Array.from({ length: beats }, (_, i) => h("span", { class: "ccell-num" + (i % 4 === 0 ? " bar" : "") }, String(i + 1))));
    // Note rows, grouped by octave
    const noteRows = [];
    let lastOct = null;
    for (const s of rs) {
      const oct = Math.floor(s / 12);
      if (lastOct !== null && oct !== lastOct) {
        noteRows.push(h("div", { class: "crow crow-sep", "data-row": "sep" }, h("span", { class: "clabel small muted" }, oct < 0 ? "mandra" : oct === 0 ? "madhya" : "taar")));
      }
      lastOct = oct;
      noteRows.push(h("div", { class: "crow", "data-row": String(s) }, h("span", { class: "clabel" }, noteLabel(s)),
        ...cells.map((c, i) => h("button", { type: "button", class: "ccell" + (c === s ? " on" : "") + (i % 4 === 0 ? " bar" : ""), "aria-label": codeOf(s) + " on beat " + (i + 1), "aria-pressed": String(c === s),
          onclick: () => { cells[i] = cells[i] === s ? null : s; draw(); refocus(String(s), i); } }, noteMark(s, c === s)))));
    }
    // Hold row
    noteRows.push(h("div", { class: "crow", "data-row": "hold" }, h("span", { class: "clabel small" }, "hold"), ...cells.map((c, i) => h("button", { type: "button", class: "ccell hold" + (c === "hold" ? " on" : "") + (i % 4 === 0 ? " bar" : ""), "aria-label": "Hold on beat " + (i + 1), onclick: () => { cells[i] = cells[i] === "hold" ? null : "hold"; draw(); refocus("hold", i); } }))));
    grid.replaceChildren(beatNums, ...noteRows);
    out.textContent = gridNotation(cells);
    // Sync text editor if open
    if (mode === "text") textArea.value = gridNotation(cells);
  }

  // Arrow keys for grid navigation
  grid.addEventListener("keydown", e => {
    const cell = e.target.closest && e.target.closest(".ccell"); if (!cell) return;
    const rowsEl = [...grid.querySelectorAll(".crow:not(.crow-header):not(.crow-sep)")], r = rowsEl.findIndex(x => x.contains(cell)), c = [...rowsEl[r].querySelectorAll(".ccell")].indexOf(cell);
    const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const nr = Math.max(0, Math.min(rowsEl.length - 1, r + d[0])), nc = Math.max(0, Math.min(beats - 1, c + d[1]));
    const next = rowsEl[nr].querySelectorAll(".ccell")[nc]; if (next) next.focus();
  });

  // --- Text mode ---
  const textArea = h("textarea", { class: "input compose-text mono", rows: "5", placeholder: "Type sargam notation here, e.g.:\nS R G m P D N S' | S' N D P m G R S ||\n\nUse: S R G m M P D N (notes), ' for taar, . prefix for mandra\n- hold, _ rest, | bar, || end, , breath\nSR = two notes per beat, SRGM = four per beat" });
  const textWrap = h("div", { class: "compose-textwrap", hidden: true }, textArea);
  const textOut = h("pre", { class: "mono small cout", hidden: true });

  // --- Mode toggle ---
  const modeBtn = h("button", { type: "button", class: "btn compose-mode" }, icon("file"), " Text mode");
  modeBtn.addEventListener("click", () => {
    if (mode === "grid") {
      mode = "text";
      textArea.value = gridNotation(cells);
      gridWrap.hidden = true;
      out.hidden = true;
      textWrap.hidden = false;
      textOut.hidden = false;
      lenSel.disabled = true;
      modeBtn.replaceChildren(icon("note"), " Grid mode");
      updateTextOut();
    } else {
      mode = "grid";
      gridWrap.hidden = false;
      out.hidden = false;
      textWrap.hidden = true;
      textOut.hidden = true;
      lenSel.disabled = false;
      modeBtn.replaceChildren(icon("file"), " Text mode");
    }
  });

  function updateTextOut() {
    const text = textArea.value.trim();
    if (!text) { textOut.textContent = ""; return; }
    const parsed = parseNotation(text);
    const beatCount = parsed.tokens.filter(t => t.type === "beat").length;
    const noteCount = parsed.tokens.filter(t => t.type === "beat").reduce((s, t) => s + t.items.filter(i => i.semi !== undefined).length, 0);
    textOut.textContent = beatCount + " beat" + (beatCount === 1 ? "" : "s") + ", " + noteCount + " note" + (noteCount === 1 ? "" : "s");
    if (parsed.skipped.length) textOut.textContent += " (skipped: " + parsed.skipped.join(", ") + ")";
  }
  textArea.addEventListener("input", updateTextOut);

  // --- Play/stop ---
  const playBtn = h("button", { type: "button", class: "btn primary" }, icon("play"), " Play");
  const stopIt = () => { if (stopPlay) { stopPlay(); stopPlay = null; } playBtn.replaceChildren(icon("play"), " Play"); };
  const currentNotation = () => mode === "text" ? textArea.value.trim() : gridNotation(cells);
  const play = () => {
    if (stopPlay) { stopIt(); return; }
    const notation = currentNotation();
    if (!notation) { toast("Write some notes first."); return; }
    const bpm = tempo(), b = buildEvents(parseNotation(notation).tokens, bpm);
    if (!b.ev.length) { toast("No playable notes found."); return; }
    stopPlay = playEvents(b.ev, b.beats, { bpm, click: true, onEnd: () => { stopPlay = null; playBtn.replaceChildren(icon("play"), " Play"); } });
    playBtn.replaceChildren(icon("stop"), " Stop");
  };
  playBtn.addEventListener("click", play);
  bpmIn.addEventListener("change", () => { bpmIn.value = String(tempo()); if (stopPlay) { stopIt(); play(); } });
  cleanups.push(() => { stopIt(); if (bench) bench.destroy(); });

  // --- Copy notation ---
  const copyBtn = h("button", { type: "button", class: "btn" }, icon("share"), " Copy");
  copyBtn.addEventListener("click", async () => {
    const text = currentNotation();
    if (!text || text === "_ _ _ _ | _ _ _ _ | _ _ _ _ | _ _ _ _ ||") { toast("Nothing to copy."); return; }
    try { await navigator.clipboard.writeText(text); toast("Notation copied."); } catch (e) { toast("Could not copy: select and copy manually."); }
  });

  // --- Templates ---
  const templateSel = h("select", { class: "input", "aria-label": "Templates", style: { width: "auto" } }, h("option", { value: "" }, "Templates..."), TEMPLATES.map(([label], i) => h("option", { value: String(i) }, label)));
  templateSel.addEventListener("change", () => {
    const i = Number(templateSel.value);
    if (isNaN(i)) { templateSel.value = ""; return; }
    const notation = TEMPLATES[i][1];
    if (mode === "text") {
      textArea.value = notation || "";
      updateTextOut();
    } else {
      // For grid mode, parse and populate cells (only the notes that fit one-per-beat)
      if (!notation) { cells = Array(beats).fill(null); draw(); }
      else {
        const parsed = parseNotation(notation);
        const newCells = [];
        for (const tk of parsed.tokens) {
          if (tk.type !== "beat") continue;
          const first = tk.items.find(it => it.semi !== undefined);
          if (first) newCells.push(first.semi);
          else if (tk.items.some(it => it.hold)) newCells.push("hold");
          else if (tk.items.some(it => it.rest)) newCells.push(null);
          else newCells.push(null);
        }
        // Adjust beat count to fit
        const newLen = [8, 16, 24, 32].find(n => n >= newCells.length) || 32;
        beats = newLen;
        lenSel.value = String(beats);
        cells = newCells.slice(0, beats).concat(Array(Math.max(0, beats - newCells.length)).fill(null));
        // Try to detect the right scale
        const pcs = [...new Set(newCells.filter(c => typeof c === "number").map(c => pcOf(c)))];
        const match = SETS.findIndex(([, s]) => pcs.every(p => s.includes(p)));
        if (match >= 0) { setSel.value = "set:" + match; notes = SETS[match][1]; }
        draw();
      }
    }
    templateSel.value = "";
  });

  // --- Clear ---
  const clearBtn = h("button", { type: "button", class: "btn" }, "Clear");
  let clearTimer = 0;
  const disarm = () => { clearTimeout(clearTimer); clearBtn.dataset.armed = ""; clearBtn.classList.remove("danger"); clearBtn.textContent = "Clear"; };
  clearBtn.addEventListener("click", () => {
    if (mode === "text") {
      if (!textArea.value.trim()) { toast("Already empty."); return; }
      if (clearBtn.dataset.armed !== "1") {
        clearBtn.dataset.armed = "1"; clearBtn.classList.add("danger"); clearBtn.textContent = "Tap again to clear";
        clearTimer = setTimeout(disarm, 4000); return;
      }
      disarm(); stopIt(); textArea.value = ""; updateTextOut(); return;
    }
    if (!cells.some(c => c !== null)) { toast("The grid is already empty."); return; }
    if (clearBtn.dataset.armed !== "1") {
      clearBtn.dataset.armed = "1"; clearBtn.classList.add("danger"); clearBtn.textContent = "Tap again to clear";
      clearTimer = setTimeout(disarm, 4000); return;
    }
    disarm(); stopIt();
    cells = Array(beats).fill(null); draw();
  });
  cleanups.push(() => clearTimeout(clearTimer));

  // --- Saved melodies ---
  const melodyNotes = () => mode === "text" ? parseNotation(textArea.value).tokens.filter(t => t.type === "beat").flatMap(t => t.items.filter(i => i.semi !== undefined).map(i => i.semi)) : cells.filter(c => typeof c === "number");
  const nameEl = h("span", { class: "small muted composename" });
  const benchHost = h("div", { class: "toolhost", hidden: true });
  const saved = h("div", { class: "hublist" });

  function openSaved(i) {
    const m = store(SAVED, [])[i];
    if (!m) return false;
    editing = i; stopIt();
    if (m.text && mode === "text") {
      textArea.value = m.text;
      updateTextOut();
    } else if (m.text) {
      // Switch to text mode if the saved melody has text notation
      modeBtn.click();
      textArea.value = m.text;
      updateTextOut();
    } else if (Array.isArray(m.cells)) {
      if (mode === "text") modeBtn.click(); // switch back to grid
      beats = m.cells.length; lenSel.value = String(beats); cells = m.cells.slice();
    } else return false;
    bpmIn.value = String(m.bpm || DEFAULT_BPM);
    nameEl.textContent = m.name;
    draw(); drawSaved();
    return true;
  }

  function saveIt() {
    const l = store(SAVED, []);
    const notation = currentNotation();
    const entry = { bpm: tempo(), notation };
    if (mode === "text") {
      entry.text = textArea.value.trim();
    } else {
      entry.cells = cells.slice();
    }
    let name;
    if (editing !== null && l[editing]) {
      name = l[editing].name; l[editing] = Object.assign({}, l[editing], entry); storeSet(SAVED, l); toast("Saved: " + name + ".");
    } else {
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
      const hasText = !!m.text;
      const info = hasText ? "text" : ((m.cells ? m.cells.length : 16) + " beats");
      return h("div", { class: "hubrow composerow" + (editing === i ? " current" : "") },
        h("span", { class: "stack" }, h("b", null, m.name), h("span", { class: "small muted" }, info)),
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
    h("p", { class: "small muted compose-hint" }, "Tap notes on the grid, or switch to text mode to type sargam notation directly (supports subdivision, holds, rests, breath marks and bar lines)."),
    h("section", { class: "card stack" },
      h("div", { class: "row compose-controls" },
        h("label", { class: "field" }, "Notes", setSel),
        h("label", { class: "field" }, "Length", lenSel),
        templateSel,
        modeBtn),
      gridWrap, out,
      textWrap, textOut,
      h("div", { class: "row composectl" }, playBtn, copyBtn, clearBtn, h("label", { class: "field composebpm" }, "Tempo (BPM)", bpmIn)),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn", onclick: () => {
          if (bench) { bench.destroy(); bench = null; benchHost.hidden = true; return; }
          stopIt();
          bench = mountBench(benchHost, { compact: true, tabs: ["play"], tab: "play", notation: currentNotation(), bpm: tempo(), checkMe: true, title: nameEl.textContent || "My melody" });
          benchHost.hidden = false;
        } }, "Play along"),
        h("button", { type: "button", class: "btn", onclick: async () => {
          const p = melodyNotes(); if (p.length < 2) { toast("A challenge needs at least two notes."); return; }
          const link = challengeLink({ g: "phrase", p: p.slice(0, 32), by: store("bansuri.share.name", "") });
          try { if (navigator.share) await navigator.share({ title: "Can you play my tune?", url: link }); else { await navigator.clipboard.writeText(link); toast("Challenge link copied."); } } catch (e) { toast("Copy this link: " + link); }
        } }, "Challenge a friend")),
      benchHost),
    h("section", { class: "card hubgroup" }, h("h2", { class: "grouphead" }, "Saved melodies"), saved));

  draw();
  if (params[0] !== undefined && !openSaved(Number(params[0]))) toast("That melody is no longer saved.");
  drawSaved();
  return () => cleanups.forEach(f => f());
}
