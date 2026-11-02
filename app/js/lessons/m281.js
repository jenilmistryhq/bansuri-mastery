// Day 281 as a lesson: "Performing". From L35 (nerves: prepare so 80% of your best is still good;
// interpretation; standing posture; memorise in layers; the stress test; mock performances that
// never stop; a pre-performance routine; a recovery plan; the audience ladder; programme order)
// and L08 (the rubric).
import { dayReward, finishDay } from "./common.js";

const N = { ".D": -3, S: 0, R: 2, G: 4, P: 7, D: 9, "S'": 12 };
const notes = text => text.split(/[\s|,]+/).filter(x => N[x] !== undefined).map(x => N[x]);

export const M281 = {
  id: "m281",
  day: 281,
  title: "Performing",
  minutes: 40,
  chapters: [
    { title: "Nerves", steps: [
      { id: "nerves", kind: "quiz", title: "Everyone plays worse in front of people", intro: "Fact: adrenaline makes hands shake, breath shallow and tempo rush.",
        questions: [
          { q: "So what is the goal?", options: [{ text: "Prepare so well that 80% of your best is still good", right: true }, { text: "Feel no nerves at all", why: "Almost everyone feels them. The solution is preparation, not the absence of nerves." }], why: "Then a nervous performance is still a good one (L35)." },
          { q: "Interpretation means...", options: [{ text: "Deciding how it should sound: where phrases rise and fall, what matters, where to slow, where to leave silence", right: true }, { text: "Playing every note correctly", why: "Correct notes are the starting point, not the goal." }], why: "Decide the shape before you perform it." },
        ] },
      { id: "stand", kind: "timer", title: "Stand to play", intro: "Feet hip-width apart, weight balanced, knees soft, spine tall, shoulders relaxed, flute level, elbows a little away from the body. Three minutes standing in every session for two weeks before a performance; here, one.", seconds: 60, start: "Start 60 seconds",
        checks: ["My knees stayed soft, not locked", "My shoulders stayed relaxed", "The flute stayed level"] },
    ] },
    { title: "Memory", steps: [
      { id: "layers", kind: "order", title: "Memorise in layers", intro: "Each layer makes the next one stronger. Put them in order:",
        items: [{ label: "Ear" }, { label: "Notation" }, { label: "Fingers" }, { label: "Structure" }, { label: "Stress test" }],
        prompt: "Tap them in order.", done: "Sing it without the flute; write it from memory; play it slowly with eyes closed; know the sections and mark 4 starting points; then let someone call a starting point." },
      { id: "start1", kind: "phrase", title: "Stress test: from the start", intro: "Your Bhupali composition (Day 141). Start immediately: G G R S | .D S R G", phrase: notes("G G R S .D S R G"), giveUp: 120 },
      { id: "start2", drill: { intro: "Your Bhupali composition (Day 141), from the third bar, at once, no run-up: P G D P | G R S -" }, kind: "phrase", title: "Stress test: from the middle", intro: "Now from the third bar, at once, no run-up: P G D P | G R S -", phrase: notes("P G D P G R S"), giveUp: 120 },
    ] },
    { title: "A mock performance", steps: [
      { id: "mock", kind: "record", title: "Play it as if it were real", intro: "Announce the piece first. Then play your Bhupali composition, or any piece you know. The rule: never stop. A mistake? Keep going, and rejoin at the next beat or phrase.", seconds: 40, day: 281, label: "Day 281: mock performance" },
      { id: "score", kind: "rubric", title: "Score it with the rubric", intro: "Listen once all the way through, like an audience. Then score each category, and note only the most important fix.",
        cats: [
          { key: "T", name: "Tone", levels: ["Mostly air; notes fail or crack", "Airy or unsteady; frequent wobble", "Clear and steady; occasional weak note", "Clear, full and even everywhere"] },
          { key: "P", name: "Pitch", levels: ["Many notes clearly off", "Several noticeably out of tune", "Nearly all within 15-20 cents", "Locked with the drone"] },
          { key: "R", name: "Rhythm", levels: ["The pulse is lost; stops and restarts", "Speeds up or slows; uneven", "Steady; small drifts recovered", "Rock-steady and natural"] },
          { key: "Tr", name: "Transitions", levels: ["Frequent blips, squeaks, leaks", "Correct notes, unclean changes", "Clean changes; an occasional blip", "Every change clean at tempo"] },
          { key: "E", name: "Expression", levels: ["No shape", "Some shape; odd breaths", "Clear phrases, sensible breaths", "Musical, communicative phrasing"] },
        ],
        keeps: ["I never stopped", "Clear tone", "Steady pulse", "Shaped phrases", "Calm start"],
        fixes: ["I stopped after a mistake", "Rushed when nervous", "Shaky tone", "Breaths in odd places", "Memory slip"] },
    ] },
    { title: "Plans", steps: [
      { id: "recover", kind: "quiz", title: "A recovery plan", intro: "Decide in advance what you do.",
        questions: [
          { q: "A note cracks.", options: [{ text: "Continue; do not repeat it", right: true }, { text: "Stop and play it again", why: "Repeating it shows the audience the mistake twice. Keep going." }], why: "The audience remembers the music, not one note." },
          { q: "Your memory slips.", options: [{ text: "Jump to the next starting point you marked", right: true }, { text: "Start the piece again", why: "That is what the 4 marked starting points are for." }], why: "Memorise in layers, and mark starting points." },
          { q: "The flute goes flat when cold.", options: [{ text: "Warm it under your arm or with gentle breath before playing", right: true }, { text: "Blow harder", why: "Harder air makes the tone harsh. Warm the bamboo first." }], why: "And keep water nearby for a dry mouth." },
        ] },
      { id: "programme", kind: "order", title: "Programme order", intro: "Three pieces for a small audience. Which order?",
        items: [{ label: "An easy piece" }, { label: "The hardest piece" }, { label: "One you love" }],
        prompt: "Tap them in order.", done: "Start with confidence, put the most demanding piece in the middle, end with something you love playing." },
      { id: "ladder", kind: "quiz", title: "Build the audience", intro: "Grow the audience step by step.",
        questions: [{ q: "Your first real audience should be...", options: [{ text: "One family member, one piece", right: true }, { text: "A formal recital", why: "That is the last step (Milestone M10). Start with one listener." }], why: "One person, then family and friends (M7), then online, a community event (M9), then a recital (M10)." }] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 281 complete", next: "Finish Day 281",
        make: dayReward(d => [
          ["Know the goal: 80% of your best is still good", !!d.nerves],
          ["Stood to play", !!d.stand],
          ["Started from any point", !!(d.start1 && d.start2)],
          [d.mock && d.mock.saved ? "Recorded a mock performance" : "Planned a mock performance", !!d.mock],
          [d.score && d.score.fix ? "One fix: " + d.score.fix : "Scored it with the rubric", !!d.score],
          ["Have a recovery plan", !!d.recover],
        ], { when: "Next", title: "Phase 4: komal swaras", text: "On Day 309: all 12 notes, and the ragas they open.", notes: [0, 1, 3, 5, 7, 8, 10, 12] }) },
    ] },
  ],
  finish(d, { first }) {
    const sc = d.score && d.score.scores ? Object.entries(d.score.scores).map(([k, v]) => k + v).join(" ") : "-";
    return finishDay(281, "m281", 40, "Day 281 lesson. Mock performance " + (d.mock && d.mock.saved ? "recorded" : "-") + "; rubric " + sc + "; fix: " + ((d.score && d.score.fix) || "-") + ".", first);
  },
};
