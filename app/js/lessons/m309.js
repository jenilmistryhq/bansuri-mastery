// Day 309 as a lesson: "Komal swaras: all 12 notes". From L25 (komal: a note lowered a semitone;
// Re, Ga, Dha, Ni; the 12 notes; each komal note a half-covered hole; least stable notes, Fact;
// the coverage differs by flute, Uncertain; slide method; komal and shuddha contrast; the
// chromatic scale; cross-fingerings, Uncertain; the ragas komal notes colour).
import { dayReward, finishDay } from "./common.js";

const CHROMA = [["S", 0], ["r", 1], ["R", 2], ["g", 3], ["G", 4], ["m", 5], ["M", 6], ["P", 7], ["d", 8], ["D", 9], ["n", 10], ["N", 11], ["S'", 12]].map(([label, semi]) => ({ label, semi }));

export const M309 = {
  id: "m309",
  day: 309,
  title: "Komal swaras: all 12 notes",
  minutes: 40,
  chapters: [
    { title: "Twelve notes", steps: [
      { id: "komal", kind: "quiz", title: "Soft notes", intro: "Komal means \"soft\": a note lowered by a semitone. With the seven shuddha notes and tivra Ma, they make 12.",
        questions: [
          { q: "Which notes can be komal?", options: [{ text: "Re, Ga, Dha and Ni", right: true }, { text: "Sa and Pa", why: "Sa and Pa never change. Re, Ga, Dha and Ni can be komal; Ma is raised to tivra." }], why: "The course writes them in lower case: r g d n." },
          { q: "How is a komal note made on the bansuri?", options: [{ text: "By half-covering the hole between it and the shuddha note above", right: true }, { text: "By blowing more softly", why: "Softer air only lowers the pitch slightly, and weakens the tone. Komal notes are half-holes." }], why: "Fact: half-hole notes are the least stable on the bansuri: weaker tone, sensitive pitch." },
        ] },
      { id: "order", kind: "order", title: "Twelve steps of a semitone", intro: "Put all twelve in order, from Sa up to S'. Each tap plays its note: every step is one semitone.", items: CHROMA, prompt: "From Sa, one semitone at a time.", done: "S r R g G m M P d D n N S': twelve equal steps." },
    ] },
    { title: "Komal Ga", steps: [
      { id: "slide", kind: "halfhole", open: 4, closed: 2, midName: "komal Ga", title: "Find komal Ga", intro: "From Ga, hole 2 is open. Slide finger 2 onto about half of it: the pitch falls from E toward D#. Stop on komal Ga. Exactly how much to cover differs from flute to flute." },
      { id: "g", kind: "hold", title: "Hold komal Ga", intro: "Play Ga, slide finger 2 halfway onto hole 2, and hold komal Ga (D# on a C flute) within 20 cents. Memorise the finger position.", target: 3, seconds: 4, cents: 20, giveUp: 90 },
      { id: "n", kind: "hold", title: "Hold komal Ni", intro: "Madhya register: from Dha (XXX XXO, faster air), half-cover hole 5 instead: XXX XHO. Komal Ni, A# on a C flute.", target: 10, seconds: 4, cents: 20, giveUp: 90 },
    ] },
    { title: "Darker, brighter", steps: [
      { id: "ear", kind: "judge", title: "Komal or shuddha?", intro: "Komal notes sound darker, sadder, against Sa. Listen.",
        rounds: [
          { q: "Which ends on komal Ga?", a: { seq: [0, 2, 4], gap: 0.06, dur: 0.6 }, b: { seq: [0, 2, 3], gap: 0.06, dur: 0.6 }, right: "b", why: "B lands a semitone lower: komal Ga, darker. A is shuddha Ga." },
          { q: "Which ends on komal Ni?", a: { seq: [7, 9, 10], gap: 0.06, dur: 0.6 }, b: { seq: [7, 9, 11], gap: 0.06, dur: 0.6 }, right: "a", why: "A: komal Ni, a semitone below Ni. B is shuddha Ni, pulling up to S'." },
        ] },
      { id: "gG", kind: "phrase", title: "g G g G", intro: "Slowly, with the drone: feel the change of colour.", phrase: [3, 4, 3, 4], giveUp: 90 },
      { id: "nN", kind: "phrase", title: "n N n N", intro: "The same with Ni.", phrase: [10, 11, 10, 11], giveUp: 90 },
    ] },
    { title: "Scales", steps: [
      { id: "chrom", kind: "phrase", title: "The chromatic scale", intro: "S r R g G m M P d D n N S', one note per beat at 50 BPM. Every step must be the same distance: one semitone. Up only today.", phrase: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], giveUp: 180 },
      { id: "kafi", kind: "pick", title: "Kafi's colour", intro: "Komal notes give ragas their colour: Bhairav (r, d), Kafi (g, n), Bhairavi (r g d n). Here is Kafi's scale. Which notes?", notes: [0, 2, 3, 5, 7, 9, 10], play: [0, 2, 3, 5, 7, 9, 10, 12],
        why: "S R g m P D n: Kafi thaat, with komal Ga and komal Ni." },
      { id: "cross", kind: "quiz", title: "Other fingerings", intro: "Some players use cross-fingerings (a hole open above a closed one) instead of half-holes on certain notes.",
        questions: [{ q: "Is a cross-fingering such as XXX OXX for n in tune on your flute?", options: [{ text: "Test it: keep it only if within 15 cents, with good tone", right: true }, { text: "Yes: it works on every flute", why: "Uncertain: whether a cross-fingering is in tune on your flute must be tested with a tuner." }], why: "Record the readings in your chart, and ask a teacher to check (L25)." }] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 309 complete", next: "Finish Day 309",
        make: dayReward(d => [
          ["Know the 12 notes in order", !!d.order],
          ["Found komal Ga by sliding", !!d.slide],
          [d.g && d.g.passed ? "Held komal Ga within 20 cents" : "Worked on komal Ga", !!d.g],
          [d.n && d.n.passed ? "Held komal Ni within 20 cents" : "Worked on komal Ni", !!d.n],
          ["Hear komal from shuddha", !!d.ear],
          [d.kafi && d.kafi.ok ? "Found Kafi's notes" : "Looked for Kafi's notes", !!d.kafi],
        ], { when: "Next", title: "Western notation", text: "On Day 372: the staff, so you can read any melody written for any instrument.", notes: [0, 2, 4, 5, 7] }) },
    ] },
  ],
  finish(d, { first }) {
    return finishDay(309, "m309", 40, "Day 309 lesson. Komal Ga: " + (d.g && d.g.passed ? "within 20 cents" : "not yet") + "; komal Ni: " + (d.n && d.n.passed ? "within 20 cents" : "not yet") + "; chromatic scale: " + (d.chrom && d.chrom.passed ? "played" : "practised") + ".", first);
  },
};
