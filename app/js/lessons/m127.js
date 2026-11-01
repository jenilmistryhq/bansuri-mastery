// Day 127 as a lesson: "What is a raga?". From L19 (a scale is a set of notes; a raga is notes
// plus rules and habits; aroh, avroh, varjit, jati, vadi, samvadi, pakad, nyas, thaat, time; the 10
// thaats and why Kalyan suits the bansuri; time and mood, Disputed; shruti; how to listen).
import { dayReward, finishDay } from "./common.js";

const BHUPALI_AROH = [0, 2, 4, 7, 9, 12];
const PAKAD = [4, 2, 0, -3, 0, 2, 4, null, 7, 4, 9, 7, 4, 2, 0];

export const M127 = {
  id: "m127",
  day: 127,
  title: "What is a raga?",
  minutes: 35,
  chapters: [
    { title: "More than a scale", steps: [
      { id: "person", kind: "quiz", title: "Same clothes, different people", intro: "A scale is just a set of notes. A raga is a set of notes plus rules and habits about how to use them: which notes to stress, which to touch lightly, which phrases are typical, which way to move.",
        questions: [
          { q: "Bhupali and Deshkar use exactly the same five notes. Are they the same raga?", options: [{ text: "No: same notes, different behaviour", right: true }, { text: "Yes: same notes means same raga", why: "Like two people in the same clothes: they walk, talk and behave differently." }], why: "The notes are the clothes; the raga is the person (L19)." },
          { q: "How is a raga mostly learned?", options: [{ text: "By listening", right: true }, { text: "From its rules in a book", why: "Many of a raga's rules cannot be written precisely: you learn them by ear." }], why: "Fact: a raga must be learned mostly by listening." },
        ] },
      { id: "notes", kind: "pick", title: "Which notes?", intro: "Here is Bhupali going up (its aroh). Which notes does it use? Tap them, then Check.", notes: [0, 2, 4, 7, 9], play: BHUPALI_AROH,
        why: "S R G P D: five notes. Ma and Ni are left out (varjit). Five notes up and five down: audav-audav." },
    ] },
    { title: "The words", steps: [
      { id: "terms", kind: "quiz", title: "A raga's vocabulary", intro: "Each word names one of the habits. Bhupali is the example.",
        questions: [
          { q: "The notes a raga leaves out are...", options: [{ text: "Varjit", right: true }, { text: "Vadi", why: "Vadi is the most important note. Varjit notes are omitted." }], why: "In Bhupali, Ma and Ni are varjit." },
          { q: "A raga of five notes going up is called...", options: [{ text: "Audav", right: true }, { text: "Sampurna", why: "Sampurna has all seven; shadav six; audav five." }], why: "Jati: audav 5, shadav 6, sampurna 7." },
          { q: "The most emphasised note, the vadi, of Bhupali is...", options: [{ text: "Ga", right: true }, { text: "Sa", why: "Sa is home in every raga; the vadi is the raga's own most stressed note. In Bhupali, Ga." }], why: "Its samvadi, the second most important, is Dha." },
          { q: "A short catch phrase that identifies the raga is its...", options: [{ text: "Pakad", right: true }, { text: "Chalan", why: "The chalan is the longer typical path. The pakad is the short catch phrase." }], why: "Notes where phrases rest are its nyas notes." },
        ] },
      { id: "pakad", kind: "listen", title: "Hear Bhupali's pakad", seq: PAKAD, prompt: "G R S .D S R G, P G D P G R S (versions vary). Which note does it keep leaning on?",
        options: [{ text: "Ga", right: true }, { text: "Ni" }, { text: "Ma" }],
        yes: "Yes: Ga, the vadi.", no: "Ni and Ma are not even in Bhupali.", explain: "The phrase circles Ga and comes home to Sa. Hear it a few times: soon one phrase is enough to name the raga." },
    ] },
    { title: "Families", steps: [
      { id: "thaat", kind: "quiz", title: "Ten parent scales", intro: "V. N. Bhatkhande grouped ragas into 10 thaats: seven-note scales written ascending, a filing system with no rules of their own.",
        questions: [
          { q: "With Sa = C on your flute, which thaat needs no half-holes at all?", options: [{ text: "Kalyan: S R G M P D N", right: true }, { text: "Bhairavi", why: "Bhairavi needs five half-holes. Kalyan uses only your plain fingerings, with tivra Ma." }], why: "That is why the course teaches Bhupali and Yaman first (L19)." },
          { q: "Does every raga fit one of the 10 thaats neatly?", options: [{ text: "No: some fit none, and some are placed differently by different authorities", right: true }, { text: "Yes, every raga has exactly one thaat", why: "Disputed: 32 such scales are possible; ragas such as Jaijaiwanti or Kirwani fit none neatly." }], why: "The thaat system is a convenience, not a law." },
        ] },
      { id: "time", kind: "quiz", title: "Time and mood", intro: "Many ragas are associated with a time of day or season, and with a mood (rasa).",
        questions: [{ q: "Yaman is an evening raga. Should you practise it only in the evening?", options: [{ text: "Know the tradition; practise any raga when you need to", right: true }, { text: "Never outside its time", why: "Sources disagree on exact times, and many recordings and concerts ignore them. Respect it in performance when practical." }], why: "Disputed: some treat time rules as aesthetic tradition, others as essential (L19)." }] },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 127 complete", next: "Finish Day 127",
        make: dayReward(d => [
          ["Know a raga from a scale", !!d.person],
          [d.notes && d.notes.ok ? "Found Bhupali's five notes" : "Looked for Bhupali's notes", !!d.notes],
          ["Know aroh, avroh, varjit, vadi and pakad", !!d.terms],
          ["Heard Bhupali's pakad", !!d.pakad],
          ["Know the thaats, and why Kalyan suits the bansuri", !!d.thaat],
        ], { when: "Next", title: "Raga Bhupali, and the upper octave", text: "On Day 141: your first raga, played, and notes above S'.", notes: PAKAD.filter(n => n !== null) }) },
    ] },
  ],
  finish(d, { first }) {
    return finishDay(127, "m127", 35, "Day 127 lesson. Raga vocabulary; Bhupali's notes " + (d.notes && d.notes.ok ? "found" : "-") + ".", first);
  },
};
