// Scale practice (#/skills/<skill>/scales): play a scale note by note with live mic feedback.
// The mic detects each note; correct notes advance, wrong notes flash red. No imports beyond
// the app's own util, listen and theory modules.
import { h } from "../util.js";
import { listenMic, noteSequencer, emitLive } from "../core/listen.js";
import { codeOf, pcOf } from "../core/theory.js";
import { playNote, stopAll } from "../core/audio.js";

const SCALES = [
  { id: "bilawal", label: "Bilawal (major)", notes: [0, 2, 4, 5, 7, 9, 11, 12] },
  { id: "kalyan", label: "Kalyan (Lydian)", notes: [0, 2, 4, 6, 7, 9, 11, 12] },
  { id: "khamaj", label: "Khamaj (Mixolydian)", notes: [0, 2, 4, 5, 7, 9, 10, 12] },
  { id: "kafi", label: "Kafi (Dorian)", notes: [0, 2, 3, 5, 7, 9, 10, 12] },
  { id: "asavari", label: "Asavari (minor)", notes: [0, 2, 3, 5, 7, 8, 10, 12] },
  { id: "bhairavi", label: "Bhairavi (Phrygian)", notes: [0, 1, 3, 5, 7, 8, 10, 12] },
  { id: "bhairav", label: "Bhairav", notes: [0, 1, 4, 5, 7, 8, 11, 12] },
  { id: "poorvi", label: "Poorvi", notes: [0, 1, 4, 6, 7, 8, 11, 12] },
  { id: "marwa", label: "Marwa", notes: [0, 1, 4, 6, 7, 9, 11, 12] },
  { id: "todi", label: "Todi", notes: [0, 1, 3, 6, 7, 8, 11, 12] },
];

const ALL_NOTES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function buildSequence(notes, direction) {
  const up = notes.slice();
  const down = notes.slice().reverse();
  if (direction === "down") return down;
  if (direction === "updown") return up.concat(down.slice(1));
  return up;
}

export function scalePractice() {
  let unsub = null, running = false, destroyed = false;
  let seq = null, pos = 0, startTime = 0, firstTry = 0, correct = 0, total = 0;
  let scaleId = "bilawal", direction = "up", customNotes = new Set([0, 2, 4, 5, 7, 9, 11]);
  let flashTimer = 0, demoTimer = 0;

  function activeNotes() {
    if (scaleId === "custom") {
      const sorted = [...customNotes].sort((a, b) => a - b);
      if (!sorted.includes(0)) sorted.unshift(0);
      sorted.push(sorted[0] + 12);
      return sorted;
    }
    const sc = SCALES.find(s => s.id === scaleId);
    return sc ? sc.notes.slice() : [0, 12];
  }

  // --- UI ---

  const scaleChips = h("div", { class: "chips sp-chips", role: "group", "aria-label": "Scale" });
  const dirChips = h("div", { class: "chips sp-chips", role: "group", "aria-label": "Direction" });
  const customRow = h("div", { class: "sp-custom", hidden: true });
  const slotRow = h("div", { class: "sp-slots" });
  const msg = h("p", { class: "sp-msg", "aria-live": "polite" }, "Pick a scale and press Start. Play each note when it is highlighted.");
  const startBtn = h("button", { type: "button", class: "sp-start" }, "Start");
  const listenBtn = h("button", { type: "button", class: "sp-listen" }, "Listen first");
  const el = h("div", { class: "sp-tool" },
    h("div", { class: "sp-setup" }, scaleChips, customRow, dirChips),
    slotRow,
    msg,
    h("div", { class: "sp-btns" }, startBtn, listenBtn));

  // Scale chips
  function drawScaleChips() {
    scaleChips.replaceChildren(
      ...SCALES.map(s => {
        const btn = h("button", { type: "button", class: "chipbtn" + (scaleId === s.id ? " on" : "") }, s.label);
        btn.addEventListener("click", () => { scaleId = s.id; customRow.hidden = true; drawScaleChips(); drawSlots(); });
        return btn;
      }),
      (() => {
        const btn = h("button", { type: "button", class: "chipbtn" + (scaleId === "custom" ? " on" : "") }, "Custom");
        btn.addEventListener("click", () => { scaleId = "custom"; customRow.hidden = false; drawScaleChips(); drawSlots(); });
        return btn;
      })());
  }

  // Custom note toggles
  function drawCustomRow() {
    customRow.replaceChildren(...ALL_NOTES.map(semi => {
      const on = customNotes.has(semi);
      const btn = h("button", { type: "button", class: "chipbtn sp-notetoggle" + (on ? " on" : ""), translate: "no" }, codeOf(semi));
      btn.addEventListener("click", () => {
        if (customNotes.has(semi)) customNotes.delete(semi); else customNotes.add(semi);
        drawCustomRow();
        drawSlots();
      });
      return btn;
    }));
  }

  // Direction chips
  function drawDirChips() {
    dirChips.replaceChildren(...[["up", "Up"], ["down", "Down"], ["updown", "Up and down"]].map(([id, label]) => {
      const btn = h("button", { type: "button", class: "chipbtn" + (direction === id ? " on" : "") }, label);
      btn.addEventListener("click", () => { direction = id; drawDirChips(); drawSlots(); });
      return btn;
    }));
  }

  // Slots
  function drawSlots() {
    const notes = buildSequence(activeNotes(), direction);
    slotRow.replaceChildren(...notes.map((semi, i) => {
      const slot = h("span", { class: "sp-slot", "data-i": String(i), translate: "no" }, codeOf(semi));
      return slot;
    }));
  }

  function updateSlots(sequence) {
    const slots = slotRow.querySelectorAll(".sp-slot");
    slots.forEach((slot, i) => {
      slot.className = "sp-slot";
      if (i < pos) slot.classList.add("sp-done");
      else if (i === pos) slot.classList.add("sp-current");
    });
  }

  function flashWrong() {
    const cur = slotRow.querySelector(".sp-current");
    if (!cur) return;
    cur.classList.add("sp-wrong");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { if (cur) cur.classList.remove("sp-wrong"); }, 350);
  }

  // --- Demo playback ---
  function demo() {
    stopAll();
    const notes = buildSequence(activeNotes(), direction);
    let i = 0;
    clearTimeout(demoTimer);
    const step = () => {
      if (i >= notes.length || destroyed) return;
      playNote(notes[i], 0.5);
      // Highlight the slot briefly
      const slots = slotRow.querySelectorAll(".sp-slot");
      slots.forEach(s => s.classList.remove("sp-demo"));
      if (slots[i]) slots[i].classList.add("sp-demo");
      i++;
      demoTimer = setTimeout(step, 600);
    };
    step();
  }

  // --- Listening ---
  async function start() {
    if (running) { stop(false); return; }
    const sequence = buildSequence(activeNotes(), direction);
    if (sequence.length < 2) { msg.textContent = "Pick at least two notes."; return; }
    pos = 0; firstTry = 0; correct = 0; total = sequence.length;
    drawSlots();
    updateSlots(sequence);
    startBtn.textContent = "Stop";
    msg.textContent = "Play " + codeOf(sequence[0]) + " to begin.";
    running = true;
    startTime = performance.now();

    const nseq = noteSequencer();

    try {
      unsub = await listenMic(reading => {
        if (!running || destroyed) return;
        const note = nseq.feed(reading);
        if (!note) return;

        const target = sequence[pos];
        // Accept the note if its pitch class matches the target's, in any octave
        if (pcOf(note.semi) === pcOf(target)) {
          if (firstTry === 0) { correct++; firstTry = 0; }
          const slot = slotRow.querySelector(".sp-slot.sp-current");
          if (slot) { slot.classList.remove("sp-current"); slot.classList.add("sp-done"); }
          pos++;
          firstTry = 0;
          if (pos >= sequence.length) {
            finish();
            return;
          }
          updateSlots(sequence);
          msg.textContent = "Next: " + codeOf(sequence[pos]);
        } else {
          firstTry++;
          flashWrong();
        }
      });
    } catch (e) {
      running = false;
      startBtn.textContent = "Start";
      msg.textContent = e && e.message === "unavailable"
        ? "This browser cannot use the microphone here. Open the app in Chrome, Edge or Safari over https."
        : "The microphone is blocked. Tap the lock in the address bar > Microphone > Allow.";
    }
  }

  function stop(silent) {
    running = false;
    if (unsub) { unsub(); unsub = null; }
    startBtn.textContent = "Start";
    if (!silent) msg.textContent = pos > 0 ? "Stopped after " + pos + " of " + total + " notes." : "Stopped.";
    clearTimeout(flashTimer);
  }

  function finish() {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    running = false;
    if (unsub) { unsub(); unsub = null; }
    startBtn.textContent = "Start";
    const pct = total > 0 ? Math.round(correct / total * 100) : 0;
    msg.textContent = "Done! " + correct + " of " + total + " notes right on the first try (" + pct + "%) in " + elapsed + " s.";
    const scaleName = scaleId === "custom" ? "Custom" : (SCALES.find(s => s.id === scaleId) || { label: scaleId }).label;
    emitLive({ type: "play", piece: "Scale: " + scaleName, bpm: 0, ok: correct, n: total, onTime: 0, timed: 0 });
  }

  // --- Wire up ---
  startBtn.addEventListener("click", () => start());
  listenBtn.addEventListener("click", () => demo());

  drawScaleChips();
  drawCustomRow();
  drawDirChips();
  drawSlots();

  return {
    el,
    destroy() {
      destroyed = true;
      stop(true);
      stopAll();
      clearTimeout(demoTimer);
    },
  };
}
