// Day 85 as a lesson: "Intonation with the drone". From L17 (the drone to listen, the tuner to
// check; three ways to move the pitch; why pitch drifts; the bend drill; dynamics without a
// pitch change; octave checking; shruti, Disputed) and L16 (the half-hole gate). Phase 2 gate
// practised: bend Sa 20 cents both ways and back; an 8-s swell on Sa within 15 cents.
import { dayReward, finishDay } from "./common.js";

export const M85 = {
  id: "m85",
  day: 85,
  title: "Intonation with the drone",
  minutes: 35,
  chapters: [
    { title: "Warm up", steps: [
      { id: "warm", kind: "hold", title: "Warm the flute first", intro: "A cold flute plays flat; your breath warms the bamboo and the pitch rises. Five minutes of long tones before careful tuning. Here: Sa, Ga, Pa, 4 seconds each, with the drone.", targets: [0, 4, 7], seconds: 4, cents: 25, giveUp: 90 },
      { id: "gate", kind: "phrase", title: "The half-hole gate", intro: "G m P m G: shuddha Ma within 20 cents, five clean times in a row for the gate. One clean pass today.", phrase: [4, 5, 7, 5, 4], giveUp: 120 },
    ] },
    { title: "Moving the pitch", steps: [
      { id: "ways", kind: "quiz", title: "Three ways to move the pitch", intro: "On a bamboo flute nothing is fixed: you control the pitch all the time.",
        questions: [
          { q: "You roll the flute toward you, covering more of the blowing hole. The pitch goes...", options: [{ text: "Lower (flatter)", right: true }, { text: "Higher (sharper)", why: "Covering more of the hole, or aiming the air more downward, lowers the pitch." }], why: "Roll away, uncovering more, and it rises." },
          { q: "Faster air makes the pitch...", options: [{ text: "Higher", right: true }, { text: "Lower", why: "Faster air raises the pitch; slower air lowers it." }], why: "That is why louder (faster air) tends to go sharp." },
          { q: "A finger partly shading an open hole below the note...", options: [{ text: "Lowers it slightly: a fine adjustment", right: true }, { text: "Raises it a lot", why: "Shading an open hole below the played note lowers it a little." }], why: "Angle, air speed and shading: three tools (L17)." },
        ] },
      { id: "drift", kind: "quiz", title: "Why pitch drifts", intro: "Know the tendencies, and correct before you hear them.",
        questions: [
          { q: "Which tends to go sharp?", options: [{ text: "Taar (upper) notes, and loud notes", right: true }, { text: "Mandra (lower) notes", why: "Mandra notes tend to go flat; taar notes sharp." }], why: "Louder is sharper, softer flatter; taar sharp, mandra flat." },
        ] },
      { id: "bend", kind: "bend", title: "The bend drill", intro: "Hold Sa with the drone. Bend it 20 cents flat, back to centre, 20 cents sharp, back to centre: angle first, then air speed. Listen for the beats as you leave the centre and for the lock as you return.", target: 0, stops: [0, -20, 0, 20, 0], hold: 1, tol: 7 },
      { id: "swell", kind: "swell", title: "Louder, without going sharp", intro: "Hold Sa softly, centred. Over 4 seconds grow louder: the pitch will try to rise, so roll the flute toward you a tiny amount. Over 4 seconds get softer: roll slightly away.", target: 0, seconds: 8, drift: 15 },
    ] },
    { title: "Octaves and shruti", steps: [
      { id: "oct", kind: "phrase", title: "Check the octave", intro: "S, then S'. Both should give the same reading in cents. The typical fault: S' sharp; slow the air and roll in very slightly.", phrase: [0, 12, 0, 12], giveUp: 90 },
      { id: "shruti", kind: "quiz", title: "Tuner or drone?", intro: "Indian music does not always use the same tuning as a Western tuner (equal temperament).",
        questions: [{ q: "Your Ga locks calmly with the drone, but the tuner says 12 cents flat. What do you trust?", options: [{ text: "The stable lock with the drone", right: true }, { text: "The tuner: always aim for exactly 0", why: "Some notes, especially Ga and Dha, may sound best a few cents away from the tuner's centre against Sa." }], why: "Disputed (advanced): you will meet shruti in L19. Use the tuner to check, the drone to listen." }] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 85 complete", next: "Finish Day 85",
        make: dayReward(d => [
          [d.gate && d.gate.passed ? "Played G m P m G cleanly" : "Practised the half-hole gate", !!d.gate],
          ["Know the three ways to move the pitch", !!d.ways],
          [d.bend && d.bend.done ? "Bent Sa 20 cents both ways and back" : "Practised the bend drill", !!d.bend],
          [d.swell && d.swell.passed ? "Swelled Sa within 15 cents" : "Practised the swell", !!d.swell],
          ["Checked the octave", !!d.oct],
        ], { when: "Next", title: "Learning songs", text: "On Day 99: a method to learn any song, by ear and from notation, step by step.", notes: [0, 2, 4, 7, 4, 2, 0] }) },
    ] },
  ],
  finish(d, { first }) {
    const note = "Day 85 lesson. Bend drill: " + (d.bend && d.bend.done ? "done" : "not yet") + ". Swell drift: " + (d.swell ? d.swell.drift + " cents" : "-") + ".";
    return finishDay(85, "m85", 35, note, first);
  },
};
