// Breath timer (#/skills/tone/breath): guided breathing cycles for building breath capacity.
// No microphone needed. Configurable inhale/hold/exhale durations and cycle count.
import { h } from "../util.js";

const PRESETS = [
  { label: "Beginner", pattern: [3, 2, 4] },
  { label: "Standard", pattern: [4, 4, 6] },
  { label: "Extended", pattern: [5, 5, 8] },
  { label: "Kapalbhati", pattern: [1, 0, 1] },
];

const PHASES = ["Inhale", "Hold", "Exhale"];
const PHASE_COLOR = ["var(--info)", "var(--accent)", "var(--good)"];
const CYCLE_OPTS = [3, 5, 8, 10];

const R = 90, C = 2 * Math.PI * R;

function chipGroup(label, values, initial, onChange) {
  let current = initial;
  const chips = h("div", { class: "chips bt-chips" });
  const draw = () => chips.querySelectorAll("button").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.v === String(current))));
  for (const v of values) {
    const lbl = typeof v === "object" ? v.label : String(v);
    const val = typeof v === "object" ? v.value : v;
    chips.append(h("button", {
      type: "button", class: "chipbtn", dataset: { v: String(val) },
      onclick: () => { current = val; draw(); onChange(val); },
    }, lbl));
  }
  draw();
  const wrap = h("div", { class: "bt-chiprow" },
    h("span", { class: "small muted" }, label), chips);
  return { el: wrap, get: () => current };
}

export function breathTimer() {
  let inhale = 4, hold = 4, exhale = 6, cycles = 5;
  let running = false, raf = 0, startTime = 0, dead = false;
  let phaseIdx = 0, cycleIdx = 0;

  // SVG ring
  const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  ring.setAttribute("cx", "100"); ring.setAttribute("cy", "100"); ring.setAttribute("r", String(R));
  ring.setAttribute("fill", "none"); ring.setAttribute("stroke-width", "10");
  ring.setAttribute("stroke-linecap", "round"); ring.setAttribute("stroke", "var(--accent)");
  ring.setAttribute("stroke-dasharray", String(C)); ring.setAttribute("stroke-dashoffset", String(C));
  ring.setAttribute("transform", "rotate(-90 100 100)");

  const bg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  bg.setAttribute("cx", "100"); bg.setAttribute("cy", "100"); bg.setAttribute("r", String(R));
  bg.setAttribute("fill", "none"); bg.setAttribute("stroke-width", "10");
  bg.setAttribute("stroke", "var(--line)"); bg.setAttribute("opacity", "0.3");

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 200 200"); svg.setAttribute("class", "bt-svg");
  svg.append(bg, ring);

  const phaseLbl = h("span", { class: "bt-phase" }, "Ready");
  const timeLbl = h("span", { class: "bt-time" });
  const statusLbl = h("div", { class: "bt-status small muted" });
  const msg = h("p", { class: "bt-msg small muted" },
    "Breathe with the timer. Inhale through the nose, hold, exhale slowly through the flute embouchure.");
  const startBtn = h("button", { type: "button", class: "btn primary big bt-start" }, "Start");

  const ringWrap = h("div", { class: "bt-ring" }, svg, phaseLbl, timeLbl);

  function applyPreset(pat) {
    inhale = pat[0]; hold = pat[1]; exhale = pat[2];
  }

  const presetGroup = chipGroup("Pattern",
    PRESETS.map((p, i) => ({ label: p.label + " (" + p.pattern.join("-") + ")", value: i })),
    1, v => applyPreset(PRESETS[v].pattern));

  const cycleGroup = chipGroup("Cycles",
    CYCLE_OPTS.map(n => ({ label: String(n), value: n })), 5, v => { cycles = v; });

  function phaseDur() {
    return [inhale, hold, exhale][phaseIdx];
  }

  function setRing(frac, color) {
    ring.setAttribute("stroke-dashoffset", String(C * (1 - frac)));
    ring.setAttribute("stroke", color);
  }

  function tick() {
    if (!running || dead) return;
    const dur = phaseDur();
    const elapsed = (performance.now() - startTime) / 1000;

    if (dur === 0) {
      // Skip zero-duration phases (e.g. Kapalbhati hold)
      nextPhase();
      raf = requestAnimationFrame(tick);
      return;
    }

    const frac = Math.min(elapsed / dur, 1);
    const remain = Math.max(0, dur - elapsed);

    setRing(frac, PHASE_COLOR[phaseIdx]);
    timeLbl.textContent = remain < 10 ? remain.toFixed(1) : String(Math.ceil(remain));

    if (frac >= 1) {
      nextPhase();
    }

    raf = requestAnimationFrame(tick);
  }

  function nextPhase() {
    phaseIdx++;
    if (phaseIdx > 2) {
      phaseIdx = 0;
      cycleIdx++;
      if (cycleIdx >= cycles) {
        finish();
        return;
      }
    }
    startTime = performance.now();
    phaseLbl.textContent = PHASES[phaseIdx];
    statusLbl.textContent = "Cycle " + (cycleIdx + 1) + " of " + cycles;
    // Skip zero-duration phases immediately
    if (phaseDur() === 0) nextPhase();
  }

  function start() {
    if (running) { stop(); return; }
    running = true;
    phaseIdx = 0; cycleIdx = 0;
    startTime = performance.now();
    phaseLbl.textContent = PHASES[0];
    timeLbl.textContent = "";
    statusLbl.textContent = "Cycle 1 of " + cycles;
    msg.textContent = "";
    startBtn.textContent = "Stop";
    presetGroup.el.querySelectorAll("button").forEach(b => b.disabled = true);
    cycleGroup.el.querySelectorAll("button").forEach(b => b.disabled = true);
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    setRing(0, "var(--line)");
    phaseLbl.textContent = "Stopped";
    timeLbl.textContent = "";
    startBtn.textContent = "Start";
    msg.textContent = cycleIdx > 0
      ? "Stopped after " + cycleIdx + " cycle" + (cycleIdx === 1 ? "" : "s") + "."
      : "Stopped.";
    presetGroup.el.querySelectorAll("button").forEach(b => b.disabled = false);
    cycleGroup.el.querySelectorAll("button").forEach(b => b.disabled = false);
  }

  function finish() {
    running = false;
    cancelAnimationFrame(raf);
    setRing(1, "var(--good)");
    phaseLbl.textContent = "Done";
    timeLbl.textContent = "";
    startBtn.textContent = "Start";
    const total = cycles * (inhale + hold + exhale);
    const mins = Math.floor(total / 60), secs = total % 60;
    msg.textContent = cycles + " cycles complete. Total: " +
      (mins ? mins + " min " : "") + secs + " s. " +
      "Well done - consistency builds capacity.";
    statusLbl.textContent = "";
    presetGroup.el.querySelectorAll("button").forEach(b => b.disabled = false);
    cycleGroup.el.querySelectorAll("button").forEach(b => b.disabled = false);
  }

  startBtn.addEventListener("click", start);

  const el = h("div", { class: "bt-tool" },
    presetGroup.el, cycleGroup.el, ringWrap, statusLbl, msg, startBtn);

  return {
    el,
    destroy() {
      dead = true;
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
