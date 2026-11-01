// Day 197 as a lesson: "Raga Yaman". From L21 (Yaman: the first sampurna raga; all shuddha
// notes and tivra Ma, no half-holes; aroh .N R G M D N S' (Disputed simplified form); avroh in
// full; vadi Ga, samvadi Ni; how it moves; Yaman and Bhupali; swar vistar; the pakad).
import { dayReward, finishDay } from "./common.js";

const N = { ".N": -1, S: 0, R: 2, G: 4, M: 6, P: 7, D: 9, N: 11, "S'": 12 };
const notes = text => text.split(/[\s,]+/).filter(x => N[x] !== undefined).map(x => N[x]);
const YAMAN = { name: "Yaman", notes: [0, 2, 4, 6, 7, 9, 11], aroh: [11, 2, 4, 6, 9, 0], avroh: [0, 11, 9, 7, 6, 4, 2], strong: [0, 4, 7, 11] };

export const M197 = {
  id: "m197",
  day: 197,
  title: "Raga Yaman",
  minutes: 40,
  chapters: [
    { title: "Yaman", steps: [
      { id: "about", kind: "quiz", title: "Seven notes, no half-holes", intro: "Yaman (also Kalyan or Iman) is often the first seven-note raga taught: serene, romantic and devotional, in countless bhajans, ghazals and film songs.",
        questions: [{ q: "Why is Yaman friendly on the bansuri?", options: [{ text: "Its one altered note, tivra Ma, is the all-open fingering", right: true }, { text: "It has only five notes", why: "That is Bhupali. Yaman has all seven; its one altered note, tivra Ma, needs no half-hole." }], why: "The whole raga needs no half-holes." }] },
      { id: "notes", kind: "pick", title: "Which notes?", intro: "Yaman going down, in full (its avroh). Choose its seven notes.", notes: [0, 2, 4, 6, 7, 9, 11], play: [12, 11, 9, 7, 6, 4, 2, 0],
        why: "S R G M P D N: every shuddha note except Ma, which is tivra." },
      { id: "moves", kind: "quiz", title: "How Yaman moves", intro: "The notes are only the clothes.",
        questions: [
          { q: "Going up, Yaman tends to...", options: [{ text: "Start from .N and skip Sa: .N R G", right: true }, { text: "Go straight up S R G M P", why: "Going up it tends to skip Sa (.N R, not .N S R) and often Pa (M D, not M P D)." }], why: "Coming down is full: S' N D P M G R S." },
          { q: "Tivra Ma in Yaman...", options: [{ text: "Leans upward and is rarely held long alone", right: true }, { text: "Is the main resting note", why: "Ga is the centre (vadi) and Ni its partner (samvadi). Ma leads on: G M G, M D N." }], why: "Rest notes: Ga, Pa, Ni and Sa." },
        ] },
      { id: "which", kind: "judge", title: "Yaman or Bhupali?", intro: "Both are Kalyan thaat. Bhupali omits Ma and Ni and sounds open; Yaman's tivra Ma and Ni add a bright, yearning quality.",
        rounds: [
          { q: "Which is Yaman?", a: { seq: [0, 2, 4, 7, 9, 12], gap: 0.06, dur: 0.45 }, b: { seq: [-1, 2, 4, 6, 9, 11, 12], gap: 0.06, dur: 0.45 }, right: "b", why: "B: .N R G M D N S', Yaman's aroh. A is Bhupali's." },
          { q: "Which is Yaman?", a: { seq: [-1, 2, 4, 2, -1, 2, 0], gap: 0.06, dur: 0.45 }, b: { seq: [4, 2, 0, -3, 0, 2, 4], gap: 0.06, dur: 0.45 }, right: "a", why: "A: .N R G R .N R S, the start of Yaman's pakad. B is Bhupali's." },
        ] },
    ] },
    { title: "Play Yaman", steps: [
      { id: "ma", kind: "hold", title: "A clean tivra Ma", intro: "Tick Drone. Tivra Ma should sound bright but never sour. If it is weak or airy (common on bansuri), steady the flute with the thumbs and chin.", target: 6, seconds: 4, cents: 25, giveUp: 90 },
      { id: "v1", kind: "phrase", title: "Swar vistar: from .N", intro: ".N R G , R , .N R S: start low, skip Sa going up.", phrase: notes(".N R G R .N R S"), giveUp: 150 },
      { id: "v3", kind: "phrase", title: "Swar vistar: G M P", intro: "G M P , M G , R G R , .N R S", phrase: notes("G M P M G R G R .N R S"), giveUp: 150 },
      { id: "pakad", kind: "phrase", title: "The pakad", intro: ".N R G R , .N R S , P M G R , .N R S. Smooth and flowing, slightly longing.", phrase: notes(".N R G R .N R S P M G R .N R S"), giveUp: 180 },
      { id: "free", kind: "improv", title: "Play in Yaman", intro: "Forty seconds in Yaman. Start low (.N R G), lean on Ga and Ni, let Ma lead on. The app flags notes outside the raga, and going-up slips against its aroh.", ...YAMAN, seconds: 40 },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 197 complete", next: "Finish Day 197",
        make: dayReward(d => [
          [d.notes && d.notes.ok ? "Found Yaman's seven notes" : "Looked for Yaman's notes", !!d.notes],
          ["Know how Yaman moves", !!d.moves],
          ["Can tell Yaman from Bhupali", !!d.which],
          [d.pakad && d.pakad.passed ? "Played Yaman's pakad" : "Practised the pakad", !!d.pakad],
          [d.free && !d.free.outside ? "Improvised in Yaman, only its notes" : "Improvised in Yaman", !!d.free],
        ], { when: "Next", title: "Kan, khatka and murki", text: "On Day 211: the quick ornaments: a grace note, a turn, a flick of the fingers.", notes: [5, 4, 2, 0, -1, 0] }) },
    ] },
  ],
  finish(d, { first }) {
    return finishDay(197, "m197", 40, "Day 197 lesson. Yaman pakad: " + (d.pakad && d.pakad.passed ? "played" : "not yet") + ". Improvisation: " + (d.free ? d.free.notes + " notes, " + d.free.outside + " outside" : "-") + ".", first);
  },
};
