// Guided session (#/session/<n>): the day's blocks with timers, tools, recordings and a closing log.
import { h, icon, fmtClock, toast } from "../util.js";
import { backHead } from "../backhead.js";
import { getState, update } from "../state.js";

// Ear-quiz answers from any embedded bench count toward the ear badges.
export function recordEar(res) {
  if (!res || !res.level) return;
  update(s => { const e = s.ear[res.level] || { right: 0, total: 0 }; e.total++; if (res.correct) e.right++; s.ear[res.level] = e; });
}
import { getDay, current, dayState, saveBlocks, finishSession, milestoneState } from "../course.js";
import { mountBench } from "../bench/bench.js";
import { recordWidget } from "../recorder.js";
import { ac, click } from "../core/audio.js";
import { holdMeter, fluteFinder } from "../core/live.js";
import { bestHold } from "../livestats.js";
import { sessionQuestPoints } from "../fun.js";
import { parseNotation } from "../core/notation.js";
import { renderInline } from "../content.js";
import { makePlayable } from "../playable.js";
import { speak, stopSpeaking } from "../voice.js";
import { stepMeta, plainText } from "../steps.js";
import { flutePlayer } from "../demo.js";
import { plainCodes } from "../codes.js";
import { waitForNote } from "../core/listen.js";
import { getSettings, setSettings } from "../core/settings.js";

// A long-tone step gets a live meter. Its target notes and hold time are read from the step text:
// "Long tones on `.P .D .N S R G`, 8-10 s each" -> hold each of those notes 8 s.
export function holdSpec(b) {
  const text = b.text || "";
  if (b.id === "READ" || b.id === "R" || !/long tones?|first sound|\bhold (each|the|a|it)\b/i.test(text)) return null;
  const notes = [];
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    const p = parseNotation(m[1]);
    if (p.skipped.length) continue;
    for (const tk of p.tokens) if (tk.type === "beat") for (const it of tk.items) if (it.semi !== undefined && !notes.includes(it.semi)) notes.push(it.semi);
  }
  if (!notes.length) {
    // Notes written without backticks: a run of two or more sargam letters separated by spaces.
    const run = text.match(/(?:^|\s)((?:\.?[SrRgGmMPdDnN]'?\s+)+\.?[SrRgGmMPdDnN]'?)(?=[\s,.;]|$)/);
    if (run) for (const tk of parseNotation(run[1]).tokens) if (tk.type === "beat") for (const it of tk.items) if (it.semi !== undefined && !notes.includes(it.semi)) notes.push(it.semi);
  }
  if (!notes.length && /\bSa\b/.test(text)) notes.push(0);
  const sec = text.match(/(\d+)(?:\s*-\s*\d+)?\s*s\b/);
  const seconds = sec ? Math.min(30, Math.max(3, Number(sec[1]))) : (/first sound/i.test(text) ? 3 : 8);
  return { targets: notes.length ? notes : null, seconds, cents: 30 };
}

function chime() {
  if (!getState().prefs.chimes) return;
  try { const c = ac(); if (c.state !== "running") c.resume().catch(() => {}); const t = c.currentTime + 0.02; click(t, "tali"); click(t + 0.25, "sam"); } catch (e) { /* audio unavailable */ }
}

export async function render(main, { params }) {
  const n = Number(params[0]);
  const cur = current();
  const day = getDay(n);
  const page = h("div", { class: "page" });
  main.append(page);
  if (!day) { page.append(h("p", null, "That day does not exist.")); return; }
  if (n > cur) {
    page.append(h("div", { class: "card" }, h("h2", null, "Day " + n + " is not unlocked yet"), h("p", null, "Practise in order: each day builds on the last."), h("a", { class: "btn primary", href: "#/today" }, "Go to today (Day " + cur + ")")));
    return;
  }

  const saved = (dayState(n) || {}).blocks || {};
  const doneMap = Object.assign({}, n < cur ? {} : saved);
  const timers = {};
  let activeId = null, tick = 0, bench = null, benchBlock = null;
  const widgets = [];

  const progress = h("i", { style: { width: "0%" } });
  const progressEl = h("div", { class: "progressbar", role: "progressbar", "aria-label": "Blocks done", "aria-valuemin": "0", "aria-valuemax": String(day.blocks.length), "aria-valuenow": "0" }, progress);
  const totalClock = h("span", { class: "mono" }, "0:00"), blocksEl = h("span", { class: "small muted" });
  const planned = day.blocks.reduce((a, b) => a + (b.minutes || 0), 0);
  const finishBtn = h("button", { type: "button", class: "btn ghost" }, "End the session here");
  // One step at a time (default) or the whole list; the choice is remembered.
  let focus = (getState().prefs.sessionView || "focus") === "focus";
  const stepStrip = h("div", { class: "stepstrip", role: "list", "aria-label": "Steps" });
  // Two ways to see the same day (W21): one card at a time, or the whole page.
  const viewCards = h("button", { type: "button", class: "segbtn", "data-view": "focus" }, "Cards");
  const viewPage = h("button", { type: "button", class: "segbtn", "data-view": "list" }, "Whole page");
  const viewSeg = h("div", { class: "segtoggle", role: "group", "aria-label": "How to see the day" }, viewCards, viewPage);
  const meters = {};
  // Hands-free: the app says each step, starts its timer or meter, and moves on when the learner
  // plays Sa (after the time is up or the goal is met). No reading or tapping needed.
  let handsFree = !!getState().prefs.handsFree || getSettings().simple, waiter = null, hfGen = 0;
  const hfBtn = h("button", { type: "button", class: "btn small", "aria-pressed": "false" }, icon("speaker"), "Talk me through it");
  const cancelWait = () => { if (waiter) { waiter.cancel(); waiter = null; } };
  function hfAwaitSa(id, refs) {
    if (!handsFree) return;
    const g = hfGen;
    cancelWait();
    speak(...refs, "play_sa_continue").then(() => {
      if (!handsFree || g !== hfGen || activeId !== id) return;
      waiter = waitForNote(0, 1.2);
      waiter.promise.then(ok => {
        waiter = null;
        if (!ok || !handsFree || g !== hfGen || activeId !== id) return;
        const nb = cards[id] && cards[id].querySelector(".stepnav .btn.primary");
        if (nb) nb.click();
      });
    });
  }
  function hfEnter(id) {
    if (!handsFree) return;
    const g = ++hfGen;
    cancelWait();
    const b = day.blocks.find(x => x.id === id), i = day.blocks.indexOf(b);
    const lead = i === 0 ? "session_start" : i === day.blocks.length - 1 ? "last_step" : "next_step";
    const extra = b.id === "READ" ? ["read_lesson"] : b.id === "R" ? ["log_practice"] : [];
    speak(lead, ["step", b.text || ""], ...extra).then(() => {
      if (g !== hfGen || !handsFree || activeId !== id) return;
      if (meters[id] && holdSpec(b)) meters[id].start();
      if (timers[id] && timers[id].total && !timers[id].running && !doneMap[id]) startTimer(id);
      else if (!timers[id] || !timers[id].total) hfAwaitSa(id, []);
    });
  }
  function applyHandsFree() {
    hfBtn.classList.toggle("primary", handsFree);
    hfBtn.setAttribute("aria-pressed", String(handsFree));
    if (!handsFree) { hfGen++; cancelWait(); stopSpeaking(); }
  }
  hfBtn.addEventListener("click", () => {
    handsFree = !handsFree;
    update(st => { st.prefs.handsFree = handsFree; });
    if (handsFree) { setSettings({ talk: true }); if (!focus) setView(true); try { ac(); } catch (e) { /* audio unlocks on this tap */ } }
    applyHandsFree();
    if (handsFree && activeId) hfEnter(activeId);
  });

  function refreshHead() {
    const done = day.blocks.filter(b => doneMap[b.id]).length;
    progress.style.width = (day.blocks.length ? (done / day.blocks.length) * 100 : 0) + "%";
    totalClock.textContent = fmtClock(totalElapsed()) + " / " + planned + " min"; blocksEl.textContent = Math.round(done / day.blocks.length * 100) + "% done - " + done + " of " + day.blocks.length + " steps";
    progressEl.setAttribute("aria-valuenow", String(done));
    // Finishing is the main action only once the blocks are done; before that it stays available but quiet.
    finishBtn.classList.toggle("primary", done === day.blocks.length);
    finishBtn.textContent = done === day.blocks.length ? "Finish Day " + n : "End the session here";
    stepStrip.querySelectorAll("button").forEach(btn => { btn.classList.toggle("done", !!doneMap[btn.dataset.id]); btn.classList.toggle("now", btn.dataset.id === activeId); });
  }

  // Back to the day's cover (W21): the step list is the same day, seen another way.
  page.append(backHead("#/day/" + n, "Day " + n, "Step list"));
  page.append(h("div", { class: "session-head" },
    h("div", { class: "row between" },
      h("div", { class: "stack", style: { gap: "0" } }, h("span", { class: "eyebrow" }, "Day " + n + (n < cur ? " - practising again" : "")), h("h2", null, day.title || "Session")),
      h("div", { class: "stack sessclock", style: { gap: "0" } }, totalClock, blocksEl)),
    stepStrip, progressEl, h("div", { class: "row between" }, viewSeg, hfBtn)));

  if (day.milestone) {
    const ms = milestoneState(day.milestone);
    page.append(h("div", { class: "notice info" }, "This day has milestone " + day.milestone + ". Do these blocks, then ", h("a", { href: "#/milestone/" + day.milestone }, "take the " + day.milestone + " test"), ms.status === "passed" ? " (already passed)." : "."));
  }

  const cards = {};
  function setActive(id) {
    const changed = activeId !== id;
    activeId = id;
    for (const [bid, c] of Object.entries(cards)) { c.classList.toggle("active", bid === id); const ob = c.querySelector(".blockopen"); if (ob) ob.setAttribute("aria-expanded", String(bid === id)); }
    if (focus && changed) { enterStep(id); hfEnter(id); }
    refreshHead();
  }
  // Entering a step in focus mode opens what it needs: its tool, and the live meter for long tones.
  function enterStep(id) {
    for (const [bid, m] of Object.entries(meters)) if (bid !== id) m.stop();
    const b = day.blocks.find(x => x.id === id), card = cards[id];
    if (!b || !card) return;
    // The previous step's tool (metronome, tanpura, tuner) must not keep running out of sight.
    if (benchBlock && benchBlock !== id) closeBench();
    if (b.bench && benchBlock !== id) { const tb = card.querySelector(".toolbtn"); if (tb && !holdSpec(b)) tb.click(); }
    const spec = holdSpec(b);
    if (spec && !meters[id]) {
      meters[id] = holdMeter(Object.assign({}, spec, { onPass: () => goalMet(id), ghost: bestHold }));
      const host = card.querySelector(".meterhost"); if (host) host.append(meters[id].el);
    }
    // Day 0 opens with sound: a real bansuri, then the fingers playing S R G R S on the flute picture.
    if (n === 0 && b.id === "M" && !meters[id]) {
      const demo = flutePlayer({ notation: "S R G R S -", bpm: 60, title: "Watch the fingers" });
      meters[id] = { stop() { demo.destroy(); }, destroy() { demo.destroy(); } };
      const host = card.querySelector(".meterhost");
      if (host) host.append(h("div", { class: "stack" }, h("b", null, "A real bansuri"), h("audio", { controls: true, preload: "none", src: "app/audio/bansuri-sargam-sa-to-taar-sa-roguentropy.mp3" })), demo.el);
    }
    // Day 0: the tools step finds the flute's Sa from the learner's own playing.
    if (n === 0 && b.id === "K" && !meters[id]) {
      meters[id] = fluteFinder({ onApply: () => goalMet(id) });
      const host = card.querySelector(".meterhost"); if (host) host.append(h("h3", null, "Find your flute's Sa"), meters[id].el);
    }
  }
  // A listening goal met ticks the step (without jumping away: the learner may keep practising).
  function goalMet(id) {
    const card = cards[id]; if (!card) return;
    const cb = card.querySelector("label.check input[type=checkbox]");
    if (cb && !cb.checked) {
      cb.checked = true; doneMap[id] = true; card.classList.add("done");
      if (n === cur) saveBlocks(n, doneMap);
      refreshHead();
    }
    const nb = card.querySelector(".stepnav .btn.primary"); if (nb) nb.classList.add("pulse");
    toast("Goal reached: step done. Keep going, or move on.");
    if (handsFree) setTimeout(() => hfAwaitSa(id, ["goal_reached"]), 1800);
  }
  function applyView() {
    page.classList.toggle("session-focus", focus);
    viewCards.setAttribute("aria-pressed", String(focus)); viewPage.setAttribute("aria-pressed", String(!focus));
    if (focus && activeId) { const id = activeId; activeId = null; setActive(id); }
  }
  function setView(f) {
    if (focus === f) return;
    focus = f;
    update(st => { st.prefs.sessionView = focus ? "focus" : "list"; });
    applyView();
  }
  viewCards.addEventListener("click", () => setView(true));
  viewPage.addEventListener("click", () => setView(false));
  // Timers measure wall-clock time, so they stay right when the phone sleeps or the tab is in the background.
  function elapsedOf(id) { const t = timers[id]; return t.acc + (t.running ? (Date.now() - t.since) / 1000 : 0); }
  function totalElapsed() { return Object.keys(timers).reduce((a, id) => a + elapsedOf(id), 0); }
  let wake = null, disposed = false;
  async function keepAwake(on) {
    try {
      if (on && !wake && navigator.wakeLock) {
        const lock = await navigator.wakeLock.request("screen");
        // The learner may have paused or left while the request was pending.
        if (disposed || !anyRunning()) { await lock.release(); return; }
        wake = lock;
        wake.addEventListener("release", () => { if (wake === lock) wake = null; });
      } else if (!on && wake) { const w = wake; wake = null; await w.release(); }
    } catch (e) { /* wake lock is optional */ }
  }
  const anyRunning = () => Object.values(timers).some(t => t.running);
  const onVisible = () => { if (document.visibilityState === "visible" && anyRunning()) keepAwake(true); };
  document.addEventListener("visibilitychange", onVisible);
  function stopTimer(id) {
    const t = timers[id];
    if (t && t.running) { t.acc = elapsedOf(id); t.running = false; t.btn.replaceChildren(icon("play"), "Start"); }
    if (!anyRunning()) keepAwake(false);
  }
  function startTimer(id) {
    for (const k of Object.keys(timers)) if (k !== id) stopTimer(k);
    try { ac(); } catch (e) { /* unlock audio during the tap so the chime can play later (iOS) */ }
    const t = timers[id];
    t.since = Date.now(); t.running = true; t.btn.replaceChildren(icon("pause"), "Pause");
    setActive(id);
    keepAwake(true);
  }

  tick = setInterval(() => {
    for (const [id, t] of Object.entries(timers)) {
      if (!t.running) continue;
      const left = Math.round(t.total - elapsedOf(id));
      t.clock.textContent = fmtClock(left);
      t.clock.classList.toggle("over", left < 0);
      if (!t.chimed && left <= 0) {
        t.chimed = true;
        chime();
        const idx = day.blocks.findIndex(b => b.id === id);
        const next = day.blocks[idx + 1];
        toast("Time for this block is up." + (next ? " Next: " + next.label + "." : " That was the last block."));
        if (handsFree && id === activeId && !(meters[id] && holdSpec(day.blocks[idx]) && !doneMap[id])) hfAwaitSa(id, ["time_up"]);
      }
    }
    refreshHead();
  }, 1000);

  function closeBench() {
    if (bench) { bench.destroy(); bench = null; }
    if (benchBlock) { const c = cards[benchBlock]; if (c) { const host = c.querySelector(".toolhost"); if (host) host.hidden = true; const b = c.querySelector(".toolbtn"); if (b) b.textContent = "Open the tool"; } }
    benchBlock = null;
  }

  for (const b of day.blocks) {
    const total = (b.minutes || 0) * 60;
    const clock = h("span", { class: "timer" }, fmtClock(total));
    const tbtn = h("button", { type: "button", class: "btn" }, icon("play"), "Start");
    timers[b.id] = { total, clock, btn: tbtn, running: false, acc: 0, since: 0, chimed: false };
    tbtn.addEventListener("click", () => { if (timers[b.id].running) stopTimer(b.id); else startTimer(b.id); });
    const resetBtn = h("button", { type: "button", class: "iconbtn", title: "Reset timer" }, icon("reset", "Reset timer"));
    resetBtn.addEventListener("click", () => { stopTimer(b.id); timers[b.id].acc = 0; timers[b.id].chimed = false; clock.textContent = fmtClock(total); clock.classList.remove("over"); refreshHead(); });
    const cb = h("input", { type: "checkbox" });
    cb.checked = !!doneMap[b.id];
    const card = h("article", { class: "block" + (cb.checked ? " done" : ""), "data-id": b.id });
    cb.addEventListener("change", () => {
      doneMap[b.id] = cb.checked;
      card.classList.toggle("done", cb.checked);
      if (cb.checked) stopTimer(b.id);
      if (n === cur) saveBlocks(n, doneMap);
      refreshHead();
      if (cb.checked) {
        const idx = day.blocks.findIndex(x => x.id === b.id);
        const next = day.blocks.slice(idx + 1).find(x => !doneMap[x.id]);
        if (next && cards[next.id]) {
          setActive(next.id);
          if (focus) { window.scrollTo({ top: 0, behavior: "smooth" }); if (timers[next.id] && timers[next.id].total && !timers[next.id].running) startTimer(next.id); }
          else cards[next.id].scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });
    const parts = [
      // The header is the step's row in the list: tap it to open the step (like a task in a room).
      h("header", { class: "blockhead", onclick: e => { if (!e.target.closest(".blockctl") && activeId !== b.id) { setActive(b.id); card.scrollIntoView({ behavior: "smooth", block: "start" }); } } },
        h("span", { class: "stepicon " + b.id, "aria-hidden": "true" }, icon(stepMeta(b).icon), h("span", { class: "stepdone" }, icon("check"))),
        h("h3", null, h("button", { type: "button", class: "blockopen", "aria-expanded": "false" }, h("span", { class: "stepno small muted" }, "Step " + (day.blocks.indexOf(b) + 1) + " "), b.label, b.minutes ? h("span", { class: "muted small" }, " " + b.minutes + " min") : null)),
        total ? h("div", { class: "blockctl" }, clock, tbtn, resetBtn) : null),
      b.text ? h("p", { class: "steptext", translate: "no" }, renderInline(b.text, "phases/README.md")) : null,
      b.read && b.read.length ? h("div", { class: "linklist" }, b.read.map(r => h("a", { href: "#/read/" + r.path + (r.anchor ? "#" + r.anchor : ""), target: "_blank", rel: "noopener" }, plainCodes(r.label)))) : null,
    ];
    if (b.bench) {
      const host = h("div", { class: "toolhost", hidden: true });
      const btn = h("button", { type: "button", class: "btn toolbtn" }, "Open the tool");
      btn.addEventListener("click", () => {
        if (benchBlock === b.id) { closeBench(); return; }
        closeBench();
        host.hidden = false; btn.textContent = "Close the tool"; benchBlock = b.id;
        bench = mountBench(host, Object.assign({ compact: true }, b.bench, {
          onEar: recordEar,
        }));
      });
      parts.push(h("div", { class: "row" }, btn), host);
    }
    if (b.record) {
      const w = recordWidget({ day: n, label: "Day " + n + ": " + b.record });
      widgets.push(w);
      parts.push(h("div", { class: "toolhost" }, h("p", { class: "small" }, h("b", null, "Record: "), b.record), w));
    }
    if (b.id === "TEST" && day.milestone) parts.push(h("a", { class: "btn primary", href: "#/milestone/" + day.milestone }, "Open the " + day.milestone + " test"));
    parts.push(h("div", { class: "meterhost" }));
    parts.push(h("label", { class: "check listonly" }, cb, "Done"));
    const idx = day.blocks.indexOf(b), last = idx === day.blocks.length - 1;
    const backBtn = h("button", { type: "button", class: "btn" }, "Back");
    backBtn.disabled = idx === 0;
    backBtn.addEventListener("click", () => { setActive(day.blocks[idx - 1].id); window.scrollTo({ top: 0, behavior: "smooth" }); });
    const nextBtn = h("button", { type: "button", class: "btn primary big" }, last ? "Done: finish the session" : "Done, next step");
    nextBtn.addEventListener("click", () => {
      if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event("change")); }
      if (last) finishBtn.click();
      else if (activeId === b.id) { const nb = day.blocks[idx + 1]; setActive(nb.id); window.scrollTo({ top: 0, behavior: "smooth" }); }
    });
    parts.push(h("div", { class: "row between stepnav" }, backBtn, nextBtn));
    stepStrip.append(h("button", { type: "button", role: "listitem", class: "stepdot", "data-id": b.id, title: b.label, "aria-label": b.label, onclick: () => setActive(b.id) }, icon(stepMeta(b).icon), h("span", null, stepMeta(b).name)));
    // The instruction in plain words (in Hindi when chosen), as the app speaks it; the course's
    // original wording, with its lesson codes, stays a tap away.
    if (b.text) plainText(b).then(t => {
      const p = card.querySelector(".steptext"); if (!t || !p) return;
      const orig = h("details", { class: "small muted origtext" }, h("summary", null, "Original wording"), p.cloneNode(true));
      p.replaceWith(h("p", { class: "steptext" }, t), orig);
    });
    card.append(...parts.filter(Boolean));
    makePlayable(card);
    cards[b.id] = card;
    page.append(card);
  }
  // Ending early is possible, but it is not the main action: it sits at the end, under the steps.
  page.append(h("div", { class: "row end sessend" }, finishBtn));
  const first = day.blocks.find(b => !doneMap[b.id]) || day.blocks[day.blocks.length - 1];
  applyHandsFree();
  applyView();
  if (first) setActive(first.id);
  refreshHead();

  // Finish dialog.
  finishBtn.addEventListener("click", () => {
    for (const k of Object.keys(timers)) stopTimer(k);
    const timed = totalElapsed() / 60;
    const ticked = day.blocks.filter(b => doneMap[b.id]).reduce((a, b) => a + (b.minutes || 0), 0);
    const minutes = Math.round(timed >= 1 ? timed : ticked);
    const minIn = h("input", { type: "number", min: "0", max: "600", value: String(minutes), class: "input", id: "fin-min" });
    const note = h("textarea", { class: "input", id: "fin-note", placeholder: "What went well? What was hard? Which BPM did you reach?" });
    const yes = h("input", { type: "radio", name: "pass", value: "yes", id: "fin-yes" });
    const no = h("input", { type: "radio", name: "pass", value: "no", id: "fin-no" });
    const isMs = !!day.milestone && milestoneState(day.milestone).status !== "passed";
    const repeat = n < cur;
    if (isMs || repeat) yes.checked = true;
    const dlg = h("dialog", { class: "modal" },
      h("form", { method: "dialog", class: "stack" },
        h("h2", null, "Finish Day " + n),
        h("label", { class: "field", for: "fin-min" }, "Minutes practised", minIn),
        (!isMs && !repeat) ? h("fieldset", { class: "stack", style: { border: "1px solid var(--line)", borderRadius: "10px", padding: "10px 12px" } },
          h("legend", { class: "small muted" }, "Pass check"),
          h("p", { class: "small" }, day.pass || "Did the session go to plan?"),
          h("label", { class: "check", for: "fin-yes" }, yes, "Yes: move on to the next day"),
          h("label", { class: "check", for: "fin-no" }, no, "Not yet: repeat this day next time")) : null,
        isMs ? h("p", { class: "small muted" }, "This day has milestone " + day.milestone + ". Logging practice saves your work; pass the test to move on.") : null,
        h("label", { class: "field", for: "fin-note" }, "Journal note (optional)", note),
        h("div", { class: "row end" },
          h("button", { type: "button", class: "btn", onclick: () => dlg.close() }, "Keep practising"),
          h("button", { type: "submit", class: "btn primary", value: "save" }, "Save"))));
    dlg.addEventListener("close", () => {
      if (dlg.returnValue !== "save") { dlg.remove(); return; }
      if (!isMs && !repeat && !yes.checked && !no.checked) { toast("Choose whether you met the pass check."); dlg.returnValue = ""; dlg.showModal(); return; }
      const passed = isMs ? false : (repeat ? false : yes.checked);
      sessionQuestPoints();
      const res = finishSession(n, { minutes: Math.max(0, Math.min(600, Number(minIn.value) || 0)), note: note.value.trim(), passed, blocks: doneMap });
      dlg.remove();
      if (res.advanced) { toast("Day " + n + " complete. Day " + (n + 1) + " is unlocked."); location.hash = "#/today"; }
      else if (isMs && day.kind !== "milestone") { toast("Session saved. Now complete " + day.milestone + " to finish the day."); location.hash = "#/milestone/" + day.milestone; }
      else { toast(repeat ? "Practice logged." : passed ? "Saved." : "Logged. Repeat this day next time; that is how it sticks."); location.hash = "#/today"; }
    });
    document.body.appendChild(dlg);
    dlg.showModal();
  });

  return () => {
    hfGen++; cancelWait(); stopSpeaking();
    clearInterval(tick);
    disposed = true;
    document.removeEventListener("visibilitychange", onVisible);
    keepAwake(false);
    closeBench();
    Object.values(meters).forEach(m => m.destroy());
    widgets.forEach(w => w.cleanup && w.cleanup());
    if (n === cur) saveBlocks(n, doneMap);
  };
}
