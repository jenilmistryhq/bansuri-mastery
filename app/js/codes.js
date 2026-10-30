// Course codes, made readable for learners. The course files carry reference codes for the
// curriculum's own bookkeeping: skill codes (FNG-06, TON-02, BRE-01 ...), exercise sets (EX-MEL ...)
// and troubleshooting guides (TS-03). In lessons and session steps the learner sees plain words
// instead; Settings can show the codes again (for teachers).
import { getSettings } from "./core/settings.js";

const EX = { MEL: "practice melodies", EAR: "ear training", RHY: "rhythm exercises", ALK: "alankar exercises", TON: "tone exercises",
  THY: "theory quizzes", NOT: "notation exercises", IMP: "improvisation exercises" };
const SKILL = /^[A-Z]{2,4}-\d{2}$/;

export const codesHidden = () => !getSettings().showCodes;

// "Long tones (TON-02, TON-03)" -> "Long tones"; "(L13, FNG-12)" -> "(L13)"; "EX-MEL 2.1" -> "practice melodies 2.1";
// "TS-03" -> "troubleshooting guide 3".
export function plainCodes(text) {
  if (!text || !codesHidden()) return text;
  let s = String(text).replace(/\s*\(([^()]*)\)/g, (m, inner) => {
    const parts = inner.split(/\s*[,;]\s*/);
    if (!parts.some(p => SKILL.test(p.trim()) && !/^TS-/.test(p.trim()))) return m;
    const keep = parts.filter(p => !(SKILL.test(p.trim()) && !/^TS-/.test(p.trim())));
    return keep.length ? " (" + keep.join(", ") + ")" : "";
  });
  s = s.replace(/\bEX-([A-Z]{3})\b/g, (m, k) => EX[k] ? (EX[k].charAt(0).toUpperCase() + EX[k].slice(1)) : m);
  s = s.replace(/\bTS-0?(\d{1,2})\b/g, "troubleshooting guide $1");
  // A code opening a phrase ("ORN-01, why ornaments are grammar"): drop it, capitalise the rest.
  s = s.replace(/^(\s*)(?!TS-)[A-Z]{2,4}-\d{2}\b[,:]?\s*(\w?)/, (m, sp, c) => sp + c.toUpperCase());
  // A skill code left on its own, e.g. "Step 1: Read the chart FNG-01": drop it.
  s = s.replace(/\s\b(?!TS-)[A-Z]{2,4}-\d{2}\b(?=[\s.,:;]|$)/g, "");
  return s;
}

// Applies plainCodes to every text node under root (not inside code or pre).
export function plainCodesIn(root) {
  if (!codesHidden() || !root) return;
  const w = root.ownerDocument.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const nodes = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) if (!(n.parentElement && n.parentElement.closest("code, pre"))) nodes.push(n);
  for (const n of nodes) { const v = plainCodes(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
}
