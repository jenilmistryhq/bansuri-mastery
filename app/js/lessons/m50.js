// Day 50 as a lesson: "Upper Pa, Dha, Ni, and taal". From L14 (the second register: .D to D,
// .N to N, S to S'; the M to P change; the full middle octave) and L15 (taal: matra, vibhag,
// avartan, sam, tali, khali, theka; keherwa, dadra, teentaal; the clap-wave method; counting
// silently to sam). Phase 2 gates practised: the full scale; teentaal with claps and waves.
import { dayReward, finishDay } from "./common.js";

const UP = [0, 2, 4, 6, 7, 9, 11, 12];

export const M50 = {
  id: "m50",
  day: 50,
  title: "Upper Pa, Dha, Ni, and taal",
  minutes: 35,
  chapters: [
    { title: "The second register", steps: [
      { id: "dd", kind: "phrase", title: ".D, then D", intro: "Like .P to P: the same fingers (XXX XXO), a smaller lip opening and faster air, and the note flips up an octave to madhya Dha.", phrase: [-3, 9, -3, 9], giveUp: 90 },
      { id: "nn", kind: "phrase", title: ".N, then N", intro: "XXX XOO: slow warm air for .N, faster narrower air for madhya Ni.", phrase: [-1, 11, -1, 11], giveUp: 90 },
      { id: "ss", kind: "phrase", title: "Sa, then S'", intro: "XXX OOO with faster air: taar Sa, the top of the middle octave.", phrase: [0, 12, 0, 12], giveUp: 90 },
      { id: "mp", kind: "phrase", title: "The hardest change: M to P", intro: "From all fingers open to all fingers closed, and a change of register at the same moment. Practise the pair alone: M P M P.", phrase: [6, 7, 6, 7], giveUp: 90 },
      { id: "scale", kind: "phrase", title: "The whole middle octave", intro: "S R G M P D N S', and back down. Slowly, slurred. This is the Kalyan scale.", phrase: UP.concat(UP.slice(0, -1).reverse()), giveUp: 150 },
    ] },
    { title: "Taal", steps: [
      { id: "terms", kind: "quiz", title: "A cycle, like a clock", intro: "A taal is a repeating cycle of beats. Think of a clock face: the hand goes round and round, and 12 o'clock is always the special point.",
        questions: [
          { q: "That special point, beat 1, is called...", options: [{ text: "Sam", right: true }, { text: "Khali", why: "Khali is an \"empty\" section start, shown with a wave. Sam is beat 1." }], why: "Music often arrives on sam. It is written X." },
          { q: "One complete cycle is an...", options: [{ text: "Avartan", right: true }, { text: "Matra", why: "A matra is one beat. The whole cycle is an avartan." }], why: "Matra: a beat. Vibhag: a section. Avartan: the cycle." },
          { q: "At a khali (0), your hand...", options: [{ text: "Waves", right: true }, { text: "Claps", why: "Claps are for sam and tali (X, 2, 3). Khali is a wave." }], why: "Khali sections sound lighter (fewer bass strokes): that helps you hear sam coming." },
        ] },
      { id: "keherwa", kind: "clapwave", title: "Keherwa: 8 beats", intro: "Dha Ge Na Ti | Na Ka Dhi Na. Clap on 1 (X), wave on 5 (0). Used in a very large number of film songs, bhajans and folk songs.", taal: "keherwa", bpm: 72, cycles: 3 },
      { id: "dadra", kind: "clapwave", title: "Dadra: 6 beats", intro: "Dha Dhi Na | Dha Ti Na: a lilting 1-2-3, 4-5-6. Clap on 1, wave on 4.", taal: "dadra", bpm: 72, cycles: 3 },
      { id: "teen", kind: "clapwave", title: "Teentaal: 16 beats", intro: "The most common taal in Hindustani classical music. Clap on 1 (X), 5 (2) and 13 (3); wave on 9 (0). The last cycle is silent: keep counting, and clap on sam.", taal: "teentaal", bpm: 80, cycles: 3, silent: 1 },
      { id: "theka", kind: "quiz", title: "One detail", intro: "The teentaal theka above is the commonly taught one.",
        questions: [{ q: "Is it the same in every school?", options: [{ text: "No: the last two sections vary between gharanas", right: true }, { text: "Yes, exactly the same everywhere", why: "Disputed detail: the exact theka of the last two vibhags varies between gharanas (stylistic schools)." }], why: "The structure (16 beats, X 2 0 3) is the same; the bols can differ (L15)." }] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 50 complete", next: "Finish Day 50",
        make: dayReward(d => [
          ["Played .D to D, .N to N and S to S'", !!(d.dd && d.nn && d.ss)],
          [d.scale && d.scale.passed ? "Played the whole middle octave" : "Practised the middle octave", !!d.scale],
          ["Know sam, tali, khali and avartan", !!d.terms],
          ["Kept keherwa and dadra with the hands", !!(d.keherwa && d.dadra)],
          [d.teen && d.teen.hit >= d.teen.of - 1 ? "Landed on sam in silent teentaal" : "Clapped teentaal", !!d.teen],
        ], { when: "Next", title: "Shuddha Ma and half-holing", text: "On Day 64: half a hole, and the natural Ma. Then the major scale and its tunes.", notes: [4, 5, 7, 5, 4] }) },
    ] },
  ],
  finish(d, { first }) {
    const note = "Day 50 lesson. Middle octave: " + (d.scale && d.scale.passed ? "played" : "not yet") + ". Teentaal: " + (d.teen ? d.teen.hit + "/" + d.teen.of : "-") + ".";
    return finishDay(50, "m50", 35, note, first);
  },
};
