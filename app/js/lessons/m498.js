// Day 498 as a lesson: "Gamak and andolan". From L33 (shruti: notes placed differently by raga,
// the 22 shrutis Disputed, learned by ear; andolan: a slow, narrow swing, raga-specific; gamak by
// breath pulses and by finger; kampan and vibrato as a choice, Disputed, Recommendation: straight
// first; naming ornaments by ear; the honest note: have a teacher check).
import { dayReward, finishDay } from "./common.js";
import { targetCurve } from "../ornaments.js";

const curve = f => { const p = []; for (let t = 0; t <= 3; t += 0.02) p.push({ t: Math.round(t * 100) / 100, semi: f(t) }); return p; };
const ANDOLAN = targetCurve("andolan", { note: 1, depth: 0.4, rate: 1, dur: 4 });
const VIBRATO = curve(t => 0.15 * Math.sin(2 * Math.PI * 5.5 * t));
// Finger gamak on Ga: Ga long and strong, Ma a quick flick above it.
const GAMAK = curve(t => (t % 0.24 < 0.16 ? 4 : 5));
const MEEND = targetCurve("meend", { from: 4, to: 2, dur: 1.6 });
const WHY = {
  andolan: "A slow, narrow sway, about one wave a second: komal Re as in Bhairav. You still hear r, not two notes.",
  vibrato: "Fast and very narrow, a shimmer on Sa: a general expressive device, not raga-specific.",
  gamak: "Forceful: Ga strong, Ma flicked above it, again and again. Heavy and energetic.",
  meend: "One smooth glide from Ga down to Re, no steps.",
};
const opts = right => ["andolan", "vibrato", "gamak", "meend"].map(k => ({ text: { andolan: "Andolan", vibrato: "Vibrato", gamak: "Gamak", meend: "Meend" }[k], right: k === right, why: k === right ? WHY[k] : "Listen to the speed and width of the movement." }));

export const M498 = {
  id: "m498",
  day: 498,
  title: "Gamak and andolan",
  minutes: 40,
  chapters: [
    { title: "Between the notes", steps: [
      { id: "shruti", kind: "quiz", title: "Shruti", intro: "Indian theory describes 22 shrutis, microtonal positions, of which your 12 notes are a selection. Performers place some notes slightly differently in different ragas: komal Re in Bhairav is often played lower, and swung.",
        questions: [
          { q: "Why is a tuner not enough for raga intonation?", options: [{ text: "Some ragas place notes differently and use moving notes: learned by ear", right: true }, { text: "Tuners are not accurate enough", why: "A tuner is accurate; it just cannot know the raga. Raga intonation is learned from recordings and teachers." }], why: "Disputed: scholars disagree about the exact sizes of the 22 shrutis." },
        ] },
      { id: "ear", kind: "curves", title: "Name the movement", intro: "Four ways a note can move. Listen to the speed and the width.",
        rounds: [
          { q: "What is this?", curve: ANDOLAN, options: opts("andolan") },
          { q: "What is this?", curve: GAMAK, options: opts("gamak") },
          { q: "What is this?", curve: VIBRATO, options: opts("vibrato") },
          { q: "What is this?", curve: MEEND, options: opts("meend") },
        ] },
    ] },
    { title: "Andolan", steps: [
      { id: "r", kind: "hold", title: "Komal Re, in tune", intro: "With the drone: komal Re, XXH OOO. Hold it in tune for 6 seconds before you swing it.", target: 1, seconds: 6, cents: 20, giveUp: 90 },
      { id: "andolan", kind: "ornament", key: "andolan", ex: { id: "bhairav-re", note: 1, depth: 0.4, rate: 1, dur: 5 }, title: "Swing it", intro: "Very slowly cover a little more of hole 3, so the pitch sinks a few cents, then return. One wave in 1-2 seconds; slow, even and narrow. If it sounds like a wobble, it is too fast." },
      { id: "bhairav", kind: "phrase", title: "In Bhairav's phrase", intro: "G m r - S: the andolan on komal Re, then home. Andolan is raga-specific: check the raga card before using it elsewhere.", phrase: [4, 5, 1, 0], giveUp: 90 },
    ] },
    { title: "Gamak", steps: [
      { id: "breath", kind: "phrase", title: "Breath gamak", intro: "Each note pushed by a pulse of air from the diaphragm, \"ha\", no tongue, the sound never stopping: S R G P D S' D P G R S, one pulse a note. Stop if you feel dizzy.", phrase: [0, 2, 4, 7, 9, 12, 9, 7, 4, 2, 0], giveUp: 120 },
      { id: "finger", kind: "phrase", title: "Finger gamak", intro: "G-m G-m G-m: Ga longer and stronger, Ma a flick above it. Slowly first; speed up only while Ga stays the main note.", phrase: [4, 5, 4, 5, 4, 5, 4], giveUp: 90 },
      { id: "choice", kind: "quiz", title: "Vibrato as a choice", intro: "Kampan is a small, regular wavering. Disputed: players differ greatly; many classical teachers keep long notes straight.",
        questions: [
          { q: "What does this course recommend?", options: [{ text: "Straight long notes first; vibrato only by choice", right: true }, { text: "Vibrato on every long note, for warmth", why: "Vibrato should be a deliberate choice, never a habit. Learn a perfectly straight tone first." }], why: "Try G R S .N S straight, then with a slow vibrato only on the last S, and decide which suits the music." },
          { q: "How is andolan different from vibrato?", options: [{ text: "Slower, raga-specific, swinging toward a neighbour", right: true }, { text: "It is the same, only louder", why: "Andolan is slow (1-2 s a wave) and belongs to certain notes of certain ragas; vibrato is faster, narrower and general." }], why: "Have a teacher check your gamak and andolan before practising them for months: a wrong habit here is hard to remove." },
        ] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 498 complete", next: "Finish Day 498",
        make: dayReward(d => [
          ["Know why a tuner is not enough", !!d.shruti],
          [d.ear ? "Named " + d.ear.right + " of " + d.ear.of + " movements first time" : "Named the movements", !!d.ear],
          [d.r && d.r.passed ? "Held komal Re in tune" : "Worked on komal Re", !!d.r],
          ["Swung komal Re", !!d.andolan],
          ["Played breath and finger gamak", !!(d.breath && d.finger)],
          ["Know vibrato is a choice", !!d.choice],
        ], { when: "Phase 5", title: "A full raga presentation", text: "On Day 617: alap, jod, slow and fast gat, taans and tihais, shaped into one whole.", notes: [0, -1, 2, 4, 6, 9, 11, 12] }) },
    ] },
  ],
  finish(d, { first }) {
    return finishDay(498, "m498", 40, "Day 498 lesson. Movements named: " + (d.ear ? d.ear.right + "/" + d.ear.of : "-") + "; komal Re: " + (d.r && d.r.passed ? "in tune" : "practised") + ".", first);
  },
};
