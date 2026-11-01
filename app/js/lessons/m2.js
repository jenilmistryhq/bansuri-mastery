// Day 2 as a lesson: "First sound on Sa". From L04 (finding the sweet spot again, quickly, and
// holding the sound), L05 (Sa, heard and hummed with the drone) and L06 (pulse, tempo and the
// first rhythms). The day's pass: any sound at all on Sa (airy is fine).
import { dayReward, finishDay } from "./common.js";

export const M2 = {
  id: "m2",
  day: 2,
  title: "First sound on Sa",
  minutes: 30,
  chapters: [
    { title: "Warm up", steps: [
      { id: "scan", kind: "cards", title: "A quick tension scan", intro: "Sit tall, flute in your lap. Top to bottom:", yes: "Relaxed", no: "Tense",
        items: [
          { id: "jaw", title: "Jaw and lips", text: "Teeth slightly apart; lips soft.", fix: "Let the jaw hang for a breath, then close the lips softly." },
          { id: "shoulders", title: "Shoulders", text: "Down and wide, not raised.", fix: "Lift them to your ears, then let them fall." },
          { id: "hands", title: "Hands", text: "Wrists fairly straight, fingers soft.", fix: "Shake the hands loose for five seconds." },
        ] },
      { id: "breathe", kind: "breathe", title: "Three low breaths", intro: "Hand on the belly. In for 4, out for 6.", inhale: 4, exhale: 6, rounds: 3, done: "Ready to play." },
    ] },
    { title: "Sa, again and again", steps: [
      { id: "yesterday", kind: "choose", key: "yesterday", title: "How did yesterday go?", intro: "On Day 1 you searched for your first sound.",
        options: [
          { id: "yes", text: "I found a sound", afterHead: "Today you make it reliable.", after: "Finding the sound once is luck; finding it again within 10 seconds is skill. Today: three times." },
          { id: "almost", text: "A faint tone, inside the air", afterHead: "That is close.", after: "Keep the air steady and make the lip opening a little smaller. Move the flute in millimetres." },
          { id: "no", text: "Only air so far", afterHead: "That is normal.", after: "The first sound often takes a few days. Roll the flute slightly toward you, and use less air than you think." },
        ] },
      { id: "sound", kind: "firstSound", title: "Find the sweet spot, three times", intro: "Holes 1-3 closed (Sa). Find the sound, then take the flute away from your lips, breathe, and find it again. Airy is fine: any sound on Sa counts today.",
        target: 0, times: 3, giveUp: 90 },
      { id: "hold", kind: "hold", title: "Make it last: two seconds", intro: "Now hold Sa, gently, for 2 seconds. Do not chase volume: a soft, clear note is the goal. The ring fills while the note stays.",
        target: 0, seconds: 2, cents: 50, giveUp: 45 },
    ] },
    { title: "Sa inside you", steps: [
      { id: "hum", kind: "hum", title: "Hum Sa", intro: "The drone plays Sa all the time, so you never lose home. Hear it, then hum it from memory: your voice learns where Sa is, and later your ear corrects the flute.",
        seconds: 2 },
    ] },
    { title: "The pulse", steps: [
      { id: "tempo", kind: "quiz", title: "Pulse and tempo", intro: "When you tap your foot to a song, you tap its pulse: a steady tick under the music. Tempo is how fast it goes, in beats per minute (BPM).",
        questions: [
          { q: "60 BPM is...", options: [{ text: "One beat every second, like a clock", right: true }, { text: "Sixty beats every second", why: "Per minute: 60 beats in 60 seconds, one a second." }], why: "120 BPM is two beats a second." },
          { q: "In Indian music, a slow tempo (laya) is called...", options: [{ text: "Vilambit", right: true }, { text: "Drut", why: "Drut is fast. Vilambit is slow, madhya medium, drut fast." }], why: "Vilambit slow, madhya medium, drut fast. The exact speeds are disputed; the names are not." },
        ] },
      { id: "clap", kind: "beat", title: "Clap with the click", intro: "Tap exactly with each click. When you are exactly together, the click \"disappears\" under your tap.", bpm: 60, beats: 8 },
      { id: "lines", kind: "rhythm", title: "Read a rhythm", intro: "Each space is one beat. \"S\" is one beat; \"S -\" is held for two; \"SS\" is two notes in one beat; \"_\" is a beat of silence.",
        bpm: 60, lines: ["S S S S S S S S", "S - S - S - S -", "SS SS SS SS S S S S", "S _ S _ SS _ S -"] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 2 complete", next: "Finish Day 2",
        make: dayReward(d => [
          [d.sound && d.sound.found ? "Found the sweet spot three times" : "Searched for the sweet spot", !!d.sound],
          [d.hold && d.hold.passed ? "Held Sa for two seconds" : "Tried to hold Sa", !!d.hold],
          [d.hum && d.hum.matched ? "Hummed Sa from memory" : "Hummed with the drone", !!d.hum],
          ["Clapped with the metronome", !!d.clap],
          ["Read your first rhythms", !!d.lines],
        ], { title: "Your first recording", text: "Tomorrow you record your Sa, and learn to listen like a teacher.", notes: [0, 0, 0, 0] }) },
    ] },
  ],
  finish(d, { first }) {
    const note = "Day 2 lesson. Sa found: " + (d.sound && d.sound.found ? "yes" : "not yet") + ". 2-s hold: " + (d.hold && d.hold.passed ? "yes" : "not yet") + ". Hum: " + (d.hum && d.hum.matched ? "on Sa" : "-") + ". Rhythm lines: " + (d.lines ? d.lines.lines.join(", ") : "-") + ".";
    return finishDay(2, "m2", 30, note, first);
  },
};
