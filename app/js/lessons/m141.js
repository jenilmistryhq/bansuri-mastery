// Day 141 as a lesson: "Raga Bhupali, and the upper octave". From L20 (Bhupali: notes, mood,
// chalan: Ga at the centre, G R S and .D S, P G and D P, not Deshkar; swar vistar; the pakad;
// the course's original sthayi) and L22 (taar R' and G': same fingers, faster focused air;
// octave leaps; soft high notes; the third register is flute-specific, Uncertain).
import { dayReward, finishDay } from "./common.js";

const N = { ".D": -3, S: 0, R: 2, G: 4, P: 7, D: 9, "S'": 12 };
const notes = text => text.split(/[\s,]+/).filter(x => N[x] !== undefined).map(x => N[x]);
const BHUPALI = { name: "Bhupali", notes: [0, 2, 4, 7, 9], aroh: [0, 2, 4, 7, 9], avroh: [0, 2, 4, 7, 9], strong: [0, 4, 7, 9] };

export const M141 = {
  id: "m141",
  day: 141,
  title: "Raga Bhupali, and the upper octave",
  minutes: 40,
  chapters: [
    { title: "Bhupali", steps: [
      { id: "about", kind: "quiz", title: "Your first raga", intro: "Bhupali is one of the first ragas taught to Hindustani students, and it is ideal for the bansuri: calm, open and devotional.",
        questions: [
          { q: "Why does Bhupali suit a beginner's bansuri?", options: [{ text: "Five notes, S R G P D: no Ma, no Ni, so no half-holes", right: true }, { text: "It is played fast", why: "It is played slowly and calmly; it suits the flute because it needs no half-holes." }], why: "It is the major pentatonic heard in folk music around the world, so it sounds friendly." },
          { q: "In Bhupali, which note is the centre: phrases rest on it, give it time?", options: [{ text: "Ga", right: true }, { text: "Re", why: "Resting low on Re and Sa, and stressing Pa and Dha, drifts toward Deshkar (same notes, another raga). Bhupali leans on Ga." }], why: "G R S and .D S are typical; P G and D P step down over the missing Ma and Ni." },
        ] },
      { id: "which", kind: "judge", title: "Which could be Bhupali?", intro: "Two phrases. Only one could belong to Bhupali.",
        rounds: [
          { q: "Which could be Bhupali?", a: { seq: [0, 2, 4, 5, 7], gap: 0.06, dur: 0.45 }, b: { seq: [0, 2, 4, 7, 9], gap: 0.06, dur: 0.45 }, right: "b", why: "A uses Ma, which Bhupali leaves out. B is S R G P D." },
          { q: "Which sounds like Bhupali?", a: { seq: [4, 2, 0, -3, 0, 2, 4], gap: 0.06, dur: 0.45 }, b: { seq: [4, 5, 4, 2, 0, -1, 0], gap: 0.06, dur: 0.45 }, right: "a", why: "A: G R S .D S R G, the pakad's first half. B uses Ma and Ni." },
        ] },
      { id: "v2", kind: "phrase", title: "Swar vistar: S R G, G R", intro: "Slowly, with the drone. Hold the last note of each phrase 3-4 seconds; breathe at the commas. S R G , G R , S R G , R S", phrase: notes("S R G G R S R G R S"), giveUp: 150 },
      { id: "v4", kind: "phrase", title: "Swar vistar: R G P", intro: "R G P , G P , P G , G R S: stepping down over the missing Ma.", phrase: notes("R G P G P P G G R S"), giveUp: 150 },
      { id: "pakad", kind: "phrase", title: "The pakad", intro: "G R S .D S R G , P G D P G R S. Lean on Ga. If it sounds like a nursery rhyme, you are rushing.", phrase: notes("G R S .D S R G P G D P G R S"), giveUp: 180 },
      { id: "sthayi", kind: "phrase", title: "A composition: the first line", intro: "An original practice composition in Bhupali, teentaal, written for this course (not a traditional bandish): G G R S | .D S R G | P G D P | G R S -", phrase: notes("G G R S .D S R G P G D P G R S"), giveUp: 180 },
      { id: "free", kind: "improv", title: "Play in Bhupali", intro: "Forty seconds, only Bhupali's notes. Rest on Ga, Pa, Dha or Sa; use G R S and .D S. The app names any note outside the raga as it happens.", ...BHUPALI, seconds: 40 },
    ] },
    { title: "The upper octave", steps: [
      { id: "air", kind: "quiz", title: "High notes", intro: "Taar R', G', m' and M' use the same fingers as madhya R G m M, with faster air.",
        questions: [
          { q: "A high note sounds harsh and sharp. What do you change?", options: [{ text: "Faster, more focused air, a smaller lip opening; less force", right: true }, { text: "Blow harder", why: "Blowing harder mostly makes high notes louder, sharper and harsher." }], why: "Expect a new high note to read sharp: roll in slightly and use just enough air speed (L22)." },
          { q: "Above M', the third register: which fingerings?", options: [{ text: "Each flute differs: build your own chart with a tuner", right: true }, { text: "A standard chart covers every flute", why: "Uncertain: no verified source gives a complete third-register chart for a 6-hole C bansuri." }], why: "Start the third register only when taar Sa to Ga are reliable (Phase 5)." },
        ] },
      { id: "rr", kind: "phrase", title: "Octave leaps: R, R'", intro: "XXO OOO: fingers still, only the air changes. The leap should be instant, with no squeak in between.", phrase: [2, 14, 2, 14], giveUp: 120 },
      { id: "gg", kind: "phrase", title: "Octave leaps: G, G'", intro: "XOO OOO, low and high.", phrase: [4, 16, 4, 16], giveUp: 120 },
      { id: "climb", kind: "phrase", title: "Climb to G'", intro: "D N S' R' G', in scale order. Hold G' for a moment.", phrase: [9, 11, 12, 14, 16], giveUp: 120 },
      { id: "soft", kind: "hold", title: "A soft S'", intro: "Soft high notes need the most control. If it drops to the lower octave, keep the air fast but small: less volume, not less speed.", target: 12, seconds: 3, cents: 30, giveUp: 90 },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 141 complete", next: "Finish Day 141",
        make: dayReward(d => [
          ["Know how Bhupali moves", !!d.about],
          [d.pakad && d.pakad.passed ? "Played Bhupali's pakad" : "Practised the pakad", !!d.pakad],
          [d.free && !d.free.outside ? "Played 40 s in Bhupali, only its notes" : "Improvised in Bhupali", !!d.free],
          [d.climb && d.climb.passed ? "Climbed to G'" : "Practised the upper octave", !!d.climb],
          [d.soft && d.soft.passed ? "Held a soft S'" : "Tried a soft S'", !!d.soft],
        ], { when: "Next", title: "Keys and transposition", text: "On Day 177: why your flute has one Sa, how to play songs in other keys, and the limits.", notes: [0, 4, 7, 12] }) },
    ] },
  ],
  finish(d, { first }) {
    const note = "Day 141 lesson. Bhupali pakad: " + (d.pakad && d.pakad.passed ? "played" : "not yet") + ". Improvisation: " + (d.free ? d.free.notes + " notes, " + d.free.outside + " outside" : "-") + ". Upper octave to G': " + (d.climb && d.climb.passed ? "yes" : "not yet") + ".";
    return finishDay(141, "m141", 40, note, first);
  },
};
