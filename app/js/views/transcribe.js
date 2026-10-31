// Notation from a recording (#/transcribe): sound from a browser tab (a YouTube video playing in
// another tab), the microphone or a file; the notes as sargam for any flute, to check by ear, fix,
// play along with and save. The analysis is in ../transcribe.js; nothing leaves the device.
// Steps on the page: 1 get the sound, 2 what was found (and the settings), 3 the notation,
// 4 listen and compare, 5 play along; then saved notations.
import { h, toast, store, storeSet, today, icon } from "../util.js";
import { setSettings, saMidi } from "../core/settings.js";
import { ac, master, makeVoice } from "../core/audio.js";
import { decodeAudioFile, drawPitchPlot } from "../core/pitch.js";
import { parseNotation, buildEvents, playEvents } from "../core/notation.js";
import { countdown } from "../core/live.js";
import { mountBench } from "../bench/bench.js";
import { WEST, codeOf, devaNotation, hzOf } from "../core/theory.js";
import { listCaptures, getCapture, addCapture, patchCapture, deleteCapture, MAX as MAX_CAPTURES } from "../captures.js";
import { stereoDown, bestRuns, monoDown, pitchTrack, transcribe, tonicMidi, fluteLabel, FLUTES, HOP } from "../transcribe.js";

const SAVED = "bansuri.transcribed";
const MAX_SECONDS = 360;
// One note in a beat: an optional {kan}, lower-octave dots, the letter, upper-octave marks; or - or _.
const NOTE_TOKEN = /\{[^}]*\}\.*[SrRgGmMPdDnN]'*|\.*[SrRgGmMPdDnN]'*|[-_]/g;
// An AudioBuffer as a 16-bit mono WAV file, saved by the browser.
function downloadWav(buf, name) {
  const d = buf.getChannelData(0), n = d.length, out = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o, t) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = peak > 0.98 ? 0.98 / peak : 1;
  str(0, "RIFF"); out.setUint32(4, 36 + n * 2, true); str(8, "WAVEfmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, "data"); out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i] * k)) * 32767, true);
  const url = URL.createObjectURL(new Blob([out], { type: "audio/wav" }));
  const a = h("a", { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const fmtWhen = iso => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const clock = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

export async function render(main) {
  const page = h("div", { class: "page trpage" });
  main.append(page);
  const cleanups = [];
  let audio = null, track = null, capture = null, bench = null, last = null, current = null;
  // The parts of a stereo recording (singer, background), worked out the first time each is chosen.
  let stereo = null, parts = {}, partBusy = false;
  const opt = { octave: 0, sameKey: true, layout: "phrases", main: true, part: "whole" };

  // ---- 1. Getting the sound ----
  const canTab = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !/Android|iPhone|iPad|iPod/.test(navigator.userAgent);
  const fileIn = h("input", { type: "file", accept: "audio/*,video/*", class: "sr-only", id: "tr-file", "aria-label": "Choose an audio file" });
  const status = h("p", { class: "small trstatus", role: "status", "aria-live": "polite" });
  const bar = h("i", { style: { width: "0%" } });
  const progress = h("div", { class: "progressbar", hidden: true }, bar);
  const recTime = h("b", { class: "mono" }, "0:00");
  const recLabel = h("span", null, "Listening");
  const stopBtn = h("button", { type: "button", class: "btn primary" }, icon("stop"), " Stop and make notation");
  const recPanel = h("div", { class: "recpanel", hidden: true }, h("span", { class: "recdot", "aria-hidden": "true" }), recLabel, recTime, stopBtn);
  const setBusy = (text, pct) => { status.textContent = text; progress.hidden = pct === null; if (pct !== null) bar.style.width = pct + "%"; };

  // A stream (a shared tab's sound, or the microphone) is recorded until Stop (or 6 minutes).
  async function recordStream(stream, label) {
    const tracks = stream.getAudioTracks();
    if (!tracks.length) { stream.getTracks().forEach(t => t.stop()); toast("No sound was shared. Choose the tab again and turn on \"Share tab audio\"."); return; }
    const rec = new MediaRecorder(new MediaStream(tracks)), chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const started = Date.now();
    recLabel.textContent = label; recTime.textContent = "0:00"; recPanel.hidden = false; sources.hidden = true;
    setBusy("Play the part you want, then press Stop.", null);
    const tick = setInterval(() => { const s = (Date.now() - started) / 1000; recTime.textContent = clock(s); if (s >= MAX_SECONDS) stop(); }, 250);
    const done = new Promise(res => { rec.onstop = res; });
    function stop() {
      clearInterval(tick);
      if (rec.state !== "inactive") rec.stop();
      stream.getTracks().forEach(t => t.stop());
      recPanel.hidden = true; sources.hidden = false; capture = null;
    }
    capture = stop;
    tracks[0].addEventListener("ended", stop);
    stopBtn.onclick = stop;
    rec.start(1000);
    await done;
    if (!chunks.length) { setBusy("Nothing was recorded.", null); return; }
    const stamp = new Date().toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    await keepAndAnalyse(new Blob(chunks, { type: rec.mimeType || "audio/webm" }), (label === "Listening" ? "Microphone " : "Tab ") + stamp, (Date.now() - started) / 1000);
  }
  cleanups.push(() => { if (capture) capture(); });

  const fromTab = async () => {
    try { await recordStream(await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, selfBrowserSurface: "exclude", systemAudio: "include" }), "Listening to the tab"); }
    catch (e) { if (e && e.name !== "NotAllowedError") toast("Could not share the tab: " + (e.message || e)); }
  };
  const fromMic = async btn => {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
    catch (e) { toast("The microphone is not available: " + (e.message || e)); return; }
    if (!await countdown(srcCard, { btn, label: "Get ready: start the music" })) { stream.getTracks().forEach(t => t.stop()); return; }
    await recordStream(stream, "Listening");
  };
  fileIn.addEventListener("change", () => { const f = fileIn.files && fileIn.files[0]; if (f) keepAndAnalyse(f, f.name.replace(/\.[a-z0-9]+$/i, ""), 0); fileIn.value = ""; });
  // Every capture or opened file is kept in the app (Your recordings), so it opens again later.
  async function keepAndAnalyse(blob, name, seconds) {
    current = null;
    try { current = await addCapture(blob, name, seconds); nameIn.value = name; drawCaptures(); }
    catch (e) { toast("Could not keep the recording in the app: " + (e.message || e)); }
    await analyse(blob);
    if (current && audio && !seconds) patchCapture(current.id, { seconds: Math.round(audio.duration) }).then(drawCaptures).catch(() => {});
  }
  const tile = (ic, title, text, attrs) => h(attrs.for ? "label" : "button", Object.assign({ class: "srctile" }, attrs.for ? { for: attrs.for } : { type: "button", onclick: e => attrs.onclick(e.currentTarget) }),
    h("span", { class: "srcicon" }, icon(ic)), h("b", null, title), h("span", { class: "small muted" }, text));
  const sources = h("div", { class: "srctiles" },
    canTab ? tile("screen", "A browser tab", "YouTube or any website: share the tab with its sound, play the part you want.", { onclick: fromTab }) : null,
    tile("mic", "The microphone", canTab ? "Play it near the computer." : "Play it near the phone, from a speaker or another device.", { onclick: fromMic }),
    tile("file", "A file", "An mp3, m4a, wav or ogg file you have.", { for: "tr-file" }));
  const srcCard = h("section", { class: "card" }, h("h2", null, "1. Get the sound"), sources, fileIn, recPanel, status, progress,
    canTab ? h("details", { class: "small" }, h("summary", null, "How to share a YouTube tab"),
      h("ol", { class: "steps" }, h("li", null, "Open the video in another tab and pause it at the part you want."),
        h("li", null, "Press \"A browser tab\" here, choose that tab, and turn on \"Share tab audio\"."),
        h("li", null, "Play the video. Press Stop when the part has played (up to 6 minutes)."))) : null);

  // ---- Analysis ----
  async function analyse(blob, keep) {
    stopAll(); results.hidden = true;
    setBusy("Reading the sound...", 0);
    try { audio = await decodeAudioFile(blob); }
    catch (e) { setBusy("This browser could not read that sound. Try an mp3, m4a, wav or ogg file.", null); return; }
    const ch = []; for (let i = 0; i < audio.numberOfChannels; i++) ch.push(audio.getChannelData(i));
    const { data, sr } = monoDown(ch, audio.sampleRate);
    const sd = stereoDown(ch, audio.sampleRate);
    stereo = sd && sd.side > 0.02 ? sd : null; parts = {};
    track = await pitchTrack(data, sr, { maxSeconds: MAX_SECONDS, onProgress: p => setBusy("Finding the melody... " + p + "%", p) });
    const first = transcribe(track.track, track.levels, { flute: saMidi() });
    if (first.notes.length < 3) { setBusy("No clear melody was found. It works best when one tune (a flute or a voice) is clearly louder than the rest.", null); return; }
    saSel.replaceChildren(...first.tonics.map((c, i) => h("option", { value: String(tonicMidi(c.pc, first.notes)) }, WEST[c.pc] + (i === 0 ? " (most likely)" : ""))));
    bpmIn.value = String(first.bpm);
    fromIn.value = "0"; toIn.value = String(Math.round(track.seconds)); toIn.max = fromIn.max = String(Math.ceil(track.seconds));
    opt.octave = 0;
    setBusy("Done" + (track.truncated ? " (the first 6 minutes)" : "") + ". Check the notes below by ear: this is a draft.", null);
    results.hidden = false;
    // A recording opened again comes back as it was saved: its settings, then its notation.
    const st = keep && keep.settings;
    if (!st) { opt.part = "whole"; syncSegs(); }
    if (st) {
      if ([...saSel.options].some(o => o.value === String(st.sa))) saSel.value = String(st.sa);
      fluteSel.value = String(st.flute); opt.sameKey = st.sameKey; opt.layout = st.layout; opt.octave = st.octave || 0; opt.main = st.main !== false; opt.part = stereo && st.part ? st.part : "whole";
      bpmIn.value = String(st.bpm); fromIn.value = String(st.from); toIn.value = String(st.to); subSel.value = String(st.sub || 2);
      syncSegs();
    }
    if (opt.part !== "whole") await choosePart(); else redraw();
    if (keep && keep.notation) { editor.value = keep.notation; drawView(); }
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---- 2. What was found, and the settings ----
  const saSel = h("select", { class: "input", "aria-label": "Sa of the recording" });
  const fromIn = h("input", { class: "input", type: "number", min: "0", step: "1", "aria-label": "From (seconds)" });
  const toIn = h("input", { class: "input", type: "number", min: "0", step: "1", "aria-label": "To (seconds)" });
  const fluteSel = h("select", { class: "input", "aria-label": "Your flute" }, FLUTES.map(m => h("option", { value: String(m) }, fluteLabel(m))));
  fluteSel.value = String(Math.min(81, Math.max(60, saMidi())));
  // A row of choices; after a choice, `after` runs (by default the notation is made again).
  const segSyncs = [];
  const syncSegs = () => segSyncs.forEach(f => f());
  const seg = (name, items, get, set, after) => {
    segSyncs.push(() => { btns.forEach((b, i) => b.setAttribute("aria-pressed", String(items[i][0] === get()))); if (name === "Layout") detailField.hidden = get() !== "beats"; });
    const btns = items.map(([v, label]) => h("button", { type: "button", class: "seg-btn", "aria-pressed": String(get() === v), onclick: () => { set(v); btns.forEach((b, i) => b.setAttribute("aria-pressed", String(items[i][0] === get()))); (after || redraw)(); } }, label));
    return h("div", { class: "seg", role: "group", "aria-label": name }, btns);
  };
  const keySeg = seg("Key", [[true, "Same key as the recording"], [false, "My flute's own key"]], () => opt.sameKey, v => { opt.sameKey = v; opt.octave = 0; });
  const layoutSeg = seg("Layout", [["phrases", "Phrases"], ["beats", "Bars and beats"]], () => opt.layout, v => { opt.layout = v; detailField.hidden = v !== "beats"; });
  const octOut = h("output", { class: "mono" }, "0");
  const octave = h("div", { class: "row tight" }, h("button", { type: "button", class: "btn small", "aria-label": "Octave down", onclick: () => { opt.octave -= 12; redraw(); } }, "-"), octOut, h("button", { type: "button", class: "btn small", "aria-label": "Octave up", onclick: () => { opt.octave += 12; redraw(); } }, "+"));
  const bpmIn = h("input", { class: "input", type: "number", min: "30", max: "220", step: "1", "aria-label": "Tempo (BPM)" });
  const subSel = h("select", { class: "input", "aria-label": "Notes per beat" }, h("option", { value: "2" }, "Up to 2 notes per beat"), h("option", { value: "4" }, "Up to 4 notes per beat"), h("option", { value: "1" }, "1 note per beat"));
  const detailField = h("label", { class: "field", hidden: true }, "Detail", subSel);
  const chips = h("div", { class: "chips trchips" });
  const hints = h("div", { class: "stack small" });
  const canvas = h("canvas", { class: "plot", "aria-label": "The recording's pitch over time, with the notes found" });
  const field = (label, ...kids) => h("label", { class: "field" }, label, ...kids);
  const group = (title, ...kids) => h("fieldset", { class: "trgroup" }, h("legend", null, title), ...kids);
  [saSel, fluteSel, subSel].forEach(el => el.addEventListener("change", () => { if (el === fluteSel) opt.octave = 0; redraw(); }));
  [bpmIn, fromIn, toIn].forEach(el => el.addEventListener("change", redraw));
  const partNote = h("p", { class: "small muted" });
  const partProgress = h("div", { class: "progressbar thin", hidden: true }, h("i", { style: { width: "0%" } }));
  const partSeg = seg("Which notation", [["whole", "Whole song"], ["singer", "Singer"], ["background", "Background"], ["best", "Best to play"]], () => opt.part, v => { opt.part = v; opt.octave = 0; }, () => choosePart());
  partSeg.classList.add("partseg");
  const PART_TEXT = {
    whole: "The main melody of the whole mix: the singer where there is singing, otherwise the loudest instrument.",
    singer: "Only the singer: the sound in the centre of the stereo mix (bass and drums are there too, but the melody follows the voice).",
    background: "Only the music around the singer: the instruments to the left and right of the mix (intros, interludes, counter-melodies).",
    best: "Made for the flute: the singer's line, the background melody filling the gaps, and every phrase moved into your flute's range.",
  };
  async function needPart(name) {
    if (parts[name]) return parts[name];
    const bar = partProgress.firstChild;
    partProgress.hidden = false;
    parts[name] = await pitchTrack(stereo.M, stereo.sr, { maxSeconds: MAX_SECONDS, stereo: { L: stereo.L, R: stereo.R, part: name }, onProgress: pc => { bar.style.width = pc + "%"; partNote.textContent = "Listening for the " + name + "... " + pc + "%"; } });
    partProgress.hidden = true;
    return parts[name];
  }
  async function choosePart() {
    if (partBusy) return;
    if (opt.part !== "whole" && !stereo) { opt.part = "whole"; syncSegs(); }
    partBusy = true;
    try {
      if (opt.part === "singer" || opt.part === "best") await needPart("singer");
      if (opt.part === "background" || opt.part === "best") await needPart("background");
    } finally { partBusy = false; }
    redraw();
  }
  const partCard = h("div", { class: "partpick" }, h("span", { class: "small" }, h("b", null, "Which notation")), partSeg, partNote, partProgress);
  const foundCard = h("section", { class: "card" }, h("h2", null, "2. What the app found"), partCard, chips,
    h("details", { class: "trplot" }, h("summary", null, "See the pitch line"), canvas,
      h("p", { class: "small muted" }, "Dots are the melody's pitch every 20 ms; bars are the notes found. Slides and grace notes shorter than 80 ms are not notes of their own.")),
    h("div", { class: "trgroups" },
      group("The recording", field("Sa", saSel), h("div", { class: "row tight" }, field("From (s)", fromIn), field("To (s)", toIn)),
        h("div", { class: "field" }, h("span", null, "Notes"), seg("Notes", [[true, "Main melody"], [false, "Every note"]], () => opt.main, v => { opt.main = v; }))),
      group("Your flute", field("Flute", fluteSel), h("div", { class: "field" }, h("span", null, "Write it in"), keySeg), h("div", { class: "field" }, h("span", null, "Octave"), octave)),
      group("Rhythm", h("div", { class: "field" }, h("span", null, "Layout"), layoutSeg),
        h("div", { class: "row tight" }, field("Tempo (BPM)", bpmIn),
          h("button", { type: "button", class: "btn small", onclick: () => { bpmIn.value = String(Math.max(30, Math.round(Number(bpmIn.value) / 2))); redraw(); } }, "Half"),
          h("button", { type: "button", class: "btn small", onclick: () => { bpmIn.value = String(Math.min(220, Math.round(Number(bpmIn.value) * 2))); redraw(); } }, "Double")),
        detailField)),
    hints);

  // ---- 3. The notation ----
  // Shown as the plain sargam text (as typed), every note in a column of the same width so the
  // lines line up; Edit turns it into the text box. Devanagari is an option (its own font).
  const view = h("div", { class: "nview", "aria-label": "Notation" });
  const editor = h("textarea", { class: "input mono", rows: "12", "aria-label": "Notation (you can edit it)", spellcheck: "false", hidden: true });
  const editBtn = h("button", { type: "button", class: "btn small", onclick: () => {
    const editing = editor.hidden;
    editor.hidden = !editing; view.hidden = editing;
    editBtn.textContent = editing ? "Done editing" : "Edit";
    if (!editing) drawView();
    else editor.focus();
  } }, "Edit");
  let script = "latin";
  const scriptSeg = seg("Letters", [["latin", "S R G"], ["deva", "सा रे ग"]], () => script, v => { script = v; }, () => drawView());
  const nameIn = h("input", { class: "input", maxlength: "60", "aria-label": "Name", placeholder: "Name (for example the song's name)" });
  const notationText = () => editor.value;
  const notationCard = h("section", { class: "card" },
    h("div", { class: "row between" }, h("h2", null, "3. The notation"),
      h("div", { class: "row tight" }, scriptSeg, editBtn,
        h("button", { type: "button", class: "btn small", onclick: async () => { try { await navigator.clipboard.writeText(notationText()); toast("Copied."); } catch (e) { toast("Select the text and copy it."); } } }, "Copy"))),
    view, editor,
    h("p", { class: "small muted" }, "Sargam from your flute's Sa: a dot before a note is the lower octave, ' after it the upper. - holds the note a beat longer, _ is a rest, | ends a bar, a pause in a phrase is marked with a gap, a small note in front is a grace note (kan)."),
    h("div", { class: "row" }, nameIn, h("button", { type: "button", class: "btn", onclick: () => save() }, "Save")));

  function drawView() {
    const deva = script === "deva";
    const show = t => deva ? devaNotation(t) : t;
    const cell = tok => {
      if (tok === "|" || tok === "||") return h("span", { class: "nsep", "aria-hidden": "true" }, "|");
      if (tok === ",") return h("span", { class: "npause", "aria-hidden": "true" });
      const m = /^\{([^}]*)\}(.*)$/.exec(tok);
      return h("span", { class: "nc" + (tok === "-" || tok === "_" ? " nhold" : "") }, m ? [h("sup", null, show(m[1])), show(m[2])] : show(tok));
    };
    // Beats in the bars layout can hold several notes ("SR"): those stay together in one cell.
    const lines = notationText().split("\n").filter(l => l.trim());
    view.classList.toggle("deva", deva);
    view.replaceChildren(...lines.map(line => h("div", { class: "nrow" }, line.trim().split(/\s+/).map(tok => {
      const parts = tok === "|" || tok === "||" || tok === "," ? null : tok.match(NOTE_TOKEN);
      if (!parts || parts.length < 2) return cell(tok);
      return h("span", { class: "nc nmulti" }, parts.map(x => { const m = /^\{([^}]*)\}(.*)$/.exec(x); return m ? [h("sup", null, show(m[1])), show(m[2])] : show(x); }));
    }))));
    if (!lines.length) view.append(h("p", { class: "small muted" }, "No notes."));
  }

  // ---- 4. Listen and compare ----
  const players = [];
  function player(title, text, start, render) {
    const btn = h("button", { type: "button", class: "btn primary playbtn", "aria-label": "Play: " + title }, icon("play"));
    const fill = h("i", { style: { width: "0%" } }), time = h("span", { class: "small mono muted" }, "0:00");
    const p = { stop: null, btn };
    const reset = () => { p.stop = null; btn.replaceChildren(icon("play")); btn.setAttribute("aria-label", "Play: " + title); fill.style.width = "0%"; time.textContent = "0:00"; };
    btn.onclick = () => {
      if (p.stop) { p.stop(); reset(); return; }
      stopAll();
      const r = start();
      if (!r) return;
      const c = ac(), t0 = c.currentTime;
      btn.replaceChildren(icon("stop")); btn.setAttribute("aria-label", "Stop: " + title);
      let raf = 0;
      const loop = () => { const s = c.currentTime - t0; fill.style.width = Math.min(100, s / r.seconds * 100) + "%"; time.textContent = clock(s) + " / " + clock(r.seconds); if (s >= r.seconds + 0.3) { p.stop(); reset(); return; } raf = requestAnimationFrame(loop); };
      p.stop = () => { cancelAnimationFrame(raf); r.stop(); };
      loop();
    };
    players.push(p);
    const dl = h("button", { type: "button", class: "btn small", "aria-label": "Download: " + title, onclick: async () => {
      dl.disabled = true;
      try { const r = await render(); if (r) downloadWav(r, fileName(title)); }
      catch (e) { toast("Could not make the file: " + (e.message || e)); }
      dl.disabled = false;
    } }, icon("share"), " Download");
    return h("div", { class: "playrow" }, btn, h("div", { class: "playinfo" }, h("b", null, title), h("span", { class: "small muted" }, text), h("div", { class: "progressbar thin" }, fill)), h("div", { class: "playside" }, time, dl));
  }
  function stopAll() { players.forEach(p => { if (p.stop) p.btn.click(); }); }
  cleanups.push(() => { stopAll(); if (bench) bench.destroy(); });
  const part = () => { const a = Math.max(0, Number(fromIn.value) || 0), b = Math.min(audio ? audio.duration : 0, Number(toIn.value) || Infinity); return [a, Math.max(a + 0.5, b)]; };
  const playOriginal = gain => {
    const [a, b] = part(), c = ac(), src = c.createBufferSource(), g = c.createGain();
    g.gain.value = gain; src.buffer = audio; src.connect(g); g.connect(master()); src.start(c.currentTime + 0.05, a, b - a);
    return { src, seconds: b - a, stop: () => { try { src.stop(); } catch (e) { /* already stopped */ } } };
  };
  // The notes found, at their own times, each at its swara's pitch in the recording's tuning.
  // Made a little ahead of time, not all at once (hundreds of voices at once make the sound crackle).
  const playFound = (at, a, b) => {
    const notes = last.notes.filter(n => n.t1 >= a && n.t0 <= b), c = ac();
    let i = 0, voices = [];
    const pump = () => {
      for (; i < notes.length && at + notes[i].t0 - a < c.currentTime + 1.5; i++) {
        const n = notes[i], v = makeVoice(440 * Math.pow(2, (n.midi + n.off - 69) / 12), at + Math.max(0, n.t0 - a), { level: 0.16 });
        v.end = at + n.t1 - a; v.stop(at + Math.max(0.05, n.t1 - a)); voices.push(v);
      }
      voices = voices.filter(v => v.end > c.currentTime - 0.5);
    };
    pump();
    const timer = setInterval(pump, 250);
    return () => { clearInterval(timer); voices.forEach(v => v.stop()); };
  };
  // Files: rendered offline (faster than playing), as 16-bit WAV.
  const fileName = title => (nameIn.value.trim() || "recording").replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() + "-" + title.toLowerCase().replace(/\s+/g, "-") + ".wav";
  const SR = 44100;
  async function renderMix(seconds, fill) {
    const c = new OfflineAudioContext(1, Math.ceil(SR * (seconds + 0.6)), SR);
    fill(c);
    return c.startRendering();
  }
  const renderOriginal = (c, gain) => {
    const [a, b] = part(), src = c.createBufferSource(), g = c.createGain();
    g.gain.value = gain; src.buffer = audio; src.connect(g); g.connect(c.destination); src.start(0, a, b - a);
  };
  const renderFound = (c, level) => {
    const [a, b] = part();
    for (const n of last.notes) {
      if (n.t1 < a || n.t0 > b) continue;
      const v = makeVoice(440 * Math.pow(2, (n.midi + n.off - 69) / 12), Math.max(0, n.t0 - a), { level, ctx: c, dest: c.destination });
      v.stop(Math.max(0.05, n.t1 - a));
    }
  };
  // The notes as found (unedited notation): times from the start of the chosen part, held through
  // short gaps the way the notation reads, and pitched from the flute's Sa (n.semi).
  function timedNotes() {
    if (!last || notationText() !== last.notation) return null;
    const [a, b] = part(), list = last.notes.filter(n => n.t1 >= a && n.t0 <= b);
    if (!list.length) return null;
    const notes = list.map((n, i) => { const next = list[i + 1], end = next && next.t0 - n.t1 < 0.25 ? next.t0 : n.t1; return { semi: n.semi, t0: Math.max(0, n.t0 - a), t1: end - a }; });
    return { notes, seconds: notes[notes.length - 1].t1 + 0.3 };
  }
  // Played a little ahead of time, like the other players.
  function playTimed(tn) {
    const c = ac(), at = c.currentTime + 0.1;
    let i = 0, voices = [];
    const pump = () => {
      for (; i < tn.notes.length && at + tn.notes[i].t0 < c.currentTime + 1.5; i++) {
        const n = tn.notes[i], v = makeVoice(hzOf(n.semi), at + n.t0);
        v.end = at + n.t1; v.stop(at + Math.max(n.t0 + 0.08, n.t1)); voices.push(v);
      }
      voices = voices.filter(v => v.end > c.currentTime - 0.5);
    };
    pump();
    const timer = setInterval(pump, 250);
    return { seconds: tn.seconds, stop: () => { clearInterval(timer); voices.forEach(v => v.stop()); } };
  }
  const listenCard = h("section", { class: "card" }, h("h2", null, "4. Listen and compare"),
    h("p", { class: "small muted" }, "Hear the recording, then the notation. Together, every wrong note stands out."),
    player("The recording", "The part chosen above.", () => audio && playOriginal(1), async () => {
      if (!audio) return null;
      const [a, b] = part();
      return renderMix(b - a, c => renderOriginal(c, 1));
    }),
    player("The notation", "Its notes on your flute (Settings), in the recording's own timing; after an edit, as written at the tempo above.", () => {
      const tn = timedNotes();
      if (tn) return playTimed(tn);
      const bpm = Number(bpmIn.value) || 80, b = buildEvents(parseNotation(notationText()).tokens, bpm);
      if (!b.ev.length) { toast("The notation has no notes."); return null; }
      const stop = playEvents(b.ev, b.beats, { bpm, click: false });
      return { seconds: b.total, stop };
    }, async () => {
      const tn = timedNotes();
      if (tn) return renderMix(tn.seconds, c => tn.notes.forEach(n => { const v = makeVoice(hzOf(n.semi), n.t0, { ctx: c, dest: c.destination }); v.stop(Math.max(n.t0 + 0.08, n.t1)); }));
      const bpm = Number(bpmIn.value) || 80, b = buildEvents(parseNotation(notationText()).tokens, bpm);
      if (!b.ev.length) { toast("The notation has no notes."); return null; }
      return renderMix(b.total, c => {
        for (const e of b.ev) {
          if (e.kan !== null && e.kan !== undefined) { const k = makeVoice(hzOf(e.kan), Math.max(0, e.start - 0.06), { ctx: c, dest: c.destination }); k.stop(e.start); }
          const v = makeVoice(hzOf(e.semi), e.start, { ctx: c, dest: c.destination });
          v.stop(e.start + Math.max(0.08, e.dur - 0.02));
        }
      });
    }),
    player("Both together", "The recording with the notes found played over it, at the same moments.", () => {
      if (!audio || !last) return null;
      const o = playOriginal(0.8), [a, b] = part(), stopNotes = playFound(ac().currentTime + 0.05, a, b);
      return { seconds: o.seconds, stop: () => { o.stop(); stopNotes(); } };
    }, async () => {
      if (!audio || !last) return null;
      const [a, b] = part();
      return renderMix(b - a, c => { renderOriginal(c, 0.8); renderFound(c, 0.16); });
    }));

  // ---- 5. Play along ----
  const benchHost = h("div", { class: "toolhost", hidden: true });
  const alongBtn = h("button", { type: "button", class: "btn primary", onclick: () => openBench(notationText(), Number(bpmIn.value) || 80) }, icon("play"), " Play along");
  function openBench(text, bpm) {
    if (bench) { bench.destroy(); bench = null; }
    stopAll();
    bench = mountBench(benchHost, { compact: true, tabs: ["play"], tab: "play", notation: text, bpm });
    benchHost.hidden = false;
    benchHost.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  const alongCard = h("section", { class: "card" }, h("h2", null, "5. Play along"),
    h("p", { class: "small muted" }, "The notation in the practice player: loop a part, slow it down, and the microphone checks each note you play."),
    alongBtn, benchHost);

  // ---- Redraw from the settings ----
  function redraw() {
    if (!track) return;
    const flute = Number(fluteSel.value), [a, b] = part();
    const p = opt.part, src = p === "singer" || p === "background" ? parts[p] : track;
    const base = { sa: Number(saSel.value), flute, sameKey: opt.sameKey, bpm: Number(bpmIn.value) || undefined, sub: Number(subSel.value), octave: opt.octave, main: opt.main, layout: opt.layout, from: a, to: b };
    const r = p === "best" && parts.singer && parts.background ? transcribe(null, null, { ...base, runs: bestRuns(parts.singer, parts.background), playable: true })
      : transcribe((src || track).track, (src || track).levels, base);
    // Which parts can be chosen: only a stereo recording can be split.
    [...partSeg.children].forEach((btn, i) => { btn.disabled = i > 0 && !stereo; });
    partNote.textContent = stereo ? PART_TEXT[p] : "This recording is mono (or the same in both channels), so the singer and the background cannot be told apart. A browser tab or a stereo file usually works.";
    last = r;
    octOut.textContent = r.shift > 0 ? "+" + r.shift / 12 : String(r.shift / 12);
    editor.value = r.notation; drawView();
    const saName = WEST[((r.sa % 12) + 12) % 12], fit = r.fit, mine = saMidi();
    const outOf = fit.below + fit.reg3;
    chips.replaceChildren(
      h("span", { class: "chip info" }, "Sa " + saName + (r.tune ? " (" + (r.tune > 0 ? "+" : "") + r.tune + " cents)" : "")),
      h("span", { class: "chip mutedc" }, r.bpm + " BPM"),
      h("span", { class: "chip mutedc" }, r.notes.length + " notes, " + codeOf(fit.lo) + " to " + codeOf(fit.hi)),
      outOf ? h("span", { class: "chip bad" }, outOf + " notes out of the flute's range") : fit.high ? h("span", { class: "chip warn" }, fit.high + " very high notes") : h("span", { class: "chip good" }, icon("check"), " Fits your flute"));
    const tips = [];
    if (r.flute !== null && opt.sameKey && r.flute !== flute) tips.push(h("p", null, "A flute with Sa " + saName + " plays it with the same notes as the recording: ", h("button", { type: "button", class: "linkbtn", onclick: () => { fluteSel.value = String(r.flute); opt.octave = 0; redraw(); } }, "use " + fluteLabel(r.flute)), "."));
    if (outOf) tips.push(h("p", null, "Try the octave buttons" + (opt.sameKey ? ", another flute, or \"My flute's own key\"." : ".")));
    if (flute !== mine) tips.push(h("p", null, "The notation player and play-along use your flute in Settings (" + fluteLabel(mine) + "). ", h("button", { type: "button", class: "linkbtn", onclick: () => { setSettings({ saNote: flute % 12, saOct: Math.floor(flute / 12) - 1 }); toast("Your flute is now " + fluteLabel(flute) + "."); redraw(); } }, "Make " + fluteLabel(flute) + " my flute"), "."));
    hints.replaceChildren(...tips);
    hints.hidden = !tips.length;
    const zero = r.base - r.shift, line = (p === "best" ? parts.singer : src) || track;
    requestAnimationFrame(() => drawPitchPlot(canvas, { frames: line.track.map(m => m === null ? null : { s: m - zero, f: 0 }), hopS: HOP, segments: r.notes.map(n => ({ t0: n.t0, t1: n.t1, med: n.midi - zero + n.cents / 100 })) }));
  }

  // ---- Your recordings (kept in the app) ----
  const capList = h("div", { class: "stack" });
  const capUse = h("p", { class: "small muted" });
  const settingsNow = () => ({ sa: Number(saSel.value), flute: Number(fluteSel.value), sameKey: opt.sameKey, layout: opt.layout, octave: opt.octave, main: opt.main, part: opt.part, bpm: Number(bpmIn.value) || 80, from: Number(fromIn.value) || 0, to: Number(toIn.value) || 0, sub: Number(subSel.value) });
  async function save() {
    const name = nameIn.value.trim() || "Recording of " + today();
    try {
      if (current) await patchCapture(current.id, { name, notation: notationText(), settings: settingsNow(), saved: new Date().toISOString() });
      else { const l = store(SAVED, []); l.unshift({ name, notation: notationText(), bpm: Number(bpmIn.value) || 80, flute: Number(fluteSel.value), date: today() }); storeSet(SAVED, l.slice(0, 30)); }
      toast("Saved in the app."); drawCaptures();
    } catch (e) { toast("Could not save: " + (e.message || e)); }
  }
  async function openCapture(id) {
    const rec = await getCapture(id).catch(() => null);
    if (!rec) { toast("That recording is no longer here."); drawCaptures(); return; }
    current = rec; nameIn.value = rec.name;
    window.scrollTo({ top: 0, behavior: "smooth" });
    await analyse(rec.blob, rec);
  }
  // A saved notation stays hidden until asked for: the button shows it under the row.
  function notationToggle(text) {
    const btn = h("button", { type: "button", class: "btn small ghost", "aria-expanded": "false", onclick: () => {
      const row = btn.closest(".caprow"), shown = row.querySelector(".capnotation");
      if (shown) { shown.remove(); btn.textContent = "Show notation"; btn.setAttribute("aria-expanded", "false"); return; }
      row.append(h("pre", { class: "mono small capnotation" }, text));
      btn.textContent = "Hide notation"; btn.setAttribute("aria-expanded", "true");
    } }, "Show notation");
    return btn;
  }
  async function drawCaptures() {
    let list = [];
    try { list = await listCaptures(); } catch (e) { capUse.textContent = "This browser cannot keep recordings."; }
    const mb = list.reduce((a, c) => a + c.size, 0) / 1048576;
    capUse.textContent = list.length ? list.length + " of " + MAX_CAPTURES + " kept in this browser (" + mb.toFixed(1) + " MB). The oldest goes when a new one comes in." : "";
    const rows = list.map(c => {
      const nameEl = h("b", null, c.name);
      const rename = h("button", { type: "button", class: "btn small ghost", onclick: () => {
        const input = h("input", { class: "input", value: c.name, maxlength: "60", "aria-label": "New name" });
        const done = async () => { const v = input.value.trim(); if (v && v !== c.name) { await patchCapture(c.id, { name: v }); if (current && current.id === c.id) nameIn.value = v; } drawCaptures(); };
        input.addEventListener("keydown", e => { if (e.key === "Enter") done(); if (e.key === "Escape") drawCaptures(); });
        input.addEventListener("blur", done);
        nameEl.replaceWith(input); input.focus(); input.select();
      } }, "Rename");
      return h("div", { class: "caprow" + (current && current.id === c.id ? " current" : "") },
        h("div", { class: "capinfo" }, nameEl, h("span", { class: "small muted" }, fmtWhen(c.created) + " - " + clock(c.seconds || 0) + (c.notation ? " - notation saved" : ""))),
        h("div", { class: "row tight" },
          h("button", { type: "button", class: "btn small primary", onclick: () => openCapture(c.id) }, "Open"),
          c.notation ? notationToggle(c.notation) : null,
          c.notation ? h("button", { type: "button", class: "btn small", onclick: () => openBench(c.notation, (c.settings && c.settings.bpm) || 80) }, "Play along") : null,
          rename,
          h("button", { type: "button", class: "btn small ghost", "aria-label": "Delete " + c.name, onclick: async e => {
            const b = e.currentTarget;
            if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to delete"; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Delete"; }, 3000); return; }
            await deleteCapture(c.id); if (current && current.id === c.id) current = null; drawCaptures();
          } }, "Delete")));
    });
    // Notations saved before recordings were kept (text only).
    const old = store(SAVED, []).map((m, i) => h("div", { class: "caprow" },
      h("div", { class: "capinfo" }, h("b", null, m.name), h("span", { class: "small muted" }, "Notation only, " + m.bpm + " BPM")),
      h("div", { class: "row tight" }, notationToggle(m.notation),
        h("button", { type: "button", class: "btn small", onclick: () => openBench(m.notation, m.bpm) }, "Play along"),
        h("button", { type: "button", class: "btn small ghost", onclick: () => { const l = store(SAVED, []); l.splice(i, 1); storeSet(SAVED, l); drawCaptures(); } }, "Delete"))));
    capList.replaceChildren(...rows, ...old);
    if (!rows.length && !old.length) capList.append(h("p", { class: "small muted" }, "Recordings you make or open here are kept in the app, so you can open them again without a file."));
  }

  const results = h("div", { class: "stack trresults", hidden: true }, foundCard, notationCard, listenCard, alongCard);
  page.append(
    h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Notation from a recording"), h("h1", null, "Turn a recording into sargam"),
      h("p", { class: "muted" }, "Play a song, and the app writes its melody as sargam for your flute, to check by ear, fix and play along with."),
      h("details", { class: "small" }, h("summary", null, "What works well"),
        h("p", null, "Best: one clear melody, such as a solo flute or a voice, with a drone, tabla or soft music behind it. Hard: a melody no louder than the music behind it (a full film orchestra, harmonium chords as loud as the tune). Either way it is a draft: compare it with the recording and fix what is wrong. Slides and fast ornaments are simplified."),
        h("p", null, "Everything happens on this device: recordings are kept only in this browser (Your recordings, below), never uploaded. Use recordings you are allowed to use."))),
    srcCard, results,
    h("section", { class: "card" }, h("h2", null, "Your recordings"), capUse, capList));
  drawCaptures();
  return () => cleanups.forEach(f => f());
}
