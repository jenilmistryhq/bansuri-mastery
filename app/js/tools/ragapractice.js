// Raga practice (#/skills/ear/raga): free play over a drone with the mic flagging notes outside the
// chosen raga. No score to chase - just awareness training.
import { h } from "../util.js";
import { listenMic, emitLive } from "../core/listen.js";
import { codeOf, pcOf, LETTERS } from "../core/theory.js";
import { tanpura } from "../core/audio.js";

const RAGAS = [
  { name: "Bhupali",     notes: new Set([0, 2, 4, 7, 9]),            first: "pa" },
  { name: "Yaman",       notes: new Set([0, 2, 4, 6, 7, 9, 11]),    first: "pa" },
  { name: "Durga",       notes: new Set([0, 2, 5, 7, 9]),            first: "pa" },
  { name: "Khamaj",      notes: new Set([0, 2, 4, 5, 7, 9, 10, 11]),first: "ga" },
  { name: "Desh",        notes: new Set([0, 2, 4, 5, 7, 9, 10, 11]),first: "re" },
  { name: "Kafi",        notes: new Set([0, 2, 3, 5, 7, 9, 10]),    first: "pa" },
  { name: "Bhimpalasi",  notes: new Set([0, 2, 3, 5, 7, 9, 10]),    first: "ma" },
  { name: "Bageshri",    notes: new Set([0, 2, 3, 5, 7, 9, 10]),    first: "ma" },
  { name: "Shivranjani", notes: new Set([0, 2, 3, 7, 9]),            first: "pa" },
  { name: "Pahadi",      notes: new Set([0, 2, 4, 5, 7, 9, 10, 11]),first: "sa" },
  { name: "Hamsadhwani", notes: new Set([0, 2, 4, 7, 11]),           first: "re" },
  { name: "Bilawal",     notes: new Set([0, 2, 4, 5, 7, 9, 11]),    first: "pa" },
  { name: "Kalyan",      notes: new Set([0, 2, 4, 6, 7, 9, 11]),    first: "pa" },
  { name: "Bhairav",     notes: new Set([0, 1, 4, 5, 7, 8, 11]),    first: "pa" },
  { name: "Bhairavi",    notes: new Set([0, 1, 3, 5, 7, 8, 10]),    first: "ma" },
  { name: "Malkauns",    notes: new Set([0, 3, 5, 8, 10]),           first: "ma" },
];

const SARGAM = ["S", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"];

function clock(s) {
  const m = Math.floor(s / 60);
  return m + ":" + String(Math.floor(s % 60)).padStart(2, "0");
}

export function ragaPractice() {
  let unsub = null, droneMine = false, listening = false;
  let totalNotes = 0, wrongCount = 0, startTime = 0, timerHandle = 0;
  let lastNear = null, lastNearTime = 0;
  const wrongLog = [];

  const raga = () => RAGAS[Number(ragaSel.value)];

  // --- UI pieces ---
  const ragaSel = h("select", { class: "rp-select", "aria-label": "Raga" },
    RAGAS.map((r, i) => h("option", { value: String(i) }, r.name)));

  const droneBtn = h("button", { type: "button", class: "rp-btn" }, "Start drone");
  const listenBtn = h("button", { type: "button", class: "rp-btn rp-primary" }, "Start listening");

  const noteEls = SARGAM.map((code, i) =>
    h("span", { class: "rp-note", dataset: { pc: String(i) } },
      h("span", { class: "rp-code" }, code)));
  const noteRow = h("div", { class: "rp-notes" }, noteEls);

  const scoreTxt = h("span", { class: "rp-score" });
  const timerTxt = h("span", { class: "rp-timer" });
  const statusRow = h("div", { class: "rp-status" }, scoreTxt, timerTxt);

  const msg = h("p", { class: "rp-msg" }, "Pick a raga, start the drone and begin playing. The mic flags any note outside the raga.");
  const logBox = h("div", { class: "rp-log" });

  const el = h("div", { class: "rp-tool" },
    h("div", { class: "rp-setup" }, ragaSel, droneBtn, listenBtn),
    noteRow, statusRow, msg, logBox);

  // --- Highlight raga notes ---
  function paintNotes() {
    const notes = raga().notes;
    noteEls.forEach((span, i) => {
      span.classList.toggle("rp-in", notes.has(i));
      span.classList.remove("rp-hit", "rp-wrong");
    });
  }
  paintNotes();

  ragaSel.addEventListener("change", () => {
    paintNotes();
    if (droneMine) {
      tanpura.setFirst(raga().first);
      if (!tanpura.isOn()) tanpura.start();
    }
  });

  // --- Drone ---
  droneBtn.addEventListener("click", () => {
    if (droneMine) {
      tanpura.stop();
      droneMine = false;
      droneBtn.textContent = "Start drone";
      droneBtn.setAttribute("aria-pressed", "false");
      return;
    }
    tanpura.setFirst(raga().first);
    if (!tanpura.isOn()) tanpura.start();
    droneMine = true;
    droneBtn.textContent = "Stop drone";
    droneBtn.setAttribute("aria-pressed", "true");
  });

  // --- Score display ---
  function updateScore() {
    scoreTxt.textContent = totalNotes + " note" + (totalNotes === 1 ? "" : "s") +
      ", " + wrongCount + " outside";
  }

  function updateTimer() {
    if (!startTime) return;
    timerTxt.textContent = clock((Date.now() - startTime) / 1000);
  }

  // --- Mic handler ---
  function onReading(r) {
    if (r.semi === null || r.near === null) return;
    if (r.semi < -7.5 || r.semi > 26.5) return;

    const near = r.near;
    const pc = pcOf(near);
    const now = r.t;

    // Debounce: only count a note once until the pitch moves away
    if (near === lastNear && now - lastNearTime < 0.4) return;
    if (near !== lastNear) { lastNear = near; lastNearTime = now; }
    else { lastNearTime = now; return; }

    totalNotes++;
    const inRaga = raga().notes.has(pc);

    // Flash the note
    noteEls.forEach(span => span.classList.remove("rp-hit", "rp-wrong"));
    const noteEl = noteEls[pc];
    if (inRaga) {
      noteEl.classList.add("rp-hit");
    } else {
      wrongCount++;
      noteEl.classList.add("rp-wrong");
      const elapsed = startTime ? clock((Date.now() - startTime) / 1000) : "0:00";
      wrongLog.push({ code: codeOf(near), time: elapsed });
      logBox.append(h("span", { class: "rp-logentry" },
        h("b", null, codeOf(near)), " at " + elapsed));
    }
    updateScore();
  }

  // --- Start / Stop ---
  async function startListening() {
    if (listening) { stopListening(true); return; }
    msg.textContent = "Listening... play freely in " + raga().name + ".";
    listenBtn.textContent = "Stop";
    totalNotes = 0;
    wrongCount = 0;
    lastNear = null;
    lastNearTime = 0;
    wrongLog.length = 0;
    logBox.replaceChildren();
    startTime = Date.now();
    updateScore();
    updateTimer();
    timerHandle = setInterval(updateTimer, 500);
    ragaSel.disabled = true;

    try {
      unsub = await listenMic(onReading);
      listening = true;
    } catch (e) {
      clearInterval(timerHandle);
      ragaSel.disabled = false;
      listenBtn.textContent = "Start listening";
      msg.textContent = e && e.message === "unavailable"
        ? "This browser cannot use the microphone here. Open the app in Chrome, Edge or Safari over https."
        : "The microphone is blocked. Tap the lock in the address bar > Microphone > Allow, then try again.";
    }
  }

  function stopListening(showSummary) {
    if (unsub) { unsub(); unsub = null; }
    listening = false;
    clearInterval(timerHandle);
    ragaSel.disabled = false;
    listenBtn.textContent = "Start listening";
    noteEls.forEach(span => span.classList.remove("rp-hit", "rp-wrong"));

    if (showSummary && totalNotes > 0) {
      const secs = (Date.now() - startTime) / 1000;
      const pct = totalNotes ? Math.round((totalNotes - wrongCount) / totalNotes * 100) : 0;
      msg.textContent = raga().name + ": " + totalNotes + " notes in " + clock(secs) +
        ", " + wrongCount + " outside the raga (" + pct + "% accurate).";
      emitLive({ type: "play", piece: "Raga: " + raga().name, bpm: 0, ok: totalNotes - wrongCount, n: totalNotes, onTime: 0, timed: 0 });
    } else if (showSummary) {
      msg.textContent = "No notes detected. Make sure the microphone can hear your flute.";
    }
  }

  listenBtn.addEventListener("click", startListening);

  function destroy() {
    stopListening(false);
    if (droneMine) { tanpura.stop(); droneMine = false; }
    clearInterval(timerHandle);
  }

  return { el, destroy };
}
