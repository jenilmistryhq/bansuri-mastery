// Day 4 as a lesson: "Long tones and your Sa pitch". From L07 (the tuner and cents, the drone and
// beats, confirming Sa, the long tone and its faults, clarity), L05 (Sa and Re by voice) and L06
// (tempo). The day's pass: the tuner shows C (your flute's Sa) on your Sa.
import { dayReward, finishDay } from "./common.js";
import { findSa } from "./m0.js";

// A held Sa as a pitch curve (semitones over 3 s), shaped by f(t).
const curve = f => { const out = []; for (let t = 0; t <= 3; t += 0.05) out.push({ t: Math.round(t * 100) / 100, semi: f(t) }); return out; };
const STEADY = curve(() => 0);
const RISES = curve(t => (t < 1.6 ? 0 : (t - 1.6) * 0.3));
const FALLS = curve(t => (t < 1.6 ? 0 : -(t - 1.6) * 0.35));
const WOBBLES = curve(t => 0.22 * Math.sin(t * 2 * Math.PI * 3.5));
const opts = (right) => [
  { text: "Steady, a straight line", right: right === "steady", why: right === "steady" ? "A note like a straight line: no wobble, no swelling, no fading. That is the long tone." : "Listen to the end of the note: it moves." },
  { text: "It rises at the end", right: right === "rises", why: right === "rises" ? "The pitch rises when the air speeds up toward the end. Keep the air speed the same to the last moment." : "Follow the end of the note: does it go up?" },
  { text: "It sags at the end", right: right === "falls", why: right === "falls" ? "The pitch falls when the air weakens. Support the breath to the end, then stop it cleanly." : "Follow the end of the note: does it go down?" },
  { text: "It wobbles", right: right === "wobbles", why: right === "wobbles" ? "A wobble comes from uneven breath. Breathe low and keep the air steady from start to end." : "Listen to the middle of the note: does it waver?" },
];

export const M4 = {
  id: "m4",
  day: 4,
  title: "Long tones and your Sa pitch",
  minutes: 30,
  chapters: [
    { title: "Tuner and drone", steps: [
      { id: "cents", kind: "quiz", title: "Reading a tuner", intro: "A tuner shows the note name, and how far you are from its exact pitch in cents. 100 cents is one semitone, the step from one piano key to the next.",
        questions: [
          { q: "The tuner says -20 cents. Your note is...", options: [{ text: "A little flat (too low)", right: true }, { text: "A little sharp (too high)", why: "Minus is flat, too low; plus is sharp, too high." }], why: "Negative means flat; positive means sharp; 0 is exactly in tune." },
          { q: "For a beginner, which is good?", options: [{ text: "Within 15 cents either way", right: true }, { text: "Within 60 cents either way", why: "Beyond about 30 cents a note sounds noticeably out of tune against the drone." }], why: "Within 15 is good, 30 acceptable; beyond that it sounds out of tune (L07)." },
        ] },
      { id: "beats", kind: "beats", title: "Hear the beats", intro: "The tuner shows a number; the drone teaches your ear. Two notes slightly apart waver: wah-wah-wah. The closer they are, the slower the wavering, until it stops. Use headphones or a speaker.",
        start: -30, hold: 1.5 },
    ] },
    { title: "Your Sa", steps: [
      { id: "sa", kind: "custom", make: findSa, title: "Confirm your Sa", intro: "Close the top three holes and play a relaxed Sa for 3 seconds. The app reads it like a tuner. Expected: C5, about 523 Hz, on a C flute." },
    ] },
    { title: "Long tones", steps: [
      { id: "long", kind: "hold", title: "Three long tones", intro: "Start Sa softly, with no tongue: just begin the air, a gentle \"hoo\". The same volume and tone to the end, then stop the air gently. Rest as long as you played. Three times, 4 seconds each.",
        target: 0, seconds: 4, cents: 30, times: 3, giveUp: 60 },
      { id: "faults", kind: "curves", title: "Name the fault", intro: "A long tone should sound like a straight line. Listen to each one and say what it does: each fault has a cause.",
        rounds: [
          { curve: RISES, options: opts("rises") },
          { curve: STEADY, options: opts("steady") },
          { curve: WOBBLES, options: opts("wobbles") },
          { curve: FALLS, options: opts("falls") },
        ] },
      { id: "drone", drill: { title: "Sa with the drone" }, kind: "hold", title: "Now with the drone", intro: "Tick Drone below the ring. Hold Sa and listen rather than look: do you hear the wah-wah? Roll the flute very slightly in (lower) or out (higher) until it slows and stops.",
        target: 0, seconds: 4, cents: 30, giveUp: 60 },
      { id: "clear", kind: "record", title: "How clear is it?", intro: "Record a long tone. What share of the sound is tone, and what share is hiss? A smaller lip opening and a little less air reduce the hiss.",
        seconds: 8, day: 4, label: "Day 4: long tone on Sa", analyse: true },
    ] },
    { title: "Ear and pulse", steps: [
      { id: "humsa", kind: "hum", title: "Hum Sa", intro: "Hear Sa from the drone, then hum it.", seconds: 2 },
      { id: "humre", kind: "hum", title: "Hum Re", intro: "Re is the next note up. Hear it, then hum it: one step above Sa.", target: 2, seconds: 2 },
      { id: "clap80", kind: "beat", title: "A little faster: 80 BPM", intro: "Yesterday 60 BPM. Now 80: tap exactly with the clicks.", bpm: 80, beats: 8 },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 4 complete", next: "Finish Day 4",
        make: dayReward(d => [
          ["Can read a tuner", !!d.cents],
          ["Heard the beats stop", !!d.beats],
          [d.sa === "found" ? "Confirmed your flute's Sa" : "Will confirm your Sa later", d.sa === "found"],
          [d.long && d.long.passed ? "Held three long tones" : "Worked on long tones", !!d.long],
          ["Can name a long tone's faults", !!d.faults],
          ["Hummed Sa and Re", !!(d.humsa && d.humre)],
        ], { when: "Next", title: "Days 5-7, then Re and Ga", text: "Three days of practice make the long tone grow. On Day 8: two new notes, and your first tunes.", notes: [0, 2, 4, 2, 0] }) },
    ] },
  ],
  finish(d, { first }) {
    const note = "Day 4 lesson. Sa: " + (d.sa === "found" ? "confirmed" : "not checked") + ". Long tones: " + (d.long && d.long.passed ? "3 x 4 s" : "not yet") + ". Fault ear game: " + (d.faults ? d.faults.right + "/" + d.faults.of : "-") + ".";
    return finishDay(4, "m4", 30, note, first);
  },
};
