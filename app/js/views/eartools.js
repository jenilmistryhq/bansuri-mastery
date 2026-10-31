// Check by ear (part of #/transcribe): a zoomable pitch line of the recording with the notes found,
// where a note is picked (click, or the arrow keys), heard in the original at 50, 75 or 100% speed
// without changing its pitch, looped with its phrase, compared with the notes played back, and
// corrected (a semitone or an octave up or down, shorter, longer, split, joined with the next, set to
// the pitch heard, a slide in or not, added or deleted). Notes outside the song's scale are
// outlined ("odd": the likeliest mistakes) and can be visited one by one. The page owns the notes; this module draws them, plays them
// and reports each edit through o.onEdit(op, id, arg) (for "add" the page returns the new id).
import { h, icon } from "../util.js";
import { ac, makeVoice } from "../core/audio.js";
import { codeOf } from "../core/theory.js";

const fmt = s => Math.floor(s / 60) + ":" + (s % 60).toFixed(1).padStart(4, "0");
const freqOf = n => 440 * Math.pow(2, (n.midi + (n.off || 0) - 69) / 12);

export function earTools(o) {
  let st = { notes: [], frames: [], tune: 0, zero: 0, url: null, duration: 0, edited: false };
  let sel = null, viewT0 = 0, span = 8, speed = 0.75, loop = false;
  let raf = 0, stopNotes = null, playhead = null;
  const player = new Audio();
  player.preservesPitch = true; player.mozPreservesPitch = true; player.webkitPreservesPitch = true;

  // ---- Controls ----
  const speedBtns = [0.5, 0.75, 1].map(v => h("button", { type: "button", class: "seg-btn", "aria-pressed": String(v === speed), onclick: () => { speed = v; speedBtns.forEach((b, i) => b.setAttribute("aria-pressed", String([0.5, 0.75, 1][i] === speed))); player.playbackRate = speed; } }, Math.round(v * 100) + "%"));
  const loopBox = h("input", { type: "checkbox", id: "ear-loop" });
  loopBox.addEventListener("change", () => { loop = loopBox.checked; });
  // Zoom by a factor, keeping the time `at` (by default the middle) in the same place.
  const zoom = (d, at) => {
    const t = at === undefined ? viewT0 + span / 2 : at, k = (t - viewT0) / span;
    span = Math.max(3, Math.min(60, span * d)); viewT0 = Math.max(0, Math.min(Math.max(0, st.duration - span), t - k * span));
    pos.max = String(Math.max(0, st.duration - span)); pos.value = String(viewT0); draw();
  };
  const canvas = h("canvas", { class: "earplot", tabindex: "0", "aria-label": "Pitch line and notes: click a note, or use the arrow keys" });
  const pos = h("input", { type: "range", class: "earpos", min: "0", max: "0", step: "0.1", value: "0", "aria-label": "Position in the recording" });
  pos.addEventListener("input", () => { viewT0 = Number(pos.value); draw(); });
  const info = h("p", { class: "small earinfo", "aria-live": "polite" });
  const btn = (label, title, fn, cls) => h("button", { type: "button", class: "btn small" + (cls ? " " + cls : ""), title, "aria-label": title, onclick: fn }, label);
  const undoBtn = btn("Undo", "Undo the last change (Ctrl+Z)", () => o.onEdit("undo"));
  const resetBtn = btn("Back to the app's notes", "Undo every change", () => o.onEdit("reset"), "ghost");
  const editRow = h("div", { class: "row tight earedit" },
    btn("Higher", "A semitone higher (Up arrow)", () => edit("up")), btn("Lower", "A semitone lower (Down arrow)", () => edit("down")),
    btn("Octave up", "An octave higher (Shift+Up)", () => edit("octUp")), btn("Octave down", "An octave lower (Shift+Down)", () => edit("octDown")),
    btn("Shorter", "Shorter by a tenth of a second (,)", () => edit("shorter")), btn("Longer", "Longer by a tenth of a second (.)", () => edit("longer")),
    btn("Split", "Split into two notes (S)", () => edit("split")), btn("Join next", "Join with the next note (J)", () => edit("join")),
    btn("Pitch heard", "Set the note to the pitch heard under it (H)", () => edit("heard", heardMidi())),
    btn("Slide in", "Reach this note by a slide (meend), or not (G)", () => edit("glide")),
    btn("Add after", "Add a note after this one (A); or double-click an empty place", () => addAfter()),
    btn("Delete", "Delete this note (Delete)", () => edit("delete"), "ghost"));
  const playRow = h("div", { class: "row tight" },
    btn(h("span", null, icon("play"), " Here"), "Hear the original around this note (Space)", () => playAround()),
    btn(h("span", null, icon("play"), " Phrase"), "Hear the original phrase (P)", () => { const [a, b] = phrase(); playOriginal(a, b); }),
    btn(h("span", null, icon("play"), " Phrase, then notes"), "The original phrase, then the notes as written (N)", () => { const [a, b] = phrase(); playOriginal(a, b, () => playNotes(a, b)); }),
    btn(h("span", null, icon("note"), " This note"), "Hear only this note as written", () => { const n = current(); if (n) playNotes(n.t0, n.t1); }),
    btn(h("span", null, icon("stop")), "Stop", () => stop(), "ghost"),
    btn("Next odd note", "The next note outside the song's scale (O)", () => nextOdd(), "ghost"));
  const el = h("section", { class: "card" }, h("h2", null, "3. Check by ear"),
    h("p", { class: "small muted" }, "Click a note (or use the arrow keys), hear the original there, slowed down without changing its pitch, and correct the note until it matches. The notation follows every change."),
    h("div", { class: "row eartop" },
      h("div", { class: "field" }, h("span", null, "Speed"), h("div", { class: "seg", role: "group", "aria-label": "Speed" }, speedBtns)),
      h("label", { class: "check", for: "ear-loop" }, loopBox, "Loop"),
      h("div", { class: "row tight" }, btn("-", "Show more of the song (zoom out)", () => zoom(1.5)), btn("+", "Show less, larger (zoom in)", () => zoom(1 / 1.5))),
      h("div", { class: "row tight earundo" }, undoBtn, resetBtn)),
    h("div", { class: "earwrap" }, canvas), pos, info, playRow, editRow,
    h("details", { class: "small" }, h("summary", null, "Keys"),
      h("p", null, "Left and Right: the previous or next note. Up and Down: a semitone higher or lower (with Shift: an octave). Comma and full stop: shorter or longer. S: split. J: join with the next. H: the pitch heard. G: slide in or not. A: add a note after. O: the next odd note. Delete: remove the note. Space: the original here. P: the phrase. N: the phrase, then the notes. Ctrl+Z: undo. Double-click an empty place to add a note there; drag to move along the song; pinch (or Ctrl and the mouse wheel) to zoom.")));

  // ---- Selection and edits ----
  const current = () => st.notes.find(n => n.id === sel) || null;
  const indexOf = () => st.notes.findIndex(n => n.id === sel);
  function select(id, show) {
    sel = id;
    const n = current();
    if (n && show !== false && (n.t0 < viewT0 || n.t1 > viewT0 + span)) { viewT0 = Math.max(0, Math.min(st.duration - span, n.t0 - span / 3)); pos.value = String(viewT0); }
    describe(); draw();
  }
  function describe() {
    const n = current(), i = indexOf();
    info.textContent = n ? "Note " + (i + 1) + " of " + st.notes.length + ": " + (n.glide ? "slide into " : "") + codeOf(n.semi) + " at " + fmt(n.t0) + ", " + (n.t1 - n.t0).toFixed(2) + " s" + (n.edited ? " (changed)" : "") + (n.odd ? ". Outside the song's scale: often a wrong note, so listen closely." : "") : "Click a note to hear it and correct it.";
    [...editRow.children, ...playRow.children].forEach(b => { b.disabled = !n && !/Stop|odd/.test(b.title); });
  }
  function edit(op, arg) {
    const i = indexOf();
    if (i < 0 || (op === "heard" && arg === null)) return;
    // After a delete or a join the next note (or the joined one) stays selected.
    const id = sel;
    sel = op === "delete" ? (st.notes[i + 1] || st.notes[i - 1] || {}).id : sel;
    o.onEdit(op, id, arg);
  }
  // The pitch heard under the selected note (the median of the pitch line), as a MIDI note in the
  // recording's tuning; null when nothing was heard there.
  function heardMidi() {
    const n = current(); if (!n) return null;
    const vals = [];
    for (let i = Math.ceil(n.t0 / 0.02); i < n.t1 / 0.02; i++) { const m = st.frames[i]; if (m !== null && m !== undefined) vals.push(m); }
    if (!vals.length) return null;
    vals.sort((a, b) => a - b);
    return Math.round(vals[vals.length >> 1] - st.tune);
  }
  // A new note: after the selected one (same pitch, until the next note or 0.4 s), or at a time and
  // pitch (double-click). The page answers with the new note's id, which is then selected.
  function add(t0, t1, midi) {
    const id = o.onEdit("add", null, { t0, t1, midi });
    if (id) select(id, false);
  }
  function addAfter() {
    const n = current(); if (!n) return;
    const next = st.notes[indexOf() + 1], t0 = n.t1 + 0.01, t1 = Math.min(next ? next.t0 - 0.01 : Infinity, t0 + 0.4);
    if (t1 - t0 < 0.06) return;
    add(t0, t1, n.midi);
  }

  // The next note outside the scale after the selected one (from the start again at the end).
  function nextOdd() {
    const odd = st.notes.filter(n => n.odd);
    if (!odd.length) { info.textContent = "No odd notes: every note is in the song's scale."; return; }
    const cur = current(), next = odd.find(n => !cur || n.t0 > cur.t0) || odd[0];
    select(next.id); canvas.focus({ preventScroll: true });
  }

  // ---- Playing ----
  function stop() {
    player.pause(); cancelAnimationFrame(raf); playhead = null;
    if (stopNotes) { stopNotes(); stopNotes = null; }
    draw();
  }
  function playOriginal(a, b, then) {
    if (!st.url) return;
    stop();
    if (player.src !== st.url) player.src = st.url;
    player.playbackRate = speed;
    player.currentTime = Math.max(0, a);
    player.play().catch(() => {});
    const tick = () => {
      playhead = player.currentTime;
      if (playhead >= b || player.ended) {
        if (loop && !then) { player.currentTime = a; }
        else { player.pause(); playhead = null; draw(); if (then) then(); return; }
      }
      if (playhead < viewT0 || playhead > viewT0 + span) { viewT0 = Math.max(0, playhead - span / 4); pos.value = String(viewT0); }
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  // The notes as written, at the recording's pitch and the chosen speed (made a little ahead of time).
  function playNotes(a, b) {
    const list = st.notes.filter(n => n.t1 > a && n.t0 < b), c = ac(), at = c.currentTime + 0.08;
    let i = 0, voices = [];
    const timer = setInterval(pump, 200);
    function pump() {
      for (; i < list.length && at + (list[i].t0 - a) / speed < c.currentTime + 1.2; i++) {
        const n = list[i], v = makeVoice(freqOf(n), at + Math.max(0, n.t0 - a) / speed, { level: 0.22 });
        v.stop(at + Math.max(0.08, (n.t1 - a) / speed)); voices.push(v);
      }
      playhead = a + (c.currentTime - at) * speed;
      if (playhead > b + 0.3) { clearInterval(timer); playhead = null; stopNotes = null; }
      draw();
    }
    pump();
    stopNotes = () => { clearInterval(timer); voices.forEach(v => v.stop()); };
  }
  const playAround = () => { const n = current(); if (n) playOriginal(Math.max(0, n.t0 - 0.6), n.t1 + 0.6); };
  // The phrase around the selected note: notes until a pause of 0.6 s on each side (at most 12 s).
  function phrase() {
    const i = indexOf(), ns = st.notes;
    if (i < 0) return [viewT0, viewT0 + span];
    let a = i, b = i;
    while (a > 0 && ns[a].t0 - ns[a - 1].t1 < 0.6 && ns[i].t0 - ns[a - 1].t0 < 8) a--;
    while (b < ns.length - 1 && ns[b + 1].t0 - ns[b].t1 < 0.6 && ns[b + 1].t1 - ns[a].t0 < 12) b++;
    return [Math.max(0, ns[a].t0 - 0.3), ns[b].t1 + 0.3];
  }

  // ---- Drawing ----
  function draw() {
    const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth || 600, H = canvas.clientHeight || 260;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const g = canvas.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const css = getComputedStyle(canvas), col = (k, d) => (css.getPropertyValue(k) || "").trim() || d;
    const C = { ink: col("--ink", "#1b2420"), line: col("--line", "#cfd6ca"), muted: col("--muted", "#56645d"), accent: col("--accent", "#0d6a6e"), warn: col("--warn", "#9a6512"), bad: col("--bad", "#b3261e"), mono: col("--mono", "monospace"), bg: col("--surface", "#fff") };
    if (!st.notes.length) return;
    // The rows cover the notes in view (at least an octave), so zooming in gives larger rows.
    let lo = Infinity, hi = -Infinity;
    for (const n of st.notes) if (n.t1 >= viewT0 && n.t0 <= viewT0 + span) { lo = Math.min(lo, n.semi); hi = Math.max(hi, n.semi); }
    if (lo === Infinity) for (const n of st.notes) { lo = Math.min(lo, n.semi); hi = Math.max(hi, n.semi); }
    lo -= 2; hi += 2; if (hi - lo < 12) { const m = (hi + lo) / 2; lo = Math.floor(m - 6); hi = Math.ceil(m + 6); }
    const padL = 40, padT = 6, padB = 18, x = t => padL + (t - viewT0) / span * (W - padL - 6), y = s => padT + (hi - s) / (hi - lo) * (H - padT - padB), row = (H - padT - padB) / (hi - lo);
    g.font = "11px " + C.mono; g.textBaseline = "middle";
    for (let s = Math.ceil(lo); s <= hi; s++) {
      const natural = [0, 2, 4, 5, 7, 9, 11].includes(((s % 12) + 12) % 12);
      g.strokeStyle = C.line; g.globalAlpha = natural ? 0.9 : 0.35; g.beginPath(); g.moveTo(padL, y(s)); g.lineTo(W, y(s)); g.stroke(); g.globalAlpha = 1;
      if (natural || row > 14) { g.fillStyle = ((s % 12) + 12) % 12 === 0 ? C.accent : C.muted; g.fillText(codeOf(s), 4, y(s)); }
    }
    // Seconds along the bottom.
    g.fillStyle = C.muted; g.textAlign = "center";
    const stepS = span > 20 ? 5 : span > 8 ? 2 : 1;
    for (let t = Math.ceil(viewT0 / stepS) * stepS; t <= viewT0 + span; t += stepS) g.fillText(fmt(t).replace(/\.\d$/, ""), x(t), H - 7);
    g.textAlign = "left";
    // The pitch heard (dots), then the notes (bars).
    g.fillStyle = C.muted;
    const f0 = Math.max(0, Math.floor(viewT0 / 0.02)), f1 = Math.min(st.frames.length, Math.ceil((viewT0 + span) / 0.02));
    for (let i = f0; i < f1; i++) { const m = st.frames[i]; if (m === null || m === undefined) continue; const s = m - st.tune - st.zero; if (s >= lo && s <= hi) g.fillRect(x(i * 0.02), y(s) - 1, 2, 2); }
    st.notes.forEach((n, k) => {
      if (n.t1 < viewT0 || n.t0 > viewT0 + span) return;
      const x0 = x(n.t0), x1 = Math.max(x0 + 3, x(n.t1)), yy = y(n.semi), hh = Math.max(6, row * 0.7), prev = st.notes[k - 1];
      // A slide: a dotted line from the note before.
      if (n.glide && prev) { g.strokeStyle = C.accent; g.lineWidth = 2; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x(prev.t1), y(prev.semi)); g.lineTo(x0, yy); g.stroke(); g.setLineDash([]); g.lineWidth = 1; }
      g.fillStyle = n.edited ? C.warn : C.accent; g.globalAlpha = n.id === sel ? 1 : 0.75;
      g.beginPath(); if (g.roundRect) g.roundRect(x0, yy - hh / 2, x1 - x0, hh, 3); else g.rect(x0, yy - hh / 2, x1 - x0, hh); g.fill(); g.globalAlpha = 1;
      // An odd note (outside the scale): a dashed outline in the warning colour.
      if (n.odd) { g.strokeStyle = C.bad; g.lineWidth = 2; g.setLineDash([4, 2]); g.strokeRect(x0 - 1, yy - hh / 2 - 1, x1 - x0 + 2, hh + 2); g.setLineDash([]); g.lineWidth = 1; }
      if (n.id === sel) { g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(x0 - 2, yy - hh / 2 - 2, x1 - x0 + 4, hh + 4); g.lineWidth = 1; }
      if (x1 - x0 > 22 && hh >= 10) { g.fillStyle = C.bg; g.fillText(codeOf(n.semi), x0 + 3, yy); }
    });
    if (playhead !== null) { g.strokeStyle = C.bad; g.lineWidth = 2; g.beginPath(); g.moveTo(x(playhead), padT); g.lineTo(x(playhead), H - padB); g.stroke(); g.lineWidth = 1; }
    canvas._map = { x, y, padL, W, row, lo, H, padB };
  }

  // ---- Pointer and keys ----
  // A drag moves along the song (on a phone too); a tap or click picks the nearest note; two
  // fingers pinch to zoom; Ctrl (or Cmd) with the mouse wheel zooms too.
  let drag = null, pinch = null;
  const touches = new Map();
  const timeAt = clientX => { const m = canvas._map, r = canvas.getBoundingClientRect(); return m ? viewT0 + (clientX - r.left - m.padL) / (m.W - m.padL - 6) * span : viewT0; };
  canvas.addEventListener("pointerdown", e => {
    touches.set(e.pointerId, e.clientX);
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      pinch = { dist: Math.max(20, Math.abs(a - b)), span, at: timeAt((a + b) / 2) }; drag = null;
    } else if (touches.size === 1) drag = { x: e.clientX, t: viewT0, moved: false };
  });
  canvas.addEventListener("pointermove", e => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, e.clientX);
    if (pinch && touches.size === 2) {
      const [a, b] = [...touches.values()], want = pinch.span * pinch.dist / Math.max(20, Math.abs(a - b));
      zoom(want / span, pinch.at);
      return;
    }
    const m = canvas._map; if (!drag || !m || !(e.buttons & 1 || e.pointerType === "touch")) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 6) drag.moved = true;
    if (drag.moved) { viewT0 = Math.max(0, Math.min(Math.max(0, st.duration - span), drag.t - dx / (m.W - m.padL - 6) * span)); pos.value = String(viewT0); draw(); }
  });
  const lift = e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; };
  canvas.addEventListener("pointerup", e => { const d = drag, wasPinch = !!pinch || touches.size > 1; lift(e); drag = null; if (d && !d.moved && !wasPinch) pick(e); });
  canvas.addEventListener("pointercancel", e => { lift(e); drag = null; });
  canvas.addEventListener("wheel", e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, timeAt(e.clientX)); }, { passive: false });
  canvas.addEventListener("dblclick", e => {
    const m = canvas._map; if (!m) return;
    const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    const t = viewT0 + (px - m.padL) / (m.W - m.padL - 6) * span;
    if (st.notes.some(n => t >= n.t0 && t <= n.t1)) return;
    const semi = Math.round(m.lo + (m.H - m.padB - py) / m.row), prev = st.notes.filter(n => n.t1 <= t).pop(), next = st.notes.find(n => n.t0 >= t);
    const t0 = Math.max(prev ? prev.t1 + 0.01 : 0, t - 0.2), t1 = Math.min(next ? next.t0 - 0.01 : Infinity, t + 0.2);
    if (t1 - t0 >= 0.06) add(t0, t1, semi + st.zero);
  });
  function pick(e) {
    const m = canvas._map; if (!m) return;
    const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    const t = viewT0 + (px - m.padL) / (m.W - m.padL - 6) * span;
    let best = null, bd = Infinity;
    for (const n of st.notes) {
      const dt = t < n.t0 ? n.t0 - t : t > n.t1 ? t - n.t1 : 0, dy = Math.abs(m.y(n.semi) - py) / Math.max(8, m.row);
      const d = dt * 4 + dy;
      if (d < bd) { bd = d; best = n; }
    }
    if (best && bd < 3) { select(best.id, false); canvas.focus(); }
  }
  canvas.addEventListener("keydown", e => {
    const i = indexOf(), ns = st.notes;
    const go = j => { if (ns[j]) { e.preventDefault(); select(ns[j].id); } };
    if (e.key === "ArrowRight") go(i < 0 ? ns.findIndex(n => n.t0 >= viewT0) : i + 1);
    else if (e.key === "ArrowLeft") go(i < 0 ? 0 : i - 1);
    else if (e.key === "ArrowUp") { e.preventDefault(); edit(e.shiftKey ? "octUp" : "up"); }
    else if (e.key === "ArrowDown") { e.preventDefault(); edit(e.shiftKey ? "octDown" : "down"); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); edit("delete"); }
    else if (e.key === "j" || e.key === "J") edit("join");
    else if (e.key === ",") edit("shorter");
    else if (e.key === ".") edit("longer");
    else if (e.key === "s" || e.key === "S") edit("split");
    else if (e.key === "h" || e.key === "H") edit("heard", heardMidi());
    else if (e.key === "a" || e.key === "A") addAfter();
    else if (e.key === "g" || e.key === "G") edit("glide");
    else if (e.key === "o" || e.key === "O") nextOdd();
    else if (e.key === " ") { e.preventDefault(); if (player.paused && !stopNotes) playAround(); else stop(); }
    else if (e.key === "p" || e.key === "P") { const [a, b] = phrase(); playOriginal(a, b); }
    else if (e.key === "n" || e.key === "N") { const [a, b] = phrase(); playOriginal(a, b, () => playNotes(a, b)); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); o.onEdit("undo"); }
  });
  const onResize = () => draw();
  window.addEventListener("resize", onResize);

  return {
    el,
    // state: { notes (with id and semi), frames (MIDI pitch per 20 ms), tune (semitones), zero (the
    // flute's Sa as MIDI, after the octave shift), url (the recording, for slowed playback),
    // duration, edited (true once the learner has changed anything), canUndo }
    show(state) {
      st = state;
      if (!st.notes.some(n => n.id === sel)) sel = null;
      pos.max = String(Math.max(0, st.duration - span));
      undoBtn.disabled = !st.canUndo; resetBtn.hidden = !st.edited;
      describe(); requestAnimationFrame(draw);
    },
    stop,
    nextOdd,
    // Shows the song from about time t (a line of the notation was picked).
    seek(t) { viewT0 = Math.max(0, Math.min(Math.max(0, st.duration - span), t - span / 8)); pos.value = String(viewT0); draw(); },
    destroy() { stop(); window.removeEventListener("resize", onResize); player.removeAttribute("src"); },
  };
}
