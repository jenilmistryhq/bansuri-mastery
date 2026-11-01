// Day 3 as a lesson: "Your first recording". From L08 (recording well, listening one category at
// a time, the rubric, one keep and one fix), L06 (more rhythms) and L05 (the sargam in order).
// The day's pass: a recording exists, and you can describe one thing to improve.
import { dayReward, finishDay } from "./common.js";

const SARGAM = [["S", 0], ["R", 2], ["G", 4], ["m", 5], ["P", 7], ["D", 9], ["N", 11], ["S'", 12]].map(([label, semi]) => ({ label, semi }));

export const M3 = {
  id: "m3",
  day: 3,
  title: "Your first recording",
  minutes: 30,
  chapters: [
    { title: "Warm up", steps: [
      { id: "breathe", kind: "breathe", title: "Three low breaths", intro: "Hand on the belly. In for 4, out for 6.", inhale: 4, exhale: 6, rounds: 3, done: "Ready to play." },
      { id: "hold", kind: "hold", title: "Sa, two seconds", intro: "Holes 1-3 closed. A gentle, steady Sa for 2 seconds: aim for the same sound from start to end.", target: 0, seconds: 2, cents: 50, giveUp: 45 },
    ] },
    { title: "Listen like a teacher", steps: [
      { id: "why", kind: "quiz", title: "Why record yourself?", intro: "While you play, your brain is busy with fingers, breath and reading.",
        questions: [
          { q: "Why does a recording help?",
            options: [
              { text: "You hear only part of your sound while playing; the recording lets you listen like an audience", right: true },
              { text: "Recordings make the flute sound better", why: "They make it sound as it is: the flute sounds different at your ear than a metre away." },
            ],
            why: "Without a teacher in the room, the recording is your teacher (L08)." },
          { q: "Where does the phone go?",
            options: [
              { text: "1-2 metres away, in front of you, the same place every time", right: true },
              { text: "Right next to the blowing hole, to catch every detail", why: "Close up, the breath noise sounds far louder than it is." },
            ],
            why: "The same place every time makes your recordings comparable, week after week." },
        ] },
      { id: "ears", kind: "judge", title: "Train your ears first", intro: "Two Sa's, A and B. Listen to both, then choose. One point at a time, like the rubric.",
        rounds: [
          { q: "Which tone is clearer?", a: { level: 1 }, b: { level: 4 }, right: "b", why: "A is mostly air (tone 1); B is clear and steady (tone 4). Listen for the hiss around the note." },
          { q: "Which tone is steadier?", a: { level: 3 }, b: { level: 2 }, right: "a", why: "B wobbles and is airier (tone 2); A is clear with a little air (tone 3)." },
          { q: "Which is in tune?", a: { cents: -35 }, b: { cents: 0 }, right: "b", why: "A is 35 cents flat: it sounds a little dull, sagging below Sa. B is on Sa." },
          { q: "Which is in tune?", a: { cents: 0 }, b: { cents: 30 }, right: "a", why: "B is 30 cents sharp: a little bright and strained. A is on Sa." },
        ] },
      { id: "rec", kind: "record", title: "Record your Sa", intro: "Phone 1-2 metres away. Say the date and \"Sa\", then play a gentle Sa, two or three times, for 2 seconds each.",
        seconds: 12, day: 3, label: "Day 3: my first Sa", analyse: true, saved: "Saved in your Journal. Play it back below, once all the way through, like an audience." },
      { id: "score", kind: "rubric", title: "Score it, one category at a time", intro: "Listen again, once for each. 1 not yet, 2 developing, 3 secure, 4 polished. Be honest, and kind: Day 3 is meant to score 1s and 2s.",
        cats: [
          { key: "T", name: "Tone", levels: ["Mostly air; the note fails to sound or cracks", "The note sounds, but airy or unsteady; frequent wobble", "Clear, steady tone; slight air noise", "Clear, full, even tone"] },
          { key: "P", name: "Pitch", levels: ["Clearly off (beyond 40 cents)", "The right note, but noticeably out of tune", "Within about 15-20 cents; slips corrected", "Locked with the drone"] },
        ],
        keeps: ["The note sounded", "It started cleanly", "It stayed steady", "Little air noise", "I relaxed"],
        fixes: ["Too much air noise", "The note wobbled", "It started with a \"pff\" or a scoop", "It faded out early", "I tensed up"] },
    ] },
    { title: "Rhythm", steps: [
      { id: "lines", kind: "rhythm", title: "Three more rhythms", intro: "A mix of one and two beats, then four notes in a beat (\"1-e-and-a\", or \"ta-ka-di-mi\"), then rests.",
        bpm: 60, lines: ["S S SS S S - SS S", "SSSS S SS S SS SSSS S -", "S _ S _ SS _ S -"] },
    ] },
    { title: "Sargam", steps: [
      { id: "names", kind: "quiz", title: "Seven notes, then home", intro: "Indian music uses seven swaras. Saying them aloud, \"Sa Re Ga Ma Pa Dha Ni\", is called sargam. After Ni comes Sa again, higher: the next octave.",
        questions: [
          { q: "Which is the home note, heard against everything?", options: [{ text: "Sa", right: true }, { text: "Pa", why: "Pa is the 5th, the strongest after Sa. Sa is home." }, { text: "Ni", why: "Ni is the 7th, just below the next Sa." }], why: "The drone plays Sa all the time, so the listener never loses home (L05)." },
        ] },
      { id: "order", kind: "order", title: "Climb the ladder", intro: "Tap the notes in order, from Sa up to the upper Sa. Each tap plays its note: listen to them rise.",
        items: SARGAM, prompt: "From the lowest, Sa, to the highest, S'." },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 3 complete", next: "Finish Day 3",
        make: dayReward(d => [
          ["Heard tone and pitch like a teacher", !!d.ears],
          ["Recorded your first Sa", !!(d.rec && d.rec.saved)],
          [d.score && d.score.fix ? "One thing to fix: " + d.score.fix : "Scored your recording", !!d.score],
          ["Read three more rhythms", !!d.lines],
          ["Climbed the sargam", !!d.order],
        ], { title: "Long tones", text: "Hold Sa for 4 seconds, ten times, and find your flute's exact pitch.", notes: [0] }) },
    ] },
  ],
  finish(d, { first }) {
    const sc = d.score && d.score.scores ? "T" + d.score.scores.T + " P" + d.score.scores.P : "-";
    const note = "Day 3 lesson. First recording: " + (d.rec && d.rec.saved ? "yes" : "skipped") + ". Self-score: " + sc + ". Keep: " + ((d.score && d.score.keep) || "-") + ". Fix: " + ((d.score && d.score.fix) || "-") + ".";
    return finishDay(3, "m3", 30, note, first);
  },
};
