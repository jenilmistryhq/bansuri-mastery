// Settings (#/settings): flute, display, placement, backup/restore, reset, about.
import { h, toast, today } from "../util.js";
import { errorList, clearErrors, problemReport } from "../errors.js";
import { getState, update, backupObject, restoreFrom, resetAll } from "../state.js";
import { getPlan, current } from "../course.js";
import { getSettings, setSettings, saHz } from "../core/settings.js";
import { playNote } from "../core/audio.js";
import { WEST, codeOf } from "../core/theory.js";
import { fluteFinder, micIntro } from "../core/live.js";
import { placementTest } from "../placement.js";
import { listenMic, micStats } from "../core/listen.js";
import { ac } from "../core/audio.js";
import { listRecordings, saveRecording, clearRecordings, blobToDataUrl } from "../recorder.js";

function b64ToBlob(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl || "");
  if (!m) return null;
  const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] || "application/octet-stream" });
}

function icsText(hh, mm, minutes) {
  const now = new Date();
  const p2 = n => String(n).padStart(2, "0");
  const stamp = now.getUTCFullYear() + p2(now.getUTCMonth() + 1) + p2(now.getUTCDate()) + "T" + p2(now.getUTCHours()) + p2(now.getUTCMinutes()) + p2(now.getUTCSeconds()) + "Z";
  const start = today().replace(/-/g, "") + "T" + p2(Number(hh)) + p2(Number(mm)) + "00";
  const url = location.origin + location.pathname + "#/today";
  // RFC 5545: escape TEXT values, and fold lines longer than 75 octets.
  const esc = s => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const fold = line => {
    const bytes = new TextEncoder().encode(line);
    if (bytes.length <= 75) return line;
    const parts = []; let cur = "", n = 0;
    for (const ch of line) {
      const len = new TextEncoder().encode(ch).length;
      if (n + len > (parts.length ? 74 : 75)) { parts.push(cur); cur = ""; n = 0; }
      cur += ch; n += len;
    }
    parts.push(cur);
    return parts.join("\r\n ");
  };
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Bansuri Mastery//Practice reminder//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", "UID:bansuri-practice-" + Date.now() + "@bansuri-mastery", "DTSTAMP:" + stamp, "DTSTART:" + start, "DURATION:PT" + minutes + "M",
    "RRULE:FREQ=DAILY", "SUMMARY:" + esc("Bansuri practice"), "DESCRIPTION:" + esc("Open today's session: " + url), "URL:" + url,
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc("Time for bansuri practice"), "TRIGGER:-PT0M", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: type || "application/json" }));
  const a = h("a", { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function render(main) {
  const s = getState();
  const set = getSettings();
  const page = h("div", { class: "page" });
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Settings"), h("h1", null, "Settings")));

  // Flute: set by hand, or found by listening to the learner's Sa.
  const findHost = h("div", { class: "toolhost", hidden: true });
  const findBtn = h("button", { type: "button", class: "btn primary" }, "Detect from my flute");
  let finder = null;
  findBtn.addEventListener("click", () => {
    if (finder) { finder.destroy(); finder = null; findHost.hidden = true; findHost.replaceChildren(); findBtn.textContent = "Detect from my flute"; return; }
    finder = fluteFinder({ onApply: f => { noteSel.value = String(f.saNote); octSel.value = String(f.saOct); a4In.value = String(f.a4); showHz(); } });
    findHost.replaceChildren(finder.el); findHost.hidden = false; findBtn.textContent = "Close";
  });

  // Flute.
  const noteSel = h("select", { id: "st-note" }, WEST.map((w, i) => h("option", { value: String(i) }, w)));
  noteSel.value = String(set.saNote);
  const octSel = h("select", { id: "st-oct" }, h("option", { value: "4" }, "4 (bass flutes)"), h("option", { value: "5" }, "5 (medium flutes)"));
  octSel.value = String(set.saOct);
  const a4In = h("input", { id: "st-a4", type: "number", min: "415", max: "466", step: "0.1", value: String(set.a4) });
  const volIn = h("input", { id: "st-vol", type: "range", min: "0", max: "100", value: String(Math.round(set.volume * 100)) });
  const hz = h("span", { class: "mono" });
  const showHz = () => { hz.textContent = "Sa = " + saHz().toFixed(2) + " Hz"; };
  const saveFlute = () => { setSettings({ saNote: Number(noteSel.value), saOct: Number(octSel.value), a4: Math.min(466, Math.max(415, Number(a4In.value) || 440)), volume: Number(volIn.value) / 100 }); showHz(); };
  [noteSel, octSel, a4In, volIn].forEach(el => el.addEventListener("change", saveFlute));
  showHz();
  page.append(h("section", { class: "card" }, h("h2", null, "Your flute"),
    h("p", { class: "small muted" }, "Every pitch in the app follows these. The default is a C natural medium bansuri: Sa = C5 (about 523 Hz) with A4 = 440 Hz."),
    h("div", { class: "grid3" }, h("label", { class: "field", for: "st-note" }, "Sa (top 3 holes closed)", noteSel), h("label", { class: "field", for: "st-oct" }, "Octave", octSel),
      h("label", { class: "field", for: "st-a4" }, "A4 tuning (Hz)", a4In), h("label", { class: "field", for: "st-vol" }, "Volume", volIn)),
    h("div", { class: "row" }, hz, h("button", { type: "button", class: "btn", onclick: () => playNote(0, 1.6) }, "Play Sa"), findBtn), findHost));

  // Display.
  const theme = h("select", { id: "st-theme" }, h("option", { value: "auto" }, "Match my device"), h("option", { value: "light" }, "Light"), h("option", { value: "dark" }, "Dark"));
  theme.value = s.prefs.theme || "auto";
  theme.addEventListener("change", () => update(st => { st.prefs.theme = theme.value; }));
  const chimes = h("input", { type: "checkbox", id: "st-chimes" });
  chimes.checked = s.prefs.chimes !== false;
  chimes.addEventListener("change", () => update(st => { st.prefs.chimes = chimes.checked; }));
  // Daily practice time: scales every session block (the plan's content and order stay the same).
  const paceSel = h("select", { id: "st-pace" }, h("option", { value: "short" }, "Short: about 25-35 min a day"), h("option", { value: "standard" }, "Standard: 45-60 min a day (as written)"), h("option", { value: "long" }, "Long: 60-80 min a day"));
  paceSel.value = s.prefs.pace || "standard";
  paceSel.addEventListener("change", () => { update(st => { st.prefs.pace = paceSel.value; }); toast("Session blocks now fit your daily time."); });
  page.append(h("section", { class: "card" }, h("h2", null, "Daily practice time"),
    h("p", { class: "small muted" }, "Every block keeps its place; only its minutes change. Short practice every day beats long practice now and then. Milestones still decide when you move on."),
    h("label", { class: "field", for: "st-pace" }, "How long you practise", paceSel)));

  const devaBox = h("input", { type: "checkbox", id: "st-deva" });
  devaBox.checked = getSettings().deva;
  devaBox.addEventListener("change", () => setSettings({ deva: devaBox.checked }));
  page.append(h("section", { class: "card" }, h("h2", null, "Display and sound"),
    h("label", { class: "field", for: "st-theme" }, "Theme", theme),
    h("label", { class: "check", for: "st-deva" }, devaBox, "Show sargam in Devanagari too (सा रे ग) in the score and the listening exercises"),
    h("label", { class: "check", for: "st-chimes" }, chimes, "Chime when a session block's time is up")));

  // Daily reminder: a repeating calendar event, so the phone's own calendar reminds the learner.
  const timeIn = h("input", { id: "st-rtime", type: "time", value: s.prefs.reminderTime || "18:00" });
  const lenIn = h("input", { id: "st-rlen", type: "number", min: "15", max: "180", value: String(s.prefs.reminderMinutes || 50) });
  const icsBtn = h("button", { type: "button", class: "btn primary" }, "Add to my calendar");
  icsBtn.addEventListener("click", () => {
    const [hh, mm] = (timeIn.value || "18:00").split(":");
    const mins = Math.min(180, Math.max(15, Number(lenIn.value) || 50));
    update(st => { st.prefs.reminderTime = hh + ":" + mm; st.prefs.reminderMinutes = mins; });
    download("bansuri-practice-reminder.ics", icsText(hh, mm, mins), "text/calendar");
    toast("Open the downloaded file to add the daily reminder to your calendar.");
  });
  page.append(h("section", { class: "card" }, h("h2", null, "Daily practice reminder"),
    h("p", { class: "small muted" }, "Practice at the same time every day builds the habit. This creates a repeating calendar event with an alert; your phone's calendar does the reminding, so it works even when the app is closed."),
    h("div", { class: "grid3" }, h("label", { class: "field", for: "st-rtime" }, "Time", timeIn), h("label", { class: "field", for: "st-rlen" }, "Minutes", lenIn)),
    h("div", { class: "row" }, icsBtn)));

  // Placement.
  const plan = getPlan();
  const phaseSel = h("select", { id: "st-phase" }, plan.phases.map(p => h("option", { value: String(p.id) }, "Phase " + p.id + ": " + p.title + " (Day " + p.firstDay + ")")));
  const placeBtn = h("button", { type: "button", class: "btn" }, "Start from this phase");
  placeBtn.addEventListener("click", () => {
    const ph = plan.phases.find(p => String(p.id) === phaseSel.value);
    if (!ph) return;
    if (placeBtn.dataset.armed !== "1") { placeBtn.dataset.armed = "1"; placeBtn.textContent = "Tap again to jump to Day " + ph.firstDay; setTimeout(() => { placeBtn.dataset.armed = ""; placeBtn.textContent = "Start from this phase"; }, 4000); return; }
    update(st => {
      st.current = ph.firstDay;
      if (!st.startedAt) st.startedAt = today();
      for (const m of plan.milestones) if (m.day < ph.firstDay && (!st.milestones[m.id] || st.milestones[m.id].status !== "passed")) st.milestones[m.id] = Object.assign({ attempts: [] }, st.milestones[m.id] || {}, { status: "skipped" });
    });
    toast("Now on Day " + ph.firstDay + ". Earlier milestones are marked as skipped; you can still take them.");
    location.hash = "#/today";
  });
  // The playing test: the microphone checks a few items and recommends the phase.
  const testHost = h("div", { class: "toolhost", hidden: true });
  const testBtn = h("button", { type: "button", class: "btn primary", id: "st-placetest" }, "Take the playing test");
  let placer = null;
  testBtn.addEventListener("click", () => {
    if (placer) { placer.destroy(); placer = null; testHost.hidden = true; testBtn.textContent = "Take the playing test"; return; }
    placer = placementTest({ onResult: phase => { phaseSel.value = String(phase); placeBtn.textContent = "Start from this phase"; } });
    testHost.replaceChildren(placer.el); testHost.hidden = false; testBtn.textContent = "Close the test";
  });
  page.append(h("section", { class: "card", id: "already-play" }, h("h2", null, "Already play?"),
    h("p", { class: "small muted" }, "If you can already do what earlier phases teach, start later. The playing test takes about five minutes: play a few items into the microphone and it recommends a phase. You are on Day " + current() + "."),
    h("div", { class: "row" }, testBtn), testHost,
    h("div", { class: "row" }, h("div", { style: { flex: "1 1 260px" } }, phaseSel), placeBtn)));

  // Backup.
  const withRec = h("input", { type: "checkbox", id: "st-withrec" });
  const exportBtn = h("button", { type: "button", class: "btn primary" }, "Download backup");
  exportBtn.addEventListener("click", async () => {
    const obj = backupObject();
    if (withRec.checked) {
      const recs = await listRecordings();
      obj.recordings = [];
      for (const r of recs) obj.recordings.push(Object.assign({}, r, { blob: undefined, data: await blobToDataUrl(r.blob) }));
    }
    download("bansuri-backup-" + today() + ".json", JSON.stringify(obj));
    update(st => { st.lastBackup = today(); });
    toast("Backup downloaded.");
  });
  // Practice log as CSV, for a spreadsheet or a teacher.
  const csvBtn = h("button", { type: "button", class: "btn" }, "Download practice log (CSV)");
  csvBtn.addEventListener("click", () => {
    const q = v => {
      let s = String(v === null || v === undefined ? "" : v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheets treating a note as a formula
      return /[",\r\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s;
    };
    const rows = [["date", "day", "minutes", "day_completed", "how_it_went", "note"]];
    for (const e of getState().log) rows.push([e.date, e.day === null || e.day === undefined ? "" : e.day, e.minutes || 0, e.passed ? "yes" : "", ["great", "ok", "hard"].includes(e.feel) ? e.feel : "", e.note || ""]);
    const ms = getPlan().milestones.map(m => [m.id, m.title, (getState().milestones[m.id] || {}).status || "open", ((getState().milestones[m.id] || {}).attempts || []).length]);
    const text = rows.map(r => r.map(q).join(",")).join("\r\n") + "\r\n\r\nmilestone,title,status,attempts\r\n" + ms.map(r => r.map(q).join(",")).join("\r\n") + "\r\n";
    download("bansuri-practice-log-" + today() + ".csv", "\ufeff" + text, "text/csv");
    toast("Practice log downloaded.");
  });
  const fileIn = h("input", { type: "file", accept: "application/json,.json", id: "st-import" });
  fileIn.addEventListener("change", async () => {
    const f = fileIn.files[0];
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      restoreFrom(obj);
      if (Array.isArray(obj.recordings)) {
        for (const r of obj.recordings) {
          const blob = b64ToBlob(r.data);
          if (!blob || typeof r.id !== "string") continue;
          const rec = { id: r.id, created: String(r.created || ""), date: String(r.date || ""), day: Number.isInteger(r.day) ? r.day : null, label: String(r.label || "Recording").slice(0, 120), mime: String(r.mime || blob.type), blob, durationS: Number(r.durationS) || 0, kind: r.kind === "video" ? "video" : "audio" };
          // Keep the pitch analysis and the reference marking, when they look valid.
          if (r.analysis && typeof r.analysis === "object" && Number.isFinite(r.analysis.notes)) rec.analysis = r.analysis;
          if (typeof r.ref === "string" && r.ref.length < 80) { rec.ref = r.ref; rec.refLabel = typeof r.refLabel === "string" ? r.refLabel.slice(0, 120) : r.ref; }
          await saveRecording(rec, { count: false });
        }
      }
      toast("Backup restored.");
      location.hash = "#/today";
    } catch (e) { toast(String(e.message || "That file could not be read.")); }
  });
  page.append(h("section", { class: "card" }, h("h2", null, "Your data"),
    h("p", { class: "small muted" }, "Progress and recordings live only in this browser. Back up regularly, and to move to another device, download a backup here and restore it there."),
    h("label", { class: "check", for: "st-withrec" }, withRec, "Include recordings (larger file)"),
    h("div", { class: "row" }, exportBtn, csvBtn),
    h("label", { class: "field", for: "st-import" }, "Restore from a backup file (replaces current progress)", fileIn)));

  // Storage + reset.
  const usage = h("span", { class: "small muted" });
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => { usage.textContent = "Using about " + Math.round((e.usage || 0) / 1048576) + " MB of storage."; }).catch(() => {});
  const reset = h("button", { type: "button", class: "btn danger" }, "Reset all progress");
  reset.addEventListener("click", async () => {
    if (reset.dataset.armed !== "1") { reset.dataset.armed = "1"; reset.textContent = "Tap again: this deletes progress and recordings"; setTimeout(() => { reset.dataset.armed = ""; reset.textContent = "Reset all progress"; }, 4000); return; }
    resetAll();
    try { await clearRecordings(); } catch (e) { /* no recordings store */ }
    toast("Progress reset.");
    location.hash = "#/today";
  });
  page.append(h("section", { class: "card" }, h("h2", null, "Start over"), usage, h("div", { class: "row" }, reset)));

  // Microphone check: for testing the listening exercises on a real phone and flute.
  const micOut = h("pre", { class: "small", hidden: true, style: { whiteSpace: "pre-wrap", margin: "0" } });
  const micLive = h("p", { class: "small", "aria-live": "polite" });
  const micBtn = h("button", { type: "button", class: "btn" }, "Run a 15-second microphone check");
  const micCopy = h("button", { type: "button", class: "btn ghost", hidden: true }, "Copy the report");
  let micCheck = null; // { stop } while the 15-second check runs
  micBtn.addEventListener("click", async () => {
    try { ac(); } catch (e) { /* audio unavailable */ } // start the audio clock inside the tap (iOS)
    if (!(await micIntro(micBtn.parentElement))) return;
    micBtn.disabled = true; micOut.hidden = true; micCopy.hidden = true;
    const notes = {}; let voiced = 0, total = 0, cents = [];
    let unsub;
    try {
      unsub = await listenMic(r => {
        total++;
        if (r.semi === null) return;
        voiced++; notes[r.near] = (notes[r.near] || 0) + 1; cents.push(r.cents);
        micLive.textContent = "Hearing " + codeOf(r.near) + " (" + (r.cents > 0 ? "+" : "") + r.cents + " cents)";
      });
    } catch (e) { micLive.textContent = "The microphone could not be opened: " + (e && e.message ? e.message : "blocked") + "."; micBtn.disabled = false; return; }
    micLive.textContent = "Play Sa, then S R G R S slowly, then a long Pa. Listening...";
    const finished = await new Promise(res => { const t = setTimeout(() => res(true), 15000); micCheck = { stop: () => { clearTimeout(t); res(false); } }; });
    micCheck = null;
    const st = micStats();
    unsub();
    if (!finished) return; // left the page
    const top = Object.entries(notes).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => codeOf(Number(k)) + " " + Math.round(n / 30 * 10) / 10 + "s").join(", ");
    const set = getSettings(), ua = navigator.userAgent;
    const text = [
      "Bansuri Mastery microphone check " + new Date().toISOString(),
      "Browser: " + ua,
      "Flute setting: Sa " + WEST[set.saNote] + set.saOct + ", A4 " + set.a4 + " Hz",
      st ? "Mic: " + (st.device || "default") + ", " + st.sampleRate + " Hz; echoCancellation " + st.settings.echoCancellation + ", noiseSuppression " + st.settings.noiseSuppression + ", autoGainControl " + st.settings.autoGainControl : "Mic: (no stats)",
      st ? "Processing: " + st.msPerFrame.toFixed(2) + " ms per reading; loudest level " + st.peak.toFixed(3) : "",
      "Readings: " + total + ", with a clear note: " + voiced + " (" + (total ? Math.round(voiced / total * 100) : 0) + "%)",
      "Notes heard (seconds): " + (top || "none"),
      cents.length ? "Cents: median " + cents.slice().sort((a, b) => a - b)[cents.length >> 1] + ", range " + Math.min(...cents) + " to " + Math.max(...cents) : "",
    ].filter(Boolean).join("\n");
    micOut.textContent = text; micOut.hidden = false; micCopy.hidden = false; micBtn.disabled = false;
    micLive.textContent = voiced / Math.max(1, total) > 0.3 ? "Done. The app could hear your notes." : "Done. Few clear notes were heard: move closer to the phone, or play louder.";
  });
  micCopy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(micOut.textContent); toast("Report copied."); } catch (e) { toast("Select the report and copy it."); }
  });
  page.append(h("section", { class: "card" }, h("h2", null, "Microphone check"),
    h("p", { class: "small muted" }, "Tests how well the app hears your flute on this device: the long-tone meter, play back, play along and milestone checks depend on it. Nothing is recorded or uploaded; copy the report to share it if something misreads."),
    h("div", { class: "row" }, micBtn, micCopy), micLive, micOut));

  // Problem report (local error log).
  const errs = errorList();
  const repBtn = h("button", { type: "button", class: "btn" }, "Copy problem report");
  const repBox = h("textarea", { class: "input", readonly: true, hidden: true, "aria-label": "Problem report", rows: "6" });
  repBtn.addEventListener("click", async () => {
    const text = await problemReport();
    repBox.value = text; repBox.hidden = false;
    try { await navigator.clipboard.writeText(text); toast("Problem report copied. Paste it into your bug report."); }
    catch (e) { repBox.select(); toast("Select the report below and copy it."); }
  });
  const clrBtn = h("button", { type: "button", class: "btn ghost", onclick: () => { clearErrors(); toast("Error log cleared."); location.hash = "#/settings"; } }, "Clear the log");
  page.append(h("section", { class: "card" }, h("h2", null, "Problem report"),
    h("p", { class: "small muted" }, (errs.length ? errs.length + " error" + (errs.length === 1 ? "" : "s") + " recorded on this device." : "No errors recorded on this device.") +
      " If something goes wrong, copy this report into a bug report. It contains the app version, your browser and the error messages, and nothing about your progress, notes or recordings."),
    h("div", { class: "row" }, repBtn, errs.length ? clrBtn : null), repBox));

  page.append(h("section", { class: "card" }, h("h2", null, "About"),
    h("p", null, "Bansuri Mastery teaches the bansuri day by day from the open curriculum. Read it all as a ", h("a", { href: "docs/" }, "website"), " or in the ", h("a", { href: "#/library" }, "library"), "."),
    h("p", { class: "small muted" }, "Course content: CC BY-NC-SA 4.0. Code: MIT. Fonts: Hind, Rozha One (Indian Type Foundry) and JetBrains Mono, SIL Open Font License. Markdown rendering: marked (MIT). Everything runs in your browser; nothing you do here is sent anywhere."),
    h("p", { class: "small muted" }, "Limits: the app cannot hear your tone, see your posture or judge raga intonation. Use recordings, a tuner and, when you can, a teacher. ", h("a", { href: "#/read/07-QUALITY-REPORT.md" }, "Quality report"), ".")));
  main.append(page);
  return () => { if (finder) finder.destroy(); if (micCheck) micCheck.stop(); if (placer) placer.destroy(); };
}
