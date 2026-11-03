// Settings (#/me/settings, old #/settings): five groups of preferences, each row showing what it is set
// to; a group opens on its own (#/me/settings/data). Me > Flute (#/me/flute) is drawn here too.
import { h, toast, today, fmtDate } from "../util.js";
import { errorList, clearErrors, problemReport } from "../errors.js";
import { getState, update, restoreFrom, resetAll } from "../state.js";
import { getPlan, current } from "../course.js";
import { getSettings, setSettings, saHz, onSettings } from "../core/settings.js";
import { playNote } from "../core/audio.js";
import { WEST, codeOf } from "../core/theory.js";
import { fluteFinder, micIntro, countdown } from "../core/live.js";
import { placementTest } from "../placement.js";
import { listenMic, micStats } from "../core/listen.js";
import { ac } from "../core/audio.js";
import { saveRecording, clearRecordings } from "../recorder.js";
import { clearCaptures } from "../captures.js";
import { sayButton, saveVoiceOffline, modelReady, voiceSizeMB, removeSavedVoice } from "../voice.js";
import { noteLabel } from "../core/fingers.js";
import { backHead } from "../backhead.js";
import { enableReminder, disableReminder, remindersSupported } from "../reminder.js";
import { saveBackup, backupWith, restoreCaptures } from "../backup.js";
import { calibrationWidget } from "../calibrate.js";

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

// Seconds to get the flute ready between tapping Start (or Record) and the app listening.
function countdownField(set) {
  const inp = h("input", { id: "st-countdown", type: "number", min: "0", max: "30", step: "1", value: String(set.countdown), class: "input", style: { width: "6rem" } });
  const quick = [0, 3, 5, 10].map(n => h("button", { type: "button", class: "btn small" + (set.countdown === n ? " primary" : ""), onclick: e => { inp.value = String(n); save(); e.currentTarget.parentElement.querySelectorAll(".btn").forEach(b => b.classList.toggle("primary", b === e.currentTarget)); } }, n ? n + " s" : "Off"));
  const save = () => { const v = Math.max(0, Math.min(30, Math.round(Number(inp.value) || 0))); inp.value = String(v); setSettings({ countdown: v }); };
  inp.addEventListener("change", save);
  return h("div", { class: "stack" },
    h("label", { class: "field", for: "st-countdown" }, "Countdown before the app listens or records (seconds, 0 = none)", inp),
    h("div", { class: "row" }, quick),
    h("p", { class: "small muted" }, "Time to pick up the flute and settle your hold after tapping Start or Record. Used by every exercise, game, tuner, recording and the posture check."));
}

// Language, voice and access: for learners who prefer listening to reading, and for anyone who
// needs larger text, more contrast, pictures instead of letters, or beats they can see and feel.
function accessSection() {
  const set = getSettings();
  const check = (key, label, extra) => {
    const box = h("input", { type: "checkbox", id: "st-" + key });
    box.checked = !!set[key];
    box.addEventListener("change", () => setSettings({ [key]: box.checked }));
    return h("label", { class: "check", for: "st-" + key }, box, label, extra || null);
  };
  const select = (key, label, options) => {
    const sel = h("select", { id: "st-" + key }, options.map(([v, l]) => h("option", { value: v }, l)));
    sel.value = String(set[key]);
    sel.addEventListener("change", () => setSettings({ [key]: sel.value }));
    return h("label", { class: "field", for: "st-" + key }, label, sel);
  };
  // The language choice is written in both languages, so it can be found without reading English.
  const langSel = h("select", { id: "st-lang", translate: "no" }, h("option", { value: "en" }, "English"), h("option", { value: "hi" }, "हिन्दी (Hindi)"));
  langSel.value = set.lang;
  // Hindi readers expect sargam in Devanagari (सा रे ग): choosing Hindi turns it on.
  langSel.addEventListener("change", () => setSettings(langSel.value === "hi" ? { lang: "hi", deva: true } : { lang: langSel.value }));
  const size = h("input", { id: "st-size", type: "range", min: "85", max: "160", step: "5", value: String(Math.round(set.textSize * 100)) });
  const sizeTxt = h("span", { class: "mono small" }, Math.round(set.textSize * 100) + "%");
  size.addEventListener("input", () => { sizeTxt.textContent = size.value + "%"; setSettings({ textSize: Number(size.value) / 100 }); });
  const offline = h("button", { type: "button", class: "btn" }, "Keep the voice for offline use");
  const removeVoice = h("button", { type: "button", class: "btn ghost", onclick: async () => { await removeSavedVoice(null); removeVoice.textContent = "Saved voice removed"; } }, "Remove the saved voice");
  voiceSizeMB().then(mb => { if (mb) offline.textContent = "Keep the voice for offline use (" + mb + " MB, this language only)"; });
  offline.addEventListener("click", async () => {
    offline.disabled = true;
    const n = await saveVoiceOffline(p => { offline.textContent = "Saving the voice... " + Math.round(p * 100) + "%"; });
    offline.textContent = n ? "Voice saved for offline use" : "Could not save the voice now"; offline.disabled = false;
  });
  const model = h("p", { class: "small muted" }, modelReady() ? "The reading voice for lessons is on this device." : "Lessons can also be read aloud by a natural voice. It downloads once (about 90 MB) the first time you tap a speaker on a lesson card.");
  return [h("section", { class: "card", id: "voice" }, h("h2", null, "Voice and language"),
    h("label", { class: "field", for: "st-lang" }, h("span", { translate: "no" }, "Language / भाषा"), langSel),
    h("p", { class: "small muted" }, "The app's buttons, messages and voice change language. The course pages stay in English, and the voice can read them aloud."),
    h("div", { class: "row between" }, check("talk", "Talk to me: say the steps, and how each note went"), sayButton(["welcome"], "Hear the voice")),
    h("p", { class: "small muted" }, "A natural human-sounding voice, made on this device's copy of the app; nothing is sent anywhere. The microphone does not listen while the app speaks."),
    h("div", { class: "row" }, offline, removeVoice), model,
    check("hints", "After an off note, play a soft slide from my note to the right one")),
  h("section", { class: "card", id: "access" }, h("h2", null, "Easier to use"),
    check("simple", "Simple mode: three big buttons (Practice, Play, Listen), and the app talks you through each session"),
    select("notesAs", "Show notes as", [["letters", "Letters (S R G)"], ["pictures", "Pictures of the fingering"]]),
    h("label", { class: "field", for: "st-size" }, "Text size", h("span", { class: "row" }, size, sizeTxt)),
    check("easyFont", "Easy-to-read font"),
    check("contrast", "High contrast"),
    check("bigTargets", "Bigger buttons"),
    check("showCodes", "Show the course's reference codes in lessons (FNG-06, EX-MEL...), for teachers"),
    h("h3", null, "Beats you can see and feel"),
    check("beatFlash", "Flash the screen edge on every beat"),
    check("vibrate", "Vibrate on every beat (phones that support it)"),
    h("h3", null, "Games"),
    select("gameSpeed", "Game speed", [["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"]]),
    check("noTimer", "No time limit in the games"),
    check("cues", "Game sounds for playing without looking: the next note is spoken, and progress is heard as ticks"))];
}

// A row that opens a screen: its name, what it is set to now (each part its own phrase), and a chevron.
function settingsRow(href, title, parts, key) {
  const now = (parts || []).filter(Boolean);
  return h("a", { class: "hubrow", href, dataset: { group: key || "" } }, h("span", { class: "stack" }, h("b", null, title),
    now.length ? h("span", { class: "small muted sumlist" }, now.map(p => h("span", null, p))) : null), h("span", { class: "chev", "aria-hidden": "true" }, ">"));
}

const PACE_SHORT = { short: "25-35 min a day", standard: "45-60 min a day", long: "60-80 min a day" };
// The five groups of preferences (redesign M5), frequent first and risky last; each card is found by
// its heading. The summary is what the group is set to now.
const SETTINGS_GROUPS = [
  { slug: "voice", id: "g-voice", label: "Language and voice", titles: ["Voice and language"],
    summary: () => { const s = getSettings(); return [s.lang === "hi" ? "हिन्दी" : "English", s.talk ? "Talk to me: on" : "Talk to me: off"]; } },
  { slug: "display", id: "g-access", label: "Display and ease of use", titles: ["Easier to use", "Display and sound", "Preview"],
    summary: () => {
      const s = getSettings(), size = Math.round(s.textSize * 100);
      return [size === 100 ? "Text size normal" : "Text size {n}%".replace("{n}", size), s.simple ? "Simple mode" : null, s.focus ? "Focus mode" : null, s.contrast ? "High contrast" : null, s.bigTargets ? "Bigger buttons" : null];
    } },
  { slug: "practice", id: "g-practice", label: "Practice and reminders", titles: ["Daily practice time", "Countdown", "Daily practice reminder", "Already play?"],
    summary: () => { const p = getState().prefs; return [PACE_SHORT[p.pace] || PACE_SHORT.standard, p.reminderTime ? "Reminder at {x}".replace("{x}", p.reminderTime) : "No reminder"]; } },
  { slug: "data", id: "g-data", label: "Your data", titles: ["Your data", "Start over"],
    summary: () => { const b = getState().lastBackup; return [b ? "Last backup {x}".replace("{x}", fmtDate(b)) : "No backup yet"]; } },
  { slug: "help", id: "g-help", label: "Help and about", titles: ["Problem report", "Pilot study (optional)", "Privacy", "About"],
    summary: () => [getSettings().pilot ? "Pilot study: on" : null] },
];
// Me > Flute (W78): the flute's setup, then its checks as rows, Check my flute first. The microphone
// check and calibration open on their own screens (#/me/flute/mic, #/me/flute/calibrate).
const FLUTE_CHECKS = [["#/me/flute/check", "Check my flute", "Play each note and see how in tune it is", "check"],
  ["#/me/flute/mic", "Microphone check", "How well the app hears your flute on this phone", "mic"],
  ["#/me/flute/calibrate", "Calibrate with your flute", "Help tune the app to real flutes", "calibrate"]];
const FLUTE_TOOLS = { mic: "Microphone check", calibrate: "Calibrate with your flute" };

export async function render(main, ctx = {}) {
  // Me > Flute (#/me/flute) shows the flute's setup and checks; Me > Settings shows the preferences.
  const fluteView = ctx.view === "flute";
  const s = getState();
  const set = getSettings();
  const page = h("div", { class: "page" });
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Settings"), h("h1", null, "Settings")));
  const access = accessSection();

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
  page.append(h("section", { class: "card", id: "countdown" }, h("h2", null, "Countdown"), countdownField(getSettings())));
  page.append(h("section", { class: "card" }, h("h2", null, "Daily practice time"),
    h("p", { class: "small muted" }, "Every block keeps its place; only its minutes change. Short practice every day beats long practice now and then. Milestones still decide when you move on."),
    h("label", { class: "field", for: "st-pace" }, "How long you practise", paceSel)));

  const devaBox = h("input", { type: "checkbox", id: "st-deva" });
  devaBox.checked = getSettings().deva;
  devaBox.addEventListener("change", () => setSettings({ deva: devaBox.checked }));
  const maSel = h("select", { id: "st-ma", class: "input" },
    h("option", { value: "app" }, "m is shuddha Ma, M is tivra Ma (this course)"),
    h("option", { value: "common" }, "M is shuddha Ma, M# is tivra Ma (most notation websites)"));
  maSel.value = getSettings().maStyle;
  maSel.addEventListener("change", () => { setSettings({ maStyle: maSel.value }); toast("Ma is now written " + (maSel.value === "common" ? "M (shuddha) and M# (tivra)." : "m (shuddha) and M (tivra).")); });
  const focusBox = h("input", { type: "checkbox", id: "st-focus", checked: getSettings().focus });
  focusBox.addEventListener("change", () => setSettings({ focus: focusBox.checked }));
  const tunSel = h("select", { id: "st-tuning", class: "input" },
    h("option", { value: "equal" }, "Equal tuning, like a keyboard or tuner app (default)"),
    h("option", { value: "just" }, "Tuned to the tanpura: Ga a little lower, Pa pure (just intonation)"));
  tunSel.value = getSettings().intonation;
  tunSel.addEventListener("change", () => setSettings({ intonation: tunSel.value }));
  page.append(h("section", { class: "card" }, h("h2", null, "Display and sound"),
    h("label", { class: "field", for: "st-tuning" }, "Tuning the app plays and checks", tunSel),
    h("p", { class: "small muted" }, "Tuned to the tanpura, each swara is a pure ratio from Sa: Ga 14 cents and Ni 12 cents below equal tuning, komal Ga 16 above, and so on. It sounds sweeter against the drone. Real players sit somewhere between the two, and some ragas shade particular swaras (Bhairav's komal Re and Dha swing with andolan): let the tuner get you close, then trust your ear and recordings."),
    h("label", { class: "field", for: "st-theme" }, "Theme", theme),
    h("label", { class: "field", for: "st-ma" }, "How Ma is written in notation from recordings and in pasted notation", maSel),
    h("label", { class: "check", for: "st-focus" }, focusBox, "Focus mode: no games, points, levels, badges or quests; practice and listening only"),
    h("label", { class: "check", for: "st-deva" }, devaBox, "Show sargam in Devanagari too (सा रे ग) in the score and the listening exercises"),
    h("label", { class: "check", for: "st-chimes" }, chimes, "Chime when a session block's time is up")));

  // Pilot study (pilot.js): opt-in, anonymous, local; the learner downloads the file and hands it over.
  const pilotBox = h("input", { type: "checkbox", id: "st-pilot", checked: getSettings().pilot });
  pilotBox.addEventListener("change", () => setSettings({ pilot: pilotBox.checked }));
  const pilotBtn = h("button", { type: "button", class: "btn", onclick: async () => {
    const { pilotFile } = await import("../pilot.js");
    download("bansuri-pilot-" + today() + ".json", JSON.stringify(pilotFile(), null, 1));
    toast("Pilot file downloaded: send it to whoever runs the pilot.");
  } }, "Download my pilot file");
  page.append(h("section", { class: "card", id: "pilot" }, h("h2", null, "Pilot study (optional)"),
    h("p", { class: "small muted" }, "Helps tune the app on real learners. While on, the app notes on this device whether the taal it found was kept and how many lines of a line-by-line check were right as written. The file adds your Tone checks and your teacher's ratings. It has no name and no recordings, and nothing is sent: you download it and hand it over."),
    h("label", { class: "check", for: "st-pilot" }, pilotBox, "Take part: note these results on this device"),
    h("div", { class: "row" }, pilotBtn)));

  // Daily reminder: a repeating calendar event, so the phone's own calendar reminds the learner.
  const timeIn = h("input", { id: "st-rtime", type: "time", value: s.prefs.reminderTime || "18:00" });
  const lenIn = h("input", { id: "st-rlen", type: "number", min: "15", max: "180", value: String(s.prefs.reminderMinutes || 50) });
  const icsBtn = h("button", { type: "button", class: "btn primary" }, "Add to my calendar");
  // Or a notification from the app itself (installed app, browsers that support it).
  const notifyMsg = h("p", { class: "small muted", "aria-live": "polite" }, remindersSupported() ? "" : "Notifications from the app need an installed app in Chrome (Android or desktop); the calendar reminder works everywhere.");
  const notifyOn = !!s.prefs.notifyReminder;
  const notifyBtn = h("button", { type: "button", class: "btn" }, notifyOn ? "Turn off the notification" : "Remind me with a notification");
  notifyBtn.addEventListener("click", async () => {
    if (getState().prefs.notifyReminder) { await disableReminder(); update(st => { st.prefs.notifyReminder = false; }); notifyBtn.textContent = "Remind me with a notification"; notifyMsg.textContent = "Notification reminder off."; return; }
    const msg = await enableReminder(timeIn.value || "18:00");
    notifyMsg.textContent = msg;
    if (/^Reminder on|^Saved/.test(msg)) { update(st => { st.prefs.notifyReminder = true; st.prefs.reminderTime = timeIn.value || "18:00"; }); notifyBtn.textContent = "Turn off the notification"; }
  });
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
    h("div", { class: "row" }, icsBtn, notifyBtn), notifyMsg));

  // Placement.
  const plan = getPlan();
  const phaseSel = h("select", { id: "st-phase", "aria-label": "Phase to start from" }, plan.phases.map(p => h("option", { value: String(p.id) }, "Phase " + p.id + ": " + p.title + " (Day " + p.firstDay + ")")));
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
    const obj = await backupWith(withRec.checked);
    download("bansuri-backup-" + today() + ".json", JSON.stringify(obj));
    update(st => { st.lastBackup = today(); });
    toast("Backup downloaded.");
  });
  // One tap to the phone's share sheet: save the backup to Files, Drive or mail.
  const shareBtn = h("button", { type: "button", class: "btn" }, "Save to Files or Drive");
  shareBtn.addEventListener("click", async () => { const how = await saveBackup({ withRecordings: withRec.checked }); if (how !== "cancelled") toast(how === "shared" ? "Backup saved." : "Backup downloaded."); });
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
      await restoreCaptures(obj.captures, b64ToBlob);
      toast("Backup restored.");
      location.hash = "#/today";
    } catch (e) { toast(String(e.message || "That file could not be read.")); }
  });
  // Is the storage protected from automatic clearing? (and how much is used)
  const storeLine = h("p", { class: "small muted", "aria-live": "polite" });
  if (navigator.storage && navigator.storage.persisted) Promise.all([navigator.storage.persisted(), navigator.storage.estimate ? navigator.storage.estimate() : null]).then(([p, est]) => {
    // Two text parts, so each is translated on its own.
    storeLine.replaceChildren(p ? "Storage is protected: the browser will not clear it on its own." : /iPhone|iPad|iPod/.test(navigator.userAgent) ? "Storage is not protected yet: the browser may clear it if space runs low or after about a week without a visit (Safari). Add the app to your home screen to protect it." : "Storage is not protected yet: the browser may clear it if space runs low. Installing the app usually protects it.",
      est && est.usage ? " Using " + (est.usage / 1e6).toFixed(1) + " MB." : "");
  }).catch(() => {});
  page.append(h("section", { class: "card" }, h("h2", null, "Your data"), storeLine,
    h("p", { class: "small muted" }, "Progress and recordings live only in this browser. Back up regularly, and to move to another device, download a backup here and restore it there."),
    h("label", { class: "check", for: "st-withrec" }, withRec, "Include recordings (larger file): the Journal's and Transcribe's"),
    h("div", { class: "row" }, exportBtn, shareBtn, csvBtn),
    h("label", { class: "field", for: "st-import" }, "Restore from a backup file (replaces current progress)", fileIn),
    // Move to another phone has its own screen (W81, W82).
    h("div", { class: "hublist" }, settingsRow("#/me/settings/move", "Move to another phone", ["No account needed: a link carries your progress"], "move"))));

  // Storage + reset.
  const usage = h("span", { class: "small muted" });
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => { usage.textContent = "Using about " + Math.round((e.usage || 0) / 1048576) + " MB of storage."; }).catch(() => {});
  const reset = h("button", { type: "button", class: "btn danger" }, "Reset all progress");
  reset.addEventListener("click", async () => {
    if (reset.dataset.armed !== "1") { reset.dataset.armed = "1"; reset.textContent = "Tap again: this deletes progress and recordings"; setTimeout(() => { reset.dataset.armed = ""; reset.textContent = "Reset all progress"; }, 4000); return; }
    resetAll();
    try { await clearRecordings(); } catch (e) { /* no recordings store */ }
    try { await clearCaptures(); } catch (e) { /* no transcribe recordings */ }
    toast("Progress reset.");
    location.hash = "#/today";
  });
  page.append(h("section", { class: "card startover" }, h("h2", null, "Start over"), h("p", { class: "small" }, "Removes all progress on this phone."), usage, h("div", { class: "row" }, reset)));

  // Microphone check: for testing the listening exercises on a real phone and flute.
  const micOut = h("pre", { class: "small", hidden: true, style: { whiteSpace: "pre-wrap", margin: "0" } });
  const micLive = h("p", { class: "small", "aria-live": "polite" });
  const micBtn = h("button", { type: "button", class: "btn" }, "Run a 15-second microphone check");
  const micCopy = h("button", { type: "button", class: "btn ghost", hidden: true }, "Copy the report");
  let micCheck = null; // { stop } while the 15-second check runs
  micBtn.addEventListener("click", async () => {
    try { ac(); } catch (e) { /* audio unavailable */ } // start the audio clock inside the tap (iOS)
    if (!(await micIntro(micBtn.parentElement))) return;
    if (!(await countdown(micBtn.parentElement, { btn: micBtn }))) return;
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
  const clrBtn = h("button", { type: "button", class: "btn ghost", onclick: () => { clearErrors(); toast("Error log cleared."); if (location.hash === "#/me/settings/help") window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = "#/me/settings/help"; } }, "Clear the log");
  page.append(h("section", { class: "card" }, h("h2", null, "Problem report"),
    h("p", { class: "small muted" }, (errs.length ? errs.length + " error" + (errs.length === 1 ? "" : "s") + " recorded on this device." : "No errors recorded on this device.") +
      " If something goes wrong, copy this report into a bug report. It contains the app version, your browser and the error messages, and nothing about your progress, notes or recordings."),
    h("div", { class: "row" }, repBtn, errs.length ? clrBtn : null), repBox));

  page.append(h("section", { class: "card" }, h("h2", null, "About"),
    h("p", null, h("a", { href: "#/me/privacy" }, "Privacy: what stays on your device"), " - in short, everything."),
    h("p", null, "Bansuri Mastery teaches the bansuri day by day from the open curriculum. Read it all as a ", h("a", { href: "docs/" }, "website"), " or in the ", h("a", { href: "#/library" }, "library"), "."),
    h("p", { class: "small muted" }, "Course content: CC BY-NC-SA 4.0. Code: MIT. Fonts: Hind, Rozha One (Indian Type Foundry) and JetBrains Mono, SIL Open Font License. Markdown rendering: marked (MIT). Everything runs in your browser; nothing you do here is sent anywhere."),
    h("p", { class: "small muted" }, "Limits: the app cannot hear your tone, see your posture or judge raga intonation. Use recordings, a tuner and, when you can, a teacher. ", h("a", { href: "#/read/07-QUALITY-REPORT.md" }, "Quality report"), ".")));
  // Calibration with a real flute (Help): helps set the app's tolerances from real players.
  let calib = null;
  const calibHost = h("div");
  const calibBtn = h("button", { type: "button", class: "btn" }, "Help tune the app to real flutes");
  calibBtn.addEventListener("click", () => { if (calib) return; calib = calibrationWidget(); calibHost.append(calib.el); calibBtn.hidden = true; });
  page.append(h("section", { class: "card" }, h("h2", null, "Calibrate with your flute"),
    h("p", { class: "small muted" }, "Four 10-second tasks with your flute. The app saves what its pitch detector measured (no sound) as a file you can send to the course author, so the in-tune, airy and steady thresholds can be set from real players."), calibBtn, calibHost));
  // Privacy: its own page, under Help and about.
  page.append(h("section", { class: "card" }, h("h2", null, "Privacy"), h("div", { class: "hublist" }, settingsRow("#/me/privacy", "What stays on your device", null, "privacy"))));
  // Display: S R G m as they will look, kept up to date as the settings change (W80).
  const previewNotes = h("div", { class: "notepreview", "aria-live": "polite" });
  const drawPreview = () => previewNotes.replaceChildren(...[0, 2, 4, 5].map(n => h("span", { class: "notepreview-note" }, noteLabel(n))));
  drawPreview();
  const offPreview = onSettings(drawPreview);
  page.append(h("section", { class: "card" }, h("h2", null, "Preview"), h("p", { class: "small muted" }, "S R G m as it will look"), previewNotes));
  const cards = [...page.querySelectorAll(":scope > section.card")].concat(access);
  const byTitle = new Map(cards.map(c => [(c.querySelector("h2") || {}).textContent, c]));
  const hero = page.querySelector(":scope > .hero");
  const groups = SETTINGS_GROUPS;
  const toolView = ctx.view === "flutetool" ? FLUTE_TOOLS[(ctx.params || [])[0]] : null;
  // Which group to open: the address (#/me/settings/data), or an old link's anchor (#/settings#countdown,
  // #/settings#g-data) that names a group or a card inside one.
  let open = fluteView || toolView ? null : groups.find(g => g.slug === (ctx.params || [])[0]) || null;
  const anchor = ctx.anchor || "";
  if (!fluteView && !toolView && !open && anchor) open = groups.find(g => g.id === anchor || g.titles.some(t => byTitle.has(t) && byTitle.get(t).id === anchor)) || null;
  if (fluteView) {
    // Me > Flute (W78): Sa and tuning, then the checks as rows, each opening its own screen.
    hero.replaceChildren(h("span", { class: "eyebrow" }, "Me"), h("h1", null, "Your flute"),
      h("p", { class: "muted" }, "Every pitch and check in the app follows your flute's Sa. Set it here, and check the flute and the microphone."));
    page.replaceChildren(hero, h("h2", { class: "grouphead", id: "g-flute" }, "Sa and tuning"));
    if (byTitle.has("Your flute")) page.append(byTitle.get("Your flute"));
    page.append(h("h2", { class: "grouphead", id: "g-checks" }, "Checks"),
      h("section", { class: "card" }, h("div", { class: "hublist flutechecks" }, FLUTE_CHECKS.map(([href, title, sub, key]) => settingsRow(href, title, [sub], key)))));
  } else if (toolView) {
    // A flute check on its own screen: back to Flute, its name, the check.
    const card = byTitle.get(toolView);
    const head = card && card.querySelector("h2");
    if (head) head.classList.add("sr-only");
    page.replaceChildren(...[backHead("#/me/flute", "Flute", toolView), card].filter(Boolean));
  } else if (open) {
    // One group of preferences (redesign W80): back to Settings, the group's name, its cards.
    page.replaceChildren(h("nav", { class: "crumbs", "aria-label": "Breadcrumbs" }, h("a", { href: "#/me/settings" }, "Settings"), " / ", h("span", null, open.label)),
      h("section", { class: "hero" }, h("h1", { id: open.id }, open.label)));
    for (const t of open.titles) if (byTitle.has(t)) page.append(byTitle.get(t));
  } else {
    // Settings: five groups, each row with its current values (redesign M5).
    page.replaceChildren(hero, h("section", { class: "card" }, h("div", { class: "hublist settingsgroups" },
      groups.map(g => settingsRow("#/me/settings/" + g.slug, g.label, g.summary(), g.slug)))));
  }
  main.append(page);
  return () => { offPreview(); if (calib) calib.destroy(); if (finder) finder.destroy(); if (micCheck) micCheck.stop(); if (placer) placer.destroy(); };
}
