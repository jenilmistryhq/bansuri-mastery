// Notes, names and the 6-hole bansuri fingering chart (Sa = top 3 holes closed).
import { saHz, saMidi, getSettings } from "./settings.js";

export const SEMI = { S: 0, r: 1, R: 2, g: 3, G: 4, m: 5, M: 6, P: 7, d: 8, D: 9, n: 10, N: 11 };
export const LETTERS = ["S", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"];
export const NAME = { S: "Sa", r: "komal Re", R: "Re", g: "komal Ga", G: "Ga", m: "shuddha Ma", M: "tivra Ma", P: "Pa", d: "komal Dha", D: "Dha", n: "komal Ni", N: "Ni" };
export const DEVA = { S: "सा", r: "रे", R: "रे", g: "ग", G: "ग", m: "म", M: "म॑", P: "प", d: "ध", D: "ध", n: "नि", N: "नि" };
export const WEST = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Register-1 fingerings (holes 1-6, X closed, O open, H half) -> semitones from Sa.
export const BASE = { XXXXXX: -5, XXXXXH: -4, XXXXXO: -3, XXXXHO: -2, XXXXOO: -1, XXXOOO: 0, XXHOOO: 1, XXOOOO: 2, XHOOOO: 3, XOOOOO: 4, HOOOOO: 5, OOOOOO: 6 };
export const FING = {};
Object.keys(BASE).forEach(k => { FING[BASE[k]] = k; });

export const DIFF = {
  "-5": "Medium: lowest note, needs a perfect seal", "-4": "Hard", "-3": "Easy-medium", "-2": "Hard", "-1": "Easy",
  "0": "Easiest: your first note", "1": "Hard", "2": "Easy", "3": "Hard", "4": "Easy", "5": "Medium-hard (half-hole)",
  "6": "Easy fingering, tone can be weak", "7": "Medium (overblown)", "8": "Hard", "9": "Medium", "10": "Hard",
  "11": "Medium", "12": "Medium", "13": "Hard", "14": "Medium-hard", "15": "Hard", "16": "Hard", "17": "Hard",
  "18": "Hard (practical ceiling)"
};

export function pcOf(semi) { return ((semi % 12) + 12) % 12; }
export function letterOf(semi) { return LETTERS[pcOf(semi)]; }
export function nameOf(semi) { return NAME[letterOf(semi)]; }

export function codeOf(semi) {
  const oct = Math.floor(semi / 12);
  return (oct < 0 ? ".".repeat(-oct) : "") + letterOf(semi) + (oct > 0 ? "'".repeat(oct) : "");
}

// The note in Devanagari, with Bhatkhande's octave marks: a dot below for mandra, above for taar.
export function devaOf(semi) {
  const oct = Math.floor(semi / 12);
  return DEVA[letterOf(semi)] + (oct < 0 ? "̣".repeat(-oct) : oct > 0 ? "̇".repeat(oct) : "");
}

// A notation token in Devanagari (".P .D S" -> each note converted, other marks kept).
export function devaNotation(text) {
  return String(text).replace(/(\.*)([SrRgGmMPdDnN])('*)/g, (_, lo, l, hi) => devaOf(SEMI[l] + 12 * (hi.length - lo.length)));
}

export function octName(semi) {
  const o = Math.floor(semi / 12);
  return o < 0 ? "mandra" : o === 0 ? "madhya" : o === 1 ? "taar" : "ati-taar";
}

// Fingering and register for a note. reg 0 = below the flute, 3 = third register (not charted).
export function fingOf(semi) {
  if (semi < -5) return { f: null, reg: 0 };
  if (semi <= 6) return { f: FING[semi], reg: 1 };
  if (semi <= 18) return { f: FING[semi - 12], reg: 2 };
  return { f: null, reg: 3 };
}

// The lesson that unlocks a note. 99 = not playable on this flute.
export function lessonFor(s) {
  if (s < -5) return 99;
  const komal = [1, 3, 8, 10].includes(pcOf(s));
  if (s >= 13) return komal ? 25 : 22;
  if (komal) return 25;
  if (s < 0) return 11;
  if (s === 5) return 16;
  if (s >= 6) return 14;
  return 9;
}

// Tuned to the tanpura (just intonation): each swara as a whole-number ratio from Sa (r 16/15,
// R 9/8, g 6/5, G 5/4, m 4/3, M 45/32, P 3/2, d 8/5, D 5/3, n 9/5, N 15/8), in cents from equal
// tuning. These are arithmetic; how far real singers and players go towards them varies
// (studies find Hindustani intonation close to equal tuning, with some swaras shaded by raga).
export const JUST_CENTS = [0, 12, 4, 16, -14, -2, -10, 2, 14, -16, 18, -12];
// The target of a note in the chosen tuning, in cents from equal tuning.
export function tuneCents(semi) {
  let s = null; try { s = getSettings(); } catch (e) { s = null; }
  return s && s.intonation === "just" ? JUST_CENTS[pcOf(Math.round(semi))] : 0;
}

export function hzOf(semi) { return saHz() * Math.pow(2, (semi + tuneCents(semi) / 100) / 12); }

export function westOf(semi) {
  const m = saMidi() + semi;
  return WEST[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}
