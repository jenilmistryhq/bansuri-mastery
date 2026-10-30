// Make a melody (#/compose): tap notes on a grid of beats, using only a raga's (or a note set's)
// notes, then play it, play along with it, save it, or send it to a friend as a challenge.
import { h, store, storeSet, toast } from "../util.js";
import { codeOf } from "../core/theory.js";
import { parseNotation, buildEvents, playEvents } from "../core/notation.js";
import { mountBench } from "../bench/bench.js";
import { fetchDoc } from "../content.js";
import { ragaInfo } from "./reader.js";
import { challengeLink } from "./play.js";

const SETS = [["Bilawal (major)", [0, 2, 4, 5, 7, 9, 11]], ["S R G P D (pentatonic)", [0, 2, 4, 7, 9]], ["Kalyan", [0, 2, 4, 6, 7, 9, 11]]];

// Grid cells to notation: one note per beat, "-" holds the previous note, "_" is a rest; a bar
// line every four beats.
export function gridNotation(cells) {
  return cells.map((c, i) => (c === null ? "_" : c === "hold" ? "-" : codeOf(c)) + ((i + 1) % 4 === 0 && i < cells.length - 1 ? " |" : "")).join(" ") + " ||";
}

export async function render(main) {
  const page = h("div", { class: "page" });
  main.append(page);
  const cleanups = [];
  let beats = 16, cells = Array(beats).fill(null), notes = SETS[0][1], stopPlay = null, bench = null;
  const setSel = h("select", { class: "input", "aria-label": "Notes", style: { width: "auto" } }, SETS.map(([l], i) => h("option", { value: "set:" + i }, l)));
  const lenSel = h("select", { class: "input", "aria-label": "Length", style: { width: "auto" } }, [8, 16, 24, 32].map(n => h("option", { value: String(n) }, n + " beats")));
  lenSel.value = "16";
  const grid = h("div", { class: "cgrid", role: "grid", "aria-label": "Melody grid: rows are notes, columns are beats" });
  const out = h("pre", { class: "mono small cout" });
  const benchHost = h("div", { class: "toolhost", hidden: true });
  const saved = h("div", { class: "stack" });

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
  function draw() {
    const rs = rows();
    grid.style.setProperty("--beats", String(beats));
    grid.replaceChildren(...rs.map(s => h("div", { class: "crow", role: "row" }, h("span", { class: "clabel mono" }, codeOf(s)),
      ...cells.map((c, i) => h("button", { type: "button", class: "ccell" + (c === s ? " on" : "") + (i % 4 === 0 ? " bar" : ""), "aria-label": codeOf(s) + " on beat " + (i + 1), "aria-pressed": String(c === s),
        onclick: () => { cells[i] = cells[i] === s ? null : s; draw(); } })))),
      h("div", { class: "crow", role: "row" }, h("span", { class: "clabel small" }, "hold"), ...cells.map((c, i) => h("button", { type: "button", class: "ccell hold" + (c === "hold" ? " on" : "") + (i % 4 === 0 ? " bar" : ""), "aria-label": "Hold on beat " + (i + 1), onclick: () => { cells[i] = cells[i] === "hold" ? null : "hold"; draw(); } }))));
    out.textContent = gridNotation(cells);
  }
  const play = () => {
    if (stopPlay) { stopPlay(); stopPlay = null; return; }
    const b = buildEvents(parseNotation(gridNotation(cells)).tokens, 72);
    if (!b.ev.length) { toast("Tap some notes on the grid first."); return; }
    stopPlay = playEvents(b.ev, b.beats, { bpm: 72, click: true, onEnd: () => { stopPlay = null; } });
  };
  cleanups.push(() => { if (stopPlay) stopPlay(); if (bench) bench.destroy(); });
  const melodyNotes = () => cells.filter(c => typeof c === "number");
  function drawSaved() {
    const list = store("bansuri.compose.saved", []);
    saved.replaceChildren(...(list.length ? list.map((m, i) => h("div", { class: "row between" }, h("span", null, h("b", null, m.name + " "), h("span", { class: "mono small" }, m.notation)),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn small", onclick: () => { beats = m.cells.length; lenSel.value = String(beats); cells = m.cells.slice(); draw(); } }, "Open"),
        h("button", { type: "button", class: "btn small ghost", onclick: () => { const l = store("bansuri.compose.saved", []); l.splice(i, 1); storeSet("bansuri.compose.saved", l); drawSaved(); } }, "Delete")))) : [h("p", { class: "small muted" }, "Melodies you save appear here.")]));
  }
  setSel.addEventListener("change", () => { const v = setSel.value; notes = v.startsWith("set:") ? SETS[Number(v.slice(4))][1] : v.slice(5).split(",").map(Number); cells = cells.map(c => typeof c === "number" && !notes.includes(((c % 12) + 12) % 12) ? null : c); draw(); });
  lenSel.addEventListener("change", () => { beats = Number(lenSel.value); cells = cells.slice(0, beats).concat(Array(Math.max(0, beats - cells.length)).fill(null)); draw(); });

  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Make a melody"), h("h1", null, "Compose your own tune"),
    h("p", { class: "muted" }, "Tap one note per beat (rows are notes, columns are beats). Only the chosen raga's notes are offered, so the tune always stays in the raga. Then play it, play along with it, or send it to a friend.")),
    h("section", { class: "card" }, h("div", { class: "row" }, h("label", { class: "field" }, "Notes", setSel), h("label", { class: "field" }, "Length", lenSel)),
      h("div", { class: "cwrap" }, grid), out,
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn primary", onclick: play }, "Play / stop"),
        h("button", { type: "button", class: "btn", onclick: () => { if (bench) { bench.destroy(); bench = null; benchHost.hidden = true; return; } bench = mountBench(benchHost, { compact: true, tabs: ["play"], tab: "play", notation: gridNotation(cells), bpm: 60, checkMe: true, title: "My melody" }); benchHost.hidden = false; } }, "Play along"),
        h("button", { type: "button", class: "btn", onclick: () => { const name = "Melody " + (store("bansuri.compose.saved", []).length + 1); const l = store("bansuri.compose.saved", []); l.push({ name, cells: cells.slice(), notation: gridNotation(cells) }); storeSet("bansuri.compose.saved", l.slice(-20)); drawSaved(); toast("Saved as " + name + "."); } }, "Save"),
        h("button", { type: "button", class: "btn", onclick: async () => {
          const p = melodyNotes(); if (p.length < 2) { toast("A challenge needs at least two notes."); return; }
          const link = challengeLink({ g: "phrase", p: p.slice(0, 32), by: store("bansuri.share.name", "") });
          try { if (navigator.share) await navigator.share({ title: "Can you play my tune?", url: link }); else { await navigator.clipboard.writeText(link); toast("Challenge link copied."); } } catch (e) { toast("Copy this link: " + link); }
        } }, "Challenge a friend")),
      benchHost),
    h("section", { class: "card" }, h("h2", null, "Saved melodies"), saved));
  draw(); drawSaved();
  return () => cleanups.forEach(f => f());
}
