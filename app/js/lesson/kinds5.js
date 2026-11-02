// Lesson step kinds for ragas and ornaments: pick (choose a raga's notes from the 12), ornament
// (hear an ornament's shape, play it, see what the analyser heard: ornaments.js) and improv (play
// freely within a raga; notes it leaves out are named as they happen, and the rests are judged:
// ragagrammar.js alapCheck).
import { h, icon, store, storeSet } from "../util.js";
import { listenMic } from "../core/listen.js";
import { micIntro, countdown } from "../core/live.js";
import { ac, playCurve, playNote, tablaBol } from "../core/audio.js";
import { TAALS } from "./kinds3.js";
import { codeOf, nameOf } from "../core/theory.js";
import { targetCurve, analyse } from "../ornaments.js";
import { alapCheck } from "../ragagrammar.js";
import { ding } from "./sound.js";

async function openMic(host, btn, onReading) {
  if (!(await micIntro(host))) return null;
  if (!(await countdown(host, { btn }))) return null;
  try { return await listenMic(onReading); } catch (e) { return null; }
}

export const TWELVE = [["S", 0], ["r", 1], ["R", 2], ["g", 3], ["G", 4], ["m", 5], ["M", 6], ["P", 7], ["d", 8], ["D", 9], ["n", 10], ["N", 11]];

// Notes played, from microphone readings: a note counts once it has sounded for minSec, and a
// new note starts when the nearest note changes. Returns [{ semi, t0 }].
export function notesFromReadings(rs, minSec = 0.15) {
  const out = [];
  let cur = null, start = 0;
  const close = (t) => { if (cur !== null && t - start >= minSec && (!out.length || out[out.length - 1].semi !== cur || start - out[out.length - 1].t1 > 0.15)) out.push({ semi: cur, t0: start, t1: t }); else if (cur !== null && out.length && out[out.length - 1].semi === cur) out[out.length - 1].t1 = t; };
  for (const r of rs) {
    const n = r.semi === null || r.semi === undefined ? null : r.near;
    if (n === cur) continue;
    close(r.t); cur = n; start = r.t;
  }
  if (rs.length) close(rs[rs.length - 1].t);
  return out.map(({ semi, t0 }) => ({ semi, t0 }));
}

// A 16-beat melody (cells: semi | "hold" | null) judged by L30's tools: the question (beats 1-8)
// ends on an open note, the answer (9-16) ends on Sa. Returns { questionOpen, answerHome, filled }.
export function melodyCheck(cells) {
  const last = arr => { for (let i = arr.length - 1; i >= 0; i--) if (typeof arr[i] === "number") return arr[i]; return null; };
  const q = last(cells.slice(0, 8)), a = last(cells.slice(8));
  const pc = n => ((n % 12) + 12) % 12;
  return { questionOpen: q !== null && pc(q) !== 0, answerHome: a !== null && pc(a) === 0, filled: cells.filter(c => c !== null).length };
}

// The treble staff position of a note (semitones from C5 = Sa): diatonic steps above E4 (the
// bottom line, 0), and whether it needs a sharp. C5 is 5 steps up (the third space).
export function staffStep(semi) {
  const LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6], SHARP = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  const pc = ((semi % 12) + 12) % 12, oct = Math.floor(semi / 12);
  // E4 is letter 2 of octave 4; C5 is letter 0 of octave 5: C5 - E4 = 7 - 2 = 5 steps.
  return { step: 5 + LETTER[pc] + 7 * oct, sharp: !!SHARP[pc] };
}

// A tihai in teentaal: a phrase of len beats played three times with gap beats between. To end
// on beat land (17 = the next sam, 13 = where the mukhda starts) it starts on land + 1 - total.
export function tihaiStartBeat(len, gap, land = 17) { return land + 1 - (3 * len + 2 * gap); }
// The phrase's notes by beat when it starts on start: [{ beat, semi }].
export function tihaiBeats(phrase, gap, start) {
  const out = [];
  for (let r = 0; r < 3; r++) phrase.forEach((semi, k) => out.push({ beat: start + r * (phrase.length + gap) + k, semi }));
  return out;
}

function chipRounds(s, api, { onShow, onRight }) {
  let i = 0, right = 0, missed = false;
  const tally = h("p", { class: "small muted" });
  const opts = h("div", { class: "lesson-chips" });
  const out = h("div");
  function show() {
    const r = s.rounds[i]; missed = false; out.replaceChildren();
    tally.textContent = "Round " + (i + 1) + " of " + s.rounds.length;
    onShow(r);
    opts.replaceChildren(...r.options.map(o => {
      const b = h("button", { type: "button", class: "lesson-chip mono" }, o);
      b.addEventListener("click", () => {
        if (o !== r.answer) { missed = true; b.classList.add("wrong"); b.disabled = true; ding(false); return; }
        if (!missed) right++;
        b.classList.add("picked"); opts.querySelectorAll("button").forEach(x => { x.disabled = true; }); ding(true);
        if (onRight) onRight(r);
        const last = i === s.rounds.length - 1;
        const next = last ? null : h("button", { type: "button", class: "btn" }, "Next one");
        if (next) next.addEventListener("click", () => { i++; show(); });
        out.replaceChildren(...[r.why ? h("div", { class: "lesson-reveal good" }, h("b", null, "Right."), h("p", null, r.why)) : null, next].filter(Boolean));
        if (last) { api.data[s.id] = { right, of: s.rounds.length }; api.save(); api.ready(); }
      });
      return b;
    }));
  }
  return { tally, opts, out, show, round: () => s.rounds[i] };
}

// Accompanying a singer: the timeline of the singer's lines and the gaps between them, in
// seconds from the start. lines: [[semi per beat]], gap in beats.
export function fillsTimeline(lines, gap, beat) {
  const segs = [];
  let t = 0;
  lines.forEach((notes, i) => {
    segs.push({ kind: "line", t0: t, t1: t + notes.length * beat, notes, sound: 0 }); t += notes.length * beat;
    if (i < lines.length - 1) { segs.push({ kind: "gap", t0: t, t1: t + gap * beat, sound: 0 }); t += gap * beat; }
  });
  return segs;
}
// Seconds of your playing heard in each part -> gaps filled, and lines where you covered the words.
export function fillsScore(segs, minFill = 0.4, minCover = 0.25) {
  const gaps = segs.filter(x => x.kind === "gap"), lines = segs.filter(x => x.kind === "line");
  return { fills: gaps.filter(x => x.sound >= minFill).length, gaps: gaps.length, covered: lines.filter(x => x.sound >= minCover).length };
}

export const RAGA_KINDS = {
  // Play fills in the singer's gaps, never over the words. The singer's line is played on a
  // second flute voice; a note the mic hears that matches the line's current note is that
  // speaker, not you. { bpm, gap (beats), lines: [[semi per beat]] }
  fills: { make(s, api) {
    const k = window.__lessonTime ? 0.5 : 1, beat = 60 / (s.bpm || 72) * k;
    const pc = n => ((n % 12) + 12) % 12;
    let unsub = null, timers = [], tick = 0, segs = [];
    const bar = h("div", { class: "lesson-fills", "aria-hidden": "true" });
    const cursor = h("i", { class: "fills-cursor" });
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" }, "Press Start. The singer sings four lines; play a short fill in each gap, and stop before the next line.");
    const btn = h("button", { type: "button", class: "btn primary" }, icon("play"), " Start");
    const out = h("div");
    const root = h("div", { class: "stack lesson-center" }, bar, msg, btn, out);
    const draw = () => { segs = fillsTimeline(s.lines, s.gap || 4, beat); bar.replaceChildren(...segs.map(x => h("span", { class: "fills-" + x.kind, style: "flex:" + (x.t1 - x.t0) }, x.kind === "line" ? "Singer" : "Fill")), cursor); cursor.style.left = "0%"; };
    const stop = () => { timers.forEach(clearTimeout); timers = []; clearInterval(tick); if (unsub) { unsub(); unsub = null; } };
    draw();
    btn.addEventListener("click", async () => {
      if (unsub) return;
      draw(); out.replaceChildren();
      const now = () => performance.now() / 1000;
      let T0 = Infinity, last = 0, singer = null;
      const total = segs[segs.length - 1].t1;
      const u = await openMic(btn.parentElement, btn, r => {
        const t = now() - T0;
        if (t < 0 || t > total) return;
        const dt = Math.min(0.1, Math.max(0, t - last)); last = t;
        if (r.semi === null) return;
        if (singer && t < singer.until && pc(r.near) === pc(singer.semi)) return;
        const seg = segs.find(x => t >= x.t0 && t < x.t1);
        // A moment's grace as a line starts: a fill that ends just late is not covering words.
        if (seg && !(seg.kind === "line" && t - seg.t0 < 0.15)) seg.sound += dt;
      });
      if (!u) { msg.textContent = "The microphone is not available here."; api.ready(); return; }
      unsub = u; btn.disabled = true;
      T0 = now() + 0.3;
      for (const x of segs) if (x.kind === "line") x.notes.forEach((semi, j) => {
        const at = x.t0 + j * beat;
        timers.push(setTimeout(() => { singer = { semi, until: at + beat + 0.3 }; playNote(semi, beat * 0.95); }, (at + 0.3) * 1000));
      });
      tick = setInterval(() => {
        const t = now() - T0, seg = segs.find(x => t >= x.t0 && t < x.t1);
        cursor.style.left = Math.max(0, Math.min(100, 100 * t / total)) + "%";
        root.dataset.phase = seg ? seg.kind : "";
        if (seg) msg.textContent = seg.kind === "line" ? "The singer: listen." : "Your fill.";
      }, 50);
      timers.push(setTimeout(() => {
        stop(); delete root.dataset.phase; btn.disabled = false; btn.replaceChildren(icon("play"), " Again");
        const r = fillsScore(segs, 0.4 * k, 0.25 * k), good = r.fills >= r.gaps - 1 && !r.covered;
        ding(good);
        msg.textContent = r.fills + " of " + r.gaps + " gaps filled.";
        out.replaceChildren(h("div", { class: "notice" + (r.covered ? "" : " good") }, r.covered ? "You played over the singer in " + r.covered + " of " + s.lines.length + " lines: stop before the next line starts." : "Never over the words."));
        api.data[s.id] = r; api.save(); api.ready();
      }, (total + 0.6) * 1000));
    });
    return { el: root, destroy: stop };
  } },

  // Hear a phrase and name the note it rests on (the nyas). { rounds: [{ phrase: [[semi, seconds]], options, answer, why }] }
  nyas: { make(s, api) {
    let timers = [];
    const stop = () => { timers.forEach(clearTimeout); timers = []; };
    const R = chipRounds(s, api, { onShow: () => { stop(); } });
    const play = () => {
      stop();
      const k = window.__lessonTime ? 0.25 : 1;
      let t = 0;
      for (const [semi, dur] of R.round().phrase) { timers.push(setTimeout(() => playNote(semi, dur * k * 0.95), t * 1000)); t += dur * k; }
    };
    const hear = h("button", { type: "button", class: "btn primary" }, icon("play"), " Hear the phrase");
    hear.addEventListener("click", play);
    R.show();
    return { el: h("div", { class: "stack lesson-center" }, R.tally, hear, R.opts, R.out), destroy: stop };
  } },

  // Tap the beat a tihai must start on, then hear it against teentaal: does it land?
  // { bpm, rounds: [{ phrase: [semi per beat], gap, land: 17 | 13, why }] }
  tihai: { make(s, api) {
    let i = 0, right = 0, missed = false, timers = [], playing = false;
    const T = TAALS.teentaal, beat = 60 / (s.bpm || 90) * (window.__lessonTime ? 0.25 : 1);
    const q = h("p", { class: "lesson-q", "aria-live": "polite" });
    const tally = h("p", { class: "small muted" });
    const out = h("div");
    const grid = h("div", { class: "lesson-tihai" });
    const cells = Array.from({ length: 17 }, (_, k) => {
      const b = k + 1, mark = b === 17 ? "X" : T.marks[b] || "";
      const c = h("button", { type: "button", class: "lesson-tihaibeat" + (mark ? " mark" : ""), "aria-label": b === 17 ? "Next sam" : "Beat " + b },
        h("span", { class: "small" }, b === 17 ? "Next sam " : String(b) + " ", mark ? h("i", { class: "tihai-mark" }, mark) : null), h("b", { class: "mono" }, ""));
      c.addEventListener("click", () => { if (b < 17) pick(b); });
      return c;
    });
    grid.append(...cells);
    const stop = () => { timers.forEach(clearTimeout); timers = []; playing = false; };
    function paint(notes) {
      cells.forEach(c => { c.lastChild.textContent = ""; c.classList.remove("on"); });
      for (const n of notes) if (n.beat <= 17) { const c = cells[n.beat - 1]; c.lastChild.textContent = codeOf(n.semi); c.classList.add("on"); }
    }
    function pick(b) {
      if (playing) return;
      const r = s.rounds[i], land = r.land || 17, notes = tihaiBeats(r.phrase, r.gap, b), last = notes[notes.length - 1].beat;
      const total = 3 * r.phrase.length + 2 * r.gap, start = tihaiStartBeat(r.phrase.length, r.gap, land);
      paint(notes); playing = true; out.replaceChildren();
      cells.forEach(c => { c.disabled = true; });
      const c = ac(), t0 = c.currentTime + 0.3, end = Math.max(17, last);
      for (let k = 1; k <= end; k++) {
        const t = t0 + (k - 1) * beat, n = notes.find(x => x.beat === k);
        tablaBol(t, T.bols[(k - 1) % 16], beat, k === 1 || k === 17);
        timers.push(setTimeout(() => {
          cells.forEach(x => x.classList.remove("now"));
          if (k <= 17) cells[k - 1].classList.add("now");
          if (n) playNote(n.semi, beat * 0.9);
        }, (t - c.currentTime) * 1000));
      }
      timers.push(setTimeout(() => {
        stop(); cells.forEach(x => { x.classList.remove("now"); x.disabled = false; });
        const where = land === 17 ? "sam" : "beat 13";
        if (last === land) {
          if (!missed) right++;
          ding(true); cells.forEach(x => { x.disabled = true; });
          const final = i === s.rounds.length - 1;
          const next = final ? null : h("button", { type: "button", class: "btn" }, "Next one");
          if (next) next.addEventListener("click", () => { i++; show(); });
          out.replaceChildren(...[h("div", { class: "lesson-reveal good" }, h("b", null, "It lands on " + where + "."),
            h("p", null, "Total = 3 x " + r.phrase.length + " + 2 x " + r.gap + " = " + total + ". Start = " + (land + 1) + " - " + total + " = beat " + start + "."), r.why ? h("p", null, r.why) : null), next].filter(Boolean));
          if (final) { api.data[s.id] = { right, of: s.rounds.length }; api.save(); api.ready(); }
        } else {
          missed = true; ding(false);
          const off = last - land;
          out.replaceChildren(h("div", { class: "lesson-reveal" }, h("b", null, off > 0 ? "It ends " + off + " beats after " + where + "." : "It ends " + (-off) + " beats before " + where + "."),
            h("p", null, off > 0 ? "Start earlier. Work out the total length first." : "Start later. Work out the total length first.")));
        }
      }, (t0 - c.currentTime + end * beat + 0.4) * 1000));
    }
    function show() {
      const r = s.rounds[i], land = r.land || 17;
      missed = false; out.replaceChildren(); paint([]);
      cells.forEach(c => { c.disabled = false; });
      grid.dataset.start = String(tihaiStartBeat(r.phrase.length, r.gap, land));
      tally.textContent = "Round " + (i + 1) + " of " + s.rounds.length;
      const ph = r.phrase.map(codeOf).join(" ");
      q.textContent = "Phrase " + ph + " (" + r.phrase.length + " beats), gap " + r.gap + ". Tap the beat it starts on, so it ends " + (land === 17 ? "on the next sam." : "on beat 13, where the mukhda starts.");
    }
    show();
    return { el: h("div", { class: "stack lesson-center" }, tally, q, grid, out), destroy: stop };
  } },

  // Read a note on the treble staff. { rounds: [{ semi (from C5), options, answer, why }] }
  staff: { make(s, api) {
    const NS = "http://www.w3.org/2000/svg";
    const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); return e; };
    const svg = el("svg", { viewBox: "0 0 240 150", class: "lesson-staff", role: "img", "aria-label": "A note on the treble staff" });
    const R = chipRounds(s, api, { onShow: r => draw(r.semi), onRight: r => playNote(r.semi, 0.6) });
    const hear = h("button", { type: "button", class: "btn" }, icon("play"), " Hear it");
    hear.addEventListener("click", () => playNote(R.round().semi, 0.7));
    const Y0 = 105, GAP = 10; // the bottom line (E4) and the space between lines
    const yOf = step => Y0 - step * GAP / 2;
    function draw(semi) {
      svg.replaceChildren();
      for (let k = 0; k < 5; k++) svg.append(el("line", { x1: 20, x2: 220, y1: yOf(k * 2), y2: yOf(k * 2), class: "staff-line" }));
      const clef = el("text", { x: 26, y: yOf(2) + 16, class: "staff-clef" }); clef.textContent = "\u{1D11E}"; svg.append(clef);
      const { step, sharp } = staffStep(semi), x = 140;
      // Ledger lines below (C4 and lower) or above (A5 and higher).
      for (let k = -2; k >= step; k -= 2) svg.append(el("line", { x1: x - 16, x2: x + 16, y1: yOf(k), y2: yOf(k), class: "staff-line" }));
      for (let k = 10; k <= step; k += 2) svg.append(el("line", { x1: x - 16, x2: x + 16, y1: yOf(k), y2: yOf(k), class: "staff-line" }));
      svg.append(el("ellipse", { cx: x, cy: yOf(step), rx: 7.5, ry: 5.5, transform: `rotate(-20 ${x} ${yOf(step)})`, class: "staff-note" }));
      // Stems go up on the right below the middle line (B4, step 4), down on the left from it.
      const down = step >= 4, sx = down ? x - 7 : x + 7;
      svg.append(el("line", { x1: sx, x2: sx, y1: yOf(step), y2: yOf(step) + (down ? 30 : -30), class: "staff-stem" }));
      if (sharp) { const t = el("text", { x: x - 24, y: yOf(step) + 5, class: "staff-sharp" }); t.textContent = "#"; svg.append(t); }
    }
    R.show();
    return { el: h("div", { class: "stack lesson-center" }, R.tally, svg, hear, R.opts, R.out) };
  } },

  // Call and response: the app plays a question; you answer on the flute and come home to Sa.
  // { questions: [[semi]] }
  answer: { make(s, api) {
    let i = 0, unsub = null, reads = [], t0 = null, homes = 0, timer = 0;
    const tally = h("p", { class: "small muted" });
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" });
    const play = h("button", { type: "button", class: "btn" }, icon("play"), " Hear the question");
    const btn = h("button", { type: "button", class: "btn primary big" }, icon("mic"), " Answer");
    const out = h("div");
    const q = () => s.questions[i];
    play.addEventListener("click", () => q().forEach((n, k) => setTimeout(() => playNote(n, 0.5), k * 520)));
    function show() { tally.textContent = "Question " + (i + 1) + " of " + s.questions.length; msg.textContent = "Hear the question (it ends open), then answer: about four notes, ending on Sa."; out.replaceChildren(); }
    const stop = () => { clearInterval(timer); if (unsub) { unsub(); unsub = null; } btn.replaceChildren(icon("mic"), " Answer"); };
    function judge() {
      stop();
      const notes = notesFromReadings(reads);
      if (!notes.length) { msg.textContent = "No answer was heard. Press Answer, then play."; return; }
      const end = notes[notes.length - 1].semi, home = ((end % 12) + 12) % 12 === 0;
      msg.textContent = "";
      if (home) homes++;
      ding(home);
      const next = i < s.questions.length - 1 ? h("button", { type: "button", class: "btn" }, "Next question") : null;
      if (next) next.addEventListener("click", () => { i++; show(); });
      out.replaceChildren(...[h("div", { class: "lesson-reveal " + (home ? "good" : "warn") }, h("b", null, home ? "Home: your answer ends on Sa." : "Your answer ends on " + codeOf(end) + ": it still sounds open."),
        h("p", { class: "mono" }, notes.map(n => codeOf(n.semi)).join(" "))), next].filter(Boolean));
      if (!next) { api.data[s.id] = { homes, of: s.questions.length }; api.save(); api.ready(); }
    }
    btn.addEventListener("click", async () => {
      if (unsub) { judge(); return; }
      reads = []; t0 = null;
      const u = await openMic(btn.parentElement, btn, r => {
        if (t0 === null && r.semi !== null) t0 = r.t;
        if (t0 === null) return;
        reads.push({ t: r.t - t0, semi: r.semi, near: r.near });
      });
      if (!u) { msg.textContent = "The microphone is not available here."; api.ready(); return; }
      unsub = u; btn.replaceChildren(icon("stop"), " Done"); msg.textContent = "Answer now...";
      // The answer ends after 1.2 s of silence, or after 8 s.
      timer = setInterval(() => {
        if (!reads.length) return;
        const lastSound = [...reads].reverse().find(r => r.semi !== null);
        const now = reads[reads.length - 1].t;
        if ((lastSound && now - lastSound.t > 1.2) || now > 8) judge();
      }, 200);
    });
    show();
    return { el: h("div", { class: "stack lesson-center" }, tally, play, msg, btn, out), destroy: stop };
  } },

  // Compose 16 beats: a question (8) and an answer (8). Tap a beat, then a note (or Hold, or Rest).
  // { notes: [semi] (the palette) }. Saved to the melodies in Play, Make a melody.
  compose: { make(s, api) {
    const cells = Array(16).fill(null);
    let at = 0;
    const cellsEl = h("div", { class: "lesson-comp" }, cells.map((_, k) => {
      const b = h("button", { type: "button", class: "lesson-cell", "aria-label": "Beat " + (k + 1) }, "");
      b.addEventListener("click", () => { at = k; draw(); });
      return b;
    }));
    const set = v => { cells[at] = v; if (typeof v === "number") playNote(v, 0.4); at = Math.min(15, at + 1); draw(); };
    const hold = h("button", { type: "button", class: "lesson-chip" }, "Hold");
    const rest = h("button", { type: "button", class: "lesson-chip" }, "Rest");
    hold.addEventListener("click", () => set("hold"));
    rest.addEventListener("click", () => set(null));
    const palette = h("div", { class: "lesson-chips" }, s.notes.map(n => { const b = h("button", { type: "button", class: "lesson-chip mono" }, codeOf(n)); b.addEventListener("click", () => set(n)); return b; }), hold, rest);
    const checks = h("div", { class: "stack" });
    const play = h("button", { type: "button", class: "btn" }, icon("play"), " Play it");
    const save = h("button", { type: "button", class: "btn primary" }, "Save it");
    play.addEventListener("click", () => {
      const beat = 60 / 70;
      cells.forEach((c, k) => { if (typeof c !== "number") return; let len = 1; while (cells[k + len] === "hold") len++; setTimeout(() => playNote(c, beat * len * 0.95), k * beat * 1000); });
    });
    save.addEventListener("click", () => {
      const l = store("bansuri.compose.saved", []), name = "Melody " + (l.length + 1);
      const notation = cells.map((c, k) => (c === null ? "_" : c === "hold" ? "-" : codeOf(c)) + ((k + 1) % 4 === 0 && k < 15 ? " |" : "")).join(" ") + " ||";
      l.push({ name, cells: cells.slice(), notation }); storeSet("bansuri.compose.saved", l.slice(-20));
      api.data[s.id] = { notation }; api.save(); api.ready(); ding(true);
      save.textContent = "Saved as " + name;
    });
    function draw() {
      cellsEl.querySelectorAll(".lesson-cell").forEach((b, k) => { const c = cells[k]; b.textContent = c === null ? "" : c === "hold" ? "-" : codeOf(c); b.classList.toggle("now", k === at); });
      const r = melodyCheck(cells);
      checks.replaceChildren(
        h("div", { class: "notice" + (r.questionOpen ? " good" : "") }, h("b", null, r.questionOpen ? "OK " : "To do "), "The question (beats 1-8) ends on an open note: R, G, P or D."),
        h("div", { class: "notice" + (r.answerHome ? " good" : "") }, h("b", null, r.answerHome ? "OK " : "To do "), "The answer (beats 9-16) comes home to Sa."));
      save.disabled = !(r.questionOpen && r.answerHome && r.filled >= 10);
    }
    draw();
    return { el: h("div", { class: "stack lesson-center" }, cellsEl, palette, checks, h("div", { class: "row" }, play, save)) };
  } },

  // Read Bhatkhande notation: a Devanagari letter (or a few) drawn with its marks; choose the
  // course notation. { rounds: [{ tokens: [{ t, mark }], options, answer, why }] }
  // mark: "komal" (line under), "tivra" (tick above), "mandra" (dot below), "taar" (dot above),
  // "meend" (arc above the group).
  bhatkhande: { make(s, api) {
    let i = 0, right = 0, missed = false;
    const tally = h("p", { class: "small muted" });
    const line = h("div", { class: "bk-line", lang: "hi" });
    const opts = h("div", { class: "lesson-chips" });
    const out = h("div");
    function show() {
      const r = s.rounds[i]; missed = false; out.replaceChildren();
      tally.textContent = "Round " + (i + 1) + " of " + s.rounds.length;
      line.className = "bk-line" + (r.arc ? " bk-arc" : "");
      line.replaceChildren(...r.tokens.map(tk => h("span", { class: "bk-tok" + (tk.mark ? " bk-" + tk.mark : "") }, tk.t)));
      opts.replaceChildren(...r.options.map(o => {
        const b = h("button", { type: "button", class: "lesson-chip mono" }, o);
        b.addEventListener("click", () => {
          if (o !== r.answer) { missed = true; b.classList.add("wrong"); b.disabled = true; ding(false); return; }
          if (!missed) right++;
          b.classList.add("picked"); opts.querySelectorAll("button").forEach(x => { x.disabled = true; }); ding(true);
          const last = i === s.rounds.length - 1;
          const next = last ? null : h("button", { type: "button", class: "btn" }, "Next one");
          if (next) next.addEventListener("click", () => { i++; show(); });
          out.replaceChildren(...[r.why ? h("div", { class: "lesson-reveal good" }, h("b", null, "Right."), h("p", null, r.why)) : null, next].filter(Boolean));
          if (last) { api.data[s.id] = { right, of: s.rounds.length }; api.save(); api.ready(); }
        });
        return b;
      }));
    }
    show();
    return { el: h("div", { class: "stack lesson-center" }, tally, line, opts, out) };
  } },

  // Hear a scale, then choose its notes from the 12. { notes: [semi] (the answer), play: [semi] }
  pick: { make(s, api) {
    const chosen = new Set();
    const out = h("div");
    const hear = h("button", { type: "button", class: "btn primary" }, icon("play"), " Hear it");
    hear.addEventListener("click", () => (s.play || s.notes).forEach((n, i) => setTimeout(() => playNote(n, 0.45), i * 480)));
    const keys = h("div", { class: "lesson-chips lesson-twelve" }, TWELVE.map(([label, semi]) => {
      const b = h("button", { type: "button", class: "lesson-chip mono", "aria-pressed": "false" }, label);
      b.addEventListener("click", () => {
        playNote(semi, 0.4);
        if (chosen.has(semi)) chosen.delete(semi); else chosen.add(semi);
        b.classList.toggle("picked", chosen.has(semi)); b.setAttribute("aria-pressed", String(chosen.has(semi)));
      });
      return b;
    }));
    const check = h("button", { type: "button", class: "btn" }, "Check");
    check.addEventListener("click", () => {
      const want = new Set(s.notes.map(n => ((n % 12) + 12) % 12));
      const missing = [...want].filter(n => !chosen.has(n)), extra = [...chosen].filter(n => !want.has(n));
      const ok = !missing.length && !extra.length;
      ding(ok);
      keys.querySelectorAll("button").forEach((b, i) => { const n = TWELVE[i][1]; b.classList.toggle("wrong", extra.includes(n)); b.classList.toggle("missed", missing.includes(n)); });
      out.replaceChildren(h("div", { class: "lesson-reveal " + (ok ? "good" : "warn") }, h("b", null, ok ? "Exactly these notes." : "Not yet."),
        h("p", null, ok ? s.why || "" : [missing.length ? "Missing: " + missing.map(n => codeOf(n)).join(" ") + "." : "", extra.length ? " Not in it: " + extra.map(n => codeOf(n)).join(" ") + "." : ""].join("").trim())));
      if (ok || api.data[s.id]) { api.data[s.id] = { ok }; api.save(); api.ready(); }
      else { api.data[s.id] = { ok: false }; api.save(); }
    });
    return { el: h("div", { class: "stack lesson-center" }, hear, keys, check, out) };
  } },

  // An ornament: hear its target shape, play it, and see what the analyser heard.
  // { key: "meend"|"kan"|"murki"|"andolan", ex: { ... as in ornaments.js } }
  ornament: { make(s, api) {
    let unsub = null, timer = 0, reads = [], t0 = null;
    const tgt = targetCurve(s.key, s.ex), secs = tgt[tgt.length - 1].t;
    const hear = h("button", { type: "button", class: "btn" }, icon("play"), " Hear the shape");
    const slow = h("button", { type: "button", class: "btn" }, icon("play"), " Half speed");
    hear.addEventListener("click", () => playCurve(tgt, 1));
    slow.addEventListener("click", () => playCurve(tgt, 0.5));
    const btn = h("button", { type: "button", class: "btn primary big" }, icon("mic"), " Try it");
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" }, "Hear it, then press Try it and play it once.");
    const out = h("div", { class: "stack" });
    const stop = () => { clearTimeout(timer); if (unsub) { unsub(); unsub = null; } btn.replaceChildren(icon("mic"), " Try again"); };
    btn.addEventListener("click", async () => {
      if (unsub) { stop(); return; }
      reads = []; t0 = null; out.replaceChildren();
      const u = await openMic(btn.parentElement, btn, r => { if (t0 === null && r.semi !== null) t0 = r.t; if (t0 !== null) reads.push({ t: r.t - t0, semi: r.semi }); });
      if (!u) { msg.textContent = "The microphone is not available here."; api.ready(); return; }
      unsub = u; btn.replaceChildren(icon("stop"), " Stop"); msg.textContent = "Play it now...";
      timer = setTimeout(() => {
        stop();
        let res = null;
        try { res = analyse(s.key, s.ex, reads, nameOf); } catch (e) { res = null; }
        if (!res || !res.of) { msg.textContent = (res && res.checks && res.checks[0] && res.checks[0].text) || "Not enough of a note was heard. Play a little louder, closer to the microphone."; return; }
        const ok = res.passed === res.of;
        ding(ok);
        msg.textContent = ok ? "Every check passed." : res.passed + " of " + res.of + " checks passed.";
        out.replaceChildren(...res.checks.map(c => h("div", { class: "notice" + (c.ok ? " good" : "") }, h("b", null, c.ok ? "OK " : "Change "), c.text)));
        api.data[s.id] = { passed: res.passed, of: res.of }; api.save(); api.ready();
      }, (secs + 2.5) * 1000);
    });
    return { el: h("div", { class: "stack lesson-center" }, h("div", { class: "row" }, hear, slow), msg, btn, out), destroy: stop };
  } },

  // Play freely within a raga. { name, notes: [pc], aroh: [pc], avroh: [pc], strong: [pc], seconds }
  improv: { make(s, api) {
    const secs = s.seconds || 40;
    let unsub = null, timer = 0, reads = [], t0 = null, lastFlag = null, runNote = null, runStart = 0;
    const allowed = new Set(s.notes);
    const trail = h("div", { class: "lesson-trail mono", "aria-live": "off" });
    const flag = h("p", { class: "small", "aria-live": "polite" });
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" }, "Press Start and play for " + secs + " seconds, using only " + s.name + "'s notes. Rest on the strong notes.");
    const keys = h("div", { class: "lesson-chips" }, TWELVE.filter(([, n]) => allowed.has(n)).map(([label]) => h("span", { class: "lesson-chip mono" + (s.strong.includes(TWELVE.find(x => x[0] === label)[1]) ? " picked" : "") }, label)));
    const out = h("div");
    const btn = h("button", { type: "button", class: "btn primary big" }, icon("mic"), " Start");
    const pc = n => ((n % 12) + 12) % 12;
    const stop = () => { clearTimeout(timer); if (unsub) { unsub(); unsub = null; } btn.replaceChildren(icon("mic"), " Again"); };
    function finish() {
      stop();
      const end = reads.length ? reads[reads.length - 1].t : 0, notes = notesFromReadings(reads);
      const outside = notes.filter(n => !allowed.has(pc(n.semi)));
      const g = { notes: s.notes, aroh: s.aroh, avroh: s.avroh, strong: s.strong }, r = alapCheck(notes, g, end);
      const slips = Object.keys(r.up).concat(Object.keys(r.down));
      ding(notes.length >= 8 && !outside.length);
      out.replaceChildren(h("div", { class: "stack" },
        h("div", { class: "notice" + (outside.length ? "" : " good") }, h("b", null, outside.length ? "Outside the raga: " : "Only " + s.name + "'s notes. "), outside.length ? [...new Set(outside.map(n => codeOf(pc(n.semi))))].join(" ") + "." : ""),
        h("div", { class: "notice" + (r.rests && r.strongRests === r.rests ? " good" : "") }, h("b", null, "Rests: "), r.rests ? r.strongRests + " of " + r.rests + " on strong notes (" + s.strong.map(codeOf).join(" ") + ")." : "hold a note for a second to rest on it."),
        slips.length ? h("div", { class: "notice" }, h("b", null, "Direction: "), "check the aroh and avroh: " + [...new Set(slips)].map(n => codeOf(Number(n))).join(" ") + ".") : null,
        h("p", { class: "small muted" }, notes.length + " notes heard. This is a guide from the raga's rules, not a judge of beauty: a raga has phrases no table shows.")));
      api.data[s.id] = { notes: notes.length, outside: outside.length, strongRests: r.strongRests, rests: r.rests }; api.save(); api.ready();
    }
    btn.addEventListener("click", async () => {
      if (unsub) { finish(); return; }
      reads = []; t0 = null; runNote = null; lastFlag = null; trail.textContent = ""; out.replaceChildren(); flag.textContent = "";
      const u = await openMic(btn.parentElement, btn, r => {
        if (t0 === null && r.semi !== null) t0 = r.t;
        if (t0 === null) return;
        reads.push({ t: r.t - t0, semi: r.semi, near: r.near });
        // A note counts once it has lasted 0.15 s (as in the result): passing frames between
        // notes are not flagged.
        const n = r.semi === null ? null : r.near;
        if (n !== runNote) { runNote = n; runStart = r.t; return; }
        if (n === null || r.t - runStart < 0.15) return;
        const p = pc(n);
        if (!allowed.has(p) && lastFlag !== p) { lastFlag = p; flag.textContent = codeOf(p) + " is not in " + s.name + "."; flag.className = "small warn"; }
        if (trail.textContent.split(" ").pop() !== codeOf(n)) trail.textContent = (trail.textContent + " " + codeOf(n)).trim().split(" ").slice(-14).join(" ");
      });
      if (!u) { msg.textContent = "The microphone is not available here."; api.ready(); return; }
      unsub = u; btn.replaceChildren(icon("stop"), " Stop");
      timer = setTimeout(finish, secs * 1000 * (window.__lessonTime ? 0.1 : 1));
    });
    return { el: h("div", { class: "stack lesson-center" }, keys, msg, trail, flag, btn, out), destroy: stop };
  } },
};
