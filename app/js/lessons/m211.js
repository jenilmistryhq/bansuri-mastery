// Day 211 as a lesson: "Kan, khatka and murki". From L24 (kan: a very short touch of another
// note before the main one, from above or below; khatka and murki: quick groups of 3-5 notes
// circling the main note, khatka more forceful, murki lighter, Disputed; slow motion first; why
// they come after clean transitions and meend).
import { dayReward, finishDay } from "./common.js";
import { targetCurve } from "../ornaments.js";

const PLAIN = (() => { const p = []; for (let t = 0; t <= 1.2; t += 0.02) p.push({ t: Math.round(t * 100) / 100, semi: 2 }); return p; })();
const KAN = targetCurve("kan", { grace: 4, main: 2 });
const MURKI = targetCurve("murki", { notes: [4, 2, 0, 2], each: 0.11 });
const opts = right => [
  { text: "A plain note", right: right === "plain", why: right === "plain" ? "Just Re, nothing before it." : "Listen to the very start of the note." },
  { text: "A kan: a flick, then the note", right: right === "kan", why: right === "kan" ? "A tiny Ga before a long Re: a flavour of the note, not a note of its own." : "Listen to the start: one touch, or several?" },
  { text: "A murki: a quick turn of notes", right: right === "murki", why: right === "murki" ? "G R S R in a flash, then Re held: a light cluster circling the main note." : "Count the notes before the held one." },
];

export const M211 = {
  id: "m211",
  day: 211,
  title: "Kan, khatka and murki",
  minutes: 35,
  chapters: [
    { title: "Quick ornaments", steps: [
      { id: "kan", kind: "quiz", title: "A particle of a note", intro: "A kan (kan swar, \"particle note\") is a very short touch of another note just before the main note. The listener hears it as a flavour of the main note, not a separate note. Written {G}R: touch G, land on R.",
        questions: [
          { q: "In a kan, how much of the time does the flick take?", options: [{ text: "About a tenth: the landing note gets nine-tenths", right: true }, { text: "Half the time", why: "Then it would be two notes. The flick is a blink; the landing note is the note." }], why: "Flick, land (L24)." },
          { q: "Why do these ornaments come after clean transitions and meend?", options: [{ text: "They are fast finger moves: a leak or blip makes them sound like mistakes", right: true }, { text: "They are less important", why: "They are as important; but on leaking or blipping fingers they sound like errors." }], why: "Clean changes first, then ornaments." },
        ] },
      { id: "ear", kind: "curves", title: "Name it", intro: "Re, played three ways. What do you hear?",
        rounds: [
          { q: "What is this?", curve: KAN, options: opts("kan") },
          { q: "What is this?", curve: PLAIN, options: opts("plain") },
          { q: "What is this?", curve: MURKI, options: opts("murki") },
        ] },
    ] },
    { title: "Kan", steps: [
      { id: "above", kind: "ornament", key: "kan", ex: { id: "ga-re", grace: 4, main: 2 }, title: "Kan from above: {G}R", intro: "Finger Re (XXO OOO) but start with finger 2 lifted (that is Ga). Start the note and immediately, as fast as a blink, drop finger 2: a tiny G flicks into a long R." },
      { id: "below", kind: "ornament", key: "kan", ex: { id: "sa-re", grace: 0, main: 2 }, title: "Kan from below: {S}R", intro: "Start with the fingers on Sa (XXX OOO). At the same instant as the note starts, lift finger 3 very quickly: a tiny S before R." },
    ] },
    { title: "Murki", steps: [
      { id: "slow", kind: "phrase", title: "Slow motion first", intro: "Murki on Re, (GRSR): first as four equal notes, one per beat. G R S R, then a held R.", phrase: [4, 2, 0, 2], giveUp: 120 },
      { id: "fast", drill: { title: "Murki at speed", intro: "Murki on Re (GRSR): two per beat, then four, then the whole group in a fraction of a beat before a held R. Light: the first notes softer and shorter, the arrival note full." }, kind: "ornament", key: "murki", ex: { id: "grsr", notes: [4, 2, 0, 2], each: 0.11 }, title: "Now at speed", intro: "Two per beat, then four, then the whole group in a fraction of a beat before a held R. Make it light: the first notes softer and shorter, the arrival note full." },
      { id: "which", kind: "quiz", title: "Khatka or murki?", intro: "Both are quick groups of 3-5 notes around a main note, inside its time.",
        questions: [{ q: "What is the difference?", options: [{ text: "Khatka is usually more forceful; murki lighter: but definitions differ", right: true }, { text: "A fixed rule: khatka has 4 notes, murki 3", why: "Disputed: teachers and books define them slightly differently, and the boundary is not fixed." }], why: "In practice, copy the ornament you hear in a recording (L24). Murki is very common in thumri, ghazal, bhajan and film songs." }] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 211 complete", next: "Finish Day 211",
        make: dayReward(d => [
          ["Know what a kan is", !!d.kan],
          ["Can tell a kan from a murki by ear", !!d.ear],
          [d.above && d.above.passed === d.above.of ? "Played a clean kan from above" : "Practised kan from above", !!d.above],
          [d.below ? "Practised kan from below" : "Will try kan from below", !!d.below],
          [d.fast && d.fast.passed === d.fast.of ? "Played a murki" : "Practised a murki, slow to fast", !!d.slow],
        ], { when: "Next", title: "Improvise and compose", text: "On Day 216: your own phrases, and your first composition.", notes: [0, 2, 4, 7, 9, 7, 4, 2, 4, 0] }) },
    ] },
  ],
  finish(d, { first }) {
    const r = x => (x ? x.passed + "/" + x.of : "-");
    return finishDay(211, "m211", 35, "Day 211 lesson. Kan above " + r(d.above) + ", below " + r(d.below) + "; murki " + r(d.fast) + ".", first);
  },
};
