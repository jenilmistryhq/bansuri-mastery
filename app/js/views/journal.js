// Journal (#/journal): practice log, recordings (audio and video) with pitch analysis, comparison and sharing.
import { h, clear, fmtDate, fmtMinutes, toast } from "../util.js";
import { getState, addLog } from "../state.js";
import { totals, streaks } from "../course.js";
import { listRecordings, deleteRecording, patchRecording, recordWidget } from "../recorder.js";
import { ac } from "../core/audio.js";
import { analyzeAudioBuffer, compareToExpected, drawPitchPlot } from "../core/pitch.js";
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
    items.map(([id, label]) => h("option", { value: id }, "Reference for " + label)),
    rec.ref ? h("option", { value: "-" }, "Stop using as reference") : null);
  sel.addEventListener("change", async () => {
    const v = sel.value;
    if (!v) return;
    if (v === "-") await patchRecording(rec.id, { ref: null, refLabel: null });
    else await patchRecording(rec.id, { ref: v, refLabel: v === "tone" ? "tone" : (getState().reviews[v] || {}).label || v });
    toast(v === "-" ? "No longer a reference." : "Saved as a reference. It will play next to that piece in reviews.");
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
  const widget = recordWidget({ day: s.current, label: () => labelIn.value.trim() || "Free practice", onSaved: () => drawRecs() });
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
  async function drawRecs() {
    urls.splice(0).forEach(u => URL.revokeObjectURL(u));
    let recs = [];
    try { recs = await listRecordings(); } catch (e) { clear(recHost).append(h("p", { class: "small" }, String(e.message))); return; }
    clear(recHost);
    if (!recs.length) { recHost.append(h("p", { class: "muted" }, "No recordings yet. Record in a session or above.")); return; }
    for (const rec of recs) {
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

  // Log.
  const minIn = h("input", { class: "input", type: "number", min: "1", max: "600", value: "20", id: "j-min" });
  const noteIn = h("input", { class: "input", id: "j-note", placeholder: "What did you practise?" });
  const logHost = h("div");
  function drawLog() {
    clear(logHost);
    const log = getState().log.slice().reverse().slice(0, 200);
    if (!log.length) { logHost.append(h("p", { class: "muted" }, "Your sessions will appear here.")); return; }
    for (const e of log) {
      logHost.append(h("div", { class: "logline" }, h("span", null, fmtDate(e.date)),
        h("span", null, e.day !== undefined && e.day !== null ? h("a", { href: "#/day/" + e.day }, "Day " + e.day + " ") : "Extra practice ", e.note ? h("span", { class: "muted" }, "- " + e.note) : null),
        h("span", { class: "row" }, h("span", { class: "mono small" }, fmtMinutes(e.minutes)), e.passed ? h("span", { class: "chip good" }, "Day done") : null)));
    }
  }
  page.append(h("section", { class: "card" }, h("h2", null, "Log"),
    h("div", { class: "row" }, h("label", { class: "field", for: "j-min", style: { width: "7rem" } }, "Minutes", minIn), h("label", { class: "field", for: "j-note", style: { flex: "1 1 220px" } }, "Note", noteIn),
      h("button", { type: "button", class: "btn primary", style: { alignSelf: "end" }, onclick: () => { const m = Math.max(1, Math.min(600, Number(minIn.value) || 0)); addLog({ minutes: m, note: noteIn.value.trim(), day: null }); noteIn.value = ""; drawLog(); toast("Logged " + m + " min."); } }, "Add extra practice")),
    logHost));

  main.append(page);
  drawRecs(); drawLog();
  return () => { urls.forEach(u => URL.revokeObjectURL(u)); cleanups.forEach(f => f()); };
}
