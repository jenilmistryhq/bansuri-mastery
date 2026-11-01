// Day 190 as a lesson: "Bhatkhande notation". From L27 (V. N. Bhatkhande's notation, in
// Devanagari; a memory aid, not a full description; the seven letters; the marks: komal line
// under, tivra tick above Ma, dots below and above for the octaves, avagraha, the meend arc, the
// kan; the tala row; books differ, so read the legend, Disputed).
import { dayReward, finishDay } from "./common.js";

const KEYS = [[".D", -3], [".N", -1], ["S", 0], ["r", 1], ["R", 2], ["g", 3], ["G", 4], ["m", 5], ["M", 6], ["P", 7], ["D", 9], ["N", 11], ["S'", 12]].map(([label, semi]) => ({ label, semi }));
const T = (t, mark) => ({ t, mark });

export const M190 = {
  id: "m190",
  day: 190,
  title: "Bhatkhande notation",
  minutes: 30,
  chapters: [
    { title: "Why read it", steps: [
      { id: "why", kind: "quiz", title: "The books' notation", intro: "Vishnu Narayan Bhatkhande (1860-1936) created the notation most Hindustani books, websites and exams use. It is written in Devanagari; the course's letters are a keyboard-friendly copy of the same ideas.",
        questions: [
          { q: "What does a Bhatkhande line not show?", options: [{ text: "Exact ornament shapes, tone and the raga's feel", right: true }, { text: "Which notes to play", why: "It shows the notes, their octaves and the rhythm. The shapes, tone and feel still come from listening." }], why: "Notation is a memory aid, not a full description." },
          { q: "Two books mark khatka differently. What do you do?", options: [{ text: "Read each book's legend first", right: true }, { text: "Assume they mean the same thing", why: "Disputed: books differ in small details, especially the dash, the khatka bracket and where the komal line goes." }], why: "Always read the legend first (L27)." },
        ] },
    ] },
    { title: "Letters and marks", steps: [
      { id: "letters", kind: "bhatkhande", title: "The seven letters", intro: "Name each Devanagari letter in the course's notation.",
        rounds: [
          { tokens: [T("सा")], options: ["S", "R", "P"], answer: "S" },
          { tokens: [T("ग")], options: ["G", "D", "m"], answer: "G" },
          { tokens: [T("ध")], options: ["N", "D", "G"], answer: "D" },
          { tokens: [T("प")], options: ["P", "m", "S"], answer: "P" },
          { tokens: [T("नि")], options: ["N", "R", "D"], answer: "N" },
        ] },
      { id: "marks", kind: "bhatkhande", title: "The marks", intro: "Now with marks. Look above and below the letter.",
        rounds: [
          { tokens: [T("रे", "komal")], options: ["R", "r", "R'"], answer: "r", why: "A short line under the letter: komal (flat). The course writes it in lower case." },
          { tokens: [T("म", "tivra")], options: ["m", "M", ".m"], answer: "M", why: "A short vertical line above Ma: tivra Ma, upper-case M." },
          { tokens: [T("नि", "mandra")], options: ["N", "N'", ".N"], answer: ".N", why: "A dot below: the lower (mandra) octave, a dot before the letter here." },
          { tokens: [T("सा", "taar")], options: ["S'", ".S", "S"], answer: "S'", why: "A dot above: the upper (taar) octave, an apostrophe after the letter here." },
          { tokens: [T("ग"), T("रे")], arc: true, options: ["G R", "G~R", "GR"], answer: "G~R", why: "An arc above two notes: a meend from the first to the second." },
          { tokens: [T("ग", "komal"), T("ऽ")], options: ["g -", "g _", "G -"], answer: "g -", why: "ऽ (avagraha) extends the previous note for this beat: the course writes -." },
        ] },
    ] },
    { title: "Read a line", steps: [
      { id: "lines", kind: "dictate", title: "Rewrite it", intro: "Each line is printed as a book would print it, without marks. Write it in the course's notation: the keys sound as you tap.",
        notes: KEYS, say: "Write it in the course's notation.",
        rounds: [
          { show: "सा रे ग रे सा", notes: [0, 2, 4, 2, 0] },
          { show: "ग प ध प ग रे सा", notes: [4, 7, 9, 7, 4, 2, 0] },
          { show: "प ध सा' ध प", notes: [7, 9, 12, 9, 7] },
        ] },
      { id: "play", kind: "phrase", title: "Play what you read", intro: "ग प ध प ग रे सा, from the book to the flute.", phrase: [4, 7, 9, 7, 4, 2, 0], giveUp: 120 },
      { id: "tala", kind: "quiz", title: "The tala row", intro: "Under each line, books print the beat numbers and the tala marks.",
        questions: [{ q: "In the tala row, X marks...", options: [{ text: "Sam, beat 1", right: true }, { text: "Khali", why: "Khali is 0. X is sam." }], why: "2, 3 and 4 are the tali numbers; 0 is khali." }] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 190 complete", next: "Finish Day 190",
        make: dayReward(d => [
          ["Know what notation can and cannot show", !!d.why],
          ["Read the seven Devanagari letters", !!d.letters],
          ["Read komal, tivra, octave and meend marks", !!d.marks],
          ["Rewrote book lines in sargam", !!d.lines],
          [d.play && d.play.passed ? "Played a line from the book" : "Practised a line from the book", !!d.play],
        ], { when: "Next", title: "Raga Yaman", text: "On Day 197: the raga of tivra Ma, and of evenings.", notes: [-1, 2, 4, 6, 7, 6, 4, 2, 0] }) },
    ] },
  ],
  finish(d, { first }) {
    return finishDay(190, "m190", 30, "Day 190 lesson. Bhatkhande: letters " + (d.letters ? d.letters.right + "/" + d.letters.of : "-") + ", marks " + (d.marks ? d.marks.right + "/" + d.marks.of : "-") + ".", first);
  },
};
