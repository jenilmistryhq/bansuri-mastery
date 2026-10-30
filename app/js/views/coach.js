// Coach (#/coach): diagnose a practice problem from the course's troubleshooting guides.
// Works offline; no AI and no network beyond the app's own files. It can also listen to a held Sa
// and point at the likely problem, offer the matching live drill, and remember what helped.
import { h, clear, store, storeSet, today, fmtDate } from "../util.js";
import { renderMarkdown, fetchDoc, tablesOf, sectionOf } from "../content.js";
import { listenMic } from "../core/listen.js";
import { holdMeter, phraseCheck, echoGame, tapGame, micIntro } from "../core/live.js";
import { codeOf } from "../core/theory.js";

const HISTORY = "bansuri.coach.history";

// A live drill for each guide: the exercise that practises the fix and shows when it works.
const DRILLS = {
  "TS-01": ["Hold Sa with a clear tone", () => holdMeter({ targets: [0], seconds: 4, cents: 40 })],
  "TS-02": ["Hold Sa without a squeak", () => holdMeter({ targets: [0], seconds: 6, cents: 30 })],
  "TS-03": ["Hold low Pa (.P)", () => holdMeter({ targets: [-5], seconds: 4, cents: 40 })],
  "TS-04": ["Hold middle Pa (P)", () => holdMeter({ targets: [7], seconds: 4, cents: 40 })],
  "TS-05": ["Hold Sa within 10 cents", () => holdMeter({ targets: [0], seconds: 6, cents: 10 })],
  "TS-06": ["Play S R G R S cleanly twice", () => phraseCheck({ phrase: [0, 2, 4, 2, 0], reps: 2 })],
  "TS-07": ["Hold any note for 10 s", () => holdMeter({ targets: null, seconds: 10, cents: 30 })],
  "TS-09": ["Tap the beat", () => tapGame({ bpm: 72 })],
  "TS-10": ["Play phrases back by ear", () => echoGame({ level: "srg" })],
};

// What a held Sa says about the common problems. readings: [{ t, semi, near, cents, level }].
// Returns [{ ts, text }], most important first; an empty list means nothing stood out.
export function diagnose(readings) {
  const sounding = readings.filter(r => r.level > 0.008);
  if (sounding.length < 15) return [{ ts: "TS-01", text: "Almost no sound reached the microphone. If you were playing, it was mostly air: see the no-sound guide, and hold the phone closer." }];
  const voiced = sounding.filter(r => r.semi !== null && r.semi > -7.5);
  const out = [];
  if (voiced.length / sounding.length < 0.6) out.push({ ts: "TS-01", text: `Much of the sound had no clear pitch (${Math.round((1 - voiced.length / sounding.length) * 100)}% airy): a smaller lip opening and less air.` });
  if (!voiced.length) return out;
  let jumps = 0;
  for (let i = 1; i < voiced.length; i++) if (Math.abs(voiced[i].near - voiced[i - 1].near) >= 11) jumps++;
  const count = {};
  voiced.forEach(r => { count[r.near] = (count[r.near] || 0) + 1; });
  const main = Number(Object.entries(count).sort((a, b) => b[1] - a[1])[0][0]);
  if (jumps >= 2) out.push({ ts: "TS-02", text: `The note jumped by an octave ${jumps} times: the air is too fast or the lips too tight.` });
  if (main === 12) out.push({ ts: "TS-02", text: "You played upper Sa (S') instead of Sa: slow the air right down." });
  else if (main !== 0) out.push({ ts: "TS-06", text: `The main note was ${codeOf(main)}, not Sa: check that holes 1-3 are fully covered and 4-6 fully open.` });
  const onMain = voiced.filter(r => r.near === main).map(r => r.cents).sort((a, b) => a - b);
  if (onMain.length >= 10) {
    const med = onMain[onMain.length >> 1];
    const mean = onMain.reduce((a, b) => a + b, 0) / onMain.length;
    const sd = Math.sqrt(onMain.reduce((a, b) => a + (b - mean) * (b - mean), 0) / onMain.length);
    if (Math.abs(med) > 20) out.push({ ts: "TS-05", text: `The note was ${Math.abs(med)} cents ${med < 0 ? "flat: blow slightly faster, or roll the flute out" : "sharp: slow the air, or roll the flute in"}. If every note is off by this much, set your flute's tuning in Settings.` });
    if (sd > 15) out.push({ ts: "TS-07", text: `The pitch wavered by about ${Math.round(sd)} cents: breathe low and keep the air steady from start to end.` });
  }
  let run = 0, longest = 0;
  for (let i = 0; i < readings.length; i++) {
    const r = readings[i];
    if (r.semi !== null && r.near === main) { run += i ? r.t - readings[i - 1].t : 0; longest = Math.max(longest, run); } else run = 0;
  }
  if (longest < 3.5) out.push({ ts: "TS-07", text: `The longest steady stretch was ${longest.toFixed(1)} s: aim for 6 s with a calm, low breath.` });
  return out;
}

export async function render(main) {
  const page = h("div", { class: "page" });
  main.append(page);
  const cleanups = [];
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Coach"), h("h1", null, "What is going wrong?"),
    h("p", { class: "muted" }, "Let the coach listen to a long Sa, or pick the closest symptom. You get the likely causes, quick checks to tick, a drill that shows when it works, and when to see a teacher.")));

  const md = await fetchDoc("troubleshooting/README.md");
  const table = tablesOf(md).find(t => t.head.some(x => /symptom/i.test(x)));
  const rows = table ? table.rows : [];
  const causeCol = table ? table.head.find(x => /cause/i.test(x)) : null;
  const tsOf = r => ((/TS-\d\d/.exec(r.Guide || "") || [])[0]) || null;
  const out = h("div", { class: "stack", role: "region", "aria-live": "polite", "aria-label": "Diagnosis" });
  const grid = h("div", { class: "symgrid", role: "group", "aria-label": "Symptoms" });
  let drill = null;
  cleanups.push(() => { if (drill) drill.destroy(); });

  function history() { return store(HISTORY, []); }
  function remember(ts, symptom, helped) {
    const list = history().filter(x => !(x.d === today() && x.ts === ts));
    list.push({ d: today(), ts, symptom, helped });
    storeSet(HISTORY, list.slice(-12));
    drawHistory();
  }
  const histHost = h("div");
  function drawHistory() {
    const list = history().slice().reverse();
    clear(histHost);
    if (!list.length) return;
    histHost.append(h("section", { class: "card" }, h("h2", null, "What you worked on"),
      h("div", { class: "stack" }, list.slice(0, 5).map(x => h("div", { class: "row between" },
        h("button", { type: "button", class: "linkbtn", onclick: () => openSymptom(rows.find(r => tsOf(r) === x.ts && r.Symptom === x.symptom) || rows.find(r => tsOf(r) === x.ts)) }, x.symptom),
        h("span", { class: "small muted" }, fmtDate(x.d) + " - " + (x.helped === true ? "it helped" : x.helped === false ? "not yet" : "tried")))))));
  }

  async function openSymptom(r) {
    if (!r) return;
    grid.querySelectorAll("button").forEach(x => { const on = x.dataset.sym === r.Symptom; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); });
    if (drill) { drill.destroy(); drill = null; }
    const ts = tsOf(r), m = /\(([^)]+\.md)\)/.exec(r.Guide || "");
    const path = m ? "troubleshooting/" + m[1] : null;
    clear(out).append(h("p", { class: "muted" }, "Loading..."));
    const parts = [h("h2", null, r.Symptom), h("p", null, h("b", null, "Most likely causes, most likely first: "), (causeCol && r[causeCol]) || "")];
    if (path) {
      const guide = await fetchDoc(path);
      const checksKey = "bansuri.coach.checks." + ts;
      const ticked = store(checksKey, {});
      for (const re of [/^quick checks/i, /^fixes and drills/i, /^how to verify/i, /^when to seek a teacher/i]) {
        const sec = sectionOf(guide, re);
        if (!sec) continue;
        const node = renderMarkdown(sec, path).node; node.classList.add("reader");
        // Quick checks become a checklist the learner works through.
        if (/quick checks/i.test(re.source)) node.querySelectorAll("li").forEach((li, i) => {
          const cb = h("input", { type: "checkbox", "aria-label": "Checked" });
          cb.checked = !!ticked[i];
          cb.addEventListener("change", () => { const t = store(checksKey, {}); t[i] = cb.checked; storeSet(checksKey, t); });
          const text = h("span"); text.append(...li.childNodes);
          li.classList.add("checkli"); li.append(cb, text);
        });
        parts.push(h("div", { class: "card flat" }, node));
      }
      if (DRILLS[ts]) {
        const [label, make] = DRILLS[ts];
        const host = h("div", { class: "toolhost", hidden: true });
        const btn = h("button", { type: "button", class: "btn primary" }, "Try the drill now: " + label);
        btn.addEventListener("click", () => {
          if (drill) { drill.destroy(); drill = null; host.hidden = true; btn.textContent = "Try the drill now: " + label; return; }
          drill = make(); host.replaceChildren(drill.el); host.hidden = false; btn.textContent = "Close the drill";
          remember(ts, r.Symptom, null);
        });
        parts.splice(2, 0, h("div", { class: "card flat drillcard" }, h("div", { class: "row" }, btn), host));
      }
      parts.push(h("div", { class: "card flat" }, h("b", null, "Did this help?"),
        h("div", { class: "row" },
          h("button", { type: "button", class: "btn", onclick: e => { remember(ts, r.Symptom, true); e.target.closest(".row").replaceChildren(h("span", { class: "chip good" }, "Great. Keep the drill in your warm-up for a week.")); } }, "Yes, it helped"),
          h("button", { type: "button", class: "btn", onclick: e => { remember(ts, r.Symptom, false); e.target.closest(".row").replaceChildren(h("span", { class: "small" }, "Give it 5-10 practice days. If nothing changes, a teacher's eye is the fastest fix (see above).")); } }, "Not yet"))));
      parts.push(h("div", { class: "row" }, h("a", { class: "btn", href: "#/read/" + path }, "Open the full guide"), h("a", { class: "btn", href: "#/read/troubleshooting/README.md" }, "The diagnosis method")));
    }
    clear(out).append(...parts);
    const head = out.querySelector("h2");
    head.setAttribute("tabindex", "-1"); head.focus({ preventScroll: true });
    head.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  for (const r of rows) {
    const first = String((causeCol && r[causeCol]) || "").split(/[;,.]/)[0];
    const b = h("button", { type: "button", class: "symcard", "aria-pressed": "false", "data-sym": r.Symptom }, h("b", null, r.Symptom), first ? h("span", { class: "small muted" }, first) : null);
    b.addEventListener("click", () => openSymptom(r));
    grid.append(b);
  }

  // Let the coach listen: 6 seconds of a held Sa.
  const listenMsg = h("p", { class: "small", "aria-live": "polite" }, "Close the top three holes and press Start. Play one long Sa, as steady as you can.");
  const findings = h("div", { class: "stack" });
  const listenBtn = h("button", { type: "button", class: "btn primary" }, "Start listening");
  const meter = h("div", { class: "progressbar", role: "progressbar", "aria-label": "Listening", "aria-valuemin": "0", "aria-valuemax": "6", "aria-valuenow": "0" }, h("i", { style: { width: "0%" } }));
  let unsub = null, timer = 0, gone = false;
  cleanups.push(() => { gone = true; clearInterval(timer); if (unsub) { unsub(); unsub = null; } });
  listenBtn.addEventListener("click", async () => {
    if (unsub) return;
    if (!(await micIntro(listenBtn.parentElement)) || gone) return;
    const reads = []; let started = null;
    clear(findings);
    try {
      unsub = await listenMic(r => { reads.push(r); if (started === null && r.semi !== null) started = r.t; });
      if (gone) { unsub(); unsub = null; return; }
    } catch (e) { listenMsg.textContent = "The microphone is not available here. Pick a symptom below instead."; return; }
    listenBtn.disabled = true;
    const t0 = Date.now();
    listenMsg.textContent = "Listening... play your long Sa now.";
    timer = setInterval(() => {
      const secs = (Date.now() - t0) / 1000;
      meter.firstChild.style.width = Math.min(100, secs / 8 * 100) + "%";
      if (secs < 8) return;
      clearInterval(timer); unsub(); unsub = null; listenBtn.disabled = false; listenBtn.textContent = "Listen again";
      const playing = started === null ? reads : reads.filter(r => r.t >= started - 0.2);
      const res = diagnose(playing);
      if (!res.length) { listenMsg.textContent = "Your Sa sounded clear, steady and in tune. If something still feels wrong, pick the closest symptom below."; return; }
      listenMsg.textContent = "Here is what the coach heard, most important first:";
      const seen = new Set();
      for (const f of res) {
        const row = rows.find(r => tsOf(r) === f.ts);
        findings.append(h("div", { class: "notice info row between" }, h("span", null, f.text),
          row && !seen.has(f.ts) ? h("button", { type: "button", class: "btn small", onclick: () => openSymptom(row) }, "Show the fix") : null));
        seen.add(f.ts);
      }
    }, 200);
  });

  page.append(h("section", { class: "card" }, h("h2", null, "Let the coach listen"), listenMsg, meter, h("div", { class: "row" }, listenBtn), findings));
  page.append(histHost);
  page.append(h("section", { class: "card" }, h("h2", null, "Or pick a symptom"), grid, out,
    h("p", { class: "small muted" }, "Pain, numbness or tingling that does not go away: stop and see a doctor or physiotherapist. ",
      h("a", { href: "#/read/troubleshooting/TS-08-body-pain-and-tension.md" }, "Read the medical caution"), ". For tone, posture and embouchure, a live teacher sees what no guide can.")));
  drawHistory();
  return () => cleanups.forEach(f => f());
}
