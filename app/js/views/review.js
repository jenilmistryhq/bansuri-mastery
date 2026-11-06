// Me > Teacher (#/me/teacher, old #/review): Ask, Feedback (#/me/teacher/feedback), Students
// (#/me/teacher/students, old #/students) and Share progress (#/me/teacher/share).
// Teacher review (#/review and #/review/<data>). Without data: the student asks for a review (what,
// a question, the recording); the request goes as a link, the recording beside it through the share
// sheet. With data: the teacher's side, a rubric (review.js RUBRIC) with comments and a practice
// task, which becomes a reply link (#/feedback/<data>, views/feedback.js).
import { h, toast, today, icon, addDays, store, storeSet } from "../util.js";
import { RUBRIC, encodeLink, decodeLink, linkTo, addRequest, newRequestId, feedback as feedbackList } from "../review.js";
import { takeHandoff } from "../reviewhandoff.js";
import { segNav } from "../segnav.js";
import { errorState } from "../states.js";
import { reviewCard } from "./feedback.js";
import { studentsBody } from "./students.js";
import { encodePayload, sharePayload } from "./progress.js";
import { saveRecording, newId } from "../recorder.js";
import { getState } from "../state.js";
import { backHead } from "../backhead.js";

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

// Me > Teacher has four views (redesign M3): everything that leaves the phone for another person.
const VIEWS = [["ask", "#/me/teacher", "Ask"], ["feedback", "#/me/teacher/feedback", "Feedback"], ["students", "#/me/teacher/students", "Students"], ["share", "#/me/teacher/share", "Share progress"]];

// Feedback: the reviews your teacher sent back (moved here from Progress).
function feedbackView(page) {
  const fbs = feedbackList();
  page.append(h("section", { class: "hero", id: "reviews" }, h("span", { class: "eyebrow" }, "Teacher review"), h("h1", null, "Feedback from your teacher"),
    h("p", { class: "muted" }, "Your teacher's ratings, comments and practice tasks, newest first. They are kept on this device.")));
  if (!fbs.length) {
    page.append(h("section", { class: "card emptycard" }, h("p", { class: "emptystate" }, "No reviews yet. Record yourself and send it to your teacher: their ratings and tasks appear here and on Today."),
      h("a", { class: "btn primary", href: "#/me/teacher" }, "Ask for a review")));
    return undefined;
  }
  page.append(reviewCard(fbs[0], "Latest: " + fbs[0].what));
  const rated = RUBRIC.filter(r => fbs.some(f => f.scores[r.key]));
  if (fbs.length > 1 && rated.length) page.append(h("section", { class: "card" }, h("h2", null, "Each point over time"),
    h("table", { class: "rvtable" }, h("tbody", null, rated.map(r => h("tr", null, h("th", { scope: "row" }, r.name),
      h("td", { class: "mono" }, fbs.slice(0, 6).reverse().map(f => f.scores[r.key] || "-").join("  ")))))),
    h("p", { class: "small muted" }, "Ratings from the oldest to the newest of your last six reviews, 1 to 5.")));
  if (fbs.length > 1) page.append(h("h2", { class: "grouphead" }, "Earlier reviews"),
    ...fbs.slice(1).map(f => h("details", { class: "card" }, h("summary", null, h("b", null, f.what), h("span", { class: "small muted" }, " " + f.date)), reviewCard(f, f.what))));
  return undefined;
}

// Share progress: a link to a progress card, for anyone or with practice details for a teacher (moved
// here from Progress; the link format is unchanged).
function shareView(page) {
  const nameIn = h("input", { class: "input", id: "sh-name", maxlength: "40", placeholder: "Your first name (optional)", value: store("bansuri.shareName", "") });
  const out = h("div", { class: "stack" });
  const teacherBox = h("input", { type: "checkbox", id: "sh-teacher" });
  const make = () => {
    storeSet("bansuri.shareName", nameIn.value.trim());
    const url = location.href.split("#")[0] + "#/share/" + encodePayload(sharePayload(nameIn.value.trim(), teacherBox.checked));
    const linkBox = h("input", { class: "input", readonly: true, value: url, "aria-label": "Share link" });
    const copy = h("button", { type: "button", class: "btn" }, "Copy link");
    copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(url); toast("Link copied."); } catch (e) { linkBox.select(); toast("Select the link and copy it."); } });
    const native = navigator.share ? h("button", { type: "button", class: "btn", onclick: () => navigator.share({ title: "My bansuri progress", url }).catch(() => {}) }, "Share") : null;
    out.replaceChildren(linkBox, h("div", { class: "row" }, copy, native, h("a", { class: "btn", href: "#/share/" + url.split("#/share/")[1] }, "Preview the card")));
  };
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Teacher review"), h("h1", null, "Share your progress"),
    h("p", { class: "muted" }, "Creates a link to a progress card. The data travels inside the link itself; nothing is uploaded. Anyone with the link sees your day, streak, practice time and milestones.")),
    h("section", { class: "card" },
      h("label", { class: "check", for: "sh-teacher" }, teacherBox, "For my teacher: add practice per week and what the microphone measured (long tones, play-along, play back)"),
      h("div", { class: "row" }, h("div", { style: { flex: "1 1 220px" } }, nameIn), h("button", { type: "button", class: "btn primary", onclick: make }, "Create link")), out));
  return undefined;
}

export async function render(main, { params, view: screen }) {
  const page = h("div", { class: "page reviewpage" });
  main.append(page);
  if (screen === "rates") return ratesView(page);
  const p = params && params[0];
  // #/review/<data>: a teacher opening a student's request.
  if (p && !VIEWS.some(v => v[0] === p)) return teacherSide(page, p);
  const view = p || "ask";
  page.append(segNav(VIEWS, view, "Teacher views"));
  if (view === "feedback") return feedbackView(page);
  if (view === "share") return shareView(page);
  if (view === "students") { page.append(...studentsBody()); return undefined; }

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
  // Make the review link (W74), then Copy it or Share it (with the recording, through the share sheet).
  let made = null;
  const out = h("div", { class: "stack rvlinkout", hidden: true });
  const make = h("button", { type: "button", class: "btn primary big", onclick: async () => {
    const req = { v: 1, kind: "review", id: newRequestId(), date: today(), name: nameIn.value.trim().slice(0, 40), what: whatSel.value + (titleIn.value.trim() ? ": " + titleIn.value.trim() : ""), question: qIn.value.trim().slice(0, 600), measures: hand && hand.measures ? hand.measures : null };
    const link = linkTo("review", await encodeLink(req));
    // The recording is kept in the Journal, so the review can be heard next to it when it comes back.
    const rec = file ? await keepForReview(file, req) : null;
    addRequest(Object.assign({ id: req.id, date: req.date, what: req.what, measures: req.measures }, rec ? { rec } : {}));
    made = { text: "Please review my bansuri: " + req.what + (file ? " (recording attached)" : ""), link };
    const box = h("input", { class: "input", readonly: true, value: link, "aria-label": "Review link", onfocus: e => e.target.select() });
    const copy = h("button", { type: "button", class: "btn" }, "Copy");
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(made.text + "\n" + made.link); toast(file ? "The link is copied: send it to your teacher with the recording." : "The link is copied: send it to your teacher."); }
      catch (e) { box.select(); toast("Select the link and copy it."); }
    });
    const share = h("button", { type: "button", class: "btn" }, icon("share"), " ", h("span", null, "Share"));
    share.addEventListener("click", async () => {
      const how = await shareOrCopy(made.text, made.link, file);
      toast(how === "shared" ? "Sent. Your teacher opens the link, listens and fills in the review." : how === "copied" ? "The link is copied" + (file ? " and the recording downloaded: send both to your teacher." : ": send it to your teacher with the recording.") : "Not sent.");
    });
    out.replaceChildren(box, h("div", { class: "row" }, copy, share), h("p", { class: "small muted" }, "Anyone who has this link can read what is in it: send it only to your teacher."));
    out.hidden = false;
  } }, "Make the review link");
  page.append(
    h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Teacher review"), h("h1", null, "Ask your teacher to review"),
      h("p", { class: "muted" }, "Send a recording and a question. Your teacher opens the link on any phone or computer, listens, and rates you on the same seven points every time; the reply link brings the review and a practice task back into the app. Nothing goes through a server.")),
    h("section", { class: "card" }, h("h2", null, "What to review"),
      h("label", { class: "field" }, "What it is", whatSel), titleIn, qIn, nameIn,
      h("div", { class: "row" }, h("label", { class: "btn", for: "rv-file" }, icon("mic"), " Choose the recording"), fileIn, fileLabel),
      hand && hand.measures ? h("p", { class: "small muted" }, "The Tone check's measurements go with the request.") : null,
      h("p", { class: "small muted" }, "Record yourself in the Journal (video shows posture too), or use a recording from Tone check."),
      h("div", { class: "hublist" }, h("a", { class: "hubrow", href: "#/me/teacher/rates" }, h("span", { class: "stack" }, h("b", null, "What your teacher rates"),
        h("span", { class: "small muted" }, "The same seven points every time")), h("span", { class: "chev", "aria-hidden": "true" }, ">"))),
      make, out));
  return undefined;
}

// The recording sent for review, kept in the Journal and marked with the request (W75: Listen).
async function keepForReview(file, req) {
  try {
    const url = URL.createObjectURL(file);
    const durationS = await new Promise(resolve => {
      const m = document.createElement(/^video/.test(file.type) ? "video" : "audio");
      const done = v => { clearTimeout(t); URL.revokeObjectURL(url); resolve(Number.isFinite(v) ? v : 0); };
      const t = setTimeout(() => done(0), 3000);
      m.preload = "metadata"; m.onloadedmetadata = () => done(m.duration); m.onerror = () => done(0); m.src = url;
    });
    const rec = { id: newId(), created: new Date().toISOString(), date: today(), day: getState().current, label: "For review: " + req.what, mime: file.type || "audio/webm",
      blob: file, durationS, kind: /^video/.test(file.type) ? "video" : "audio", review: req.id };
    await saveRecording(rec, { count: false });
    return rec.id;
  } catch (e) { return null; }
}

// What your teacher rates (W74): the seven points, each from 1 to 5.
function ratesView(page) {
  page.append(backHead("#/me/teacher", "Teacher", "What your teacher rates"),
    h("p", { class: "muted" }, "The same seven points every time, each from 1 to 5, so one review can be compared with the next."),
    h("section", { class: "card" }, h("ul", { class: "rvrates" }, RUBRIC.map(r => h("li", null, h("b", null, r.name), ": from \"" + r.levels[0] + "\" (1) to \"" + r.levels[4] + "\" (5)")))));
  return undefined;
}

// ---- The teacher's side ----
async function teacherSide(page, data) {
  let req;
  try { req = await decodeLink(data); } catch (e) { req = null; }
  if (!req || typeof req !== "object" || req.kind !== "review") { page.append(errorState("This review link could not be read", "It may be cut short. Ask for the link again.", "#/me/teacher")); return undefined; }
  // A link can come from anyone: keep only the fields a request has, trimmed to the lengths the
  // student's side allows (very long text would also slow the page down).
  const str = (v, n) => (v == null ? "" : String(v)).slice(0, n);
  const num = v => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : null);
  const mIn = req.measures && typeof req.measures === "object" ? req.measures : null;
  req = { kind: "review", id: str(req.id, 40), name: str(req.name, 40), what: str(req.what, 200), question: str(req.question, 600),
    date: /^\d{4}-\d{2}-\d{2}$/.test(req.date) ? req.date : "",
    measures: mIn && [mIn.pitchSD, mIn.levelCV, mIn.air, mIn.attack].every(v => num(v) !== null)
      ? { noteName: str(mIn.noteName, 12), pitchSD: num(mIn.pitchSD), levelCV: num(mIn.levelCV), air: num(mIn.air), attack: num(mIn.attack) } : null };
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
      h("p", { class: "small muted" }, (req.date ? "Asked " + req.date + ". " : "") + "Open the recording they sent, listen (slower if you like), rate the seven points and give one practice task.")),
    h("section", { class: "card" }, h("h2", null, "The recording"), fileIn, h("div", { class: "row" }, player, h("label", { class: "field" }, "Speed", rate)),
      m ? h("p", { class: "small" }, "Measured by the app on a held " + (m.noteName || "note") + ": pitch wavers " + m.pitchSD + " cents, loudness " + m.levelCV + "%, breath noise " + m.air + "%, settles in " + m.attack + " ms.") : null),
    h("section", { class: "card" }, h("h2", null, "Rate seven points"), h("p", { class: "small muted" }, "Leave a point blank if the recording does not show it (posture needs a video)."), rows),
    h("section", { class: "card" }, h("h2", null, "Comment and practice task"), comment, task, h("label", { class: "field" }, "Next review in", dueSel), tName, make));
  return undefined;
}
