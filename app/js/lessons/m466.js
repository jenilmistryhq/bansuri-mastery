// Day 466 as a lesson: "Accompaniment". From L34 (the three rules of an accompanist; machines
// first; harmonium key names, a commonly used mapping to confirm with the musician; the four
// roles; fills only in the gaps; duets: Sa, tempo, structure, cues, balance; agreeing with a
// tabla player; harmony in parallel thirds, optional).
import { dayReward, finishDay } from "./common.js";

export const M466 = {
  id: "m466",
  day: 466,
  title: "Accompaniment",
  minutes: 35,
  chapters: [
    { title: "Listen more than you play", steps: [
      { id: "rules", kind: "order", title: "The accompanist's three rules", intro: "Playing with others is a different skill from playing alone. Put the rules in order of importance:",
        items: [{ label: "Same Sa, same pulse" }, { label: "The soloist leads" }, { label: "Leave space" }],
        prompt: "Nothing else matters if the first is wrong.", done: "Same Sa and pulse; follow the soloist's tempo and phrasing; fill gaps, not everything. Silence is a valid accompaniment." },
      { id: "keys", kind: "quiz", title: "\"Which key?\"", intro: "Singers and harmonium players often name keys by harmonium keys: safed (white) and kali (black), counted from C. A commonly used mapping; always confirm by playing Sa together.",
        questions: [
          { q: "The singer says \"safed 5\". Their Sa is G. On your C flute?", options: [{ text: "Use Pa as Sa", right: true }, { text: "Play as usual", why: "Your Sa is C. G is your Pa: play with Pa as Sa (L26)." }], why: "Safed 1 is C, safed 5 is G." },
          { q: "\"Kali 3\" is F#. What can you do live?", options: [{ text: "Ask whether another key is possible, or use another flute", right: true }, { text: "Pitch-shift the singer", why: "Pitch-shifting works on recordings, not on a live singer. F# as Sa needs many half-holes on your flute." }], why: "Not everyone counts keys this way: confirm with the musician." },
        ] },
    ] },
    { title: "Fills", steps: [
      { id: "roles", kind: "quiz", title: "Four roles", intro: "Introduction (before the singer starts), fill (gaps between lines), interlude (instrumental breaks), shadow (rarely: long soft notes under the voice).",
        questions: [
          { q: "When does a fill start and stop?", options: [{ text: "After the singer finishes a line; before the next one starts", right: true }, { text: "Whenever there is a long note", why: "A long sung note is still the singer's line. Wait for the line to end." }], why: "Leave a breath of silence before the singer starts again, and play softer than them." },
        ] },
      { id: "fills", kind: "fills", bpm: 72, gap: 4, title: "Play in the gaps", intro: "The singer's four lines play on a second flute voice. In each gap, a short fill: echo the last sung phrase, or a 2-4 beat answer. Stop before the next line. Headphones help.",
        lines: [[0, 2, 4, 4, 2, 0, 2, 2], [4, 7, 9, 7, 4, 2, 4, 4], [7, 9, 12, 9, 7, 4, 2, 2], [4, 2, 0, 2, 4, 2, 0, 0]] },
    ] },
    { title: "Playing together", steps: [
      { id: "duet", kind: "quiz", title: "Duets and groups", intro: "Before playing: agree Sa (tune together on Sa and Pa), tempo (one person counts in) and structure. A nod to start, the flute raised for \"last time\", eye contact before the final note.",
        questions: [
          { q: "You cannot hear the other musician. What does that tell you?", options: [{ text: "You are too loud", right: true }, { text: "They should play louder", why: "If you cannot hear them, you are covering them. Balance starts with you." }], why: "Rehearse the ending until it is together." },
        ] },
      { id: "tabla", kind: "quiz", title: "With a tabla player", intro: "Return to the mukhda after each improvisation so the tabla player can follow you. In their solo, keep the lehra steady and do not speed up.",
        questions: [
          { q: "What do you agree before playing?", options: [{ text: "Taal and tempo, the start beat, and the ending", right: true }, { text: "Only the raga", why: "The tabla player needs the taal and tempo, where your composition starts, and the ending: usually a tihai on sam, then a final note." }], why: "Or play the mukhda for them first." },
        ] },
      { id: "thirds", kind: "complete", title: "Harmony in thirds (optional)", intro: "In Western or fusion settings: a second line a third above the melody, using the scale's notes. Melody S R G m P; harmony G m P D...",
        rounds: [{ seq: ["G", "m", "P", "D"], options: ["N", "S'", "D"], answer: "N", semis: [4, 5, 7, 9, 11], why: "P's third above is N: G m P D N." }] },
      { id: "harm", kind: "phrase", title: "Play the harmony", intro: "G m P D N: the line a third above S R G m P.", phrase: [4, 5, 7, 9, 11], giveUp: 90 },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 466 complete", next: "Finish Day 466",
        make: dayReward(d => [
          ["Know the accompanist's rules", !!d.rules],
          ["Can turn a key name into a Sa", !!d.keys],
          [d.fills ? d.fills.fills + " of " + d.fills.gaps + " gaps filled" + (d.fills.covered ? "" : ", never over the words") : "Played fills", !!d.fills],
          ["Know what to agree with others", !!(d.duet && d.tabla)],
          ["Found a harmony in thirds", !!d.thirds],
        ], { when: "Next", title: "Style adaptation", text: "On Day 467: the same tune as a bhajan, a film song and a folk dhun.", notes: [0, 2, 4, 7, 4, 2, 0] }) },
    ] },
  ],
  finish(d, { first }) {
    return finishDay(466, "m466", 35, "Day 466 lesson. Fills: " + (d.fills ? d.fills.fills + "/" + d.fills.gaps + " gaps, " + d.fills.covered + " lines covered" : "-") + ".", first);
  },
};
