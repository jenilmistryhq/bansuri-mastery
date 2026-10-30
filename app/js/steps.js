// Session steps for people: a name and an icon for each kind of step (instead of the plan's letters
// W T K M E R), and the step's instruction in plain words (the spoken version made for the voice,
// in the learner's language) instead of the course's codes. The original stays one tap away.
import { textOf } from "./voice.js";

export const STEP_META = {
  W: { icon: "warmup", name: "Warm-up" },
  T: { icon: "wave", name: "Tone" },
  K: { icon: "hand", name: "Technique" },
  M: { icon: "note", name: "Music" },
  E: { icon: "ear", name: "Ear" },
  R: { icon: "mic", name: "Record" },
  READ: { icon: "read", name: "Read" },
  TEST: { icon: "check", name: "Test" },
};
export const stepMeta = b => STEP_META[b.id] || { icon: "play", name: b.label || b.id };

// The plain-words instruction for a step, or null when there is none (the original is used).
export async function plainText(b) {
  if (!b || !b.text) return null;
  try { return await textOf(["step", b.text]); } catch (e) { return null; }
}
