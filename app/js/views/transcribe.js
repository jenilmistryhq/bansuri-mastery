// Notation from a recording (#/transcribe): sound from a browser tab (a YouTube video playing in
// another tab), the microphone or a file; the notes as sargam for any flute, to check by ear, fix,
// play along with and save. The analysis is in ../transcribe.js; nothing leaves the device.
// Steps on the page: 1 get the sound, 2 what was found (and the settings), 3 the notation,
// 4 listen and compare, 5 play along; then saved notations.
import { h, toast, store, storeSet, today, icon } from "../util.js";
import { getSettings, setSettings, saMidi } from "../core/settings.js";
import { ac, master, makeVoice } from "../core/audio.js";
import { decodeAudioFile, drawPitchPlot } from "../core/pitch.js";
import { parseNotation, buildEvents, playEvents } from "../core/notation.js";
import { countdown } from "../core/live.js";
import { mountBench } from "../bench/bench.js";
import { WEST, codeOf, devaNotation } from "../core/theory.js";
import { monoDown, pitchTrack, transcribe, tonicMidi, fluteLabel, FLUTES, HOP } from "../transcribe.js";

const SAVED = "bansuri.transcribed";
const MAX_SECONDS = 360;
// One note in a beat: an optional {kan}, lower-octave dots, the letter, upper-octave marks; or - or _.
const NOTE_TOKEN = /\{[^}]*\}\.*[SrRgGmMPdDnN]'*|\.*[SrRgGmMPdDnN]'*|[-_]/g;
const clock = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

export async function render(main) {
  const page = h("div", { class: "page trpage" });
  main.append(page);
  const cleanups = [];
  let audio = null, track = null, capture = null, bench = null, last = null;
  const opt = { octave: 0, sameKey: true, layout: "phrases" };

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
    await analyse(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
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
  fileIn.addEventListener("change", () => { const f = fileIn.files && fileIn.files[0]; if (f) analyse(f); fileIn.value = ""; });
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
  async function analyse(blob) {
    stopAll(); results.hidden = true;
    setBusy("Reading the sound...", 0);
    try { audio = await decodeAudioFile(blob); }
    catch (e) { setBusy("This browser could not read that sound. Try an mp3, m4a, wav or ogg file.", null); return; }
    const ch = []; for (let i = 0; i < audio.numberOfChannels; i++) ch.push(audio.getChannelData(i));
    const { data, sr } = monoDown(ch, audio.sampleRate);
    track = await pitchTrack(data, sr, { maxSeconds: MAX_SECONDS, onProgress: p => setBusy("Finding the melody... " + p + "%", p) });
    const first = transcribe(track.track, track.levels, { flute: saMidi() });
    if (first.notes.length < 3) { setBusy("No clear melody was found. It works best when one tune (a flute or a voice) is clearly louder than the rest.", null); return; }
    saSel.replaceChildren(...first.tonics.map((c, i) => h("option", { value: String(tonicMidi(c.pc, first.notes)) }, WEST[c.pc] + (i === 0 ? " (most likely)" : ""))));
    bpmIn.value = String(first.bpm);
    fromIn.value = "0"; toIn.value = String(Math.round(track.seconds)); toIn.max = fromIn.max = String(Math.ceil(track.seconds));
    opt.octave = 0;
    setBusy("Done" + (track.truncated ? " (the first 6 minutes)" : "") + ". Check the notes below by ear: this is a draft.", null);
    results.hidden = false;
    redraw();
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---- 2. What was found, and the settings ----
  const saSel = h("select", { class: "input", "aria-label": "Sa of the recording" });
  const fromIn = h("input", { class: "input", type: "number", min: "0", step: "1", "aria-label": "From (seconds)" });
  const toIn = h("input", { class: "input", type: "number", min: "0", step: "1", "aria-label": "To (seconds)" });
  const fluteSel = h("select", { class: "input", "aria-label": "Your flute" }, FLUTES.map(m => h("option", { value: String(m) }, fluteLabel(m))));
  fluteSel.value = String(Math.min(81, Math.max(60, saMidi())));
  const seg = (name, items, get, set) => {
    const btns = items.map(([v, label]) => h("button", { type: "button", class: "seg-btn", "aria-pressed": String(get() === v), onclick: () => { set(v); btns.forEach((b, i) => b.setAttribute("aria-pressed", String(items[i][0] === get()))); redraw(); } }, label));
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
  const foundCard = h("section", { class: "card" }, h("h2", null, "2. What the app found"), chips,
    h("details", { class: "trplot" }, h("summary", null, "See the pitch line"), canvas,
      h("p", { class: "small muted" }, "Dots are the melody's pitch every 20 ms; bars are the notes found. Slides and grace notes shorter than 80 ms are not notes of their own.")),
    h("div", { class: "trgroups" },
      group("The recording", field("Sa", saSel), h("div", { class: "row tight" }, field("From (s)", fromIn), field("To (s)", toIn))),
      group("Your flute", field("Flute", fluteSel), h("div", { class: "field" }, h("span", null, "Write it in"), keySeg), h("div", { class: "field" }, h("span", null, "Octave"), octave)),
      group("Rhythm", h("div", { class: "field" }, h("span", null, "Layout"), layoutSeg),
        h("div", { class: "row tight" }, field("Tempo (BPM)", bpmIn),
          h("button", { type: "button", class: "btn small", onclick: () => { bpmIn.value = String(Math.max(30, Math.round(Number(bpmIn.value) / 2))); redraw(); } }, "Half"),
          h("button", { type: "button", class: "btn small", onclick: () => { bpmIn.value = String(Math.min(220, Math.round(Number(bpmIn.value) * 2))); redraw(); } }, "Double")),
        detailField)),
    hints);

  // ---- 3. The notation ----
  const view = h("div", { class: "nview", "aria-label": "Notation" });
  const editor = h("textarea", { class: "input mono", rows: "8", "aria-label": "Notation (you can edit it)", spellcheck: "false", hidden: true });
  const editBtn = h("button", { type: "button", class: "btn small", onclick: () => {
    const editing = editor.hidden;
    editor.hidden = !editing; view.hidden = editing;
    editBtn.textContent = editing ? "Done editing" : "Edit";
    if (!editing) drawView();
  } }, "Edit");
  const nameIn = h("input", { class: "input", maxlength: "60", "aria-label": "Name", placeholder: "Name (for example the song's name)" });
  const notationText = () => editor.value;
  const notationCard = h("section", { class: "card" },
    h("div", { class: "row between" }, h("h2", null, "3. The notation"),
      h("div", { class: "row tight" }, editBtn,
        h("button", { type: "button", class: "btn small", onclick: async () => { try { await navigator.clipboard.writeText(notationText()); toast("Copied."); } catch (e) { toast("Select the text and copy it."); } } }, "Copy"))),
    view, editor,
    h("p", { class: "small muted" }, "Sargam from your flute's Sa: a dot before a note is the lower octave, ' after it the upper. - holds the note a beat longer, _ is a rest, a small note in front is a grace note (kan)."),
    h("div", { class: "row" }, nameIn, h("button", { type: "button", class: "btn", onclick: () => save() }, "Save")));

  // The notation drawn as bars and beats (or phrases), from the text, so edits show too.
  function drawView() {
    const deva = getSettings().deva;
    const note = tok => {
      const m = /^\{([^}]*)\}(.*)$/.exec(tok);
      const show = t => deva ? devaNotation(t) : t;
      return m ? h("span", { class: "ntok" }, h("sup", null, show(m[1])), show(m[2])) : h("span", { class: "ntok" + (tok === "-" || tok === "_" ? " nhold" : "") }, tok === "," ? "," : show(tok));
    };
    const lines = notationText().split("\n").filter(l => l.trim());
    view.replaceChildren(...lines.map(line => {
      // Phrases: each stretch between pauses (",") in its own box.
      if (!line.includes("|")) return h("div", { class: "nline" }, line.split(",").map(ph => ph.trim()).filter(Boolean).map(ph => h("div", { class: "nbar nphrase" }, ph.split(/\s+/).map(note))));
      const bars = line.replace(/\|\|\s*$/, "").split("|").map(b => b.trim()).filter(Boolean);
      return h("div", { class: "nline" }, bars.map(b => h("div", { class: "nbar" }, b.split(/\s+/).map(beat => h("span", { class: "nbeat" }, (beat.match(NOTE_TOKEN) || [beat]).map(note))))));
    }));
    if (!lines.length) view.append(h("p", { class: "small muted" }, "No notes."));
  }

  // ---- 4. Listen and compare ----
  const players = [];
  function player(title, text, start) {
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
    return h("div", { class: "playrow" }, btn, h("div", { class: "playinfo" }, h("b", null, title), h("span", { class: "small muted" }, text), h("div", { class: "progressbar thin" }, fill)), time);
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
  const playFound = (at, a, b) => {
    const voices = [];
    for (const n of last.notes) {
      if (n.t1 < a || n.t0 > b) continue;
      const v = makeVoice(440 * Math.pow(2, (n.midi + n.off - 69) / 12), at + Math.max(0, n.t0 - a), { level: 0.16 });
      v.stop(at + Math.max(0.05, n.t1 - a)); voices.push(v);
    }
    return () => voices.forEach(v => v.stop());
  };
  const listenCard = h("section", { class: "card" }, h("h2", null, "4. Listen and compare"),
    h("p", { class: "small muted" }, "Hear the recording, then the notation. Together, every wrong note stands out."),
    player("The recording", "The part chosen above.", () => audio && playOriginal(1)),
    player("The notation", "As written, at the tempo above, on your flute (Settings).", () => {
      const bpm = Number(bpmIn.value) || 80, b = buildEvents(parseNotation(notationText()).tokens, bpm);
      if (!b.ev.length) { toast("The notation has no notes."); return null; }
      const stop = playEvents(b.ev, b.beats, { bpm, click: false });
      return { seconds: b.total, stop };
    }),
    player("Both together", "The recording with the notes found played over it, at the same moments.", () => {
      if (!audio || !last) return null;
      const o = playOriginal(0.8), [a, b] = part(), stopNotes = playFound(ac().currentTime + 0.05, a, b);
      return { seconds: o.seconds, stop: () => { o.stop(); stopNotes(); } };
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
    const r = transcribe(track.track, track.levels, { sa: Number(saSel.value), flute, sameKey: opt.sameKey, bpm: Number(bpmIn.value) || undefined, sub: Number(subSel.value), octave: opt.octave, layout: opt.layout, from: a, to: b });
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
    const base = r.base - r.shift;
    requestAnimationFrame(() => drawPitchPlot(canvas, { frames: track.track.map(m => m === null ? null : { s: m - base, f: 0 }), hopS: HOP, segments: r.notes.map(n => ({ t0: n.t0, t1: n.t1, med: n.midi - base + n.cents / 100 })) }));
  }

  // ---- Saved notations ----
  const saved = h("div", { class: "stack" });
  function save() {
    const list = store(SAVED, []);
    list.unshift({ name: nameIn.value.trim() || "Recording of " + today(), notation: notationText(), bpm: Number(bpmIn.value) || 80, flute: Number(fluteSel.value), date: today() });
    storeSet(SAVED, list.slice(0, 30));
    toast("Saved."); drawSaved();
  }
  function drawSaved() {
    const list = store(SAVED, []);
    saved.replaceChildren(...(list.length ? list.map((m, i) => h("div", { class: "savedrow" },
      h("div", { class: "row between" }, h("b", null, m.name), h("span", { class: "small muted" }, m.bpm + " BPM, " + fluteLabel(m.flute || 72))),
      h("pre", { class: "mono small" }, m.notation),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn small", onclick: () => openBench(m.notation, m.bpm) }, "Play along"),
        h("button", { type: "button", class: "btn small ghost", onclick: () => { const l = store(SAVED, []); l.splice(i, 1); storeSet(SAVED, l); drawSaved(); } }, "Delete")))) : [h("p", { class: "small muted" }, "Notations you save appear here.")]));
  }

  const results = h("div", { class: "stack trresults", hidden: true }, foundCard, notationCard, listenCard, alongCard);
  page.append(
    h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Notation from a recording"), h("h1", null, "Turn a recording into sargam"),
      h("p", { class: "muted" }, "Play a song, and the app writes its melody as sargam for your flute, to check by ear, fix and play along with."),
      h("details", { class: "small" }, h("summary", null, "What works well"),
        h("p", null, "Best: one clear melody, such as a solo flute or a voice, with a drone, tabla or soft music behind it. Hard: a melody no louder than the music behind it (a full film orchestra, harmonium chords as loud as the tune). Either way it is a draft: compare it with the recording and fix what is wrong. Slides and fast ornaments are simplified."),
        h("p", null, "Everything happens on this device: the sound is not uploaded or kept. Use recordings you are allowed to use."))),
    srcCard, results,
    h("section", { class: "card" }, h("h2", null, "Saved notations"), saved));
  drawSaved();
  return () => cleanups.forEach(f => f());
}
