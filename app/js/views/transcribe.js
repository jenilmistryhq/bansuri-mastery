// Notation from a recording (#/transcribe): sound from a browser tab (a YouTube video playing in
// another tab), the microphone or a file; the notes as sargam for any flute, to check by ear, fix,
// play along with and save. The analysis is in ../transcribe.js; nothing leaves the device.
// A MIDI file gives exact notes instead (no listening). Steps on the page: 1 get the sound,
// 2 what was found (and the settings), 3 check by ear (eartools.js), 4 the notation, 5 listen
// and compare, 6 play along; then Your recordings.
import { h, toast, store, storeSet, today, icon } from "../util.js";
import { setSettings, saMidi } from "../core/settings.js";
import { ac, master, makeVoice } from "../core/audio.js";
import { decodeAudioFile } from "../core/pitch.js";
import { parseNotation, buildEvents, playEvents } from "../core/notation.js";
import { countdown } from "../core/live.js";
import { mountBench } from "../bench/bench.js";
import { WEST, codeOf, devaNotation, hzOf } from "../core/theory.js";
import { listenMic } from "../core/listen.js";
import { listCaptures, getCapture, addCapture, patchCapture, deleteCapture, MAX as MAX_CAPTURES } from "../captures.js";
import { earTools } from "./eartools.js";
import { isMidi, parseMidi, melodyScore, topLine, keyTonic } from "../midi.js";
import { analyser, separator } from "../analyser.js";
import { bestRuns, transcribe, tonicMidi, fluteLabel, FLUTES, HOP, scoreTake } from "../transcribe.js";

const SAVED = "bansuri.transcribed";
const MAX_SECONDS = 360;
// One note in a beat: an optional {kan}, lower-octave dots, the letter, upper-octave marks; or - or _.
const NOTE_TOKEN = /~?(?:\{[^}]*\})?\.*[SrRgGmMPdDnN]'*|[-_]/g;
// An AudioBuffer as a 16-bit WAV file with all its channels (a stereo recording stays stereo).
function wavBlob(buf) {
  const chs = Math.min(2, buf.numberOfChannels), ds = Array.from({ length: chs }, (_, c) => buf.getChannelData(c)), n = ds[0].length, bytes = n * chs * 2;
  const out = new DataView(new ArrayBuffer(44 + bytes));
  const str = (o, t) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
  let peak = 0; for (const d of ds) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = peak > 0.98 ? 0.98 / peak : 1;
  str(0, "RIFF"); out.setUint32(4, 36 + bytes, true); str(8, "WAVEfmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, chs, true);
  out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * 2 * chs, true); out.setUint16(32, 2 * chs, true); out.setUint16(34, 16, true); str(36, "data"); out.setUint32(40, bytes, true);
  for (let i = 0; i < n; i++) for (let c = 0; c < chs; c++) out.setInt16(44 + (i * chs + c) * 2, Math.max(-1, Math.min(1, ds[c][i] * k)) * 32767, true);
  return new Blob([out], { type: "audio/wav" });
}
function downloadWav(buf, name) {
  const url = URL.createObjectURL(wavBlob(buf));
  const a = h("a", { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Notes (t0, t1 in seconds, midi) as a one-track MIDI file at the given tempo (480 ticks a beat).
function midiBlob(notes, bpm, name) {
  const tpb = 480, tick = t => Math.max(0, Math.round(t * bpm / 60 * tpb)), ev = [];
  for (const n of notes) { ev.push([tick(n.t0), 0x90, n.midi, 90]); ev.push([tick(Math.max(n.t0 + 0.05, n.t1)), 0x80, n.midi, 0]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const vlq = v => { const b = [v & 0x7f]; while ((v >>= 7)) b.unshift((v & 0x7f) | 0x80); return b; };
  const us = Math.round(60e6 / bpm), title = [...String(name).slice(0, 60)].map(c => c.charCodeAt(0) & 0x7f);
  const body = [0, 0xff, 0x03, title.length, ...title, 0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xc0, 73];
  let at = 0;
  for (const [t, st, m, v] of ev) { body.push(...vlq(t - at), st, m, v); at = t; }
  body.push(0, 0xff, 0x2f, 0);
  const len = body.length;
  return new Blob([new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, tpb >> 8, tpb & 255, 0x4d, 0x54, 0x72, 0x6b, len >>> 24, (len >> 16) & 255, (len >> 8) & 255, len & 255, ...body])], { type: "audio/midi" });
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = h("a", { href: url, download: name });
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
  // The analysis runs in a worker (analyser.js); `loaded` says whether it still holds this recording
  // (a cancel clears it).
  let stereo = false, loaded = false, parts = {}, partBusy = false;
  const an = analyser();
  cleanups.push(() => an.destroy());
  // The separation model (Demucs): sepDone when the parts came from it; vocalsUrl plays the singer
  // alone (Check by ear uses it for the Singer notation); modelCached once it is in the browser.
  const sep = separator();
  let sepDone = false, sepBusy = false, vocalsUrl = null, modelCached = false;
  cleanups.push(() => { sep.destroy(); if (vocalsUrl) URL.revokeObjectURL(vocalsUrl); });
  // follow: the bars follow the recording's tempo as it changes; taps: beats tapped by the learner;
  // easy: the easier version.
  // sameKey false (the default): sargam from the song's own Sa, as tutorials and song books write it.
  const opt = { octave: 0, sameKey: false, layout: "phrases", main: true, part: "whole", follow: true, easy: false, taps: null };
  // A MIDI file: its tracks, the notes of the chosen one, and its key. Notes corrected by ear
  // (manual) replace the notes found until reset; undo keeps earlier versions.
  let midi = null, midiNotes = null, midiTonics = null, manual = null, undo = [], audioUrl = null;
  const setUrl = blob => { if (audioUrl) URL.revokeObjectURL(audioUrl); audioUrl = URL.createObjectURL(blob); };
  cleanups.push(() => { if (audioUrl) URL.revokeObjectURL(audioUrl); });

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
  // Cancel stops the worker's job, and an analysis still decoding stops at its next step (gen).
  let gen = 0;
  const cancelBtn = h("button", { type: "button", class: "btn small ghost", hidden: true, onclick: () => { gen++; an.cancel(); } }, "Cancel");
  const setBusy = (text, pct) => { status.textContent = text; progress.hidden = cancelBtn.hidden = pct === null; if (pct !== null) bar.style.width = pct + "%"; };

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
  const midiIn = h("input", { type: "file", accept: ".mid,.midi,audio/midi,audio/x-midi", class: "sr-only", id: "tr-midi", "aria-label": "Choose a MIDI file" });
  midiIn.addEventListener("change", () => { const f = midiIn.files && midiIn.files[0]; if (f) keepAndAnalyse(f, f.name.replace(/\.[a-z0-9]+$/i, ""), 0); midiIn.value = ""; });
  fileIn.addEventListener("change", () => { const f = fileIn.files && fileIn.files[0]; if (f) keepAndAnalyse(f, f.name.replace(/\.[a-z0-9]+$/i, ""), 0); fileIn.value = ""; });
  // Every capture or opened file is kept in the app (Your recordings), so it opens again later.
  async function keepAndAnalyse(blob, name, seconds) {
    current = null;
    try { current = await addCapture(blob, name, seconds); nameIn.value = name; drawCaptures(); }
    catch (e) { toast("Could not keep the recording in the app: " + (e.message || e)); }
    await analyse(blob);
    // Its length, once known (not after a cancel: the learner may be deleting it).
    if (current && audio && !seconds && !results.hidden) patchCapture(current.id, { seconds: Math.round(audio.duration) }).then(drawCaptures).catch(() => {});
  }
  const tile = (ic, title, text, attrs) => h(attrs.for ? "label" : "button", Object.assign({ class: "srctile" }, attrs.for ? { for: attrs.for } : { type: "button", onclick: e => attrs.onclick(e.currentTarget) }),
    h("span", { class: "srcicon" }, icon(ic)), h("b", null, title), h("span", { class: "small muted" }, text));
  const sources = h("div", { class: "srctiles" },
    canTab ? tile("screen", "A browser tab", "YouTube or any website: share the tab with its sound, play the part you want.", { onclick: fromTab }) : null,
    tile("mic", "The microphone", canTab ? "Play it near the computer." : "Play it near the phone, from a speaker or another device.", { onclick: fromMic }),
    tile("file", "A file", "An mp3, m4a, wav or ogg file you have.", { for: "tr-file" }),
    tile("note", "A MIDI file", "Exact notes, no guessing: a song's .mid file (karaoke and backing-track sites have many).", { for: "tr-midi" }));
  const srcCard = h("section", { class: "card" }, h("h2", null, "1. Get the sound"), sources, fileIn, midiIn, recPanel, status, h("div", { class: "row tight trbusy" }, progress, cancelBtn),
    canTab ? h("details", { class: "small" }, h("summary", null, "How to share a YouTube tab"),
      h("ol", { class: "steps" }, h("li", null, "Open the video in another tab and pause it at the part you want."),
        h("li", null, "Press \"A browser tab\" here, choose that tab, and turn on \"Share tab audio\"."),
        h("li", null, "Play the video. Press Stop when the part has played (up to 6 minutes)."))) : null);

  // ---- Analysis ----
  async function analyse(blob, keep) {
    stopAll(); results.hidden = true; an.cancel(); loaded = false;
    const mine = ++gen;
    const cancelled = () => { if (gen === mine) return false; setBusy("Cancelled. Choose a sound again when you are ready.", null); return true; };
    manual = keep && keep.manual ? keep.manual : null; undo = []; opt.phase = keep && keep.settings ? keep.settings.phase : undefined; opt.taps = keep && keep.settings && Array.isArray(keep.settings.taps) ? keep.settings.taps : null;
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    if (isMidi(head)) { await analyseMidi(blob, keep); return; }
    midi = null; midiNotes = null; midiTonics = null; midiField.hidden = true; partCard.hidden = false; notesField.hidden = false; followField.hidden = false; parts = {};
    // Parts separated by the model earlier come back with the recording.
    sepDone = !!(keep && keep.sep && keep.sep.singer && keep.sep.background);
    if (sepDone) parts = { singer: keep.sep.singer, background: keep.sep.background };
    if (vocalsUrl) { URL.revokeObjectURL(vocalsUrl); vocalsUrl = null; }
    setUrl(blob);
    setBusy("Reading the sound...", 0);
    try { audio = await decodeAudioFile(blob); }
    catch (e) { setBusy("This browser could not read that sound. Try an mp3, m4a, wav or ogg file.", null); return; }
    if (cancelled()) return;
    try {
      await ensureLoaded();
      if (cancelled()) return;
      track = await an.run({ cmd: "whole" }, (label, p) => setBusy(label + p + "%", p));
    } catch (e) {
      setBusy(e && e.cancelled ? "Cancelled. Choose a sound again when you are ready." : "Could not finish: " + ((e && e.message) || e), null);
      return;
    }
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
    restore(st);
    if (opt.part !== "whole") await choosePart(); else redraw();
    if (keep && keep.notation) { editor.value = keep.notation; drawView(); }
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  // The recording in the worker (again after a cancel): mono, and stereo when its channels differ.
  async function ensureLoaded() {
    if (loaded) return;
    setBusy("Reading the sound...", 0);
    const ch = []; for (let i = 0; i < audio.numberOfChannels; i++) ch.push(audio.getChannelData(i));
    stereo = (await an.run({ cmd: "load", channels: ch, sr: audio.sampleRate })).stereo;
    loaded = true;
  }
  // Settings saved with a recording come back with it.
  function restore(st) {
    if (!st) { opt.part = "whole"; syncSegs(); return; }
    if ([...saSel.options].some(o => o.value === String(st.sa))) saSel.value = String(st.sa);
    fluteSel.value = String(st.flute); opt.sameKey = st.sameKey; opt.layout = st.layout; opt.octave = st.octave || 0; opt.main = st.main !== false; opt.part = st.part || "whole";
    opt.follow = st.follow !== false; opt.easy = !!st.easy; followBox.checked = opt.follow;
    bpmIn.value = String(st.bpm); fromIn.value = String(st.from); toIn.value = String(st.to); subSel.value = String(st.sub || 2);
    syncSegs();
  }

  // A MIDI file: the notes are read, not heard. The melody track is picked (the learner can pick
  // another), the key signature gives Sa, the file's tempo the beats, and the whole arrangement is
  // played with a simple sound so the listening tools work as for a recording.
  async function analyseMidi(blob, keep) {
    sepDone = false; parts = {};
    setBusy("Reading the MIDI file...", 0);
    try { midi = parseMidi(new Uint8Array(await blob.arrayBuffer())); }
    catch (e) { setBusy((e && e.message) || "This MIDI file could not be read.", null); return; }
    const usable = midi.tracks.filter(t => !t.drums);
    if (!usable.length) { setBusy("This MIDI file has no notes to play (only drums).", null); return; }
    const ranked = usable.slice().sort((a, b) => melodyScore(b) - melodyScore(a));
    midiSel.replaceChildren(...usable.map(t => h("option", { value: String(t.index) }, (t.name || "Track " + (t.index + 1)) + (t.family ? " (" + t.family + ")" : "") + ", " + t.notes.length + " notes" + (t === ranked[0] ? " - the melody, most likely" : ""))));
    const st = keep && keep.settings;
    midiSel.value = String(st && st.midiTrack !== undefined && usable.some(t => t.index === st.midiTrack) ? st.midiTrack : ranked[0].index);
    stereo = false; parts = {}; loaded = false;
    midiField.hidden = false; partCard.hidden = true; notesField.hidden = true; followField.hidden = true;
    setBusy("Making its sound...", 50);
    audio = await renderMidi(midi, Number(midiSel.value));
    setUrl(wavBlob(audio));
    useMidiTrack();
    const kt = keyTonic(midi.key);
    midiTonics = kt === null ? null : [{ pc: kt, score: 1 }];
    const first = transcribe(null, null, { notes: midiNotes, tonics: midiTonics, flute: saMidi() });
    saSel.replaceChildren(...first.tonics.map((c, i) => h("option", { value: String(tonicMidi(c.pc, first.notes)) }, WEST[c.pc] + (i === 0 ? (kt !== null ? " (the file's key)" : " (most likely)") : ""))));
    bpmIn.value = String(midi.bpm);
    fromIn.value = "0"; toIn.value = String(Math.ceil(midi.duration)); toIn.max = fromIn.max = String(Math.ceil(midi.duration));
    opt.octave = 0; opt.part = "whole";
    if (!st) { opt.layout = "beats"; syncSegs(); }
    setBusy("Done: " + midiNotes.length + " notes read from the MIDI file" + (midi.tempoChanges ? " (it changes tempo; the bars follow the first tempo)" : "") + ".", null);
    results.hidden = false;
    restore(st);
    opt.part = "whole";
    redraw();
    if (keep && keep.notation) { editor.value = keep.notation; drawView(); }
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  // The chosen MIDI track, one note at a time, and its pitch line for Check by ear.
  function useMidiTrack() {
    const t = midi.tracks.find(x => x.index === Number(midiSel.value));
    midiNotes = topLine(t ? t.notes : []).map((n, i) => ({ id: "m" + i, t0: n.t0, t1: n.t1, midi: n.midi }));
    const frames = new Array(Math.ceil(midi.duration / HOP) + 1).fill(null);
    for (const n of midiNotes) for (let i = Math.floor(n.t0 / HOP); i < Math.ceil(n.t1 / HOP) && i < frames.length; i++) frames[i] = n.midi;
    track = { track: frames, levels: frames.map(f => (f === null ? 0 : 1)), seconds: midi.duration, truncated: false };
  }
  // The arrangement as sound (offline): every track but the drums, the melody louder. A simple
  // sound, for listening and comparing; up to 6000 notes.
  async function renderMidi(mf, melodyIndex) {
    const sr = 22050, c = new OfflineAudioContext(2, Math.ceil(sr * (mf.duration + 1)), sr);
    let count = 0;
    for (const t of mf.tracks) {
      if (t.drums) continue;
      const lead = t.index === melodyIndex;
      for (const n of t.notes) {
        if (count++ > 6000) break;
        const o = c.createOscillator(), g = c.createGain(), f = 440 * Math.pow(2, (n.midi - 69) / 12), peak = (lead ? 0.22 : 0.05) * (0.4 + n.vel / 210);
        o.type = lead ? "triangle" : "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0, n.t0); g.gain.linearRampToValueAtTime(peak, n.t0 + 0.015); g.gain.setTargetAtTime(peak * 0.7, n.t0 + 0.05, 0.2);
        g.gain.setTargetAtTime(0, Math.max(n.t0 + 0.02, n.t1), 0.04);
        o.connect(g); g.connect(c.destination); o.start(n.t0); o.stop(n.t1 + 0.3);
      }
    }
    return c.startRendering();
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
  const keySeg = seg("Key", [[false, "My flute's own key"], [true, "Same key as the recording"]], () => opt.sameKey, v => { opt.sameKey = v; opt.octave = 0; });
  const layoutSeg = seg("Layout", [["phrases", "Phrases"], ["beats", "Bars and beats"]], () => opt.layout, v => { opt.layout = v; detailField.hidden = v !== "beats"; });
  const octOut = h("output", { class: "mono" }, "0");
  const octave = h("div", { class: "row tight" }, h("button", { type: "button", class: "btn small", "aria-label": "Octave down", onclick: () => { opt.octave -= 12; redraw(); } }, "-"), octOut, h("button", { type: "button", class: "btn small", "aria-label": "Octave up", onclick: () => { opt.octave += 12; redraw(); } }, "+"));
  const bpmIn = h("input", { class: "input", type: "number", min: "30", max: "220", step: "1", "aria-label": "Tempo (BPM)" });
  // Tap the beat while the recording plays: the tempo and where the beats fall come from the taps.
  const tapBtn = h("button", { type: "button", class: "btn small", onclick: () => tapping ? finishTaps() : startTaps() }, "Tap the beat");
  const tapPad = h("button", { type: "button", class: "btn primary tappad", hidden: true, onclick: () => tap() }, "Tap (or T)");
  const tapNote = h("span", { class: "small muted" });
  let tapping = null;
  function startTaps() {
    if (!audio) return;
    stopAll();
    const o2 = playOriginal(1), c = ac();
    tapping = { taps: [], start: c.currentTime + 0.05, from: part()[0], o: o2 };
    tapBtn.textContent = "Done"; tapPad.hidden = false; tapNote.textContent = "Tap along with the beat: at least 4 taps.";
    tapPad.focus();
  }
  function tap() {
    if (!tapping) return;
    // About 50 ms is the usual delay between hearing a beat and the tap landing.
    tapping.taps.push(tapping.from + ac().currentTime - tapping.start - 0.05);
    tapNote.textContent = tapping.taps.length + " taps";
    if (tapping.taps.length >= 24) finishTaps();
  }
  function finishTaps() {
    const t = tapping; tapping = null;
    tapBtn.textContent = "Tap the beat"; tapPad.hidden = true;
    t.o.stop();
    if (t.taps.length < 4) { tapNote.textContent = "Not enough taps: tap at least 4 times."; return; }
    const gaps = t.taps.slice(1).map((x, i) => x - t.taps[i]).sort((a, b) => a - b), T = gaps[gaps.length >> 1];
    let x = 0, y = 0; for (const tt of t.taps) { x += Math.cos(2 * Math.PI * tt / T); y += Math.sin(2 * Math.PI * tt / T); }
    let ph = Math.atan2(y, x) / (2 * Math.PI) * T; if (ph < 0) ph += T;
    bpmIn.value = String(Math.round(60 / T)); opt.phase = ph; opt.taps = t.taps;
    tapNote.textContent = "Tempo " + Math.round(60 / T) + " BPM from your taps; the bars follow your beats where you tapped.";
    redraw();
  }
  document.addEventListener("keydown", onTapKey);
  cleanups.push(() => document.removeEventListener("keydown", onTapKey));
  function onTapKey(e) { if (tapping && (e.key === "t" || e.key === "T")) { e.preventDefault(); tap(); } }
  const subSel = h("select", { class: "input", "aria-label": "Notes per beat" }, h("option", { value: "2" }, "Up to 2 notes per beat"), h("option", { value: "4" }, "Up to 4 notes per beat"), h("option", { value: "1" }, "1 note per beat"));
  const detailField = h("label", { class: "field", hidden: true }, "Detail", subSel);
  const midiSel = h("select", { class: "input", "aria-label": "MIDI track" });
  midiSel.addEventListener("change", () => { manual = null; undo = []; useMidiTrack(); redraw(); });
  const midiField = h("label", { class: "field", hidden: true }, "MIDI track (the melody)", midiSel);
  const chips = h("div", { class: "chips trchips" });
  const hints = h("div", { class: "stack small" });
  const field = (label, ...kids) => h("label", { class: "field" }, label, ...kids);
  const group = (title, ...kids) => h("fieldset", { class: "trgroup" }, h("legend", null, title), ...kids);
  [saSel, fluteSel, subSel].forEach(el => el.addEventListener("change", () => { if (el === fluteSel) opt.octave = 0; redraw(); }));
  [fromIn, toIn].forEach(el => el.addEventListener("change", redraw));
  bpmIn.addEventListener("change", () => { opt.phase = undefined; opt.taps = null; redraw(); });
  // Follow tempo changes (on by default): the beats are tracked through the song.
  const followBox = h("input", { type: "checkbox", id: "tr-follow", checked: true });
  followBox.addEventListener("change", () => { opt.follow = followBox.checked; redraw(); });
  const followField = h("label", { class: "check small", for: "tr-follow" }, followBox, "Follow tempo changes (a song that speeds up or slows down)");
  const partNote = h("p", { class: "small muted" });
  const partBar = h("div", { class: "progressbar thin" }, h("i", { style: { width: "0%" } }));
  const partProgress = h("div", { class: "row tight trbusy", hidden: true }, partBar, h("button", { type: "button", class: "btn small ghost", onclick: () => { an.cancel(); loaded = false; sep.cancel(); } }, "Cancel"));
  const partSeg = seg("Which notation", [["whole", "Whole song"], ["singer", "Singer"], ["background", "Background"], ["best", "Best to play"]], () => opt.part, v => { opt.part = v; opt.octave = 0; manual = null; undo = []; }, () => choosePart());
  partSeg.classList.add("partseg");
  const PART_TEXT = {
    whole: "The main melody of the whole mix: the singer where there is singing, otherwise the loudest instrument.",
    singer: "Only the singer: in a stereo recording, the sound in the centre of the mix (bass and drums are there too, but the melody follows the voice).",
    background: "Only the music around the singer: in a stereo recording, the instruments to the left and right of the mix (intros, interludes, counter-melodies).",
    best: "Made for the flute: the singer's line, the background melody filling the gaps, and every phrase moved into your flute's range.",
  };
  const MONO_NOTE = "This recording is mono, so the parts are guessed by repetition instead: the music that repeats is taken as the background, what changes as the singer. This often fails: when every verse repeats the same tune, the singer's notes land in the background. A stereo recording (a browser tab, or the copy under Your recordings) splits far better.";
  async function needPart(name) {
    if (parts[name]) return parts[name];
    const bar = partBar.firstChild;
    partProgress.hidden = false;
    const show = (label, pc) => { bar.style.width = pc + "%"; partNote.textContent = label + pc + "%"; };
    try {
      await ensureLoaded();
      parts[name] = await an.run({ cmd: "part", name }, show);
    } finally { partProgress.hidden = true; status.textContent = ""; progress.hidden = cancelBtn.hidden = true; }
    return parts[name];
  }
  async function choosePart() {
    if (partBusy) return;
    partBusy = true;
    try {
      if (opt.part === "singer" || opt.part === "best") await needPart("singer");
      if (opt.part === "background" || opt.part === "best") await needPart("background");
    } catch (e) {
      // Cancelled (or failed): back to the whole song.
      opt.part = "whole"; syncSegs();
      if (!(e && e.cancelled)) toast("Could not separate the parts: " + ((e && e.message) || e));
    } finally { partBusy = false; }
    redraw();
  }
  // ---- The separation model ----
  const SEP_TEXT = {
    singer: "Only the singer, separated from the music by the separation model.",
    background: "The melodic instruments (no voice, drums or bass), separated by the separation model: intros, interludes, counter-melodies.",
    best: PART_TEXT.best,
  };
  const sepBox = h("div", { class: "sepbox small", hidden: true });
  function drawSep() {
    sepBox.hidden = !!midi || opt.part === "whole" && !sepDone;
    if (sepDone) {
      sepBox.replaceChildren(h("span", null, icon("check"), " Singer and background separated by the model (Demucs)."),
        vocalsUrl ? h("button", { type: "button", class: "linkbtn", onclick: () => { const a = new Audio(vocalsUrl); a.play().catch(() => {}); setTimeout(() => a.pause(), 15000); } }, "Hear the singer alone (15 s)") : null);
      return;
    }
    sepBox.replaceChildren(
      h("p", null, h("b", null, "More exact: the separation model. "), "It hears the singer apart from the music, in any recording (mono too). " + (modelCached ? "It is in this browser" : "It downloads once (172 MB) and stays in this browser") + "; it runs on this device and nothing is uploaded. A song takes a few minutes (less with a graphics card)."),
      h("div", { class: "row tight" },
        h("button", { type: "button", class: "btn small primary", disabled: sepBusy, onclick: () => runDemucs() }, modelCached ? "Separate with the model" : "Download the model and separate"),
        modelCached ? h("button", { type: "button", class: "btn small ghost", onclick: async () => { try { await sep.run({ cmd: "forget" }); } catch (e) { /* nothing kept */ } modelCached = false; drawSep(); toast("The separation model was removed from this browser."); } }, "Remove the model") : null));
  }
  sep.run({ cmd: "status" }).then(r => { modelCached = !!(r && r.cached); drawSep(); }, () => {});
  // The recording at 44.1 kHz stereo (the model's rate), up to MAX_SECONDS.
  async function at44k(buf) {
    const c = new OfflineAudioContext(2, Math.ceil(Math.min(buf.duration, MAX_SECONDS) * 44100), 44100), src = c.createBufferSource();
    src.buffer = buf; src.connect(c.destination); src.start();
    const r = await c.startRendering();
    return [r.getChannelData(0).slice(), r.getChannelData(1).slice()];
  }
  // The vocals as a small mono WAV (22 kHz), for hearing the singer alone.
  function vocalsWav(v) {
    const n = Math.floor(v.length / 2), out = new DataView(new ArrayBuffer(44 + n * 2));
    let peak = 0; for (let i = 0; i < v.length; i++) peak = Math.max(peak, Math.abs(v[i]));
    const k = peak > 0 ? 0.9 / peak : 1, str = (o, t) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
    str(0, "RIFF"); out.setUint32(4, 36 + n * 2, true); str(8, "WAVEfmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
    out.setUint32(24, 22050, true); out.setUint32(28, 44100, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, "data"); out.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, (v[2 * i] + v[2 * i + 1]) / 2 * k)) * 32767, true);
    return new Blob([out], { type: "audio/wav" });
  }
  async function runDemucs() {
    if (!audio || sepBusy || midi) return;
    sepBusy = true; drawSep();
    const bar = partBar.firstChild;
    partProgress.hidden = false;
    const show = (label, pc) => { bar.style.width = pc + "%"; partNote.textContent = label + pc + "%"; };
    try {
      show("Preparing the sound... ", 0);
      const [L, R] = await at44k(audio);
      const out = await sep.run({ cmd: "separate", left: L, right: R }, show, [L.buffer, R.buffer]);
      modelCached = true;
      if (vocalsUrl) URL.revokeObjectURL(vocalsUrl);
      vocalsUrl = URL.createObjectURL(vocalsWav(out.vocals));
      const singer = await an.run({ cmd: "track", data: out.vocals, sr: 44100, name: "singer" }, show, [out.vocals.buffer]);
      const background = await an.run({ cmd: "track", data: out.other, sr: 44100, name: "background" }, show, [out.other.buffer]);
      parts = { singer, background }; sepDone = true;
      // Kept with the recording, so it opens again without separating again.
      if (current) patchCapture(current.id, { sep: { singer, background } }).catch(() => {});
      if (opt.part === "whole") opt.part = "singer";
      syncSegs();
      toast("Separated. The notation now follows the singer.");
    } catch (e) {
      if (e && e.cancelled) loaded = false;
      else toast("The separation model could not run here: " + ((e && e.message) || e) + ". It needs a recent desktop browser with about 2 GB of free memory.");
    } finally {
      sepBusy = false; partProgress.hidden = true; status.textContent = ""; progress.hidden = cancelBtn.hidden = true;
      drawSep(); redraw();
    }
  }
  const partCard = h("div", { class: "partpick" }, h("span", { class: "small" }, h("b", null, "Which notation")), partSeg, partNote, partProgress, sepBox);
  const notesField = h("div", { class: "field" }, h("span", null, "Notes"), seg("Notes", [[true, "Main melody"], [false, "Every note"]], () => opt.main, v => { opt.main = v; manual = null; undo = []; }));
  // The easier version: quick runs folded, ornaments dropped, high notes and passing half-holes eased.
  const easyField = h("div", { class: "field" }, h("span", null, "Version"), seg("Version", [[false, "As played"], [true, "Easier"]], () => opt.easy, v => { opt.easy = v; }));
  const foundCard = h("section", { class: "card" }, h("h2", null, "2. What the app found"), partCard, chips,
    h("div", { class: "trgroups" },
      group("The recording", midiField, field("Sa", saSel), h("div", { class: "row tight" }, field("From (s)", fromIn), field("To (s)", toIn)), notesField, easyField),
      group("Your flute", field("Flute", fluteSel), h("div", { class: "field" }, h("span", null, "Write it in"), keySeg), h("div", { class: "field" }, h("span", null, "Octave"), octave)),
      group("Rhythm", h("div", { class: "field" }, h("span", null, "Layout"), layoutSeg),
        h("div", { class: "row tight" }, field("Tempo (BPM)", bpmIn),
          h("button", { type: "button", class: "btn small", onclick: () => { bpmIn.value = String(Math.max(30, Math.round(Number(bpmIn.value) / 2))); redraw(); } }, "Half"),
          h("button", { type: "button", class: "btn small", onclick: () => { bpmIn.value = String(Math.min(220, Math.round(Number(bpmIn.value) * 2))); redraw(); } }, "Double")),
        h("div", { class: "row tight" }, tapBtn, tapPad), tapNote, followField,
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
    h("div", { class: "row between" }, h("h2", null, "4. The notation"),
      h("div", { class: "row tight" }, scriptSeg, editBtn,
        h("button", { type: "button", class: "btn small", onclick: async () => { try { await navigator.clipboard.writeText(notationText()); toast("Copied."); } catch (e) { toast("Select the text and copy it."); } } }, "Copy"))),
    view, editor,
    h("p", { class: "small muted" }, "Sargam from your flute's Sa: a dot before a note is the lower octave, ' after it the upper. - holds the note a beat longer, _ is a rest, | ends a bar, a pause in a phrase is marked with a gap, a small note in front is a grace note (kan), ~ before a note is a slide into it (meend). The time in front of a line plays that line of the recording."),
    h("div", { class: "row" }, nameIn, h("button", { type: "button", class: "btn", onclick: () => save() }, "Save")),
    h("div", { class: "row tight" },
      h("button", { type: "button", class: "btn small", onclick: () => addToSongs() }, icon("note"), " Add to Songs"),
      h("button", { type: "button", class: "btn small", onclick: () => { if (last) saveBlob(midiBlob(last.notes, Number(bpmIn.value) || 80, nameIn.value || "notation"), fileName("notes").replace(/\.wav$/, ".mid")); } }, icon("share"), " Save as MIDI"),
      h("button", { type: "button", class: "btn small", onclick: () => printNotation() }, "Print")));
  // Songs: the notation joins the Songs page (My songs), for play-along with the course melodies.
  function addToSongs() {
    const title = nameIn.value.trim() || "My song " + today(), list = store("bansuri.mysongs", []);
    const song = { id: "my" + Date.now().toString(36), title, notation: notationText(), bpm: Number(bpmIn.value) || 80, added: today() };
    const i = list.findIndex(x => x.title === title);
    if (i >= 0) list[i] = { ...song, id: list[i].id }; else list.unshift(song);
    storeSet("bansuri.mysongs", list.slice(0, 50));
    toast((i >= 0 ? "Updated in" : "Added to") + " Songs: " + title + ".");
  }
  // Print: only the notation (with its name), as plain text in columns.
  function printNotation() {
    document.body.classList.add("printing-notation");
    notationCard.dataset.title = nameIn.value.trim() || "Notation";
    const done = () => { document.body.classList.remove("printing-notation"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
    setTimeout(done, 1000);
  }

  // One note's text: a slide mark, a small grace note, then the note.
  function noteParts(tok, show) {
    const m = /^(~?)(?:\{([^}]*)\})?(.*)$/.exec(tok);
    return [m[1] ? h("span", { class: "nglide", title: "Slide into this note (meend)" }, "~") : null, m[2] ? h("sup", null, show(m[2])) : null, show(m[3])];
  }
  // A line of the notation, played from the recording (the row is marked while it plays).
  function lineSpan(i) {
    const ts = last.lineTimes, notes = last.notes;
    return [Math.max(0, ts[i] - 0.2), i + 1 < ts.length ? ts[i + 1] : notes.length ? notes[notes.length - 1].t1 + 0.3 : ts[i] + 4];
  }
  let lineStop = null;
  function playLine(i, row) {
    if (!audio || !last) return;
    stopAll();
    const [a, b] = lineSpan(i), c = ac(), src = c.createBufferSource();
    src.buffer = audio; src.connect(master()); src.start(c.currentTime + 0.05, a, b - a);
    row.classList.add("nplaying");
    ear.seek(a);
    if (practiceLine.querySelector("option[value='" + i + "']")) practiceLine.value = String(i);
    const done = () => { row.classList.remove("nplaying"); if (lineStop === stop) lineStop = null; };
    const timer = setTimeout(done, (b - a) * 1000 + 100);
    const stop = () => { clearTimeout(timer); try { src.stop(); } catch (e) { /* already stopped */ } done(); };
    lineStop = stop;
  }

  function drawView() {
    const deva = script === "deva";
    const show = t => deva ? devaNotation(t) : t;
    const cell = tok => {
      if (tok === "|" || tok === "||") return h("span", { class: "nsep", "aria-hidden": "true" }, "|");
      if (tok === ",") return h("span", { class: "npause", "aria-hidden": "true" });
      return h("span", { class: "nc" + (tok === "-" || tok === "_" ? " nhold" : "") }, noteParts(tok, show));
    };
    // Beats in the bars layout can hold several notes ("SR"): those stay together in one cell.
    const lines = notationText().split("\n").filter(l => l.trim());
    // Unedited text: each line shows where it starts in the recording; the time plays that line.
    const timed = last && notationText() === last.notation && last.lineTimes && last.lineTimes.length === lines.length;
    view.classList.toggle("deva", deva);
    view.classList.toggle("timed", !!timed);
    view.replaceChildren(...lines.map((line, li) => h("div", { class: "nrow" }, timed ? h("button", { type: "button", class: "ntime", "aria-label": "Play line " + (li + 1) + " of the recording, from " + clock(last.lineTimes[li]), onclick: e => playLine(li, e.currentTarget.parentNode) }, clock(last.lineTimes[li])) : null, h("span", { class: "ntoks" }, line.trim().split(/\s+/).map(tok => {
      const parts = tok === "|" || tok === "||" || tok === "," ? null : tok.match(NOTE_TOKEN);
      if (!parts || parts.length < 2) return cell(tok);
      return h("span", { class: "nc nmulti" }, parts.map(x => noteParts(x, show)));
    })))));
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
  function stopAll() { players.forEach(p => { if (p.stop) p.btn.click(); }); ear.stop(); if (lineStop) lineStop(); stopPractice(); }
  // Edits by ear: the first edit copies the notes found; each edit can be undone.
  const ear = earTools({ onEdit: (op, id, arg) => {
    if (op === "reset") { manual = null; undo = []; redraw(); return; }
    if (op === "undo") { if (undo.length) { manual = JSON.parse(undo.pop()); redraw(); } return; }
    if (!manual) manual = last.notes.map(n => ({ id: n.id, t0: n.t0, t1: n.t1, midi: n.midi, off: n.off || 0, cents: n.cents || 0, lv: n.lv, edited: n.edited, glide: n.glide, kan: n.kan }));
    undo.push(JSON.stringify(manual)); if (undo.length > 100) undo.shift();
    if (op === "add") {
      // Tuned like the notes around it.
      const near = manual.filter(n => Math.abs(n.t0 - arg.t0) < 10), off = near.length ? near.reduce((a, n) => a + (n.off || 0), 0) / near.length : 0;
      const nn = { id: "u" + Date.now().toString(36), t0: arg.t0, t1: arg.t1, midi: arg.midi, off, cents: 0, lv: 1, edited: true };
      manual.push(nn); manual.sort((a, b) => a.t0 - b.t0);
      redraw();
      return nn.id;
    }
    const i = manual.findIndex(n => n.id === id);
    if (i < 0) return;
    const n = manual[i], shift = { up: 1, down: -1, octUp: 12, octDown: -12 }[op], next = manual[i + 1];
    if (shift) { n.midi += shift; n.edited = true; }
    else if (op === "heard") { n.midi = arg; n.edited = true; }
    else if (op === "shorter") { n.t1 = Math.max(n.t0 + 0.06, n.t1 - 0.1); n.edited = true; }
    else if (op === "longer") { n.t1 = Math.min(next ? next.t0 - 0.01 : n.t1 + 0.1, n.t1 + 0.1); n.edited = true; }
    else if (op === "split" && n.t1 - n.t0 >= 0.12) { const mid = (n.t0 + n.t1) / 2; manual.splice(i + 1, 0, { ...n, id: "u" + Date.now().toString(36), t0: mid + 0.005 }); n.t1 = mid - 0.005; n.edited = true; }
    else if (op === "glide") { n.glide = !n.glide; n.edited = true; }
    else if (op === "delete") manual.splice(i, 1);
    else if (op === "join" && manual[i + 1]) { n.t1 = manual[i + 1].t1; n.edited = true; manual.splice(i + 1, 1); }
    redraw();
  } });
  cleanups.push(() => ear.destroy());
  cleanups.push(() => { stopAll(); if (bench) bench.destroy(); });
  const part = () => { const a = Math.max(0, Number(fromIn.value) || 0), b = Math.min(audio ? audio.duration : 0, Number(toIn.value) || Infinity); return [a, Math.max(a + 0.5, b)]; };
  const playOriginal = gain => {
    const [a, b] = part(), c = ac(), src = c.createBufferSource(), g = c.createGain();
    g.gain.value = gain; src.buffer = audio; src.connect(g); g.connect(master()); src.start(c.currentTime + 0.05, a, b - a);
    return { src, seconds: b - a, stop: () => { try { src.stop(); } catch (e) { /* already stopped */ } } };
  };
  const hzFound = n => 440 * Math.pow(2, (n.midi + (n.off || 0) - 69) / 12);
  // The notes found, at their own times, each at its swara's pitch in the recording's tuning.
  // Made a little ahead of time, not all at once (hundreds of voices at once make the sound crackle).
  const playFound = (at, a, b) => {
    const notes = last.notes.filter(n => n.t1 >= a && n.t0 <= b), c = ac();
    let i = 0, voices = [];
    const pump = () => {
      for (; i < notes.length && at + notes[i].t0 - a < c.currentTime + 1.5; i++) {
        const n = notes[i], st = at + Math.max(0, n.t0 - a), v = makeVoice(hzFound(n), st, { level: 0.16 });
        if (n.glide && notes[i - 1]) v.ramp(hzFound(notes[i - 1]), hzFound(n), st, Math.min(0.25, (n.t1 - n.t0) * 0.5));
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
  async function renderMix(seconds, fill, channels) {
    const c = new OfflineAudioContext(channels || 1, Math.ceil(SR * (seconds + 0.6)), SR);
    fill(c);
    return c.startRendering();
  }
  const renderOriginal = (c, gain) => {
    const [a, b] = part(), src = c.createBufferSource(), g = c.createGain();
    g.gain.value = gain; src.buffer = audio; src.connect(g); g.connect(c.destination); src.start(0, a, b - a);
  };
  const renderFound = (c, level) => {
    const [a, b] = part();
    last.notes.forEach((n, k) => {
      if (n.t1 < a || n.t0 > b) return;
      const st = Math.max(0, n.t0 - a), v = makeVoice(hzFound(n), st, { level, ctx: c, dest: c.destination }), prev = last.notes[k - 1];
      if (n.glide && prev) v.ramp(hzFound(prev), hzFound(n), st, Math.min(0.25, (n.t1 - n.t0) * 0.5));
      v.stop(Math.max(0.05, n.t1 - a));
    });
  };
  // The notes as found (unedited notation): times from the start of the chosen part, held through
  // short gaps the way the notation reads, and pitched from the flute's Sa (n.semi).
  function timedNotes() {
    if (!last || notationText() !== last.notation) return null;
    const [a, b] = part(), list = last.notes.filter(n => n.t1 >= a && n.t0 <= b);
    if (!list.length) return null;
    const notes = list.map((n, i) => { const next = list[i + 1], end = next && next.t0 - n.t1 < 0.25 ? next.t0 : n.t1; return { semi: n.semi, from: n.glide && i ? list[i - 1].semi : null, t0: Math.max(0, n.t0 - a), t1: end - a }; });
    return { notes, seconds: notes[notes.length - 1].t1 + 0.3 };
  }
  // Played a little ahead of time, like the other players.
  function playTimed(tn) {
    const c = ac(), at = c.currentTime + 0.1;
    let i = 0, voices = [];
    const pump = () => {
      for (; i < tn.notes.length && at + tn.notes[i].t0 < c.currentTime + 1.5; i++) {
        const n = tn.notes[i], v = makeVoice(hzOf(n.semi), at + n.t0);
        if (n.from !== null) v.ramp(hzOf(n.from), hzOf(n.semi), at + n.t0, Math.min(0.25, (n.t1 - n.t0) * 0.5));
        v.end = at + n.t1; v.stop(at + Math.max(n.t0 + 0.08, n.t1)); voices.push(v);
      }
      voices = voices.filter(v => v.end > c.currentTime - 0.5);
    };
    pump();
    const timer = setInterval(pump, 250);
    return { seconds: tn.seconds, stop: () => { clearInterval(timer); voices.forEach(v => v.stop()); } };
  }
  const listenCard = h("section", { class: "card" }, h("h2", null, "5. Listen and compare"),
    h("p", { class: "small muted" }, "Hear the recording, then the notation. Together, every wrong note stands out."),
    player("The recording", "The part chosen above.", () => audio && playOriginal(1), async () => {
      if (!audio) return null;
      const [a, b] = part();
      return renderMix(b - a, c => renderOriginal(c, 1), audio.numberOfChannels > 1 ? 2 : 1);
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
      if (tn) return renderMix(tn.seconds, c => tn.notes.forEach(n => {
        const v = makeVoice(hzOf(n.semi), n.t0, { ctx: c, dest: c.destination });
        if (n.from !== null) v.ramp(hzOf(n.from), hzOf(n.semi), n.t0, Math.min(0.25, (n.t1 - n.t0) * 0.5));
        v.stop(Math.max(n.t0 + 0.08, n.t1));
      }));
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
  // Practise a line with the recording: the line loops, slowed down without changing its pitch;
  // the microphone checks each note against the notes found (in the recording's own timing), and
  // after a pass with 80% of the notes right it can speed up.
  const practiceLine = h("select", { class: "input", "aria-label": "Line to practise" });
  let pSpeed = 0.75, practice = null;
  const pSpeedSeg = seg("Practice speed", [[0.5, "50%"], [0.75, "75%"], [1, "100%"]], () => pSpeed, v => { pSpeed = v; if (practice) pPlayer.playbackRate = v; }, () => {});
  const pHear = h("input", { type: "checkbox", id: "tr-phear", checked: true });
  const pAuto = h("input", { type: "checkbox", id: "tr-pauto", checked: true });
  const pBtn = h("button", { type: "button", class: "btn primary", onclick: () => (practice ? stopPractice() : startPractice()) }, icon("mic"), " Start");
  const pOut = h("div", { class: "stack small pout", "aria-live": "polite" });
  const pPlayer = new Audio();
  pPlayer.preservesPitch = true; pPlayer.mozPreservesPitch = true; pPlayer.webkitPreservesPitch = true;
  cleanups.push(() => { stopPractice(); pPlayer.removeAttribute("src"); });
  function fillLines() {
    const keep = practiceLine.value, ts = last ? last.lineTimes || [] : [], lines = last ? last.notation.split("\n").filter(l => l.trim()) : [];
    practiceLine.replaceChildren(...ts.map((t, i) => h("option", { value: String(i) }, "Line " + (i + 1) + " (" + clock(t) + "): " + (lines[i] || "").replace(/[|]/g, " ").split(/\s+/).filter(x => x && x !== "-" && x !== "_" && x !== ",").slice(0, 8).join(" "))));
    if ([...practiceLine.options].some(o => o.value === keep)) practiceLine.value = keep;
  }
  async function startPractice() {
    if (!last || !audioUrl || !last.lineTimes || !last.lineTimes.length) { toast("Make the notation first."); return; }
    const [a, b] = lineSpan(Number(practiceLine.value) || 0), notes = last.notes.filter(n => n.t0 >= a && n.t0 < b);
    if (!notes.length) { toast("That line has no notes."); return; }
    stopAll();
    const p = { readings: [], pass: 0, a, b, notes, off: null, timer: 0, next: 0 };
    // About 0.1 s from the sound reaching the microphone to the reading (its buffer and smoothing).
    try { p.off = await listenMic(r => { if (practice === p && !pPlayer.paused) p.readings.push({ t: pPlayer.currentTime - 0.1 * pPlayer.playbackRate, semi: r.semi }); }); }
    catch (e) { toast("The microphone is not available: " + ((e && e.message) || e)); return; }
    practice = p;
    pBtn.replaceChildren(icon("stop"), " Stop");
    pOut.replaceChildren(h("p", null, "Play the line with the recording" + (pHear.checked ? " (headphones help: the microphone should hear only you)" : "") + "."));
    runPass();
  }
  function runPass() {
    const p = practice; if (!p) return;
    p.readings = [];
    if (pPlayer.src !== audioUrl) pPlayer.src = audioUrl;
    pPlayer.playbackRate = pSpeed; pPlayer.volume = pHear.checked ? 1 : 0;
    pPlayer.currentTime = Math.max(0, p.a - 0.6);
    pPlayer.play().catch(() => {});
    p.timer = setInterval(() => { if (pPlayer.currentTime >= p.b || pPlayer.ended) { clearInterval(p.timer); pPlayer.pause(); endPass(); } }, 50);
  }
  function endPass() {
    const p = practice; if (!p) return;
    const sc = scoreTake(p.notes, p.readings), share = sc.right / p.notes.length, at = Math.round(pSpeed * 100);
    p.pass++;
    let msg = "Pass " + p.pass + " at " + at + "%: " + sc.right + " of " + p.notes.length + " notes right.";
    if (pAuto.checked && share >= 0.8 && pSpeed < 1) { pSpeed = pSpeed === 0.5 ? 0.75 : 1; syncSegs(); msg += " Good: faster now (" + Math.round(pSpeed * 100) + "%)."; }
    else if (share >= 0.8 && pSpeed >= 1) msg += " Right at full speed. Try the next line.";
    else if (share < 0.5) msg += " Listen once more, then try again" + (pSpeed > 0.5 ? " (or slow it down)" : "") + ".";
    const label = { right: "right", octave: "another octave", wrong: "another note", missed: "not heard" };
    pOut.replaceChildren(h("p", null, msg), h("div", { class: "pmarks" }, p.notes.map((n, i) => h("span", { class: "chip " + (sc.marks[i] === "right" ? "good" : sc.marks[i] === "missed" ? "mutedc" : "bad"), title: codeOf(n.semi) + ": " + label[sc.marks[i]] }, codeOf(n.semi), h("span", { class: "sr-only" }, ", " + label[sc.marks[i]])))));
    p.next = setTimeout(runPass, 1500);
  }
  function stopPractice() {
    const p = practice; if (!p) return;
    practice = null;
    clearInterval(p.timer); clearTimeout(p.next); if (p.off) p.off();
    pPlayer.pause();
    pBtn.replaceChildren(icon("mic"), " Start");
  }
  const practiceBox = h("div", { class: "stack practice" },
    h("h3", null, "Practise a line with the recording"),
    h("p", { class: "small muted" }, "The line loops, slowed down without changing its pitch, and the microphone checks every note against the recording. After a pass with most notes right it speeds up. A time in front of a line of the notation picks that line too."),
    h("div", { class: "row tight" }, h("label", { class: "field grow" }, "Line", practiceLine), h("div", { class: "field" }, h("span", null, "Speed"), pSpeedSeg)),
    h("div", { class: "row tight" }, h("label", { class: "check small", for: "tr-phear" }, pHear, "Hear the recording"), h("label", { class: "check small", for: "tr-pauto" }, pAuto, "Speed up when I get it right")),
    h("div", { class: "row tight" }, pBtn), pOut);
  const alongCard = h("section", { class: "card" }, h("h2", null, "6. Play along"),
    h("p", { class: "small muted" }, "The notation in the practice player: loop a part, slow it down, and the microphone checks each note you play."),
    alongBtn, benchHost, practiceBox);

  // ---- Redraw from the settings ----
  function redraw() {
    if (!track) return;
    const flute = Number(fluteSel.value), [a, b] = part();
    const p = opt.part, src = p === "singer" || p === "background" ? parts[p] : track;
    const base = { sa: Number(saSel.value), flute, sameKey: opt.sameKey, bpm: Number(bpmIn.value) || undefined, phase: opt.phase, sub: Number(subSel.value), octave: opt.octave, main: opt.main, layout: opt.layout, from: a, to: b,
      easy: opt.easy, taps: opt.taps || undefined, follow: !midi && opt.follow, beats: midi && midi.tempoChanges ? midi.beats : undefined };
    const given = manual || midiNotes;
    const r = given ? transcribe(null, null, { ...base, notes: given, tonics: midiTonics, phase: opt.phase !== undefined ? opt.phase : midi ? 0 : undefined })
      : p === "best" && parts.singer && parts.background ? transcribe(null, null, { ...base, runs: bestRuns(parts.singer, parts.background), playable: true })
      : transcribe((src || track).track, (src || track).levels, base);
    r.notes.forEach((n, i) => { if (n.id === undefined) n.id = "n" + i; });
    // Which parts can be chosen: only a stereo recording can be split.
    partNote.textContent = sepDone && p !== "whole" ? SEP_TEXT[p] : PART_TEXT[p] + (p !== "whole" && !stereo ? " " + MONO_NOTE : "");
    drawSep();
    last = r;
    octOut.textContent = r.shift > 0 ? "+" + r.shift / 12 : String(r.shift / 12);
    editor.value = r.notation; drawView();
    const saName = WEST[((r.sa % 12) + 12) % 12], fit = r.fit, mine = saMidi();
    const outOf = fit.below + fit.reg3;
    const sc = r.scale, odd = r.notes.filter(n => n.odd).length, tr = r.tempoRange;
    chips.replaceChildren(
      h("span", { class: "chip info" }, "Sa " + saName + (r.tune ? " (" + (r.tune > 0 ? "+" : "") + r.tune + " cents)" : "")),
      h("span", { class: "chip mutedc" }, tr && tr[1] - tr[0] >= 6 ? "Tempo " + tr[0] + " to " + tr[1] + " BPM" : r.bpm + " BPM"),
      sc && sc.name ? h("span", { class: "chip info", title: sc.kind === "raga" ? "The same five notes as raga " + sc.name + " (a raga is more than its notes)" : sc.name + " thaat: " + sc.note }, sc.kind === "raga" ? "Notes of raga " + sc.name : sc.name + " thaat") : null,
      odd ? h("button", { type: "button", class: "chip warn chiplink", title: "Notes outside the scale: often a wrong note. Check them by ear.", onclick: () => { document.getElementById("tr-ear").scrollIntoView({ behavior: "smooth", block: "start" }); ear.nextOdd(); } }, odd + (odd === 1 ? " odd note: check it" : " odd notes: check them")) : null,
      h("span", { class: "chip mutedc" }, r.notes.length + " notes, " + codeOf(fit.lo) + " to " + codeOf(fit.hi)),
      outOf ? h("span", { class: "chip bad" }, outOf + " notes out of the flute's range") : fit.high ? h("span", { class: "chip warn" }, fit.high + " very high notes") : h("span", { class: "chip good" }, icon("check"), " Fits your flute"));
    const tips = [];
    if (r.flute !== null && opt.sameKey && r.flute !== flute) tips.push(h("p", null, "A flute with Sa " + saName + " plays it with the same notes as the recording: ", h("button", { type: "button", class: "linkbtn", onclick: () => { fluteSel.value = String(r.flute); opt.octave = 0; redraw(); } }, "use " + fluteLabel(r.flute)), "."));
    if (r.flute !== null && !opt.sameKey && r.flute % 12 !== flute % 12) tips.push(h("p", null, "To play along with the recording itself, use a flute with Sa " + saName + ": ", h("button", { type: "button", class: "linkbtn", onclick: () => { fluteSel.value = String(r.flute); opt.octave = 0; redraw(); } }, "use " + fluteLabel(r.flute)), "."));
    if (outOf) tips.push(h("p", null, "Try the octave buttons" + (opt.sameKey ? ", another flute, or \"My flute's own key\"." : ".")));
    if (flute !== mine) tips.push(h("p", null, "The notation player and play-along use your flute in Settings (" + fluteLabel(mine) + "). ", h("button", { type: "button", class: "linkbtn", onclick: () => { setSettings({ saNote: flute % 12, saOct: Math.floor(flute / 12) - 1 }); toast("Your flute is now " + fluteLabel(flute) + "."); redraw(); } }, "Make " + fluteLabel(flute) + " my flute"), "."));
    hints.replaceChildren(...tips);
    hints.hidden = !tips.length;
    const line = (p === "best" ? parts.singer : src) || track;
    ear.show({ notes: r.notes, frames: line.track, tune: r.tune / 100, zero: r.base - r.shift, url: p === "singer" && vocalsUrl ? vocalsUrl : audioUrl, duration: audio ? audio.duration : 0, edited: !!manual, canUndo: undo.length > 0 });
    fillLines();
  }

  // ---- Your recordings (kept in the app) ----
  const capList = h("div", { class: "stack" });
  const capUse = h("p", { class: "small muted" });
  const settingsNow = () => ({ sa: Number(saSel.value), flute: Number(fluteSel.value), sameKey: opt.sameKey, layout: opt.layout, octave: opt.octave, main: opt.main, part: opt.part, phase: opt.phase, midiTrack: midi ? Number(midiSel.value) : undefined, bpm: Number(bpmIn.value) || 80, from: Number(fromIn.value) || 0, to: Number(toIn.value) || 0, sub: Number(subSel.value), follow: opt.follow, easy: opt.easy, taps: opt.taps || undefined });
  async function save() {
    const name = nameIn.value.trim() || "Recording of " + today();
    try {
      if (current) await patchCapture(current.id, { name, notation: notationText(), settings: settingsNow(), manual, saved: new Date().toISOString() });
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

  // A bar of links to the steps (the page is long once a recording is open).
  [[foundCard, "found"], [ear.el, "ear"], [notationCard, "notation"], [listenCard, "listen"], [alongCard, "along"]].forEach(([c, id]) => { c.id = "tr-" + id; });
  const stepBar = h("nav", { class: "trsteps", "aria-label": "Steps" },
    [["found", "Found"], ["ear", "Check by ear"], ["notation", "Notation"], ["listen", "Listen"], ["along", "Play along"]].map(([id, label]) =>
      h("button", { type: "button", class: "btn small ghost", onclick: () => document.getElementById("tr-" + id).scrollIntoView({ behavior: "smooth", block: "start" }) }, label)));
  const results = h("div", { class: "stack trresults", hidden: true }, stepBar, foundCard, ear.el, notationCard, listenCard, alongCard);
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
