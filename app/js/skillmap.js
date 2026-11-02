// The Skills place (#/skills): five abilities, each with its tool, its games, its fixes and the
// learner's latest measure. Everything listed here already exists elsewhere in the app; this map only
// says which skill it trains, so each thing has one home and the hubs can link to it.
import { getState } from "./state.js";
import { bestHold } from "./livestats.js";

// Games by key (the #/play/<key> address), with the words the games list already uses.
export const GAME_INFO = {
  steer: ["Steer by pitch", "Fly a bird through gates by playing their notes."],
  balloon: ["Balloon", "Hold the note in tune to blow up the balloon. Pop as many as you can."],
  falling: ["Falling notes", "A song's notes fall in time: play each as it lands."],
  jam: ["Jam with the band", "Tanpura and tabla in a raga: improvise, and the app keeps you in the raga."],
  boat: ["Long-breath boat", "Sail while you hold one long, steady note; in tune, it sails twice as fast."],
  road: ["Glide road", "Keep your pitch on a road that holds and glides between notes (meend)."],
  lanterns: ["Light the lanterns", "Play a lantern's note to light it before it fades."],
  bullseye: ["Bullseye", "Hold a note: the arrow lands as far from the centre as you are out of tune."],
  floors: ["Three floors", "A lift between the octaves: play the note on the floor shown."],
  wrong: ["Spot the wrong note", "A phrase plays twice with one note changed. Which one? (no microphone)"],
  bingo: ["Sargam bingo", "Notes play over the drone: mark them on your card. (no microphone)"],
  higherlower: ["Higher or lower", "Is the second note higher, lower or the same? (no microphone)"],
  sam: ["Catch the sam", "Tap on beat 1 of each cycle of the taal, even when it is not stressed. (no microphone)"],
  meendbridge: ["Meend bridge", "Six glides between notes: no step, no break, landing on the note."],
  kanflick: ["Kan flick", "A flick of the grace note before each note; clean kans build a streak."],
  murkichase: ["Murki chase", "Quick turns of notes; each clean murki makes the next one faster."],
  andolanlamp: ["Andolan lamp", "Swing komal Re, Ga or Dha slowly below its place and back."],
  swell: ["Swell and fade", "Louder, then softer, on one note, without the pitch moving."],
  tongue: ["Tongued beats", "Tongue a short Sa on every beat of the metronome, evenly."],
  phrase: ["Raga phrases", "Ornaments inside a raga's own phrases: Bhairav's andolan, Bhimpalasi's meend and kan, and more."],
  taar: ["Taar saptak", "Hold the upper octave steady, clear and in tune: S', R', G', m'."],
  laya: ["Laya ladder", "Over the theka: one note a beat, then two (dugun), then three (tigun)."],
  tihai: ["Tihai", "A phrase three times, so its last note lands on sam."],
  nameorn: ["Name the ornament", "Hear a phrase: meend, kan, murki, andolan or a plain note? (no microphone)"],
};

// The twelve troubleshooting guides, in the learner's words.
export const FIX_INFO = {
  "TS-01": "No sound, or an airy tone",
  "TS-02": "Squeaks and the wrong octave",
  "TS-03": "Low notes won't sound",
  "TS-04": "High notes",
  "TS-05": "Out of tune",
  "TS-06": "Finger leaks and transitions",
  "TS-07": "Breath, dizziness and endurance",
  "TS-08": "Pain and tension",
  "TS-09": "Rhythm and tempo",
  "TS-10": "Ear and memory",
  "TS-11": "Plateaus and motivation",
  "TS-12": "Flute damage and care",
};

// Each guide's course page (bansuri-mastery/troubleshooting/).
export const FIX_FILE = {
  "TS-01": "TS-01-no-sound-or-airy-tone.md", "TS-02": "TS-02-squeaks-and-wrong-octave.md", "TS-03": "TS-03-low-notes-wont-sound.md",
  "TS-04": "TS-04-high-notes.md", "TS-05": "TS-05-pitch-out-of-tune.md", "TS-06": "TS-06-finger-leaks-and-transitions.md",
  "TS-07": "TS-07-breath-dizziness-and-endurance.md", "TS-08": "TS-08-body-pain-and-tension.md", "TS-09": "TS-09-rhythm-and-tempo.md",
  "TS-10": "TS-10-ear-and-memory.md", "TS-11": "TS-11-practice-plateaus-and-motivation.md", "TS-12": "TS-12-flute-damage-and-care.md",
};

const last = list => (list && list.length ? list[list.length - 1] : null);

// Each skill: the section tab's id and label, its full name, the latest measure (or null), the tools
// that train it, its games (home here), games shown here but at home in another skill, and its fixes.
export const SKILLS = [
  {
    id: "tone", tab: "Tone", title: "Tone and breath",
    latest: () => {
      const sa = bestHold(0), any = bestHold(null);
      if (sa) return { text: "Sa held {n} s".replace("{n}", Math.round(sa)), label: "Longest steady Sa" };
      if (any) return { text: "{n} s".replace("{n}", Math.round(any)), label: "Longest steady note" };
      return null;
    },
    train: [["Long tones", "#/bench/tones", "Hold each note with live feedback on pitch and steadiness."], ["Tone check", "#/tone", "Hold one note: the app says what it hears and which fix to try."]],
    games: ["balloon", "boat", "swell", "taar"], also: [],
    fixes: ["TS-01", "TS-02", "TS-03", "TS-04", "TS-07"],
    more: [["Good tone, step by step", "#/music/listen"]],
  },
  {
    id: "notes", tab: "Notes", title: "Notes and tuning",
    latest: () => {
      const p = last(getState().live.plays);
      return p ? { text: "{n}% of notes right".replace("{n}", Math.round(p.ok / p.n * 100)), label: "Latest play-along" } : null;
    },
    train: [["Tuner: which note, how many cents", "#/bench/check", "Play any note and see it, with how far it is from true."], ["Fingering chart", "#/bench/chart", "Tap a note to see its holes and hear it."]],
    games: ["steer", "bullseye", "lanterns", "floors", "road"], also: [],
    fixes: ["TS-05", "TS-06"],
    more: [],
  },
  {
    id: "rhythm", tab: "Rhythm", title: "Rhythm",
    latest: () => {
      const t = last(getState().live.taps);
      return t ? { text: "{n}% on the beat".replace("{n}", Math.round(t.within * 100)), label: "Latest tap the beat" } : null;
    },
    train: [["Tala and drone, tap the beat", "#/bench/rhythm", "Teentaal and other taals on tabla, and a test of how evenly you keep the beat."]],
    games: ["tongue", "laya", "tihai", "sam"], also: [],
    fixes: ["TS-09"],
    more: [],
  },
  {
    id: "ornaments", tab: "Ornaments", title: "Ornaments",
    latest: () => null,
    train: [["Ornament trainer", "#/ornaments", "Meend, kan, murki and andolan: hear them slowly, then play against the target curve."]],
    games: ["meendbridge", "kanflick", "murkichase", "andolanlamp"], also: ["road", "nameorn", "phrase"],
    fixes: [],
    more: [],
  },
  {
    id: "ear", tab: "Ear", title: "Ear",
    latest: () => {
      const all = Object.values(getState().live.echo || {});
      const right = all.reduce((a, e) => a + e.right, 0), total = all.reduce((a, e) => a + e.total, 0);
      return total ? { text: "{n} of {m} right".replace("{n}", right).replace("{m}", total), label: "Play it back" } : null;
    },
    train: [["Ear quiz", "#/bench/ear", "Hear a note over the drone and name it."], ["Play it back", "#/bench/echo", "Hear a short phrase, then play it back on your flute."]],
    games: ["higherlower", "wrong", "bingo", "nameorn"], also: [],
    fixes: ["TS-10"],
    more: [],
  },
];

// Games that are at home in Music (pieces, not one skill), listed with the rest under Games.
export const MUSIC_GAMES = ["falling", "jam", "phrase"];

export function skillById(id) { return SKILLS.find(s => s.id === id) || null; }
