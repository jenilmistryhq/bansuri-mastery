// Day 0 as a lesson: "Meet your flute". Every M0 item (projects/M0-setup.md) is done by doing,
// not by reading: name the parts by tapping them, inspect the flute card by card, choose the
// holding side, hold the flute, let the app find the flute's Sa, hear the drone and the
// metronome, record a Day 0 time capsule, answer the safety questions and fix a practice time.
// Content from L00 (parts, inspection, side, tools), L01 (daily practice), L02 (holding),
// L03 (the dizziness protocol), TS-08 (pain warning signs) and TS-12 (damage).
import { h, icon } from "../util.js";
import { tanpura } from "../core/audio.js";
import { fluteFinder } from "../core/live.js";
import { getSettings } from "../core/settings.js";
import { WEST } from "../core/theory.js";
import { finishSession, recordAttempt, current, milestoneState } from "../course.js";
import { award } from "../xp.js";
import { fluteSvg } from "../lesson/flute.js";
import { ding } from "../lesson/steps.js";

const sidePic = side => () => h("span", { class: "lesson-sidepic" }, fluteSvg({ side, numbers: false }).el);

// Let the app hear the flute's Sa (or keep C, the default, for now).
export function findSa(s, api) {
  const finder = fluteFinder({ onApply: () => { api.data.sa = "found"; api.save(); api.ready(); } });
  const st = getSettings();
  const keep = h("button", { type: "button", class: "linkbtn" }, "No sound yet? Skip: the app stays in " + WEST[st.saNote] + " for now");
  const kept = h("p", { class: "small muted", hidden: true }, "Kept. You can do this later in Settings, Detect from my flute.");
  keep.addEventListener("click", () => { api.data.sa = "skipped"; api.save(); keep.hidden = true; kept.hidden = false; api.ready(); });
  return { el: h("div", { class: "stack" }, finder.el, keep, kept), destroy() { finder.destroy(); } };
}

// The drone: switch it on and listen to Sa for a few seconds.
function drone(s, api) {
  let timer = 0;
  const btn = h("button", { type: "button", class: "btn primary big" }, icon("play"), " Play the drone");
  const msg = h("p", { class: "lesson-q", "aria-live": "polite" }, "Switch the drone on and listen for ten seconds.");
  const wave = h("div", { class: "lesson-wave", "aria-hidden": "true" }, [0, 1, 2, 3, 4, 5, 6].map(() => h("i")));
  const stop = () => { clearInterval(timer); if (tanpura.isOn()) tanpura.stop(); wave.classList.remove("on"); btn.replaceChildren(icon("play"), " Play the drone"); };
  btn.addEventListener("click", () => {
    if (tanpura.isOn()) { stop(); return; }
    tanpura.start(); wave.classList.add("on"); btn.replaceChildren(icon("pause"), " Stop the drone");
    let n = 0;
    timer = setInterval(() => {
      n++;
      if (n === 4) { msg.textContent = "That low hum is Sa, your home note. Every note you play is heard against it."; api.data.drone = true; api.save(); api.ready(); ding(true); }
    }, 1000);
  });
  return { el: h("div", { class: "stack lesson-center" }, wave, btn, msg), destroy: stop };
}

// The end: what was done, M0 passed, and a taste of Day 1.
function reward(s, api) {
  const d = api.data, found = d.inspect ? Object.entries(d.inspect).filter(([, ok]) => !ok).map(([k]) => k) : [];
  const rows = [
    ["Named every part of your flute", true],
    ["Checked it: cracks, bindings, cork, hole edges", true],
    [d.side === "left" ? "Chose your side: pointing left" : "Chose your side: pointing right", !!d.side],
    ["Found your Sa", d.sa === "found"],
    ["Heard the drone and met the metronome", !!d.drone],
    ["Recorded your Day 0 time capsule", !!(d.capsule && d.capsule.saved)],
    ["Know what to do if you feel dizzy or sore", true],
    ["Fixed your practice time and place", !!d.time],
  ];
  const audio = new Audio("app/audio/bansuri-sa-middle-octave-sankalp.mp3");
  const hear = h("button", { type: "button", class: "btn" }, icon("play"), " Hear it");
  hear.addEventListener("click", () => { audio.currentTime = 0; audio.play().catch(() => {}); });
  setTimeout(() => api.ready(), 0);
  return {
    el: h("div", { class: "stack" },
      h("div", { class: "lesson-burst", "aria-hidden": "true" }, icon("star")),
      h("ul", { class: "lesson-done" }, rows.map(([t, ok]) => h("li", { class: ok ? "ok" : "later" }, h("span", { class: "lesson-tick", "aria-hidden": "true" }, ok ? icon("check") : ""), h("span", null, t), ok ? null : h("span", { class: "small muted" }, " (later)")))),
      found.length ? h("div", { class: "lesson-reveal warn" }, h("b", null, "Your flute check found something."), h("p", null, "Read TS-12 (flute damage and care) before you play: a crack or a splinter should be seen to first.")) : null,
      h("div", { class: "lesson-teaser" }, h("div", { class: "stack tight" }, h("span", { class: "eyebrow" }, "Tomorrow, Day 1"), h("b", null, "Your first sound"), h("span", { class: "small muted" }, "A steady note like this one is where it starts.")), hear),
      h("p", { class: "small muted" }, "Recommended: find a teacher for an occasional check, around Week 2-3, when you can make a sound (Me, Teacher review).")),
    destroy() { audio.pause(); },
  };
}

export const M0 = {
  id: "m0",
  day: 0,
  title: "Meet your flute",
  minutes: 20,
  chapters: [
    { title: "Meet your flute", steps: [
      { id: "hook", kind: "listen", title: "Hear it first", audio: "app/audio/bansuri-sargam-sa-to-taar-sa-roguentropy.mp3",
        prompt: "A bansuri is a tube of bamboo: no keys, no reed, no strings. So where does this sound come from?",
        options: [
          { text: "Your breath splits on the far edge of the blowing hole, and the air inside the tube rings", right: true },
          { text: "The bamboo itself vibrates, like a string" },
          { text: "A small reed hidden inside the tube" },
        ],
        yes: "Yes: the air is the instrument.", no: "Not quite: it is the air.",
        explain: "You blow across the blowing hole and the air inside the tube vibrates. Close finger holes and the vibrating column of air gets longer, so the note gets lower. That is the whole instrument." },
      { id: "parts", kind: "parts", title: "Find the parts", intro: "Seven holes and two ends. Tap each part the app names. The holes have no numbers this time.",
        targets: ["blow", "h1", "h3", "h4", "h6", "cork", "open", "bind"] },
      { id: "holes", kind: "holes", title: "Make the notes", intro: "Tap holes to close them, then press Blow. Find Sa, your home note: the top three holes closed.",
        goal: 0, goalText: "That is Sa: holes 1-3 closed, 4-6 open. Every lesson starts from this note." },
    ] },
    { title: "Look after it", steps: [
      { id: "inspect", kind: "cards", title: "Check your flute", intro: "Take your flute in your hands now. One card at a time.",
        items: [
          { id: "cracks", title: "Cracks", text: "Look along the whole length, especially near the ends, the blowing hole and the bindings. A crack is a thin dark line that follows the grain.", fix: "Do not play it yet. Read TS-12 (flute damage and care) first." },
          { id: "bindings", title: "Bindings", text: "The thread or cord wraps, if your flute has them, are tight: not loose or unravelling.", fix: "Write it in your log and read TS-12 (flute damage and care)." },
          { id: "cork", title: "The cork end", text: "The closed end near the blowing hole is plugged. Do not push or move the cork: its position tunes the flute.", fix: "If it is loose or has moved, do not touch it: ask the maker (TS-12)." },
          { id: "edges", title: "Hole edges", text: "Run a fingertip gently around each hole. The edges should be smooth, with no splinters.", fix: "Do not play over a splinter: read TS-12 (flute damage and care) first." },
        ] },
    ] },
    { title: "Hold it", steps: [
      { id: "side", kind: "choose", key: "side", title: "Choose your side, once", intro: "Most players point the flute to the right; many great players point it to the left. Both are correct. Hold it each way for 30 seconds, without blowing. If neither feels clearly better, choose right: most video teachers use it.",
        options: [
          { id: "right", text: "Pointing right", sub: "Left hand on holes 1-3", pic: sidePic("right"), afterHead: "Right it is.", after: "Once you choose, never switch: your fingers build their habits from today." },
          { id: "left", text: "Pointing left", sub: "Right hand on holes 1-3", pic: sidePic("left"), afterHead: "Left it is.", after: "Once you choose, never switch: your fingers build their habits from today." },
        ] },
      { id: "hold", kind: "timer", title: "Hold it, no blowing yet", intro: "Sit tall with your shoulders down. Hold the flute in playing position, the blowing hole under your lower lip, for 30 seconds. Do not blow.",
        seconds: 30, start: "Start 30 seconds",
        checks: ["My shoulders stayed down and relaxed", "My fingers held the flute; I did not grip it", "I breathed calmly"] },
    ] },
    { title: "Your tools", steps: [
      { id: "sa", kind: "custom", make: findSa, title: "Let your flute tell you its name", intro: "Close the top three holes and blow gently across the blowing hole. The app listens, then sets every pitch to your flute. No sound yet is normal on Day 0." },
      { id: "drone", kind: "custom", make: drone, title: "The drone", intro: "Indian music is played over a drone (the tanpura). It plays Sa all the time, so you can hear whether you are in tune." },
      { id: "beat", kind: "beat", title: "The metronome", intro: "A metronome is a steady click. Tap along: it trains the beat you keep inside.", bpm: 72, beats: 8 },
      { id: "capsule", kind: "record", title: "Your Day 0 time capsule", intro: "Blow across the blowing hole for a few seconds, even if only air comes out. In a few weeks you will play this back next to your new sound.",
        seconds: 6, day: 0, label: "Day 0 time capsule", saved: "Saved in your Journal as your Day 0 time capsule." },
    ] },
    { title: "Practise well", steps: [
      { id: "safety", kind: "quiz", title: "Safe practice", intro: "Four quick questions. A wrong answer explains itself; try again.",
        questions: [
          { q: "After a few long notes you feel dizzy and tingly. What do you do?",
            options: [
              { text: "Stop, stay seated, breathe gently through your nose for 1-2 minutes, then go on with less air", right: true },
              { text: "Take some deep breaths and keep playing", why: "Deep breathing makes it worse: the dizziness comes from breathing out more air, and faster, than you need." },
              { text: "Play faster so the exercise ends sooner", why: "Stop first. Then use less air and take longer rests between long tones." },
            ],
            why: "Dizziness while learning a wind instrument is common and usually harmless: it comes from over-breathing (L03). If it comes with chest pain, fainting or a severe headache, or even with gentle playing, see a doctor." },
          { q: "Your fingers tingle, and it does not stop when you stop playing.",
            options: [
              { text: "Stop playing and see a doctor or physiotherapist", right: true },
              { text: "Stretch, then play through it", why: "Numbness, tingling or pins and needles in fingers, hands or arms is a reason to stop and get advice (TS-08)." },
            ],
            why: "The same goes for pain that continues after you stop playing, or returns every session (TS-08)." },
          { q: "Where does your flute stay between sessions?",
            options: [
              { text: "In its bag, at room temperature", right: true },
              { text: "On a sunny windowsill, ready to play", why: "Sun and heat can crack bamboo, sometimes days later." },
              { text: "In the car, so it is always with you", why: "A hot car is one of the commonest causes of cracks." },
            ],
            why: "Bamboo cracks most often when it dries or warms quickly (L00)." },
          { q: "Which week of practice teaches you more?",
            options: [
              { text: "45 minutes on six days", right: true },
              { text: "One 5-hour session on Sunday", why: "Short, focused, daily practice beats long, occasional practice (L01)." },
            ],
            why: "On a busy day, 20 minutes of warm-up and tone are still worth more than nothing (L01)." },
        ] },
      { id: "plan", kind: "form", title: "Your practice time and place", intro: "Same time, same place, every day: then practice becomes a habit, not a decision.",
        groups: [
          { key: "time", label: "When", options: [{ id: "morning", text: "Morning" }, { id: "afternoon", text: "Afternoon" }, { id: "evening", text: "Evening" }, { id: "night", text: "Night" }] },
          { key: "minutes", label: "How long", options: [{ id: "20", text: "20 min" }, { id: "30", text: "30 min" }, { id: "45", text: "45 min" }, { id: "60", text: "60 min" }] },
          { key: "place", label: "Where", options: [{ id: "quiet", text: "A quiet room" }, { id: "bedroom", text: "My bedroom" }, { id: "living", text: "The living room" }, { id: "other", text: "Somewhere else" }] },
        ],
        after: "A mirror nearby helps: you will check your lips and posture in it." },
    ] },
    { title: "Ready", steps: [
      { id: "done", kind: "custom", make: reward, title: "Setup complete", next: "Finish Day 0" },
    ] },
  ],
  // Pass M0 and Day 0 with what the learner did; the log gets the choices (the first log entry).
  finish(d, { first }) {
    const found = d.inspect ? Object.entries(d.inspect).filter(([, ok]) => !ok).map(([k]) => k) : [];
    const note = "Day 0 lesson. Holding side: " + (d.side || "-") + ". Practice: " + (d.time || "-") + ", " + (d.minutes || "-") + " min, " + (d.place || "-") + ". Flute check: " + (found.length ? "found " + found.join(", ") : "all fine") + ".";
    const wasDay0 = current() === 0;
    finishSession(0, { minutes: 20, note, passed: true, blocks: { M: true, READ: true, K: true, E: true, R: true } });
    const items = { 1: true, 2: true, 3: true, 4: !!d.side, 5: !!(d.time && d.minutes && d.place), 6: true, 7: false };
    // Once passed, a replay of the lesson does not add another attempt.
    const res = milestoneState("M0").status === "passed" ? { advanced: false } : recordAttempt("M0", { items, rubric: {}, notes: "Passed in the Day 0 lesson." }, true);
    if (first) award("lesson", { key: "m0" }); else award("lessonAgain");
    return { advanced: res.advanced || (wasDay0 && current() > 0) };
  },
};
