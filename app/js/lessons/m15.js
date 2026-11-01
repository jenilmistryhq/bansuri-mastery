// Day 15 as a lesson: "Lower Ni". From L11 (below Sa: close the bottom holes one at a time; the
// seal; slower, warmer air; S .N S changes) and L10 (reading the lower octave). The day's pass:
// .N sounds 4 times in 5.
import { dayReward, finishDay, holdingSide } from "./common.js";

export const M15 = {
  id: "m15",
  day: 15,
  title: "Lower Ni",
  minutes: 30,
  chapters: [
    { title: "Warm up", steps: [
      { id: "long", kind: "hold", title: "Sa, Re, Ga", intro: "Three long tones, 4 seconds each.", targets: [0, 2, 4], seconds: 4, cents: 30, giveUp: 90 },
    ] },
    { title: "Below Sa", steps: [
      { id: "guess", kind: "choose", key: "guess", title: "Guess first", intro: "From Sa (XXX OOO), close hole 4 with the index finger of your bottom hand. Up or down?",
        options: [
          { id: "down", text: "Down", afterHead: "Yes: down, below Sa.", after: "Closing holes lengthens the air column: lower. Below Sa you close the bottom-hand holes one at a time: Ni, then Dha, then Pa." },
          { id: "up", text: "Up", afterHead: "The other way: down.", after: "Closing a hole makes the air column longer, so the note is lower. Lifting goes up; closing comes down." },
        ] },
      { id: "toy", kind: "holes", title: "Find lower Ni", intro: "The flute is on Sa. Close hole 4, then press Blow.",
        goal: -1, startPattern: "XXXOOO", side: holdingSide, goalText: "That is mandra Ni, written .N (the dot means the lower octave): XXX XOO, B on a C flute. One step below home." },
      { id: "air", kind: "choose", key: "air", title: "Warm air for low notes", intro: "Breathe on your palm as if warming cold hands: \"haaa\". Then blow your narrow Sa \"pooh\". Low notes need something between the two. Which is closer?",
        options: [
          { id: "haaa", text: "Closer to \"haaa\": slower, warmer, softer", afterHead: "Yes.", after: "Low notes need slower, warmer, softer air and a slightly larger lip opening. Blowing as for Sa often makes them jump up to the upper octave." },
          { id: "pooh", text: "Closer to \"pooh\": faster and narrower", afterHead: "The other way.", after: "Fast, narrow air makes low notes squeal or jump up an octave. Slow it down, warm it up." },
        ] },
      { id: "find", kind: "firstSound", title: "Find .N, three times", intro: "XXX XOO. As you go down from Sa, slow the air and let the lip opening relax a little.",
        target: -1, times: 3, giveUp: 90, start: "Holes 1-4 closed. Press Start, then blow slowly, warmly." },
      { id: "hold", kind: "hold", title: "A long .N", intro: "Hold .N for 4 seconds.", target: -1, seconds: 4, cents: 30, giveUp: 60 },
      { id: "change", kind: "phrase", title: "Sa and lower Ni", intro: "S .N S .N S, slurred: one finger (hole 4), the air steady.", phrase: [0, -1, 0, -1, 0], giveUp: 60 },
    ] },
    { title: "The seal", steps: [
      { id: "seal", kind: "timer", title: "Check the seal", intro: "Low notes are the most leak-sensitive: one off-centre finger and they squeak or jump. Close all six holes for 10 seconds without blowing, then look at the ring marks on your finger pads.",
        seconds: 10, start: "Start 10 seconds", checks: ["Every pad I use shows a full ring", "I re-centred any finger with a partial ring"] },
      { id: "leak", kind: "quiz", title: "Find a leak", intro: "A trick for later, when .P (all six closed) will not sound.",
        questions: [
          { q: "You play a low note, then lift one finger at a time. Lifting one finger makes almost no difference. What does that tell you?",
            options: [{ text: "That hole was probably leaking", right: true }, { text: "That finger is in the perfect place", why: "If lifting it changes nothing, the hole was already letting air out: it was not sealed." }],
            why: "Re-centre that finger, press just enough, and try again (L11)." },
        ] },
    ] },
    { title: "Read low notes", steps: [
      { id: "read", kind: "rhythm", title: "Read lines with .N", intro: "A dot before a note means the lower octave. Say the names as you tap.", bpm: 60, lines: ["S .N S - | S .N S -", "R S .N S | R G R S"] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 15 complete", next: "Finish Day 15",
        make: dayReward(d => [
          ["Found lower Ni on the drawn flute", !!d.toy],
          ["Know the warm air for low notes", !!d.air],
          [d.find && d.find.found ? "Played .N three times" : "Searched for .N", !!d.find],
          [d.change && d.change.passed ? "Changed between Sa and .N" : "Practised S .N S", !!d.change],
          ["Checked the seal", !!d.seal],
        ], { when: "Next", title: "Dha and Pa below", text: "In the coming days: .D, then .P with all six holes closed, your lowest note.", notes: [0, -1, -3, -5] }) },
    ] },
  ],
  finish(d, { first }) {
    const note = "Day 15 lesson. .N: " + (d.find && d.find.found ? "3 times" : "not yet") + ". Long .N: " + (d.hold && d.hold.passed ? "4 s" : "not yet") + ". S .N S: " + (d.change && d.change.passed ? "clean" : "not yet") + ".";
    return finishDay(15, "m15", 30, note, first);
  },
};
