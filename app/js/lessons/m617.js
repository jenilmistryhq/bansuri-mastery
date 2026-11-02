// Day 617 as a lesson: "A full raga presentation", the course's last lesson. From L37 (the
// presentation as a story; an energy map that rises in waves; jod and jhala on bansuri;
// vilambit laya; similar ragas: Bhupali and Deshkar, Khamaj and Des; an original work; a
// self-designed 4-week plan; circular breathing, optional and Disputed; lifelong habits).
import { dayReward, finishDay } from "./common.js";

const SECTIONS = ["Alap", "Jod", "Jhala", "Vilambit gat", "Drut gat and taans", "Ending"];

export const M617 = {
  id: "m617",
  day: 617,
  title: "A full raga presentation",
  minutes: 50,
  chapters: [
    { title: "A story in sections", steps: [
      { id: "order", kind: "order", title: "The whole arc", intro: "The question changes from \"Can I play this?\" to \"What do I want to say, over 20-30 minutes?\" Put a full presentation in order:",
        items: SECTIONS.map(label => ({ label })),
        prompt: "From introducing the world to the climax and resolution.", done: "Alap, jod, jhala, vilambit gat, drut gat with taans, the ending. Fact: many bansuri concerts present alap, jod, jhala, then one or two gats; shorter recitals may skip the vilambit." },
      { id: "energy", kind: "energy", title: "Draw its energy", intro: "Give each section an energy level, 1 calm to 5 peak. A good plan rises in waves, not in a straight line.", sections: SECTIONS },
    ] },
    { title: "Jod, jhala, vilambit", steps: [
      { id: "jod", kind: "quiz", title: "Jod and jhala on bansuri", intro: "Jod: alap-like phrases on a steady pulse (60-80 BPM, no taal), with more repeated notes. Jhala: a melody note alternating with repeated Sa, fast, with double tonguing.",
        questions: [
          { q: "How is jhala made on bansuri?", options: [{ text: "Fast repeated-note patterns around Sa, tongued or with breath", right: true }, { text: "By playing the alap faster", why: "Jhala is its own texture: a melody note, then Sa repeated, again and again: G S S S R S S S." }], why: "GSSS RSSS GSSS PSSS: four notes a beat, double tonguing (L13)." },
        ] },
      { id: "jhala", kind: "phrase", title: "A jhala pattern, slowly", intro: "The melody notes against Sa: G S R S G S P S. Tongue each note; speed comes over weeks.", phrase: [4, 0, 2, 0, 4, 0, 7, 0], giveUp: 90 },
      { id: "vilambit", kind: "clapwave", taal: "teentaal", bpm: 36, cycles: 2, title: "Vilambit teentaal", intro: "Slow teentaal is hard because every beat is long. Count four inside each beat, \"1-and-a-uh\", and arrive on sam exactly." },
    ] },
    { title: "Close relatives", steps: [
      { id: "pairs", kind: "nyas", title: "Which raga?", intro: "Similar ragas are told apart by their phrases. Bhupali and Deshkar share S R G P D: Bhupali leans low and on Ga (G R S .D), Deshkar high and on Dha (G P D - P). Khamaj skips Re going up and leans on Ga; Des leans on Re and Pa (R m P N S').",
        rounds: [
          { phrase: [[4, 0.5], [2, 0.5], [0, 0.5], [-3, 1.6]], options: ["Bhupali", "Deshkar"], answer: "Bhupali", why: "G R S .D: the cadence down to Sa and lower Dha, Bhupali's lower half." },
          { phrase: [[4, 0.5], [7, 0.5], [9, 1.6], [7, 0.9]], options: ["Bhupali", "Deshkar"], answer: "Deshkar", why: "G P D - P: resting high on Dha, Deshkar's vadi." },
          { phrase: [[2, 0.5], [5, 0.5], [7, 0.5], [11, 0.5], [12, 1.6]], options: ["Khamaj", "Des"], answer: "Des", why: "R m P N S': Des's characteristic climb." },
          { phrase: [[0, 0.5], [4, 1.2], [5, 0.5], [7, 1.2]], options: ["Khamaj", "Des"], answer: "Khamaj", why: "S G m P: Re skipped going up, Ga emphasised: Khamaj." },
        ] },
    ] },
    { title: "Your own way on", steps: [
      { id: "plan", kind: "plan", title: "Design a 4-week plan", intro: "For any new goal: a new raga, a hard song, faster taans. Write it now; follow it; review it after 4 weeks: what worked, what to change.",
        fields: [
          { key: "goal", label: "Goal (measurable), by when", hint: "e.g. Bhimpalasi alap, 5 minutes, by 1 March" },
          { key: "test", label: "The test at the end", hint: "e.g. recorded, rubric 3+ on every line" },
          { key: "weeks", label: "Week 1 learn, 2 build, 3 apply, 4 perform", hint: "What each week is for" },
          { key: "risk", label: "Risks and fallback", hint: "e.g. if I miss days, cut the goal to 3 minutes" },
        ], required: ["goal", "test"], after: "Daily session: 5 warm-up, 10 tone, 20 goal work, 15 repertoire review, 10 listening. Review older material on days 1, 3, 7, 14 and 30." },
      { id: "breath", kind: "quiz", title: "Circular breathing (optional)", intro: "Breathing in through the nose while air stored in the cheeks keeps the sound going.",
        questions: [
          { q: "Do you need it to play Hindustani bansuri well?", options: [{ text: "No: many great players never rely on it", right: true }, { text: "Yes: every professional uses it", why: "Disputed, and rarely central: phrasing with natural breaths is considered part of the music." }], why: "If you want it: practise first with a straw in water, away from the flute. Stop if you feel dizzy." },
        ] },
      { id: "habits", kind: "quiz", title: "For the rest of your life", intro: "The final skills are habits: listening with purpose, recording yourself, a teacher's periodic check, one new raga, song and composition a season, teaching others, playing with others.",
        questions: [
          { q: "You are advanced now. Do you still need a teacher?", options: [{ text: "Yes, for periodic checks", right: true }, { text: "No, the app is enough", why: "This app hears pitch and timing, not musicianship. A teacher or mentor hears what no table shows." }], why: "Explaining to others is a powerful test of your own understanding." },
        ] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "The course is complete", next: "Finish Day 617",
        make: dayReward(d => [
          ["Know the sections of a presentation", !!d.order],
          [d.energy && d.energy.good ? "Drew an energy map that rises in waves" : "Drew an energy map", !!d.energy],
          ["Played a jhala pattern", !!d.jhala],
          ["Kept vilambit teentaal", !!d.vilambit],
          [d.pairs ? "Told " + d.pairs.right + " of " + d.pairs.of + " similar ragas apart first time" : "Compared similar ragas", !!d.pairs],
          ["Wrote your own 4-week plan", !!d.plan],
        ], { when: "From here", title: "Your own path", text: "Choose your next goal, follow your plan, and keep listening, recording and playing with others.", notes: [-1, 2, 4, 6, 9, 11, 12, 11, 9, 7, 6, 4, 2, 0] }) },
    ] },
  ],
  finish(d, { first }) {
    return finishDay(617, "m617", 50, "Day 617 lesson. The course's last lesson." + (d.plan && d.plan.goal ? " Next goal: " + d.plan.goal.trim() + "." : ""), first);
  },
};
