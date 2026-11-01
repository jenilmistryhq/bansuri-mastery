// Day 99 as a lesson: "Learning a song by ear". From L18 (detective work: never write a note you
// have not verified; find Sa; break into phrases; sing; identify the notes; find them on the
// flute; practise slowly; compare; correct in order; song structure) applied to a first song.
import { dayReward, finishDay } from "./common.js";

const KEYS = [["S", 0], ["R", 2], ["G", 4], ["m", 5], ["P", 7], ["D", 9], ["N", 11], ["S'", 12]].map(([label, semi]) => ({ label, semi }));
// Twinkle, Twinkle: S S P P D D P - | m m G G R R S -
const P1 = [0, 0, 7, 7, 9, 9, 7];
const P2 = [5, 5, 4, 4, 2, 2, 0];

export const M99 = {
  id: "m99",
  day: 99,
  title: "Learning a song by ear",
  minutes: 35,
  chapters: [
    { title: "Detective work", steps: [
      { id: "rule", kind: "quiz", title: "The golden rule", intro: "Learning by ear is detective work: collect clues (the home note, the shape, the rhythm), make a guess, and test it until the evidence agrees.",
        questions: [{ q: "You are not sure whether a note is Re or Ga. What do you write?", options: [{ text: "R? : mark it, and test it", right: true }, { text: "Ga: it is probably right", why: "Never write a note you have not verified. Mark the doubt with ?, then test it against the recording." }], why: "Never write a note you have not verified (L18)." }] },
      { id: "steps", kind: "order", title: "The first six steps", intro: "L18 has twelve steps. The first six, in order:",
        items: [{ label: "Listen" }, { label: "Find Sa" }, { label: "Phrases" }, { label: "Sing" }, { label: "Name the notes" }, { label: "Find them" }],
        prompt: "Tap them in order.", done: "Listen 3-5 times; find the home note; break it into phrases; sing each one; name the notes against Sa; find them on the flute." },
      { id: "home", kind: "listen", title: "Find the home note", seq: [4, 2, 4, 7, 4, 2, 0, null, 0],
        prompt: "Listen to the end of this phrase: the last note feels like home. Hum it. Which note is it?",
        options: [{ text: "Sa", right: true }, { text: "Ga" }, { text: "Pa" }],
        yes: "Yes: Sa.", no: "Listen to the very last note.", explain: "The last note of a song or of its main line usually feels like home: that is Sa. With a recording, change the drone until your hummed home note locks with it." },
    ] },
    { title: "Name the notes", steps: [
      { id: "dict", kind: "dictate", title: "Write what you hear", intro: "Short phrases first. Find the first note against Sa (sing up S R G... until it matches), then follow each next note: up or down, step or leap.",
        notes: KEYS, rounds: [[0, 2, 4], [4, 2, 0], [0, 4, 7], [7, 4, 2, 0]] },
      { id: "song", kind: "dictate", title: "Your first song: phrase 1", intro: "A song you probably know by voice. Sing it first; then write its first phrase. 7 notes.",
        notes: KEYS, rounds: [P1] },
    ] },
    { title: "Play it", steps: [
      { id: "p1", kind: "phrase", title: "Play phrase 1", intro: "Now find your notes on the flute, slowly. Repeated notes need a small \"hu\" or \"tu\".", phrase: P1, giveUp: 120 },
      { id: "p2", kind: "phrase", title: "Phrase 2", intro: "m m G G R R S: the answer comes home. Shuddha Ma is your half-hole from Day 64.", phrase: P2, giveUp: 120 },
      { id: "rec", kind: "record", title: "Compare with the reference", intro: "Record both phrases, then play the reference (Hear it) straight after your recording. Listen to both.", seconds: 15, day: 99, label: "Day 99: song 1, phrases 1-2" },
      { id: "check", kind: "order", title: "Correct in this order", intro: "Check your recording one thing at a time, in this order:",
        items: [{ label: "Pitch" }, { label: "Rhythm" }, { label: "Articulation" }, { label: "Phrasing" }],
        prompt: "Tap them in order.", done: "Right notes first; then when they start and how long they last; then how they begin; then the shape and the breaths." },
    ] },
    { title: "Song structure", steps: [
      { id: "parts", kind: "quiz", title: "The parts of a song", intro: "Most Indian songs share one structure.",
        questions: [
          { q: "The main recurring line, often the chorus, is the...", options: [{ text: "Mukhda (or sthayi)", right: true }, { text: "Antara", why: "The antara is a verse, usually higher. The mukhda keeps coming back." }], why: "Learn the mukhda first." },
          { q: "The antara is usually...", options: [{ text: "A verse, higher than the mukhda", right: true }, { text: "The instrumental part", why: "Instrumental parts between verses are interludes." }], why: "Intro, mukhda, interlude, antara, mukhda again (L18)." },
        ] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 99 complete", next: "Finish Day 99",
        make: dayReward(d => [
          ["Know the golden rule", !!d.rule],
          ["Found the home note by ear", !!d.home],
          ["Wrote phrases by ear", !!d.dict],
          [d.song && d.song.right ? "Wrote your first song's phrase, verified" : "Wrote your first song's phrase", !!d.song],
          [d.p1 && d.p2 && d.p1.passed && d.p2.passed ? "Played both phrases" : "Started playing the song", !!d.p1],
          ["Start your repertoire list: this is song 1", true],
        ], { when: "Next", title: "What is a raga?", text: "Phase 3 begins on Day 127: the idea at the heart of Indian music.", notes: [0, 2, 4, 7, 9, 12, 9, 7, 4, 2, 0] }) },
    ] },
  ],
  finish(d, { first }) {
    const note = "Day 99 lesson. Song 1 (Twinkle): phrase 1 by ear " + (d.song && d.song.right ? "verified" : "with help") + "; played: " + (d.p1 && d.p1.passed ? "P1" : "-") + (d.p2 && d.p2.passed ? ", P2" : "") + ". Added to the repertoire list.";
    return finishDay(99, "m99", 35, note, first);
  },
};
