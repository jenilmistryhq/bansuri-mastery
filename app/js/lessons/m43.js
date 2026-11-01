// Day 43 as a lesson: "Tivra Ma and octave slurs". From L13 (articulation: slur, breath attack,
// tonguing; a style choice, Disputed) and L14 (tivra Ma, all holes open; overblowing, the second
// register; .P to P). Phase 2 gates practised: S S R R G G with each note separated; .P to P.
import { dayReward, finishDay, holdingSide } from "./common.js";

const SRG = [0, 2, 4, 2, 0];

export const M43 = {
  id: "m43",
  day: 43,
  title: "Tivra Ma and octave slurs",
  minutes: 35,
  chapters: [
    { title: "Warm up", steps: [
      { id: "long", kind: "hold", title: "Lower Pa, then Sa", intro: "Two long tones: .P (all six closed, slow warm air), then Sa, 4 seconds each.", targets: [-5, 0], seconds: 4, cents: 30, giveUp: 90 },
    ] },
    { title: "How a note starts", steps: [
      { id: "kinds", kind: "quiz", title: "Vowels and consonants", intro: "Articulation is the consonant of music: your steady tone is the vowel; how a note begins is the consonant. The bansuri has three ways.",
        questions: [
          { q: "Keep blowing and change only the fingers. That is...", options: [{ text: "A slur", right: true }, { text: "Tonguing", why: "Tonguing taps the air with the tongue tip, \"ta\". A slur keeps the air going." }, { text: "A breath attack", why: "A breath attack is a small push from the belly, \"hu\". A slur keeps one breath going." }], why: "One smooth line, like singing one vowel while changing notes." },
          { q: "A small push from the belly, as if whispering \"hu\". That is...", options: [{ text: "A breath attack", right: true }, { text: "A slur", why: "A slur has no new start at all." }], why: "Soft, gentle separation: the classical way of repeating a note." },
          { q: "The tongue tip touches behind the upper teeth, as in \"ta\" or \"da\". That is...", options: [{ text: "Tonguing", right: true }, { text: "A breath attack", why: "A breath attack comes from the belly, not the tongue." }], why: "A clear, crisp start: folk tunes, film songs, fast repeated notes." },
        ] },
      { id: "hear", kind: "judge", title: "Hear the difference", intro: "S R G R S, played two ways. Listen to both, then choose.",
        rounds: [
          { q: "Which is slurred: one smooth line?", a: { seq: SRG, gap: 0.12 }, b: { seq: SRG }, right: "b", why: "B never stops the air: only the pitch changes. A starts every note again." },
          { q: "Which is tongued: crisp starts?", a: { seq: [0, 0, 0, 0], gap: 0.1, crisp: true }, b: { seq: [0, 0, 0, 0], gap: 0.16 }, right: "a", why: "A starts each note cleanly, like \"ta\"; B's starts are softer and breathier, like \"hu\"." },
        ] },
      { id: "style", kind: "quiz", title: "Which is right?", intro: "Hindustani classical bansuri is mostly slurred and breath-articulated, because it imitates the voice, which glides between notes.",
        questions: [{ q: "Should a classical player ever tongue?", options: [{ text: "Teachers disagree: it is a style choice", right: true }, { text: "Never: tonguing is wrong", why: "Some classical teachers discourage it; others use it freely in fast taans. You will hear both." }], why: "Disputed. Learn all three: film and folk music use tonguing a lot (L13)." }] },
      { id: "hu", kind: "phrase", title: "Breath attacks: hu, hu, hu, hu", intro: "On Sa, one \"hu\" per beat, at 60 BPM. The push comes from the belly, not the throat: a hand on the belly feels it pulse. Between notes the air stops; the lips keep their shape.",
        phrase: [0, 0, 0, 0], giveUp: 60 },
      { id: "tu", kind: "phrase", title: "Tonguing: da, da, da, da", intro: "Whisper \"tu\" (or the softer \"da\") into the flute on Sa. Keep the air always flowing: the tongue only interrupts it for an instant, like a tap on a water hose.",
        phrase: [0, 0, 0, 0], giveUp: 60 },
      { id: "gate", kind: "phrase", title: "The articulation gate", intro: "S S R R G G: each note separated, the tone unchanged. The gate is 80 BPM; today, any steady speed.",
        phrase: [0, 0, 2, 2, 4, 4], giveUp: 90 },
    ] },
    { title: "Tivra Ma", steps: [
      { id: "toy", kind: "holes", title: "All holes open", intro: "The flute is on Ga (XOO OOO). Lift the last finger too, then press Blow.",
        goal: 6, startPattern: "XOOOOO", side: holdingSide, goalText: "All open: tivra Ma, written M (sharp Ma, F# on a C flute)." },
      { id: "fact", kind: "quiz", title: "Which Ma?", intro: "Two Ma's exist: tivra (sharp) and shuddha (natural).",
        questions: [{ q: "On a standard 6-hole bansuri, the all-open note is...", options: [{ text: "Tivra Ma (M)", right: true }, { text: "Shuddha Ma (m)", why: "Shuddha Ma needs a half-hole: it comes in L16." }], why: "Tivra Ma is often a little weaker or airier: nothing holds the flute but the thumbs and lip. Keep the grip steady." }] },
      { id: "find", kind: "firstSound", title: "Find tivra Ma", intro: "From Ga, lift the first finger smoothly; keep the flute still with both thumbs and the lip.", target: 6, times: 2, giveUp: 90, start: "All holes open. Press Start, then blow gently." },
      { id: "gmgrs", kind: "phrase", title: "G M G R S", intro: "Slowly, one note per beat.", phrase: [4, 6, 4, 2, 0], giveUp: 60 },
    ] },
    { title: "The second register", steps: [
      { id: "air", kind: "overblow", title: "Same fingers, two notes", intro: "Inside the flute the air vibrates in a pattern. Gentle, slow air gives the low note. Faster, narrower air switches to a pattern twice as fast: an octave higher. Slide the air speed.", note: -5 },
      { id: "speed", kind: "quiz", title: "Speed, not force", intro: "One more question before you try it.",
        questions: [{ q: "How do you make the faster air?", options: [{ text: "A smaller lip opening and a little more support from the belly", right: true }, { text: "Blow harder and louder", why: "Force makes a squeal. Overblowing is about air speed: a narrower stream, not more air." }], why: "Aim the air a little more across the hole, a narrower \"hoo\" (L14)." }] },
      { id: "octave", kind: "phrase", title: ".P, then P", intro: "Play .P with slow, warm air. Without moving a finger, make the lip opening smaller and the stream faster: the note flips to madhya Pa. Relax back. Press Hear it first.",
        phrase: [-5, 7, -5, 7], giveUp: 120 },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 43 complete", next: "Finish Day 43",
        make: dayReward(d => [
          ["Know the three ways to start a note", !!d.kinds],
          [d.gate && d.gate.passed ? "Played S S R R G G separated" : "Practised separated notes", !!d.gate],
          [d.find && d.find.found ? "Played tivra Ma" : "Searched for tivra Ma", !!d.find],
          ["Know how one fingering gives two notes", !!d.air],
          [d.octave && d.octave.passed ? "Slurred .P to P and back" : "Started octave slurs", !!d.octave],
        ], { when: "Next", title: "Pa, Dha, Ni above, and taal", text: "On Day 50: the second register up to S', and the cycles that hold Indian music together.", notes: [0, 2, 4, 6, 7, 9, 11, 12] }) },
    ] },
  ],
  finish(d, { first }) {
    const note = "Day 43 lesson. S S R R G G: " + (d.gate && d.gate.passed ? "separated" : "not yet") + ". Tivra Ma: " + (d.find && d.find.found ? "yes" : "not yet") + ". .P to P: " + (d.octave && d.octave.passed ? "yes" : "not yet") + ".";
    return finishDay(43, "m43", 35, note, first);
  },
};
