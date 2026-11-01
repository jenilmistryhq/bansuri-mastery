// Day 8 as a lesson: "Re, your second note". From L09 (Re from Sa: lift one finger; why the pitch
// rises; finger movement), L07 (long tones with the drone), EX-EAR Level 1 (higher/lower, pitch
// matching) and EX-RHY Levels 1-2 (whole and half beats). The day's pass: Re sounds 3 times in 5.
import { dayReward, finishDay, holdingSide } from "./common.js";

export const M8 = {
  id: "m8",
  day: 8,
  title: "Re, your second note",
  minutes: 30,
  chapters: [
    { title: "Warm up", steps: [
      { id: "breathe", kind: "breathe", title: "Three low breaths", intro: "Hand on the belly. In for 4, out for 6.", inhale: 4, exhale: 6, rounds: 3, done: "Ready to play." },
      { id: "sa", kind: "hold", title: "Sa with the drone", intro: "Tick Drone below the ring. Two long Sa's, 6 seconds each, listening for the wah-wah to stop.", target: 0, seconds: 6, cents: 30, times: 2, giveUp: 60 },
    ] },
    { title: "Re", steps: [
      { id: "guess", kind: "choose", key: "guess", title: "Guess first", intro: "You know Sa: holes 1-3 closed. Now lift the ring finger of your top hand off hole 3. Will the note go up or down?",
        options: [
          { id: "up", text: "Up", afterHead: "Yes: up.", after: "Each lifted finger makes the air column shorter, so the pitch rises. Lifting fingers from the top end, one at a time, climbs the scale." },
          { id: "down", text: "Down", afterHead: "The other way: up.", after: "Opening a hole makes the vibrating air column shorter, and a shorter column sounds higher. Closing holes goes down." },
        ] },
      { id: "toy", kind: "holes", title: "Find Re on the flute", intro: "The flute starts on Sa. Lift hole 3 (tap it to open it), then press Blow and compare it with Sa.",
        goal: 2, startPattern: "XXXOOO", side: holdingSide, goalText: "That is Re: XXO OOO. In Western names Sa is C, Re is D: the second note of do re mi." },
      { id: "air", kind: "timer", title: "Air fingering", intro: "Without blowing, change between Sa and Re and say the names aloud: \"Sa... Re... Sa... Re\". Lift the finger only 1-2 cm, quickly and lightly, like tapping a phone. Keep the other fingers still.",
        seconds: 20, start: "Start 20 seconds", checks: ["My finger lifted only a little", "The other fingers stayed still"] },
      { id: "find", kind: "firstSound", title: "Find Re, three times", intro: "Play Re (XXO OOO), gently. Then lower the flute, and find it again. Re needs a little less air than Sa.",
        target: 2, times: 3, giveUp: 90, start: "Holes 1-2 closed, 3-6 open. Press Start, then blow gently." },
      { id: "long", kind: "hold", title: "A long Re", intro: "Hold Re for 4 seconds: the same tone as your Sa. The tuner reads D on a C flute.", target: 2, seconds: 4, cents: 30, giveUp: 60 },
    ] },
    { title: "Ear", steps: [
      { id: "hl", kind: "higherlower", title: "Higher, lower or the same", intro: "EX-EAR Level 1. Ten pairs: the pass, later, is 18 of 20.", rounds: 10, pass: 8 },
      { id: "humre", kind: "hum", title: "Match Re with your voice", intro: "Pitch matching: hear Re, then hum it. Any octave is fine.", target: 2, seconds: 2 },
    ] },
    { title: "Rhythm", steps: [
      { id: "rhy", kind: "rhythm", title: "Whole beats and half beats", intro: "EX-RHY Levels 1 and 2. \"SS\" is two notes in one beat: say \"1-and\". \"S_\" is a note on the beat and silence on the \"and\".",
        bpm: 60, lines: ["S S S - | S S S -", "S _ S _ | S S S _", "SS SS SS SS | S S S S", "S SS S SS | S SS S -"] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 8 complete", next: "Finish Day 8",
        make: dayReward(d => [
          ["Know why lifting a finger goes up", !!d.guess],
          ["Found Re on the drawn flute", !!d.toy],
          [d.find && d.find.found ? "Played Re three times" : "Searched for Re", !!d.find],
          [d.long && d.long.passed ? "Held a long Re" : "Worked on a long Re", !!d.long],
          ["Heard higher and lower", !!d.hl],
          ["Read half beats", !!d.rhy],
        ], { title: "Ga, and your first tune", text: "Tomorrow: one more finger lifted, clean changes, and the opening of a song.", notes: [4, 2, 0, 2, 4, 4, 4] }) },
    ] },
  ],
  finish(d, { first }) {
    const note = "Day 8 lesson. Re found: " + (d.find && d.find.found ? "3 times" : "not yet") + ". Long Re: " + (d.long && d.long.passed ? "4 s" : "not yet") + ". Higher/lower: " + (d.hl ? d.hl.right + "/" + d.hl.of : "-") + ".";
    return finishDay(8, "m8", 30, note, first);
  },
};
