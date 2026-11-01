// Ornament and technique games. Meend bridge, Kan flick, Murki chase and Andolan lamp are rounds
// judged by the ornament trainer's analysers (ornaments.js): hear the shape, play it, score the
// checks it passes. Name the ornament trains the ear; Swell and fade trains breath dynamics with a
// steady pitch; Tongued beats trains even tonguing against a metronome. Each returns { el, destroy }.
// The pure parts are exported for tests.
import { h, store, storeSet } from "./util.js";
import { codeOf } from "./core/theory.js";
import { ac, master, playCurve, click } from "./core/audio.js";
import { relSemi } from "./core/pitch.js";
import { noteSequencer, emitLive, muteListening } from "./core/listen.js";
import { t as tr } from "./core/i18n.js";
import { seeded, colors, fitCanvas, chime, mic } from "./games.js";
import { targetCurve, analyse, cleanReadings } from "./ornaments.js";

// ---------- Pure parts ----------
const SCALE = [-5, -3, -1, 0, 2, 4, 5, 7, 9, 11, 12, 14];
const up = n => SCALE.find(s => s > n) ?? n + 2;
const down = n => [...SCALE].reverse().find(s => s < n) ?? n - 2;
const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];

// Exercises for each ornament, on the learner's own flute (semitones from Sa).
export function meendEx(rnd) {
  const a = pick([0, 2, 4, 5, 7, 9], rnd), steps = rnd() < 0.6 ? 1 : 2, rise = rnd() < 0.5;
  let b = a; for (let i = 0; i < steps; i++) b = rise ? up(b) : down(b);
  return { from: a, to: b, dur: 0.9 };
}
export function kanEx(rnd) {
  const main = pick([0, 2, 4, 5, 7, 9], rnd);
  return { main, grace: rnd() < 0.7 ? up(main) : down(main) };
}
// Murki speed grows with the level: the demonstration's notes get shorter, and so does the limit.
export function murkiEx(rnd, level) {
  const m = pick([0, 2, 4, 7, 9], rnd), lv = Math.max(0, level || 0);
  return { notes: rnd() < 0.5 ? [up(m), m, down(m), m] : [down(m), m, up(m), m], each: Math.max(0.08, 0.16 - lv * 0.02), maxEach: Math.max(0.1, 0.24 - lv * 0.03) };
}
export const ANDOLAN_NOTES = [{ note: 1, label: "Komal Re" }, { note: 3, label: "Komal Ga" }, { note: 8, label: "Komal Dha" }];
export function andolanEx(rnd) { const a = pick(ANDOLAN_NOTES, rnd); return { note: a.note, label: a.label, depth: 0.5, rate: 0.8, dur: 5 }; }
const EX = { meend: meendEx, kan: kanEx, murki: murkiEx, andolan: andolanEx };
export function exLabel(key, e) {
  return key === "meend" ? codeOf(e.from) + " - " + codeOf(e.to) : key === "kan" ? "(" + codeOf(e.grace) + ")" + codeOf(e.main)
    : key === "murki" ? e.notes.map(codeOf).join(" ") : key === "andolan" ? codeOf(e.note) : codeOf(e.note);
}

// Name the ornament: a phrase with one ornament (or none). Returns { kind, ex, curve }.
export const KINDS = ["plain", "meend", "kan", "murki", "andolan"];
export function ornamentQuestion(rnd) {
  const kind = pick(KINDS, rnd);
  if (kind === "plain") { const note = pick([0, 2, 4, 5, 7], rnd), curve = []; for (let t = 0; t <= 1.4; t += 0.02) curve.push({ t: Math.round(t * 1000) / 1000, semi: note }); return { kind, ex: { note }, curve }; }
  const ex = kind === "andolan" ? { ...andolanEx(rnd), dur: 3.2 } : EX[kind](rnd, 0);
  return { kind, ex, curve: targetCurve(kind, ex) };
}

// Swell and fade: a held note that grows louder, then softer, with the pitch staying put.
// samples: [{ t, semi, level }]. Returns the measures and a score out of 100.
const corr = (a, b) => {
  const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
  return sa && sb ? s / Math.sqrt(sa * sb) : 0;
};
const clamp01 = x => Math.max(0, Math.min(1, x));
export function swellScore(samples) {
  const v = samples.filter(s => s.semi !== null && s.level > 0);
  if (v.length < 20 || v[v.length - 1].t - v[0].t < 3) return null;
  const t0 = v[0].t, t1 = v[v.length - 1].t, max = Math.max(...v.map(s => s.level));
  const lv = v.map(s => s.level / max), tri = v.map(s => 1 - Math.abs(2 * (s.t - t0) / (t1 - t0) - 1));
  const sortedL = lv.slice().sort((a, b) => a - b), ratio = 1 / Math.max(0.02, sortedL[Math.floor(lv.length * 0.1)]);
  const shape = corr(lv, tri);
  const semis = v.map(s => s.semi).sort((a, b) => a - b), med = semis[semis.length >> 1];
  const drift = Math.round((semis[Math.floor(semis.length * 0.9)] - semis[Math.floor(semis.length * 0.1)]) * 100);
  const follows = corr(lv, v.map(s => s.semi - med));
  const score = Math.round(30 * clamp01((ratio - 1) / 2) + 30 * clamp01(shape / 0.85) + 40 * clamp01(1 - (drift - 10) / 50));
  return { score, ratio: Math.round(ratio * 10) / 10, shape: Math.round(shape * 100) / 100, drift, follows: Math.round(follows * 100) / 100, seconds: Math.round((t1 - t0) * 10) / 10 };
}

// Tongued beats: note onsets against the beat times (seconds). The microphone hears a note a
// little after it starts, so the steady lag (the median) is taken out and evenness is judged.
export function tongueScore(onsets, beats) {
  const beat = beats.length > 1 ? beats[1] - beats[0] : 0.8, used = new Set(), offs = [];
  let extra = 0;
  for (const t of onsets) {
    let bi = -1, bd = Infinity;
    beats.forEach((b, i) => { const d = Math.abs(t - b - 0.08); if (d < bd) { bd = d; bi = i; } });
    if (bi < 0 || bd > beat * 0.45 || used.has(bi)) { extra++; continue; }
    used.add(bi); offs.push((t - beats[bi]) * 1000);
  }
  if (!offs.length) return { hits: 0, of: beats.length, extra, spread: null, score: 0 };
  const med = offs.slice().sort((a, b) => a - b)[offs.length >> 1];
  const spread = Math.round(Math.sqrt(offs.reduce((a, x) => a + (x - med) ** 2, 0) / offs.length));
  const score = Math.max(0, Math.round(used.size * 5 - extra * 3 + (spread <= 35 ? 20 : spread <= 60 ? 10 : 0)));
  return { hits: used.size, of: beats.length, extra, spread, score };
}

// ---------- Shared ----------
const font = () => getComputedStyle(document.body).fontFamily;
function keepBest(key, score) { const best = store(key, 0); if (score > best) storeSet(key, score); return { best, isNew: score > best }; }
const bestText = b => b.isNew ? "A new best!" : "Your best: " + b.best + ".";
function say(status, ...parts) { status.replaceChildren(...parts.filter(Boolean).flatMap((x, i) => [i ? " " : null, h("span", null, x)]).filter(x => x !== null)); }
const notStarted = "Not started. Press Start when you are ready (the microphone must be allowed).";

// Target and attempt curves on one canvas.
function drawCurves(canvas, target, attempt, hud) {
  const { g, W, H } = fitCanvas(canvas, 0.45), col = colors();
  g.clearRect(0, 0, W, H);
  const all = (target || []).concat((attempt || []).filter(r => r.semi !== null));
  if (all.length) {
    let lo = Math.floor(Math.min(...all.map(r => r.semi))) - 1, hi = Math.ceil(Math.max(...all.map(r => r.semi))) + 1; if (hi - lo < 4) hi = lo + 4;
    const tEnd = Math.max(target && target.length ? target[target.length - 1].t : 1, attempt && attempt.length ? attempt[attempt.length - 1].t : 0) + 0.1;
    const x = t => 30 + t / tEnd * (W - 36), y = s => 26 + (hi - s) / (hi - lo) * (H - 34);
    g.font = "11px " + font();
    for (let s = lo; s <= hi; s++) {
      const nat = [0, 2, 4, 5, 7, 9, 11].includes(((s % 12) + 12) % 12);
      g.strokeStyle = col.line; g.globalAlpha = nat ? 0.9 : 0.35; g.beginPath(); g.moveTo(30, y(s)); g.lineTo(W, y(s)); g.stroke(); g.globalAlpha = 1;
      if (nat) { g.fillStyle = col.muted; g.fillText(codeOf(s), 2, y(s) + 4); }
    }
    const line = (pts, c, w, dash) => { g.strokeStyle = c; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath(); let pen = false, prev = null;
      for (const p of pts) { if (p.semi === null || (prev && p.t - prev.t > 0.12)) { pen = false; prev = p.semi === null ? null : p; if (p.semi === null) continue; } if (pen) g.lineTo(x(p.t), y(p.semi)); else { g.moveTo(x(p.t), y(p.semi)); pen = true; } prev = p; }
      g.stroke(); g.setLineDash([]); g.lineWidth = 1; };
    if (target) line(target, col.muted, 3, [6, 4]);
    if (attempt && attempt.length) line(attempt, col.accent, 2);
  }
  if (hud) { g.fillStyle = col.ink; g.font = "bold 14px " + font(); g.fillText(hud, 8, 16); }
}

// ---------- Ornament rounds (Meend bridge, Kan flick, Murki chase, Andolan lamp) ----------
// cfg: { id, key, label, intro, rounds, after(state, res) } ; each round: the demonstration plays
// (the microphone is muted meanwhile), then the attempt is recorded until a short silence.
function ornamentRounds(cfg) {
  const canvas = h("canvas", { class: "game-canvas", role: "img", "aria-label": cfg.label });
  const demo = h("input", { type: "checkbox", id: cfg.id + "-demo", checked: true });
  const status = h("p", { class: "small", "aria-live": "polite" }, cfg.intro);
  const checks = h("div", { class: "stack", "aria-live": "polite" });
  const btn = h("button", { type: "button", class: "btn primary" }, "Start");
  const hear = h("button", { type: "button", class: "btn", hidden: true }, "Hear it again");
  const el = h("div", { class: "stack game" }, h("div", { class: "row" }, h("label", { class: "check", for: cfg.id + "-demo" }, demo, "Play each one for me first"), btn, hear), h("div", { class: "game-stage" }, canvas), status, checks);
  const m = mic(el);
  let run = null, timer = 0;
  const hud = () => run ? tr("Round") + " " + Math.min(run.round, cfg.rounds) + "/" + cfg.rounds + "   " + tr("Score") + " " + run.total + (cfg.hud ? "   " + cfg.hud(run) : "") : "";
  const redraw = () => drawCurves(canvas, run && run.ex ? targetCurve(cfg.key, run.ex) : null, run ? run.attempt : null, hud());
  function playDemo() {
    if (!run) return 0;
    const p = playCurve(targetCurve(cfg.key, run.ex), 1);
    muteListening(ac().currentTime + p.seconds + 0.15);
    return p.seconds + 0.2;
  }
  function nextRound() {
    if (!run) return;
    run.round++;
    if (run.round > cfg.rounds) return end();
    run.ex = EX[cfg.key](run.rnd, run.level); run.reads = []; run.attempt = null; run.listening = false; run.voicedAt = null; run.lastVoice = null;
    checks.replaceChildren();
    const wait = demo.checked ? playDemo() : 0;
    say(status, demo.checked ? "Listen:" : "Your turn:", exLabel(cfg.key, run.ex));
    redraw();
    clearTimeout(timer);
    timer = setTimeout(() => { if (!run) return; run.listening = true; run.since = performance.now(); say(status, "Your turn:", exLabel(cfg.key, run.ex)); }, wait * 1000);
  }
  function finishAttempt() {
    run.listening = false;
    const res = analyse(cfg.key, run.ex, run.reads, codeOf);
    run.attempt = cleanReadings(run.reads);
    const pts = res.passed;
    run.total += pts; run.max += res.of || 4;
    if (cfg.after) cfg.after(run, res);
    chime(res.of && res.passed === res.of);
    const firstBad = res.checks.find(c => !c.ok);
    say(status, res.verdict, res.of ? pts + " of " + res.of + " points." : "");
    checks.replaceChildren(...(firstBad ? [h("div", { class: "notice" }, firstBad.text)] : res.checks.slice(0, 1).map(c => h("div", { class: "notice good" }, c.text))));
    redraw();
    clearTimeout(timer); timer = setTimeout(nextRound, 2600);
  }
  function onReading(r) {
    if (!run || !run.listening) return;
    const now = performance.now(), semi = r.f && r.semi !== null ? relSemi(r.f) : null;
    run.reads.push({ t: r.t, semi });
    if (semi !== null) { if (run.voicedAt === null) run.voicedAt = now; run.lastVoice = now; }
    const voicedFor = run.voicedAt === null ? 0 : (run.lastVoice - run.voicedAt) / 1000;
    const len = targetCurve(cfg.key, run.ex), maxLen = len[len.length - 1].t + 2.5;
    if (run.voicedAt !== null && ((now - run.lastVoice > 500 && voicedFor > 0.3) || (now - run.voicedAt) / 1000 > maxLen)) return finishAttempt();
    if (run.voicedAt === null && now - run.since > 8000) { say(status, "Nothing heard: on to the next one."); run.listening = false; clearTimeout(timer); timer = setTimeout(nextRound, 1200); run.max += 4; }
    if (run.reads.length % 6 === 0) { run.attempt = cleanReadings(run.reads); redraw(); }
  }
  function end() {
    clearTimeout(timer); m.stop();
    const r = run; run = null; btn.textContent = "Play again"; hear.hidden = true;
    const pct = r.max ? Math.round(r.total / r.max * 100) : 0, b = keepBest("bansuri.game." + cfg.id + ".best", pct);
    say(status, "Score " + r.total + " of " + r.max + " (" + pct + "%).", bestText(b), cfg.endText ? cfg.endText(r) : "");
    emitLive({ type: "game", game: cfg.id, score: pct, best: b.isNew });
  }
  // Hear it again: the demonstration, then a fresh attempt.
  hear.addEventListener("click", () => {
    if (!run || !run.ex) return;
    run.listening = false;
    const w = playDemo();
    clearTimeout(timer);
    timer = setTimeout(() => { if (run) { run.reads = []; run.voicedAt = null; run.lastVoice = null; run.listening = true; run.since = performance.now(); } }, w * 1000);
  });
  btn.addEventListener("click", async () => {
    if (run) return end();
    ac();
    run = { rnd: seeded(Math.floor(Math.random() * 1e9)), round: 0, total: 0, max: 0, level: 0, streak: 0, bestStreak: 0, ex: null, reads: [], attempt: null, listening: false };
    const ok = await m.start(onReading, btn);
    if (!ok || !run) { run = null; say(status, notStarted); return; }
    btn.textContent = "Stop"; hear.hidden = false;
    nextRound();
  });
  requestAnimationFrame(redraw);
  return { el, destroy() { clearTimeout(timer); m.stop(); run = null; } };
}

export const meendBridge = () => ornamentRounds({ id: "meendbridge", key: "meend", rounds: 6, label: "Meend bridge: glide from one note to the next; the dashed line is the target",
  intro: "Six glides between two notes. Hear each one, then glide: no step, no break, about a second, landing on the note. Each check passed is a point." });
export const kanFlick = () => ornamentRounds({ id: "kanflick", key: "kan", rounds: 8, label: "Kan flick: a flick of the grace note, then the main note",
  intro: "Eight notes with a kan, written (grace)main. Flick the grace note for an instant as the note starts, then hold the main note. Clean kans in a row build a streak.",
  hud: r => tr("Streak") + " " + r.streak, after: (r, res) => { if (res.of && res.passed === res.of) { r.streak++; r.bestStreak = Math.max(r.bestStreak, r.streak); } else r.streak = 0; },
  endText: r => "Longest streak of clean kans: " + r.bestStreak + "." });
export const murkiChase = () => ornamentRounds({ id: "murkichase", key: "murki", rounds: 8, label: "Murki chase: play the quick turn of notes; clean ones make the next faster",
  intro: "Eight murkis. Play each as one light, quick gesture and settle on the last note. A clean murki raises the speed for the next one.",
  hud: r => tr("Speed") + " " + (r.level + 1), after: (r, res) => { if (res.of && res.passed === res.of) r.level++; else r.level = Math.max(0, r.level - 1); },
  endText: r => "Top speed reached: " + (r.level + 1) + "." });
export const andolanLamp = () => ornamentRounds({ id: "andolanlamp", key: "andolan", rounds: 3, label: "Andolan lamp: swing the note slowly below its place and back",
  intro: "Three andolans, on komal Re, komal Ga or komal Dha. Hold the note and sway it slowly a little below its place and back, about once a second, evenly." });

// ---------- Name the ornament (by ear) ----------
export function nameOrnament(opts) {
  const o = Object.assign({ rounds: 10 }, opts || {});
  const status = h("p", { class: "small", "aria-live": "polite" }, "A short phrase plays with one ornament, or none. Which is it? Ten questions.");
  const btn = h("button", { type: "button", class: "btn primary" }, "Start");
  const again = h("button", { type: "button", class: "btn", hidden: true }, "Hear again");
  const LABEL = { plain: "Plain note", meend: "Meend", kan: "Kan", murki: "Murki", andolan: "Andolan" };
  const answers = h("div", { class: "row", hidden: true }, KINDS.map(k => h("button", { type: "button", class: "btn", "data-k": k, onclick: () => answer(k) }, LABEL[k])));
  const el = h("div", { class: "stack game" }, h("div", { class: "row" }, btn, again), answers, status);
  const WHAT = { plain: "A plain note: no movement in the pitch.", meend: "Meend: one smooth glide from note to note.", kan: "Kan: a quick touch of another note just before the note.", murki: "Murki: a quick turn of several notes around the note.", andolan: "Andolan: a slow swing of the note below its place and back." };
  let run = null, timer = 0;
  const play = () => { if (run) playCurve(run.q.curve, 1); };
  function next() {
    if (!run) return;
    if (run.n >= o.rounds) return end();
    run.n++; run.q = ornamentQuestion(run.rnd); run.answered = false;
    say(status, "Question " + run.n + " of " + o.rounds + ": which ornament?"); play();
  }
  function answer(k) {
    if (!run || run.answered) return;
    run.answered = true;
    const ok = k === run.q.kind;
    if (ok) { run.score++; chime(true); } else chime(false);
    say(status, ok ? "Right." : "Not quite.", WHAT[run.q.kind]);
    clearTimeout(timer); timer = setTimeout(next, 2200);
  }
  function end() {
    clearTimeout(timer);
    const r = run; run = null; btn.textContent = "Play again"; answers.hidden = true; again.hidden = true;
    const b = keepBest("bansuri.game.nameorn.best", r.score);
    say(status, "Score " + r.score + " of " + o.rounds + ".", bestText(b));
    emitLive({ type: "game", game: "nameorn", score: r.score, best: b.isNew });
  }
  again.addEventListener("click", play);
  btn.addEventListener("click", () => {
    if (run) return end();
    ac();
    run = { rnd: seeded(Math.floor(Math.random() * 1e9)), n: 0, score: 0, q: null, answered: false };
    btn.textContent = "Stop"; answers.hidden = false; again.hidden = false; next();
  });
  return { el, destroy() { clearTimeout(timer); run = null; } };
}

// ---------- Swell and fade ----------
// Hold one note for about six seconds: grow louder for the first half and softer for the second,
// keeping the pitch where it is (blowing harder raises a flute's pitch; the lips and the angle of
// the air correct it).
export function swellFade(opts) {
  const o = Object.assign({ seconds: 6 }, opts || {});
  const canvas = h("canvas", { class: "game-canvas", role: "img", "aria-label": "Swell and fade: the target loudness and yours, and your pitch" });
  const status = h("p", { class: "small", "aria-live": "polite" }, "Hold one note for six seconds: grow louder for three, then softer for three, as the dashed shape shows, keeping the pitch exactly where it is.");
  const btn = h("button", { type: "button", class: "btn primary" }, "Start");
  const el = h("div", { class: "stack game" }, h("div", { class: "row" }, btn), h("div", { class: "game-stage" }, canvas), status);
  const m = mic(el);
  let run = null, raf = 0;
  function draw() {
    const { g, W, H } = fitCanvas(canvas, 0.45), col = colors();
    g.clearRect(0, 0, W, H);
    const x = t => 10 + t / o.seconds * (W - 20), yl = v => H - 12 - v * (H * 0.55);
    g.setLineDash([6, 4]); g.strokeStyle = col.muted; g.lineWidth = 3; g.beginPath(); g.moveTo(x(0), yl(0.15)); g.lineTo(x(o.seconds / 2), yl(1)); g.lineTo(x(o.seconds), yl(0.15)); g.stroke(); g.setLineDash([]); g.lineWidth = 1;
    if (!run || !run.s.length) { g.fillStyle = col.muted; g.font = "15px " + font(); g.fillText(tr("Press Start"), 12, 20); return; }
    const v = run.s.filter(s => s.semi !== null), max = Math.max(1e-6, ...v.map(s => s.level)), t0 = run.t0;
    g.strokeStyle = col.accent; g.lineWidth = 2; g.beginPath(); v.forEach((s, i) => { const xx = x(s.t - t0), yy = yl(s.level / max); if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy); }); g.stroke(); g.lineWidth = 1;
    if (v.length) {
      const med = v.map(s => s.semi).sort((a, b) => a - b)[v.length >> 1], yp = c => H * 0.2 - c / 50 * (H * 0.15);
      g.strokeStyle = col.line; g.beginPath(); g.moveTo(10, yp(0)); g.lineTo(W - 10, yp(0)); g.stroke();
      g.strokeStyle = col.warn; g.beginPath(); v.forEach((s, i) => { const xx = x(s.t - t0), yy = yp((s.semi - med) * 100); if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy); }); g.stroke();
      g.fillStyle = col.muted; g.font = "12px " + font(); g.fillText(tr("Pitch"), 12, H * 0.2 - 6); g.fillText(tr("Loudness"), 12, H - 16);
    }
  }
  function step() {
    if (!run) return;
    draw();
    if (run.t0 !== null && ac().currentTime - run.t0 >= o.seconds + 0.3) return end();
    raf = requestAnimationFrame(step);
  }
  function end() {
    cancelAnimationFrame(raf); m.stop();
    const r = run; run = null; btn.textContent = "Play again";
    const res = swellScore(r.s);
    if (!res) { say(status, "Hold the note for the whole six seconds, then try again."); return; }
    const b = keepBest("bansuri.game.swell.best", res.score);
    const tips = [];
    if (res.ratio < 2) tips.push("Make a bigger difference between soft and loud.");
    if (res.shape < 0.6) tips.push("Grow evenly to the middle, then fade evenly, like the dashed shape.");
    if (res.drift > 25) tips.push(res.follows > 0.4 ? "The pitch rose as you got louder: as you blow harder, lower the jaw a little or roll the flute in a touch." : res.follows < -0.4 ? "The pitch fell as you got softer: as you blow softer, aim the air a little higher." : "The pitch wandered: keep the lips and the flute still.");
    say(status, "Score " + res.score + " of 100. Pitch moved " + res.drift + " cents.", bestText(b), ...tips);
    emitLive({ type: "game", game: "swell", score: res.score, best: b.isNew });
    run = { s: r.s, t0: r.t0 }; draw(); run = null;
  }
  btn.addEventListener("click", async () => {
    if (run) return end();
    ac();
    run = { s: [], t0: null };
    const ok = await m.start(r => {
      if (!run) return;
      const semi = r.semi !== null ? r.semi : null;
      if (semi !== null && run.t0 === null) run.t0 = r.t;
      if (run.t0 !== null) run.s.push({ t: r.t, semi, level: r.level || 0 });
    }, btn);
    if (!ok || !run) { run = null; say(status, notStarted); return; }
    btn.textContent = "Stop"; say(status, "Start the note softly; the clock starts with it."); raf = requestAnimationFrame(step);
  });
  requestAnimationFrame(draw);
  return { el, destroy() { cancelAnimationFrame(raf); m.stop(); run = null; } };
}

// ---------- Tongued beats ----------
// A metronome counts four, then sixteen beats: tongue one note ("tu") on every beat.
export function tonguedBeats(opts) {
  const o = Object.assign({ beats: 16 }, opts || {});
  const bpmSel = h("select", { class: "input", "aria-label": "Speed", style: { width: "auto" } }, [60, 72, 84, 96, 112].map(b => h("option", { value: String(b) }, b + " BPM")));
  bpmSel.value = store("bansuri.game.tongue.bpm", "72");
  const status = h("p", { class: "small", "aria-live": "polite" }, "The metronome counts four, then keep going for sixteen beats: on every beat, tongue one short Sa (\"tu\"). Headphones help, so the microphone hears only the flute.");
  const btn = h("button", { type: "button", class: "btn primary" }, "Start");
  const dots = h("div", { class: "row sambeats", "aria-hidden": "true" });
  const el = h("div", { class: "stack game" }, h("div", { class: "row" }, h("label", { class: "field" }, "Speed", bpmSel), btn), dots, status);
  const m = mic(el);
  let run = null, timer = 0, bus = null;
  const silence = () => { if (bus) { try { bus.disconnect(); } catch (e) { /* already */ } bus = null; } };
  function end() {
    clearTimeout(timer); silence(); m.stop();
    const r = run; run = null; btn.textContent = "Play again";
    const res = tongueScore(r.onsets, r.beats), b = keepBest("bansuri.game.tongue.best." + r.bpm, res.score);
    say(status, "Notes on the beat: " + res.hits + " of " + res.of + ".", res.spread === null ? "" : "Evenness: " + res.spread + " ms" + (res.spread <= 35 ? " (very even)." : res.spread <= 60 ? " (fairly even)." : " (uneven: try a slower speed)."),
      res.extra ? "Extra notes between beats: " + res.extra + "." : "", "Score " + res.score + ".", bestText(b));
    emitLive({ type: "game", game: "tongue", level: String(r.bpm), score: res.score, best: b.isNew });
  }
  btn.addEventListener("click", async () => {
    if (run) return end();
    ac();
    const bpm = Number(bpmSel.value); storeSet("bansuri.game.tongue.bpm", bpmSel.value);
    const seq = noteSequencer({ minDur: 0.08, tol: 60 });
    run = { bpm, beats: [], onsets: [] };
    const ok = await m.start(r => { if (!run) return; const n = seq.feed(r); if (n) { run.onsets.push(n.t0); const i = run.beats.findIndex(b => Math.abs(n.t0 - 0.08 - b) < 30 / bpm); if (i >= 0 && dots.children[i]) dots.children[i].classList.add("on"); } }, btn);
    if (!ok || !run) { run = null; say(status, notStarted); return; }
    // The clicks go through their own bus, so Stop silences them.
    const c = ac(), beat = 60 / bpm, t0 = c.currentTime + 0.3;
    bus = c.createGain(); bus.connect(master());
    for (let i = 0; i < 4; i++) click(t0 + i * beat, i === 0 ? "tali" : "tick", bus);
    for (let i = 0; i < o.beats; i++) { const t = t0 + (4 + i) * beat; run.beats.push(t); click(t, i % 4 === 0 ? "tali" : "tick", bus); }
    dots.replaceChildren(...run.beats.map((b, i) => h("span", { class: "sambeat" + (i % 4 === 0 ? " sam" : "") }, String(i % 4 + 1))));
    btn.textContent = "Stop"; say(status, "Count in: 1, 2, 3, 4... then tongue Sa on every beat.");
    timer = setTimeout(end, (4 + o.beats + 1) * beat * 1000 + 300);
  });
  return { el, destroy() { clearTimeout(timer); silence(); m.stop(); run = null; } };
}
