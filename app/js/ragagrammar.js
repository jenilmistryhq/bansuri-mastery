// Raga grammar from a raga card, and a check of an improvisation against it (Jam with the band).
// From the card's table: the notes allowed going up (every form given in the Aroh cell), going
// down (the Avroh cell), and the strong notes to rest on (Sa, Pa when in the raga, the vadi and the
// samvadi). The check: where the player rested (held a note a second or more), and notes played in
// a direction the raga does not use them. It is a guide: ragas have exceptions a card's table does
// not show (vakra phrases, a note used only in one phrase), so it reports, it does not score.
import { parseNotation } from "./core/notation.js";

const pc = s => ((s % 12) + 12) % 12;
const NAMES = { Sa: [0], Re: [1, 2], Ga: [3, 4], Ma: [5, 6], Pa: [7], Dha: [8, 9], Ni: [10, 11] };

function cell(md, name) { const m = new RegExp("^\\|\\s*" + name + "[^|]*\\|\\s*(.+?)\\s*\\|\\s*$", "m").exec(md); return m ? m[1] : ""; }
function notesOf(text) {
  const out = new Set();
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    const p = parseNotation(m[1]);
    for (const tk of p.tokens) if (tk.type === "beat") for (const it of tk.items) if (it.semi !== undefined) out.add(pc(it.semi));
  }
  return [...out].sort((a, b) => a - b);
}

export function ragaGrammar(md) {
  const aroh = notesOf(cell(md, "Aroh")), avroh = notesOf(cell(md, "Avroh"));
  const all = [...new Set(aroh.concat(avroh))].sort((a, b) => a - b);
  const strong = new Set([0]);
  if (all.includes(7)) strong.add(7);
  for (const name of (cell(md, "Vadi") .match(/\b(Sa|Re|Ga|Ma|Pa|Dha|Ni)\b/g) || [])) for (const c of NAMES[name]) if (all.includes(c)) strong.add(c);
  return { aroh, avroh, notes: all, strong: [...strong].sort((a, b) => a - b) };
}

// notes: [{ semi, t0 }] in order (t0 in seconds); end: when playing stopped. Returns what the
// player rested on and the direction slips.
export function alapCheck(notes, g, end) {
  const rests = [], weak = {}, up = {}, down = {};
  notes.forEach((n, i) => {
    const dur = (i + 1 < notes.length ? notes[i + 1].t0 : end) - n.t0;
    if (dur >= 1) { rests.push(n.semi); if (!g.strong.includes(pc(n.semi))) weak[pc(n.semi)] = (weak[pc(n.semi)] || 0) + 1; }
    if (!i || !g.notes.includes(pc(n.semi)) || pc(n.semi) === 0) return;
    const prev = notes[i - 1].semi;
    if (n.semi > prev && g.aroh.length && !g.aroh.includes(pc(n.semi))) up[pc(n.semi)] = (up[pc(n.semi)] || 0) + 1;
    if (n.semi < prev && g.avroh.length && !g.avroh.includes(pc(n.semi))) down[pc(n.semi)] = (down[pc(n.semi)] || 0) + 1;
  });
  return { rests: rests.length, strongRests: rests.length - Object.values(weak).reduce((a, b) => a + b, 0), weak, up, down };
}
