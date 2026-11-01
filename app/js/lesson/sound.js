// Small sounds for lesson feedback.
import { ac, makeVoice } from "../core/audio.js";
import { hzOf } from "../core/theory.js";

// A short rising "right" sound, and a soft low "try again".
export function ding(ok = true) {
  try {
    const c = ac(), t = c.currentTime + 0.02;
    (ok ? [[7, 0], [12, 0.11]] : [[-1, 0]]).forEach(([s, d]) => { const v = makeVoice(hzOf(s), t + d, { level: 0.18 }); v.stop(t + d + (ok ? 0.22 : 0.3)); });
  } catch (e) { /* audio unavailable */ }
}

// Two notes one after the other (for higher-or-lower).
export function playPair(a, b, gap = 0.9) {
  try {
    const c = ac(), t = c.currentTime + 0.05;
    [[a, 0], [b, gap]].forEach(([s, d]) => { const v = makeVoice(hzOf(s), t + d); v.stop(t + d + 0.7); });
  } catch (e) { /* audio unavailable */ }
}
