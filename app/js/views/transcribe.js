// Notation from a recording (#/transcribe): sound from a browser tab (a YouTube video playing in
// another tab), the microphone or a file; the notes as sargam for any flute, to check by ear, fix,
// play along with and save. The analysis is in ../transcribe.js; nothing leaves the device.
import { h, toast, store, storeSet, today } from "../util.js";
import { setSettings, saMidi } from "../core/settings.js";
import { ac, master } from "../core/audio.js";
import { decodeAudioFile, drawPitchPlot } from "../core/pitch.js";
import { parseNotation, buildEvents, playEvents } from "../core/notation.js";
import { countdown } from "../core/live.js";
import { mountBench } from "../bench/bench.js";
import { WEST, codeOf } from "../core/theory.js";
import { monoDown, pitchTrack, transcribe, tonicMidi, fluteLabel, FLUTES } from "../transcribe.js";

const SAVED = "bansuri.transcribed";
const MAX_SECONDS = 360;

export async function render(main) {
  const page = h("div", { class: "page" });
  main.append(page);
  const cleanups = [];
  let audio = null, track = null, origStop = null, draftStop = null, bench = null, capture = null;

  const status = h("p", { class: "small", role: "status", "aria-live": "polite" });
  const canTab = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !/Android|iPhone|iPad|iPod/.test(navigator.userAgent);
  const fileIn = h("input", { type: "file", accept: "audio/*,video/*", class: "sr-only", id: "tr-file", "aria-label": "Choose an audio file" });
  const stopBtn = h("button", { type: "button", class: "btn primary", hidden: true }, "Stop and make notation");

  // ---- Getting the sound ----
  // A stream (a shared tab's sound, or the microphone) is recorded until Stop (or 6 minutes).
  async function recordStream(stream, label) {
    const tracks = stream.getAudioTracks();
    if (!tracks.length) { stream.getTracks().forEach(t => t.stop()); toast("No sound was shared. Choose the tab again and turn on \"Share tab audio\"."); return; }
    const rec = new MediaRecorder(new MediaStream(tracks)), chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const started = Date.now();
    const tick = setInterval(() => {
      const s = Math.round((Date.now() - started) / 1000);
      status.textContent = label + " " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + ". Press Stop when the part you want has played.";
      if (s >= MAX_SECONDS) stop();
    }, 500);
    const done = new Promise(res => { rec.onstop = res; });
    function stop() {
      clearInterval(tick);
      if (rec.state !== "inactive") rec.stop();
      stream.getTracks().forEach(t => t.stop());
      stopBtn.hidden = true; capture = null;
    }
    capture = stop;
    tracks[0].addEventListener("ended", stop);
    stopBtn.hidden = false;
    stopBtn.onclick = stop;
    rec.start(1000);
    await done;
    if (!chunks.length) { status.textContent = "Nothing was recorded."; return; }
    await analyse(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
  }
  cleanups.push(() => { if (capture) capture(); });

  const tabBtn = h("button", { type: "button", class: "btn primary", onclick: async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, selfBrowserSurface: "exclude", systemAudio: "include" });
      await recordStream(stream, "Listening to the tab:");
    } catch (e) { if (e && e.name !== "NotAllowedError") toast("Could not share the tab: " + (e.message || e)); }
  } }, "Listen to a browser tab");
  const micBtn = h("button", { type: "button", class: "btn", onclick: async () => {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
    catch (e) { toast("The microphone is not available: " + (e.message || e)); return; }
    if (!await countdown(status.parentNode, { btn: micBtn, label: "Get ready: start the music" })) { stream.getTracks().forEach(t => t.stop()); return; }
    await recordStream(stream, "Listening:");
  } }, "Use the microphone");
  fileIn.addEventListener("change", () => { const f = fileIn.files && fileIn.files[0]; if (f) analyse(f); fileIn.value = ""; });

  // ---- Analysis ----
  async function analyse(blob) {
    stopAll();
    result.hidden = true;
    status.textContent = "Reading the sound...";
    try { audio = await decodeAudioFile(blob); }
    catch (e) { status.textContent = "This browser could not read that sound. Try an mp3, m4a, wav or ogg file."; return; }
    const ch = []; for (let i = 0; i < audio.numberOfChannels; i++) ch.push(audio.getChannelData(i));
    const { data, sr } = monoDown(ch, audio.sampleRate);
    const t = await pitchTrack(data, sr, { maxSeconds: MAX_SECONDS, onProgress: p => { status.textContent = "Finding the notes... " + p + "%"; } });
    track = t;
    const first = transcribe(t.track, t.levels, { flute: fluteSel.value ? Number(fluteSel.value) : saMidi() });
    if (first.notes.length < 3) { status.textContent = "No clear melody was found. It works best with one clear tune: a solo flute, a single voice, or a song where the tune is much louder than the rest."; return; }
    // The recording's Sa, most likely first; the learner can change it.
    saSel.replaceChildren(...first.tonics.map((c, i) => {
      const m = tonicMidi(c.pc, first.notes);
      return h("option", { value: String(m) }, WEST[c.pc] + (i === 0 ? " (most likely)" : ""));
    }));
    bpmIn.value = String(first.bpm);
    octave = 0;
    status.textContent = "Done" + (t.truncated ? " (the first 6 minutes)" : "") + ". This is a draft: play it next to the original and fix what is wrong.";
    result.hidden = false;
    redraw();
  }

  // ---- Options and result ----
  const saSel = h("select", { class: "input", "aria-label": "Sa of the recording", style: { width: "auto" } });
  const fluteSel = h("select", { class: "input", "aria-label": "Your flute", style: { width: "auto" } }, FLUTES.map(m => h("option", { value: String(m) }, fluteLabel(m))));
  fluteSel.value = String(Math.min(81, Math.max(60, saMidi())));
  const keyMode = h("select", { class: "input", "aria-label": "Key", style: { width: "auto" } },
    h("option", { value: "same" }, "Play along with the recording (same key)"),
    h("option", { value: "own" }, "Keep its sargam, in my flute's own key"));
  const bpmIn = h("input", { class: "input", type: "number", min: "30", max: "220", step: "1", "aria-label": "Tempo (BPM)", style: { width: "5.5rem" } });
  const subSel = h("select", { class: "input", "aria-label": "Notes per beat", style: { width: "auto" } }, h("option", { value: "2" }, "Up to 2 notes per beat"), h("option", { value: "4" }, "Up to 4 notes per beat"), h("option", { value: "1" }, "1 note per beat"));
  let octave = 0;
  const info = h("div", { class: "stack small" });
  const notation = h("textarea", { class: "input mono", rows: "8", "aria-label": "Notation (you can edit it)", spellcheck: "false" });
  const canvas = h("canvas", { class: "plot", "aria-label": "The recording's pitch over time, with the notes found" });
  const benchHost = h("div", { class: "toolhost", hidden: true });
  const saved = h("div", { class: "stack" });

  function redraw() {
    if (!track) return;
    const flute = Number(fluteSel.value), sameKey = keyMode.value === "same";
    const r = transcribe(track.track, track.levels, { sa: Number(saSel.value), flute, sameKey, bpm: Number(bpmIn.value) || undefined, sub: Number(subSel.value), octave });
    notation.value = r.notation;
    const saName = WEST[((r.sa % 12) + 12) % 12];
    const fit = r.fit;
    const fitText = fit.below || fit.reg3 ? (fit.below + fit.reg3) + " notes are outside what a 6-hole bansuri can play: try another octave" + (sameKey ? " or another flute." : ".")
      : fit.high ? fit.high + " notes are very high (above G'): possible, but hard." : "Every note is in your flute's easy range.";
    const mine = saMidi();
    info.replaceChildren(
      h("p", null, h("b", null, "Sa of the recording: "), saName + (r.tune ? " (tuned " + (r.tune > 0 ? "+" : "") + r.tune + " cents from A = 440)" : "") + ". ",
        r.flute !== null && sameKey && r.flute !== flute ? h("span", null, "A flute in " + saName + " plays it without changing notes: ", h("button", { type: "button", class: "linkbtn", onclick: () => { fluteSel.value = String(r.flute); redraw(); } }, fluteLabel(r.flute)), ".") : null),
      h("p", null, h("b", null, "Notes: "), r.notes.length + " found, range " + codeOf(fit.lo) + " to " + codeOf(fit.hi) + ". " + fitText),
      flute !== mine ? h("p", null, "Play and play-along use your flute in Settings (" + fluteLabel(mine) + "). ", h("button", { type: "button", class: "linkbtn", onclick: () => { setSettings({ saNote: flute % 12, saOct: Math.floor(flute / 12) - 1 }); toast("Your flute is now " + fluteLabel(flute) + "."); redraw(); } }, "Make " + fluteLabel(flute) + " my flute"), ".") : null);
    // The pitch line and the notes found, drawn against the flute's Sa.
    const base = r.base - r.shift, hop = 0.02;
    const frames = track.track.map(m => m === null ? null : { s: m - base, f: 0 });
    requestAnimationFrame(() => drawPitchPlot(canvas, { frames, hopS: hop, segments: r.notes.map(n => ({ t0: n.t0, t1: n.t1, med: n.midi - base + n.cents / 100 })) }));
  }
  [saSel, fluteSel, keyMode, subSel].forEach(el => el.addEventListener("change", () => { octave = 0; redraw(); }));
  bpmIn.addEventListener("change", redraw);

  // ---- Listening, playing, saving ----
  function stopAll() {
    if (origStop) { origStop(); origStop = null; }
    if (draftStop) { draftStop(); draftStop = null; }
  }
  cleanups.push(() => { stopAll(); if (bench) bench.destroy(); });
  const playOriginal = () => {
    if (origStop) { stopAll(); return; }
    stopAll();
    const c = ac(), src = c.createBufferSource();
    src.buffer = audio; src.connect(master()); src.start();
    src.onended = () => { origStop = null; };
    origStop = () => { try { src.stop(); } catch (e) { /* already stopped */ } };
  };
  const playDraft = () => {
    if (draftStop) { stopAll(); return; }
    stopAll();
    const b = buildEvents(parseNotation(notation.value).tokens, Number(bpmIn.value) || 80);
    if (!b.ev.length) { toast("The notation has no notes."); return; }
    draftStop = playEvents(b.ev, b.beats, { bpm: Number(bpmIn.value) || 80, click: false, onEnd: () => { draftStop = null; } });
  };
  const playAlong = () => {
    if (bench) { bench.destroy(); bench = null; benchHost.hidden = true; return; }
    stopAll();
    bench = mountBench(benchHost, { compact: true, tabs: ["play"], tab: "play", notation: notation.value, bpm: Number(bpmIn.value) || 80 });
    benchHost.hidden = false;
  };
  const nameIn = h("input", { class: "input", maxlength: "60", "aria-label": "Name", placeholder: "Name (for example the song's name)" });
  const save = () => {
    const list = store(SAVED, []);
    list.unshift({ name: nameIn.value.trim() || "Recording of " + today(), notation: notation.value, bpm: Number(bpmIn.value) || 80, flute: Number(fluteSel.value), date: today() });
    storeSet(SAVED, list.slice(0, 30));
    toast("Saved."); drawSaved();
  };
  function drawSaved() {
    const list = store(SAVED, []);
    saved.replaceChildren(...(list.length ? list.map((m, i) => h("div", { class: "savedrow" },
      h("div", { class: "row between" }, h("b", null, m.name), h("span", { class: "small muted" }, m.bpm + " BPM, " + fluteLabel(m.flute || 72))),
      h("pre", { class: "mono small" }, m.notation),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn small", onclick: () => { if (bench) bench.destroy(); bench = mountBench(benchHost, { compact: true, tabs: ["play"], tab: "play", notation: m.notation, bpm: m.bpm }); benchHost.hidden = false; result.hidden = false; benchHost.scrollIntoView({ block: "nearest" }); } }, "Play along"),
        h("button", { type: "button", class: "btn small ghost", onclick: () => { const l = store(SAVED, []); l.splice(i, 1); storeSet(SAVED, l); drawSaved(); } }, "Delete")))) : [h("p", { class: "small muted" }, "Notations you save appear here.")]));
  }

  const octBtn = (d, label) => h("button", { type: "button", class: "btn small", onclick: () => { octave += d; redraw(); } }, label);
  const result = h("section", { class: "card", hidden: true },
    h("h2", null, "2. The notation"),
    h("div", { class: "row" }, h("label", { class: "field" }, "Sa of the recording", saSel), h("label", { class: "field" }, "Your flute", fluteSel), h("label", { class: "field" }, "Key", keyMode)),
    h("div", { class: "row" }, h("label", { class: "field" }, "Tempo (BPM)", bpmIn),
      h("button", { type: "button", class: "btn small", onclick: () => { bpmIn.value = String(Math.max(30, Math.round(Number(bpmIn.value) / 2))); redraw(); } }, "Half"),
      h("button", { type: "button", class: "btn small", onclick: () => { bpmIn.value = String(Math.min(220, Math.round(Number(bpmIn.value) * 2))); redraw(); } }, "Double"),
      h("label", { class: "field" }, "Detail", subSel), octBtn(-12, "Octave down"), octBtn(12, "Octave up")),
    info,
    notation,
    h("div", { class: "row" },
      h("button", { type: "button", class: "btn", onclick: playOriginal }, "Hear the original"),
      h("button", { type: "button", class: "btn", onclick: playDraft }, "Hear the notation"),
      h("button", { type: "button", class: "btn primary", onclick: playAlong }, "Play along"),
      h("button", { type: "button", class: "btn", onclick: async () => { try { await navigator.clipboard.writeText(notation.value); toast("Copied."); } catch (e) { toast("Select the text and copy it."); } } }, "Copy")),
    h("div", { class: "row" }, nameIn, h("button", { type: "button", class: "btn", onclick: save }, "Save")),
    benchHost,
    h("details", null, h("summary", null, "See the pitch line"), canvas,
      h("p", { class: "small muted" }, "Dots are the pitch heard every 20 ms; bars are the notes found. Glides and grace notes shorter than 80 ms are left out of the notation.")));

  page.append(
    h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Notation from a recording"), h("h1", null, "Turn a recording into sargam"),
      h("p", { class: "muted" }, "Play a song or a recording, and the app writes down its notes as sargam for your flute. Works best with one clear melody: a solo flute, a single voice, or a song where the tune is much louder than the music behind it. With a full band behind the tune the notes come out wrong. Either way it is a draft: hear it next to the original and fix what is wrong.")),
    h("section", { class: "card" }, h("h2", null, "1. Get the sound"),
      canTab ? h("p", { class: "small" }, h("b", null, "From YouTube or any website: "), "open the video in another tab, press \"Listen to a browser tab\", choose that tab and turn on \"Share tab audio\", then play the part you want and press Stop.") : null,
      h("p", { class: "small muted" }, canTab ? "Or play it near the microphone, or choose a file you have." : "Play the song near the microphone (from another device, or the speaker), or choose a file you have. Listening to a tab directly works in Chrome or Edge on a computer."),
      h("div", { class: "row" }, canTab ? tabBtn : null, micBtn, h("label", { class: "btn", for: "tr-file" }, "Choose a file"), fileIn, stopBtn),
      status,
      h("p", { class: "small muted" }, "Everything happens on this device: the sound is not uploaded or kept. Use recordings you are allowed to use.")),
    result,
    h("section", { class: "card" }, h("h2", null, "Saved notations"), saved));
  drawSaved();
  return () => cleanups.forEach(f => f());
}
