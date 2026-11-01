// Day 1 as a lesson: "Body, breath, first sound". From L02 (posture, hands, support points, the
// lightest seal, the tension scan), L03 (low breathing, the hiss), L04 (the first sound on Sa) and
// L05 part 1 (pitch). The day's pass: the flute held in position for 60 s with relaxed shoulders.
import { holdingSide, dayReward, finishDay } from "./common.js";

export const M1 = {
  id: "m1",
  day: 1,
  title: "Body, breath, first sound",
  minutes: 30,
  chapters: [
    { title: "Sit like a player", steps: [
      { id: "slump", kind: "choose", key: "slump", title: "Try this first",
        intro: "Slump in your chair and take the deepest breath you can. Now sit tall, as if a thread pulls the top of your head up, and breathe in again. Which filled more?",
        options: [
          { id: "tall", text: "Sitting tall", afterHead: "Yes.", after: "A slumped chest cannot fill with air. Good posture lets you breathe deeply, and it frees your fingers: hands busy gripping cannot move quickly or seal well." },
          { id: "slumped", text: "Slumped", afterHead: "Try it once more.", after: "Most people find the tall breath fills more: a slumped chest cannot fill with air. Good posture lets you breathe deeply, and it frees your fingers." },
          { id: "same", text: "No difference", afterHead: "Try it once more, slowly.", after: "Put a hand on your belly: sitting tall, it moves out further. A slumped chest cannot fill with air." },
        ] },
      { id: "sit", kind: "cards", title: "Your sitting posture", intro: "On a chair: near the front edge, feet flat, back off the backrest. On the floor: cross-legged on a firm cushion, hips a little above the knees. Then:",
        yes: "Done", no: "Not sure",
        items: [
          { id: "thread", title: "A thread pulls you up", text: "Imagine a thread gently pulling the top of your head upward.", fix: "Sit near the front of the chair: the backrest makes you lean back and slump." },
          { id: "shoulders", title: "Shoulders drop", text: "Let your shoulders drop and widen. Not raised, not pulled back stiffly.", fix: "Lift them to your ears, then let them fall. Where they land is right." },
          { id: "chin", title: "Chin level", text: "Neither tucked in nor lifted.", fix: "Look straight ahead at something at eye height." },
          { id: "belly", title: "Belly free", text: "Chest open, belly free to move. No tight belt.", fix: "Loosen the belt or waistband: the belly must move when you breathe." },
        ] },
      { id: "fingers", kind: "tapquiz", title: "Where do your fingers go?", intro: "The top hand (nearer your mouth) covers holes 1-3, the bottom hand holes 4-6: index, middle and ring fingers. Thumbs go underneath; little fingers rest lightly.",
        side: holdingSide,
        questions: [
          { q: "top hand, index finger", answer: "h1" },
          { q: "top hand, ring finger", answer: "h3" },
          { q: "bottom hand, index finger", answer: "h4" },
          { q: "bottom hand, middle finger", answer: "h5" },
          { q: "top hand, middle finger", answer: "h2" },
          { q: "bottom hand, ring finger", answer: "h6", why: "Use the pad, the soft part between the tip and the first joint: it is wider than the hole, so it seals." },
        ] },
      { id: "support", kind: "timer", title: "Three support points", intro: "Bring the flute to your lower lip, the blowing hole under it, holes facing up. Put your fingers on the holes, then lift all six. The flute should stay steady on three points: your lower lip and your two thumbs.",
        seconds: 15, start: "Start 15 seconds",
        checks: ["The flute stayed steady with all fingers lifted", "My thumbs are underneath, below the index or middle fingers"] },
      { id: "seal", kind: "timer", title: "The lightest seal", intro: "Close all six holes. Press as hard as you can for 2 seconds, then ease off until the fingers barely touch but still cover the holes. Hold that for 10 seconds, then look at your finger pads.",
        seconds: 12, start: "Start 12 seconds",
        checks: ["I found the lightest pressure that still covers the holes", "My finger pads show ring marks (a full ring means a full seal)"] },
      { id: "scan", kind: "cards", title: "Tension scan", intro: "Do this at the start of every session and halfway through. Go from top to bottom:",
        yes: "Relaxed", no: "Tense",
        items: [
          { id: "jaw", title: "Jaw", text: "Teeth slightly apart. No clenching.", fix: "Let the jaw hang for a breath, then close the lips softly with the teeth still apart." },
          { id: "neck", title: "Neck and shoulders", text: "The head floats; the shoulders drop. Raised shoulders are the most common fault.", fix: "Breathe out and let the shoulders sink with the breath." },
          { id: "elbows", title: "Elbows and wrists", text: "Elbows hang naturally, a little away from the body. Wrists fairly straight.", fix: "A strongly bent wrist causes strain: turn the flute, not the wrist." },
          { id: "grip", title: "Fingers", text: "Gently curved or flat. No white knuckles.", fix: "Remember the three support points: the fingers only cover the holes." },
        ] },
      { id: "minute", kind: "timer", title: "Today's goal: one relaxed minute", intro: "Hold the flute in playing position for 60 seconds, no blowing. Shoulders down, breathing calm. This is the test for Day 1.",
        seconds: 60, start: "Start 60 seconds",
        checks: ["My shoulders stayed relaxed the whole minute", "I did not grip the flute", "I breathed calmly"] },
    ] },
    { title: "Breathe low", steps: [
      { id: "breathe", kind: "breathe", title: "Low breathing", intro: "One hand on your belly, one on your upper chest. Follow the circle: the lower hand moves, the upper hand stays almost still, the shoulders do not rise.",
        inhale: 4, exhale: 6, rounds: 5, done: "Good. In your sessions you will do this 10 times." },
      { id: "hiss", kind: "hiss", title: "The hiss test", intro: "This trains steady air, the thing a flute needs most. After a low breath, hiss through slightly parted teeth, the same volume from start to end. Stop when you can no longer keep it even: do not squeeze out the last air.",
        target: 15 },
    ] },
    { title: "Your first sound", steps: [
      { id: "across", kind: "quiz", title: "Across, not into", intro: "One question before you blow.",
        questions: [
          { q: "Where does your air go when you play a bansuri?",
            options: [
              { text: "Across the blowing hole, like blowing over the top of a bottle", right: true },
              { text: "Into the hole, like a whistle", why: "Not into: a thin stream hits the far edge of the hole and splits, some into the flute, some over it." },
              { text: "Straight down onto the hole", why: "The air goes across the hole, to its far edge, where it splits." },
            ],
            why: "If you have an empty bottle, try it: rest the rim on your lower lip and blow gently across the top until it hoots. That is exactly the bansuri skill." },
          { q: "How much air?",
            options: [
              { text: "Less than you think: a gentle, steady 'pooh'", right: true },
              { text: "As much as you can, to make it loud", why: "Too much air makes a squeal, and makes you dizzy. A soft, clear note is the goal." },
            ],
            why: "Beginners almost always blow too much air, too fast (L03)." },
        ] },
      { id: "lips", kind: "cards", title: "The lip opening", intro: "Check each one; a mirror helps.", yes: "Done", no: "Not yet",
        items: [
          { id: "pu", title: "Say \"pu\"", text: "Relax your face, teeth slightly apart. Say \"pu\" softly: the lips make a small, flat, oval opening in the centre. Corners relaxed: no smile, no kiss.", fix: "Say \"pooh\" without rounding the lips much, and keep the corners soft." },
          { id: "palm", title: "The palm test", text: "Blow gently at your palm, 10 cm away. You feel a narrow, cool stream on one small spot, not a wide warm breath.", fix: "Make the opening smaller. A wide, warm breath means the opening is too big." },
          { id: "mirror", title: "In the mirror", text: "The opening is centred, the cheeks are not puffed, the lips are not pressed hard together.", fix: "Relax the cheeks and lips; only the small opening shapes the air." },
        ] },
      { id: "sound", kind: "firstSound", title: "Find the sound", intro: "Close holes 1-3 (Sa). Rest the flute on your lower lip so the lip covers about a quarter to a third of the blowing hole. Blow a gentle 'pooh' for 3-4 seconds, then roll the flute in millimetres, toward you and away. Rest every 2-3 minutes.",
        target: 0, giveUp: 60 },
    ] },
    { title: "High and low", steps: [
      { id: "pitch", kind: "quiz", title: "What pitch is", intro: "Every sound vibrates. Faster vibration sounds higher; slower sounds lower. A bird chirps high; a big drum booms low.",
        questions: [
          { q: "Your flute's Sa vibrates about 523 times a second. A note that vibrates 600 times a second sounds...",
            options: [{ text: "Higher", right: true }, { text: "Lower", why: "Faster vibration sounds higher, and 600 is faster than 523." }],
            why: "Pitch just means how high or low a sound is." },
          { q: "The upper Sa sounds like \"the same note, higher\". How fast does it vibrate?",
            options: [{ text: "Twice as fast as Sa", right: true }, { text: "A little faster than Sa", why: "Exactly twice: that is an octave, and it is why the two sound like the same note." }],
            why: "From one Sa to the next is an octave (L05)." },
        ] },
      { id: "ear", kind: "higherlower", title: "Higher or lower?", intro: "Your ear is your first tuner. Eight pairs of notes.", rounds: 8, pass: 6 },
    ] },
    { title: "Done", steps: [
      { id: "done", kind: "custom", title: "Day 1 complete", next: "Finish Day 1",
        make: dayReward(d => [
          ["Sat tall, and know why", true],
          ["Know where every finger goes", true],
          ["Held the flute for a relaxed minute", true],
          ["Breathed low with the circle", !!d.breathe],
          ["Hissed evenly" + (d.hiss && d.hiss.best ? " for " + d.hiss.best + " s" : ""), !!(d.hiss && d.hiss.best)],
          [d.sound && d.sound.found ? "Made your first sound on Sa" : "Searched for your first sound", !!d.sound],
          ["Heard higher and lower", !!d.ear],
        ], { title: "First sound on Sa", text: "Sa, again and again, with the drone. Any sound counts.", audio: "app/audio/bansuri-sa-middle-octave-sankalp.mp3" }) },
    ] },
  ],
  finish(d, { first }) {
    const note = "Day 1 lesson. Hiss: " + (d.hiss && d.hiss.best ? d.hiss.best + " s" : "-") + ". First sound: " + (d.sound && d.sound.found ? "yes" : "not yet") + ". Higher/lower: " + (d.ear ? d.ear.right + "/" + d.ear.of : "-") + ".";
    return finishDay(1, "m1", 30, note, first);
  },
};
