// Day 183 as a lesson: "Meend". From L23 (meend: a continuous glide through every pitch between
// two notes; gayaki ang; ornaments are grammar, so each has its place in a raga; slide the finger,
// do not lift it; only within one register; G~R, R~G, G~S; slow and quick meends; the arrival
// note gets the time).
import { dayReward, finishDay } from "./common.js";

const pts = f => { const out = []; for (let t = 0; t <= 2.4; t += 0.02) out.push({ t: Math.round(t * 100) / 100, semi: f(t) }); return out; };
const GLIDE = pts(t => (t < 0.5 ? 4 : t < 1.7 ? 4 - 2 * (0.5 - Math.cos(Math.PI * (t - 0.5) / 1.2) / 2) : 2));
const STEP = pts(t => (t < 1.1 ? 4 : 2));
const STEPPY = pts(t => (t < 0.5 ? 4 : t < 1.7 ? 4 - Math.floor((t - 0.5) / 0.3) * 0.5 : 2));
const opts = right => [
  { text: "A meend: a smooth glide", right: right === "glide", why: right === "glide" ? "Every pitch between Ga and Re, with no step and no break." : "Listen to the change: is it smooth all the way?" },
  { text: "Two notes, one after the other", right: right === "step", why: right === "step" ? "A plain change: Ga, then Re. No glide at all." : "Listen again: the pitch moves between them." },
  { text: "A glide with steps in it", right: right === "steppy", why: right === "steppy" ? "It slides, but in small jumps: the finger moved in bursts. Slower and more even." : "Listen closely: is the slide perfectly smooth?" },
];

export const M183 = {
  id: "m183",
  day: 183,
  title: "Meend",
  minutes: 35,
  chapters: [
    { title: "The glide", steps: [
      { id: "what", kind: "quiz", title: "Singing on a flute", intro: "Meend is a smooth, continuous slide from one note to another, through all the tiny pitches in between, like a singer's voice. It is the most characteristic sound of the bansuri in Hindustani music: the flute imitates the voice (gayaki ang).",
        questions: [
          { q: "In a raga, does it matter how you reach a note?", options: [{ text: "As much as which note: ornaments are grammar", right: true }, { text: "No: only the notes matter", why: "In Bhupali a gentle glide from Ga down to Re is typical; sliding through Ma there would break the raga." }], why: "Learn each ornament together with where it belongs (L23)." },
          { q: "Can you glide from M to P by sliding a finger?", options: [{ text: "No: they are in different registers", right: true }, { text: "Yes, slowly enough", why: "A glide that needs a register change cannot be made by sliding alone (Fact)." }], why: "Meend works between notes in the same register." },
        ] },
      { id: "ear", kind: "curves", title: "Glide or steps?", intro: "Ga to Re, played three ways. Listen and name each.",
        rounds: [
          { q: "Ga to Re: what do you hear?", curve: GLIDE, options: opts("glide") },
          { q: "Ga to Re: what do you hear?", curve: STEP, options: opts("step") },
          { q: "Ga to Re: what do you hear?", curve: STEPPY, options: opts("steppy") },
        ] },
      { id: "slide", kind: "halfhole", mode: "slide", open: 4, closed: 2, title: "Slide, do not lift", intro: "From Ga, finger 2 rests on the edge of hole 2. Slide it slowly across until the hole is covered: the pitch falls from Ga to Re through every point between. Take at least a second or two." },
    ] },
    { title: "On the flute", steps: [
      { id: "down", kind: "ornament", key: "meend", ex: { id: "ga-re", from: 4, to: 2, dur: 1.6 }, title: "G~R, down", intro: "Play Ga (XOO OOO). Over about 2 seconds slide finger 2 across hole 2, the air completely steady. Arrive on Re and hold it 2 seconds: Re must be in tune." },
      { id: "up", kind: "ornament", key: "meend", ex: { id: "re-ga", from: 2, to: 4, dur: 1.6 }, title: "R~G, up", intro: "Reverse it: from Re, slide finger 2 off hole 2, slowly. Upward meends are harder: the pitch tends to jump at the end. Go even slower near the end." },
      { id: "two", kind: "ornament", key: "meend", ex: { id: "ga-sa", from: 4, to: 0, dur: 2.2 }, title: "G~S, over two notes", intro: "Slide finger 2 on, then finger 3, in one continuous motion: from Ga through Re to Sa without steps. Steps at first are normal; they smooth out over weeks." },
    ] },
    { title: "Shape", steps: [
      { id: "shape", kind: "quiz", title: "Slow and quick", intro: "Meends come in many speeds.",
        questions: [
          { q: "A slow meend, 1-3 seconds, belongs mostly in...", options: [{ text: "Alap and bhajans", right: true }, { text: "Fast taans", why: "Fast passages use quick meends, a fraction of a beat. Slow ones belong in alap and bhajans." }], why: "Quick meends connect notes in compositions and songs." },
          { q: "Which note gets the time?", options: [{ text: "The arrival note", right: true }, { text: "The glide itself", why: "The glide is the journey; the arrival note gets the time." }], why: "Arrive, and stay (L23)." },
        ] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 183 complete", next: "Finish Day 183",
        make: dayReward(d => [
          ["Know why ornaments are grammar", !!d.what],
          ["Can hear a glide from steps", !!d.ear],
          ["Slid a hole closed, smoothly", !!d.slide],
          [d.down && d.down.passed === d.down.of ? "Played G~R cleanly" : "Practised G~R", !!d.down],
          [d.up && d.up.passed === d.up.of ? "Played R~G cleanly" : "Practised R~G", !!d.up],
          [d.two ? "Glided over two notes" : "Tried a two-note meend", !!d.two],
        ], { when: "Next", title: "Bhatkhande notation", text: "On Day 190: the way Indian music is written in books, and how to read it.", notes: [0, 2, 4, 2, 0] }) },
    ] },
  ],
  finish(d, { first }) {
    const r = x => (x ? x.passed + "/" + x.of : "-");
    return finishDay(183, "m183", 35, "Day 183 lesson. Meend checks: G~R " + r(d.down) + ", R~G " + r(d.up) + ", G~S " + r(d.two) + ".", first);
  },
};
