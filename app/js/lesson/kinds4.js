// Lesson step kinds for intonation (L17): bend (follow a moving target in cents on one held note:
// centre, 20 flat, centre, 20 sharp, centre) and swell (soft-loud-soft with the pitch steady).
import { h, icon } from "../util.js";
import { listenMic } from "../core/listen.js";
import { micIntro, countdown } from "../core/live.js";
import { codeOf } from "../core/theory.js";
import { swellScore } from "../games3.js";
import { ding } from "./sound.js";

async function openMic(host, btn, onReading) {
  if (!(await micIntro(host))) return null;
  if (!(await countdown(host, { btn }))) return null;
  try { return await listenMic(onReading); } catch (e) { return null; }
}

// One step of a bend drill: is a reading (cents from the note) on this target, within tol?
export const onTarget = (cents, target, tol = 7) => cents !== null && cents !== undefined && Math.abs(cents - target) <= tol;

export const PITCH_KINDS = {
  // Hold a note and bend it to each target in turn, holding each for a moment. { target (note),
  // stops: [cents], hold (seconds on each), tol }
  bend: { make(s, api) {
    const stops = s.stops || [0, -20, 0, 20, 0], hold = s.hold || 1, tol = s.tol || 7;
    let unsub = null, k = 0, held = 0, last = null;
    const needle = h("i", { class: "lv-needle" });
    const mark = h("i", { class: "lesson-bendmark" });
    const bar = h("div", { class: "lv-bar lesson-bendbar" }, h("i", { class: "lv-mid" }), mark, needle);
    const chips = h("div", { class: "lesson-chips" }, stops.map(c => h("span", { class: "lesson-chip" }, c === 0 ? "centre" : (c > 0 ? "+" : "") + c)));
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" }, "Press Start and hold " + codeOf(s.target || 0) + ". Then follow the marker.");
    const btn = h("button", { type: "button", class: "btn primary big" }, icon("mic"), " Start");
    const pos = c => (50 + Math.max(-50, Math.min(50, c * 1.25))) + "%"; // +/-40 cents fill the bar
    const show = () => {
      mark.style.left = pos(stops[k]);
      chips.querySelectorAll(".lesson-chip").forEach((c, i) => { c.classList.toggle("picked", i === k); c.classList.toggle("done", i < k); });
      msg.textContent = stops[k] === 0 ? "Back to the centre: the beats stop." : stops[k] < 0 ? "Bend it flat: roll the flute toward you, or slow the air." : "Bend it sharp: roll the flute away, or speed up the air.";
    };
    const stop = () => { if (unsub) { unsub(); unsub = null; } btn.replaceChildren(icon("mic"), " Start"); };
    btn.addEventListener("click", async () => {
      if (unsub) { stop(); return; }
      k = 0; held = 0; last = null; show();
      const u = await openMic(btn.parentElement, btn, r => {
        const ok = r.semi !== null && r.near === (s.target || 0);
        if (!ok) { held = 0; last = r.t; needle.className = "lv-needle"; return; }
        needle.style.left = pos(r.cents);
        const on = onTarget(r.cents, stops[k], tol);
        needle.className = "lv-needle " + (on ? "lv-good" : "lv-warn");
        held = on ? held + (last === null ? 0 : r.t - last) : 0; last = r.t;
        if (held >= hold) {
          k++; held = 0;
          if (k >= stops.length) { stop(); ding(true); msg.textContent = "Every stop reached: you move the pitch on purpose now."; chips.querySelectorAll(".lesson-chip").forEach(c => c.classList.add("done")); api.data[s.id] = { done: true }; api.save(); api.ready(); return; }
          ding(true); show();
        }
      });
      if (!u) { msg.textContent = "The microphone is not available here."; api.ready(); return; }
      unsub = u; btn.replaceChildren(icon("stop"), " Stop");
    });
    show();
    return { el: h("div", { class: "stack lesson-center" }, chips, bar, h("div", { class: "lv-scale small muted lesson-humscale" }, h("span", null, "flat"), h("span", null, "centre"), h("span", null, "sharp")), msg, btn), destroy: stop };
  } },

  // Soft, loud, soft on one note, the pitch steady. { target, seconds, drift (cents allowed) }
  swell: { make(s, api) {
    const secs = s.seconds || 8;
    let unsub = null, samples = [], t0 = null, timer = 0;
    const lvl = h("i");
    const meter = h("div", { class: "lesson-level" }, lvl);
    const guide = h("div", { class: "lesson-swellguide", "aria-hidden": "true" }, h("i"));
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" }, "Press Start: " + secs + " seconds, soft to loud to soft, following the shape.");
    const res = h("div");
    const btn = h("button", { type: "button", class: "btn primary big" }, icon("mic"), " Start");
    const stop = () => { clearTimeout(timer); if (unsub) { unsub(); unsub = null; } btn.replaceChildren(icon("mic"), " Again"); guide.classList.remove("run"); };
    btn.addEventListener("click", async () => {
      if (unsub) { stop(); return; }
      samples = []; t0 = null; res.replaceChildren();
      const u = await openMic(btn.parentElement, btn, r => {
        if (t0 === null && r.semi !== null) t0 = r.t;
        if (t0 === null) return;
        samples.push({ t: r.t - t0, semi: r.semi, level: r.level || 0 });
        lvl.style.width = Math.min(100, (r.level || 0) / 0.1 * 100) + "%";
      });
      if (!u) { msg.textContent = "The microphone is not available here."; api.ready(); return; }
      unsub = u; btn.replaceChildren(icon("stop"), " Stop");
      guide.style.setProperty("--secs", secs + "s"); guide.classList.add("run");
      msg.textContent = "Start softly... grow... and fade.";
      timer = setTimeout(() => {
        stop();
        const r = swellScore(samples);
        if (!r) { msg.textContent = "Not enough of a held note was heard. Start the note, then press Start."; return; }
        const steady = r.drift <= (s.drift || 15), shaped = r.ratio >= 1.6 && r.shape >= 0.5;
        ding(steady && shaped);
        res.replaceChildren(h("div", { class: "lesson-reveal " + (steady && shaped ? "good" : "warn") },
          h("b", null, steady ? "The pitch stayed within " + r.drift + " cents." : "The pitch moved " + r.drift + " cents."),
          h("p", null, (shaped ? "A clear swell. " : "Make the loud part louder and the ends softer. ") + (steady ? "" : r.follows > 0.3 ? "It rose as you got louder: roll the flute toward you a touch as you swell." : "Keep the air steady in speed as the loudness changes."))));
        msg.textContent = "";
        api.data[s.id] = { drift: r.drift, ratio: r.ratio, passed: steady && shaped }; api.save(); api.ready();
      }, secs * 1000 + 800);
    });
    return { el: h("div", { class: "stack lesson-center" }, guide, meter, msg, btn, res), destroy: stop };
  } },
};
