// Teacher review (#/review and #/review/<data>). Without data: the student asks for a review (what,
// a question, the recording); the request goes as a link, the recording beside it through the share
// sheet. With data: the teacher's side, a rubric (review.js RUBRIC) with comments and a practice
// task, which becomes a reply link (#/feedback/<data>, views/feedback.js).
import { h, toast, today, icon, addDays } from "../util.js";
import { RUBRIC, encodeLink, decodeLink, linkTo, addRequest } from "../review.js";
import { takeHandoff } from "../reviewhandoff.js";

const WHAT = ["Tone check (a held note)", "A song", "A raga (alap, phrases or a composition)", "An exercise or alankar", "Something else"];

async function shareOrCopy(text, link, file) {
  const msg = text + "\n" + link;
  try {
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: msg }); return "shared"; }
    if (!file && navigator.share) { await navigator.share({ text: msg }); return "shared"; }
  } catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
  try { await navigator.clipboard.writeText(msg); } catch (e) { /* shown below */ }
  if (file) { const url = URL.createObjectURL(file), a = h("a", { href: url, download: file.name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
  return "copied";
}

export async function render(main, { params }) {
  const page = h("div", { class: "page reviewpage" });
  main.append(page);
  if (params && params[0]) return teacherSide(page, params[0]);

  // ---- The student's request ----
  const hand = takeHandoff();
  const whatSel = h("select", { class: "input", "aria-label": "What to review" }, WHAT.map(w => h("option", { value: w }, w)));
  if (hand && hand.what) whatSel.value = WHAT[0];
  const titleIn = h("input", { class: "input", maxlength: "80", placeholder: "Which one? For example: Raga Yaman alap, or Tum Hi Ho", value: hand && hand.title ? hand.title : "", "aria-label": "Title" });
  const qIn = h("textarea", { class: "input", rows: "3", maxlength: "600", placeholder: "Your question: what should your teacher listen for?", "aria-label": "Your question" });
  const nameIn = h("input", { class: "input", maxlength: "40", placeholder: "Your name", "aria-label": "Your name" });
  let file = hand && hand.file ? hand.file : null;
  const fileIn = h("input", { type: "file", accept: "audio/*,video/*", class: "sr-only", id: "rv-file", "aria-label": "Recording" });
  const fileLabel = h("span", { class: "small muted" }, file ? "Recording: " + file.name : "No recording chosen yet.");
  fileIn.addEventListener("change", () => { if (fileIn.files[0]) { file = fileIn.files[0]; fileLabel.textContent = "Recording: " + file.name; } });
  const send = h("button", { type: "button", class: "btn primary", onclick: async () => {
    const req = { v: 1, kind: "review", id: "rq" + Date.now().toString(36), date: today(), name: nameIn.value.trim().slice(0, 40), what: whatSel.value + (titleIn.value.trim() ? ": " + titleIn.value.trim() : ""), question: qIn.value.trim().slice(0, 600), measures: hand && hand.measures ? hand.measures : null };
    const link = linkTo("review", await encodeLink(req));
    addRequest({ id: req.id, date: req.date, what: req.what });
    const how = await shareOrCopy("Please review my bansuri: " + req.what + (file ? " (recording attached)" : ""), link, file);
    toast(how === "shared" ? "Sent. Your teacher opens the link, listens and fills in the review." : how === "copied" ? "The link is copied" + (file ? " and the recording downloaded: send both to your teacher." : ": send it to your teacher with the recording.") : "Not sent.");
  } }, icon("share"), " Send to my teacher");
  page.append(
    h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Teacher review"), h("h1", null, "Ask your teacher to review"),
      h("p", { class: "muted" }, "Send a recording and a question. Your teacher opens the link on any phone or computer, listens, and rates you on the same seven points every time; the reply link brings the review and a practice task back into the app. Nothing goes through a server.")),
    h("section", { class: "card" }, h("h2", null, "What to review"),
      h("label", { class: "field" }, "What it is", whatSel), titleIn, qIn, nameIn,
      h("div", { class: "row" }, h("label", { class: "btn", for: "rv-file" }, icon("mic"), " Choose the recording"), fileIn, fileLabel),
      hand && hand.measures ? h("p", { class: "small muted" }, "The Tone check's measurements go with the request.") : null,
      h("p", { class: "small muted" }, "Record yourself in the Journal (video shows posture too), or use a recording from Tone check."),
      send),
    h("section", { class: "card" }, h("h2", null, "What your teacher rates"),
      h("ul", null, RUBRIC.map(r => h("li", null, h("b", null, r.name), ": from \"" + r.levels[0] + "\" (1) to \"" + r.levels[4] + "\" (5)")))));
  return undefined;
}

// ---- The teacher's side ----
async function teacherSide(page, data) {
  let req;
  try { req = await decodeLink(data); } catch (e) { req = null; }
  if (!req || req.kind !== "review") { page.append(h("section", { class: "card" }, h("h1", null, "This review link could not be read"), h("p", null, "Ask for the link again: it may have been cut short."))); return undefined; }
  const scores = {}, notes = {};
  const player = h("audio", { controls: true, class: "rvplayer" });
  player.preservesPitch = true;
  const fileIn = h("input", { type: "file", accept: "audio/*,video/*", "aria-label": "The student's recording" });
  fileIn.addEventListener("change", () => { if (fileIn.files[0]) player.src = URL.createObjectURL(fileIn.files[0]); });
  const rate = h("select", { class: "input", "aria-label": "Speed", onchange: e => { player.playbackRate = Number(e.target.value); } }, [1, 0.75, 0.5].map(v => h("option", { value: String(v) }, Math.round(v * 100) + "%")));
  const rows = RUBRIC.map(r => {
    const name = "rv-" + r.key;
    const radios = r.levels.map((l, i) => {
      const id = name + "-" + (i + 1), inp = h("input", { type: "radio", name, id, value: String(i + 1) });
      inp.addEventListener("change", () => { scores[r.key] = i + 1; });
      return h("label", { class: "rvlevel", for: id }, inp, h("b", null, String(i + 1)), " " + l);
    });
    const note = h("input", { class: "input", maxlength: "400", placeholder: "A note on " + r.name.toLowerCase() + " (optional)", "aria-label": "Note: " + r.name });
    note.addEventListener("input", () => { notes[r.key] = note.value; });
    return h("fieldset", { class: "rvrow" }, h("legend", null, r.name), h("div", { class: "rvlevels" }, radios), note);
  });
  const comment = h("textarea", { class: "input", rows: "4", maxlength: "2000", placeholder: "What went well, and the one thing to change first", "aria-label": "Comment" });
  const task = h("textarea", { class: "input", rows: "3", maxlength: "600", placeholder: "Practice task until the next review (what, how long, how often)", "aria-label": "Practice task" });
  const dueSel = h("select", { class: "input", "aria-label": "Next review in" }, [3, 7, 14, 30].map(d => h("option", { value: String(d) }, d + " days")));
  dueSel.value = "7";
  const tName = h("input", { class: "input", maxlength: "60", placeholder: "Your name (the teacher)", "aria-label": "Teacher's name" });
  const make = h("button", { type: "button", class: "btn primary", onclick: async () => {
    if (!Object.keys(scores).length && !comment.value.trim()) { toast("Rate at least one point or write a comment."); return; }
    const fb = { v: 1, kind: "feedback", id: req.id, date: today(), teacher: tName.value.trim(), what: req.what, scores, notes, comment: comment.value.trim(), task: task.value.trim(), due: addDays(today(), Number(dueSel.value)) };
    const link = linkTo("feedback", await encodeLink(fb));
    const how = await shareOrCopy("Your bansuri review" + (req.name ? ", " + req.name : "") + ":", link, null);
    toast(how === "shared" ? "Sent." : how === "copied" ? "The reply link is copied: send it to your student." : "Not sent.");
  } }, icon("share"), " Send the review");
  const m = req.measures;
  page.append(
    h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Review for a student"), h("h1", null, (req.name ? req.name + ": " : "") + req.what),
      req.question ? h("p", null, h("b", null, "Their question: "), req.question) : null,
      h("p", { class: "small muted" }, "Asked " + req.date + ". Open the recording they sent, listen (slower if you like), rate the seven points and give one practice task.")),
    h("section", { class: "card" }, h("h2", null, "The recording"), fileIn, h("div", { class: "row" }, player, h("label", { class: "field" }, "Speed", rate)),
      m ? h("p", { class: "small" }, "Measured by the app on a held " + (m.noteName || "note") + ": pitch wavers " + m.pitchSD + " cents, loudness " + m.levelCV + "%, breath noise " + m.air + "%, settles in " + m.attack + " ms.") : null),
    h("section", { class: "card" }, h("h2", null, "Rate seven points"), h("p", { class: "small muted" }, "Leave a point blank if the recording does not show it (posture needs a video)."), rows),
    h("section", { class: "card" }, h("h2", null, "Comment and practice task"), comment, task, h("label", { class: "field" }, "Next review in", dueSel), tName, make));
  return undefined;
}
