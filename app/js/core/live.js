// Interactive exercises that listen to the real flute: a long-tone meter, a phrase check, an
// echo game (the app plays, you play it back) and a beat-tapping game. Plain DOM, styled by the
// lv- classes in bench.css, so the app and the standalone Practice Bench share them.
import { codeOf, nameOf, westOf, hzOf, WEST, tuneCents } from "./theory.js";
import { ac, master, makeVoice, playNote, tanpura, click } from "./audio.js";
import { setSettings, getSettings } from "./settings.js";
import { noteLabel } from "./fingers.js";

// A note's label for the widgets: S R G (with Devanagari underneath when chosen), or a picture of
// the fingering for learners who prefer pictures to letters.
function lvNote(semi) { return noteLabel(semi); }

// The app plugs its voice in here (setSpeaker); the standalone bench has none and stays silent.
// lvSay(...refs) speaks clip references such as "good" or ["note", 0, "is"]; resolves when done.
let speaker = null;
export function setSpeaker(fn) { speaker = fn; }
function lvSay(...refs) { if (!speaker) return Promise.resolve(false); try { return Promise.resolve(speaker(...refs)).catch(() => false); } catch (e) { return Promise.resolve(false); } }

// A soft glide from the note played to the target, so the ear hears which way to go. Only for
// learners who chose spoken feedback ("Talk to me") and kept the hints setting on.
function lvGlide(from, to) {
  const st = getSettings();
  if (!st.hints || !st.talk || !speaker) return Promise.resolve();
  const c = ac(), t0 = c.currentTime + 0.05, o = c.createOscillator(), g = c.createGain();
  o.type = "sine"; o.connect(g); g.connect(master());
  o.frequency.setValueAtTime(hzOf(from), t0); o.frequency.setValueAtTime(hzOf(from), t0 + 0.25); o.frequency.exponentialRampToValueAtTime(hzOf(to), t0 + 0.9);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.06); g.gain.setValueAtTime(0.18, t0 + 1.3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.5);
  o.start(t0); o.stop(t0 + 1.55);
  muteListening(t0 + 1.8);
  return new Promise(r => setTimeout(r, 1700));
}
import { listenMic, muteListening, holdTracker, noteSequencer, phraseMatcher, tapStats, pitchAdvice, tapLatency, tapCalibrated, emitLive, emitAttempt } from "./listen.js";

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
// The message where a widget shows it; in the app, with a link to Me > Flute (its microphone check).
function lvShowMicError(msg, e) {
  msg.textContent = lvMicError(e);
  if (typeof location !== "undefined" && /^#\//.test(location.hash || "")) msg.append(" ", lvEl("a", { href: "#/me/flute#g-checks" }, "Microphone help in Me > Flute"));
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

// A countdown before the app listens or records, so there is time to pick up the flute and settle
// the hold after tapping (setting: countdown, seconds; 0 = none). A tick each second (or the number
// spoken, with "Talk to me"), a higher beep at "go". Cancel with its button, Escape, or by pressing
// the start button (opts.btn) again. Resolves true to go ahead, false when cancelled.
export function countdown(host, opts) {
  const o = Object.assign({ btn: null, label: "Get ready: hold your flute" }, opts || {});
  const test = typeof window !== "undefined" ? window.__countdownSeconds : undefined; // tests set this
  let n = Math.round(test !== undefined ? test : getSettings().countdown);
  if (!n || !host) return Promise.resolve(true);
  return new Promise(resolve => {
    let timer = 0, done = false;
    const num = lvEl("b", { class: "lv-cdnum", "aria-hidden": "true" }, String(n));
    const sr = lvEl("span", { class: "lv-sr", "aria-live": "assertive" }, o.label + ". " + n);
    const cancelBtn = lvEl("button", { type: "button", class: "lv-btn" }, "Cancel");
    const box = lvEl("div", { class: "lv-countdown", role: "timer" }, lvEl("span", { class: "lv-cdlabel" }, o.label), num, sr, cancelBtn,
      lvEl("span", { class: "lv-count" }, "Change the countdown in Settings."));
    const onKey = e => { if (e.key === "Escape") finish(false); };
    const onBtn = e => { e.stopImmediatePropagation(); e.preventDefault(); finish(false); };
    function finish(ok) {
      if (done) return; done = true;
      clearInterval(timer); box.remove();
      document.removeEventListener("keydown", onKey);
      if (o.btn) o.btn.removeEventListener("click", onBtn, true);
      resolve(ok);
    }
    const sound = last => {
      if (!last && speaker && getSettings().talk) { lvSay(["num", n]); return; }
      try { const c = ac(), t = c.currentTime + 0.02; click(t, last ? "sam" : "tick"); muteListening(t + 0.3); } catch (e) { /* audio unavailable */ }
    };
    cancelBtn.addEventListener("click", () => finish(false));
    document.addEventListener("keydown", onKey);
    if (o.btn) o.btn.addEventListener("click", onBtn, true);
    host.prepend(box);
    sound(false);
    timer = setInterval(() => {
      n--;
      if (n <= 0) { sound(true); finish(true); return; }
      num.textContent = String(n); sr.textContent = String(n); sound(false);
    }, 1000);
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
// opts: { targets: [semi] (in order) or null for any steady note, seconds, cents, onPass(results),
//   ghost(target) -> the learner's best hold in seconds for that note (drawn as a faint arc to beat) }
export function holdMeter(opts) {
  const o = Object.assign({ targets: null, seconds: 8, cents: 25, onPass: null, ghost: null }, opts || {});
  const targets = o.targets && o.targets.length ? o.targets : [null];
  let idx = 0, tracker = null, unsub = null, finished = false, lastSound = 0, pauseUntil = 0, shownSec = -1;
  const life = { gen: 0, dead: false, starting: false };
  const bests = {}; // best hold per target this session, reported when listening stops
  // The note being played now, judged when it ends (spoken feedback never talks over a held note).
  let cur = null, talking = false;
  function noteEnded(n) {
    cur = null;
    if (finished || n.frames < 8) return;
    const t = targets[idx], near = n.notes.sort((a, b) => b[1] - a[1])[0][0], cents = n.cents / n.frames, clear = n.clarity / n.frames;
    let refs = null, glide = null, fix = "TS-07";
    if (t !== null && near !== t) { refs = [["note", near, "is"], ["note", t, "play"]]; glide = [near + cents / 100, t]; fix = (near - t) % 12 === 0 ? "TS-02" : "TS-05"; }
    else if (cents > o.cents) { refs = ["sharp"]; glide = t !== null ? [t + cents / 100, t] : null; fix = "TS-05"; }
    else if (cents < -o.cents) { refs = ["flat"]; glide = t !== null ? [t + cents / 100, t] : null; fix = "TS-05"; }
    else if (clear < 0.86) { refs = ["airy"]; fix = "TS-01"; }
    else if (n.secs < 1.5) refs = ["too_short"];
    else refs = ["breathe_again"];
    // A note that ended before the hold was long enough is a miss (the held one never gets here).
    emitAttempt({ ok: false, fix });
    if (talking) return;
    talking = true;
    lvSay(...refs).then(() => glide ? lvGlide(glide[0], glide[1]) : null).then(() => { talking = false; });
  }
  const R = 52, C = 2 * Math.PI * R;
  const ring = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  ring.setAttribute("viewBox", "0 0 120 120"); ring.setAttribute("class", "lv-ring"); ring.setAttribute("aria-hidden", "true");
  ring.innerHTML = `<circle cx="60" cy="60" r="${R}" class="lv-track"></circle><circle cx="60" cy="60" r="${R}" class="lv-ghost" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"></circle><circle cx="60" cy="60" r="${R}" class="lv-arc" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"></circle>`;
  const arcSvg = ring.querySelector(".lv-arc"), ghostSvg = ring.querySelector(".lv-ghost");
  const ghostTxt = lvEl("div", { class: "lv-count" });
  // Your best so far for this note, as a faint arc: a race against yourself.
  function showGhost() {
    const best = o.ghost ? Number(o.ghost(targets[idx])) || 0 : 0;
    ghostSvg.setAttribute("stroke-dashoffset", (C * (1 - Math.min(1, best / o.seconds))).toFixed(1));
    ghostTxt.textContent = best ? `Your best on this note: ${best.toFixed(1)} s` : "";
  }
  // Tone glow: bright when the sound is clear, dim when it is airy (from the detector's clarity).
  // The label keeps its place on the page and is only hidden or shown, and it changes only after the
  // tone has stayed in a new band for half a second, so the page never jumps while you play.
  let glow = 0, toneShown = "", toneWant = "", toneSince = 0;
  const glowTxt = lvEl("span", { class: "lv-glowtxt", style: "visibility:hidden" }, "Tone: clear");
  function showTone(r) {
    const sounding = r.semi !== null && r.semi > -7.5;
    const want = sounding ? (glow > 0.93 ? "Tone: clear" : glow > 0.85 ? "Tone: fairly clear" : "Tone: airy") : r.t - lastSound > 1.2 ? "" : toneShown;
    if (want !== toneWant) { toneWant = want; toneSince = r.t; }
    if (want === toneShown || r.t - toneSince < 0.5) return;
    toneShown = want;
    if (want) glowTxt.textContent = want;
    glowTxt.style.visibility = want ? "visible" : "hidden";
  }
  const noteBig = lvEl("div", { class: "lv-big" }, "-");
  const secs = lvEl("div", { class: "lv-secs" }, "0.0 s");
  const needle = lvEl("i", { class: "lv-needle" });
  const centsTxt = lvEl("span", { class: "lv-cents" }, "");
  // What the old live tuner showed too: the Western name and the frequency. Hidden, not removed, in silence.
  const hzTxt = lvEl("span", { class: "lv-hz", style: "visibility:hidden" }, "C5 523.3 Hz");
  const msg = lvEl("p", { class: "lv-msg", "aria-live": "polite" }, "Press Start, then play a long, steady note.");
  // For screen readers: the seconds held, every 2 s (the ring itself is silent).
  const srLive = lvEl("span", { class: "lv-sr", "aria-live": "polite" });
  const chips = targets[0] === null ? null : lvEl("div", { class: "lv-chips" }, targets.map((s, i) => lvEl("span", { class: "lv-chip", "data-i": String(i) }, lvNote(s))));
  const startBtn = lvEl("button", { type: "button", class: "lv-btn lv-primary" }, "Start");
  const hearBtn = targets[0] === null ? null : lvEl("button", { type: "button", class: "lv-btn" }, "Hear the note");
  const drone = lvDrone("Drone");
  const goal = () => targets[idx] === null ? `Hold any note steadily for ${o.seconds} s.` : `Hold ${codeOf(targets[idx])} (${nameOf(targets[idx])}) for ${o.seconds} s, within ${o.cents} cents.`;
  const goalEl = lvEl("p", { class: "lv-goal" }, goal());
  const el = lvEl("div", { class: "lv lv-hold" },
    goalEl, chips,
    lvEl("div", { class: "lv-stage" },
      lvEl("div", { class: "lv-ringwrap lv-glow", role: "progressbar", "aria-label": "Seconds held", "aria-valuemin": "0", "aria-valuemax": String(o.seconds), "aria-valuenow": "0" }, ring, lvEl("div", { class: "lv-ringtxt" }, noteBig, secs)),
      lvEl("div", { class: "lv-tune" }, lvEl("div", { class: "lv-bar" }, lvEl("i", { class: "lv-mid" }), needle), lvEl("div", { class: "lv-scale" }, lvEl("span", null, "flat"), centsTxt, lvEl("span", null, "sharp")))),
    lvEl("div", { class: "lv-row" }, ghostTxt, glowTxt, hzTxt),
    msg, srLive,
    lvEl("div", { class: "lv-row" }, startBtn, hearBtn, drone.el));

  function mark() { if (chips) chips.querySelectorAll(".lv-chip").forEach((c, i) => { c.classList.toggle("lv-now", i === idx && !finished); }); }
  function newTracker() { tracker = holdTracker({ target: targets[idx], seconds: o.seconds, cents: o.cents }); goalEl.textContent = goal(); mark(); showGhost(); }
  showGhost(); // the time to beat shows before the first Start
  function onReading(r) {
    if (finished || r.t < pauseUntil) return;
    const s = tracker.feed(r);
    const frac = Math.min(1, s.held / o.seconds), key = String(targets[idx]);
    bests[key] = Math.max(bests[key] || 0, s.best);
    if (Math.floor(s.held) !== shownSec) {
      shownSec = Math.floor(s.held); el.querySelector(".lv-ringwrap").setAttribute("aria-valuenow", String(Math.min(o.seconds, shownSec)));
      if (shownSec > 0 && shownSec % 2 === 0) srLive.textContent = shownSec + " s";
    }
    arcSvg.setAttribute("stroke-dashoffset", (C * (1 - frac)).toFixed(1));
    secs.textContent = s.held.toFixed(1) + " s" + (s.best > s.held + 0.5 ? " (best " + s.best.toFixed(1) + ")" : "");
    const wrap = el.querySelector(".lv-ringwrap");
    glow = glow * 0.85 + (r.semi !== null ? (r.clarity || 0) : 0) * 0.15;
    wrap.style.setProperty("--glow", Math.max(0, (glow - 0.6) / 0.4).toFixed(2));
    if (r.semi !== null && r.semi > -7.5) {
      lastSound = r.t;
      if (!cur) cur = { start: r.t, frames: 0, cents: 0, clarity: 0, notes: [] };
      cur.frames++; cur.secs = r.t - cur.start; cur.clarity += r.clarity || 0;
      const t0 = targets[idx];
      cur.cents += t0 === null ? r.cents : (r.semi - t0) * 100 - tuneCents(t0);
      const e = cur.notes.find(x => x[0] === r.near); if (e) e[1]++; else cur.notes.push([r.near, 1]);
      noteBig.replaceChildren(...[].concat(lvNote(r.near)));
      const ok = Math.abs(r.cents) <= o.cents;
      needle.style.left = (50 + Math.max(-50, Math.min(50, r.cents))) + "%";
      needle.className = "lv-needle " + (Math.abs(r.cents) <= 10 ? "lv-good" : ok ? "lv-warn" : "lv-bad");
      centsTxt.textContent = (r.cents > 0 ? "+" : "") + r.cents + " cents";
      if (r.f) { hzTxt.textContent = westOf(r.near) + " " + r.f.toFixed(1) + " Hz"; hzTxt.style.visibility = "visible"; }
      const t = targets[idx];
      if (t !== null && r.near !== t) msg.textContent = `That is ${codeOf(r.near)} (${westOf(r.near)}). The target is ${codeOf(t)}.`;
      else msg.textContent = s.ok ? (s.held < 1.5 ? "Good start. Keep the air steady." : pitchAdvice(r.cents)) : pitchAdvice(r.cents);
    } else if (cur && r.t - lastSound > 0.6) noteEnded(cur);
    showTone(r);
    if (!(r.semi !== null && r.semi > -7.5) && r.t - lastSound > 1.2) { noteBig.textContent = "-"; msg.textContent = s.best ? `Best hold: ${s.best.toFixed(1)} s. Breathe, then play again.` : "Listening... play a long note."; needle.className = "lv-needle"; centsTxt.textContent = ""; hzTxt.style.visibility = "hidden"; }
    if (s.done) {
      lvChime();
      if (chips) chips.querySelector(`[data-i="${idx}"]`).classList.add("lv-ok");
      cur = null;
      if (idx < targets.length - 1) {
        idx++; pauseUntil = r.t + 1.2; newTracker();
        msg.textContent = `Held. Rest, then ${codeOf(targets[idx])}.`;
        talking = true; lvSay("held_well", ["note", targets[idx], "hold"]).then(() => { talking = false; });
      } else {
        finished = true; mark();
        lvSay(targets.length > 1 ? "every_note_held" : "held_well");
        msg.textContent = targets[0] === null ? `Held ${o.seconds} s. Well done.` : "Every note held. Well done.";
        el.classList.add("lv-passed");
        emitAttempt({ ok: true });
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
      if (!(await countdown(el, { btn: startBtn })) || life.dead || life.gen !== g0) return;
      finished = false; idx = 0; el.classList.remove("lv-passed");
      if (chips) chips.querySelectorAll(".lv-chip").forEach(c => c.classList.remove("lv-ok"));
      newTracker();
      ac();
      const u = await lvListen(life, onReading);
      if (!u) return;
      unsub = u; startBtn.textContent = "Stop"; msg.textContent = "Listening... play a long note.";
      talking = true; lvSay(targets[idx] === null ? "hold_intro" : ["note", targets[idx], "hold"], ["secs", o.seconds]).then(() => { talking = false; });
    } catch (e) { lvShowMicError(msg, e); }
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

// A short rising two-tone after the app's phrase: "your turn", heard without reading.
function lvTurnCue(after) {
  try { const c = ac(), t = Math.max(c.currentTime, after) + 0.12; click(t, "tick"); click(t + 0.1, "tali"); muteListening(t + 0.35); } catch (e) { /* audio unavailable */ }
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
  // After a miss, the phrase at half speed sits beside Hear it (the fix next to the problem).
  const slowBtn = lvEl("button", { type: "button", class: "lv-btn", hidden: true }, "Half speed");
  // A missed pass stays on screen (the note that broke marked) until the next pass begins.
  let showing = false;
  const el = lvEl("div", { class: "lv lv-phrase" },
    lvEl("p", { class: "lv-goal" }, "Play: ", lvEl("b", { class: "lv-mono" }, exp.map(codeOf).join(" ")), exp.some((x, i) => i && x === exp[i - 1]) ? " (tongue each repeated note)" : ""),
    slots, lvEl("div", { class: "lv-row" }, count), msg, lvEl("div", { class: "lv-row" }, startBtn, hearBtn, slowBtn));
  function drawSlots(st) {
    slots.replaceChildren(...exp.map((s, i) => lvEl("span", { class: "lv-slot" + (st && st.marks[i] ? " lv-" + st.marks[i] : i === (st ? st.pos : 0) ? " lv-next" : "") }, lvNote(s))));
  }
  function fresh() { matcher = phraseMatcher(exp); drawSlots(matcher.state()); }
  function onReading(r) {
    const n = seq.feed(r);
    if (!n) return;
    clearTimeout(quietTimer);
    if (showing) { showing = false; fresh(); el.classList.remove("lv-missed"); }
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
      if (st.clean) {
        emitAttempt({ ok: true });
        msg.textContent = "Clean. Again from the start.";
        // A new pass starts at once, so the next notes belong to it (and cannot count twice).
        fresh();
        return;
      }
      // The result of a miss: the first note that broke, named, with the fix beside it. The marks
      // stay until the next note starts a new pass.
      const at = st.marks.findIndex(m => m && m !== "ok"), mark = st.marks[at];
      emitAttempt({ ok: false, fix: mark === "octave" ? "TS-02" : "TS-06" });
      msg.textContent = at < 0 ? "Not clean yet. Again from the start, slowly."
        : `The ${codeOf(exp[at])} (note ${at + 1}) slipped${mark === "octave" ? ", in the wrong octave" : ""}. Hear it, or try half speed, then again from the start.`;
      slowBtn.hidden = false; showing = true; el.classList.add("lv-missed");
      matcher = phraseMatcher(exp);
    }
  }
  async function start() {
    if (life.starting) return;
    if (unsub) { stop(); return; }
    life.starting = true;
    const g0 = life.gen;
    try {
      if (!(await micIntro(el)) || life.dead || life.gen !== g0) return;
      if (!(await countdown(el, { btn: startBtn })) || life.dead || life.gen !== g0) return;
      clean = 0; el.classList.remove("lv-passed"); count.textContent = o.reps > 1 ? `0 of ${o.reps} clean in a row` : "";
      seq = noteSequencer(); fresh();
      ac();
      const u = await lvListen(life, onReading);
      if (!u) return;
      unsub = u; startBtn.textContent = "Stop"; msg.textContent = "Listening. Play the phrase.";
    } catch (e) { lvShowMicError(msg, e); }
    finally { life.starting = false; }
  }
  function stop() { life.gen++; clearTimeout(quietTimer); if (unsub) { unsub(); unsub = null; } startBtn.textContent = "Start"; }
  startBtn.addEventListener("click", start);
  hearBtn.addEventListener("click", () => { lvPlayPhrase(exp, o.noteS); if (seq) seq.reset(); });
  slowBtn.addEventListener("click", () => { lvPlayPhrase(exp, o.noteS * 2); if (seq) seq.reset(); });
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

// opts: { level, notes: [semi] and notesLabel (a custom set, such as a raga's notes), onResult,
//   test: { rounds, pass, len } for a scored test (fixed length, a set number of phrases), onPass }
export function echoGame(opts) {
  const o = Object.assign({ level: "srg", onResult: null, test: null, onPass: null }, opts || {});
  let testRounds = 0, testRight = 0;
  const saved = lvStore("echo") || {};
  // A custom set (a raga's notes) gets its own id, so each raga's results are kept apart.
  const customId = o.levelId || "custom";
  const levels = o.notes && o.notes.length ? [[customId, o.notesLabel || "These notes", o.notes]].concat(ECHO_LEVELS) : ECHO_LEVELS;
  let level = o.notes && o.notes.length ? levels[0] : (levels.find(l => l[0] === (saved.level || o.level)) || ECHO_LEVELS[1]);
  let len = o.test ? o.test.len : (saved.len && saved.len[level[0]]) || 2, streak = 0, misses = 0, phrase = [], matcher = null, seq = null, unsub = null, quietTimer = 0, playTimer = 0, playing = false;
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
  const showLen = () => { lenTxt.textContent = o.test ? `${testRight} right of ${testRounds} (test: ${o.test.pass} of ${o.test.rounds} to pass)` : `Phrase length ${len}`; };
  function drawSlots(st) {
    slots.replaceChildren(...phrase.map((s, i) => {
      const m = st && st.marks[i];
      return lvEl("span", { class: "lv-slot" + (m ? " lv-" + m : st && i === st.pos ? " lv-next" : "") }, m || showBox.checked || (st && st.done) ? lvNote(s) : "?");
    }));
  }
  let opening = null;
  async function ensureMic() {
    if (unsub) return true;
    if (!opening) opening = lvListen(life, onReading).then(u => { opening = null; if (u) unsub = u; return !!u; }, e => { opening = null; lvShowMicError(msg, e); return false; });
    return opening;
  }
  function play() {
    playing = true; seq = noteSequencer(); matcher = phraseMatcher(phrase); drawSlots(matcher.state());
    const end = lvPlayPhrase(phrase, 0.75);
    msg.textContent = "Listen...";
    clearTimeout(playTimer);
    playTimer = setTimeout(() => { playing = false; msg.textContent = "Your turn: play it back."; armQuiet(); }, Math.max(0, (end - ac().currentTime) * 1000 + 350));
    lvTurnCue(end);
  }
  function armQuiet() { clearTimeout(quietTimer); quietTimer = setTimeout(() => finish(true), 7000); }
  function finish(timedOut) {
    clearTimeout(quietTimer);
    if (!matcher) return;
    const st = matcher.state();
    if (!st.done && !timedOut) return;
    const clean = st.done && st.clean;
    matcher = null; drawSlots(Object.assign({}, st, { done: true }));
    if (o.test) {
      testRounds++; if (clean) { testRight++; lvChime(); }
      if (testRounds >= o.test.rounds) {
        const passed = testRight >= o.test.pass;
        msg.textContent = `${testRight} of ${o.test.rounds} phrases right. ` + (passed ? "Passed." : `${o.test.pass} needed: practise with Play back and try again.`);
        if (passed) { el.classList.add("lv-passed"); if (o.onPass) { try { o.onPass({ right: testRight }); } catch (e) { /* ignore */ } } }
        testRounds = 0; testRight = 0;
      } else msg.textContent = (clean ? "Correct. " : "Not quite. ") + `Phrase ${testRounds + 1} of ${o.test.rounds}: press Play me a phrase.`;
      showLen(); return;
    }
    if (clean) {
      streak++; misses = 0; lvChime();
      if (streak >= 2 && len < 8) { len++; streak = 0; msg.textContent = `Correct. Next phrases have ${len} notes.`; lvSay("correct", "level_up"); }
      else { msg.textContent = "Correct."; lvSay("correct"); }
    } else {
      misses++; streak = 0;
      if (misses >= 2 && len > 1) { len--; misses = 0; msg.textContent = `Not quite. Back to ${len} notes. Press Hear it again to retry.`; }
      else msg.textContent = timedOut && !st.pos ? "No notes heard. Press Hear it again, then play it back." : "Not quite. Press Hear it again to retry, or play a new phrase.";
      lvSay("not_quite");
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
  goBtn.addEventListener("click", async () => { ac(); if (!(await micIntro(el)) || life.dead || !(await countdown(el, { btn: goBtn })) || life.dead || !(await ensureMic())) return; phrase = echoPhrase(level[2], len); againBtn.disabled = false; play(); });
  againBtn.addEventListener("click", async () => { if (!phrase.length || !(await countdown(el, { btn: againBtn })) || life.dead || !(await ensureMic())) return; play(); });
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
  let beats = [], offsets = [], running = false, endTimer = 0, bus = null, flashTimers = [], calibrating = false, thenPlay = false, nextTimer = 0;
  const bpmSel = lvEl("select", { class: "lv-select", "aria-label": "Tempo" }, [60, 72, 90, 108, 120].map(b => lvEl("option", { value: String(b) }, b + " BPM")));
  bpmSel.value = String([60, 72, 90, 108, 120].includes(o.bpm) ? o.bpm : 72);
  const modeSel = lvEl("select", { class: "lv-select", "aria-label": "Mode" }, lvEl("option", { value: "click" }, "Click on every beat"), lvEl("option", { value: "silent" }, "Then two silent bars"));
  // Four beat lights flash in time with the click as it is heard, so the beat can be seen as well.
  const lights = lvEl("div", { class: "lv-lights", "aria-hidden": "true" }, [0, 1, 2, 3].map(i => lvEl("i", { "data-i": String(i) })));
  const padTxt = lvEl("span", { class: "lv-padtxt" }, "Tap");
  const pad = lvEl("button", { type: "button", class: "lv-pad", disabled: true }, padTxt);
  const lane = lvEl("div", { class: "lv-lane" }, lvEl("i", { class: "lv-zero" }), lvEl("span", { class: "lv-l" }, "early"), lvEl("span", { class: "lv-r" }, "late"));
  const msg = lvEl("p", { class: "lv-msg", "aria-live": "polite" }, "Press Start. After four count-in clicks, tap on every beat: on the pad, the space bar or any key.");
  const startBtn = lvEl("button", { type: "button", class: "lv-btn lv-primary" }, "Start");
  const calBtn = lvEl("button", { type: "button", class: "lv-btn" }, "Calibrate");
  const calTxt = lvEl("span", { class: "lv-count" });
  const showCal = () => { const l = tapLatency(); calTxt.textContent = tapCalibrated() ? `This device's delay (${l} ms) is left out of the results. Recalibrate after changing speakers or headphones.` : "Not calibrated yet."; };
  const el = lvEl("div", { class: "lv lv-tap" }, lvEl("div", { class: "lv-row" }, bpmSel, modeSel, startBtn, calBtn), lights, pad, lane, msg, calTxt);
  const RANGE = 250; // the lane shows +/- 250 ms

  function tap() {
    if (!running) return;
    const c = ac(), t = c.currentTime - (c.outputLatency || 0);
    let best = null;
    for (const b of beats) if (best === null || Math.abs(t - b.t) < Math.abs(t - best.t)) best = b;
    const beatS = 60 / (calibrating ? 90 : Number(bpmSel.value));
    pad.classList.remove("lv-hit"); void pad.offsetWidth; pad.classList.add("lv-hit");
    if (!best || Math.abs(t - best.t) > beatS / 2 || best.used) return;
    best.used = true;
    const off = (t - best.t) * 1000 - (calibrating ? 0 : tapLatency());
    offsets.push({ off, silent: best.silent });
    const x = 50 + Math.max(-50, Math.min(50, off / RANGE * 50));
    lane.append(lvEl("b", { class: "lv-dot" + (best.silent ? " lv-silent" : "") + (Math.abs(off) <= 50 ? " lv-good" : ""), style: `left:${x}%`, title: `${Math.round(off)} ms ${off < 0 ? "early" : "late"}` }));
  }
  function describe(st) {
    if (!st) return "";
    const side = Math.abs(st.mean) <= 15 ? "right on the beat" : `${Math.abs(st.mean)} ms ${st.mean < 0 ? "early (rushing)" : "late (dragging)"}`;
    return `on average ${side}, spread ${st.spread} ms, ${Math.round(st.within * 100)}% within 50 ms`;
  }
  function clearRun() {
    clearTimeout(endTimer); flashTimers.forEach(clearTimeout); flashTimers = [];
    if (bus) { bus.disconnect(); bus = null; }
    lights.querySelectorAll("i").forEach(i => i.className = "");
    running = false; pad.disabled = true; startBtn.textContent = "Start"; padTxt.textContent = "Tap";
  }
  function finish(complete) {
    const tapped = offsets.length;
    clearRun();
    if (calibrating) {
      calibrating = false;
      const v = offsets.map(x => x.off).sort((a, b) => a - b);
      if (v.length < 5) { msg.textContent = "Calibration needs at least 5 taps, exactly with the clicks. Press Calibrate to try again."; thenPlay = false; return; }
      const med = v[v.length >> 1], spread = v[v.length - 2] - v[1];
      if (spread > 160) { msg.textContent = "The taps were too uneven to calibrate. Press Calibrate and tap exactly with the click."; thenPlay = false; return; }
      tapLatency(Math.max(-40, Math.min(350, med)));
      showCal();
      if (thenPlay) { thenPlay = false; msg.textContent = "Calibrated. Now the real round: count-in, then tap."; nextTimer = setTimeout(() => start(false), 1200); }
      else msg.textContent = "Calibrated. Your results now leave out this device's delay.";
      return;
    }
    if (complete !== true) { msg.textContent = tapped ? `Stopped after ${tapped} tap${tapped === 1 ? "" : "s"}. Press Start for a full round of 16 beats.` : "Stopped."; return; }
    const all = tapStats(offsets.map(x => x.off)), heard = tapStats(offsets.filter(x => !x.silent).map(x => x.off)), quiet = tapStats(offsets.filter(x => x.silent).map(x => x.off));
    if (!all) { msg.textContent = "No taps landed near the beats. Tap on the pad, the space bar or any key, with each click."; return; }
    let text = `${all.n} of ${beats.length} beats tapped: ` + (quiet ? `with the click ${describe(heard)}; in the silent bars ${describe(quiet)}.` : describe(all) + ".");
    // Every tap late (or early) by about the same amount is the device, not the player.
    if (!tapCalibrated() && Math.abs(all.mean) > 90 && all.spread < 90) text += ` All your taps are off by about the same ${Math.abs(all.mean)} ms: that is usually the audio device's delay (Bluetooth adds 150-250 ms). Press Calibrate once and this disappears.`;
    else if (all.n < beats.length * 0.6) text += " Many beats had no tap: keep tapping through the whole round, even when unsure.";
    else if (quiet && heard && Math.abs(quiet.mean - heard.mean) > 40) text += " Your pulse drifted without the click: count the beats aloud, then in your head.";
    else if (all.spread > 60) text += " Aim for a steadier tap before going faster.";
    else if (all.within >= 0.8) text += " Excellent. Try a faster tempo or the silent bars.";
    msg.textContent = text;
    emitLive({ type: "tap", bpm: Number(bpmSel.value), silent: !!quiet, mean: all.mean, spread: all.spread, within: Math.round(all.within * 100) / 100 });
  }
  function start(cal) {
    if (running) { finish(false); return; }
    // The first round on a device calibrates first, so its delay is not reported as dragging.
    if (cal !== true && !tapCalibrated()) { thenPlay = true; cal = true; }
    calibrating = cal === true;
    const c = ac(), beatS = 60 / (calibrating ? 90 : Number(bpmSel.value)), t0 = c.currentTime + 0.3;
    beats = []; offsets = []; lane.querySelectorAll(".lv-dot").forEach(d => d.remove());
    const silent = !calibrating && modeSel.value === "silent";
    // The clicks go through their own bus, so Stop silences the ones already scheduled.
    bus = c.createGain(); bus.connect(master());
    const heardDelay = (tapLatency() || (c.outputLatency || 0) * 1000) / 1000;
    const flash = (t, i, label, quiet) => flashTimers.push(setTimeout(() => {
      lights.querySelectorAll("i").forEach((x, k) => { x.className = k === i ? (quiet ? "lv-on lv-quiet" : "lv-on") : ""; });
      padTxt.textContent = label;
    }, Math.max(0, (t + heardDelay - c.currentTime) * 1000)));
    for (let i = 0; i < 4; i++) { click(t0 + i * beatS, i === 0 ? "sam" : "tick", bus); flash(t0 + i * beatS, i, String(4 - i), false); }
    const n = calibrating ? 8 : 16;
    for (let i = 0; i < n; i++) {
      const t = t0 + (4 + i) * beatS, quiet = silent && i >= 8;
      if (!quiet) click(t, i % 4 === 0 ? "sam" : "tick", bus);
      flash(t, i % 4, quiet ? "keep going" : "Tap", quiet);
      beats.push({ t, silent: quiet, used: false });
    }
    running = true; pad.disabled = false; startBtn.textContent = "Stop";
    msg.textContent = calibrating ? (thenPlay ? "First, a quick calibration for this device: after the count-in, tap exactly with the 8 clicks." : "Calibrating: after the count-in, tap exactly with the 8 clicks.") : silent ? "Count-in, then tap. The click stops after two bars: keep tapping." : "Count-in, then tap on every beat.";
    endTimer = setTimeout(() => finish(true), ((t0 + (4 + n) * beatS) - c.currentTime + 0.6) * 1000);
  }
  startBtn.addEventListener("click", () => start(false));
  calBtn.addEventListener("click", () => { clearTimeout(nextTimer); if (running) finish(false); thenPlay = false; start(true); });
  showCal();
  pad.addEventListener("pointerdown", e => { e.preventDefault(); tap(); });
  const onKey = e => { if (!running || e.repeat || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || "")) return; e.preventDefault(); tap(); };
  document.addEventListener("keydown", onKey);
  const abort = () => { clearTimeout(nextTimer); if (!running) return; calibrating = false; thenPlay = false; clearRun(); msg.textContent = "Stopped."; };
  return { el, stop: abort, destroy() { clearTimeout(nextTimer); calibrating = false; thenPlay = false; clearRun(); document.removeEventListener("keydown", onKey); } };
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
      if (!(await countdown(el, { btn: startBtn })) || life.dead || life.gen !== g0) return;
      tracker = holdTracker({ target: null, seconds: 3, cents: 20 }); freqs = []; found = null; useBtn.hidden = true;
      ac();
      const u = await lvListen(life, onReading);
      if (!u) return;
      unsub = u; startBtn.textContent = "Stop"; msg.textContent = "Listening... hold your Sa.";
    } catch (e) { lvShowMicError(msg, e); }
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

// ---------- Name the note (ear test) ----------
// Sa, then a note: the learner names it. opts: { notes: [semi], count, pass, drone, onPass(score) }.
// Used for milestone items such as "identify 20 single notes from S R G P, 18/20".
export function noteQuiz(opts) {
  const o = Object.assign({ notes: [0, 2, 4, 7], count: 20, pass: 18, onPass: null }, opts || {});
  let n = 0, right = 0, target = null, answered = true, voices = [];
  const msg = lvEl("p", { class: "lv-msg", "aria-live": "polite" }, `You hear Sa, then a note. Name the note. ${o.count} questions; ${o.pass} right to pass.`);
  const score = lvEl("span", { class: "lv-count" }, `0 of ${o.count}`);
  const opts2 = lvEl("div", { class: "lv-row lv-answers" });
  const goBtn = lvEl("button", { type: "button", class: "lv-btn lv-primary" }, "Start");
  const againBtn = lvEl("button", { type: "button", class: "lv-btn", disabled: true }, "Hear again");
  const drone = lvDrone("Drone");
  const el = lvEl("div", { class: "lv lv-quiz" }, lvEl("div", { class: "lv-row" }, score, drone.el), opts2, msg, lvEl("div", { class: "lv-row" }, goBtn, againBtn));
  const hush = () => { voices.forEach(v => v.stop()); voices = []; };
  function play() {
    hush();
    const c = ac(), t = c.currentTime + 0.05;
    const a = makeVoice(hzOf(0), t); a.stop(t + 0.8);
    const b = makeVoice(hzOf(target), t + 1.0); b.stop(t + 2.1);
    voices = [a, b];
  }
  function ask() {
    if (n >= o.count) return finish();
    target = o.notes[Math.floor(Math.random() * o.notes.length)]; answered = false;
    msg.textContent = `Question ${n + 1} of ${o.count}: which note came second?`;
    opts2.replaceChildren(...o.notes.map(s => {
      const b = lvEl("button", { type: "button", class: "lv-btn lv-ans" }, codeOf(s));
      b.addEventListener("click", () => {
        if (answered) return;
        answered = true; n++;
        const ok = s === target; if (ok) right++;
        b.classList.add(ok ? "lv-right" : "lv-wrong");
        if (!ok) { const r = [...opts2.children].find(x => x.textContent === codeOf(target)); if (r) r.classList.add("lv-right"); }
        score.textContent = `${right} of ${n} right`;
        setTimeout(ask, ok ? 700 : 1500);
      });
      return b;
    }));
    play();
  }
  function finish() {
    hush(); opts2.replaceChildren(); againBtn.disabled = true; goBtn.disabled = false; goBtn.textContent = "Again";
    const passed = right >= o.pass;
    msg.textContent = `${right} of ${o.count} right. ` + (passed ? "Passed." : `${o.pass} needed: practise with the Ear quiz and try again.`);
    emitLive({ type: "earTest", right, total: o.count });
    if (passed) { el.classList.add("lv-passed"); lvChime(); if (o.onPass) { try { o.onPass({ right, total: o.count }); } catch (e) { /* ignore */ } } }
  }
  goBtn.addEventListener("click", () => { ac(); n = 0; right = 0; el.classList.remove("lv-passed"); goBtn.disabled = true; againBtn.disabled = false; score.textContent = `0 of ${o.count}`; ask(); });
  againBtn.addEventListener("click", () => { if (target !== null && !answered) play(); });
  return { el, stop: hush, destroy() { hush(); drone.stop(); } };
}

// ---------- Name that raga ----------
// A phrase from one raga plays over the drone; the learner names the raga.
// ragas: [{ name, phrases: [[semi]] }] (aroh, avroh, pakad...). Needs no microphone.
export function ragaQuiz(opts) {
  const o = Object.assign({ ragas: [], choices: 4 }, opts || {});
  let current = null, answered = true, right = 0, total = 0, voices = [];
  const msg = lvEl("p", { class: "lv-msg", "aria-live": "polite" }, "Listen to a phrase and name its raga. Notice which notes are missing and which ones the phrase leans on.");
  const score = lvEl("span", { class: "lv-count" });
  const answers = lvEl("div", { class: "lv-row lv-answers" });
  const goBtn = lvEl("button", { type: "button", class: "lv-btn lv-primary" }, "Play a phrase");
  const againBtn = lvEl("button", { type: "button", class: "lv-btn", disabled: true }, "Hear again");
  const drone = lvDrone("Drone");
  const el = lvEl("div", { class: "lv lv-ragaquiz" }, lvEl("div", { class: "lv-row" }, score, drone.el), answers, msg, lvEl("div", { class: "lv-row" }, goBtn, againBtn));
  const hush = () => { voices.forEach(v => v.stop()); voices = []; };
  function play() {
    hush();
    const c = ac(), t0 = c.currentTime + 0.1, noteS = 0.55;
    current.phrase.forEach((s, i) => { const v = makeVoice(hzOf(s), t0 + i * noteS); v.stop(t0 + i * noteS + noteS * 0.9); voices.push(v); });
  }
  function ask() {
    const pool = o.ragas.filter(r => r.phrases.length);
    if (pool.length < 2) { msg.textContent = "Not enough ragas with notated phrases."; return; }
    const r = pool[Math.floor(Math.random() * pool.length)];
    const others = pool.filter(x => x !== r).sort(() => Math.random() - 0.5).slice(0, o.choices - 1);
    current = { raga: r, phrase: r.phrases[Math.floor(Math.random() * r.phrases.length)] };
    answered = false; againBtn.disabled = false;
    answers.replaceChildren(...[r].concat(others).sort(() => Math.random() - 0.5).map(x => {
      const b = lvEl("button", { type: "button", class: "lv-btn lv-ans" }, x.name);
      b.addEventListener("click", () => {
        if (answered) return;
        answered = true; total++;
        const ok = x === r; if (ok) right++;
        b.classList.add(ok ? "lv-right" : "lv-wrong");
        if (!ok) { const c = [...answers.children].find(y => y.textContent === r.name); if (c) c.classList.add("lv-right"); }
        msg.textContent = ok ? `Yes: ${r.name}.` : `It was ${r.name}.` + (r.hint ? " " + r.hint : "");
        score.textContent = `${right} of ${total} right`;
        emitLive({ type: "ragaQuiz", correct: ok });
      });
      return b;
    }));
    msg.textContent = "Which raga is this?";
    play();
  }
  goBtn.addEventListener("click", () => { ac(); ask(); });
  againBtn.addEventListener("click", () => { if (current) play(); });
  return { el, stop: hush, destroy() { hush(); drone.stop(); } };
}
