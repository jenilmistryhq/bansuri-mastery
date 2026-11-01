// Day 9 as a lesson: "Ga, and your first tune". From L09 (Ga from Re; clean changes, the blip
// between notes; slurred changes; the first tune) and L10 part 1 (reading sargam: octave marks,
// beats, holds, rests, breaths; say, clap, finger, play). The day's pass: Ga sounds 3 times in 5.
import { dayReward, finishDay, holdingSide } from "./common.js";

// Sa to Ga, as pitch curves: clean, or with a blip (Re, for a moment, when the two fingers land
// one after the other).
const pts = f => { const out = []; for (let t = 0; t <= 2; t += 0.02) out.push({ t: Math.round(t * 100) / 100, semi: f(t) }); return out; };
const CLEAN = pts(t => (t < 1 ? 0 : 4));
const BLIP = pts(t => (t < 1 ? 0 : t < 1.09 ? 2 : 4));
const CLEAN_DOWN = pts(t => (t < 1 ? 4 : 0));
const BLIP_DOWN = pts(t => (t < 1 ? 4 : t < 1.09 ? 2 : 0));
const choice = clean => [
  { text: "Clean: straight from one note to the other", right: clean, why: clean ? "Nothing in between: both fingers moved as one." : "Listen at the change: a tiny extra note slips in." },
  { text: "A blip: a tiny extra note in between", right: !clean, why: !clean ? "One finger landed a split second before the other, and Re sounded for a moment. Think \"one motion\", as if the two fingers were glued together." : "Listen again: this one goes straight across." },
];

export const M9 = {
  id: "m9",
  day: 9,
  title: "Ga, and your first tune",
  minutes: 30,
  chapters: [
    { title: "Warm up", steps: [
      { id: "long", kind: "hold", title: "Sa, then Re", intro: "Two long tones: Sa, then Re, 4 seconds each, the same clear tone on both.", targets: [0, 2], seconds: 4, cents: 30, giveUp: 60 },
    ] },
    { title: "Ga", steps: [
      { id: "toy", kind: "holes", title: "Lift one more finger", intro: "The flute starts on Re (XXO OOO). Lift the middle finger too, off hole 2, and blow: one step higher.",
        goal: 4, startPattern: "XXOOOO", side: holdingSide, goalText: "That is Ga: XOO OOO, E on a C flute. Sa, Re, Ga: the first three notes of do re mi." },
      { id: "find", kind: "firstSound", title: "Find Ga, three times", intro: "Ga has two holes open and is slightly harder to keep clear: use slightly less air than for Sa.",
        target: 4, times: 3, giveUp: 90, start: "Only hole 1 closed. Press Start, then blow gently." },
    ] },
    { title: "Clean changes", steps: [
      { id: "blips", kind: "curves", title: "Clean, or a blip?", intro: "Going from Ga down to Sa puts two fingers down at once. If one lands a split second early, a third note sounds for an instant: a blip, the most common reason beginners sound messy. Listen:",
        rounds: [
          { q: "Sa to Ga: clean, or a blip?", curve: BLIP, options: choice(false) },
          { q: "Sa to Ga: clean, or a blip?", curve: CLEAN, options: choice(true) },
          { q: "Ga to Sa: clean, or a blip?", curve: CLEAN_DOWN, options: choice(true) },
          { q: "Ga to Sa: clean, or a blip?", curve: BLIP_DOWN, options: choice(false) },
        ] },
      { id: "moves", kind: "cards", title: "How fingers should move", intro: "Try each with the flute, without blowing.", yes: "Done", no: "Not yet",
        items: [
          { id: "low", title: "Lift only 1-2 cm", text: "Far-lifting fingers take longer to come back.", fix: "Watch your fingers in the mirror: just above the holes." },
          { id: "quick", title: "Quick, light, decisive", text: "Like tapping a phone screen, not slowly lowering.", fix: "Tap the hole: down in one go." },
          { id: "still", title: "The others stay still", text: "Only the moving fingers move.", fix: "Rest the still fingers' weight on the flute." },
          { id: "glued", title: "Two fingers, one motion", text: "For Sa and Ga, holes 2 and 3 go down together, as if glued.", fix: "Practise the pair slowly: down, up, down, together." },
        ] },
      { id: "sgsg", kind: "phrase", title: "Sa, Ga, Sa, Ga", intro: "Slurred: keep the air going and change only the fingers. The app marks each note it hears.", phrase: [0, 4, 0, 4, 0], giveUp: 60 },
    ] },
    { title: "Your first tune", steps: [
      { id: "tune", kind: "phrase", title: "The opening of a song", intro: "Mary Had a Little Lamb, its first two phrases: G R S R | G G G - | R R R -. Repeated notes need a tiny break in the air: a soft \"hu\" or \"tu\" on each. Press Hear it first.",
        phrase: [4, 2, 0, 2, 4, 4, 4, 2, 2, 2], giveUp: 90 },
    ] },
    { title: "Read sargam", steps: [
      { id: "symbols", kind: "quiz", title: "Reading the notation", intro: "Notation is a memory aid, not a replacement for listening. The course writes sargam in plain letters:",
        questions: [
          { q: "What is .N?", options: [{ text: "Ni in the lower octave (dot before)", right: true }, { text: "Ni in the upper octave", why: "Upper octave notes have an apostrophe after: S'. A dot before means the lower octave." }], why: "Dot before: lower octave. Apostrophe after: upper octave." },
          { q: "In \"S R G -\", what does the - do?", options: [{ text: "Holds G for another beat", right: true }, { text: "A beat of silence", why: "Silence is _. The - holds the note before it." }], why: "Spaces separate beats; - holds; _ is silence." },
          { q: "And the comma in \"G R S - , R G\"?", options: [{ text: "Breathe here", right: true }, { text: "Play the next notes faster", why: "A comma is a breath mark: breathe there, and only there." }], why: "Pencil in commas before you play any long line." },
        ] },
      { id: "method", kind: "order", title: "How to read a new line", intro: "This sequence saves hours. Put it in order:",
        items: [{ label: "Say" }, { label: "Clap" }, { label: "Finger" }, { label: "Play" }],
        prompt: "Tap the four steps in order.", done: "Say the names in rhythm; clap while saying; air-finger while saying; then play, slowly." },
      { id: "read", kind: "rhythm", title: "Read a line", intro: "Say the names in rhythm as you tap: \"Sa, Re, Ga-a...\".", bpm: 60, lines: ["S R G - | G R S -", "R G R S | R S - -"] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 9 complete", next: "Finish Day 9",
        make: dayReward(d => [
          [d.find && d.find.found ? "Played Ga three times" : "Searched for Ga", !!d.find],
          ["Can hear a blip", !!d.blips],
          [d.sgsg && d.sgsg.passed ? "Changed Sa and Ga cleanly" : "Practised Sa-Ga changes", !!d.sgsg],
          [d.tune && d.tune.passed ? "Played your first tune" : "Started your first tune", !!d.tune],
          ["Can read sargam notation", !!d.symbols],
        ], { when: "Next", title: "Alankars", text: "Days 10-11 build Sa Re Ga. On Day 12: the patterns that train every musician's fingers.", notes: [0, 2, 4, 2, 4, 0] }) },
    ] },
  ],
  finish(d, { first }) {
    const note = "Day 9 lesson. Ga: " + (d.find && d.find.found ? "3 times" : "not yet") + ". Blip ear game: " + (d.blips ? d.blips.right + "/" + d.blips.of : "-") + ". First tune: " + (d.tune && d.tune.passed ? "played" : "not yet") + ".";
    return finishDay(9, "m9", 30, note, first);
  },
};
