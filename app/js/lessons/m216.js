// Day 216 as a lesson: "Improvise and compose". From L29 (improvisation comes from limits; like
// learning to talk; call and response: an open question, an answer home on Sa; three notes over a
// drone; never stop the pulse) and L30 (composition is improvisation you keep; question and
// answer, repetition, variation, contrast, a clear goal; a 16-beat melody in keherwa).
import { dayReward, finishDay } from "./common.js";

export const M216 = {
  id: "m216",
  day: 216,
  title: "Improvise and compose",
  minutes: 40,
  chapters: [
    { title: "Limits make it easy", steps: [
      { id: "why", kind: "quiz", title: "Not \"anything goes\"", intro: "Improvisation means making up music while you play. In a raga performance most of what you hear is improvised, within strict rules.",
        questions: [
          { q: "What helps a beginner start improvising?", options: [{ text: "Limits: 3 notes, a pulse, and \"end on Sa\"", right: true }, { text: "All 12 notes and no rules", why: "With all 12 notes and no rules, beginners freeze. Good improvisation comes from limits." }], why: "Like learning to talk: copy phrases, then change one word, then two (L29)." },
          { q: "Which ending feels like a question?", options: [{ text: "S R G -: it stops on Ga", right: true }, { text: "G R S -: it stops on Sa", why: "Ending on Sa feels closed, like a full stop. Ending on R, G or D sounds open: a question." }], why: "A question ends open; an answer comes home to Sa." },
        ] },
      { id: "qa", kind: "answer", title: "Call and response", intro: "The app plays a question, four notes ending open. Answer it on your flute: about four notes, ending on Sa. Never stop the pulse: a wrong note is fine, keep going.",
        questions: [[0, 2, 4], [-3, 0, 2], [7, 4, 2, 4], [4, 7, 9]] },
      { id: "three", kind: "improv", title: "Three notes, one minute", intro: "Only S R G. Vary how long the notes are, their order (S R G, G R S, R G R), repeat some, add silences. End on S.", name: "S R G", notes: [0, 2, 4], aroh: [0, 2, 4], avroh: [0, 2, 4], strong: [0], seconds: 60 },
    ] },
    { title: "Keep the best", steps: [
      { id: "tools", kind: "quiz", title: "A composer's tools", intro: "Composition is improvisation that you keep: choose the best ideas, write them down, polish them.",
        questions: [
          { q: "Repeat an idea with one change. That is...", options: [{ text: "Variation: interest without confusion", right: true }, { text: "Contrast", why: "Contrast is a new section in another register or rhythm, like an antara. One change is variation." }], why: "Repetition makes a melody memorable; variation keeps it interesting." },
          { q: "A melody heads to a high point, then home. That gives it...", options: [{ text: "A clear goal, and a shape", right: true }, { text: "Too much movement", why: "A goal gives shape: listeners follow it." }], why: "Question and answer, repetition, variation, contrast, a clear goal (L30)." },
        ] },
      { id: "comp", kind: "compose", title: "Your first composition", intro: "16 beats of keherwa, in Bhupali's notes: a question (beats 1-8) that ends open, and an answer (9-16) that comes home to Sa. Tap a beat, then a note; Hold extends the note before. Play it, change it, then save it: it goes to your melodies in Play.", notes: [-3, 0, 2, 4, 7, 9] },
      { id: "playit", kind: "phrase", title: "Play L30's example", intro: "The lesson's own 16-beat melody: S R G P | G - R - || G P D P | G R S -. A question, then the answer home.", phrase: [0, 2, 4, 7, 4, 2, 4, 7, 9, 7, 4, 2, 0], giveUp: 150 },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 216 complete", next: "Finish Day 216",
        make: dayReward(d => [
          ["Know why limits help", !!d.why],
          [d.qa ? "Answered " + d.qa.homes + " of " + d.qa.of + " questions home on Sa" : "Tried call and response", !!d.qa],
          ["Improvised with three notes", !!d.three],
          [d.comp ? "Composed and saved: " + d.comp.notation : "Started a composition", !!d.comp],
          [d.playit && d.playit.passed ? "Played L30's melody" : "Practised L30's melody", !!d.playit],
        ], { when: "Next", title: "Performing", text: "On Day 281, after the M7 recital: stage nerves, interpretation, and playing for people.", notes: [0, 4, 7, 12, 7, 4, 0] }) },
    ] },
  ],
  finish(d, { first }) {
    return finishDay(216, "m216", 40, "Day 216 lesson. Call and response: " + (d.qa ? d.qa.homes + "/" + d.qa.of + " home" : "-") + ". Composition: " + ((d.comp && d.comp.notation) || "not saved") + ".", first);
  },
};
