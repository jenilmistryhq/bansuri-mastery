// Journal (#/me/journal, old #/journal): three views. Days: the practice log, day by day. Recordings
// (#/me/journal/recordings): audio and video with pitch analysis, comparison and sharing. Capsule
// (#/me/journal/capsule): the Day 0 time capsule next to the newest recording. Record
// (#/me/journal/record): its own screen, sound only or with video and the live posture check.
import { h, clear, fmtDate, fmtMinutes, toast, addDays, daysBetween, parseDate, today, fmtClock, icon } from "../util.js";
import { getState, addLog } from "../state.js";
import { totals, streaks, getPlan } from "../course.js";
import { listRecordings, deleteRecording, patchRecording, recordWidget } from "../recorder.js";
import { ac, toneDemo } from "../core/audio.js";
import { analyzeAudioBuffer, compareToExpected, drawPitchPlot } from "../core/pitch.js";
import { dayResults, holdSummary } from "../livestats.js";
import { segNav } from "../segnav.js";
import { postureWatch } from "../posture.js";
import { backHead } from "../backhead.js";
import { codeOf, westOf } from "../core/theory.js";
import { award } from "../xp.js";

// The four tone levels of the L08 rubric, demonstrated on Sa, so a self-score means the same each time.
export function toneLevels() {
  const words = { 1: "1: mostly air", 2: "2: some tone, much breath", 3: "3: clear, a little breath", 4: "4: full and clear" };
  let v = null;
  return h("div", { class: "stack", style: { gap: "6px" } }, h("span", { class: "small muted" }, "Hear the tone levels (L08 rubric):"),
    h("div", { class: "chips" }, [1, 2, 3, 4].map(l => h("button", { type: "button", class: "chipbtn", onclick: () => { if (v) v.stop(); v = toneDemo(l, 3); } }, words[l]))));
}

async function analyse(rec, host) {
  clear(host).append(h("p", { class: "small muted" }, "Analysing..."));
  let audio;
  try { audio = await ac().decodeAudioData(await rec.blob.arrayBuffer()); }
  catch (e) { clear(host).append(h("p", { class: "small" }, "This browser could not decode the recording.")); return null; }
  const status = host.firstChild;
  const result = await analyzeAudioBuffer(audio, { maxSeconds: 180, onProgress: p => { status.textContent = "Analysing... " + p + "%"; } });
  const rows = compareToExpected(result.segments, []);
  const canvas = h("canvas", { class: "plot", "aria-label": "Pitch over time" });
  const table = h("div", { class: "tablewrap" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, "#"), h("th", null, "Note"), h("th", null, "Off by"), h("th", null, "Held"), h("th", null, "Verdict"))),
    h("tbody", null, rows.length ? rows.map(r => h("tr", null, h("td", null, String(r.n)), h("td", null, h("b", { class: "mono" }, codeOf(r.near)), " ", westOf(r.near)),
      h("td", { class: "mono" }, (r.cents > 0 ? "+" : "") + r.cents + " cents"), h("td", null, r.held.toFixed(1) + " s"), h("td", null, h("span", { class: "chip " + r.verdict[1] }, r.verdict[0]))))
      : h("tr", null, h("td", { colspan: "5", class: "muted" }, "No steady notes found. Hold each note for at least half a second.")))));
  const inTune = rows.filter(r => r.verdict[1] === "good").length;
  const tone = result.tone;
  const toneLine = tone ? h("p", { class: "small tone-est" }, h("span", { class: "chip info" }, "Tone estimate " + tone.score + " of 4"), " " + tone.text + " ",
    h("span", { class: "muted" }, "Measured from how much of the sound has a clear pitch" + (tone.wobble !== null ? " and how steady it is (" + tone.wobble + " cents)" : "") + ". A guide for comparing your own takes, not a teacher's verdict.")) : null;
  clear(host).append(canvas, h("p", { class: "small" }, rows.length + " steady notes, " + inTune + " within 10 cents." + (result.truncated ? " Only the first 3 minutes were analysed." : "")), toneLine, table);
  await new Promise(r => requestAnimationFrame(() => { drawPitchPlot(canvas, result); r(); }));
  const summary = { notes: rows.length, inTune, tone: tone ? tone.score : null, avgAbsCents: rows.length ? Math.round(rows.reduce((a, r) => a + Math.abs(r.cents), 0) / rows.length) : null,
    perNote: rows.slice(0, 40).map(r => ({ note: codeOf(r.near), cents: r.cents, held: Math.round(r.held * 10) / 10 })) };
  await patchRecording(rec.id, { analysis: summary });
  return { summary, rows, canvas };
}

function storedSummary(rec) {
  const a = rec.analysis;
  const lines = ["Recording: " + rec.label + " (" + rec.date + (rec.day !== null && rec.day !== undefined ? ", Day " + rec.day : "") + ", " + (rec.durationS || 0).toFixed(1) + " s)"];
  if (a && a.perNote) {
    lines.push("Pitch analysis: " + a.inTune + " of " + a.notes + " steady notes within 10 cents; average " + a.avgAbsCents + " cents off.");
    a.perNote.forEach((r, i) => lines.push((i + 1) + ". " + r.note + " " + (r.cents > 0 ? "+" : "") + r.cents + " cents, " + r.held + " s"));
  }
  return lines.join("\n");
}

async function shareRecording(rec) {
  const ext = /mp4|m4a|aac/.test(rec.mime || "") ? "m4a" : /ogg/.test(rec.mime || "") ? "ogg" : "webm";
  const name = (rec.label || "recording").replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "recording";
  const hasAnalysis = !!(rec.analysis && rec.analysis.perNote);
  const text = storedSummary(rec) + "\n\nShared from Bansuri Mastery. Please tell me what to improve.";
  const file = new File([rec.blob], name + "." + ext, { type: rec.blob.type || rec.mime || "audio/webm" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: rec.label, text }); return; }
    catch (e) { if (e && e.name === "AbortError") return; /* fall through to download */ }
  }
  // Fallback: copy the summary first (while the tap still counts as a user action), then download the audio.
  let copied = false;
  try { await navigator.clipboard.writeText(text); copied = true; } catch (e) { copied = false; }
  const url = URL.createObjectURL(file);
  const a = h("a", { href: url, download: file.name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  if (copied) toast("Audio downloaded and its " + (hasAnalysis ? "pitch summary" : "details") + " copied. Send both to your teacher." + (hasAnalysis ? "" : " Tip: analyse it first to include pitch numbers."));
  else toast("Audio downloaded. Copying the summary was blocked by the browser" + (hasAnalysis ? "." : "; analyse the recording to include pitch numbers."));
}

// Mark a recording as the model to compare against for a piece (or for tone in general).
function refControl(rec, redraw) {
  const items = Object.entries(getState().reviews).map(([id, r]) => [id, r.label]);
  const sel = h("select", { class: "input", "aria-label": "Use as reference for", style: { width: "auto" } },
    h("option", { value: "" }, rec.ref ? "Reference: " + (rec.refLabel || rec.ref) : "Use as reference..."),
    h("option", { value: "tone" }, "Reference for tone (general)"),
    items.length ? h("optgroup", { label: "Pieces in review" }, items.map(([id, label]) => h("option", { value: id }, "Reference for " + label))) : null,
    h("optgroup", { label: "Lessons (plays on the lesson's last card)" }, Object.entries(getPlan().lessons).map(([id, l]) => h("option", { value: "lesson:" + id }, "Reference for " + id + " " + l.title))),
    rec.ref ? h("option", { value: "-" }, "Stop using as reference") : null);
  sel.addEventListener("change", async () => {
    const v = sel.value;
    if (!v) return;
    if (v === "-") await patchRecording(rec.id, { ref: null, refLabel: null });
    else await patchRecording(rec.id, { ref: v, refLabel: v === "tone" ? "tone" : v.startsWith("lesson:") ? v.slice(7) : (getState().reviews[v] || {}).label || v });
    toast(v === "-" ? "No longer a reference." : v.startsWith("lesson:") ? "Saved as the reference for " + v.slice(7) + ". It plays on that lesson's last card." : "Saved as a reference. It will play next to that piece in reviews.");
    redraw();
  });
  return sel;
}

// Time capsules: the Day 0 recording (and any later one saved as a time capsule), heard next to your
// newest recording (redesign W73). Everything plays from this browser's storage.
export const isCapsule = r => /time capsule/i.test(r.label || "");
// The longest steady note in a recording, in seconds (0 when none), with the existing pitch analysis.
async function steadySeconds(rec) {
  if (Number.isFinite(rec.steadyS)) return rec.steadyS;
  let s = 0;
  if (rec.analysis && Array.isArray(rec.analysis.perNote) && rec.analysis.perNote.length) s = Math.max(...rec.analysis.perNote.map(n => Number(n.held) || 0));
  else {
    const audio = await ac().decodeAudioData(await rec.blob.arrayBuffer());
    const res = await analyzeAudioBuffer(audio, { maxSeconds: 60 });
    s = Math.max(0, ...res.segments.map(g => g.t1 - g.t0));
  }
  s = Math.round(s * 10) / 10;
  await patchRecording(rec.id, { steadyS: s });
  return s;
}
async function capsuleView(urls) {
  let recs = [];
  try { recs = await listRecordings(); } catch (e) { /* recordings unavailable: shown as empty */ }
  const caps = recs.filter(isCapsule).sort((a, b) => (a.created < b.created ? -1 : 1));
  const newest = recs.find(r => !isCapsule(r) && r.kind !== "video");
  const out = [h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Journal"), h("h1", null, "Time capsule"),
    h("p", { class: "muted" }, "The sound you made on Day 0, next to your newest recording. Hear how far you have come."))];
  if (!caps.length) {
    out.push(h("section", { class: "card emptycard" }, h("p", { class: "emptystate" }, "No time capsule yet. Day 0 records a few seconds of your first sound and keeps it here."),
      h("a", { class: "btn", href: "#/me/journal/recordings" }, "Record yourself now")));
    return out;
  }
  const player = r => { const url = URL.createObjectURL(r.blob); urls.push(url); return h("audio", { controls: true, src: url, preload: "none" }); };
  const boxes = [];
  const col = (head, r) => {
    const box = h("div");
    boxes.push([r, box]);
    // How long the longest steady note in it lasts (W73), measured once and kept with the recording.
    const steady = h("p", { class: "capsulesteady" });
    steadySeconds(r).then(s => { if (s) steady.replaceChildren(h("b", { class: "mono" }, s.toFixed(1) + " s"), " ", h("span", null, "steady")); }).catch(() => {});
    return h("div", { class: "card capsulecol" }, h("h2", { class: "grouphead" }, head),
      h("span", { class: "small muted" }, fmtDate(r.date) + (r.day !== null && r.day !== undefined ? " - Day " + r.day : "") + " - " + (r.durationS || 0).toFixed(1) + " s"),
      player(r), steady, box);
  };
  const first = caps[0];
  const best = Math.max(0, ...holdSummary().map(x => x.best));
  const now = newest && newest.created > first.created
    ? col("Today", newest)
    : h("div", { class: "card capsulecol" }, h("h2", { class: "grouphead" }, "Today"), h("p", { class: "small muted" }, "Record a long Sa now, then come back and hear the two side by side."),
      h("a", { class: "btn", href: "#/me/journal/recordings" }, "Record yourself now"));
  out.push(h("div", { class: "grid2 capsulepair" }, col(first.day === 0 ? "Day 0" : first.label, first), now));
  if (best) out.push(h("p", { class: "small muted" }, "Your longest steady note so far: {n} s.".replace("{n}", best.toFixed(1))));
  if (boxes.length === 2) out.push(h("div", { class: "row" }, h("button", { type: "button", class: "btn", onclick: async e => { e.currentTarget.disabled = true; for (const [r, box] of boxes) await analyse(r, box); } }, "Compare the pitch of both")));
  // Later time capsules, when there are any.
  if (caps.length > 1) out.push(h("section", { class: "card" }, h("h2", null, "Later time capsules"),
    caps.slice(1).map(r => h("div", { class: "rec" }, h("b", null, r.label), h("span", { class: "small muted" }, fmtDate(r.date)), player(r)))));
  return out;
}

// Record (redesign W72): its own screen. Sound only, or with video; while a video records, the live
// posture check (posture.js) watches the camera preview and shows its checklist over it.
function recordScreen(main) {
  const page = h("div", { class: "page recordpage" });
  const DEFAULT = { audio: "Free practice", video: "Video self-check" };
  let mode = "audio", widget = null, watch = null;
  const labelIn = h("input", { class: "input", id: "j-label", value: DEFAULT.audio, "aria-label": "Recording label" });
  const host = h("div", { class: "stack" });
  const savedRow = h("p", { class: "small recsaved", hidden: true }, h("a", { href: "#/me/journal/recordings" }, "See it in Recordings"));
  const canvas = h("canvas", { class: "pose-overlay mirror", "aria-hidden": "true" });
  const list = h("ul", { class: "pose-list", "aria-live": "polite" });
  const waiting = h("p", { class: "recstage-wait small" }, "The camera shows here while you record, with the posture check over it.");
  const overlay = h("div", { class: "recposture", hidden: true }, h("b", { class: "small" }, "Posture"), list);
  const stopWatch = () => {
    if (watch) { watch.stop(); watch = null; }
    list.replaceChildren(); overlay.hidden = true; waiting.hidden = false;
  };
  const startWatch = preview => {
    stopWatch();
    if (!preview) return;
    waiting.hidden = true; overlay.hidden = false;
    list.replaceChildren(h("li", { class: "pose-none" }, "Loading the posture check..."));
    watch = postureWatch(preview, canvas, list);
    watch.ready.catch(() => { list.replaceChildren(h("li", { class: "pose-none" }, "The posture check could not start on this device. The video still records.")); });
  };
  const switchBtns = [["audio", "Sound only"], ["video", "With video"]].map(([k, label]) => {
    const b = h("button", { type: "button", class: "chipbtn", "aria-pressed": String(k === mode), dataset: { mode: k } }, label);
    b.addEventListener("click", () => { if (mode !== k) { mode = k; draw(); } });
    return b;
  });
  function draw() {
    switchBtns.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    if (labelIn.value.trim() === DEFAULT.audio || labelIn.value.trim() === DEFAULT.video || !labelIn.value.trim()) labelIn.value = DEFAULT[mode];
    if (widget) widget.cleanup();
    stopWatch(); savedRow.hidden = true;
    widget = recordWidget({ day: getState().current, label: () => labelIn.value.trim() || DEFAULT[mode], video: mode === "video",
      onSaved: () => { savedRow.hidden = false; }, onStart: startWatch, onStop: stopWatch });
    if (mode === "video") {
      // The camera preview moves into the stage, under the drawn shoulders and the checklist.
      const stage = h("div", { class: "pose-stage recstage" }, waiting, widget.preview, canvas, overlay);
      host.replaceChildren(stage, widget,
        h("p", { class: "small muted" }, "Set the phone at eye level about an arm's length away, side-on or in front. Play a long tone and a short melody, then watch it back and compare with the checklists in ",
          h("a", { href: "#/read/lessons/L02-posture-and-holding.md" }, "L02 Posture and holding"), " and ", h("a", { href: "#/read/lessons/L04-first-sound.md" }, "L04 First sound"),
          ". The live preview is mirrored like a mirror; playback shows you as others see you. Videos stay on this device and are large (roughly 1 MB per 10 seconds), so delete old ones."));
    } else host.replaceChildren(widget, toneLevels());
  }
  draw();
  page.append(backHead("#/me/journal/recordings", "Journal", "Record"),
    h("div", { class: "chips recswitch", role: "group", "aria-label": "What to record" }, switchBtns),
    h("section", { class: "card" }, h("label", { class: "field", for: "j-label" }, "What are you recording?", labelIn), host, savedRow,
      h("p", { class: "small muted" }, "Recordings stay in this browser. They are never uploaded. Include them in a backup from Settings.")));
  main.append(page);
  return () => { stopWatch(); if (widget) widget.cleanup(); };
}

export async function render(main, { params, view: screen } = {}) {
  if (screen === "record") return recordScreen(main);
  const page = h("div", { class: "page" });
  const urls = [];
  const cleanups = [];
  const tt = totals(), st = streaks();
  // Three views (redesign M2, level 3): Days (the record, and Log extra practice at its end),
  // Recordings (record, with the posture check on video) and the time capsule.
  const view = ["recordings", "capsule"].includes(params && params[0]) ? params[0] : "days";
  const show = { days: [], recordings: [] };
  page.append(segNav([["days", "#/me/journal", "Days"], ["recordings", "#/me/journal/recordings", "Recordings"], ["capsule", "#/me/journal/capsule", "Capsule"]], view, "Journal views"));
  if (view === "capsule") {
    page.append(...await capsuleView(urls));
    main.append(page);
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }
  show.days.push(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Journal"), h("h1", null, "Practice journal"),
    h("div", { class: "row summarychips" }, h("span", { class: "chip mutedc" }, fmtMinutes(tt.minutes) + " logged"), h("span", { class: "chip mutedc" }, tt.practiceDays + " days practised"), h("span", { class: "chip mutedc" }, "Streak " + st.current + " (best " + st.best + ")"))));

  // Recording has its own screen (W71, W72): Record now opens it.
  show.recordings.push(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Journal"), h("h1", null, "Your recordings")));
  show.recordings.push(h("div", { class: "row recordnow" }, h("a", { class: "btn primary big", href: "#/me/journal/record" }, icon("mic"), " ", h("span", null, "Record now"))));

  // Recordings.
  const recHost = h("div");
  const compareHost = h("div", { class: "grid2" });
  const selected = new Set();
  let showAll = false;
  async function drawRecs() {
    urls.splice(0).forEach(u => URL.revokeObjectURL(u));
    let recs = [];
    try { recs = await listRecordings(); } catch (e) { clear(recHost).append(h("p", { class: "small" }, String(e.message))); return; }
    clear(recHost);
    if (!recs.length) { recHost.append(h("p", { class: "emptystate" }, "No recordings yet. Record a long Sa above: in a few weeks you can play it next to a new one and hear how far you have come.")); return; }
    // One tap: the newest recording next to the one closest to four weeks earlier.
    const newest = recs[0], target = addDays(newest.date, -28);
    const older = recs.filter(r => r.date <= addDays(newest.date, -14)).sort((a, b) => Math.abs(daysBetween(a.date, target)) - Math.abs(daysBetween(b.date, target)))[0];
    if (older) recHost.append(h("div", { class: "row comparenow" }, h("span", { class: "small" }, "Hear the difference: your newest recording and one from " + daysBetween(older.date, newest.date) + " days earlier."),
      h("button", { type: "button", class: "btn primary", onclick: () => { selected.clear(); selected.add(newest.id); selected.add(older.id); cmpBtn.click(); } }, "Compare with " + daysBetween(older.date, newest.date) + " days ago")));
    const shown = showAll ? recs : recs.slice(0, 8);
    // Grouped by week (Monday first), newest week first.
    let lastWeek = null;
    for (const rec of shown) {
      const wk = addDays(rec.date, -((parseDate(rec.date).getDay() + 6) % 7));
      if (wk !== lastWeek) { recHost.append(h("h3", { class: "weekhead" }, "Week of " + fmtDate(wk))); lastWeek = wk; }
      const url = URL.createObjectURL(rec.blob); urls.push(url);
      const name = h("input", { class: "input", value: rec.label, "aria-label": "Recording name" });
      name.addEventListener("change", () => patchRecording(rec.id, { label: name.value.trim() || rec.label }));
      const aHost = h("div");
      const sel = h("input", { type: "checkbox", "aria-label": "Select for comparison" });
      sel.checked = selected.has(rec.id);
      sel.addEventListener("change", () => { if (sel.checked) selected.add(rec.id); else selected.delete(rec.id); });
      const del = h("button", { type: "button", class: "btn danger" }, "Delete");
      del.addEventListener("click", async () => {
        if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "Tap again to delete"; setTimeout(() => { del.dataset.armed = ""; del.textContent = "Delete"; }, 3000); return; }
        await deleteRecording(rec.id); selected.delete(rec.id); drawRecs();
      });
      recHost.append(h("div", { class: "rec" },
        h("div", { class: "row" }, h("label", { class: "check" }, sel, "Compare"), h("div", { style: { flex: "1 1 200px" } }, name)),
        h("span", { class: "small muted" }, fmtDate(rec.date) + (rec.day !== null && rec.day !== undefined ? " - Day " + rec.day : "") + " - " + (rec.durationS || 0).toFixed(1) + " s" + (rec.analysis ? " - " + rec.analysis.inTune + "/" + rec.analysis.notes + " notes in tune" + (rec.analysis.tone ? ", tone " + rec.analysis.tone + "/4" : "") : "")),
        rec.kind === "video" ? h("video", { controls: true, src: url, preload: "metadata", playsinline: true, class: "selfview" }) : h("audio", { controls: true, src: url, preload: "none" }),
        h("div", { class: "row" },
          h("button", { type: "button", class: "btn", onclick: () => analyse(rec, aHost) }, "Analyse pitch"),
          h("button", { type: "button", class: "btn", onclick: () => shareRecording(rec) }, "Send to a teacher"),
          refControl(rec, drawRecs), del),
        aHost));
    }
    if (recs.length > shown.length) recHost.append(h("button", { type: "button", class: "btn ghost", onclick: () => { showAll = true; drawRecs(); } }, "Show all " + recs.length + " recordings"));
  }
  const cmpBtn = h("button", { type: "button", class: "btn" }, "Compare selected");
  cmpBtn.addEventListener("click", async () => {
    clear(compareHost);
    if (selected.size !== 2) { toast("Tick exactly two recordings to compare."); return; }
    const recs = (await listRecordings()).filter(r => selected.has(r.id)).sort((a, b) => (a.created < b.created ? -1 : 1));
    for (const r of recs) {
      const box = h("div");
      compareHost.append(h("div", { class: "card" }, h("b", null, r.label), h("span", { class: "small muted" }, fmtDate(r.date)), box));
      await analyse(r, box);
    }
    compareHost.scrollIntoView({ behavior: "smooth" });
  });
  show.recordings.push(h("section", { class: "card" }, h("div", { class: "row between" }, h("h2", null, "Recordings"), cmpBtn), compareHost, recHost));

  // Reference kit: a teacher (or your best take) records the core sounds once; each becomes the
  // reference that plays in that lesson's "Practise it now" card.
  const KIT = [["L04", "First sound: Sa, gently, 3 seconds"], ["L07", "A long, steady Sa (8-10 seconds)"], ["L09", "S R G R S, slowly"], ["L11", "Low notes: S .N .D .P .D .N S"],
    ["L12", "Alankar 1, at 60 BPM"], ["L13", "Tongued notes: S S R R G G"], ["L16", "The Bilawal scale up and down"], ["L22", "Sa in three octaves"]];
  const kitList = h("div", { class: "stack" });
  listRecordings().then(recs => {
    for (const [id, what] of KIT) {
      const has = recs.some(r => r.ref === "lesson:" + id);
      const status = h("span", { class: "small " + (has ? "" : "muted") }, has ? "✓ recorded" : "not yet");
      const w = recordWidget({ label: "Reference for " + id, onSaved: async item => { await patchRecording(item.id, { ref: "lesson:" + id, refLabel: "Reference for " + id }); status.textContent = "✓ recorded"; status.className = "small"; } });
      kitList.append(h("details", { class: "kitrow" }, h("summary", null, h("b", { class: "mono" }, id), " ", what, " ", status), w));
    }
  }).catch(() => {});
  show.recordings.push(h("details", { class: "card" }, h("summary", null, h("b", null, "Reference kit: record the core sounds (for a teacher)")),
    h("p", { class: "small muted" }, "Eight short recordings by a teacher, or your own best takes. Each one plays as the reference in its lesson, in place of the built-in recording."), kitList));

  // Log: one tap for the minutes and how it went, an optional note.
  const FEELS = [["great", "Went well"], ["ok", "OK"], ["hard", "Hard"]];
  let minutes = 20, feel = "";
  const minIn = h("input", { class: "input", type: "number", min: "1", max: "600", value: "20", id: "j-min", "aria-label": "Minutes", style: { width: "5.5rem" } });
  const minChips = h("div", { class: "chips", role: "group", "aria-label": "Minutes" }, [10, 15, 20, 30, 45, 60].map(m => {
    const b = h("button", { type: "button", class: "chipbtn", "aria-pressed": String(m === minutes) }, m + " min");
    b.addEventListener("click", () => { minutes = m; minIn.value = String(m); minChips.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); });
    return b;
  }));
  minIn.addEventListener("input", () => { minutes = Math.max(1, Math.min(600, Number(minIn.value) || 0)); minChips.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x.textContent === minutes + " min"))); });
  const feelChips = h("div", { class: "chips", role: "group", "aria-label": "How did it go?" }, FEELS.map(([k, label]) => {
    const b = h("button", { type: "button", class: "chipbtn", "aria-pressed": "false" }, label);
    b.addEventListener("click", () => { feel = feel === k ? "" : k; feelChips.querySelectorAll("button").forEach((x, i) => x.setAttribute("aria-pressed", String(FEELS[i][0] === feel))); });
    return b;
  }));
  const noteIn = h("input", { class: "input", id: "j-note", placeholder: "What did you practise? (optional)" });
  const saveLog = h("button", { type: "button", class: "btn primary" }, "Log it");
  saveLog.addEventListener("click", () => {
    const m = Math.max(1, Math.min(600, Number(minIn.value) || minutes));
    addLog({ minutes: m, note: noteIn.value.trim(), day: null, feel: feel || undefined });
    if (m) award("minutes", { amount: Math.round(m) });
    noteIn.value = ""; feel = ""; feelChips.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", "false"));
    drawTimeline(); toast("Logged " + m + " min.");
  });
  const logCard = h("section", { class: "card", id: "log" }, h("h2", null, "Log extra practice"),
    h("p", { class: "small muted" }, "Sessions log themselves. Use this for practice outside a session."),
    h("div", { class: "row" }, minChips, minIn), h("div", { class: "row" }, h("span", { class: "small muted" }, "How did it go?"), feelChips),
    h("div", { class: "row" }, h("div", { style: { flex: "1 1 220px" } }, noteIn), saveLog));

  // Timeline: each day's practice, recordings and what the microphone measured, newest first.
  const timeHost = h("div", { class: "timeline" });
  const FEEL_LABEL = { great: ["Went well", "good"], ok: ["OK", "mutedc"], hard: ["Hard", "warn"] };
  // One recording on a day: a button that turns into its player and plays.
  const dayPlayer = r => {
    const b = h("button", { type: "button", class: "chipbtn tdayrec" }, icon("play"), " ", h("span", null, r.label || "Recording"), " ", h("span", { class: "mono" }, fmtClock(r.durationS || 0)));
    b.addEventListener("click", () => {
      const url = URL.createObjectURL(r.blob); urls.push(url);
      const media = r.kind === "video" ? h("video", { controls: true, src: url, playsinline: true, class: "selfview" }) : h("audio", { controls: true, src: url });
      b.replaceWith(media);
      media.play().catch(() => {});
    });
    return b;
  };
  async function drawTimeline() {
    clear(timeHost);
    const log = getState().log;
    let recs = [];
    try { recs = await listRecordings(); } catch (e) { /* recordings unavailable */ }
    const days = new Map();
    const day = d => { if (!days.has(d)) days.set(d, { log: [], recs: [] }); return days.get(d); };
    log.forEach(e => day(e.date).log.push(e));
    recs.forEach(r => { if (r.date) day(r.date).recs.push(r); });
    // This week's practice (Monday first), above the days (W70).
    const t = today(), monday = addDays(t, -((parseDate(t).getDay() + 6) % 7));
    const weekMins = log.filter(e => e.date >= monday && e.date <= t).reduce((a, e) => a + (e.minutes || 0), 0);
    timeHost.append(h("p", { class: "eyebrow weektotal" }, h("span", null, "This week"), " . ", h("span", null, fmtMinutes(weekMins))));
    const L = getState().live;
    for (const list of Object.values(L.holds)) list.forEach(x => day(x.d));
    L.plays.forEach(x => day(x.d)); L.taps.forEach(x => day(x.d)); Object.values(L.echo).forEach(x => day(x.d));
    const dates = [...days.keys()].sort().reverse().slice(0, 21);
    if (!dates.length) { timeHost.append(h("p", { class: "muted" }, "Your practice will appear here, day by day: sessions, recordings and what the microphone measured.")); return; }
    for (const d of dates) {
      const x = days.get(d), mins = x.log.reduce((a, e) => a + (e.minutes || 0), 0), res = dayResults(d);
      const bits = [];
      for (const e of x.log) bits.push(h("li", null, e.day !== undefined && e.day !== null ? h("a", { href: "#/day/" + e.day }, "Day " + e.day) : "Extra practice",
        " - " + fmtMinutes(e.minutes), e.passed ? h("span", { class: "chip good" }, "Day done") : null,
        FEEL_LABEL[e.feel] ? h("span", { class: "chip " + FEEL_LABEL[e.feel][1] }, FEEL_LABEL[e.feel][0]) : null,
        e.note ? h("span", { class: "muted" }, " " + e.note) : null));
      // The day's recordings, each playable from here (W70).
      if (x.recs.length) bits.push(h("li", { class: "tdayrecs" }, x.recs.map(r => dayPlayer(r))));
      for (const hd of res.holds) bits.push(h("li", null, "Longest steady " + (hd.key === "any" ? "note" : codeOf(Number(hd.key))) + ": ", h("b", null, hd.s.toFixed(1) + " s")));
      for (const p of res.plays.slice(-3)) bits.push(h("li", null, p.piece + ": " + p.ok + "/" + p.n + " notes at " + p.bpm + " BPM"));
      for (const e of res.echo) bits.push(h("li", null, "Play back (" + e.label + "): " + e.len + "-note phrases"));
      for (const t of res.taps.slice(-1)) bits.push(h("li", null, "Tapping: " + Math.round(t.within * 100) + "% within 50 ms"));
      timeHost.append(h("article", { class: "tday" },
        h("div", { class: "row between" }, h("b", null, fmtDate(d)), mins ? h("span", { class: "mono small" }, fmtMinutes(mins)) : null),
        h("ul", { class: "tlist" }, bits)));
    }
  }
  // Days: the record, newest first, and logging extra practice at its end.
  show.days.push(h("section", { class: "card" }, h("h2", null, "Day by day"), timeHost), logCard);

  page.append(...show[view]);
  main.append(page);
  if (view === "recordings") drawRecs(); else drawTimeline();
  return () => { urls.forEach(u => URL.revokeObjectURL(u)); cleanups.forEach(f => f()); };
}
