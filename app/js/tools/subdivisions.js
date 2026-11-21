// Rhythm subdivisions trainer: tap dugun, tigun or chaugun over Teentaal's 16 beats.
// The click sounds on main beats; subdivision timing is silent - the learner internalizes it.
import { h } from "../util.js";
import { ac, master, click } from "../core/audio.js";
import { emitLive } from "../core/listen.js";

// Teentaal: 16 beats, 4 vibhags of 4. Beat 0 = sam, beat 8 = khali, rest = tali.
const BEAT_KIND = [
  "sam", "tick", "tick", "tick",
  "tick", "tick", "tick", "tick",
  null, "tick", "tick", "tick",
  "tick", "tick", "tick", "tick",
];

const TEMPOS = [60, 72, 90, 108];
const SUBDIVS = [
  { key: 1, label: "Theka (1x)" },
  { key: 2, label: "Dugun (2x)" },
  { key: 3, label: "Tigun (3x)" },
  { key: 4, label: "Chaugun (4x)" },
];
const RANGE_MS = 250;

function chipGroup(label, items, initial, onChange) {
  const wrap = h("div", { class: "sd-chips", role: "group", "aria-label": label });
  let cur = initial;
  const draw = () => wrap.querySelectorAll("button").forEach(b => {
    b.setAttribute("aria-pressed", String(b.dataset.v === String(cur)));
  });
  for (const it of items) {
    wrap.append(h("button", {
      type: "button", class: "chipbtn", dataset: { v: String(it.value) },
      onclick: () => { cur = it.value; draw(); onChange(cur); },
    }, it.label));
  }
  draw();
  return { el: wrap, value: () => cur };
}

export function subdivisions() {
  let bpm = 72, subdiv = 2;
  let running = false, bus = null, beatTimers = [], rafId = 0;
  let beats = [], taps = [], cycleCount = 0;

  const tempoChips = chipGroup("Tempo", TEMPOS.map(t => ({ value: t, label: t + " BPM" })), bpm, v => { bpm = v; });
  const subdivChips = chipGroup("Subdivision", SUBDIVS.map(s => ({ value: s.key, label: s.label })), subdiv, v => { subdiv = v; });

  // Beat grid: 4 rows of 4
  const cells = [];
  const grid = h("div", { class: "sd-grid" });
  for (let i = 0; i < 16; i++) {
    const kind = i === 0 ? "sam" : i === 8 ? "khali" : "";
    const cell = h("div", { class: "sd-cell", dataset: { beat: String(i) } },
      h("span", { class: "sd-num" }, i === 0 ? "X" : i === 8 ? "0" : String((i % 4) + 1)),
    );
    if (kind) cell.classList.add("sd-" + kind);
    cells.push(cell);
    grid.append(cell);
  }

  const padTxt = h("span", { class: "sd-padtxt" }, "Tap");
  const pad = h("button", { type: "button", class: "sd-pad", disabled: true }, padTxt);
  const lane = h("div", { class: "sd-lane" },
    h("i", { class: "sd-zero" }),
    h("span", { class: "sd-ll" }, "early"),
    h("span", { class: "sd-lr" }, "late"),
  );
  const msg = h("p", { class: "sd-msg" }, "Pick a tempo and subdivision, then press Start. After a 4-beat count-in, tap the subdivisions on every beat.");
  const startBtn = h("button", { type: "button", class: "sd-start btn primary" }, "Start");
  const stats = h("div", { class: "sd-stats", hidden: true });

  const el = h("div", { class: "sd-tool" },
    h("div", { class: "sd-row" }, h("span", { class: "small muted" }, "Tempo"), tempoChips.el),
    h("div", { class: "sd-row" }, h("span", { class: "small muted" }, "Subdivision"), subdivChips.el),
    grid, pad, lane, stats, msg, startBtn,
  );

  function clearRun() {
    beatTimers.forEach(clearTimeout);
    beatTimers = [];
    cancelAnimationFrame(rafId);
    if (bus) { bus.disconnect(); bus = null; }
    cells.forEach(c => c.classList.remove("sd-on"));
    running = false;
    pad.disabled = true;
    startBtn.textContent = "Start";
    padTxt.textContent = "Tap";
  }

  function nearestSubdiv(tapTime) {
    let best = null, bestDist = Infinity;
    for (const b of beats) {
      const beatS = 60 / bpm;
      const subS = beatS / subdiv;
      for (let s = 0; s < subdiv; s++) {
        const target = b.t + s * subS;
        const dist = Math.abs(tapTime - target);
        if (dist < bestDist) {
          bestDist = dist;
          best = { beatIdx: b.idx, subIdx: s, t: target, used: false };
        }
      }
    }
    return best ? { ...best, dist: bestDist } : null;
  }

  function tap() {
    if (!running) return;
    const c = ac(), t = c.currentTime - (c.outputLatency || 0);
    pad.classList.remove("sd-hit");
    void pad.offsetWidth;
    pad.classList.add("sd-hit");

    const nearest = nearestSubdiv(t);
    if (!nearest) return;

    const beatS = 60 / bpm;
    if (nearest.dist > beatS / (subdiv * 2)) return;

    const offMs = (t - nearest.t) * 1000;
    taps.push({ beatIdx: nearest.beatIdx, subIdx: nearest.subIdx, off: offMs, t });

    const absOff = Math.abs(offMs);
    const cls = absOff <= 50 ? "sd-good" : absOff <= 100 ? "sd-ok" : "sd-miss";
    const x = 50 + Math.max(-50, Math.min(50, offMs / RANGE_MS * 50));
    lane.append(h("b", { class: "sd-dot " + cls, style: "left:" + x + "%" }));
  }

  function showStats() {
    if (!taps.length) {
      stats.hidden = true;
      return;
    }
    const totalExpected = 16 * subdiv;
    const good = taps.filter(t => Math.abs(t.off) <= 50).length;
    const ok = taps.filter(t => Math.abs(t.off) > 50 && Math.abs(t.off) <= 100).length;
    const missed = totalExpected - taps.length;
    const avgOff = taps.length ? Math.round(taps.reduce((a, t) => a + t.off, 0) / taps.length) : 0;
    const pct = taps.length ? Math.round(good / taps.length * 100) : 0;

    stats.hidden = false;
    stats.replaceChildren(
      h("span", { class: "sd-stat" }, h("b", null, taps.length + "/" + totalExpected), " taps"),
      h("span", { class: "sd-stat sd-good" }, h("b", null, String(good)), " on beat"),
      h("span", { class: "sd-stat sd-ok" }, h("b", null, String(ok)), " close"),
      h("span", { class: "sd-stat" }, h("b", null, pct + "%"), " accuracy"),
      h("span", { class: "sd-stat" }, "avg " + (avgOff >= 0 ? "+" : "") + avgOff + " ms"),
    );
  }

  function finish(complete) {
    const hadTaps = taps.length;
    clearRun();
    if (complete && hadTaps) {
      showStats();
      const totalExpected = 16 * subdiv;
      const good = taps.filter(t => Math.abs(t.off) <= 50).length;
      const pct = Math.round(good / taps.length * 100);
      const avgOff = Math.round(taps.reduce((a, t) => a + t.off, 0) / taps.length);
      const spread = Math.round(Math.sqrt(taps.reduce((a, t) => a + (t.off - avgOff) * (t.off - avgOff), 0) / taps.length));
      const within = taps.length ? good / taps.length : 0;
      emitLive({ type: "tap", bpm: bpm, silent: false, mean: avgOff, spread: spread, within: Math.round(within * 100) / 100 });
      const side = Math.abs(avgOff) <= 15 ? "right on the beat"
        : Math.abs(avgOff) + " ms " + (avgOff < 0 ? "early (rushing)" : "late (dragging)");
      msg.textContent = taps.length + " of " + totalExpected + " subdivisions tapped, " + pct + "% on beat, on average " + side + ".";
      if (pct >= 80) msg.textContent += " Excellent - try a faster tempo or higher subdivision.";
      else if (taps.length < totalExpected * 0.5) msg.textContent += " Many subdivisions missed - keep tapping through every beat.";
      else msg.textContent += " Aim for steadier subdivisions before moving faster.";
    } else if (hadTaps) {
      showStats();
      msg.textContent = "Stopped after " + hadTaps + " taps.";
    } else {
      stats.hidden = true;
      msg.textContent = "Stopped.";
    }
  }

  function start() {
    if (running) { finish(false); return; }

    const c = ac(), beatS = 60 / bpm, t0 = c.currentTime + 0.3;
    beats = [];
    taps = [];
    lane.querySelectorAll(".sd-dot").forEach(d => d.remove());
    stats.hidden = true;
    bus = c.createGain();
    bus.connect(master());

    const heardDelay = ((c.outputLatency || 0) * 1000) / 1000;

    // Count-in: 4 beats
    for (let i = 0; i < 4; i++) {
      const t = t0 + i * beatS;
      click(t, i === 0 ? "sam" : "tick", bus);
      const ci = i;
      beatTimers.push(setTimeout(() => {
        padTxt.textContent = String(4 - ci);
      }, Math.max(0, (t + heardDelay - c.currentTime) * 1000)));
    }

    // Main cycle: 16 beats
    for (let i = 0; i < 16; i++) {
      const t = t0 + (4 + i) * beatS;
      const kind = BEAT_KIND[i];
      if (kind) click(t, kind, bus);
      beats.push({ idx: i, t });

      const bi = i;
      beatTimers.push(setTimeout(() => {
        cells.forEach(c => c.classList.remove("sd-on"));
        cells[bi].classList.add("sd-on");
        padTxt.textContent = "Tap";
      }, Math.max(0, (t + heardDelay - c.currentTime) * 1000)));
    }

    running = true;
    pad.disabled = false;
    startBtn.textContent = "Stop";
    msg.textContent = subdiv === 1
      ? "Count-in, then tap on every beat."
      : "Count-in, then tap " + subdiv + " times per beat (" + SUBDIVS.find(s => s.key === subdiv).label + ").";

    const endTime = t0 + (4 + 16) * beatS + 0.5;
    beatTimers.push(setTimeout(() => finish(true), (endTime - c.currentTime) * 1000));
  }

  startBtn.addEventListener("click", start);
  pad.addEventListener("pointerdown", e => { e.preventDefault(); tap(); });
  const onKey = e => {
    if (!running || e.repeat || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || "")) return;
    e.preventDefault();
    tap();
  };
  document.addEventListener("keydown", onKey);

  return {
    el,
    destroy() {
      clearRun();
      document.removeEventListener("keydown", onKey);
    },
  };
}
