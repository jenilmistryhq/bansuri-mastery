// Day 12 as a lesson: "First alankars". From L12 (what an alankar is; aroh and avroh; number
// formulas; how to practise one), EX-ALK warm-ups W1-W4 (S R G), EX-MEL 1.3 (the Three-Note
// Waltz, in dadra) and EX-RHY Level 2. The day's pass: alankar 1 clean at 50 BPM.
import { dayReward, finishDay } from "./common.js";

const N = { S: 0, R: 2, G: 4 };
const notes = text => text.split(/\s+/).filter(x => N[x] !== undefined).map(x => N[x]);

export const M12 = {
  id: "m12",
  day: 12,
  title: "First alankars",
  minutes: 30,
  chapters: [
    { title: "Warm up", steps: [
      { id: "long", kind: "hold", title: "Sa, Re, Ga", intro: "Three long tones, one on each note you know, 6 seconds each. Today's aim is 8: get as close as you can, calmly.", targets: [0, 2, 4], seconds: 6, cents: 30, giveUp: 90 },
    ] },
    { title: "Patterns", steps: [
      { id: "what", kind: "quiz", title: "What an alankar is", intro: "An alankar (also called palta) is a short note pattern that moves step by step through a scale: up (aroh), then down (avroh).",
        questions: [
          { q: "Aroh means...", options: [{ text: "Going up the scale", right: true }, { text: "Going down the scale", why: "Down is avroh. Aroh is the ascent." }], why: "Every alankar is played aroh, then avroh." },
          { q: "Why do musicians practise them every day?", options: [{ text: "They train every finger change, the ear, steady time and speed", right: true }, { text: "They are tunes for concerts", why: "They are exercises: later, the same patterns are played inside each raga's notes." }], why: "Fingers, ear and memory, rhythm, and raga preparation: all four (L12)." },
        ] },
      { id: "formula", kind: "complete", title: "Continue the pattern", intro: "Number the notes of a scale 1, 2, 3... A formula like \"1 2 3, 2 3 4\" then works on any notes. What comes next?",
        rounds: [
          { seq: ["1", "2", "3", "|", "2", "3", "4", "|", "3", "4"], options: ["4", "5", "6"], answer: "5", why: "Each group starts one step higher: 1 2 3, 2 3 4, 3 4 5." },
          { seq: ["1", "2", "|", "2", "3", "|", "3"], options: ["3", "4", "1"], answer: "4", why: "Pairs, each one step up: 1 2, 2 3, 3 4." },
          { seq: ["S", "R", "|", "R"], options: ["S", "G", "R"], answer: "G", semis: [0, 2, 2, 4], why: "With notes: S R, R G. The same formula, on Sa Re Ga." },
          { seq: ["S", "R", "G", "R", "|", "S"], options: ["-", "G", "R"], answer: "-", semis: [0, 2, 4, 2, 0], why: "W1: S R G R, then Sa held. Every alankar ends on a held note." },
        ] },
      { id: "how", kind: "order", title: "How to practise one", intro: "Put L12's method in order:",
        items: [{ label: "Say it" }, { label: "Air-finger" }, { label: "60 BPM" }, { label: "Ladder up" }],
        prompt: "Tap the steps in order.", done: "Read and say it; air-finger it; play at 60 BPM, three clean in a row; then ladder up 4 BPM at a time. Today: 50 BPM." },
    ] },
    { title: "Play them", steps: [
      { id: "w1", kind: "phrase", title: "Alankar W1", intro: "S R G R | S - - -. Slurred, one note per beat. Tick Drone if you like; start the metronome at 50 BPM in Practice, or just keep it slow and even.", phrase: notes("S R G R S"), reps: 3, giveUp: 90 },
      { id: "w4", kind: "phrase", title: "Alankar W4", intro: "S R G - | G R S - | S R G R | S - - -: up, down, and up and back. Breathe only at the end.", phrase: notes("S R G G R S S R G R S"), giveUp: 90 },
    ] },
    { title: "Music", steps: [
      { id: "dadra", kind: "quiz", title: "A waltz in six", intro: "The Three-Note Waltz is in dadra: a cycle of 6 beats, counted 1 2 3 4 5 6, with the stress on 1.",
        questions: [{ q: "How many beats in one cycle of dadra?", options: [{ text: "6", right: true }, { text: "8", why: "8 is keherwa. Dadra has 6: 3 + 3." }], why: "Each line of the waltz is 6 beats: S - R | G - -." }] },
      { id: "waltz", kind: "phrase", title: "The Three-Note Waltz", intro: "S - R | G - - || G - R | S - - || S R G | R S - || G R S | S - - ||. Press Hear it first. The two Sa's at the end need a tiny \"hu\" between them.",
        phrase: notes("S R G G R S S R G R S G R S S"), giveUp: 120 },
    ] },
    { title: "Rhythm", steps: [
      { id: "rhy", kind: "rhythm", title: "Half beats", intro: "EX-RHY Level 2: count \"1-and 2-and\".", bpm: 60, lines: ["SS S SS S | SS SS S -", "S_ S_ SS S | S - - -", "SS - SS - | SS SS SS S"] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 12 complete", next: "Finish Day 12",
        make: dayReward(d => [
          ["Know what an alankar is", !!d.what],
          ["Can continue a pattern formula", !!d.formula],
          [d.w1 && d.w1.passed ? "Played alankar W1 clean, three times" : "Practised alankar W1", !!d.w1],
          [d.w4 && d.w4.passed ? "Played alankar W4" : "Practised alankar W4", !!d.w4],
          [d.waltz && d.waltz.passed ? "Played the Three-Note Waltz" : "Started the Three-Note Waltz", !!d.waltz],
        ], { when: "Next", title: "Lower notes", text: "On Day 15: Ni below Sa, with four fingers. Then Dha and Pa: the flute grows downward.", notes: [0, -1, 0, -1, 0] }) },
    ] },
  ],
  finish(d, { first }) {
    const note = "Day 12 lesson. W1: " + (d.w1 && d.w1.passed ? "3 clean" : "not yet") + ". W4: " + (d.w4 && d.w4.passed ? "clean" : "not yet") + ". Waltz: " + (d.waltz && d.waltz.passed ? "played" : "not yet") + ".";
    return finishDay(12, "m12", 30, note, first);
  },
};
