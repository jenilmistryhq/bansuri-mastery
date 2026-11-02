// Day 467 as a lesson: "Style adaptation". From L36 (styles as accents: tone, articulation,
// ornaments, rhythm feel, freedom; the style profiles, tendencies not laws; one melody in four
// styles; a dhun in a light raga; copying recordings; Hindustani and Carnatic, Enrich).
import { dayReward, finishDay } from "./common.js";

const OPTS = ["Film", "Bhajan", "Ghazal", "Folk"];
const KHAMAJ = { name: "Khamaj", notes: [0, 2, 4, 5, 7, 9, 10, 11], aroh: [0, 4, 5, 7, 9, 11, 0], avroh: [0, 10, 9, 7, 5, 4, 2], strong: [0, 4, 7] };

export const M467 = {
  id: "m467",
  day: 467,
  title: "Style adaptation",
  minutes: 35,
  chapters: [
    { title: "Accents of one language", steps: [
      { id: "five", kind: "quiz", title: "What makes a style", intro: "The notes may be identical, but a film song, a bhajan and a raga phrase are \"pronounced\" differently. Style is tone, articulation, ornaments, rhythm feel and freedom with the melody.",
        questions: [
          { q: "Which ornament is most characteristic of bhajan playing on bansuri?", options: [{ text: "Meend", right: true }, { text: "Fast murki", why: "Murki belongs more to ghazal and light classical. Bhajans are warm, slow and sustained, with meend into important notes." }], why: "Mostly slurred, with soft breath attacks." },
          { q: "A film song: how free are you with the melody?", options: [{ text: "Not very: listeners expect the recorded melody", right: true }, { text: "Very: decorate it freely", why: "That suits a dhun or a ghazal. In film songs, match the singer's ornaments only." }], why: "These are tendencies, not laws: always check the original recording." },
        ] },
      { id: "styles", kind: "styles", title: "Name the style", intro: "One plain melody, S R G - | P - G R || G P D P | G R S -, played four ways. Listen for speed, tonguing, glides, quick turns and vibrato.",
        rounds: [
          { style: "folk", options: OPTS, answer: "Folk", why: "Fast, every note tongued, repeated notes, a strong dance-like pulse." },
          { style: "bhajan", options: OPTS, answer: "Bhajan", why: "Slow and sustained, slurred, with meend into Re and Sa." },
          { style: "film", options: OPTS, answer: "Film", why: "Bright and fairly strict, tongued repeated notes, vibrato only on the last note." },
          { style: "ghazal", options: OPTS, answer: "Ghazal", why: "Flexible time, a kan into the long notes and murki turns: refined decoration." },
        ] },
    ] },
    { title: "Your turn", steps: [
      { id: "plain", kind: "phrase", title: "The plain melody", intro: "First as written, straight: S R G P G R G P D P G R S.", phrase: [0, 2, 4, 7, 4, 2, 4, 7, 9, 7, 4, 2, 0], giveUp: 120 },
      { id: "bhajan", drill: { title: "A melody as a bhajan", intro: "S R G P G R G P D P G R S at 60 BPM: slurred, sustained, a meend from Ga down to Re and from Re into Sa." }, kind: "phrase", title: "Now as a bhajan", intro: "60 BPM, slurred, sustained, a meend from Ga down to Re and from Re into Sa. Same notes, different accent. Record it and listen back.", phrase: [0, 2, 4, 7, 4, 2, 4, 7, 9, 7, 4, 2, 0], giveUp: 150 },
      { id: "dhun", kind: "improv", title: "A dhun in Khamaj", intro: "A dhun is a light, raga-based tune, played with variations. Forty seconds in Khamaj: shuddha Ni going up, komal Ni coming down. Keep coming back to S G m P and D m G.", ...KHAMAJ, seconds: 40 },
    ] },
    { title: "Further afield", steps: [
      { id: "carnatic", kind: "quiz", title: "Hindustani and Carnatic", intro: "Both traditions share deep roots. Carnatic music has 72 melakarta ragas, gamakas on most notes, and adi tala (8 beats) as its common taal.",
        questions: [
          { q: "How many holes does a typical Carnatic venu have, and why does it matter to you?", options: [{ text: "Usually 8: its fingering differs, so its lessons may not transfer", right: true }, { text: "6, the same as yours", why: "The venu usually has 8 holes and is held and fingered differently, so Carnatic fingering lessons may not transfer to your 6-hole bansuri." }], why: "Fact: some Carnatic flute lessons do not transfer directly." },
        ] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 467 complete", next: "Finish Day 467",
        make: dayReward(d => [
          ["Know the five parts of a style", !!d.five],
          [d.styles ? "Named " + d.styles.right + " of " + d.styles.of + " styles first time" : "Named the styles", !!d.styles],
          ["Played one melody two ways", !!(d.plain && d.bhajan)],
          ["Played a Khamaj dhun", !!d.dhun],
          ["Know where the venu differs", !!d.carnatic],
        ], { when: "Next", title: "Gamak and andolan", text: "On Day 498: the heavy, shaking ornaments of the classical style, and andolan's slow sway.", notes: [0, 2, 4, 5, 4, 2, 0] }) },
    ] },
  ],
  finish(d, { first }) {
    return finishDay(467, "m467", 35, "Day 467 lesson. Styles named: " + (d.styles ? d.styles.right + "/" + d.styles.of : "-") + ".", first);
  },
};
