// Raga phrases (ornaments inside the raga's own phrases), Laya ladder (thah, dugun, tigun on a
// theka), Tihai (a phrase three times, landing on sam) and Taar saptak (a steady, clear upper
// octave). Each returns { el, destroy }; the pure parts are exported for tests.
import { h, store, storeSet } from "./util.js";
import { codeOf } from "./core/theory.js";
import { ac, playCurve, tablaBol } from "./core/audio.js";
import { relSemi } from "./core/pitch.js";
import { noteSequencer, emitLive, muteListening } from "./core/listen.js";
import { colors, fitCanvas, chime, mic, THEKAS } from "./games.js";
import { cleanReadings } from "./ornaments.js";
import { PHRASES, phraseCurve, judgePhrase } from "./phrases.js";
import { pilotLog } from "./pilot.js";

// ---------- Pure parts ----------
export const LAYA_PATTERN = [0, 2, 4, 5];
export const LAYA_SECTIONS = [["thah", 1], ["dugun", 2], ["tigun", 3]];
// The notes expected in each section: beatsPer beats at 1, 2 and 3 notes a beat, after one
// cycle of count-in. Times in beats from the start.
export function layaEvents(cycle, beatsPer) {
  const ev = [];
  let b = cycle;
  for (const [sec, per] of LAYA_SECTIONS) {
    for (let k = 0; k < beatsPer * per; k++) ev.push({ beat: b + k / per, semi: LAYA_PATTERN[k % LAYA_PATTERN.length], sec, per });
    b += beatsPer;
  }
  return ev;
}
// onsets: [{ t, semi }] (seconds); events with t (seconds). The microphone hears a note a little
// late, so the median offset of the matched notes is taken out before judging evenness.
export function layaJudge(onsets, events) {
  const out = {};
  for (const [sec] of LAYA_SECTIONS) {
    const ev = events.filter(e => e.sec === sec);
    if (!ev.length) continue;
    const gap = ev.length > 1 ? ev[1].t - ev[0].t : 1, used = new Set(), offs = [];
    let right = 0;
    for (const o of onsets) {
      let bi = -1, bd = Infinity;
      ev.forEach((e, i) => { const d = Math.abs(o.t - 0.08 - e.t); if (d < bd) { bd = d; bi = i; } });
      if (bi < 0 || bd > gap * 0.45 || used.has(bi)) continue;
      used.add(bi); offs.push((o.t - ev[bi].t) * 1000);
      if (((o.semi - ev[bi].semi) % 12 + 12) % 12 === 0) right++;
    }
    const med = offs.length ? offs.slice().sort((a, b) => a - b)[offs.length >> 1] : 0;
    const spread = offs.length ? Math.round(Math.sqrt(offs.reduce((a, x) => a + (x - med) ** 2, 0) / offs.length)) : null;
    out[sec] = { hits: used.size, of: ev.length, right, spread };
  }
  return out;
}

// Tihai: a phrase of len beats and a gap of gap beats, three times; the last note lands on sam.
// Returns the beat (0-based, within a cycle) to start on.
export function tihaiStart(len, gap, cycle) {
  const last = 3 * len + 2 * gap - 1;
  return ((cycle - (last % cycle)) % cycle + cycle) % cycle;
}
export function tihaiEvents(phrase, gap, cycle, firstCycleBeat) {
  const s = firstCycleBeat + tihaiStart(phrase.length, gap, cycle), ev = [];
  for (let r = 0; r < 3; r++) phrase.forEach((semi, i) => ev.push({ beat: s + r * (phrase.length + gap) + i, semi, last: r === 2 && i === phrase.length - 1 }));
  return ev;
}

// Taar saptak: one held upper note. samples: [{ semi, clarity }]. Steadiness (spread in cents),
// clarity (how periodic the sound is: breathy tone is less), and how far from the note.
export function taarScore(samples, target) {
  const v = samples.filter(s => s.semi !== null && Math.abs(s.semi - target) <= 0.6);
  if (v.length < 15) return null;
  const c = v.map(s => (s.semi - target) * 100), med = c.slice().sort((a, b) => a - b)[c.length >> 1];
  const sd = Math.sqrt(c.reduce((a, x) => a + (x - med) ** 2, 0) / c.length), clar = v.reduce((a, s) => a + (s.clarity || 0), 0) / v.length;
  const k = x => Math.max(0, Math.min(1, x));
  const score = Math.round(50 * k(1 - (sd - 5) / 25) + 30 * k((clar - 0.85) / 0.12) + 20 * k(1 - (Math.abs(med) - 10) / 30));
  return { score, sd: Math.round(sd), clarity: Math.round(clar * 100) / 100, cents: Math.round(med), heard: Math.round(v.length / samples.length * 100) };
}

// ---------- Shared ----------
const font = () => getComputedStyle(document.body).fontFamily;
function keepBest(key, score) { const best = store(key, 0); if (score > best) storeSet(key, score); return { best, isNew: score > best }; }
const bestText = b => b.isNew ? "A new best!" : "Your best: " + b.best + ".";
function say(status, ...parts) { status.replaceChildren(...parts.filter(Boolean).flatMap((x, i) => [i ? " " : null, h("span", null, x)]).filter(x => x !== null)); }
const notStarted = "Not started. Press Start when you are ready (the microphone must be allowed).";
// A theka scheduled a little ahead at a time, so stopping the game silences the tabla at once.
function theka(T, beat, t0, total) {
  let i = 0;
  const fill = () => { const now = ac().currentTime; while (i < total && t0 + i * beat < now + 0.4) { tablaBol(t0 + i * beat, T.bols[i % T.bols.length], beat, i % T.bols.length === 0); i++; } };
  fill();
  const id = setInterval(fill, 100);
  return () => clearInterval(id);
}

function drawPhrase(canvas, target, attempt) {
  const { g, W, H } = fitCanvas(canvas, 0.4), col = colors();
  g.clearRect(0, 0, W, H);
  const all = target.concat((attempt || []).filter(r => r.semi !== null));
  let lo = Math.floor(Math.min(...all.map(r => r.semi))) - 1, hi = Math.ceil(Math.max(...all.map(r => r.semi))) + 1; if (hi - lo < 5) hi = lo + 5;
  const tEnd = Math.max(target[target.length - 1].t, attempt && attempt.length ? attempt[attempt.length - 1].t : 0) + 0.1;
  const x = t => 30 + t / tEnd * (W - 36), y = s => 8 + (hi - s) / (hi - lo) * (H - 16);
  g.font = "11px " + font();
  for (let s = lo; s <= hi; s++) { g.strokeStyle = col.line; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(30, y(s)); g.lineTo(W, y(s)); g.stroke(); g.globalAlpha = 1; g.fillStyle = col.muted; g.fillText(codeOf(s), 2, y(s) + 4); }
  const line = (pts, c, w, dash) => { g.strokeStyle = c; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath(); let pen = false, prev = null;
    for (const p of pts) { if (p.semi === null || (prev && p.t - prev.t > 0.12)) { pen = false; prev = p.semi === null ? null : p; if (p.semi === null) continue; } if (pen) g.lineTo(x(p.t), y(p.semi)); else { g.moveTo(x(p.t), y(p.semi)); pen = true; } prev = p; }
    g.stroke(); g.setLineDash([]); g.lineWidth = 1; };
  line(target, col.muted, 3, [6, 4]);
  if (attempt) line(attempt, col.accent, 2);
}

// ---------- Raga phrases ----------
export function ragaPhrases() {
  const ragas = [...new Set(PHRASES.map(p => p.raga))];
  const ragaSel = h("select", { class: "input", "aria-label": "Raga", style: { width: "auto" } }, ragas.map(r => h("option", { value: r }, r)));
  ragaSel.value = store("bansuri.game.phrase.raga", ragas[0]);
  const phraseSel = h("select", { class: "input", "aria-label": "Phrase", style: { width: "auto" } });
  const about = h("p", { class: "small" });
  const canvas = h("canvas", { class: "game-canvas", role: "img", "aria-label": "The phrase's target pitch curve, dashed, and your attempt" });
  const hearBtn = h("button", { type: "button", class: "btn" }, "Hear it");
  const tryBtn = h("button", { type: "button", class: "btn primary" }, "Try it");
  const status = h("p", { class: "small", "aria-live": "polite" }, "Ornaments live inside phrases. Hear the phrase, then play it: the notes in order, and each ornament as the dashed line shows.");
  const parts = h("ul", { class: "small phrase-parts", "aria-live": "polite" });
  const el = h("div", { class: "stack game" }, h("div", { class: "row" }, h("label", { class: "field" }, "Raga", ragaSel), h("label", { class: "field" }, "Phrase", phraseSel)), about,
    h("div", { class: "game-stage" }, canvas), h("div", { class: "row" }, hearBtn, tryBtn), status, parts,
    h("p", { class: "small muted" }, "Each phrase's ornament is one its source names for this raga; the exact width and speed are one way to play it. Your teacher may shape it differently."));
  const m = mic(el);
  let ph = null, attempt = null, rec = null, timer = 0;
  const list = () => PHRASES.filter(p => p.raga === ragaSel.value);
  function show() {
    phraseSel.replaceChildren(...list().map(p => h("option", { value: p.id }, p.text)));
    if (!list().some(p => p.id === (ph && ph.id))) ph = list()[0];
    phraseSel.value = ph.id; attempt = null; parts.replaceChildren();
    const best = store("bansuri.game.phrase.best." + ph.id, null);
    about.replaceChildren(h("b", { class: "mono", translate: "no" }, ph.text), " ", h("span", null, ph.what + "."), " ", h("a", { href: ph.src, target: "_blank", rel: "noopener" }, "Source"), " ", h("a", { href: "#/read/ragas/" + ph.file }, "Raga card"),
      best !== null ? h("span", { class: "muted" }, " " + "Your best: " + best + "%.") : null);
    drawPhrase(canvas, phraseCurve(ph.segs).pts, null);
  }
  ragaSel.addEventListener("change", () => { storeSet("bansuri.game.phrase.raga", ragaSel.value); ph = list()[0]; show(); });
  phraseSel.addEventListener("change", () => { ph = PHRASES.find(p => p.id === phraseSel.value) || list()[0]; show(); });
  hearBtn.addEventListener("click", () => { const p = playCurve(phraseCurve(ph.segs).pts, 1); muteListening(ac().currentTime + p.seconds + 0.15); });
  function finish() {
    clearTimeout(timer); m.stop(); const reads = rec; rec = null; tryBtn.textContent = "Try it";
    attempt = cleanReadings(reads);
    const r = judgePhrase(reads, ph, codeOf);
    drawPhrase(canvas, phraseCurve(ph.segs).pts, attempt);
    if (!r.ok) { say(status, r.verdict); parts.replaceChildren(); return; }
    const pct = Math.round(r.points / r.max * 100), b = keepBest("bansuri.game.phrase.best." + ph.id, pct);
    chime(pct >= 80);
    say(status, r.verdict, "Score " + r.points + " of " + r.max + " (" + pct + "%).", bestText(b));
    parts.replaceChildren(...r.parts.map(p => h("li", { class: p.ok ? "ok" : "bad" }, (p.ok ? "OK " : "Change ") , h("span", null, p.text))));
    emitLive({ type: "game", game: "phrase", level: ph.id, score: pct, best: b.isNew });
    pilotLog("phrase", { id: ph.id, points: r.points, max: r.max });
  }
  tryBtn.addEventListener("click", async () => {
    if (rec) return finish();
    ac();
    rec = []; let voicedAt = null, lastVoice = 0;
    const secs = phraseCurve(ph.segs).seconds;
    const ok = await m.start(r => {
      if (!rec) return;
      const semi = r.f && r.semi !== null ? relSemi(r.f) : null, now = performance.now();
      rec.push({ t: r.t, semi });
      if (semi !== null) { if (voicedAt === null) voicedAt = now; lastVoice = now; }
      if (voicedAt !== null && ((now - lastVoice > 700 && (lastVoice - voicedAt) / 1000 > secs * 0.5) || (now - voicedAt) / 1000 > secs + 4)) finish();
    }, tryBtn);
    if (!ok || !rec) { rec = null; say(status, notStarted); return; }
    tryBtn.textContent = "Done"; say(status, "Play the phrase now. It is judged when you stop."); parts.replaceChildren();
    timer = setTimeout(() => { if (rec) finish(); }, (secs + 10) * 1000);
  });
  ph = list()[0]; show();
  return { el, destroy() { clearTimeout(timer); m.stop(); rec = null; } };
}

// ---------- Laya ladder ----------
// The theka plays; after one cycle of count-in, play S R G m round and round: one note a beat
// (thah) for a cycle, two a beat (dugun), then three (tigun).
export function layaLadder() {
  const talaSel = h("select", { class: "input", "aria-label": "Taal", style: { width: "auto" } }, ["keherwa", "teentaal"].map(k => h("option", { value: k }, THEKAS[k].name)));
  const bpmSel = h("select", { class: "input", "aria-label": "Speed", style: { width: "auto" } }, [50, 60, 70, 80].map(b => h("option", { value: String(b) }, b + " BPM")));
  bpmSel.value = store("bansuri.game.laya.bpm", "60");
  const status = h("p", { class: "small", "aria-live": "polite" }, "After one cycle of the tabla, play S R G m round and round: one note a beat (thah) for a cycle, then two a beat (dugun), then three a beat (tigun). The row shows which.");
  const btn = h("button", { type: "button", class: "btn primary" }, "Start");
  const stage = h("div", { class: "row laya-stage", "aria-live": "off" });
  const el = h("div", { class: "stack game" }, h("div", { class: "row" }, h("label", { class: "field" }, "Taal", talaSel), h("label", { class: "field" }, "Speed", bpmSel), btn), stage, status);
  const m = mic(el);
  let run = null, timer = 0, ui = 0, stopTabla = () => {};
  const silence = () => { stopTabla(); stopTabla = () => {}; };
  function end() {
    clearTimeout(timer); clearInterval(ui); silence(); m.stop();
    const r = run; run = null; btn.textContent = "Play again"; stage.replaceChildren();
    const res = layaJudge(r.onsets, r.events), lines = [];
    let total = 0, max = 0;
    for (const [sec] of LAYA_SECTIONS) {
      const x = res[sec]; if (!x) continue;
      total += x.hits + x.right + (x.spread !== null && x.spread <= 40 ? x.of / 2 : 0); max += x.of * 2.5;
      lines.push(sec.charAt(0).toUpperCase() + sec.slice(1) + ": " + x.hits + " of " + x.of + " notes in time, " + x.right + " right notes" + (x.spread === null ? "." : ", evenness " + x.spread + " ms."));
    }
    const pct = max ? Math.round(total / max * 100) : 0, b = keepBest("bansuri.game.laya.best." + r.bpm, pct);
    say(status, ...lines, "Score " + pct + "%.", bestText(b));
    emitLive({ type: "game", game: "laya", level: String(r.bpm), score: pct, best: b.isNew });
  }
  btn.addEventListener("click", async () => {
    if (run) return end();
    ac();
    const bpm = Number(bpmSel.value), T = THEKAS[talaSel.value], cyc = T.bols.length, beat = 60 / bpm;
    storeSet("bansuri.game.laya.bpm", bpmSel.value);
    const seq = noteSequencer({ minDur: 0.08, tol: 50 });
    run = { bpm, onsets: [], events: [] };
    const ok = await m.start(r => { if (!run) return; const n = seq.feed(r); if (n) run.onsets.push({ t: n.t0, semi: n.semi }); }, btn);
    if (!ok || !run) { run = null; say(status, notStarted); return; }
    const c = ac(), t0 = c.currentTime + 0.3, beatsPer = cyc;
    run.events = layaEvents(cyc, beatsPer).map(e => ({ ...e, t: t0 + e.beat * beat }));
    const totalBeats = cyc + beatsPer * 3;
    stopTabla = theka(T, beat, t0, totalBeats);
    stage.replaceChildren(...["Listen", "Thah (1)", "Dugun (2)", "Tigun (3)"].map(x => h("span", { class: "sambeat" }, x)));
    ui = setInterval(() => { const i = Math.floor((ac().currentTime - t0) / beat / cyc); [...stage.children].forEach((s, k) => s.classList.toggle("on", k === i)); }, 100);
    btn.textContent = "Stop"; say(status, "Listen for one cycle, then thah: one note a beat.");
    timer = setTimeout(end, (totalBeats * beat + 0.8) * 1000);
  });
  return { el, destroy() { clearTimeout(timer); clearInterval(ui); silence(); m.stop(); run = null; } };
}

// ---------- Tihai ----------
// A phrase three times with a beat's rest between, starting where it must so the last note lands
// on sam. The app counts you in and marks the start beat.
const TIHAIS = [["srg", "S R G", [0, 2, 4]], ["srgmp", "S R G m P", [0, 2, 4, 5, 7]], ["pdn", "P D N S'", [7, 9, 11, 12]]];
export function tihai() {
  const talaSel = h("select", { class: "input", "aria-label": "Taal", style: { width: "auto" } }, ["keherwa", "teentaal"].map(k => h("option", { value: k }, THEKAS[k].name)));
  const phSel = h("select", { class: "input", "aria-label": "Phrase", style: { width: "auto" } }, TIHAIS.map(([k, l]) => h("option", { value: k }, l)));
  const status = h("p", { class: "small", "aria-live": "polite" }, "A tihai plays a phrase three times, with a beat's rest between, so that its last note lands on sam. Wait for the start beat (marked), then play. One note a beat.");
  const btn = h("button", { type: "button", class: "btn primary" }, "Start");
  const beatsRow = h("div", { class: "row sambeats", "aria-hidden": "true" });
  const el = h("div", { class: "stack game" }, h("div", { class: "row" }, h("label", { class: "field" }, "Taal", talaSel), h("label", { class: "field" }, "Phrase", phSel), btn), beatsRow, status);
  const m = mic(el);
  let run = null, timer = 0, ui = 0, stopTabla = () => {};
  const silence = () => { stopTabla(); stopTabla = () => {}; };
  function end() {
    clearTimeout(timer); clearInterval(ui); silence(); m.stop();
    const r = run; run = null; btn.textContent = "Play again";
    // Each expected note: an onset of the right note near its time (the microphone's lag taken out).
    const used = new Set(), offs = [];
    let hits = 0, landing = null;
    for (const e of r.events) {
      let best = null;
      r.onsets.forEach((o, i) => { if (used.has(i) || ((o.semi - e.semi) % 12 + 12) % 12) return; const d = o.t - 0.08 - e.t; if (Math.abs(d) <= r.beat * 0.45 && (best === null || Math.abs(d) < Math.abs(best.d))) best = { i, d }; });
      if (best) { used.add(best.i); hits++; offs.push(best.d * 1000); if (e.last) landing = Math.round(best.d * 1000); }
    }
    const landed = landing !== null && Math.abs(landing) <= 120;
    const score = hits * 5 + (landed ? 30 : 0), b = keepBest("bansuri.game.tihai.best", score);
    say(status, "Notes in place: " + hits + " of " + r.events.length + ".", landed ? "The last note landed on sam (" + (landing > 0 ? "+" : "") + landing + " ms)!" : landing === null ? "The last note was not heard on sam." : "The last note missed sam by " + Math.abs(landing) + " ms.", "Score " + score + ".", bestText(b));
    emitLive({ type: "game", game: "tihai", score, landed, best: b.isNew });
  }
  btn.addEventListener("click", async () => {
    if (run) return end();
    ac();
    const T = THEKAS[talaSel.value], cyc = T.bols.length, beat = 60 / 72, phrase = TIHAIS.find(x => x[0] === phSel.value)[2];
    const seq = noteSequencer({ minDur: 0.1, tol: 50 });
    run = { beat, onsets: [], events: [] };
    const ok = await m.start(r => { if (!run) return; const n = seq.feed(r); if (n) run.onsets.push({ t: n.t0, semi: n.semi }); }, btn);
    if (!ok || !run) { run = null; say(status, notStarted); return; }
    const c = ac(), t0 = c.currentTime + 0.3, ev = tihaiEvents(phrase, 1, cyc, cyc);
    run.events = ev.map(e => ({ ...e, t: t0 + e.beat * beat }));
    const lastBeat = ev[ev.length - 1].beat, total = lastBeat + 2;
    stopTabla = theka(T, beat, t0, total);
    const startBeat = ev[0].beat % cyc;
    beatsRow.replaceChildren(...T.bols.map((x, i) => h("span", { class: "sambeat" + (i === 0 ? " sam" : "") + (i === startBeat ? " start" : "") }, i === 0 ? "X" : String(i + 1))));
    ui = setInterval(() => { const i = Math.floor((ac().currentTime - t0) / beat); [...beatsRow.children].forEach((s, k) => s.classList.toggle("on", i >= 0 && k === ((i % cyc) + cyc) % cyc)); }, 40);
    btn.textContent = "Stop";
    say(status, "Start on beat " + (startBeat + 1) + " of the second cycle: " + TIHAIS.find(x => x[0] === phSel.value)[1] + ", rest, again, rest, again, landing on sam.");
    timer = setTimeout(end, (total * beat + 0.8) * 1000);
  });
  return { el, destroy() { clearTimeout(timer); clearInterval(ui); silence(); m.stop(); run = null; } };
}

// ---------- Taar saptak ----------
// Hold four upper-octave notes, three seconds each: steady, clear and in tune.
export const TAAR_NOTES = [12, 14, 16, 17];
export function taarSaptak() {
  const canvas = h("canvas", { class: "game-canvas", role: "img", "aria-label": "Taar saptak: each upper note's score" });
  const status = h("p", { class: "small", "aria-live": "polite" }, "Hold each upper-octave note for three seconds: S', R', G', m'. Faster, narrower air, not harder: the score rewards a steady, clear, in-tune note, not a loud one.");
  const btn = h("button", { type: "button", class: "btn primary" }, "Start");
  const el = h("div", { class: "stack game" }, h("div", { class: "row" }, btn), h("div", { class: "game-stage" }, canvas), status);
  const m = mic(el);
  let run = null, raf = 0;
  function draw() {
    const { g, W, H } = fitCanvas(canvas, 0.35), col = colors();
    g.clearRect(0, 0, W, H);
    const bw = (W - 40) / TAAR_NOTES.length;
    TAAR_NOTES.forEach((n, i) => {
      const res = run && run.res[i], x = 20 + i * bw;
      g.fillStyle = col.sunken; g.fillRect(x + 8, 30, bw - 16, H - 60);
      if (res) { g.fillStyle = res.score >= 70 ? col.good : res.score >= 40 ? col.warn : col.bad; const hh = (H - 60) * res.score / 100; g.fillRect(x + 8, H - 30 - hh, bw - 16, hh); }
      if (run && run.i === i && !res) { g.fillStyle = col.accent; const hh = (H - 60) * Math.min(1, run.held / 3); g.fillRect(x + 8, H - 30 - hh, bw - 16, hh); }
      g.fillStyle = col.ink; g.font = "bold 16px " + font(); g.fillText(codeOf(n), x + bw / 2 - 10, 20);
      if (res) { g.font = "13px " + font(); g.fillText(String(res.score), x + bw / 2 - 8, H - 10); }
    });
  }
  function step() {
    if (!run) return;
    const now = performance.now(), dt = Math.min(0.05, (now - run.last) / 1000); run.last = now;
    const n = TAAR_NOTES[run.i];
    if (now - run.heardAt < 200 && Math.abs(run.semi - n) <= 0.6) { run.held += dt; run.samples.push({ semi: run.semi, clarity: run.clarity }); }
    if (run.held >= 3) {
      run.res[run.i] = taarScore(run.samples, n) || { score: 0 };
      chime(run.res[run.i].score >= 70);
      run.i++; run.held = 0; run.samples = [];
      if (run.i >= TAAR_NOTES.length) { draw(); return end(); }
      say(status, "Next note:", codeOf(TAAR_NOTES[run.i]));
    }
    draw();
    raf = requestAnimationFrame(step);
  }
  function end() {
    cancelAnimationFrame(raf); m.stop();
    const r = run; run = { res: r.res, i: -1, held: 0 }; draw(); run = null; btn.textContent = "Play again";
    const done = r.res.filter(Boolean), avg = done.length ? Math.round(done.reduce((a, x) => a + x.score, 0) / TAAR_NOTES.length) : 0, b = keepBest("bansuri.game.taar.best", avg);
    const worst = done.filter(x => x.sd !== undefined).sort((a, b2) => a.score - b2.score)[0];
    const tip = !worst ? "" : worst.sd > 15 ? "The pitch wavered most on " + codeOf(TAAR_NOTES[r.res.indexOf(worst)]) + ": support from the belly, keep the lips still." : worst.clarity < 0.93 ? "Some air in the tone on " + codeOf(TAAR_NOTES[r.res.indexOf(worst)]) + ": a smaller lip opening, faster air." : Math.abs(worst.cents) > 20 ? codeOf(TAAR_NOTES[r.res.indexOf(worst)]) + " was " + Math.abs(worst.cents) + " cents " + (worst.cents > 0 ? "sharp: blow less hard, roll the flute in a touch." : "flat: aim the air a little higher.") : "";
    say(status, "Score " + avg + " of 100.", bestText(b), tip);
    emitLive({ type: "game", game: "taar", score: avg, best: b.isNew });
  }
  btn.addEventListener("click", async () => {
    if (run) return end();
    ac();
    run = { i: 0, held: 0, samples: [], res: [], semi: 0, clarity: 0, heardAt: -1e9, last: performance.now() };
    const ok = await m.start(r => { if (run && r.semi !== null) { run.semi = r.semi; run.clarity = r.clarity || 0; run.heardAt = performance.now(); } }, btn);
    if (!ok || !run) { run = null; say(status, notStarted); return; }
    btn.textContent = "Stop"; say(status, "Hold this note:", codeOf(TAAR_NOTES[0])); raf = requestAnimationFrame(step);
  });
  requestAnimationFrame(draw);
  return { el, destroy() { cancelAnimationFrame(raf); m.stop(); run = null; } };
}
