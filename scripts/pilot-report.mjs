// Pilot report: many learners' pilot files (Settings > Download my pilot file) into the numbers
// that tune the app: Tone check bands from teachers' ratings, how often the taal and sam found were
// right, and how much of the automatic notation was right as written.
//
//   node scripts/pilot-report.mjs <folder of bansuri-pilot-*.json files> [--md report.md]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Tone check measures, the teacher's rubric point each is checked against, and whether a lower
// value is better (all are).
export const PAIRS = [["pitchSD", "steady"], ["levelCV", "steady"], ["air", "tone"], ["attack", "tone"], ["overshoot", "pitch"]];

// Spearman rank correlation of two equal-length lists (null with fewer than 5 pairs).
export function spearman(a, b) {
  if (a.length < 5) return null;
  const rank = v => { const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]), r = new Array(v.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
  const ra = rank(a), rb = rank(b), n = a.length, ma = (n + 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - ma); da += (ra[i] - ma) ** 2; db += (rb[i] - ma) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : null;
}
const median = v => { const s = v.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };

export function report(files) {
  const out = { learners: new Set(files.map(f => f.id)).size, files: files.length, tone: {}, taal: null, lines: null };
  // Tone: each measure against the teacher's rating of the matching point, and the band limits
  // the ratings suggest (the median measure among checks rated 5, 4 and 3 = excellent, good, fair).
  const pairs = files.flatMap(f => (f.reviews || []).filter(r => r.measures && r.scores));
  for (const [m, point] of PAIRS) {
    const xs = [], ys = [], by = { 5: [], 4: [], 3: [] };
    for (const r of pairs) { const x = r.measures[m], y = r.scores[point]; if (Number.isFinite(x) && Number.isInteger(y)) { xs.push(x); ys.push(y); if (by[y]) by[y].push(x); } }
    const rho = spearman(xs, ys);
    out.tone[m] = { point, n: xs.length, rho: rho === null ? null : Math.round(rho * 100) / 100,
      bands: by[5].length && by[4].length && by[3].length ? [median(by[5]), median(by[4]), median(by[3])] : null };
  }
  // Taal: kept as found (same taal, sam not moved), the taal changed, or only sam moved.
  const taal = files.flatMap(f => (f.logs || []).filter(l => l.kind === "taal" && l.auto));
  if (taal.length) {
    const kept = taal.filter(l => l.chosen === l.auto && !l.samShift).length, samOnly = taal.filter(l => l.chosen === l.auto && l.samShift).length;
    out.taal = { n: taal.length, right: Math.round(kept / taal.length * 100), samMoved: Math.round(samOnly / taal.length * 100), taalChanged: Math.round((taal.length - kept - samOnly) / taal.length * 100) };
  }
  // Notation: lines confirmed as written, by lines and by notes.
  const lines = files.flatMap(f => (f.logs || []).filter(l => l.kind === "line"));
  if (lines.length) {
    const ok = lines.filter(l => !l.fixed), notes = lines.reduce((a, l) => a + (l.notes || 0), 0), okNotes = ok.reduce((a, l) => a + (l.notes || 0), 0);
    out.lines = { n: lines.length, rightLines: Math.round(ok.length / lines.length * 100), rightNotesAtLeast: notes ? Math.round(okNotes / notes * 100) : null };
  }
  return out;
}

export function markdown(r) {
  const L = ["# Pilot report", "", r.learners + " learners, " + r.files + " files.", "", "## Tone check against teachers' ratings", "",
    "| Measure | Rubric point | Pairs | Spearman rho (negative = agrees) | Suggested bands (excellent, good, fair) |", "|---|---|---|---|---|"];
  for (const [m, t] of Object.entries(r.tone)) L.push("| " + m + " | " + t.point + " | " + t.n + " | " + (t.rho === null ? "too few" : t.rho) + " | " + (t.bands ? t.bands.join(", ") : "needs ratings of 3, 4 and 5") + " |");
  L.push("", "## Taal found in recordings", "", r.taal ? r.taal.n + " saved notations: taal and sam right " + r.taal.right + "%, only sam moved " + r.taal.samMoved + "%, taal changed " + r.taal.taalChanged + "%." : "No data yet.");
  L.push("", "## Automatic notation (line-by-line checks)", "", r.lines ? r.lines.n + " lines checked: " + r.lines.rightLines + "% right as written; at least " + r.lines.rightNotesAtLeast + "% of notes (a fixed line can still have most notes right)." : "No data yet.");
  L.push("", "Bands go into app/js/views/tone.js (MEASURES) once a measure agrees with the ratings (rho clearly below 0) and has 20 or more pairs.");
  return L.join("\n") + "\n";
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const dir = process.argv[2];
  if (!dir) { console.log("usage: node scripts/pilot-report.mjs <folder> [--md report.md]"); process.exit(0); }
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { return null; } }).filter(f => f && f.kind === "pilot");
  const md = markdown(report(files)), i = process.argv.indexOf("--md");
  if (i > 0) fs.writeFileSync(process.argv[i + 1], md); else process.stdout.write(md);
}
