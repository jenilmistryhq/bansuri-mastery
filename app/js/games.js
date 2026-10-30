// Games played with the real flute: the microphone steers, inflates, scores and jams.
// Each returns { el, destroy }. Results go out as "bansuri:live" events (type "game").
import { h, store, storeSet } from "./util.js";
import { codeOf, fingOf, hzOf } from "./core/theory.js";
import { ac, makeVoice, tanpura, tablaBol, click } from "./core/audio.js";
import { listenMic, muteListening, noteSequencer, emitLive } from "./core/listen.js";
import { micIntro, countdown } from "./core/live.js";
import { parseNotation, buildEvents, playEvents } from "./core/notation.js";
import { getSettings } from "./core/settings.js";
import { drawFing, picturesOn, noteLabel } from "./core/fingers.js";
import { speak } from "./voice.js";
import { t as tr } from "./core/i18n.js";

// Accessibility settings for the games: speed (slow, normal, fast), no clock, and cues for playing
// without looking (the next note is spoken, progress is heard as ticks).
const speedOf = () => ({ slow: 0.65, normal: 1, fast: 1.3 })[getSettings().gameSpeed] || 1;
const cuesOn = () => getSettings().cues;
function tick(high) { try { const c = ac(), t = c.currentTime + 0.01; click(t, high ? "tali" : "tick"); muteListening(t + 0.12); } catch (e) { /* audio unavailable */ } }
// A note's label on a canvas: the fingering picture, or the letter.
function canvasNote(g, x, y, semi, size, col) {
  if (picturesOn()) drawFing(g, x, y, semi, size || 20);
  else { g.fillStyle = col; const l = codeOf(semi); g.fillText(l, x - g.measureText(l).width / 2, y + 5); }
}

export const NOTE_SETS = [
  ["srg", "S R G", [0, 2, 4]],
  ["srgmp", "S R G m P", [0, 2, 4, 5, 7]],
  ["low", ".P .D .N S R G", [-5, -3, -1, 0, 2, 4]],
  ["oct", "Middle octave", [0, 2, 4, 5, 7, 9, 11, 12]],
];

// A small seeded random generator, so a challenge link replays exactly the same course.
export function seeded(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// The next note of a course: mostly a step to a neighbour in the set, sometimes a leap.
export function nextNote(set, prev, rnd) {
  const i = Math.max(0, set.indexOf(prev));
  const step = rnd() < 0.7 ? 1 : 2, dir = rnd() < 0.5 ? -1 : 1;
  return set[Math.max(0, Math.min(set.length - 1, i + dir * step))];
}

const colors = () => {
  const css = getComputedStyle(document.documentElement), v = (k, d) => (css.getPropertyValue(k) || "").trim() || d;
  return { ink: v("--ink", "#1b2420"), muted: v("--muted", "#56645d"), line: v("--line", "#cfd6ca"), accent: v("--accent", "#0d6a6e"), good: v("--good", "#2e7a3a"), bad: v("--bad", "#b3261e"), warn: v("--warn", "#9a6512"), bamboo: v("--bamboo", "#c9a552"), surface: v("--surface", "#f9faf6"), sunken: v("--sunken", "#e3e8de") };
};

function fitCanvas(canvas, aspect) {
  const w = canvas.parentElement ? canvas.parentElement.clientWidth : 600, dpr = window.devicePixelRatio || 1;
  // On a phone the field is taller than it is on a wide screen, so the game is not a thin strip.
  const W = Math.max(280, Math.min(900, w)), H = Math.round(W < 560 ? Math.min(W * aspect * 1.8, window.innerHeight * 0.55) : W * aspect);
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px";
  const g = canvas.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, W, H };
}

function chime(good) { try { const c = ac(), t = c.currentTime + 0.01; click(t, good ? "tali" : "khali"); } catch (e) { /* audio unavailable */ } }

// Shared microphone handling with the same safety as the other widgets: a late subscription
// (after a stop or a second start) is closed at once.
function mic(el) {
  const life = { gen: 0, unsub: null };
  return {
    async start(onReading, btn) {
      if (life.unsub) return true;
      if (!(await micIntro(el))) return false;
      const g0 = life.gen;
      if (!(await countdown(el, { btn })) || g0 !== life.gen) return false;
      const g = ++life.gen;
      const u = await listenMic(onReading);
      if (g !== life.gen) { u(); return false; }
      life.unsub = u; return true;
    },
    stop() { life.gen++; if (life.unsub) { life.unsub(); life.unsub = null; } },
  };
}

function setPicker(saved) {
  const sel = h("select", { class: "input", "aria-label": "Notes", style: { width: "auto" } }, NOTE_SETS.map(([k, label]) => h("option", { value: k }, label)));
  sel.value = saved && NOTE_SETS.some(s => s[0] === saved) ? saved : "srg";
  return sel;
}

// ---------- Steer by pitch ----------
// A bird flies through gates set at the height of notes. Play the gate's note to fly through it;
// silence lets the bird glide down. opts: { level, seed, onEnd(result) }
export function pitchSteer(opts) {
  const o = Object.assign({ level: null, seed: null }, opts || {});
  const canvas = h("canvas", { class: "game-canvas", role: "img", "aria-label": "Steer by pitch: a bird and gates at note heights" });
  const sel = setPicker(o.level || store("bansuri.game.steer.level", "srg"));
  const status = h("p", { class: "small", "aria-live": "polite" }, "Play the note written on each gate to fly through it. Stay silent to glide down. Three misses end the round.");
  const btn = h("button", { type: "button", class: "btn primary" }, "Start");
  const el = h("div", { class: "stack game" }, h("div", { class: "row" }, h("label", { class: "field" }, "Notes", sel), btn), h("div", { class: "game-stage" }, canvas), status);
  const m = mic(el);
  let raf = 0, run = null;
  function draw() {
    const { g, W, H } = fitCanvas(canvas, 0.5), col = colors(), set = run ? run.set : NOTE_SETS.find(s => s[0] === sel.value)[2];
    const lo = Math.min(...set) - 1, hi = Math.max(...set) + 1, y = s => 12 + (hi - s) / (hi - lo) * (H - 24);
    g.clearRect(0, 0, W, H);
    g.font = "13px " + getComputedStyle(document.body).fontFamily;
    for (const s of set) { g.strokeStyle = col.line; g.beginPath(); g.moveTo(40, y(s)); g.lineTo(W, y(s)); g.stroke(); g.fillStyle = col.muted; g.fillText(codeOf(s), 8, y(s) + 4); }
    if (!run) return;
    const gapH = (H - 24) / (hi - lo) * run.tol * 2;
    for (const gt of run.gates) {
      g.fillStyle = gt.state === "pass" ? col.good : gt.state === "miss" ? col.bad : col.bamboo;
      g.fillRect(gt.x - 10, 0, 20, y(gt.note) - gapH / 2);
      g.fillRect(gt.x - 10, y(gt.note) + gapH / 2, 20, H - y(gt.note) - gapH / 2);
      canvasNote(g, gt.x, y(gt.note) - gapH / 2 - 14, gt.note, 18, col.ink);
      if (gt.state) { g.fillStyle = col.ink; g.font = "bold 16px " + getComputedStyle(document.body).fontFamily; g.fillText(gt.state === "pass" ? "\u2713" : "\u2717", gt.x - 5, H - 8); g.font = "13px " + getComputedStyle(document.body).fontFamily; }
    }
    const by = y(run.bird);
    g.fillStyle = run.flash > 0 ? col.bad : col.accent;
    g.beginPath(); g.arc(run.bx, by, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = col.surface; g.beginPath(); g.arc(run.bx + 4, by - 3, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = col.ink; g.font = "bold 15px " + getComputedStyle(document.body).fontFamily;
    g.fillText(tr("Score") + " " + run.score + (run.lives === Infinity ? "" : "   " + tr("Lives") + " " + "*".repeat(run.lives)), W - 170, 20);
  }
  function step(now) {
    if (!run) return;
    const dt = Math.min(0.05, (now - run.last) / 1000); run.last = now;
    const { W } = { W: canvas.clientWidth || 600 };
    run.bx = W * 0.25;
    // The bird follows the played pitch; without a note it glides down slowly.
    if (now - run.heardAt < 300 && run.target !== null) run.bird += (run.target - run.bird) * Math.min(1, dt * 8);
    else run.bird = Math.max(Math.min(...run.set) - 1, run.bird - dt * 1.2);
    run.flash = Math.max(0, run.flash - dt);
    run.since += dt;
    const speed = (110 + run.score * 6) * speedOf();
    if (run.since >= run.every / speedOf()) {
      run.since = 0; run.note = nextNote(run.set, run.note, run.rnd); run.gates.push({ x: W + 20, note: run.note, state: "" }); run.every = Math.max(1.6, run.every * 0.97);
      status.textContent = tr("Next gate:") + " " + codeOf(run.note);
      if (cuesOn()) speak(["note", run.note, "next"]);
    }
    for (const gt of run.gates) {
      const before = gt.x; gt.x -= speed * dt;
      if (!gt.state && before >= run.bx && gt.x < run.bx) {
        if (Math.abs(run.bird - gt.note) <= run.tol) { gt.state = "pass"; run.score++; chime(true); }
        else { gt.state = "miss"; run.lives--; run.flash = 0.4; chime(false); }
      }
    }
    run.gates = run.gates.filter(gt => gt.x > -30);
    draw();
    if (run.lives <= 0) return end();
    raf = requestAnimationFrame(step);
  }
  function end() {
    cancelAnimationFrame(raf); m.stop();
    const r = run; run = null; btn.textContent = "Play again";
    const key = "bansuri.game.steer.best." + r.level, best = store(key, 0);
    if (r.score > best) storeSet(key, r.score);
    status.textContent = `Score ${r.score}.` + (r.score > best ? " A new best!" : ` Your best: ${best}.`) + " Faster gates come as you score.";
    emitLive({ type: "game", game: "steer", level: r.level, score: r.score, best: r.score > best });
    if (o.onEnd) o.onEnd({ score: r.score, level: r.level, seed: r.seed });
    draw();
  }
  btn.addEventListener("click", async () => {
    if (run) { run.lives = 0; return; }
    ac();
    const seed = o.seed || Math.floor(Math.random() * 1e9), set = NOTE_SETS.find(s => s[0] === sel.value)[2];
    storeSet("bansuri.game.steer.level", sel.value);
    const rnd = seeded(seed);
    run = { seed, level: sel.value, set, rnd, gates: [], note: set[0], bird: set[0], target: null, heardAt: -1e9, score: 0, lives: getSettings().noTimer ? Infinity : 3, since: 2, every: 2.6, tol: 0.75, flash: 0, bx: 120, last: performance.now() };
    const ok = await m.start(r => { if (run && r.semi !== null && r.semi > -7.5 && r.semi < 26.5) { run.target = r.semi; run.heardAt = performance.now(); } }, btn);
    if (!ok || !run) { run = null; status.textContent = "Not started. Press Start when you are ready (the microphone must be allowed)."; return; }
    btn.textContent = "Stop"; status.textContent = "Fly! Play each gate's note.";
    raf = requestAnimationFrame(step);
  });
  requestAnimationFrame(draw);
  return { el, destroy() { if (run) { cancelAnimationFrame(raf); run = null; } m.stop(); } };
}

// ---------- Balloon ----------
// Hold the target note in tune to inflate the balloon; it shrinks when you drift. Pop as many as you
// can in a minute. opts: { level, seed, seconds, onEnd }
export function balloon(opts) {
  const o = Object.assign({ level: null, seed: null, seconds: 60 }, opts || {});
  const canvas = h("canvas", { class: "game-canvas", role: "img", "aria-label": "Balloon: hold the note in tune to inflate it" });
  const sel = setPicker(o.level || store("bansuri.game.balloon.level", "srg"));
  const status = h("p", { class: "small", "aria-live": "polite" }, "Hold the note shown on the balloon, in tune, to blow it up. Drift off and it shrinks. Pop as many as you can in a minute.");
  const btn = h("button", { type: "button", class: "btn primary" }, "Start");
  const el = h("div", { class: "stack game" }, h("div", { class: "row" }, h("label", { class: "field" }, "Notes", sel), btn), h("div", { class: "game-stage" }, canvas), status);
  const m = mic(el);
  let raf = 0, run = null;
  function draw() {
    const { g, W, H } = fitCanvas(canvas, 0.55), col = colors();
    g.clearRect(0, 0, W, H);
    const font = getComputedStyle(document.body).fontFamily;
    if (!run) { g.fillStyle = col.muted; g.font = "16px " + font; g.fillText("Press Start", W / 2 - 40, H / 2); return; }
    const cx = W / 2, cy = H * 0.45, r = 18 + run.size * Math.min(W, H) * 0.32;
    g.strokeStyle = col.muted; g.beginPath(); g.moveTo(cx, cy + r); g.quadraticCurveTo(cx - 12, cy + r + 40, cx + 4, H - 6); g.stroke();
    g.fillStyle = run.inTune ? col.accent : col.sunken;
    g.beginPath(); g.ellipse(cx, cy, r * 0.88, r, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = col.line; g.stroke();
    g.font = `bold ${Math.round(18 + r * 0.25)}px ${font}`;
    canvasNote(g, cx, cy, run.target, Math.round(16 + r * 0.2), run.inTune ? col.surface : col.ink);
    g.font = "15px " + font; g.fillStyle = col.ink;
    g.fillText(tr("Popped") + " " + run.pops + (run.left === Infinity ? "" : "   " + Math.max(0, Math.ceil(run.left)) + " s"), 12, 22);
    if (run.cents !== null) g.fillText(`${run.heard} ${run.cents > 0 ? "+" : ""}${run.cents} cents`, 12, H - 12);
    if (run.burst > 0) { g.fillStyle = col.good; g.font = `bold 28px ${font}`; g.fillText("Pop!", cx - 30, cy - r - 12); }
  }
  function step(now) {
    if (!run) return;
    const dt = Math.min(0.05, (now - run.last) / 1000); run.last = now;
    run.left -= dt; run.burst = Math.max(0, run.burst - dt);
    run.inTune = now - run.heardAt < 250 && Math.abs(run.semi - run.target) * 100 <= 25;
    const before = run.size;
    run.size = Math.max(0, Math.min(1, run.size + (run.inTune ? 0.22 * (getSettings().gameSpeed === "slow" ? 1.4 : 1) : -0.1 * speedOf()) * dt));
    // Heard without looking: a tick every tenth of the balloon.
    if (cuesOn() && Math.floor(run.size * 10) > Math.floor(before * 10)) tick(false);
    if (before < 0.5 && run.size >= 0.5) status.textContent = tr("Half way.");
    if (run.size >= 1) {
      run.pops++; run.size = 0; run.burst = 0.6; chime(true); run.target = nextNote(run.set, run.target, run.rnd);
      status.textContent = tr("Pop! Next balloon:") + " " + codeOf(run.target);
      if (cuesOn()) speak("pop", ["note", run.target, "next"]);
    }
    draw();
    if (run.left <= 0) return end();
    raf = requestAnimationFrame(step);
  }
  function end() {
    cancelAnimationFrame(raf); m.stop();
    const r = run; run = null; btn.textContent = "Play again";
    const key = "bansuri.game.balloon.best." + r.level, best = store(key, 0);
    if (r.pops > best) storeSet(key, r.pops);
    status.textContent = `${r.pops} balloon${r.pops === 1 ? "" : "s"} popped.` + (r.pops > best ? " A new best!" : ` Your best: ${best}.`);
    emitLive({ type: "game", game: "balloon", level: r.level, score: r.pops, best: r.pops > best });
    if (o.onEnd) o.onEnd({ score: r.pops, level: r.level, seed: r.seed });
    draw();
  }
  btn.addEventListener("click", async () => {
    if (run) { run.left = 0; return; }
    ac();
    const seed = o.seed || Math.floor(Math.random() * 1e9), set = NOTE_SETS.find(s => s[0] === sel.value)[2];
    storeSet("bansuri.game.balloon.level", sel.value);
    run = { seed, level: sel.value, set, rnd: seeded(seed), target: set[0], size: 0, pops: 0, left: getSettings().noTimer ? Infinity : o.seconds, semi: -99, cents: null, heard: "", heardAt: -1e9, inTune: false, burst: 0, last: performance.now() };
    const ok = await m.start(r => { if (run && r.semi !== null && r.semi > -7.5) { run.semi = r.semi; run.heardAt = performance.now(); run.cents = Math.round((r.semi - run.target) * 100); run.heard = codeOf(r.near); } }, btn);
    if (!ok || !run) { run = null; status.textContent = "Not started. Press Start when you are ready (the microphone must be allowed)."; return; }
    btn.textContent = "Stop"; raf = requestAnimationFrame(step);
    status.textContent = tr("Balloon:") + " " + codeOf(run.target);
    if (cuesOn()) speak("balloon_intro", ["note", run.target, "play"]);
  });
  requestAnimationFrame(draw);
  return { el, destroy() { if (run) { cancelAnimationFrame(raf); run = null; } m.stop(); } };
}

// ---------- Falling notes ----------
// The notes of a melody fall toward a line in time with the beat; play each one as it lands.
// opts: { songs: [{ title, notation, bpm }], onEnd }
export function fallingNotes(opts) {
  const o = Object.assign({ songs: [] }, opts || {});
  const canvas = h("canvas", { class: "game-canvas", role: "img", "aria-label": "Falling notes: play each note as it reaches the line" });
  const songSel = h("select", { class: "input", "aria-label": "Song", style: { width: "auto", maxWidth: "100%" } }, o.songs.map((s, i) => h("option", { value: String(i) }, s.title + (s.ready === false ? " (not taught yet)" : ""))));
  const bpmIn = h("input", { class: "input", type: "number", min: "40", max: "160", value: "60", style: { width: "5rem" }, "aria-label": "Tempo" });
  const watch = h("input", { type: "checkbox", id: "fn-watch" });
  const status = h("p", { class: "small", "aria-live": "polite" }, "After a one-bar count-in, play each note as it reaches the line. Perfect = in tune and on time.");
  const btn = h("button", { type: "button", class: "btn primary" }, "Start");
  const el = h("div", { class: "stack game" }, h("div", { class: "row" }, h("label", { class: "field" }, "Song", songSel), h("label", { class: "field" }, "BPM", bpmIn), h("label", { class: "check", for: "fn-watch" }, watch, "Play it for me (watch only)"), btn), h("div", { class: "game-stage" }, canvas), status);
  const m = mic(el);
  let raf = 0, run = null;
  songSel.addEventListener("change", () => { const s = o.songs[Number(songSel.value)]; if (s) bpmIn.value = String(s.bpm || 60); });
  if (o.songs[0]) bpmIn.value = String(Math.round((o.songs[0].bpm || 60) * (getSettings().gameSpeed === "slow" ? 0.8 : 1)));
  const LAG = 0.09; // the detector hears a note about this long after it starts
  function judge(e) {
    const a = run.t0 + e.start + Math.min(LAG + 0.03, e.dur * 0.45), z = run.t0 + e.start + e.dur + LAG * 0.6;
    const rs = run.reads.filter(r => r.t >= a && r.t <= z), frames = Math.max(1, (z - a) / 0.033);
    const ok = rs.filter(r => r.near === e.semi).length >= frames * 0.35;
    if (!ok) return "miss";
    const first = run.reads.find(r => r.t >= run.t0 + e.start - 0.25 && r.t <= z && r.near === e.semi);
    return first && Math.abs(first.t - LAG - (run.t0 + e.start)) <= 0.12 ? "perfect" : "good";
  }
  function draw() {
    const { g, W, H } = fitCanvas(canvas, 0.6), col = colors(), font = getComputedStyle(document.body).fontFamily;
    g.clearRect(0, 0, W, H);
    if (!run) { g.fillStyle = col.muted; g.font = "16px " + font; g.fillText("Choose a song and press Start", 16, H / 2); return; }
    const lanes = run.lanes, lw = (W - 20) / lanes.length, hitY = H - 50, pps = 140, now = ac().currentTime;
    lanes.forEach((s, i) => {
      g.fillStyle = i % 2 ? col.surface : col.sunken; g.fillRect(10 + i * lw, 0, lw, H);
      g.font = "14px " + font; canvasNote(g, 10 + i * lw + lw / 2, H - 16, s, 16, col.muted);
    });
    g.strokeStyle = col.accent; g.lineWidth = 3; g.beginPath(); g.moveTo(10, hitY); g.lineTo(W - 10, hitY); g.stroke(); g.lineWidth = 1;
    for (const e of run.ev) {
      const yStart = hitY - (run.t0 + e.start - now) * pps, len = Math.max(10, e.dur * pps - 4);
      if (yStart < -10 || yStart - len > H) continue;
      const i = lanes.indexOf(e.semi), res = run.results.get(e);
      g.fillStyle = res === "perfect" ? col.good : res === "good" ? col.accent : res === "miss" ? col.bad : col.bamboo;
      g.beginPath(); g.roundRect ? g.roundRect(14 + i * lw, yStart - len, lw - 8, len, 6) : g.rect(14 + i * lw, yStart - len, lw - 8, len); g.fill();
      // Shapes as well as colours: a tick for right, a cross for missed.
      if (res) { g.fillStyle = col.surface; g.font = "bold 16px " + font; g.fillText(res === "miss" ? "\u2717" : res === "perfect" ? "\u2713\u2713" : "\u2713", 14 + i * lw + 6, yStart - 6); }
    }
    g.fillStyle = col.ink; g.font = "bold 15px " + font;
    g.fillText(`Score ${run.score}   Streak ${run.streak}`, 14, 22);
    const next = run.ev.find(e => run.t0 + e.start > now - 0.05);
    if (next) { const f = fingOf(next.semi); g.font = "14px " + font; g.fillText(`Next: ${codeOf(next.semi)}  ${f.f ? f.f.slice(0, 3) + " " + f.f.slice(3) : ""}`, W - 190, 22); }
    if (run.flashText && run.flashUntil > now) { g.font = "bold 22px " + font; g.fillStyle = run.flashText === "Miss" ? col.bad : col.good; g.fillText(run.flashText, W / 2 - 40, hitY - 20); }
  }
  function loop() {
    if (!run) return;
    const now = ac().currentTime;
    for (const e of run.ev) {
      if (run.results.has(e) || now < run.t0 + e.start + e.dur + LAG + 0.1) continue;
      const res = run.watch ? "good" : judge(e);
      run.results.set(e, res);
      if (!run.watch) {
        if (res === "miss") run.streak = 0; else { run.streak++; run.score += (res === "perfect" ? 100 : 50) * (1 + Math.floor(run.streak / 8)); }
        run.flashText = res === "perfect" ? "Perfect" : res === "good" ? "Good" : "Miss"; run.flashUntil = now + 0.5;
      }
    }
    draw();
    if (run.results.size >= run.ev.length) return end();
    raf = requestAnimationFrame(loop);
  }
  function end() {
    cancelAnimationFrame(raf); m.stop();
    const r = run; run = null; btn.textContent = "Play again";
    if (r.stop) r.stop();
    if (r.watch) { status.textContent = "That is how it goes. Now untick \"Play it for me\" and play it yourself."; draw(); return; }
    const vals = [...r.results.values()], perfect = vals.filter(v => v === "perfect").length, good = vals.filter(v => v === "good").length;
    const pct = Math.round((perfect + good) / Math.max(1, vals.length) * 100), stars = pct >= 95 && perfect >= vals.length * 0.6 ? 3 : pct >= 80 ? 2 : pct >= 50 ? 1 : 0;
    const key = "bansuri.game.falling.best." + r.title, best = store(key, 0);
    if (r.score > best) storeSet(key, r.score);
    status.textContent = `${r.title}: ${perfect} perfect, ${good} good, ${vals.length - perfect - good} missed. Score ${r.score}. ${"*".repeat(stars)}${"-".repeat(3 - stars)}` + (r.score > best ? " A new best!" : "");
    emitLive({ type: "game", game: "falling", title: r.title, score: r.score, pct, stars, best: r.score > best });
    emitLive({ type: "play", piece: r.title, bpm: r.bpm, ok: perfect + good, n: vals.length, onTime: perfect, timed: vals.length });
    if (o.onEnd) o.onEnd({ score: r.score, pct, stars });
    draw();
  }
  btn.addEventListener("click", async () => {
    if (run) { if (run.stop) run.stop(); run.results.clear(); cancelAnimationFrame(raf); m.stop(); run = null; btn.textContent = "Start"; draw(); return; }
    const song = o.songs[Number(songSel.value)];
    if (!song) return;
    ac();
    const bpm = Math.min(160, Math.max(40, Number(bpmIn.value) || 60));
    const b = buildEvents(parseNotation(song.notation).tokens, bpm);
    const ev = b.ev.filter(e => e.dur > 0.05);
    run = { title: song.title, bpm, ev, lanes: [...new Set(ev.map(e => e.semi))].sort((x, y) => x - y), results: new Map(), reads: [], score: 0, streak: 0, watch: watch.checked, t0: 0, stop: null };
    if (!run.watch) {
      const ok = await m.start(r => { if (run && r.semi !== null) { run.reads.push(r); if (run.reads.length > 4000) run.reads.splice(0, 2000); } }, btn);
      if (!ok || !run) { run = null; status.textContent = "Not started. Press Start when you are ready (the microphone must be allowed), or tick \"Play it for me\" to just watch."; return; }
    }
    const stop = playEvents(b.ev, b.beats, { bpm, click: true, countIn: b.barLen, mute: !run.watch });
    run.stop = stop; run.t0 = stop.t0;
    btn.textContent = "Stop"; status.textContent = run.watch ? "Watch and listen." : "Count-in... then play each note as it lands.";
    raf = requestAnimationFrame(loop);
  });
  requestAnimationFrame(draw);
  return { el, destroy() { if (run) { if (run.stop) run.stop(); cancelAnimationFrame(raf); run = null; } m.stop(); } };
}

// ---------- Jam with the band ----------
// Tanpura and tabla play in a raga; you improvise. Notes in the raga light up; a note outside it is
// pointed out with the nearest raga notes. opts: { ragas: [{ name, notes: [semi], first, phrases }] }
const THEKAS = {
  keherwa: { name: "Keherwa (8)", bols: "Dha Ge Na Ti Na Ka Dhi Na".split(" ") },
  dadra: { name: "Dadra (6)", bols: "Dha Dhi Na Dha Ti Na".split(" ") },
  teentaal: { name: "Teentaal (16)", bols: "Dha Dhin Dhin Dha Dha Dhin Dhin Dha Dha Tin Tin Ta Ta Dhin Dhin Dha".split(" ") },
};
export function jam(opts) {
  const o = Object.assign({ ragas: [] }, opts || {});
  const ragaSel = h("select", { class: "input", "aria-label": "Raga", style: { width: "auto" } }, o.ragas.map((r, i) => h("option", { value: String(i) }, r.name)));
  const talaSel = h("select", { class: "input", "aria-label": "Tala", style: { width: "auto" } }, Object.entries(THEKAS).map(([k, t]) => h("option", { value: k }, t.name)));
  const bpmIn = h("input", { class: "input", type: "number", min: "50", max: "140", value: "80", style: { width: "5rem" }, "aria-label": "Tempo" });
  const keys = h("div", { class: "jam-keys" });
  const trail = h("div", { class: "jam-trail mono", "aria-live": "off" });
  const status = h("p", { class: "small", "aria-live": "polite" }, "Choose a raga and press Start. Improvise with its notes; the lit keys show what you play.");
  const btn = h("button", { type: "button", class: "btn primary" }, "Start jamming");
  const idea = h("button", { type: "button", class: "btn", disabled: true }, "Play me a phrase idea");
  const el = h("div", { class: "stack game" }, h("div", { class: "row" }, h("label", { class: "field" }, "Raga", ragaSel), h("label", { class: "field" }, "Tala", talaSel), h("label", { class: "field" }, "BPM", bpmIn), btn, idea), keys, trail, status);
  const m = mic(el);
  let run = null;
  const raga = () => o.ragas[Number(ragaSel.value)];
  function drawKeys(hit, outside) {
    const r = raga(); if (!r) return;
    const span = []; for (let s = -5; s <= 12; s++) if (r.notes.some(n => ((n - s) % 12 + 12) % 12 === 0)) span.push(s);
    keys.replaceChildren(...span.map(s => h("span", { class: "jam-key" + (hit === s ? " on" : "") }, noteLabel(s))), outside !== undefined ? h("span", { class: "jam-key out", "aria-label": codeOf(outside) + " is outside the raga" }, "! ", noteLabel(outside)) : null);
  }
  ragaSel.addEventListener("change", () => drawKeys());
  function tick() {
    const c = ac(), T = THEKAS[talaSel.value], beat = 60 / Math.min(140, Math.max(50, Number(bpmIn.value) || 80));
    while (run.next < c.currentTime + 0.15) { tablaBol(run.next, T.bols[run.i % T.bols.length], beat, run.i % T.bols.length === 0); run.next += beat; run.i++; }
  }
  btn.addEventListener("click", async () => {
    if (run) return stop(true);
    const r = raga(); if (!r) return;
    ac();
    run = { seq: noteSequencer(), notes: 0, inside: 0, started: Date.now(), next: ac().currentTime + 0.2, i: 0, timer: 0, mine: false, last: [] };
    const ok = await m.start(rd => {
      if (!run) return;
      const n = run.seq.feed(rd); if (!n) return;
      run.notes++;
      const inRaga = r.notes.some(x => ((x - n.semi) % 12 + 12) % 12 === 0);
      if (inRaga) { run.inside++; drawKeys(n.semi); status.textContent = ""; }
      else {
        drawKeys(undefined, n.semi);
        // The raga notes a semitone or two away: usually the note that was meant.
        const pc = ((n.semi % 12) + 12) % 12, dist = x => { const d = ((x - pc) % 12 + 12) % 12; return Math.min(d, 12 - d); };
        const near = [...new Set(r.notes.map(x => ((x % 12) + 12) % 12))].sort((a, b) => dist(a) - dist(b)).slice(0, 2);
        status.textContent = `${codeOf(n.semi)} is not in ${r.name}. Nearby raga notes: ${near.map(x => codeOf(x)).join(" or ")}.`;
        if (cuesOn()) speak("out_of_raga");
      }
      run.last.push(codeOf(n.semi) + (inRaga ? "" : "!")); if (run.last.length > 16) run.last.shift();
      trail.textContent = run.last.join(" ");
    }, btn);
    if (!ok || !run) { run = null; status.textContent = "Not started. Press Start when you are ready (the microphone must be allowed)."; return; }
    run.started = Date.now(); run.next = ac().currentTime + 0.2;
    if (!tanpura.isOn()) { tanpura.setFirst(r.first || "pa"); tanpura.start(); run.mine = true; }
    run.timer = setInterval(tick, 40); tick();
    btn.textContent = "Stop"; idea.disabled = false; drawKeys();
    status.textContent = "Jam! Start slowly on Sa, then explore the raga's notes. Rest on Sa or Pa.";
  });
  idea.addEventListener("click", () => {
    const r = raga(); if (!r || !r.phrases.length) return;
    const p = r.phrases[Math.floor(Math.random() * r.phrases.length)], c = ac(), t0 = c.currentTime + 0.1, dur = 0.5;
    p.forEach((s, i) => { const v = makeVoice(hzOf(s), t0 + i * dur); v.stop(t0 + i * dur + dur * 0.9); });
    muteListening(t0 + p.length * dur + 0.3);
    status.textContent = "Idea: " + p.map(codeOf).join(" ") + ". Play it back, then vary it.";
  });
  function stop(report) {
    if (!run) return;
    clearInterval(run.timer); m.stop();
    if (run.mine && tanpura.isOn()) tanpura.stop();
    const r = run, mins = (Date.now() - r.started) / 60000; run = null;
    btn.textContent = "Start jamming"; idea.disabled = true;
    if (report && r.notes) {
      const pct = Math.round(r.inside / r.notes * 100);
      status.textContent = `${r.notes} notes in ${mins.toFixed(1)} min, ${pct}% inside ${raga().name}.` + (pct >= 90 ? " Beautifully in the raga." : " Notes marked ! were outside the raga.");
      emitLive({ type: "game", game: "jam", raga: raga().name, minutes: Math.round(mins * 10) / 10, pct, score: r.inside });
    }
  }
  drawKeys();
  return { el, destroy() { stop(false); } };
}
