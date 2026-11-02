// Day 372 as a lesson: "Western notation". From L28 (fixed note names and relative sargam;
// semitones and intervals; the major scale's W W H W W W H, which is Bilawal; the treble staff;
// durations; time signatures and syncopation).
import { dayReward, finishDay } from "./common.js";

export const M372 = {
  id: "m372",
  day: 372,
  title: "Western notation",
  minutes: 35,
  chapters: [
    { title: "Two systems", steps: [
      { id: "why", kind: "quiz", title: "Fixed and relative", intro: "You do not need Western notation to be an excellent Hindustani bansuri player. It is for film and Western sheet music, talking to keyboard and guitar players, and apps.",
        questions: [
          { q: "Which names are fixed pitches?", options: [{ text: "Western: C is always C", right: true }, { text: "Sargam: Sa is always C", why: "Sargam is relative: Sa is whatever the home note is. On your flute Sa happens to be C." }], why: "On your flute, with no key change: S R G m P D N = C D E F G A B." },
        ] },
      { id: "intervals", kind: "quiz", title: "Intervals in semitones", intro: "A semitone is the smallest step (S to r); a whole tone is two (S to R). Count semitones to name an interval.",
        questions: [
          { q: "From S to P is 7 semitones. Its name?", options: [{ text: "A perfect 5th", right: true }, { text: "A perfect 4th", why: "A perfect 4th is 5 semitones (S to m). Seven is a perfect 5th." }], why: "S to m: perfect 4th (5). S to P: perfect 5th (7). S to S': octave (12)." },
          { q: "From G to D: how many semitones?", options: [{ text: "5: a perfect 4th", right: true }, { text: "4: a major 3rd", why: "Count: G is 4, D is 9. 9 - 4 = 5 semitones: a perfect 4th." }], why: "Subtract the semitones from Sa (L28)." },
        ] },
      { id: "fifth", kind: "judge", title: "Hear the interval", intro: "Two notes, one after the other.",
        rounds: [
          { q: "Which is a perfect 5th (S to P)?", a: { seq: [0, 5], gap: 0.06, dur: 0.7 }, b: { seq: [0, 7], gap: 0.06, dur: 0.7 }, right: "b", why: "B: S to P, wide and open. A is a perfect 4th, S to m." },
          { q: "Which is an octave?", a: { seq: [0, 12], gap: 0.06, dur: 0.7 }, b: { seq: [0, 11], gap: 0.06, dur: 0.7 }, right: "a", why: "A lands on the same note, higher. B is a major 7th: one semitone short, it pulls upward." },
        ] },
      { id: "major", kind: "complete", title: "The major scale's pattern", intro: "W is a whole tone, H a semitone. Count the steps of S R G m P D N S'.",
        rounds: [
          { seq: ["W", "W", "H", "W", "W", "W"], options: ["H", "W"], answer: "H", why: "W W H W W W H: N to S' is a semitone. That is exactly Bilawal thaat." },
          { seq: ["S", "R", "G", "m"], options: ["P", "M", "D"], answer: "P", semis: [0, 2, 4, 5, 7], why: "m to P is a whole tone, the fourth step." },
        ] },
    ] },
    { title: "The staff", steps: [
      { id: "staff", kind: "staff", title: "Read the staff", intro: "Five lines; notes sit on lines or in spaces. The treble clef curls round the 2nd line, G4. On your flute Sa is C5, the third space. Name each note in sargam.",
        rounds: [
          { semi: 0, options: ["S", "R", "G"], answer: "S", why: "C5, the third space: your Sa." },
          { semi: 4, options: ["R", "G", "m"], answer: "G", why: "E5, the fourth line: Ga." },
          { semi: 7, options: ["P", "m", "D"], answer: "P", why: "G5, the space above the top line: Pa." },
          { semi: -5, options: [".P", ".D", "S"], answer: ".P", why: "G4, the line the clef curls round: mandra Pa, your lowest note." },
          { semi: 9, options: ["D", "N", "P"], answer: "D", why: "A5, on the first ledger line above: Dha." },
          { semi: 6, options: ["m", "M", "P"], answer: "M", why: "F#5: a sharp on the top line, F. Tivra Ma." },
        ] },
      { id: "durations", kind: "quiz", title: "Durations", intro: "In 4/4 time a beat is a quarter note.",
        questions: [
          { q: "A half note lasts...", options: [{ text: "2 beats: S -", right: true }, { text: "Half a beat", why: "Half a beat is an eighth note. A half note is half of a whole note: 2 beats." }], why: "Whole 4, half 2, quarter 1, eighth 1/2, sixteenth 1/4." },
          { q: "Dadra (6 beats, 3 + 3) feels like...", options: [{ text: "6/8: six eighths in two groups of three", right: true }, { text: "4/4", why: "4/4 is keherwa's relative (8 beats = 2 bars of 4/4)." }], why: "Keherwa is 2 bars of 4/4; dadra is like 6/8." },
        ] },
      { id: "read", kind: "phrase", title: "Read, then play", intro: "C D E D C on the staff is S R G R S on your flute. Play it.", phrase: [0, 2, 4, 2, 0], giveUp: 90 },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 372 complete", next: "Finish Day 372",
        make: dayReward(d => [
          ["Know fixed and relative names", !!d.why],
          ["Count and hear intervals", !!(d.intervals && d.fifth)],
          ["Know the major scale's pattern", !!d.major],
          [d.staff ? "Read " + d.staff.right + " of " + d.staff.of + " staff notes first time" : "Read the staff", !!d.staff],
          ["Know the durations", !!d.durations],
        ], { when: "Next", title: "Bandish, taans and tihai", text: "On Day 407: a composition, fast runs, and landing on sam three times.", notes: [0, 2, 4, 7, 9, 12, 9, 7, 4, 2, 0] }) },
    ] },
  ],
  finish(d, { first }) {
    return finishDay(372, "m372", 35, "Day 372 lesson. Staff: " + (d.staff ? d.staff.right + "/" + d.staff.of : "-") + ".", first);
  },
};
