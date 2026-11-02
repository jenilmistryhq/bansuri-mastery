// Day 407 as a lesson: "Bandish, taans and tihai". From L32 (Rupak, Jhaptaal and Ektaal; the
// course's own Bhupali bandish in teentaal, starting on beat 13 so the mukhda leads into sam;
// layakari; a sapaat taan returning to the mukhda; tihai mathematics, including landing on the
// mukhda; playing a tihai).
import { dayReward, finishDay } from "./common.js";

const TAAN = [0, 2, 4, 7, 9, 12, 9, 7, 4, 2, 0, -3];

export const M407 = {
  id: "m407",
  day: 407,
  title: "Bandish, taans and tihai",
  minutes: 45,
  chapters: [
    { title: "Three more taals", steps: [
      { id: "rupak", kind: "clapwave", taal: "rupak", bpm: 70, cycles: 3, title: "Rupak: 7 beats", intro: "3 + 2 + 2. Rupak is unusual: its first beat is khali, shown with a wave, not a clap. Theka: Tin Tin Na | Dhi Na | Dhi Na." },
      { id: "jhap", kind: "clapwave", taal: "jhaptaal", bpm: 70, cycles: 3, title: "Jhaptaal: 10 beats", intro: "2 + 3 + 2 + 3, marks X 2 0 3. Theka: Dhi Na | Dhi Dhi Na | Ti Na | Dhi Dhi Na." },
      { id: "ek", kind: "clapwave", taal: "ektaal", bpm: 70, cycles: 2, title: "Ektaal: 12 beats", intro: "Six vibhags of 2, marks X 0 2 0 3 4. Thekas vary slightly between gharanas." },
    ] },
    { title: "The bandish", steps: [
      { id: "bandish", kind: "quiz", title: "A composition", intro: "A bandish (gat on an instrument) is a fixed composition in a raga and taal: the sthayi in the lower range, the antara higher. Its opening phrase, the mukhda, is home: you return to it after every taan.",
        questions: [
          { q: "This course's Bhupali bandish starts on beat 13 of teentaal. Why?", options: [{ text: "So the mukhda G R S R leads into G on sam", right: true }, { text: "It is a mistake: start on beat 1", why: "Starting on beat 1 is the common mistake. Many compositions start before sam, so the mukhda leads into it." }], why: "Count \"13, 14, 15, 16, sam\" out loud before you play." },
        ] },
      { id: "mukhda", kind: "phrase", title: "The mukhda into sam", intro: "Beats 13-16, then sam: G R S R | G. Play it, landing firmly on G. Ten times a day, each with the loop.", phrase: [4, 2, 0, 2, 4], giveUp: 90 },
      { id: "sthayi", kind: "phrase", title: "The sthayi's first line", intro: "(3) G R S R | (X) G - P G | (2) D P G R | (0) S R G P | (3) D - S'. Slowly, the held notes held.", phrase: [4, 2, 0, 2, 4, 7, 4, 9, 7, 4, 2, 0, 2, 4, 7, 9, 12], giveUp: 150 },
    ] },
    { title: "Layakari and taans", steps: [
      { id: "laya", kind: "quiz", title: "Layakari", intro: "Laya is tempo. Layakari: playing at multiples of it while the taal stays the same. Barabar 1 note a beat, dugun 2, tigun 3, chaugun 4.",
        questions: [
          { q: "In tigun, how many notes fill one teentaal cycle?", options: [{ text: "48: 3 a beat for 16 beats", right: true }, { text: "32", why: "32 is dugun: 2 a beat. Tigun is 3 a beat: 48." }], why: "Count \"1-la-li, 2-la-li...\" to feel three a beat." },
          { q: "Your taan speeds up as it goes. What helps?", options: [{ text: "A metronome ladder: 3 clean in a row, then +4 BPM", right: true }, { text: "Play it faster until it feels natural", why: "Speed without evenness rushes more. A slower, even taan sounds better than a fast, uneven one." }], why: "When you fail twice in a row, go back 8 BPM and stop for today." },
        ] },
      { id: "taan", kind: "phrase", title: "A sapaat taan", intro: "A straight run in the raga: S R G P D S' D P G R S .D, then the mukhda. Today slowly, every note clear; it becomes dugun later.", phrase: TAAN, giveUp: 120 },
    ] },
    { title: "Tihai", steps: [
      { id: "tihai", kind: "tihai", bpm: 90, title: "Land on sam", intro: "A tihai plays one phrase three times, ending exactly on sam. Total = 3 x phrase + 2 x gap. To end on the next sam (beat 17), start on 18 - total. Tap a start beat and listen.",
        rounds: [
          { phrase: [4, 2, 0], gap: 1, why: "G R S - G R S - G R S: the last S is sam." },
          { phrase: [9, 7, 4, 2, 0], gap: 0, why: "Five beats, no gap: 15 beats, so it starts on beat 3." },
          { phrase: [2, 0], gap: 1, why: "Phrases on 10-11, 13-14 and 16-17." },
          { phrase: [4, 2, 0], gap: 1, land: 13, why: "To land where the mukhda starts, beat 13: start = 14 - total." },
        ] },
      { id: "math", kind: "quiz", title: "Without the grid", intro: "Work it out before you play.",
        questions: [
          { q: "A 3-beat phrase with a 2-beat gap. Start beat?", options: [{ text: "Beat 5", right: true }, { text: "Beat 7", why: "Beat 7 fits a 1-beat gap. With 2: total = 9 + 4 = 13; 18 - 13 = 5." }], why: "Phrases on 5-7, 10-12 and 15-17." },
          { q: "A 4-beat phrase, no gap. Start beat?", options: [{ text: "Beat 6", right: true }, { text: "Beat 4", why: "Total = 3 x 4 = 12; 18 - 12 = 6." }], why: "Phrases on 6-9, 10-13 and 14-17." },
        ] },
      { id: "play", kind: "phrase", title: "Play a tihai", intro: "G R S, rest, G R S, rest, G R S: the last S on sam. With a teentaal loop, start on beat 7.", phrase: [4, 2, 0, 4, 2, 0, 4, 2, 0], giveUp: 90 },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 407 complete", next: "Finish Day 407",
        make: dayReward(d => [
          ["Clapped Rupak, Jhaptaal and Ektaal", !!(d.rupak && d.jhap && d.ek)],
          ["Know where the bandish starts", !!d.bandish],
          [d.mukhda && d.mukhda.passed ? "Played the mukhda into sam" : "Worked on the mukhda", !!d.mukhda],
          [d.taan && d.taan.passed ? "Played a sapaat taan" : "Worked on a taan", !!d.taan],
          [d.tihai ? "Landed " + d.tihai.right + " of " + d.tihai.of + " tihais first time" : "Landed tihais", !!d.tihai],
          ["Work out a tihai's start", !!d.math],
        ], { when: "Next", title: "Alap and swar vistar", text: "On Day 408: the slow, free opening of a raga, one note at a time.", notes: [0, -3, 0, 2, 0, 2, 4, 2, 0] }) },
    ] },
  ],
  finish(d, { first }) {
    return finishDay(407, "m407", 45, "Day 407 lesson. Tihais: " + (d.tihai ? d.tihai.right + "/" + d.tihai.of : "-") + "; mukhda: " + (d.mukhda && d.mukhda.passed ? "played" : "practised") + ".", first);
  },
};
