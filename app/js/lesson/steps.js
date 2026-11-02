// The kinds of lesson step. Each make(step, api) returns { el, destroy? } and calls api.ready()
// once the step has been done; api.data keeps what the learner chose (saved with the lesson).
import { h, icon, fmtClock } from "../util.js";
import { ac, makeVoice, click, playNote } from "../core/audio.js";
import { codeOf, nameOf, hzOf, FING } from "../core/theory.js";
import { startRecording, recordingSupported, saveRecording, newId } from "../recorder.js";
import { today } from "../util.js";
import { fluteSvg, partName, noteOfPattern } from "./flute.js";
import { ding } from "./sound.js";
import { MORE_KINDS } from "./kinds2.js";
import { LISTEN_KINDS } from "./kinds3.js";
import { PITCH_KINDS } from "./kinds4.js";
import { RAGA_KINDS } from "./kinds5.js";
import { decodeAudioFile, toneProfile } from "../core/pitch.js";
import { MEASURES, BAND, BAND_CLS, bandOf } from "../views/tone.js";

export { ding };

function shuffle(list) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const reveal = (ok, head, text) => h("div", { class: "lesson-reveal " + (ok ? "good" : "warn") }, h("b", null, head), text ? h("p", null, text) : null);

// Taps against the beat: how far each tap is from its nearest beat (ms), the median of those (a
// steady device delay, left out), and how many taps land within 90 ms of the beat after that.
export function beatScore(taps, beats) {
  if (!taps.length || !beats.length) return { on: 0, of: beats.length, lag: 0 };
  const offs = taps.map(t => { let best = Infinity; for (const b of beats) if (Math.abs(t - b) < Math.abs(best)) best = t - b; return best * 1000; });
  const sorted = offs.slice().sort((a, b) => a - b), lag = sorted[sorted.length >> 1];
  const on = offs.filter(x => Math.abs(x - lag) <= 90).length;
  return { on: Math.min(on, beats.length), of: beats.length, lag: Math.round(lag) };
}

export const STEP_KINDS = {
  ...MORE_KINDS,
  ...LISTEN_KINDS,
  ...PITCH_KINDS,
  ...RAGA_KINDS,
  // Listen to a recording, then guess. { audio, prompt, options: [{ text, right }], yes, no, explain }
  listen: { make(s, api) {
    // s.audio (a recording) or s.seq (notes, played on the flute voice).
    const timers = [];
    const audio = s.seq ? { paused: true, currentTime: 0, play() { this.paused = false; s.seq.forEach((n, i) => timers.push(setTimeout(() => { if (n !== null) playNote(n, 0.5); if (i === s.seq.length - 1) { this.paused = true; timers.push(setTimeout(() => this.onend && this.onend(), 500)); } }, i * 520))); return Promise.resolve(); }, pause() { timers.forEach(clearTimeout); this.paused = true; }, addEventListener(e, f) { this.onend = f; } } : new Audio(s.audio);
    const play = h("button", { type: "button", class: "btn lesson-play" }, icon("play"), " Hear it");
    audio.addEventListener("ended", () => play.replaceChildren(icon("play"), " Hear it again"));
    play.addEventListener("click", () => { if (audio.paused) { audio.currentTime = 0; audio.play().catch(() => {}); play.replaceChildren(icon("pause"), " Pause"); } else { audio.pause(); play.replaceChildren(icon("play"), " Hear it"); } });
    const out = h("div");
    const opts = h("div", { class: "lesson-options" }, s.options.map((op, i) => {
      const b = h("button", { type: "button", class: "lesson-option" }, op.text);
      b.addEventListener("click", () => {
        opts.querySelectorAll(".lesson-option").forEach(x => { x.classList.remove("picked"); });
        b.classList.add("picked", op.right ? "right" : "wrong");
        ding(!!op.right);
        api.data[s.id] = i; api.save();
        out.replaceChildren(reveal(!!op.right, op.right ? s.yes : s.no, s.explain));
        api.ready();
      });
      return b;
    }));
    return { el: h("div", { class: "stack" }, h("div", { class: "row" }, play), s.prompt ? h("p", { class: "lesson-q" }, s.prompt) : null, opts, out), destroy() { audio.pause(); } };
  } },

  // Questions one at a time; a wrong answer explains and can be tried again.
  // { questions: [{ q, options: [{ text, right, why }], why }] }
  quiz: { make(s, api) {
    let i = 0, firstTry = 0, missed = false;
    const host = h("div", { class: "stack" });
    const tally = h("p", { class: "small muted" });
    function ask() {
      const q = s.questions[i]; missed = false;
      tally.textContent = "Question " + (i + 1) + " of " + s.questions.length;
      const out = h("div");
      const opts = h("div", { class: "lesson-options" }, q.options.map(op => {
        const b = h("button", { type: "button", class: "lesson-option" }, op.text);
        b.addEventListener("click", () => {
          if (op.right) {
            if (!missed) firstTry++;
            b.classList.add("right"); opts.querySelectorAll("button").forEach(x => { x.disabled = true; });
            ding(true);
            const last = i === s.questions.length - 1;
            const nextQ = last ? null : h("button", { type: "button", class: "btn" }, "Next question");
            if (nextQ) nextQ.addEventListener("click", () => { i++; ask(); });
            out.replaceChildren(...[reveal(true, "Right.", q.why), nextQ].filter(Boolean));
            if (last) { api.data[s.id] = { firstTry, of: s.questions.length }; api.save(); api.ready(); }
          } else {
            missed = true; b.classList.add("wrong"); b.disabled = true; ding(false);
            out.replaceChildren(reveal(false, "Not this one.", op.why || "Try another answer."));
          }
        });
        return b;
      }));
      host.replaceChildren(tally, h("p", { class: "lesson-q" }, q.q), opts, out);
    }
    ask();
    return { el: host };
  } },

  // Checks to do in the real world, one card each. { items: [{ id, title, text, fix }], yes, no }
  cards: { make(s, api) {
    const got = Object.assign({}, api.data[s.id] || {});
    const list = h("div", { class: "lesson-cards" });
    const done = () => { if (s.items.every(it => it.id in got)) api.ready(); };
    s.items.forEach(it => {
      const res = h("div");
      const card = h("div", { class: "lesson-card" }, h("b", null, it.title), h("p", null, it.text));
      const yes = h("button", { type: "button", class: "btn small" }, icon("check"), " " + (s.yes || "Looks fine"));
      const no = h("button", { type: "button", class: "btn small ghost" }, s.no || "Found something");
      const mark = ok => {
        got[it.id] = ok; api.data[s.id] = got; api.save();
        card.classList.toggle("ok", ok); card.classList.toggle("found", !ok);
        res.replaceChildren(ok ? h("span", { class: "chip good" }, "Checked") : h("p", { class: "lesson-fix" }, it.fix));
        done();
      };
      yes.addEventListener("click", () => mark(true)); no.addEventListener("click", () => mark(false));
      card.append(h("div", { class: "row" }, yes, no), res);
      if (it.id in got) mark(got[it.id]);
      list.append(card);
    });
    done();
    return { el: list };
  } },

  // Pick one. { key, options: [{ id, text, sub, pic(): Node, after }] }
  choose: { make(s, api) {
    const out = h("div");
    const opts = h("div", { class: "lesson-choices" }, s.options.map(op => {
      const b = h("button", { type: "button", class: "lesson-choice", "aria-pressed": "false" }, op.pic ? op.pic() : null, h("b", null, op.text), op.sub ? h("span", { class: "small muted" }, op.sub) : null);
      const pick = quiet => {
        opts.querySelectorAll(".lesson-choice").forEach(x => { x.classList.remove("picked"); x.setAttribute("aria-pressed", "false"); });
        b.classList.add("picked"); b.setAttribute("aria-pressed", "true");
        api.data[s.key] = op.id; api.save();
        out.replaceChildren(op.after ? reveal(true, op.afterHead || "Saved.", op.after) : null);
        if (!quiet) ding(true);
        api.ready();
      };
      b.addEventListener("click", () => pick(false));
      if (api.data[s.key] === op.id) setTimeout(() => pick(true));
      return b;
    }));
    return { el: h("div", { class: "stack" }, opts, out) };
  } },

  // Several small choices on one screen. { groups: [{ key, label, options: [{ id, text }] }], after }
  form: { make(s, api) {
    const check = () => { if (s.groups.every(g => api.data[g.key])) api.ready(); };
    const groups = s.groups.map(g => h("fieldset", { class: "lesson-group" }, h("legend", null, g.label),
      h("div", { class: "lesson-chips" }, g.options.map(op => {
        const b = h("button", { type: "button", class: "lesson-chip" + (api.data[g.key] === op.id ? " picked" : ""), "aria-pressed": String(api.data[g.key] === op.id) }, op.text);
        b.addEventListener("click", () => {
          b.parentElement.querySelectorAll("button").forEach(x => { x.classList.remove("picked"); x.setAttribute("aria-pressed", "false"); });
          b.classList.add("picked"); b.setAttribute("aria-pressed", "true");
          api.data[g.key] = op.id; api.save(); check();
        });
        return b;
      }))));
    check();
    return { el: h("div", { class: "stack" }, groups, s.after ? h("p", { class: "small muted" }, s.after) : null) };
  } },

  // Do something for a while, then tick what was true. { seconds, start, checks: [text] }
  timer: { make(s, api) {
    // window.__lessonTime shortens timers in the browser tests (1 = real time).
    const secs = Math.max(1, Math.round(s.seconds * (window.__lessonTime || 1)));
    let timer = 0, left = secs;
    // Two minutes or more (a practice day's block) count down as minutes and seconds.
    const long = s.seconds >= 120, show = v => (long ? fmtClock(v) : String(v));
    const num = h("b", { class: "lesson-timer-n" }, show(left));
    const ringEl = h("div", { class: "lesson-timer" }, num, h("span", { class: "small muted" }, long ? "minutes" : "seconds"));
    const btn = h("button", { type: "button", class: "btn primary" }, s.start || "Start");
    const checks = h("div", { class: "stack", hidden: true }, h("p", { class: "lesson-q" }, "Tick what was true:"),
      s.checks.map((c, i) => { const box = h("input", { type: "checkbox", id: s.id + "-c" + i }); box.addEventListener("change", () => { if ([...checks.querySelectorAll("input")].every(x => x.checked)) { api.data[s.id] = true; api.save(); api.ready(); } }); return h("label", { class: "check", for: s.id + "-c" + i }, box, c); }));
    // A long block can end early: the same ticks, without waiting out the clock.
    const early = h("button", { type: "button", class: "linkbtn", hidden: true }, "Done early");
    const stopRun = () => { clearInterval(timer); btn.disabled = false; btn.textContent = "Again"; ringEl.classList.remove("running"); early.hidden = true; checks.hidden = false; };
    early.addEventListener("click", stopRun);
    btn.addEventListener("click", () => {
      clearInterval(timer); left = secs; num.textContent = show(left); btn.disabled = true; ringEl.classList.add("running"); early.hidden = !long;
      timer = setInterval(() => {
        left--; num.textContent = show(Math.max(0, left));
        ringEl.style.setProperty("--p", String(1 - left / secs));
        if (left > 0) return;
        ding(true); stopRun();
      }, 1000);
    });
    // read: the block's readings (a practice day's timer), one tap away.
    const read = s.read && s.read.length ? h("div", { class: "linklist" }, s.read.map(r => h("a", { href: "#/read/" + r.path + (r.anchor ? "#" + r.anchor : "") }, r.label))) : null;
    return { el: h("div", { class: "stack lesson-center" }, ringEl, h("div", { class: "row" }, btn, early), checks, read), destroy() { clearInterval(timer); } };
  } },

  // Tap along with a metronome. { bpm, beats }
  beat: { make(s, api) {
    const bpm = s.bpm || 72, n = s.beats || 8, gap = 60 / bpm;
    let beats = [], taps = [], end = 0, timers = [];
    const pad = h("button", { type: "button", class: "lesson-pad", disabled: true }, "Tap");
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" }, "Press Start: four clicks to count you in, then tap on every click.");
    const start = h("button", { type: "button", class: "btn primary" }, "Start");
    const lights = h("div", { class: "lesson-lights", "aria-hidden": "true" }, [0, 1, 2, 3].map(() => h("i")));
    const flash = i => { const l = lights.children[i % 4]; l.classList.add("on"); timers.push(setTimeout(() => l.classList.remove("on"), 140)); };
    start.addEventListener("click", () => {
      const c = ac(), t0 = c.currentTime + 0.3;
      timers.forEach(clearTimeout); timers = []; taps = []; beats = [];
      for (let i = 0; i < 4 + n; i++) {
        const t = t0 + i * gap;
        click(t, i === 4 ? "sam" : i < 4 ? "khali" : "tick");
        if (i >= 4) beats.push(t);
        timers.push(setTimeout(() => flash(i), (t - c.currentTime) * 1000));
      }
      end = t0 + (4 + n) * gap;
      pad.disabled = false; start.disabled = true; msg.textContent = "Tap with the clicks...";
      timers.push(setTimeout(() => {
        pad.disabled = true; start.disabled = false; start.textContent = "Again";
        const r = beatScore(taps, beats);
        api.data[s.id] = r; api.save();
        msg.textContent = r.on >= n - 2 ? "On the beat: " + r.on + " of " + n + " taps. That is your metronome." : r.on + " of " + n + " taps on the beat. Try again, or go on: it gets easier every day.";
        ding(r.on >= n - 2);
        api.ready();
      }, (end - c.currentTime + 0.3) * 1000));
    });
    const tap = () => { if (!pad.disabled) { taps.push(ac().currentTime); pad.classList.add("hit"); setTimeout(() => pad.classList.remove("hit"), 90); } };
    pad.addEventListener("pointerdown", e => { e.preventDefault(); tap(); });
    pad.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); tap(); } });
    return { el: h("div", { class: "stack lesson-center" }, lights, pad, msg, h("div", { class: "row" }, start)), destroy() { timers.forEach(clearTimeout); } };
  } },

  // Find the parts of the flute. { targets: [partId] }
  parts: { make(s, api) {
    const order = shuffle(s.targets);
    let k = 0, mistakes = 0;
    // The part's name in its own span after a fixed phrase, so each translates whole.
    const ask = h("p", { class: "lesson-q", "aria-live": "polite" });
    const setAsk = id => ask.replaceChildren(h("span", null, "Find this part:"), " ", h("b", { "data-part": id }, partName(id)));
    const note = h("p", { class: "small muted" });
    const fl = fluteSvg({ side: api.data.side || "right", numbers: false, onTap: id => {
      if (k >= order.length) return;
      const want = order[k];
      if (id === want) {
        fl.mark(id, "fl-found"); ding(true); k++;
        note.textContent = "";
        if (k < order.length) setAsk(order[k]);
        else { ask.textContent = !mistakes ? "All found, no slips. You know your flute." : mistakes === 1 ? "All found, with one slip. You know your flute." : "All found, with " + mistakes + " slips. You know your flute."; api.data[s.id] = { mistakes }; api.save(); api.ready(); }
      } else {
        mistakes++; ding(false);
        note.replaceChildren(h("span", null, "You tapped:"), " ", h("b", null, partName(id)), ". ", h("span", null, "Holes are numbered from the blowing-hole end."));
      }
    } });
    setAsk(order[0]);
    return { el: h("div", { class: "stack" }, h("div", { class: "lesson-flute" }, fl.el), ask, note) };
  } },

  // Close and open the holes and hear the note. { goal: semitones, goalText }
  holes: { make(s, api) {
    let voice = null;
    const seen = new Set();
    const name = h("b", { class: "lesson-note" }, "-");
    const sub = h("span", { class: "small muted" });
    const found = h("div", { class: "lesson-found", "aria-label": "Notes you found" });
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" }, s.start || "Tap holes to close them, then press Blow.");
    const fl = fluteSvg({ side: api.data.side || (typeof s.side === "function" ? s.side() : s.side) || "right", numbers: true, holes: true, onTap: () => update() });
    if (s.startPattern) fl.setPattern(s.startPattern);
    const blow = h("button", { type: "button", class: "btn primary big lesson-blow" }, "Blow");
    function update() {
      const semi = noteOfPattern(fl.pattern());
      if (semi === null) { name.textContent = "?"; sub.textContent = "Not on the chart: close holes from the top, with no gap"; return null; }
      name.textContent = codeOf(semi); sub.textContent = nameOf(semi);
      return semi;
    }
    function play() {
      const semi = update();
      stopVoice();
      if (semi === null) { ding(false); msg.textContent = "Air leaks out of the gap: on a bansuri you close the holes from the top down."; return; }
      const c = ac(), t = c.currentTime + 0.02;
      voice = makeVoice(hzOf(semi), t);
      voice.stop(t + 1.4);
      if (!seen.has(semi)) { seen.add(semi); found.append(h("span", { class: "chip" }, codeOf(semi))); }
      if (semi === s.goal) { msg.textContent = s.goalText; api.ready(); ding(true); }
      else msg.textContent = seen.size > 1 ? "More holes closed, longer air column, lower note. Keep exploring, or find " + codeOf(s.goal) + "." : "Now close or open a hole and blow again: higher or lower?";
    }
    function stopVoice() { if (voice) { try { voice.stop(ac().currentTime + 0.05); } catch (e) { /* ended */ } voice = null; } }
    blow.addEventListener("click", play);
    update();
    return { el: h("div", { class: "stack", "data-goal": FING[s.goal] || "" }, h("div", { class: "lesson-flute" }, fl.el), h("div", { class: "row lesson-noterow" }, h("div", { class: "stack tight" }, name, sub), blow), msg, found), destroy: stopVoice };
  } },

  // Record a few seconds into the Journal. { seconds, label, skip }
  record: { make(s, api) {
    let rec = null, timer = 0, url = null;
    const btn = h("button", { type: "button", class: "btn primary big" }, icon("mic"), " Record " + s.seconds + " seconds");
    const msg = h("p", { class: "lesson-q", "aria-live": "polite" }, s.start || "");
    const player = h("audio", { controls: true, hidden: true });
    const heard = h("div", { class: "stack" });
    // analyse: true measures the recording as Tone check does, as a second opinion to listen with.
    async function analyse(blob) {
      try {
        const a = await decodeAudioFile(blob), p = toneProfile(a.getChannelData(0), a.sampleRate);
        if (!p) { heard.replaceChildren(h("p", { class: "small muted" }, "No steady note of 1.5 seconds was heard, so there is nothing to measure yet.")); return; }
        api.data[s.id] = Object.assign({}, api.data[s.id], { profile: p }); api.save();
        heard.replaceChildren(h("b", null, "What the app measured:"), h("div", { class: "lesson-measures" }, MEASURES.slice(0, 3).map(m => {
          const b = bandOf(m, p[m.key]);
          return h("div", { class: "lesson-measure" }, h("span", null, m.name), h("span", { class: "chip " + BAND_CLS[b] }, BAND[b]));
        })), h("p", { class: "small muted" }, "Compare it with what you hear. Self-scores are often too generous on pitch and too harsh on tone."));
      } catch (e) { /* the recording could not be read: listening is enough */ }
    }
    const skip = h("button", { type: "button", class: "linkbtn" }, s.skip || "Skip for now");
    skip.addEventListener("click", () => { api.data[s.id] = { skipped: true }; api.save(); msg.textContent = "Skipped. You can record it later in the Journal."; skip.hidden = true; api.ready(); });
    if (!recordingSupported()) { btn.disabled = true; msg.textContent = "Recording is not supported in this browser."; }
    btn.addEventListener("click", async () => {
      if (rec) return;
      try { rec = await startRecording({}); } catch (e) { msg.textContent = "The microphone is not available here."; return; }
      btn.disabled = true; let left = s.seconds;
      msg.textContent = "Recording... " + left;
      timer = setInterval(async () => {
        left--; if (left > 0) { msg.textContent = "Recording... " + left; return; }
        clearInterval(timer);
        const r = rec; rec = null;
        const { blob, mime, durationS } = await r.stop();
        try { await saveRecording({ id: newId(), created: new Date().toISOString(), date: today(), day: s.day ?? null, label: s.label, mime, blob, durationS, kind: "audio" }); }
        catch (e) { /* storage full or private window: the lesson still goes on */ }
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(blob); player.src = url; player.hidden = false;
        msg.textContent = s.saved || "Saved in your Journal.";
        btn.disabled = false; btn.replaceChildren(icon("mic"), " Record again");
        api.data[s.id] = { saved: true }; api.save(); skip.hidden = true; ding(true); api.ready();
        if (s.analyse) analyse(blob);
      }, 1000);
    });
    return { el: h("div", { class: "stack lesson-center" }, btn, msg, player, heard, skip), destroy() { clearInterval(timer); if (rec) rec.cancel && rec.cancel(); if (url) URL.revokeObjectURL(url); } };
  } },
};
