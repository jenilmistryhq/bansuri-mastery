// Teacher review without a server: the student's request and the teacher's feedback each travel
// inside a link (#/review/<data>, #/feedback/<data>), compressed like the transfer link (move.js).
// The recording goes alongside through the phone's share sheet (or as a downloaded file). Feedback
// received is kept in this browser (bansuri.feedback, in backups) and shown on Today and Progress.
import { store, storeSet, today } from "./util.js";
import { encodeData, decodeData } from "./linkdata.js";

// A request or a reply is a few kilobytes of text; anything far larger is not one.
const MAX_REVIEW = 256 * 1024;
export const encodeLink = obj => encodeData(obj);
export const decodeLink = data => decodeData(data, MAX_REVIEW);
export const linkTo = (kind, data) => location.origin + location.pathname + "#/" + kind + "/" + data;

// The rubric: what a teacher rates, 1 to 5, each level described so ratings mean the same thing
// from one review to the next.
export const RUBRIC = [
  { key: "tone", name: "Tone", levels: ["Mostly air", "Breathy, thin", "Clear but small", "Full and clear", "Full, warm and focused in every register"] },
  { key: "steady", name: "Breath and steadiness", levels: ["Notes waver or break", "Wavers on long notes", "Steady on short notes", "Steady long notes", "Steady at any length and loudness"] },
  { key: "pitch", name: "Intonation (sur)", levels: ["Often a wrong note", "Right notes, often off pitch", "Mostly in tune", "In tune, half-holes too", "In tune with the raga's own shading"] },
  { key: "laya", name: "Rhythm and taal (laya)", levels: ["Loses the beat", "Uneven", "Keeps the beat", "Steady, lands on sam", "Steady at any speed, with layakari"] },
  { key: "ornaments", name: "Ornaments (meend, kan, andolan)", levels: ["None yet", "Attempted, rough", "Some clean", "Clean and in place", "Natural and expressive"] },
  { key: "phrasing", name: "Phrasing and raga feel", levels: ["Note by note", "Some phrases", "Phrases make sense", "Musical phrasing, raga clear", "Moving, the raga's character comes through"] },
  { key: "posture", name: "Posture and technique (from video)", levels: ["Tense, unsafe habits", "Some tension", "Mostly relaxed", "Relaxed and correct", "Effortless"] },
];

// Requests the student made (so a reply can be matched) and feedback received.
const REQ = "bansuri.review.requests", FB = "bansuri.feedback";
const isObj = x => !!x && typeof x === "object" && !Array.isArray(x);
export const requests = () => store(REQ, []).filter(isObj);
// A request's id is random (not a time), so only someone holding the request link (the teacher it
// was sent to) can make a reply that answers it; the reply page says whether it does.
export function newRequestId() {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return "rq" + btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function addRequest(r) { const l = requests(); l.unshift(r); storeSet(REQ, l.slice(0, 40)); }
export const feedback = () => store(FB, []).filter(isObj).map(f => Object.assign({ scores: {}, notes: {} }, f, { scores: isObj(f.scores) ? f.scores : {}, notes: isObj(f.notes) ? f.notes : {} }));
// Checked and trimmed like any data from a link (a link can come from anyone).
export function cleanFeedback(f) {
  f = isObj(f) ? f : {};
  const clean = {
    id: String(f.id || "").slice(0, 40), date: /^\d{4}-\d{2}-\d{2}$/.test(f.date) ? f.date : today(), teacher: String(f.teacher || "").slice(0, 60),
    what: String(f.what || "").slice(0, 200), comment: String(f.comment || "").slice(0, 2000), task: String(f.task || "").slice(0, 600),
    due: /^\d{4}-\d{2}-\d{2}$/.test(f.due) ? f.due : null, scores: {}, notes: {},
  };
  for (const r of RUBRIC) {
    const v = Number(f.scores && f.scores[r.key]);
    if (Number.isInteger(v) && v >= 1 && v <= 5) clean.scores[r.key] = v;
    if (f.notes && typeof f.notes[r.key] === "string" && f.notes[r.key].trim()) clean.notes[r.key] = f.notes[r.key].slice(0, 400);
  }
  return clean;
}
// Saved only when the learner says so (views/feedback.js); a newer reply to the same request
// replaces the earlier one.
export function addFeedback(f) {
  const clean = cleanFeedback(f);
  const l = feedback().filter(x => !(clean.id && x.id === clean.id));
  l.unshift(clean);
  storeSet(FB, l.slice(0, 60));
  return clean;
}
// The newest assignment not yet marked done, for Today.
export function currentTask() {
  const f = feedback().find(x => x.task && !x.taskDone);
  return f || null;
}
export function markTaskDone(id) { const l = feedback(); for (const x of l) if (x.id === id) x.taskDone = today(); storeSet(FB, l); }
