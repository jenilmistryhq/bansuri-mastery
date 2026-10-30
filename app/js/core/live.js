// Interactive exercises that listen to the real flute: a long-tone meter, a phrase check, an
// echo game (the app plays, you play it back) and a beat-tapping game. Plain DOM, styled by the
// lv- classes in bench.css, so the app and the standalone Practice Bench share them.
import { codeOf, nameOf, westOf, hzOf, WEST } from "./theory.js";
import { ac, master, makeVoice, playNote, tanpura, click } from "./audio.js";
import { setSettings } from "./settings.js";
import { listenMic, muteListening, holdTracker, noteSequencer, phraseMatcher, tapStats, pitchAdvice, tapLatency, emitLive } from "./listen.js";

function lvEl(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

function lvMicError(e) {
  return e && e.message === "unavailable"
    ? "This browser cannot use the microphone here. Open the app in Chrome, Edge or Safari over https."
    : "The microphone is blocked. Allow it in the browser's site settings, then try again.";
}

// Before the first microphone prompt, say why the app wants it. Resolves true to go ahead.
export function micIntro(host) {
  let seen = false;
  try { seen = localStorage.getItem("bansuri.live.micIntro") === "1"; } catch (e) { seen = true; }
  if (seen || !host) return Promise.resolve(true);
  return new Promise(resolve => {
    const done = ok => { box.remove(); if (ok) { try { localStorage.setItem("bansuri.live.micIntro", "1"); } catch (e) { /* storage unavailable */ } } resolve(ok); };
    const box = lvEl("div", { class: "lv-intro", role: "dialog", "aria-label": "About the microphone" },
      lvEl("b", null, "The app listens to your flute"),
      lvEl("p", null, "To check your notes it needs the microphone. It only measures pitch while an exercise is running. Nothing is recorded or uploaded."),
      lvEl("p", { class: "lv-count" }, "If the drone plays from this phone, use headphones or keep the phone about a metre away, so the app hears your flute rather than the drone."),
      lvEl("div", { class: "lv-row" }, lvEl("button", { type: "button", class: "lv-btn lv-primary", onclick: () => done(true) }, "Allow the microphone"), lvEl("button", { type: "button", class: "lv-btn", onclick: () => done(false) }, "Not now")));
    host.prepend(box);
    box.querySelector("button").focus();
  });
}

// Opens the microphone for a widget without leaking it. life.gen changes whenever the widget stops,
// so a subscription that arrives after a stop, a second Start or a destroy is closed at once.
async function lvListen(life, onReading) {
  const g = ++life.gen;
  const u = await listenMic(onReading);
  if (g !== life.gen || life.dead) { u(); return null; }
  return u;
}

// A chime for a goal reached.
function lvChime() { try { const c = ac(), t = c.currentTime + 0.02; click(t, "tali"); click(t + 0.18, "sam"); } catch (e) { /* audio unavailable */ } }

// Plays notes on the flute voice and keeps the listener deaf to them. Returns the end time.
function lvPlayPhrase(semis, noteS) {
  const c = ac(), t0 = c.currentTime + 0.15;
  semis.forEach((s, i) => { const v = makeVoice(hzOf(s), t0 + i * noteS); v.stop(t0 + i * noteS + noteS * 0.88); });
  const end = t0 + semis.length * noteS;
  muteListening(end + 0.35);
  return end;
}

// Shared "drone" switch for the widgets, with a reminder that the phone's speaker can leak into the mic.
function lvDrone(label) {
  const box = lvEl("input", { type: "checkbox" });
  const tip = lvEl("p", { class: "lv-count lv-tip", hidden: true }, "Drone on: headphones, or the phone about a metre away, help the app hear your flute.");
  let mine = false;
  box.addEventListener("change", () => {
    if (box.checked && !tanpura.isOn()) { tanpura.start(); mine = true; }
    else if (!box.checked && mine) { tanpura.stop(); mine = false; }
    tip.hidden = !box.checked;
  });
  return { el: lvEl("span", { class: "lv-dronebox" }, lvEl("label", { class: "lv-check" }, box, label || "Drone"), tip), stop() { if (mine && tanpura.isOn()) tanpura.stop(); mine = false; box.checked = false; tip.hidden = true; } };
}

// ---------- Long-tone meter ----------
// opts: { targets: [semi] (in order) or null for any steady note, seconds, cents, onPass(results), compact }
export function holdMeter(opts) {
  const o = Object.assign({ targets: null, seconds: 8, cents: 25, onPass: null }, opts || {});
  const targets = o.targets && o.targets.length ? o.targets : [null];
  let idx = 0, tracker = null, unsub = null, finished = false, lastSound = 0, pauseUntil = 0, shownSec = -1;
  const life = { gen: 0, dead: false, starting: false };
  const bests = {}; // best hold per target this session, reported when listening stops
  const R = 52, C = 2 * Math.PI * R;
  const ring = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  ring.setAttribute("viewBox", "0 0 120 120"); ring.setAttribute("class", "lv-ring"); ring.setAttribute("aria-hidden", "true");
  ring.innerHTML = `<circle cx="60" cy="60" r="${R}" class="lv-track"></circle><circle cx="60" cy="60" r="${R}" class="lv-arc" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"></circle>`;
  const arcSvg = ring.querySelector(".lv-arc");
  const noteBig = lvEl("div", { class: "lv-big" }, "-");
  const secs = lvEl("div", { class: "lv-secs" }, "0.0 s");
  const needle = lvEl("i", { class: "lv-needle" });
  const centsTxt = lvEl("span", { class: "lv-cents" }, "");
  const msg = lvEl("p", { class: "lv-msg", "aria-live": "polite" }, "Press Start, then play a long, steady note.");
  const chips = targets[0] === null ? null : lvEl("div", { class: "lv-chips" }, targets.map((s, i) => lvEl("span", { class: "lv-chip", "data-i": String(i) }, codeOf(s))));
  const startBtn = lvEl("button", { type: "button", class: "lv-btn lv-primary" }, "Start");
  const hearBtn = targets[0] === null ? null : lvEl("button", { type: "button", class: "lv-btn" }, "Hear the note");
  const drone = lvDrone("Drone");
  const goal = () => targets[idx] === null ? `Hold any note steadily for ${o.seconds} s.` : `Hold ${codeOf(targets[idx])} (${nameOf(targets[idx])}) for ${o.seconds} s, within ${o.cents} cents.`;
  const goalEl = lvEl("p", { class: "lv-goal" }, goal());
  const el = lvEl("div", { class: "lv lv-hold" },
    goalEl, chips,
    lvEl("div", { class: "lv-stage" },
      lvEl("div", { class: "lv-ringwrap", role: "progressbar", "aria-label": "Seconds held", "aria-valuemin": "0", "aria-valuemax": String(o.seconds), "aria-valuenow": "0" }, ring, lvEl("div", { class: "lv-ringtxt" }, noteBig, secs)),
      lvEl("div", { class: "lv-tune" }, lvEl("div", { class: "lv-bar" }, lvEl("i", { class: "lv-mid" }), needle), lvEl("div", { class: "lv-scale" }, lvEl("span", null, "flat"), centsTxt, lvEl("span", null, "sharp")))),
    msg,
    lvEl("div", { class: "lv-row" }, startBtn, hearBtn, drone.el));

  function mark() { if (chips) chips.querySelectorAll(".lv-chip").forEach((c, i) => { c.classList.toggle("lv-now", i === idx && !finished); }); }
  function newTracker() { tracker = holdTracker({ target: targets[idx], seconds: o.seconds, cents: o.cents }); goalEl.textContent = goal(); mark(); }
  function onReading(r) {
    if (finished || r.t < pauseUntil) return;
    const s = tracker.feed(r);
    const frac = Math.min(1, s.held / o.seconds), key = String(targets[idx]);
    bests[key] = Math.max(bests[key] || 0, s.best);
    if (Math.floor(s.held) !== shownSec) { shownSec = Math.floor(s.held); el.querySelector(".lv-ringwrap").setAttribute("aria-valuenow", String(Math.min(o.seconds, shownSec))); }
    arcSvg.setAttribute("stroke-dashoffset", (C * (1 - frac)).toFixed(1));
    secs.textContent = s.held.toFixed(1) + " s" + (s.best > s.held + 0.5 ? " (best " + s.best.toFixed(1) + ")" : "");
    if (r.semi !== null && r.semi > -7.5) {
      lastSound = r.t;
      noteBig.textContent = codeOf(r.near);
      const ok = Math.abs(r.cents) <= o.cents;
      needle.style.left = (50 + Math.max(-50, Math.min(50, r.cents))) + "%";
      needle.className = "lv-needle " + (Math.abs(r.cents) <= 10 ? "lv-good" : ok ? "lv-warn" : "lv-bad");
      centsTxt.textContent = (r.cents > 0 ? "+" : "") + r.cents + " cents";
      const t = targets[idx];
      if (t !== null && r.near !== t) msg.textContent = `That is ${codeOf(r.near)} (${westOf(r.near)}). The target is ${codeOf(t)}.`;
      else msg.textContent = s.ok ? (s.held < 1.5 ? "Good start. Keep the air steady." : pitchAdvice(r.cents)) : pitchAdvice(r.cents);
    } else if (r.t - lastSound > 1.2) { noteBig.textContent = "-"; msg.textContent = s.best ? `Best hold: ${s.best.toFixed(1)} s. Breathe, then play again.` : "Listening... play a long note."; needle.className = "lv-needle"; centsTxt.textContent = ""; }
    if (s.done) {
      lvChime();
      if (chips) chips.querySelector(`[data-i="${idx}"]`).classList.add("lv-ok");
      if (idx < targets.length - 1) {
        idx++; pauseUntil = r.t + 1.2; newTracker();
        msg.textContent = `Held. Rest, then ${codeOf(targets[idx])}.`;
      } else {
        finished = true; mark();
        msg.textContent = targets[0] === null ? `Held ${o.seconds} s. Well done.` : "Every note held. Well done.";
        el.classList.add("lv-passed");
        if (o.onPass) { try { o.onPass({ targets, seconds: o.seconds }); } catch (e) { /* ignore */ } }
        stop(); // the goal is met: close the microphone; "Again" starts a fresh attempt
      }
    }
  }
  async function start() {
    if (life.starting) return;
    if (unsub) { stop(); return; }
    life.starting = true;
    const g0 = life.gen;
    try {
      if (!(await micIntro(el)) || life.dead || life.gen !== g0) return;
      finished = false; idx = 0; el.classList.remove("lv-passed");
      if (chips) chips.querySelectorAll(".lv-chip").forEach(c => c.classList.remove("lv-ok"));
      newTracker();
      ac();
      const u = await lvListen(life, onReading);
      if (!u) return;
      unsub = u; startBtn.textContent = "Stop"; msg.textContent = "Listening... play a long note.";
    } catch (e) { msg.textContent = lvMicError(e); }
    finally { life.starting = false; }
  }
  function report() {
    for (const [k, best] of Object.entries(bests)) if (best >= 1) emitLive({ type: "hold", target: k === "null" ? null : Number(k), seconds: Math.round(best * 10) / 10 });
    for (const k of Object.keys(bests)) delete bests[k];
  }
  function stop() { life.gen++; if (unsub) { unsub(); unsub = null; report(); } startBtn.textContent = finished ? "Again" : "Start"; }
  startBtn.addEventListener("click", start);
  if (hearBtn) hearBtn.addEventListener("click", () => { const c = ac(); playNote(targets[idx], 1.6); muteListening(c.currentTime + 1.9); });
  return { el, start, stop, destroy() { life.dead = true; stop(); drone.stop(); } };
}

// ---------- Phrase check ----------
// Play a written phrase; each note is marked as it is heard. opts: { phrase: [semi], reps, onPass, hear(): plays it }
export function phraseCheck(opts) {
  const o = Object.assign({ phrase: [], reps: 1, onPass: null, noteS: 0.8 }, opts || {});
  let matcher = null, seq = null, unsub = null, clean = 0, quietTimer = 0;
  const life = { gen: 0, dead: false, starting: false };
  const exp = o.phrase.slice();
  const slots = lvEl("div", { class: "lv-slots" });
  const msg = lvEl("p", { class: "lv-msg", "aria-live": "polite" }, "Press Start, then play the phrase.");
  const count = lvEl("span", { class: "lv-count" }, o.reps > 1 ? `0 of ${o.reps} clean in a row` : "");
  const startBtn = lvEl("button", { type: "button", class: "lv-btn lv-primary" }, "Start");
  const hearBtn = lvEl("button", { type: "button", class: "lv-btn" }, "Hear it");
  const el = lvEl("div", { class: "lv lv-phrase" },
    lvEl("p", { class: "lv-goal" }, "Play: ", lvEl("b", { class: "lv-mono" }, exp.map(codeOf).join(" ")), exp.some((x, i) => i && x === exp[i - 1]) ? " (tongue each repeated note)" : ""),
    slots, lvEl("div", { class: "lv-row" }, count), msg, lvEl("div", { class: "lv-row" }, startBtn, hearBtn));
  function drawSlots(st) {
    slots.replaceChildren(...exp.map((s, i) => lvEl("span", { class: "lv-slot" + (st && st.marks[i] ? " lv-" + st.marks[i] : i === (st ? st.pos : 0) ? " lv-next" : "") }, codeOf(s))));
  }
  function fresh() { matcher = phraseMatcher(exp); drawSlots(matcher.state()); }
  function onReading(r) {
    const n = seq.feed(r);
    if (!n) return;
    clearTimeout(quietTimer);
    const st = matcher.feed(n.semi);
    drawSlots(st);
    const last = st.marks[st.pos - 1];
    if (last === "octave") msg.textContent = `Right note, wrong octave: ${codeOf(n.semi)}. Use ${n.semi > exp[st.pos - 1] ? "slower" : "faster"} air.`;
    else if (last === "wrong") msg.textContent = `Heard ${codeOf(n.semi)}, expected ${codeOf(exp[st.pos - 1])}.`;
    else msg.textContent = "";
    if (!st.done && matcher.onlyRepeatsLeft()) quietTimer = setTimeout(() => { if (unsub) { drawSlots(matcher.completeRepeats()); passDone(matcher.state()); } }, 1200);
    else if (st.done) passDone(st);
    else quietTimer = setTimeout(() => { if (unsub) { msg.textContent = "Start again from the first note when ready."; fresh(); } }, 6000);
  }
  function passDone(st) {
    {
      if (st.clean) { clean++; lvChime(); } else clean = 0;
      count.textContent = o.reps > 1 ? `${clean} of ${o.reps} clean in a row` : "";
      if (clean >= o.reps) {
        msg.textContent = "Clean. Well done."; el.classList.add("lv-passed"); stop();
        if (o.onPass) { try { o.onPass({ reps: clean }); } catch (e) { /* ignore */ } }
        return;
      }
      msg.textContent = st.clean ? "Clean. Again from the start." : "Not clean yet. Again from the start, slowly.";
      // A new pass starts at once, so the next notes belong to it (and cannot count twice).
      fresh();
    }
  }
  async function start() {
    if (life.starting) return;
    if (unsub) { stop(); return; }
    life.starting = true;
    const g0 = life.gen;
    try {
      if (!(await micIntro(el)) || life.dead || life.gen !== g0) return;
      clean = 0; el.classList.remove("lv-passed"); count.textContent = o.reps > 1 ? `0 of ${o.reps} clean in a row` : "";
      seq = noteSequencer(); fresh();
      ac();
      const u = await lvListen(life, onReading);
      if (!u) return;
      unsub = u; startBtn.textContent = "Stop"; msg.textContent = "Listening. Play the phrase.";
    } catch (e) { msg.textContent = lvMicError(e); }
    finally { life.starting = false; }
  }
  function stop() { life.gen++; clearTimeout(quietTimer); if (unsub) { unsub(); unsub = null; } startBtn.textContent = "Start"; }
  startBtn.addEventListener("click", start);
  hearBtn.addEventListener("click", () => { lvPlayPhrase(exp, o.noteS); if (seq) seq.reset(); });
  drawSlots(null);
  return { el, start, stop, destroy() { life.dead = true; stop(); } };
}

// ---------- Echo game ----------
export const ECHO_LEVELS = [
  ["sp", "Sa and Pa", [0, 7]], ["srg", "S R G", [0, 2, 4]], ["srgmp", "S R G m P", [0, 2, 4, 5, 7]],
  ["low", "Low notes: .P .D .N S R G", [-5, -3, -1, 0, 2, 4]], ["bil", "Middle octave (Bilawal)", [0, 2, 4, 5, 7, 9, 11, 12]],
  ["kal", "Middle octave (Kalyan)", [0, 2, 4, 6, 7, 9, 11, 12]], ["bhu", "Bhupali: S R G P D S'", [0, 2, 4, 7, 9, 12]],
];
function lvStore(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem("bansuri.live." + k) || "null"); localStorage.setItem("bansuri.live." + k, JSON.stringify(v)); } catch (e) { return null; } return v; }

// A phrase of n notes that moves mostly by step, without repeating a note back to back.
export function echoPhrase(set, n, rnd) {
  rnd = rnd || Math.random;
  const out = []; let i = set.indexOf(0) >= 0 ? set.indexOf(0) : 0;
  for (let k = 0; k < n; k++) {
    if (k > 0) {
      let j = i;
      while (j === i) { const step = rnd() < 0.75 ? 1 : 2; j = Math.max(0, Math.min(set.length - 1, i + (rnd() < 0.5 ? -step : step))); if (set.length === 1) break; }
      i = j;
    }
    out.push(set[i]);
  }
  return out;
}

// opts: { level, notes: [semi] and notesLabel (a custom set, such as a raga's notes), onResult }
export function echoGame(opts) {
  const o = Object.assign({ level: "srg", onResult: null }, opts || {});
  const saved = lvStore("echo") || {};
  // A custom set (a raga's notes) gets its own id, so each raga's results are kept apart.
  const customId = o.levelId || "custom";
  const levels = o.notes && o.notes.length ? [[customId, o.notesLabel || "These notes", o.notes]].concat(ECHO_LEVELS) : ECHO_LEVELS;
  let level = o.notes && o.notes.length ? levels[0] : (levels.find(l => l[0] === (saved.level || o.level)) || ECHO_LEVELS[1]);
  let len = (saved.len && saved.len[level[0]]) || 2, streak = 0, misses = 0, phrase = [], matcher = null, seq = null, unsub = null, quietTimer = 0, playTimer = 0, playing = false;
  const life = { gen: 0, dead: false };
  const sel = lvEl("select", { class: "lv-select", "aria-label": "Notes to use" }, levels.map(l => lvEl("option", { value: l[0] }, l[1])));
  sel.value = level[0];
  const lenTxt = lvEl("span", { class: "lv-count" });
  const showBox = lvEl("input", { type: "checkbox" }), singBox = lvEl("input", { type: "checkbox" });
  const slots = lvEl("div", { class: "lv-slots" });
  const msg = lvEl("p", { class: "lv-msg", "aria-live": "polite" }, "The app plays a short phrase. Play it back on your flute; each note is checked as you play.");
  const goBtn = lvEl("button", { type: "button", class: "lv-btn lv-primary" }, "Play me a phrase");
  const againBtn = lvEl("button", { type: "button", class: "lv-btn", disabled: true }, "Hear it again");
  const drone = lvDrone("Drone");
  const el = lvEl("div", { class: "lv lv-echo" },
    lvEl("div", { class: "lv-row" }, lvEl("label", { class: "lv-field" }, "Notes", sel), lenTxt, lvEl("label", { class: "lv-check" }, showBox, "Show the notes"), lvEl("label", { class: "lv-check", title: "Sing it back instead of playing: any octave counts" }, singBox, "I will sing"), drone.el),
    slots, msg, lvEl("div", { class: "lv-row" }, goBtn, againBtn));
  const save = () => { if (level[0] === customId && o.notes) return; const s = lvStore("echo") || {}; s.level = level[0]; s.len = Object.assign({}, s.len, { [level[0]]: len }); lvStore("echo", s); };
  const showLen = () => { lenTxt.textContent = `Phrase length ${len}`; };
  function drawSlots(st) {
    slots.replaceChildren(...phrase.map((s, i) => {
      const m = st && st.marks[i];
      return lvEl("span", { class: "lv-slot" + (m ? " lv-" + m : st && i === st.pos ? " lv-next" : "") }, m || showBox.checked || (st && st.done) ? codeOf(s) : "?");
    }));
  }
  let opening = null;
  async function ensureMic() {
    if (unsub) return true;
    if (!opening) opening = lvListen(life, onReading).then(u => { opening = null; if (u) unsub = u; return !!u; }, e => { opening = null; msg.textContent = lvMicError(e); return false; });
    return opening;
  }
  function play() {
    playing = true; seq = noteSequencer(); matcher = phraseMatcher(phrase); drawSlots(matcher.state());
    const end = lvPlayPhrase(phrase, 0.75);
    msg.textContent = "Listen...";
    clearTimeout(playTimer);
    playTimer = setTimeout(() => { playing = false; msg.textContent = "Your turn: play it back."; armQuiet(); }, Math.max(0, (end - ac().currentTime) * 1000 + 350));
  }
  function armQuiet() { clearTimeout(quietTimer); quietTimer = setTimeout(() => finish(true), 7000); }
  function finish(timedOut) {
    clearTimeout(quietTimer);
    if (!matcher) return;
    const st = matcher.state();
    if (!st.done && !timedOut) return;
    const clean = st.done && st.clean;
    matcher = null; drawSlots(Object.assign({}, st, { done: true }));
    if (clean) {
      streak++; misses = 0; lvChime();
      if (streak >= 2 && len < 8) { len++; streak = 0; msg.textContent = `Correct. Next phrases have ${len} notes.`; }
      else msg.textContent = "Correct.";
    } else {
      misses++; streak = 0;
      if (misses >= 2 && len > 1) { len--; misses = 0; msg.textContent = `Not quite. Back to ${len} notes. Press Hear it again to retry.`; }
      else msg.textContent = timedOut && !st.pos ? "No notes heard. Press Hear it again, then play it back." : "Not quite. Press Hear it again to retry, or play a new phrase.";
    }
    save(); showLen();
    emitLive({ type: "echo", level: level[0], levelLabel: level[1], len, correct: clean });
    if (o.onResult) { try { o.onResult({ correct: clean, len, level: level[0] }); } catch (e) { /* ignore */ } }
  }
  function onReading(r) {
    if (playing || !matcher || !seq) return;
    const n = seq.feed(r);
    if (!n) return;
    // Singing: the octave does not matter, so fold the sung note onto the expected one when the names match.
    let semi = n.semi;
    if (singBox.checked && matcher.state().pos < phrase.length) { const want = phrase[matcher.state().pos]; if (((semi - want) % 12 + 12) % 12 === 0) semi = want; }
    const st = matcher.feed(semi);
    drawSlots(st);
    slots.setAttribute("aria-label", st.marks.filter(m => m === "ok").length + " of " + phrase.length + " notes right");
    if (st.done) finish(false); else armQuiet();
  }
  goBtn.addEventListener("click", async () => { ac(); if (!(await micIntro(el)) || life.dead || !(await ensureMic())) return; phrase = echoPhrase(level[2], len); againBtn.disabled = false; play(); });
  againBtn.addEventListener("click", async () => { if (!phrase.length || !(await ensureMic())) return; play(); });
  sel.addEventListener("change", () => { level = levels.find(l => l[0] === sel.value); len = ((lvStore("echo") || {}).len || {})[level[0]] || 2; streak = 0; misses = 0; save(); showLen(); phrase = []; slots.replaceChildren(); againBtn.disabled = true; });
  showBox.addEventListener("change", () => drawSlots(matcher ? matcher.state() : null));
  showLen();
  // Stopping drops the round in progress without scoring it.
  const stopMic = () => { life.gen++; clearTimeout(quietTimer); clearTimeout(playTimer); playing = false; matcher = null; if (unsub) { unsub(); unsub = null; } };
  return { el, stop: stopMic, destroy() { life.dead = true; stopMic(); drone.stop(); } };
}

// ---------- Tap the beat ----------
// Clicks for four bars; tap on each beat. "Silent bars" drops the click for the last two bars to
// test the inner pulse. Offsets are measured against when the click reaches the speaker.
export function tapGame(opts) {
  const o = Object.assign({ bpm: 72 }, opts || {});
  let beats = [], offsets = [], running = false, endTimer = 0, bus = null;
  const bpmSel = lvEl("select", { class: "lv-select", "aria-label": "Tempo" }, [60, 72, 90, 108, 120].map(b => lvEl("option", { value: String(b) }, b + " BPM")));
  bpmSel.value = String([60, 72, 90, 108, 120].includes(o.bpm) ? o.bpm : 72);
  const modeSel = lvEl("select", { class: "lv-select", "aria-label": "Mode" }, lvEl("option", { value: "click" }, "Click on every beat"), lvEl("option", { value: "silent" }, "Then two silent bars"));
  const pad = lvEl("button", { type: "button", class: "lv-pad", disabled: true }, "Tap");
  const lane = lvEl("div", { class: "lv-lane" }, lvEl("i", { class: "lv-zero" }), lvEl("span", { class: "lv-l" }, "early"), lvEl("span", { class: "lv-r" }, "late"));
  const msg = lvEl("p", { class: "lv-msg", "aria-live": "polite" }, "Press Start. After four count-in clicks, tap on every beat: on the pad, the space bar or any key.");
  const startBtn = lvEl("button", { type: "button", class: "lv-btn lv-primary" }, "Start");
  const calBtn = lvEl("button", { type: "button", class: "lv-btn" }, "Calibrate");
  const calTxt = lvEl("span", { class: "lv-count" });
  const showCal = () => { const l = tapLatency(); calTxt.textContent = l ? `Device delay: ${l} ms (subtracted)` : "Not calibrated: tap delay of this device is included"; };
  let calibrating = false;
  const el = lvEl("div", { class: "lv lv-tap" }, lvEl("div", { class: "lv-row" }, bpmSel, modeSel, startBtn, calBtn), pad, lane, msg, calTxt);
  function tap() {
    if (!running) return;
    const c = ac(), t = c.currentTime - (c.outputLatency || 0);
    let best = null;
    for (const b of beats) if (best === null || Math.abs(t - b.t) < Math.abs(t - best.t)) best = b;
    const beatS = 60 / Number(bpmSel.value);
    pad.classList.remove("lv-hit"); void pad.offsetWidth; pad.classList.add("lv-hit");
    if (!best || Math.abs(t - best.t) > beatS / 2 || best.used) return;
    best.used = true;
    const off = (t - best.t) * 1000 - (calibrating ? 0 : tapLatency());
    offsets.push({ off, silent: best.silent });
    const x = 50 + Math.max(-50, Math.min(50, off / 3));
    lane.append(lvEl("b", { class: "lv-dot" + (best.silent ? " lv-silent" : "") + (Math.abs(off) <= 50 ? " lv-good" : ""), style: `left:${x}%` }));
  }
  function describe(st) {
    if (!st) return "";
    const side = Math.abs(st.mean) <= 15 ? "right on the beat" : `${Math.abs(st.mean)} ms ${st.mean < 0 ? "early (rushing)" : "late (dragging)"}`;
    return `on average ${side}, spread ${st.spread} ms, ${Math.round(st.within * 100)}% within 50 ms`;
  }
  function finish(complete) {
    running = false; pad.disabled = true; startBtn.textContent = "Start";
    if (calibrating) {
      calibrating = false;
      const v = offsets.map(x => x.off).sort((a, b) => a - b);
      if (v.length < 5) { msg.textContent = "Calibration needs at least 5 taps. Try again."; return; }
      const med = v[v.length >> 1], spread = v[v.length - 2] - v[1];
      if (spread > 160) { msg.textContent = "The taps were too uneven to calibrate. Try again, tapping exactly with the click."; return; }
      tapLatency(Math.max(-40, Math.min(250, med)));
      showCal(); msg.textContent = "Calibrated. Your results now leave out this device's delay.";
      return;
    }
    const all = tapStats(offsets.map(x => x.off)), heard = tapStats(offsets.filter(x => !x.silent).map(x => x.off)), quiet = tapStats(offsets.filter(x => x.silent).map(x => x.off));
    if (!all) { msg.textContent = "No taps landed near the beats. Try a slower tempo."; return; }
    let text = `${all.n} of ${beats.length} beats tapped: ` + (quiet ? `with the click ${describe(heard)}; in the silent bars ${describe(quiet)}.` : describe(all) + ".");
    if (quiet && heard && Math.abs(quiet.mean - heard.mean) > 40) text += " Your pulse drifted without the click: count the beats aloud, then in your head.";
    else if (all.spread > 60) text += " Aim for a steadier tap before going faster.";
    else if (all.within >= 0.8) text += " Excellent. Try a faster tempo or the silent bars.";
    msg.textContent = text;
    if (complete === true) emitLive({ type: "tap", bpm: Number(bpmSel.value), silent: !!quiet, mean: all.mean, spread: all.spread, within: Math.round(all.within * 100) / 100 });
  }
  function start(cal) {
    if (running) { clearTimeout(endTimer); if (bus) { bus.disconnect(); bus = null; } finish(false); return; }
    calibrating = cal === true;
    const c = ac(), beatS = 60 / (calibrating ? 90 : Number(bpmSel.value)), t0 = c.currentTime + 0.3;
    beats = []; offsets = []; lane.querySelectorAll(".lv-dot").forEach(d => d.remove());
    const silent = modeSel.value === "silent";
    // The clicks go through their own bus, so Stop silences the ones already scheduled.
    bus = c.createGain(); bus.connect(master());
    for (let i = 0; i < 4; i++) click(t0 + i * beatS, i === 0 ? "sam" : "tick", bus);
    const n = calibrating ? 8 : 16;
    for (let i = 0; i < n; i++) {
      const t = t0 + (4 + i) * beatS, quiet = !calibrating && silent && i >= 8;
      if (!quiet) click(t, i % 4 === 0 ? "sam" : "tick", bus);
      beats.push({ t, silent: quiet, used: false });
    }
    running = true; pad.disabled = false; startBtn.textContent = "Stop";
    msg.textContent = calibrating ? "Calibrating: after the count-in, tap exactly with the 8 clicks." : silent ? "Count-in, then tap. The click stops after two bars: keep tapping." : "Count-in, then tap on every beat.";
    endTimer = setTimeout(() => finish(true), ((t0 + (4 + n) * beatS) - c.currentTime + 0.5) * 1000);
  }
  startBtn.addEventListener("click", () => start(false));
  calBtn.addEventListener("click", () => start(true));
  showCal();
  pad.addEventListener("pointerdown", e => { e.preventDefault(); tap(); });
  const onKey = e => { if (!running || e.repeat || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || "")) return; e.preventDefault(); tap(); };
  document.addEventListener("keydown", onKey);
  const abort = () => { if (!running) return; clearTimeout(endTimer); if (bus) { bus.disconnect(); bus = null; } running = false; calibrating = false; pad.disabled = true; startBtn.textContent = "Start"; msg.textContent = "Stopped."; };
  return { el, stop: abort, destroy() { clearTimeout(endTimer); running = false; if (bus) { bus.disconnect(); bus = null; } document.removeEventListener("keydown", onKey); } };
}

// ---------- Find my flute ----------
// The learner plays Sa (top three holes closed, gentle air) for 3 s; the app names the note and
// sets the flute's Sa, octave and tuning from it.
export function fluteFinder(opts) {
  const o = Object.assign({ onApply: null }, opts || {});
  let unsub = null, tracker = null, freqs = [], found = null;
  const life = { gen: 0, dead: false, starting: false };
  const msg = lvEl("p", { class: "lv-msg", "aria-live": "polite" }, "Close the top three holes, blow gently, and hold your Sa steadily for 3 seconds.");
  const big = lvEl("div", { class: "lv-big" }, "?");
  const detail = lvEl("p", { class: "lv-count" });
  const startBtn = lvEl("button", { type: "button", class: "lv-btn lv-primary" }, "Listen for my Sa");
  const useBtn = lvEl("button", { type: "button", class: "lv-btn lv-primary", hidden: true }, "Use this for my flute");
  const el = lvEl("div", { class: "lv lv-finder" }, msg, lvEl("div", { class: "lv-row" }, big, detail), lvEl("div", { class: "lv-row" }, startBtn, useBtn));
  function stop() { life.gen++; if (unsub) { unsub(); unsub = null; } startBtn.textContent = found ? "Listen again" : "Listen for my Sa"; }
  function onReading(r) {
    const s = tracker.feed(r);
    if (r.semi === null) return;
    if (s.held < 0.05) freqs = [];
    freqs.push(r.f);
    const midi = 69 + 12 * Math.log2(r.f / 440), near = Math.round(midi);
    big.textContent = WEST[(near % 12 + 12) % 12] + (Math.floor(near / 12) - 1);
    detail.textContent = `${r.f.toFixed(1)} Hz, held ${s.held.toFixed(1)} s`;
    if (s.done) {
      const v = freqs.slice().sort((a, b) => a - b), f = v[v.length >> 1];
      const m = 69 + 12 * Math.log2(f / 440), n = Math.round(m), cents = Math.round((m - n) * 100);
      const note = (n % 12 + 12) % 12, oct = Math.floor(n / 12) - 1;
      const a4 = Math.abs(cents) >= 8 ? Math.round(440 * Math.pow(2, cents / 1200) * 10) / 10 : 440;
      found = { saNote: note, saOct: Math.min(5, Math.max(4, oct)), a4, f, cents, oct };
      big.textContent = WEST[note] + oct;
      const off = Math.abs(cents) < 8 ? "in tune with A4 = 440 Hz" : `${Math.abs(cents)} cents ${cents > 0 ? "sharp" : "flat"} of standard pitch (tuning set to A4 = ${a4} Hz)`;
      msg.textContent = `Your Sa is ${WEST[note]}${oct} (${f.toFixed(1)} Hz), ${off}.` + (oct < 4 || oct > 5 ? " This flute is outside the bass and medium range the app supports; the nearest octave is used." : "");
      useBtn.hidden = false; lvChime(); stop();
    }
  }
  startBtn.addEventListener("click", async () => {
    if (life.starting) return;
    if (unsub) { stop(); return; }
    life.starting = true;
    const g0 = life.gen;
    try {
      if (!(await micIntro(el)) || life.dead || life.gen !== g0) return;
      tracker = holdTracker({ target: null, seconds: 3, cents: 20 }); freqs = []; found = null; useBtn.hidden = true;
      ac();
      const u = await lvListen(life, onReading);
      if (!u) return;
      unsub = u; startBtn.textContent = "Stop"; msg.textContent = "Listening... hold your Sa.";
    } catch (e) { msg.textContent = lvMicError(e); }
    finally { life.starting = false; }
  });
  useBtn.addEventListener("click", () => {
    if (!found) return;
    setSettings({ saNote: found.saNote, saOct: found.saOct, a4: found.a4 });
    msg.textContent = `Saved: Sa = ${WEST[found.saNote]}${found.saOct}, A4 = ${found.a4} Hz. Every pitch in the app now follows your flute.`;
    useBtn.hidden = true;
    emitLive({ type: "flute", saNote: found.saNote, saOct: found.saOct, a4: found.a4 });
    if (o.onApply) { try { o.onApply(found); } catch (e) { /* ignore */ } }
  });
  return { el, stop, destroy() { life.dead = true; stop(); } };
}
