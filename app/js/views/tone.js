// Tone check (#/tone): hold one note for six seconds; the app measures what a microphone can hear
// of the tone (core/pitch.js toneProfile) and compares it with a reference player and with the
// learner's own best. What a microphone cannot judge (posture, lips, breath from the belly) is a
// checklist. Results are kept in this browser (bansuri.tone.history).
import { h, toast, store, storeSet, today, icon } from "../util.js";
import { codeOf, hzOf } from "../core/theory.js";
import { makeVoice, ac } from "../core/audio.js";
import { toneProfile, decodeAudioFile } from "../core/pitch.js";
import { countdown } from "../core/live.js";
import { handOff } from "../reviewhandoff.js";

const HISTORY = "bansuri.tone.history", CHECKS = "bansuri.tone.checks";
// Measured on the reference player (Freesound "sankalp", a competent player, not a master:
// app/audio) and calibrated on synthetic tones with known breath noise (tests/core.test.mjs).
const REFERENCE = {
  0: { label: "middle Sa", pitchSD: 2, levelCV: 7.8, air: 0.4, attack: 90, overshoot: 30 },
  "-12": { label: "lower Sa", pitchSD: 5.8, levelCV: 13.8, air: 0.1, attack: 180, overshoot: 30 },
};
// Bands for each measure: [excellent, good, fair] upper limits; beyond fair: work on it.
const MEASURES = [
  { key: "pitchSD", name: "Steady pitch", unit: "cents", bands: [6, 12, 20], what: "how much the pitch wavers while you hold the note",
    tip: "Keep the air pressure even from the belly, not the chest; keep the flute and lips still; check that every closed hole is fully sealed (a leak makes the pitch wander). Practise with the drone and hold the note until it stops wobbling." },
  { key: "levelCV", name: "Steady sound", unit: "%", bands: [10, 18, 30], what: "how much the loudness wavers",
    tip: "Support the breath evenly: imagine one long, slow exhale. Relax the shoulders and throat; do not push at the end of the breath. Start with 4-second notes and grow them slowly." },
  { key: "air", name: "Clear tone (little air)", unit: "% air", bands: [1, 3, 8], what: "breath noise mixed into the note",
    tip: "Make the lip opening smaller and aim the air across the far edge of the blowing hole; cover about a third of the hole with the lower lip; do not press the flute into the chin. For the lower octave use slow, warm air; for the upper, faster air, not harder." },
  { key: "attack", name: "Clean start", unit: "ms", bands: [120, 250, 500], what: "how long the note takes to settle after it starts",
    tip: "Close the fingers for the note before you blow. Start with a soft 'tu' of the tongue and have the air ready; the note should speak at once, without a slide or a puff." },
  { key: "overshoot", name: "Starts on pitch", unit: "cents", bands: [25, 50, 100], what: "how far the pitch strays at the start",
    tip: "Do not blow harder to start the note: begin with the air speed the note needs. If the note starts sharp, start softer; if flat, aim the air a little higher." },
];
const BAND = ["Excellent", "Good", "Fair", "Work on it"], BAND_CLS = ["good", "good", "warn", "bad"];
const bandOf = (m, v) => { const i = m.bands.findIndex(b => v <= b); return i < 0 ? 3 : i; };
const NOTES = [[0, "S (middle Sa)"], [-5, ".P (lower Pa)"], [-12, ".S (lower Sa: on a bass flute)"], [7, "P (Pa)"], [12, "S' (upper Sa)"]];
const CHECKLIST = [
  "Sitting or standing tall, shoulders down and relaxed",
  "Flute level and still, held by the fingers, not gripped",
  "Lips relaxed (no smile, no pressing); a small, round opening",
  "The pads of the fingers cover the holes fully (no leaks)",
  "Breathing from the belly; no rise in the shoulders",
  "Listening to the drone while holding the note",
];

export async function render(main) {
  const page = h("div", { class: "page tonepage" });
  main.append(page);
  let note = 0, recorder = null, stream = null, lastUrl = null, lastBlob = null;
  const cleanups = [() => { if (recorder && recorder.state !== "inactive") recorder.stop(); if (stream) stream.getTracks().forEach(t => t.stop()); if (lastUrl) URL.revokeObjectURL(lastUrl); }];

  const noteSel = h("select", { class: "input", "aria-label": "Note to hold" }, NOTES.map(([s, l]) => h("option", { value: String(s) }, l)));
  noteSel.addEventListener("change", () => { note = Number(noteSel.value); });
  const hearBtn = h("button", { type: "button", class: "btn", onclick: () => { const c = ac(), v = makeVoice(hzOf(note), c.currentTime + 0.05); v.stop(c.currentTime + 2.5); } }, icon("play"), " Hear the note");
  const startBtn = h("button", { type: "button", class: "btn primary", onclick: () => record() }, icon("mic"), " Hold the note for 6 seconds");
  const status = h("p", { class: "small", role: "status", "aria-live": "polite" });
  const result = h("div", { class: "stack" });
  const histBox = h("div", { class: "stack small" });

  async function record() {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
    catch (e) { toast("The microphone is not available: " + ((e && e.message) || e)); return; }
    if (!await countdown(page, { btn: startBtn, label: "Get ready: breathe in, then hold " + codeOf(note) })) { stream.getTracks().forEach(t => t.stop()); return; }
    const chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(res => { recorder.onstop = res; });
    recorder.start();
    status.textContent = "Listening: hold " + codeOf(note) + " steadily...";
    setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, 7000);
    await done;
    stream.getTracks().forEach(t => t.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    lastBlob = blob;
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    status.textContent = "Measuring...";
    let p = null;
    try { const a = await decodeAudioFile(blob); p = toneProfile(a.getChannelData(0), a.sampleRate); }
    catch (e) { status.textContent = "This recording could not be read."; return; }
    if (!p) { status.textContent = "No steady note of 1.5 seconds or more was heard. Play closer to the microphone and hold the note longer."; return; }
    status.textContent = "";
    show(p, true);
  }

  // The measures as rows: the value, its band, the reference player and your best.
  function show(p, fresh) {
    const hist = store(HISTORY, []), mine = hist.filter(x => x.note === note), ref = REFERENCE[note] || null;
    const best = k => mine.length ? Math.min(...mine.map(x => x.p[k])) : null;
    const rows = MEASURES.map(m => {
      const b = bandOf(m, p[m.key]);
      return h("tr", null, h("th", { scope: "row" }, m.name, h("span", { class: "small muted" }, " (" + m.what + ")")),
        h("td", { class: "mono" }, String(p[m.key]) + " " + m.unit), h("td", null, h("span", { class: "chip " + BAND_CLS[b] }, BAND[b])),
        h("td", { class: "mono muted" }, ref ? ref[m.key] + " " + m.unit : "-"), h("td", { class: "mono muted" }, best(m.key) === null ? "-" : best(m.key) + " " + m.unit));
    });
    const weak = MEASURES.map(m => ({ m, b: bandOf(m, p[m.key]) })).filter(x => x.b >= 2).sort((a, b) => b.b - a.b).slice(0, 2);
    const score = Math.round(MEASURES.reduce((a, m) => a + (3 - bandOf(m, p[m.key])), 0) / (MEASURES.length * 3) * 10 * 10) / 10;
    result.replaceChildren(
      h("h2", null, "Your " + codeOf(note) + ": " + score + " out of 10"),
      h("p", { class: "small muted" }, "Held " + p.seconds + " s, " + (p.cents > 0 ? "+" : "") + p.cents + " cents from the note" + (Math.abs(p.cents) > 25 ? ": check your flute's key in Settings, or the angle of the air." : ".")),
      h("div", { class: "tablewrap" }, h("table", { class: "table" },
        h("thead", null, h("tr", null, h("th", null, "Measure"), h("th", null, "You"), h("th", null, ""), h("th", null, ref ? "Reference player (" + ref.label + ")" : "Reference player"), h("th", null, "Your best"))),
        h("tbody", null, rows))),
      weak.length ? h("div", { class: "stack" }, h("h3", null, "What to work on"), weak.map(({ m }) => h("p", null, h("b", null, m.name + ": "), m.tip))) : h("p", null, icon("check"), " Every measure is good. Now record yourself and compare with a master's recording by ear: that is where the last part of tone lives."),
      lastUrl ? h("div", { class: "row tight" }, h("button", { type: "button", class: "btn small", onclick: () => new Audio(lastUrl).play().catch(() => {}) }, icon("play"), " Hear your note"),
        h("button", { type: "button", class: "btn small", onclick: () => new Audio("app/audio/" + (note < -6 ? "bansuri-sa-lower-octave-sankalp.mp3" : "bansuri-sa-middle-octave-sankalp.mp3")).play().catch(() => {}) }, icon("play"), " Hear the reference player"),
        h("button", { type: "button", class: "btn small primary", onclick: () => {
          const ext = /ogg/.test(lastBlob && lastBlob.type) ? "ogg" : /mp4/.test(lastBlob && lastBlob.type) ? "m4a" : "webm";
          handOff({ title: "held " + codeOf(note), file: lastBlob ? new File([lastBlob], "tone-check-" + today() + "." + ext, { type: lastBlob.type }) : null, measures: { ...p, noteName: codeOf(note) } });
          location.hash = "#/review";
        } }, "Ask my teacher")) : null);
    if (fresh) { hist.unshift({ date: today(), note, p, score }); storeSet(HISTORY, hist.slice(0, 60)); drawHistory(); }
  }

  function drawHistory() {
    const hist = store(HISTORY, []);
    if (!hist.length) { histBox.replaceChildren(h("p", { class: "muted" }, "Your checks will be listed here, so you can see your tone improve.")); return; }
    histBox.replaceChildren(h("div", { class: "tablewrap" }, h("table", { class: "table" },
      h("thead", null, h("tr", null, h("th", null, "Date"), h("th", null, "Note"), h("th", null, "Score"), MEASURES.map(m => h("th", null, m.name)))),
      h("tbody", null, hist.slice(0, 15).map(x => h("tr", null, h("td", null, x.date), h("td", { class: "mono" }, codeOf(x.note)), h("td", null, x.score + "/10"), MEASURES.map(m => h("td", { class: "mono" }, String(x.p[m.key])))))))));
  }

  const ticks = store(CHECKS, {});
  const checklist = h("ul", { class: "checklist" }, CHECKLIST.map((t, i) => {
    const box = h("input", { type: "checkbox", id: "tc-" + i, checked: !!ticks[i] });
    box.addEventListener("change", () => { const s2 = store(CHECKS, {}); s2[i] = box.checked; storeSet(CHECKS, s2); });
    return h("li", null, h("label", { class: "check", for: "tc-" + i }, box, t));
  }));

  page.append(
    h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Tone check"), h("h1", null, "How does your note sound?"),
      h("p", { class: "muted" }, "Hold one note for six seconds. The app measures what a microphone can hear: steadiness, breath noise and the start of the note, against a reference player and your own best.")),
    h("section", { class: "card" }, h("h2", null, "1. Hold a note"),
      h("div", { class: "row" }, h("label", { class: "field" }, "Note", noteSel), hearBtn),
      h("div", { class: "row" }, startBtn), status,
      h("p", { class: "small muted" }, "Play in a quiet room, about 30 cm from the microphone, with the drone off. Use a headset microphone if you can.")),
    h("section", { class: "card" }, result),
    h("section", { class: "card" }, h("h2", null, "2. Before every check: what the microphone cannot hear"), checklist,
      h("p", { class: "small muted" }, "A microphone measures the sound, not how you make it. Posture, lips and breath decide the sound over months; a teacher, or a video of yourself (Journal), checks them.")),
    h("section", { class: "card" }, h("h2", null, "Your checks"), histBox),
    h("section", { class: "card" }, h("h2", null, "What the numbers mean"),
      h("p", { class: "small" }, "Steady pitch: the spread of the pitch while held (the reference player: 2 cents on middle Sa). Steady sound: the spread of the loudness. Clear tone: breath noise in the sound, from how periodic the sound is (calibrated on tones with known noise). Clean start: from the first sound to the steady note. Starts on pitch: how far the pitch strays at the start."),
      h("p", { class: "small muted" }, "The reference is a competent player's recording (Freesound, sankalp), not a master's. The microphone, the room and the flute change the numbers: compare yourself with yourself first.")));
  drawHistory();
  return () => cleanups.forEach(f => f());
}
