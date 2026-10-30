// Calibration with a real flute: four short tasks while the detector's readings are recorded
// (pitch, cents, clarity, loudness; no audio). The summary and a JSON file let the app's tolerances
// (in tune, airy, steady, timing) be set from real players instead of synthetic tones.
import { h } from "./util.js";
import { listenMic } from "./core/listen.js";
import { micIntro, countdown } from "./core/live.js";
import { getSettings } from "./core/settings.js";

const TASKS = [
  ["Hold Sa as steadily as you can", 10], ["Play S R G R S slowly, a second per note", 10],
  ["Hold your clearest, best Sa", 10], ["Now an airy, breathy Sa on purpose", 10],
];

function stats(reads) {
  const voiced = reads.filter(r => r.semi !== null);
  const cents = voiced.map(r => r.cents), clar = voiced.map(r => r.clarity || 0);
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) * (x - m)))); };
  const notes = {}; for (const r of voiced) notes[r.near] = (notes[r.near] || 0) + 1;
  return { frames: reads.length, voiced: voiced.length, centsMean: Math.round(mean(cents)), centsSpread: Math.round(sd(cents)), clarityMean: Math.round(mean(clar) * 1000) / 1000, levelMean: Math.round(mean(voiced.map(r => r.level || 0)) * 10000) / 10000, notes };
}

export function calibrationWidget() {
  const msg = h("p", { "aria-live": "polite" }, "You will need your flute and about a minute. Nothing is recorded as sound: only the pitch measurements, for this file.");
  const out = h("div", { class: "stack" });
  const btn = h("button", { type: "button", class: "btn primary" }, "Start calibration");
  const el = h("div", { class: "stack calib" }, msg, h("div", { class: "row" }, btn), out);
  let stop = null;
  btn.addEventListener("click", async () => {
    if (!(await micIntro(el)) || !(await countdown(el, { btn }))) return;
    btn.disabled = true;
    const result = { app: "bansuri-mastery", kind: "calibration", when: new Date().toISOString(), ua: navigator.userAgent, settings: getSettings(), tasks: [] };
    for (const [label, secs] of TASKS) {
      const reads = [];
      msg.textContent = label + " (" + secs + " s)";
      stop = await listenMic(r => reads.push({ t: Math.round(r.t * 1000) / 1000, semi: r.semi === null ? null : Math.round(r.semi * 100) / 100, near: r.near, cents: r.cents, clarity: r.clarity ? Math.round(r.clarity * 1000) / 1000 : null, level: r.level ? Math.round(r.level * 10000) / 10000 : 0 }));
      await new Promise(r => setTimeout(r, secs * 1000));
      stop(); stop = null;
      result.tasks.push({ label, summary: stats(reads), reads });
      msg.textContent = "Rest a moment...";
      await new Promise(r => setTimeout(r, 1500));
    }
    msg.textContent = "Done. Thank you. Save the file and send it along; it helps set fair tolerances.";
    const blob = new Blob([JSON.stringify(result)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    out.replaceChildren(
      h("div", { class: "tablewrap" }, h("table", null, h("thead", null, h("tr", null, ["Task", "Sounding", "Cents mean / spread", "Clarity"].map(x => h("th", null, x)))),
        h("tbody", null, result.tasks.map(tk => h("tr", null, h("td", null, tk.label), h("td", null, Math.round(tk.summary.voiced / Math.max(1, tk.summary.frames) * 100) + "%"), h("td", null, tk.summary.centsMean + " / " + tk.summary.centsSpread), h("td", null, String(tk.summary.clarityMean))))))),
      h("a", { class: "btn", href: url, download: "bansuri-calibration-" + new Date().toISOString().slice(0, 10) + ".json" }, "Save the calibration file"));
    btn.disabled = false; btn.textContent = "Run it again";
  });
  return { el, destroy() { if (stop) stop(); } };
}
