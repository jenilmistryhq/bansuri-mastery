// Teacher review without a server: the student's request and the teacher's feedback each travel
// inside a link (#/review/<data>, #/feedback/<data>), compressed like the transfer link (move.js).
// The recording goes alongside through the phone's share sheet (or as a downloaded file). Feedback
// received is kept in this browser (bansuri.feedback, in backups) and shown on Today and Progress.
import { store, storeSet, today } from "./util.js";

const b64url = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64url = str => Uint8Array.from(atob(str.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

export async function encodeLink(obj) {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream !== "undefined") return "z" + b64url(await pipe(json, new CompressionStream("gzip")));
  return "j" + b64url(json);
}
export async function decodeLink(data) {
  const bytes = unb64url(data.slice(1));
  const raw = data[0] === "z" ? await pipe(bytes, new DecompressionStream("gzip")) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}
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
export const requests = () => store(REQ, []);
export function addRequest(r) { const l = requests(); l.unshift(r); storeSet(REQ, l.slice(0, 40)); }
export const feedback = () => store(FB, []);
// Checked and trimmed like any data from a link; a newer reply to the same request replaces it.
export function addFeedback(f) {
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
