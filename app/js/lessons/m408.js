// Day 408 as a lesson: "Alap and swar vistar". From L31 (the forms of a performance: alap, jod,
// jhala, gat; purvang, uttarang and nyas notes; why mandra tivra Ma is out of reach; building a
// Yaman alap stage by stage; patience; the raga rules checklist).
import { dayReward, finishDay } from "./common.js";

const YAMAN = { name: "Yaman", notes: [0, 2, 4, 6, 7, 9, 11], aroh: [11, 2, 4, 6, 9, 0], avroh: [0, 11, 9, 7, 6, 4, 2], strong: [0, 4, 7, 11] };
// Pitch classes, as the improv check counts them: .D and .N are 9 and 11.
const LOW = { name: "Yaman, below Pa", notes: [0, 2, 4, 6, 9, 11], aroh: [11, 2, 4, 6], avroh: [6, 4, 2, 0, 11, 9], strong: [0, 4] };

export const M408 = {
  id: "m408",
  day: 408,
  title: "Alap and swar vistar",
  minutes: 40,
  chapters: [
    { title: "The shape of a performance", steps: [
      { id: "forms", kind: "order", title: "Four sections", intro: "A full instrumental raga performance usually unfolds in four sections (Fact, with many variations between artists). Put them in order:",
        items: [{ label: "Alap" }, { label: "Jod" }, { label: "Jhala" }, { label: "Gat" }],
        prompt: "From the slow, free opening to the composition with tabla.", done: "Alap: no pulse. Jod: a steady pulse, no taal cycle. Jhala: a fast pulse, the climax. Gat or bandish: with tabla, in a taal." },
      { id: "alap", kind: "quiz", title: "Alap and jod", intro: "Swar vistar means \"expansion of the notes\": phrases built around one note at a time, the range widening slowly. Alap is its large-scale form.",
        questions: [
          { q: "What is the difference between alap and jod?", options: [{ text: "Alap has no pulse; jod has a steady pulse but no taal cycle", right: true }, { text: "Jod is the same as alap, only higher", why: "Both develop the raga; what changes is rhythm: alap has no pulse, jod a steady one." }], why: "Light forms (bhajan, thumri, dhun, film song) are shorter and freer with raga rules." },
          { q: "Why can't you play mandra tivra Ma (.M) on your flute?", options: [{ text: "It is F#4, below your lowest note, .P (G4)", right: true }, { text: "Yaman does not use it", why: "Yaman does use tivra Ma; .M is simply below your flute's range. Reshape such phrases from .P or .D." }], why: "Pannalal Ghosh added an extra hole to his flute partly for this." },
        ] },
    ] },
    { title: "Where phrases rest", steps: [
      { id: "halves", kind: "quiz", title: "Purvang and uttarang", intro: "Purvang is the lower half of the octave (about S to m or P), uttarang the upper (about P to S'). A nyas is a note where phrases rest.",
        questions: [
          { q: "Which are Yaman's resting notes?", options: [{ text: "G, P, N, R, and S as the final home", right: true }, { text: "M and D", why: "Ma and Dha mostly pass on. Yaman rests on G, P, N and R, and finally S." }], why: "Vadi Ga and samvadi Ni get the most weight." },
        ] },
      { id: "nyas", kind: "nyas", title: "Hear the nyas", intro: "Each phrase settles on one note: the long one. Which?",
        rounds: [
          { phrase: [[-1, 0.5], [2, 0.5], [4, 2.2]], options: ["R", "G", "M"], answer: "G", why: ".N R G - -: resting on Ga, the vadi." },
          { phrase: [[6, 0.5], [9, 0.5], [11, 2.2]], options: ["D", "N", "S'"], answer: "N", why: "M D N - -: Ni, the samvadi." },
          { phrase: [[4, 0.5], [6, 0.5], [7, 2.2], [6, 0.4], [4, 0.4], [2, 0.7]], options: ["P", "M", "G"], answer: "P", why: "G M P - -, then down to Re: Pa is held, the rest pass by." },
        ] },
    ] },
    { title: "Build the alap", steps: [
      { id: "s1", kind: "phrase", title: "Stage 1: Sa and below", intro: "Stay below Ga. Slowly, with the drone; let each long note settle in tune: .N .D .N R S.", phrase: [-1, -3, -1, 2, 0], giveUp: 90 },
      { id: "s2", kind: "phrase", title: "Stage 2: reach Ga", intro: "The first rest on Ga, the vadi. Make it a moment: .N R G - - , M G R , .N R S.", phrase: [-1, 2, 4, 6, 4, 2, -1, 2, 0], giveUp: 120 },
      { id: "low", kind: "improv", title: "Say something below Pa", intro: "Forty seconds, stages 1 and 2 only: nothing above tivra Ma. Rest long on Ga and Sa, pass quickly over the others, breathe between phrases.", ...LOW, seconds: 40 },
      { id: "s4", kind: "phrase", title: "Stage 4: Dha and Ni", intro: "The uttarang: M D N - - , D P , M G R S.", phrase: [6, 9, 11, 9, 7, 6, 4, 2, 0], giveUp: 120 },
      { id: "s5", kind: "phrase", title: "Stage 5: taar Sa", intro: "The high point. Do not rush to it: M D N S' - -.", phrase: [6, 9, 11, 12], giveUp: 90 },
      { id: "free", kind: "improv", title: "A short alap", intro: "Sixty seconds of Yaman, low to high and back, ending on a long, steady Sa. Patience is part of the style.", ...YAMAN, seconds: 60 },
    ] },
    { title: "Check it", steps: [
      { id: "check", kind: "quiz", title: "The raga rules checklist", intro: "A scale played up and down is not a raga. A raga is a set of ways of moving.",
        questions: [
          { q: "Your alap goes S R G M P D N S' and back, every note the same length. The fix?", options: [{ text: "Phrases with rests: long nyas notes, short passing notes", right: true }, { text: "Play it faster", why: "Speed does not make a scale a raga. Rest on the nyas notes and use the raga's phrases." }], why: "Also: stay low longer; reach taar Sa only in stage 5." },
          { q: "Which belongs on the checklist?", options: [{ text: "A listener would recognise the raga within 30 s", right: true }, { text: "Every note of the octave is used", why: "Only the raga's notes, in its shapes. Yaman never uses shuddha Ma." }], why: "The full list is in L31: notes, shapes, pakad, nyas, vadi and samvadi, gradual growth, ornaments, tuning, ending on Sa." },
        ] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 408 complete", next: "Finish Day 408",
        make: dayReward(d => [
          ["Know the four sections", !!(d.forms && d.alap)],
          [d.nyas ? "Heard " + d.nyas.right + " of " + d.nyas.of + " resting notes first time" : "Heard the resting notes", !!d.nyas],
          ["Built the alap in stages", !!(d.s1 && d.s2 && d.s4 && d.s5)],
          ["Played a short Yaman alap", !!d.free],
          ["Know the checklist", !!d.check],
        ], { when: "Next", title: "Accompaniment", text: "On Day 466: playing with a singer or another player, and leaving space.", notes: [0, 2, 4, 2, 0] }) },
    ] },
  ],
  finish(d, { first }) {
    return finishDay(408, "m408", 40, "Day 408 lesson. Nyas heard: " + (d.nyas ? d.nyas.right + "/" + d.nyas.of : "-") + ".", first);
  },
};
