// Record and compare: play a reference phrase, record yourself, and see how close you got.
import { h } from "../util.js";
import { listenMic, emitLive } from "../core/listen.js";
import { codeOf, pcOf } from "../core/theory.js";
import { playNote, stopAll } from "../core/audio.js";

const PHRASES = [
  { label: "Sa Re Ga", notes: [0, 2, 4] },
  { label: "Sa Re Ga Ma Pa", notes: [0, 2, 4, 5, 7] },
  { label: "Pa Dha Ni Sa'", notes: [7, 9, 11, 12] },
  { label: "Sa Ga Pa", notes: [0, 4, 7] },
  { label: "Sa Re Ga Ma Pa Dha Ni Sa'", notes: [0, 2, 4, 5, 7, 9, 11, 12] },
  { label: "Ni Re Ga (Yaman)", notes: [11, 14, 16] },
  { label: "Sa ga Ma Pa (Kafi)", notes: [0, 3, 5, 7] },
  { label: "Sa Re ga Pa Dha (Shivranjani)", notes: [0, 2, 3, 7, 9] },
  { label: "Sa Ga Pa Ni Sa' (Hamsadhwani)", notes: [0, 4, 7, 11, 12] },
  { label: "Sa Ma Pa Ni Sa' (descending)", notes: [12, 11, 7, 5, 0] },
];

function noteHue(semi) { return pcOf(semi) * 30; }
function noteColor(semi) { return "hsl(" + noteHue(semi) + ", 65%, 55%)"; }

// Extract distinct notes from raw pitch readings. Each entry: { semi, dur }.
function extractNotes(readings) {
  if (!readings.length) return [];
  const out = [];
  let cur = null, start = 0;
  for (const r of readings) {
    if (r.near === null) {
      if (cur !== null) { out.push({ semi: cur, dur: r.t - start }); cur = null; }
      continue;
    }
    if (r.near !== cur) {
      if (cur !== null) out.push({ semi: cur, dur: r.t - start });
      cur = r.near; start = r.t;
    }
  }
  if (cur !== null) {
    const last = readings[readings.length - 1];
    out.push({ semi: cur, dur: last.t - start });
  }
  // Filter out notes shorter than 0.1s (noise)
  return out.filter(n => n.dur >= 0.1);
}

export function compareTool() {
  let picked = 0;
  let unsub = null;
  let recordings = [];
  let playing = false;
  let recordTimer = null;
  let playTimer = null;
  let destroyed = false;

  const el = h("div", { class: "cmp-tool" });

  // Phrase picker
  const chips = h("div", { class: "cmp-chips" },
    PHRASES.map((p, i) => {
      const btn = h("button", {
        type: "button",
        class: "cmp-chip" + (i === 0 ? " cmp-on" : ""),
        onclick: () => { picked = i; chips.querySelectorAll(".cmp-chip").forEach((c, k) => c.classList.toggle("cmp-on", k === i)); },
      }, p.label);
      return btn;
    }));
  el.append(h("div", { class: "cmp-section" }, h("span", { class: "small muted" }, "Pick a phrase"), chips));

  // Buttons
  const playBtn = h("button", { type: "button", class: "cmp-btn cmp-play", onclick: playRef }, "Play reference");
  const recordBtn = h("button", { type: "button", class: "cmp-btn cmp-record", onclick: startRecord }, "Record yourself");
  const againBtn = h("button", { type: "button", class: "cmp-btn", onclick: startRecord, hidden: true }, "Record again");
  el.append(h("div", { class: "cmp-buttons" }, playBtn, recordBtn, againBtn));

  // Status
  const status = h("p", { class: "cmp-status" }, "Pick a phrase above, then play the reference to hear it. Record yourself and compare.");
  el.append(status);

  // Comparison area
  const compareArea = h("div", { class: "cmp-compare", hidden: true });
  el.append(compareArea);

  function playRef() {
    if (destroyed) return;
    stopAll();
    clearTimeout(playTimer);
    const phrase = PHRASES[picked];
    playBtn.disabled = true;
    recordBtn.disabled = true;
    status.textContent = "Playing: " + phrase.label;
    let i = 0;
    function next() {
      if (i >= phrase.notes.length || destroyed) {
        playBtn.disabled = false;
        recordBtn.disabled = false;
        status.textContent = "Now record yourself playing the same phrase.";
        return;
      }
      playNote(phrase.notes[i], 0.65);
      i++;
      playTimer = setTimeout(next, 700);
    }
    next();
  }

  function startRecord() {
    if (destroyed) return;
    stopAll();
    clearTimeout(playTimer);
    recordings = [];
    compareArea.hidden = true;
    againBtn.hidden = true;
    playBtn.disabled = true;
    recordBtn.disabled = true;
    status.textContent = "Listening... play the phrase now (up to 10 seconds).";

    const startTime = { v: null };

    listenMic(r => {
      if (destroyed) return;
      if (startTime.v === null) startTime.v = r.t;
      recordings.push({ t: r.t - startTime.v, near: r.near, semi: r.semi, cents: r.cents, level: r.level });
    }).then(off => {
      if (destroyed) { off(); return; }
      unsub = off;
      recordTimer = setTimeout(() => stopRecord(), 10000);
      // Add a stop button
      const stopBtn = h("button", { type: "button", class: "cmp-btn cmp-stop", onclick: () => stopRecord() }, "Stop recording");
      recordBtn.replaceWith(stopBtn);
      recordBtn._stopBtn = stopBtn;
    }).catch(e => {
      status.textContent = e && e.message === "unavailable"
        ? "This browser cannot use the microphone here. Open in Chrome, Edge or Safari over https."
        : "Microphone blocked. Allow it in the address bar.";
      playBtn.disabled = false;
      recordBtn.disabled = false;
    });
  }

  function stopRecord() {
    if (destroyed) return;
    clearTimeout(recordTimer);
    if (unsub) { unsub(); unsub = null; }
    // Restore record button
    const stopBtn = recordBtn._stopBtn;
    if (stopBtn && stopBtn.parentNode) stopBtn.replaceWith(recordBtn);
    playBtn.disabled = false;
    recordBtn.disabled = false;
    againBtn.hidden = false;

    if (recordings.length < 3) {
      status.textContent = "No notes detected. Try again - play closer to the microphone.";
      return;
    }
    showComparison();
  }

  function showComparison() {
    const phrase = PHRASES[picked];
    const refNotes = phrase.notes.map(s => ({ semi: s, dur: 0.7 }));
    const recNotes = extractNotes(recordings);

    if (!recNotes.length) {
      status.textContent = "No clear notes detected. Try playing closer to the microphone.";
      return;
    }

    compareArea.hidden = false;
    compareArea.replaceChildren();

    // Match recorded notes to reference using order
    const maxLen = Math.max(refNotes.length, recNotes.length);
    let matched = 0;
    for (let i = 0; i < Math.min(refNotes.length, recNotes.length); i++) {
      if (pcOf(refNotes[i].semi) === pcOf(recNotes[i].semi)) matched++;
    }

    // Build visual strips
    const refStrip = h("div", { class: "cmp-strip" });
    const recStrip = h("div", { class: "cmp-strip" });

    const refTotal = refNotes.reduce((s, n) => s + n.dur, 0);
    const recTotal = recNotes.reduce((s, n) => s + n.dur, 0);
    const scale = Math.max(refTotal, recTotal);

    for (let i = 0; i < refNotes.length; i++) {
      const n = refNotes[i];
      const w = Math.max(8, (n.dur / scale) * 100);
      const matchRec = i < recNotes.length && pcOf(n.semi) === pcOf(recNotes[i].semi);
      refStrip.append(h("span", {
        class: "cmp-block" + (matchRec ? " cmp-match" : i < recNotes.length ? " cmp-miss" : ""),
        style: "width:" + w + "%;background:" + noteColor(n.semi),
        title: codeOf(n.semi),
      }, h("span", { class: "cmp-label" }, codeOf(n.semi))));
    }

    for (let i = 0; i < recNotes.length; i++) {
      const n = recNotes[i];
      const w = Math.max(8, (n.dur / scale) * 100);
      const matchRef = i < refNotes.length && pcOf(n.semi) === pcOf(refNotes[i].semi);
      recStrip.append(h("span", {
        class: "cmp-block" + (matchRef ? " cmp-match" : i < refNotes.length ? " cmp-miss" : ""),
        style: "width:" + w + "%;background:" + noteColor(n.semi),
        title: codeOf(n.semi) + " (" + n.dur.toFixed(1) + "s)",
      }, h("span", { class: "cmp-label" }, codeOf(n.semi))));
    }

    compareArea.append(
      h("div", { class: "cmp-row" }, h("span", { class: "cmp-rowlabel small muted" }, "Reference"), refStrip),
      h("div", { class: "cmp-row" }, h("span", { class: "cmp-rowlabel small muted" }, "You played"), recStrip));

    // Summary
    const timeDiff = recTotal - refTotal;
    const timeTxt = Math.abs(timeDiff) < 0.15
      ? "Timing: very close"
      : "Timing: your phrase was " + Math.abs(timeDiff).toFixed(1) + "s " + (timeDiff > 0 ? "longer" : "shorter");
    status.textContent = matched + " of " + refNotes.length + " notes matched. " + timeTxt + ". You played " + recNotes.length + " note" + (recNotes.length === 1 ? "" : "s") + ".";
    emitLive({ type: "echo", level: "compare", levelLabel: "Compare: " + phrase.label, len: recNotes.length, correct: matched === refNotes.length });
  }

  function destroy() {
    destroyed = true;
    clearTimeout(recordTimer);
    clearTimeout(playTimer);
    stopAll();
    if (unsub) { unsub(); unsub = null; }
  }

  return { el, destroy };
}
