// More games, each training one skill. With the microphone: Long-breath boat (long, steady tones),
// Glide road (meend and pitch control), Light the lanterns (finding notes fast), Bullseye (exact
// intonation) and Three floors (octaves). By ear, no microphone: Spot the wrong note (melodic
// memory), Sargam bingo (naming notes over the drone), Higher or lower (the first ear skill) and
// Catch the sam (counting a taal). Each returns { el, destroy }; results go out as "bansuri:live"
// events (type "game"), like the other games. The pure parts are exported for tests.
import { h, store, storeSet } from "./util.js";
import { codeOf, hzOf } from "./core/theory.js";
import { ac, makeVoice, tanpura, tablaBol } from "./core/audio.js";
import { noteSequencer, emitLive } from "./core/listen.js";
import { getSettings } from "./core/settings.js";
import { t as tr } from "./core/i18n.js";
import { NOTE_SETS, seeded, nextNote, colors, fitCanvas, chime, mic, setPicker, canvasNote, speedOf, THEKAS } from "./games.js";

// ---------- Pure parts ----------

// Bullseye: points for one arrow from how far the held note was from the target, in cents.
export function bullseyeScore(cents) {
  const a = Math.abs(cents);
  return a <= 5 ? 10 : a <= 10 ? 8 : a <= 15 ? 6 : a <= 25 ? 4 : a <= 40 ? 2 : 0;
}

// Glide road: segments that hold a note, then glide to the next one. roadAt gives the road's pitch.
export function makeRoad(set, rnd, seconds) {
  const road = [];
  let t = 0, note = set[0];
  while (t < seconds) {
    const hold = 1 + rnd() * 0.8, glide = 0.8 + rnd() * 0.8;
    road.push({ t0: t, t1: t + hold, from: note, to: note }); t += hold;
    let nx = note; for (let i = 0; i < 6 && nx === note; i++) nx = nextNote(set, note, rnd);
    road.push({ t0: t, t1: t + glide, from: note, to: nx }); t += glide; note = nx;
  }
  return road;
}
export function roadAt(road, t) {
  if (t <= road[0].t0) return road[0].from;
  const s = road.find(p => t >= p.t0 && t < p.t1) || road[road.length - 1];
  const x = Math.min(1, Math.max(0, (t - s.t0) / (s.t1 - s.t0)));
  return s.from + (s.to - s.from) * (0.5 - Math.cos(Math.PI * x) / 2);
}

// Spot the wrong note: a phrase, and the same phrase with one note (never the first) changed to a
// nearby note of the set.
export function wrongNoteRound(set, len, rnd) {
  const phrase = [set[Math.floor(rnd() * set.length)]];
  while (phrase.length < len) phrase.push(nextNote(set, phrase[phrase.length - 1], rnd));
  const pos = 1 + Math.floor(rnd() * (len - 1));
  const near = set.filter(s => s !== phrase[pos] && Math.abs(s - phrase[pos]) <= 4);
  const changed = phrase.slice();
  changed[pos] = near.length ? near[Math.floor(rnd() * near.length)] : set.find(s => s !== phrase[pos]);
  return { phrase, changed, pos };
}

// Sargam bingo: a card of 9 notes from 13; called notes come in a shuffled order.
export const BINGO_POOL = [-5, -3, -1, 0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
export function shuffled(list, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function bingoCard(rnd) { return shuffled(BINGO_POOL, rnd).slice(0, 9); }
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export function bingoLine(marked) { return LINES.find(l => l.every(i => marked[i])) || null; }

// Higher or lower: the answer, and a pair of notes whose gap narrows as the streak grows.
export function compareNotes(a, b) { return b > a ? "higher" : b < a ? "lower" : "same"; }
export function higherLowerPair(rnd, streak) {
  const a = [0, 2, 4, 5, 7, 9][Math.floor(rnd() * 6)];
  if (rnd() < 0.15) return [a, a];
  const max = streak < 4 ? 7 : streak < 8 ? 4 : 2, min = streak < 4 ? 3 : 1;
  const gap = min + Math.floor(rnd() * (max - min + 1));
  return [a, a + (rnd() < 0.5 ? -gap : gap)];
}

// Catch the sam: how far a tap was from the nearest sam (ms), and how good.
export function samJudge(t, sams, beat) {
  let best = null;
  for (const s of sams) if (best === null || Math.abs(t - s) < Math.abs(t - best)) best = s;
  if (best === null) return { off: null, kind: "miss" };
  const off = Math.round((t - best) * 1000), a = Math.abs(off);
  return { off, kind: a <= 60 ? "perfect" : a <= Math.min(150, beat * 250) ? "good" : "miss", sam: best };
}

// Three floors: the notes for each level, across the octaves.
export const FLOORS = [
  ["mu", "Middle and upper", [0, 2, 4, 12, 14, 16]],
  ["lm", "Lower and middle", [-5, -3, -1, 7, 9, 11]],
  ["all", "All three", [-5, -1, 0, 4, 7, 11, 12, 16]],
];
export const floorOf = semi => semi < 0 ? 0 : semi < 12 ? 1 : 2;

// ---------- Shared ----------
const font = () => getComputedStyle(document.body).fontFamily;
function keepBest(key, score) { const best = store(key, 0); if (score > best) storeSet(key, score); return { best, isNew: score > best }; }
// A status line made of whole sentences, each its own element so each is translated whole.
function say(status, ...parts) { status.replaceChildren(...parts.filter(Boolean).flatMap((x, i) => [i ? " " : null, h("span", null, x)]).filter(x => x !== null)); }
const bestText = b => b.isNew ? "A new best!" : "Your best: " + b.best + ".";
function shell(label, intro, extra) {
  const canvas = label ? h("canvas", { class: "game-canvas", role: "img", "aria-label": label }) : null;
  const status = h("p", { class: "small", "aria-live": "polite" }, intro);
  const btn = h("button", { type: "button", class: "btn primary" }, "Start");
  const el = h("div", { class: "stack game" }, h("div", { class: "row" }, extra || null, btn), canvas ? h("div", { class: "game-stage" }, canvas) : null, status);
  return { canvas, status, btn, el };
}
// Play notes in a row (ear games): returns the seconds it takes.
function playSeq(semis, dur) {
  const c = ac(), t0 = c.currentTime + 0.08, d = (dur || 0.55) / speedOf();
  semis.forEach((s, i) => { const v = makeVoice(hzOf(s), t0 + i * d); v.stop(t0 + i * d + d * 0.92); });
  return semis.length * d + 0.1;
}
const notStarted = "Not started. Press Start when you are ready (the microphone must be allowed).";

// ---------- Long-breath boat ----------
// Hold any note steadily: the boat sails while the note is steady and stops when it wobbles. In
// tune (within 15 cents of a note) it sails twice as fast. Three breaths make a round.
export function boat(opts) {
  const o = Object.assign({ breaths: 3 }, opts || {});
  const { canvas, status, btn, el } = shell("Long-breath boat: the boat sails while you hold a steady note", "Hold one long, steady note: the boat sails while the note stays steady, twice as fast when it is in tune. Three breaths make a round.");
  const m = mic(el);
  let raf = 0, run = null;
  function draw() {
    const { g, W, H } = fitCanvas(canvas, 0.4), col = colors();
    g.clearRect(0, 0, W, H);
    g.fillStyle = col.sunken; g.fillRect(0, H * 0.62, W, H * 0.38);
    g.strokeStyle = col.accent; g.lineWidth = 2; g.beginPath();
    for (let x = 0; x <= W; x += 8) g.lineTo(x, H * 0.62 + Math.sin((x + (run ? run.dist * 6 : 0)) / 18) * 3);
    g.stroke(); g.lineWidth = 1;
    const bx = W * 0.3, by = H * 0.58 + (run && run.rock ? Math.sin(performance.now() / 60) * 4 : 0);
    g.fillStyle = col.bamboo; g.beginPath(); g.moveTo(bx - 36, by); g.lineTo(bx + 36, by); g.lineTo(bx + 24, by + 14); g.lineTo(bx - 24, by + 14); g.closePath(); g.fill();
    g.strokeStyle = col.ink; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx, by - 46); g.stroke();
    g.fillStyle = run && run.fast ? col.accent : col.surface; g.beginPath(); g.moveTo(bx + 2, by - 44); g.lineTo(bx + 30, by - 10); g.lineTo(bx + 2, by - 10); g.closePath(); g.fill(); g.strokeStyle = col.line; g.stroke();
    g.fillStyle = col.ink; g.font = "bold 15px " + font();
    if (!run) { g.fillText(tr("Press Start"), 12, 22); return; }
    g.fillText(Math.floor(run.dist) + " m   " + tr("Breath") + " " + Math.min(run.breath + 1, o.breaths) + "/" + o.breaths, 12, 22);
    g.font = "13px " + font(); g.fillStyle = col.muted;
    if (run.heard) g.fillText(run.heard + (run.fast ? "  " + tr("in tune: full sail") : ""), 12, 42);
  }
  function step(now) {
    if (!run) return;
    const dt = Math.min(0.05, (now - run.last) / 1000); run.last = now;
    const sounding = now - run.heardAt < 250;
    if (sounding) {
      run.on = true; run.quiet = 0;
      run.rock = Math.abs(run.semi - run.anchor) > 0.3;
      if (!run.rock) run.dist += dt * (run.fast ? 2 : 1) * 4;
    } else if (run.on) {
      run.quiet += dt;
      if (run.quiet > 0.6) { run.on = false; run.breath++; run.anchor = null; chime(true); say(status, run.breath < o.breaths ? "Breathe in, then the next long note." : ""); }
    }
    draw();
    if (run.breath >= o.breaths) return end();
    raf = requestAnimationFrame(step);
  }
  function end() {
    cancelAnimationFrame(raf); m.stop();
    const r = run; run = null; btn.textContent = "Play again";
    const score = Math.floor(r.dist), b = keepBest("bansuri.game.boat.best", score);
    say(status, "The boat sailed " + score + " m.", bestText(b));
    emitLive({ type: "game", game: "boat", score, best: b.isNew });
    draw();
  }
  btn.addEventListener("click", async () => {
    if (run) { run.breath = o.breaths; return; }
    ac();
    run = { dist: 0, breath: 0, on: false, quiet: 0, semi: 0, anchor: null, heardAt: -1e9, rock: false, fast: false, heard: "", last: performance.now() };
    const ok = await m.start(r => {
      if (!run || r.semi === null || r.semi < -7.5 || r.semi > 26.5) return;
      run.semi = r.semi; run.heardAt = performance.now();
      run.anchor = run.anchor === null ? r.semi : run.anchor + (r.semi - run.anchor) * 0.05;
      run.fast = Math.abs(r.cents) <= 15; run.heard = codeOf(r.near) + " " + (r.cents > 0 ? "+" : "") + r.cents + " cents";
    }, btn);
    if (!ok || !run) { run = null; status.textContent = notStarted; return; }
    btn.textContent = "Stop"; say(status, "Sail! Hold a long, steady note."); raf = requestAnimationFrame(step);
  });
  requestAnimationFrame(draw);
  return { el, destroy() { if (run) { cancelAnimationFrame(raf); run = null; } m.stop(); } };
}

// ---------- Glide road ----------
// A road holds a note, then glides to the next; keep your pitch on the road. Score: the share of
// the time your note was on the road.
export function glideRoad(opts) {
  const o = Object.assign({ seconds: 30, seed: null }, opts || {});
  const sel = setPicker(store("bansuri.game.road.level", "srg"));
  const { canvas, status, btn, el } = shell("Glide road: keep your pitch on a road that holds and glides between notes", "Keep your note on the road: hold where it is flat, and glide (meend: slide the finger slowly) where it slopes. Silence counts as off the road.", h("label", { class: "field" }, "Notes", sel));
  const m = mic(el);
  let raf = 0, run = null;
  function draw() {
    const { g, W, H } = fitCanvas(canvas, 0.5), col = colors(), set = run ? run.set : NOTE_SETS.find(s => s[0] === sel.value)[2];
    const lo = Math.min(...set) - 1.5, hi = Math.max(...set) + 1.5, y = s => 10 + (hi - s) / (hi - lo) * (H - 20);
    const now = run ? run.t : 0, x = t => W * 0.3 + (t - now) * (W * 0.7 / 3.5);
    g.clearRect(0, 0, W, H); g.font = "13px " + font();
    for (const s of set) { g.strokeStyle = col.line; g.beginPath(); g.moveTo(30, y(s)); g.lineTo(W, y(s)); g.stroke(); g.fillStyle = col.muted; g.fillText(codeOf(s), 6, y(s) + 4); }
    if (!run) return;
    const band = (H - 20) / (hi - lo) * 0.5;
    g.fillStyle = col.sunken; g.beginPath();
    const ts = []; for (let t = Math.max(0, now - 1.2); t <= now + 3.5; t += 0.05) ts.push(t);
    ts.forEach((t, i) => { const yy = y(roadAt(run.road, t)) - band; if (i) g.lineTo(x(t), yy); else g.moveTo(x(t), yy); });
    ts.slice().reverse().forEach(t => g.lineTo(x(t), y(roadAt(run.road, t)) + band)); g.closePath(); g.fill();
    g.strokeStyle = col.bamboo; g.lineWidth = 2; g.beginPath(); ts.forEach((t, i) => { if (i) g.lineTo(x(t), y(roadAt(run.road, t))); else g.moveTo(x(t), y(roadAt(run.road, t))); }); g.stroke();
    g.strokeStyle = col.accent; g.beginPath(); let pen = false;
    for (const p of run.trail) { if (p.semi === null) { pen = false; continue; } if (pen) g.lineTo(x(p.t), y(p.semi)); else { g.moveTo(x(p.t), y(p.semi)); pen = true; } } g.stroke(); g.lineWidth = 1;
    const cur = run.trail.length ? run.trail[run.trail.length - 1] : null;
    if (cur && cur.semi !== null) { g.fillStyle = run.on ? col.good : col.bad; g.beginPath(); g.arc(x(now), y(cur.semi), 7, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = col.ink; g.font = "bold 15px " + font();
    g.fillText(tr("On the road") + " " + Math.round(run.onT / Math.max(0.01, run.allT) * 100) + "%   " + Math.max(0, Math.ceil(run.len - now)) + " s", W - 210, 20);
  }
  function step() {
    if (!run) return;
    const now = performance.now(), dt = Math.min(0.05, (now - run.last) / 1000); run.last = now;
    run.t += dt * speedOf();
    const sounding = now - run.heardAt < 200, want = roadAt(run.road, run.t);
    run.on = sounding && Math.abs(run.semi - want) <= 0.5;
    if (run.t > 1) { run.allT += dt; if (run.on) run.onT += dt; }
    run.trail.push({ t: run.t, semi: sounding ? run.semi : null }); run.trail = run.trail.filter(p => p.t > run.t - 1.3);
    draw();
    if (run.t >= run.len) return end();
    raf = requestAnimationFrame(step);
  }
  function end() {
    cancelAnimationFrame(raf); m.stop();
    const r = run; run = null; btn.textContent = "Play again";
    const score = Math.round(r.onT / Math.max(0.01, r.allT) * 100), b = keepBest("bansuri.game.road.best." + r.level, score);
    say(status, "On the road " + score + "%.", bestText(b), score < 50 ? "Try Slow in Settings > Games, and glide more slowly." : "");
    emitLive({ type: "game", game: "road", level: r.level, score, best: b.isNew });
    draw();
  }
  btn.addEventListener("click", async () => {
    if (run) { run.t = run.len; return; }
    ac();
    const seed = o.seed || Math.floor(Math.random() * 1e9), set = NOTE_SETS.find(s => s[0] === sel.value)[2];
    storeSet("bansuri.game.road.level", sel.value);
    run = { level: sel.value, set, road: makeRoad(set, seeded(seed), o.seconds + 5), len: o.seconds, t: -1, semi: 0, heardAt: -1e9, on: false, onT: 0, allT: 0, trail: [], last: performance.now() };
    const ok = await m.start(r => { if (run && r.semi !== null && r.semi > -7.5 && r.semi < 26.5) { run.semi = r.semi; run.heardAt = performance.now(); } }, btn);
    if (!ok || !run) { run = null; status.textContent = notStarted; return; }
    btn.textContent = "Stop"; say(status, "Start on this note:", codeOf(set[0])); raf = requestAnimationFrame(step);
  });
  requestAnimationFrame(draw);
  return { el, destroy() { if (run) { cancelAnimationFrame(raf); run = null; } m.stop(); } };
}

// ---------- Light the lanterns ----------
// Lanterns with notes appear and slowly fade; play a lantern's note to light it. A minute a round.
export function lanterns(opts) {
  const o = Object.assign({ seconds: 60, seed: null }, opts || {});
  const sel = setPicker(store("bansuri.game.lantern.level", "srg"));
  const { canvas, status, btn, el } = shell("Light the lanterns: play a lantern's note before it fades", "Lanterns appear with a note on each. Play a lantern's note to light it before it fades. Light as many as you can in a minute.", h("label", { class: "field" }, "Notes", sel));
  const m = mic(el);
  let raf = 0, run = null;
  function draw() {
    const { g, W, H } = fitCanvas(canvas, 0.5), col = colors();
    g.clearRect(0, 0, W, H); g.font = "bold 18px " + font();
    if (!run) { g.fillStyle = col.muted; g.fillText(tr("Press Start"), 12, 24); return; }
    for (const l of run.lit.concat(run.live)) {
      const x = l.x * W, yy = l.y * H, a = l.litAt ? 1 : Math.max(0.15, 1 - l.age / l.life);
      g.globalAlpha = a;
      g.fillStyle = l.litAt ? col.warn : col.sunken; g.beginPath(); g.ellipse(x, yy, 26, 32, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = col.bamboo; g.lineWidth = 2; g.stroke(); g.lineWidth = 1;
      g.strokeStyle = col.muted; g.beginPath(); g.moveTo(x, yy - 32); g.lineTo(x, yy - 44); g.stroke();
      canvasNote(g, x, yy, l.note, 20, l.litAt ? col.surface : col.ink);
      g.globalAlpha = 1;
    }
    g.fillStyle = col.ink; g.font = "bold 15px " + font();
    g.fillText(tr("Lit") + " " + run.score + (run.left === Infinity ? "" : "   " + Math.max(0, Math.ceil(run.left)) + " s"), 12, 20);
  }
  function step(now) {
    if (!run) return;
    const dt = Math.min(0.05, (now - run.last) / 1000); run.last = now;
    run.left -= dt; run.spawn -= dt * speedOf();
    if (run.spawn <= 0 && run.live.length < 3) {
      run.spawn = Math.max(1.3, 2.4 - run.score * 0.05);
      let note = nextNote(run.set, run.prev, run.rnd);
      for (let i = 0; i < 5 && run.live.some(l => l.note === note); i++) note = run.set[Math.floor(run.rnd() * run.set.length)];
      run.prev = note;
      run.live.push({ note, x: 0.12 + run.rnd() * 0.76, y: 0.3 + run.rnd() * 0.55, age: 0, life: 6 / speedOf() });
    }
    for (const l of run.live) l.age += dt;
    const faded = run.live.filter(l => l.age >= l.life).length;
    if (faded) { run.streak = 0; run.live = run.live.filter(l => l.age < l.life); }
    run.lit = run.lit.filter(l => now - l.litAt < 600);
    draw();
    if (run.left <= 0) return end();
    raf = requestAnimationFrame(step);
  }
  function end() {
    cancelAnimationFrame(raf); m.stop();
    const r = run; run = null; btn.textContent = "Play again";
    const b = keepBest("bansuri.game.lantern.best." + r.level, r.score);
    say(status, r.score + " lanterns lit.", bestText(b));
    emitLive({ type: "game", game: "lanterns", level: r.level, score: r.score, best: b.isNew });
    draw();
  }
  btn.addEventListener("click", async () => {
    if (run) { run.left = 0; return; }
    ac();
    const seed = o.seed || Math.floor(Math.random() * 1e9), set = NOTE_SETS.find(s => s[0] === sel.value)[2];
    storeSet("bansuri.game.lantern.level", sel.value);
    const seq = noteSequencer({ minDur: 0.2, tol: 40 });
    run = { level: sel.value, set, rnd: seeded(seed), live: [], lit: [], prev: set[0], spawn: 0, score: 0, streak: 0, left: getSettings().noTimer ? Infinity : o.seconds, last: performance.now() };
    const ok = await m.start(r => {
      if (!run) return;
      const n = seq.feed(r); if (!n) return;
      const i = run.live.findIndex(l => l.note === n.semi);
      if (i >= 0) { const l = run.live.splice(i, 1)[0]; l.litAt = performance.now(); run.lit.push(l); run.score++; run.streak++; chime(true); say(status, run.streak >= 3 ? run.streak + " in a row!" : ""); }
    }, btn);
    if (!ok || !run) { run = null; status.textContent = notStarted; return; }
    btn.textContent = "Stop"; raf = requestAnimationFrame(step);
  });
  requestAnimationFrame(draw);
  return { el, destroy() { if (run) { cancelAnimationFrame(raf); run = null; } m.stop(); } };
}

// ---------- Bullseye ----------
// Ten arrows. Hold the target note steadily; after 1.5 s the arrow lands as far from the centre as
// your note was from the true pitch. 10 points within 5 cents.
export function bullseye(opts) {
  const o = Object.assign({ arrows: 10, seed: null }, opts || {});
  const sel = setPicker(store("bansuri.game.bull.level", "srg"));
  const { canvas, status, btn, el } = shell("Bullseye: hold the note; the arrow lands as far from the centre as your note is from the true pitch", "Hold the note shown, steady, for a second and a half: the arrow lands as far from the centre as your note is from the true pitch. Ten arrows; 10 points for within 5 cents.", h("label", { class: "field" }, "Notes", sel));
  const m = mic(el);
  let raf = 0, run = null;
  const R = c => Math.min(1, Math.abs(c) / 50);
  function draw() {
    const { g, W, H } = fitCanvas(canvas, 0.55), col = colors(), cx = W / 2, cy = H / 2 + 8, rad = Math.min(W, H) * 0.4;
    g.clearRect(0, 0, W, H);
    [[50, col.sunken], [40, col.surface], [25, col.sunken], [15, col.surface], [10, col.sunken], [5, col.warn]].forEach(([c, f]) => { g.fillStyle = f; g.beginPath(); g.arc(cx, cy, rad * R(c), 0, Math.PI * 2); g.fill(); g.strokeStyle = col.line; g.stroke(); });
    if (!run) { g.fillStyle = col.muted; g.font = "16px " + font(); g.fillText(tr("Press Start"), 12, 22); return; }
    for (const a of run.hits) { g.fillStyle = col.ink; g.beginPath(); g.arc(cx + Math.cos(a.ang) * rad * R(a.cents), cy + Math.sin(a.ang) * rad * R(a.cents), 5, 0, Math.PI * 2); g.fill(); }
    if (run.live !== null && run.hold > 0) { g.strokeStyle = col.accent; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, rad + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, run.hold / 1.5)); g.stroke(); g.lineWidth = 1; }
    g.fillStyle = col.ink; g.font = "bold 16px " + font();
    g.fillText(tr("Arrow") + " " + Math.min(run.hits.length + 1, o.arrows) + "/" + o.arrows + "   " + tr("Score") + " " + run.score, 12, 22);
    g.font = "bold 22px " + font(); canvasNote(g, W - 40, 34, run.target, 22, col.ink);
    if (run.live !== null) { g.font = "13px " + font(); g.fillStyle = col.muted; g.fillText((run.live > 0 ? "+" : "") + Math.round(run.live) + " cents", W - 90, 64); }
  }
  function step(now) {
    if (!run) return;
    const dt = Math.min(0.05, (now - run.last) / 1000); run.last = now;
    const sounding = now - run.heardAt < 200, onNote = sounding && Math.abs(run.cents) <= 60;
    if (onNote) { run.hold += dt; run.samples.push(run.cents); run.live = run.cents; } else { run.hold = 0; run.samples = []; run.live = sounding ? run.live : null; }
    if (run.hold >= 1.5) {
      const tail = run.samples.slice(-Math.ceil(run.samples.length * 0.66)), cents = tail.reduce((a, x) => a + x, 0) / tail.length;
      const pts = bullseyeScore(cents);
      run.hits.push({ cents, ang: run.rnd() * Math.PI * 2 }); run.score += pts; chime(pts >= 6);
      say(status, codeOf(run.target) + ": " + (cents > 0 ? "+" : "") + Math.round(cents) + " cents, " + pts + " points.", pts >= 8 ? "Right in the middle." : cents > 0 ? "Sharp: a little less air, or roll the flute in a touch." : "Flat: a little more air, or roll the flute out a touch.");
      run.hold = 0; run.samples = []; run.live = null;
      run.target = nextNote(run.set, run.target, run.rnd);
      if (run.hits.length >= o.arrows) return end();
    }
    draw();
    raf = requestAnimationFrame(step);
  }
  function end() {
    cancelAnimationFrame(raf); m.stop();
    const r = run; run = null; btn.textContent = "Play again";
    const b = keepBest("bansuri.game.bull.best." + r.level, r.score);
    say(status, "Score " + r.score + " of " + o.arrows * 10 + ".", bestText(b));
    emitLive({ type: "game", game: "bullseye", level: r.level, score: r.score, best: b.isNew });
    draw();
  }
  btn.addEventListener("click", async () => {
    if (run) return end();
    ac();
    const seed = o.seed || Math.floor(Math.random() * 1e9), set = NOTE_SETS.find(s => s[0] === sel.value)[2];
    storeSet("bansuri.game.bull.level", sel.value);
    run = { level: sel.value, set, rnd: seeded(seed), target: set[0], hits: [], score: 0, hold: 0, samples: [], cents: 0, live: null, heardAt: -1e9, last: performance.now() };
    const ok = await m.start(r => {
      if (!run || r.semi === null) return;
      run.heardAt = performance.now();
      // Cents from the target in the chosen tuning (Settings), measured on the near note.
      run.cents = r.near === run.target ? r.cents : (r.semi - run.target) * 100;
    }, btn);
    if (!ok || !run) { run = null; status.textContent = notStarted; return; }
    btn.textContent = "Stop"; say(status, "Hold this note:", codeOf(run.target)); raf = requestAnimationFrame(step);
  });
  requestAnimationFrame(draw);
  return { el, destroy() { if (run) { cancelAnimationFrame(raf); run = null; } m.stop(); } };
}

// ---------- Three floors ----------
// A lift between the lower, middle and upper octaves: play the note on the floor shown.
export function threeFloors(opts) {
  const o = Object.assign({ seconds: 60, seed: null }, opts || {});
  const sel = h("select", { class: "input", "aria-label": "Floors", style: { width: "auto" } }, FLOORS.map(([k, l]) => h("option", { value: k }, l)));
  sel.value = store("bansuri.game.floors.level", "mu");
  const { canvas, status, btn, el } = shell("Three floors: play the note in the octave shown", "The lift goes where your note is. Play the note shown on its floor: lower, middle or upper octave. The same name on the wrong floor does not count.", h("label", { class: "field" }, "Floors", sel));
  const m = mic(el);
  let raf = 0, run = null;
  const NAMES = ["Lower octave", "Middle octave", "Upper octave"];
  function draw() {
    const { g, W, H } = fitCanvas(canvas, 0.55), col = colors(), fh = (H - 20) / 3;
    g.clearRect(0, 0, W, H); g.font = "15px " + font();
    for (let f = 0; f < 3; f++) {
      const yy = 10 + (2 - f) * fh;
      g.fillStyle = run && floorOf(run.target) === f ? col.sunken : col.surface; g.fillRect(10, yy, W - 20, fh - 4);
      g.fillStyle = col.muted; g.fillText(tr(NAMES[f]), 20, yy + 22);
    }
    if (!run) { g.fillStyle = col.muted; g.fillText(tr("Press Start"), W / 2 - 40, H / 2); return; }
    const ty = 10 + (2 - floorOf(run.target)) * fh + fh / 2;
    g.font = "bold 24px " + font(); canvasNote(g, W * 0.7, ty, run.target, 24, col.ink);
    const ly = 10 + (2 - run.lift) * fh + fh / 2;
    g.fillStyle = run.flash > 0 ? col.good : col.accent; g.fillRect(W * 0.35 - 22, ly - 22, 44, 44);
    g.fillStyle = col.ink; g.font = "bold 15px " + font();
    g.fillText(tr("Floors reached") + " " + run.score + (run.left === Infinity ? "" : "   " + Math.max(0, Math.ceil(run.left)) + " s"), W - 230, 20);
  }
  function step(now) {
    if (!run) return;
    const dt = Math.min(0.05, (now - run.last) / 1000); run.last = now;
    run.left -= dt; run.flash = Math.max(0, run.flash - dt);
    run.lift += (run.liftTo - run.lift) * Math.min(1, dt * 6);
    draw();
    if (run.left <= 0) return end();
    raf = requestAnimationFrame(step);
  }
  function end() {
    cancelAnimationFrame(raf); m.stop();
    const r = run; run = null; btn.textContent = "Play again";
    const b = keepBest("bansuri.game.floors.best." + r.level, r.score);
    say(status, r.score + " floors reached.", bestText(b));
    emitLive({ type: "game", game: "floors", level: r.level, score: r.score, best: b.isNew });
    draw();
  }
  btn.addEventListener("click", async () => {
    if (run) { run.left = 0; return; }
    ac();
    const seed = o.seed || Math.floor(Math.random() * 1e9), set = FLOORS.find(f => f[0] === sel.value)[2], rnd = seeded(seed);
    storeSet("bansuri.game.floors.level", sel.value);
    const seq = noteSequencer({ minDur: 0.25, tol: 40 });
    const pick = prev => { let n = prev; for (let i = 0; i < 8 && (n === prev || floorOf(n) === floorOf(prev) && rnd() < 0.6); i++) n = set[Math.floor(rnd() * set.length)]; return n; };
    run = { level: sel.value, set, target: set[0], lift: 1, liftTo: 1, flash: 0, score: 0, left: getSettings().noTimer ? Infinity : o.seconds, last: performance.now() };
    const ok = await m.start(r => {
      if (!run) return;
      if (r.semi !== null && r.semi > -7.5 && r.semi < 26.5) run.liftTo = floorOf(Math.round(r.semi));
      const n = seq.feed(r); if (!n) return;
      if (n.semi === run.target) { run.score++; run.flash = 0.4; chime(true); run.target = pick(run.target); say(status, "Next note:", codeOf(run.target)); }
      else if ((((n.semi - run.target) % 12) + 12) % 12 === 0) say(status, n.semi < run.target ? "Right note, wrong floor: go up an octave." : "Right note, wrong floor: go down an octave.");
    }, btn);
    if (!ok || !run) { run = null; status.textContent = notStarted; return; }
    btn.textContent = "Stop"; say(status, "Play this note:", codeOf(run.target)); raf = requestAnimationFrame(step);
  });
  requestAnimationFrame(draw);
  return { el, destroy() { if (run) { cancelAnimationFrame(raf); run = null; } m.stop(); } };
}

// ---------- Spot the wrong note (by ear) ----------
// A phrase plays twice; the second time one note is changed. Tap which one. Three lives; the
// phrases grow longer as you score.
export function wrongNote(opts) {
  const o = Object.assign({ seed: null }, opts || {});
  const sel = setPicker(store("bansuri.game.wrong.level", "srgmp"));
  const show = h("input", { type: "checkbox", id: "wn-show" });
  const status = h("p", { class: "small", "aria-live": "polite" }, "A phrase plays, then plays again with one note changed. Tap the note that changed. Three lives.");
  const btn = h("button", { type: "button", class: "btn primary" }, "Start");
  const again = h("button", { type: "button", class: "btn", hidden: true }, "Hear both again");
  const tiles = h("div", { class: "row wn-tiles" });
  const el = h("div", { class: "stack game" }, h("div", { class: "row" }, h("label", { class: "field" }, "Notes", sel), h("label", { class: "check", for: "wn-show" }, show, "Show the first phrase's notes"), btn), tiles, h("div", { class: "row" }, again), status);
  let run = null, timer = 0;
  const hearRound = () => {
    const r = run.round, a = playSeq(r.phrase);
    clearTimeout(timer); timer = setTimeout(() => { if (run) playSeq(r.changed); }, (a + 0.6) * 1000);
    return a * 2 + 0.6;
  };
  function next() {
    const len = Math.min(8, 4 + Math.floor(run.score / 3));
    run.round = wrongNoteRound(run.set, len, run.rnd); run.answered = false;
    tiles.replaceChildren(...run.round.phrase.map((s, i) => h("button", { type: "button", class: "btn wn-tile", "aria-label": tr("Note") + " " + (i + 1), onclick: () => answer(i) },
      h("b", null, String(i + 1)), show.checked ? h("span", { class: "small" }, codeOf(s)) : null)));
    hearRound();
  }
  function answer(i) {
    if (!run || run.answered) return;
    run.answered = true;
    const r = run.round, ok = i === r.pos;
    [...tiles.children].forEach((b, k) => { b.disabled = true; if (k === r.pos) b.classList.add("primary"); });
    const what = "note " + (r.pos + 1) + " changed from " + codeOf(r.phrase[r.pos]) + " to " + codeOf(r.changed[r.pos]) + ".";
    if (ok) { run.score++; chime(true); say(status, "Right: " + what); }
    else { run.lives--; chime(false); say(status, "Not that one: " + what, "Lives " + run.lives + "."); }
    run.last = [...status.children].map(x => x.textContent);
    if (run.lives <= 0) return end();
    clearTimeout(timer); timer = setTimeout(() => { if (run) next(); }, 1800);
  }
  function end() {
    clearTimeout(timer);
    const r = run; run = null; btn.textContent = "Play again"; again.hidden = true;
    const b = keepBest("bansuri.game.wrong.best." + r.level, r.score);
    say(status, ...(r.last || []).slice(0, 1), "Score " + r.score + ".", bestText(b));
    emitLive({ type: "game", game: "wrong", level: r.level, score: r.score, best: b.isNew });
  }
  again.addEventListener("click", () => { if (run && !run.answered) hearRound(); });
  btn.addEventListener("click", () => {
    if (run) { run.lives = 0; return end(); }
    ac();
    const set = NOTE_SETS.find(s => s[0] === sel.value)[2];
    storeSet("bansuri.game.wrong.level", sel.value);
    run = { level: sel.value, set, rnd: seeded(o.seed || Math.floor(Math.random() * 1e9)), score: 0, lives: 3, round: null, answered: false };
    btn.textContent = "Stop"; again.hidden = false; say(status, "Listen to both, then tap the note that changed.");
    next();
  });
  return { el, destroy() { clearTimeout(timer); run = null; } };
}

// ---------- Sargam bingo (by ear) ----------
// Notes are played over the drone; tap the note on your card if it is there, before the next one.
// A full row, column or diagonal is bingo. Three wrong taps end the game.
export function bingo(opts) {
  const o = Object.assign({ seed: null, every: 3.2 }, opts || {});
  const show = h("input", { type: "checkbox", id: "bg-hint" });
  const status = h("p", { class: "small", "aria-live": "polite" }, "Notes play over the drone, one at a time. If the note is on your card, tap it before the next note. A full row, column or diagonal is bingo. Three wrong taps end the game.");
  const btn = h("button", { type: "button", class: "btn primary" }, "Start");
  const grid = h("div", { class: "bingo" });
  const el = h("div", { class: "stack game" }, h("div", { class: "row" }, h("label", { class: "check", for: "bg-hint" }, show, "Name each note as it plays (easier)"), btn), grid, status);
  let run = null, timer = 0, droneMine = false;
  function drawCard() {
    grid.replaceChildren(...run.card.map((s, i) => h("button", { type: "button", class: "btn bingo-cell" + (run.marked[i] ? " primary" : ""), disabled: run.marked[i] || undefined, "aria-pressed": String(!!run.marked[i]), onclick: () => tap(i) }, codeOf(s))));
  }
  function call() {
    if (!run) return;
    if (run.current !== null && run.card.includes(run.current) && !run.marked[run.card.indexOf(run.current)]) run.missed++;
    if (!run.queue.length) run.queue = shuffled(BINGO_POOL, run.rnd);
    run.current = run.queue.pop(); run.calls++;
    playSeq([run.current], 1.1);
    say(status, show.checked ? "Call " + run.calls + ":" : "Call " + run.calls + ": is it on your card?", show.checked ? codeOf(run.current) : "");
    timer = setTimeout(call, o.every * 1000 / speedOf());
  }
  function tap(i) {
    if (!run) return;
    if (run.card[i] === run.current) {
      run.marked[i] = true; chime(true); drawCard();
      if (bingoLine(run.marked)) return end(true);
    } else { run.wrong++; chime(false); say(status, "Not that one: it was " + codeOf(run.current) + ".", "Wrong taps: " + run.wrong + " of 3."); if (run.wrong >= 3) return end(false); }
  }
  function end(won) {
    clearTimeout(timer);
    if (droneMine) { tanpura.stop(); droneMine = false; }
    const r = run; run = null; btn.textContent = "Play again";
    const score = won ? Math.max(1, 30 - r.calls) : 0, b = keepBest("bansuri.game.bingo.best", score);
    say(status, won ? "Bingo in " + r.calls + " calls! Score " + score + "." : "Game over.", won ? bestText(b) : "", r.missed ? "Notes on your card you did not tap: " + r.missed + "." : "");
    emitLive({ type: "game", game: "bingo", score, best: b.isNew });
  }
  btn.addEventListener("click", () => {
    if (run) return end(false);
    ac();
    if (!tanpura.isOn()) { tanpura.start(); droneMine = true; }
    const rnd = seeded(o.seed || Math.floor(Math.random() * 1e9));
    run = { rnd, card: bingoCard(rnd), marked: Array(9).fill(false), queue: [], current: null, calls: 0, wrong: 0, missed: 0 };
    btn.textContent = "Stop"; drawCard();
    timer = setTimeout(call, 1500);
  });
  return { el, destroy() { clearTimeout(timer); if (droneMine) { tanpura.stop(); droneMine = false; } run = null; } };
}

// ---------- Higher or lower (by ear) ----------
export function higherLower(opts) {
  const o = Object.assign({ seed: null }, opts || {});
  const status = h("p", { class: "small", "aria-live": "polite" }, "Two notes play. Is the second one higher, lower or the same? The notes get closer as you score. Three lives.");
  const btn = h("button", { type: "button", class: "btn primary" }, "Start");
  const replay = h("button", { type: "button", class: "btn", hidden: true }, "Hear again");
  const answers = h("div", { class: "row", hidden: true }, ...[["higher", "Higher"], ["lower", "Lower"], ["same", "The same"]].map(([k, l]) => h("button", { type: "button", class: "btn big", "data-a": k, onclick: () => answer(k) }, l)));
  const el = h("div", { class: "stack game" }, h("div", { class: "row" }, btn, replay), answers, status);
  let run = null, timer = 0;
  const hear = () => playSeq(run.pair, 0.8);
  function next() { run.pair = higherLowerPair(run.rnd, run.score); run.answered = false; hear(); }
  function answer(k) {
    if (!run || run.answered) return;
    run.answered = true;
    const right = compareNotes(run.pair[0], run.pair[1]), gap = Math.abs(run.pair[1] - run.pair[0]);
    const pair = codeOf(run.pair[0]) + " - " + codeOf(run.pair[1]) + (gap ? " (" + gap + ")" : "");
    if (k === right) { run.score++; chime(true); say(status, "Right! Score " + run.score + ".", pair); }
    else { run.lives--; chime(false); say(status, right === "higher" ? "It went up." : right === "lower" ? "It went down." : "They were the same.", pair, "Lives " + run.lives + "."); }
    run.last = [...status.children].map(x => x.textContent);
    if (run.lives <= 0) return end();
    timer = setTimeout(() => { if (run) next(); }, 1400);
  }
  function end() {
    clearTimeout(timer);
    const r = run; run = null; btn.textContent = "Play again"; answers.hidden = true; replay.hidden = true;
    const b = keepBest("bansuri.game.hl.best", r.score);
    say(status, ...(r.last || []).slice(0, 2), "Score " + r.score + ".", bestText(b));
    emitLive({ type: "game", game: "higherlower", score: r.score, best: b.isNew });
  }
  replay.addEventListener("click", () => { if (run) hear(); });
  btn.addEventListener("click", () => {
    if (run) { run.lives = 0; return end(); }
    ac();
    run = { rnd: seeded(o.seed || Math.floor(Math.random() * 1e9)), score: 0, lives: 3, pair: null, answered: false };
    btn.textContent = "Stop"; answers.hidden = false; replay.hidden = false; say(status, "Listen...");
    next();
  });
  return { el, destroy() { clearTimeout(timer); run = null; } };
}

// ---------- Catch the sam (tap) ----------
// The tabla plays a theka; tap (the button, or the space bar) exactly on sam, beat 1 of each cycle.
// From the fifth cycle the sam's accent is dropped, so you must count. Eight cycles.
export function catchSam(opts) {
  const o = Object.assign({ cycles: 8 }, opts || {});
  const talaSel = h("select", { class: "input", "aria-label": "Taal", style: { width: "auto" } }, Object.entries(THEKAS).map(([k, t]) => h("option", { value: k }, t.name)));
  talaSel.value = store("bansuri.game.sam.taal", "keherwa");
  const status = h("p", { class: "small", "aria-live": "polite" }, "The tabla plays a cycle of the taal. Tap on sam, the first beat of every cycle (X). The first cycle is to listen. From the fifth cycle sam is no longer stressed: keep counting.");
  const btn = h("button", { type: "button", class: "btn primary" }, "Start");
  const tapBtn = h("button", { type: "button", class: "btn big samtap", disabled: true }, "Tap on sam");
  const beatsRow = h("div", { class: "row sambeats", "aria-hidden": "true" });
  const el = h("div", { class: "stack game" }, h("div", { class: "row" }, h("label", { class: "field" }, "Taal", talaSel), btn), beatsRow, tapBtn, status);
  let run = null, timer = 0, beatTimer = 0, cycleTimers = [];
  const onKey = e => { if (e.code === "Space" && run && !e.repeat && document.activeElement !== btn) { e.preventDefault(); tap(); } };
  function tap() {
    if (!run) return;
    const t = ac().currentTime - run.latency;
    if (t < run.sams[1] - 0.4) { say(status, "Listen to the first cycle, then tap on sam."); return; }
    const j = samJudge(t, run.sams.slice(1), run.beat);
    if (j.kind !== "miss" && run.got.has(j.sam)) return;
    if (j.kind === "miss") { run.off++; chime(false); say(status, "Not on sam."); return; }
    run.got.add(j.sam); run.hits++; if (j.kind === "perfect") run.perfect++;
    say(status, (j.kind === "perfect" ? "Right on sam: " : "Close: ") + (j.off > 0 ? "+" : "") + j.off + " ms.");
  }
  function end() {
    clearTimeout(timer); clearInterval(beatTimer); cycleTimers.forEach(clearTimeout); cycleTimers = []; document.removeEventListener("keydown", onKey);
    const r = run; run = null; btn.textContent = "Play again"; tapBtn.disabled = true;
    const score = Math.max(0, r.hits * 10 + r.perfect * 5 - r.off * 5), b = keepBest("bansuri.game.sam.best." + r.taal, score);
    say(status, "Sam caught " + r.hits + " of " + (o.cycles - 1) + ", " + r.perfect + " right on it.", r.off ? "Taps off the beat: " + r.off + "." : "", "Score " + score + ".", bestText(b));
    emitLive({ type: "game", game: "sam", level: r.taal, score, hits: r.hits, of: o.cycles - 1, best: b.isNew });
  }
  btn.addEventListener("click", () => {
    if (run) return end();
    const c = ac(), T = THEKAS[talaSel.value], bpm = Math.round(84 * speedOf()), beat = 60 / bpm, t0 = c.currentTime + 0.4, n = T.bols.length;
    storeSet("bansuri.game.sam.taal", talaSel.value);
    const sams = [];
    // One cycle is scheduled at a time, half a second ahead, so Stop silences the tabla.
    for (let k = 0; k < o.cycles; k++) {
      sams.push(t0 + k * n * beat);
      const go = () => { if (run) T.bols.forEach((b, i) => tablaBol(t0 + (k * n + i) * beat, b, beat, i === 0 && k < 4)); };
      if (k === 0) setTimeout(go, 0); else cycleTimers.push(setTimeout(go, Math.max(0, (t0 + k * n * beat - 0.5 - c.currentTime) * 1000)));
    }
    run = { taal: talaSel.value, beat, sams, got: new Set(), hits: 0, perfect: 0, off: 0, latency: (c.outputLatency || c.baseLatency || 0) };
    beatsRow.replaceChildren(...T.bols.map((b, i) => h("span", { class: "sambeat" + (i === 0 ? " sam" : "") }, i === 0 ? "X" : String(i + 1))));
    beatTimer = setInterval(() => {
      if (!run) return;
      const i = Math.floor((ac().currentTime - t0) / beat), k = ((i % n) + n) % n;
      [...beatsRow.children].forEach((s, x) => s.classList.toggle("on", i >= 0 && x === k && Math.floor(i / n) < 4));
    }, 40);
    btn.textContent = "Stop"; tapBtn.disabled = false; tapBtn.focus();
    document.addEventListener("keydown", onKey);
    say(status, "Listen to the first cycle...");
    timer = setTimeout(end, (o.cycles * n * beat + 0.9) * 1000);
  });
  tapBtn.addEventListener("pointerdown", e => { e.preventDefault(); tap(); });
  tapBtn.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); tap(); } });
  return { el, destroy() { clearTimeout(timer); clearInterval(beatTimer); cycleTimers.forEach(clearTimeout); document.removeEventListener("keydown", onKey); run = null; } };
}
