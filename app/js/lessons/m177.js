// Day 177 as a lesson: "Keys and transposition". From L26 (key means which pitch is home; the
// flute's natural Sa; songs in other keys; range: .P (G4) to M' (F#6); the song-fit check; four
// solutions; Pa as Sa: the G major scale with no half-holes; the hard spots).
import { dayReward, finishDay } from "./common.js";

// The flute's own notes, from .P to G' (the keys of the rewrite game).
const KEYS = [[".P", -5], [".D", -3], [".N", -1], ["S", 0], ["R", 2], ["G", 4], ["M", 6], ["P", 7], ["D", 9], ["N", 11], ["S'", 12], ["R'", 14], ["G'", 16]].map(([label, semi]) => ({ label, semi }));

export const M177 = {
  id: "m177",
  day: 177,
  title: "Keys and transposition",
  minutes: 35,
  chapters: [
    { title: "Which pitch is home", steps: [
      { id: "key", kind: "quiz", title: "Keys", intro: "Key means which pitch is home. Your flute gives C on XXX OOO: C is its natural Sa.",
        questions: [
          { q: "A song's Sa is D. You play it with your Sa (C). What happens?", options: [{ text: "Every note is a whole step too low: fine alone, but it clashes with the recording", right: true }, { text: "Nothing: sargam is the same in every key", why: "The sargam is the same, but the pitches are not: with Sa = C, every note sits a whole step below the song's." }], why: "Change the recording, move Sa on your flute, change octave, or change flute (L26)." },
          { q: "Your flute's lowest note is...", options: [{ text: ".P (G4): nothing exists below it", right: true }, { text: ".S, an octave below Sa", why: "On a 6-hole flute nothing is below .P (all six closed): a melody more than a fifth below Sa cannot be played as written." }], why: "Range: .P (G4) to a comfortable G' (E6); M' (F#6) is the practical ceiling." },
        ] },
      { id: "fit", kind: "quiz", title: "Does the song fit?", intro: "Write a song's lowest and highest notes in sargam against its own Sa, then check.",
        questions: [
          { q: "Lowest .P, highest M'.", options: [{ text: "It fits, comfortably", right: true }, { text: "It does not fit", why: ".P to M' is exactly your range." }], why: "Everything from .P to M' is playable with Sa = C." },
          { q: "Lowest .m (below .P).", options: [{ text: "No: move Sa up, or play an octave higher", right: true }, { text: "It fits if you blow softly", why: "Nothing exists below .P, however you blow." }], why: "If the whole melody lies between S and S', it may also work an octave higher: check the new top is at or below M'." },
        ] },
    ] },
    { title: "Pa as Sa", steps: [
      { id: "why", kind: "quiz", title: "A second key with no half-holes", intro: "The G major scale is G A B C D E F#. On your flute those are P D N S' R' G' M': no half-holes.",
        questions: [{ q: "With Pa as Sa (a song in G), which old note is the new Ma?", options: [{ text: "Old Sa (C): XXX OOO", right: true }, { text: "Old Ma", why: "Count from the new Sa (G): G A B C. The fourth, C, is your old Sa." }], why: "A major-scale melody is even easier this way: the new Ma is your old Sa, no half-hole (Fact, L26)." }] },
      { id: "rewrite", kind: "dictate", title: "Rewrite it for your flute", intro: "Each melody is written in G (Sa = G). Write the notes you actually play on your C flute, with madhya Pa as the new Sa. Each key sounds as you tap: compare with Hear the phrase.",
        notes: KEYS, say: "Write the notes you play on your C flute.",
        rounds: [
          { show: "In G: S R G", notes: [7, 9, 11] },
          { show: "In G: S R G m P", notes: [7, 9, 11, 12, 14] },
          { show: "In G: P m G R S", notes: [14, 12, 11, 9, 7] },
          { show: "In G: .N S R S", notes: [6, 7, 9, 7] },
        ] },
      { id: "scale", kind: "phrase", title: "G major on your flute", intro: "The new scale, from the new Sa (madhya Pa): P D N S' R', and back.", phrase: [7, 9, 11, 12, 14, 12, 11, 9, 7], giveUp: 150 },
      { id: "twinkle", kind: "phrase", title: "Twinkle, in G", intro: "Your song 1, moved to G: S S P P D D P becomes P P R' R' G' G' R'. Same tune, higher, and no half-hole for its Ma.", phrase: [7, 7, 14, 14, 16, 16, 14], giveUp: 150 },
    ] },
    { title: "Hard spots", steps: [
      { id: "hard", kind: "quiz", title: "Plan around these", intro: "On a C medium flute:",
        questions: [
          { q: "A very loud .P...", options: [{ text: "Cracks into the upper octave: keep low notes medium-soft", right: true }, { text: "Sounds bigger and richer", why: "Low notes crack when pushed." }], why: "Also hard: tivra Ma's tone (all open), fast passages through komal notes, register 3." },
        ] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 177 complete", next: "Finish Day 177",
        make: dayReward(d => [
          ["Know what a key is", !!d.key],
          ["Can check whether a song fits", !!d.fit],
          ["Rewrote melodies for Pa as Sa", !!d.rewrite],
          [d.scale && d.scale.passed ? "Played G major on your flute" : "Practised G major", !!d.scale],
          [d.twinkle && d.twinkle.passed ? "Played your song in a new key" : "Tried your song in a new key", !!d.twinkle],
        ], { when: "Next", title: "Meend", text: "On Day 183: the glide that makes a bansuri sing like a voice.", notes: [2, 4] }) },
    ] },
  ],
  finish(d, { first }) {
    const note = "Day 177 lesson. Pa as Sa: G major " + (d.scale && d.scale.passed ? "played" : "practised") + "; Twinkle in G " + (d.twinkle && d.twinkle.passed ? "played" : "tried") + ".";
    return finishDay(177, "m177", 35, note, first);
  },
};
