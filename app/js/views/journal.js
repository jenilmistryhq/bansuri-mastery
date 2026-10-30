// Journal (#/journal): practice log, recordings (audio and video) with pitch analysis, comparison and sharing.
import { h, clear, fmtDate, fmtMinutes, toast } from "../util.js";
import { getState, addLog } from "../state.js";
import { totals, streaks, getPlan } from "../course.js";
import { listRecordings, deleteRecording, patchRecording, recordWidget } from "../recorder.js";
import { ac } from "../core/audio.js";
import { analyzeAudioBuffer, compareToExpected, drawPitchPlot } from "../core/pitch.js";
import { dayResults } from "../livestats.js";
import { codeOf, westOf } from "../core/theory.js";

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
  clear(host).append(canvas, h("p", { class: "small" }, rows.length + " steady notes, " + inTune + " within 10 cents." + (result.truncated ? " Only the first 3 minutes were analysed." : "")), table);
  await new Promise(r => requestAnimationFrame(() => { drawPitchPlot(canvas, result); r(); }));
  const summary = { notes: rows.length, inTune, avgAbsCents: rows.length ? Math.round(rows.reduce((a, r) => a + Math.abs(r.cents), 0) / rows.length) : null,
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

export async function render(main) {
  const s = getState();
  const page = h("div", { class: "page" });
  const urls = [];
  const cleanups = [];
  const tt = totals(), st = streaks();
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Journal"), h("h1", null, "Practice journal"),
    h("p", { class: "muted" }, fmtMinutes(tt.minutes) + " logged across " + tt.practiceDays + " days. Current streak " + st.current + ", best " + st.best + ".")));

  // New recording.
  const labelIn = h("input", { class: "input", id: "j-label", value: "Free practice", "aria-label": "Recording label" });
  const host = h("div");
  const widget = recordWidget({ day: s.current, label: () => labelIn.value.trim() || "Free practice", onSaved: () => { drawRecs(); drawTimeline(); } });
  cleanups.push(() => widget.cleanup && widget.cleanup());
  host.append(widget);
  page.append(h("section", { class: "card" }, h("h2", null, "Record"), h("label", { class: "field", for: "j-label" }, "What are you recording?", labelIn), host,
    h("p", { class: "small muted" }, "Recordings stay in this browser. They are never uploaded. Include them in a backup from Settings.")));

  // Video self-check: posture, hands and embouchure, which no tuner can measure.
  const vidWidget = recordWidget({ day: s.current, label: "Video self-check", video: true, onSaved: () => drawRecs() });
  cleanups.push(() => vidWidget.cleanup && vidWidget.cleanup());
  page.append(h("details", { class: "card" },
    h("summary", null, h("b", null, "Video self-check"), h("span", { class: "small muted" }, " - see your posture, hands and lips")),
    h("p", { class: "small muted" }, "Set the phone at eye level about an arm's length away, side-on or in front. Play a long tone and a short melody, then watch it back and compare with the checklists in ",
      h("a", { href: "#/read/lessons/L02-posture-and-holding.md" }, "L02 Posture and holding"), " and ", h("a", { href: "#/read/lessons/L04-first-sound.md" }, "L04 First sound"),
      ". The live preview is mirrored like a mirror; playback shows you as others see you. Videos stay on this device and are large (roughly 1 MB per 10 seconds), so delete old ones."),
    vidWidget));

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
    if (!recs.length) { recHost.append(h("p", { class: "muted" }, "No recordings yet. Record in a session or above.")); return; }
    const shown = showAll ? recs : recs.slice(0, 8);
    for (const rec of shown) {
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
        h("span", { class: "small muted" }, fmtDate(rec.date) + (rec.day !== null && rec.day !== undefined ? " - Day " + rec.day : "") + " - " + (rec.durationS || 0).toFixed(1) + " s" + (rec.analysis ? " - " + rec.analysis.inTune + "/" + rec.analysis.notes + " notes in tune" : "")),
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
  page.append(h("section", { class: "card" }, h("div", { class: "row between" }, h("h2", null, "Recordings"), cmpBtn), compareHost, recHost));

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
    noteIn.value = ""; feel = ""; feelChips.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", "false"));
    drawTimeline(); toast("Logged " + m + " min.");
  });
  page.append(h("section", { class: "card" }, h("h2", null, "Log extra practice"),
    h("p", { class: "small muted" }, "Sessions log themselves. Use this for practice outside a session."),
    h("div", { class: "row" }, minChips, minIn), h("div", { class: "row" }, h("span", { class: "small muted" }, "How did it go?"), feelChips),
    h("div", { class: "row" }, h("div", { style: { flex: "1 1 220px" } }, noteIn), saveLog)));

  // Timeline: each day's practice, recordings and what the microphone measured, newest first.
  const timeHost = h("div", { class: "timeline" });
  const FEEL_LABEL = { great: ["Went well", "good"], ok: ["OK", "mutedc"], hard: ["Hard", "warn"] };
  async function drawTimeline() {
    clear(timeHost);
    const log = getState().log;
    let recs = [];
    try { recs = await listRecordings(); } catch (e) { /* recordings unavailable */ }
    const days = new Map();
    const day = d => { if (!days.has(d)) days.set(d, { log: [], recs: 0 }); return days.get(d); };
    log.forEach(e => day(e.date).log.push(e));
    recs.forEach(r => { if (r.date) day(r.date).recs++; });
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
      if (x.recs) bits.push(h("li", null, x.recs + " recording" + (x.recs === 1 ? "" : "s")));
      for (const hd of res.holds) bits.push(h("li", null, "Longest steady " + (hd.key === "any" ? "note" : codeOf(Number(hd.key))) + ": ", h("b", null, hd.s.toFixed(1) + " s")));
      for (const p of res.plays.slice(-3)) bits.push(h("li", null, p.piece + ": " + p.ok + "/" + p.n + " notes at " + p.bpm + " BPM"));
      for (const e of res.echo) bits.push(h("li", null, "Play back (" + e.label + "): " + e.len + "-note phrases"));
      for (const t of res.taps.slice(-1)) bits.push(h("li", null, "Tapping: " + Math.round(t.within * 100) + "% within 50 ms"));
      timeHost.append(h("article", { class: "tday" },
        h("div", { class: "row between" }, h("b", null, fmtDate(d)), mins ? h("span", { class: "mono small" }, fmtMinutes(mins)) : null),
        h("ul", { class: "tlist" }, bits)));
    }
  }
  page.append(h("section", { class: "card" }, h("h2", null, "Day by day"), timeHost));

  main.append(page);
  drawRecs(); drawTimeline();
  return () => { urls.forEach(u => URL.revokeObjectURL(u)); cleanups.forEach(f => f()); };
}
