// Day 64 as a lesson: "Shuddha Ma and half-holing". From L16 (the 12 notes; shuddha Ma as a
// half-covered hole 1; the slide technique; the tuner decides, not the eye; m to P) and EX-ALK
// (Bilawal scale; Version C on Kalyan). Phase 2 gate practised: G m P m G with m within 20 cents.
import { dayReward, finishDay } from "./common.js";

const BILAWAL = [0, 2, 4, 5, 7, 9, 11, 12];
const KALYAN_PAIRS = [0, 2, 2, 4, 4, 6, 6, 7, 7, 9, 9, 11, 11, 12];

export const M64 = {
  id: "m64",
  day: 64,
  title: "Shuddha Ma and half-holing",
  minutes: 35,
  chapters: [
    { title: "Twelve notes", steps: [
      { id: "twelve", kind: "quiz", title: "Notes that move", intro: "Each of the seven swaras has a natural position, shuddha. Five of them can also move by a semitone, the smallest step on your flute.",
        questions: [
          { q: "Which two notes never change?", options: [{ text: "Sa and Pa", right: true }, { text: "Re and Ga", why: "Re and Ga can be lowered (komal). Sa and Pa never move." }], why: "Sa and Pa are fixed: the drone plays them." },
          { q: "Ma can be...", options: [{ text: "Raised: tivra Ma (M)", right: true }, { text: "Lowered: komal Ma", why: "Re, Ga, Dha and Ni are lowered (komal). Ma is the one that is raised (tivra)." }], why: "Re, Ga, Dha, Ni lower to komal (r g d n); Ma rises to tivra (M). 7 + 5 = 12 notes." },
          { q: "Your flute's plain fingerings give S R G M P D N. Every other note needs...", options: [{ text: "A half-hole: a hole partly covered", right: true }, { text: "Blowing harder", why: "Blowing harder changes the register, not the semitone. The other notes need a partly covered hole." }], why: "Shuddha Ma is the first: about half of hole 1." },
        ] },
    ] },
    { title: "Half a hole", steps: [
      { id: "slide", kind: "halfhole", title: "Slide the finger", intro: "From Ga, only finger 1 is down. Slide it sideways off the hole, without lifting it: the pitch rises smoothly toward tivra Ma. Stop on shuddha Ma, between the two. This flute's sweet spot is somewhere from 40 to 60 percent." },
      { id: "fact", kind: "quiz", title: "Half is approximate", intro: "Shuddha Ma is the standard half-hole on hole 1.",
        questions: [{ q: "How do you know you have covered the right amount?", options: [{ text: "The tuner (and the drone) decide, not the eye", right: true }, { text: "Cover exactly half: you can see it", why: "Some flutes need 40%, some 60%. Listen and use the tuner." }], why: "Memorise the feeling: where on the finger the edge of the hole is (L16)." }] },
      { id: "hold", kind: "hold", title: "Hold shuddha Ma", intro: "Play Ga, slide finger 1 until the ring turns green on m (F on a C flute), and hold it. Within 20 cents to start.", target: 5, seconds: 4, cents: 20, giveUp: 90 },
      { id: "gmg", kind: "phrase", title: "G m G", intro: "Ga, slide to shuddha Ma, back to Ga.", phrase: [4, 5, 4], giveUp: 90 },
      { id: "gate", kind: "phrase", title: "The half-hole gate: G m P m G", intro: "m to P means: from a half-covered hole, close all six and change register. Practise until it is clean; the gate is 5 clean repetitions.", phrase: [4, 5, 7, 5, 4], giveUp: 120 },
    ] },
    { title: "Which Ma?", steps: [
      { id: "ear", kind: "judge", title: "Shuddha or tivra?", intro: "Ga, then a Ma. Listen to both, then choose.",
        rounds: [
          { q: "Which ends on shuddha Ma (m)?", a: { seq: [4, 5], gap: 0.1, dur: 0.7 }, b: { seq: [4, 6], gap: 0.1, dur: 0.7 }, right: "a", why: "A is one semitone above Ga: shuddha Ma. B is two semitones up: tivra Ma." },
          { q: "Which ends on tivra Ma (M)?", a: { seq: [7, 5], gap: 0.1, dur: 0.7 }, b: { seq: [7, 6], gap: 0.1, dur: 0.7 }, right: "b", why: "From Pa, tivra Ma is just one semitone below; shuddha Ma is two." },
        ] },
    ] },
    { title: "Scales", steps: [
      { id: "bilawal", kind: "phrase", title: "The major scale", intro: "With shuddha Ma you can play Bilawal, the major scale: S R G m P D N S'. Slowly.", phrase: BILAWAL, giveUp: 150 },
      { id: "kalyan", kind: "phrase", title: "Kalyan alankar: pairs", intro: "EX-ALK Version C, formula 2 on the Kalyan scale (tivra Ma): S R | R G | G M | M P | P D | D N | N S'. A tiny \"hu\" between repeated notes.", phrase: KALYAN_PAIRS, giveUp: 150 },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 64 complete", next: "Finish Day 64",
        make: dayReward(d => [
          ["Know the 12 notes", !!d.twelve],
          ["Found shuddha Ma by sliding", !!d.slide],
          [d.hold && d.hold.passed ? "Held m within 20 cents" : "Worked on shuddha Ma", !!d.hold],
          [d.gate && d.gate.passed ? "Played G m P m G" : "Practised G m P m G", !!d.gate],
          ["Can hear shuddha from tivra Ma", !!d.ear],
          [d.bilawal && d.bilawal.passed ? "Played the major scale" : "Practised the major scale", !!d.bilawal],
        ], { when: "Next", title: "Intonation with the drone", text: "On Day 85: every note locked to the drone, bending away and back, and swells that keep their pitch.", notes: [0, 0, 0] }) },
    ] },
  ],
  finish(d, { first }) {
    const note = "Day 64 lesson. Shuddha Ma: " + (d.hold && d.hold.passed ? "held within 20 cents" : "not yet") + ". G m P m G: " + (d.gate && d.gate.passed ? "clean" : "not yet") + ". Bilawal: " + (d.bilawal && d.bilawal.passed ? "played" : "not yet") + ".";
    return finishDay(64, "m64", 35, note, first);
  },
};
