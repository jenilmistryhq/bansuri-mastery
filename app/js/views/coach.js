// Fix a problem (Skills > Fix, #/skills/fix; the old #/coach): diagnose a practice problem from the
// course's troubleshooting guides. Works offline; no AI and no network beyond the app's own files.
// Offers the matching live drill and remembers what helped. Its first section is the Tone check
// (views/tone.js), which listens to a held note, scores it and runs diagnose() below; "Show the fix"
// opens the guide here. #/skills/fix/TS-nn (#/coach/TS-nn) opens a guide directly, and
// #/skills/fix/TS-nn/<skill> also links back to that skill; #/tone opens it at the Tone check.
import { h, clear, store, storeSet, today, fmtDate } from "../util.js";
import { renderMarkdown, fetchDoc, tablesOf, sectionOf } from "../content.js";
import { holdMeter, phraseCheck, echoGame, tapGame } from "../core/live.js";
import { codeOf } from "../core/theory.js";
import { toneCheck } from "./tone.js";
import { SKILLS, skillById } from "../skillmap.js";

const HISTORY = "bansuri.coach.history";
// The symptoms in four groups (redesign S4), by guide.
const GROUPS = [["Sound", ["TS-01", "TS-02", "TS-03", "TS-04", "TS-05"]], ["Fingers and body", ["TS-06", "TS-07", "TS-08"]],
  ["Musicianship", ["TS-09", "TS-10", "TS-11"]], ["The flute", ["TS-12"]]];

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

// What a held note says about the common problems. readings: [{ t, semi, near, cents, level }];
// target: the note asked for (semitones from Sa; Sa by default).
// Returns [{ ts, text }], most important first; an empty list means nothing stood out.
export function diagnose(readings, target = 0) {
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
  if (main === target + 12) out.push({ ts: "TS-02", text: target === 0 ? "You played upper Sa (S') instead of Sa: slow the air right down." : `You played ${codeOf(main)}, an octave above ${codeOf(target)}: slow the air right down.` });
  else if (main !== target) out.push({ ts: "TS-06", text: target === 0 ? `The main note was ${codeOf(main)}, not Sa: check that holes 1-3 are fully covered and 4-6 fully open.` : `The main note was ${codeOf(main)}, not ${codeOf(target)}: check the fingering, and that every closed hole is fully covered.` });
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

export async function render(main, { params } = {}) {
  const page = h("div", { class: "page" });
  main.append(page);
  const cleanups = [];
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Fix a problem"), h("h1", null, "What is going wrong?"),
    h("p", { class: "muted" }, "Let the app listen to a held note, or pick the closest symptom. You get the likely causes, quick checks to tick, a drill that shows when it works, and when to see a teacher.")));

  const md = await fetchDoc("troubleshooting/README.md");
  const table = tablesOf(md).find(t => t.head.some(x => /symptom/i.test(x)));
  const rows = table ? table.rows : [];
  const causeCol = table ? table.head.find(x => /cause/i.test(x)) : null;
  const tsOf = r => ((/TS-\d\d/.exec(r.Guide || "") || [])[0]) || null;
  const out = h("div", { class: "stack", role: "region", "aria-live": "polite", "aria-label": "Diagnosis" });
  const grid = h("div", { class: "symgroups", role: "group", "aria-label": "Symptoms" });
  // The skill this was opened from (#/skills/fix/TS-nn/<skill>), else the skill the guide belongs to.
  const fromSkill = params && params[1] ? skillById(params[1]) : null;
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
    // Back to the skill (redesign W50): the one it was opened from, or the one it belongs to.
    const hub = fromSkill && fromSkill.fixes.includes(ts) ? fromSkill : SKILLS.find(s => s.fixes.includes(ts));
    if (hub) parts.push(h("div", { class: "row" }, h("a", { class: "btn ghost fixback", href: "#/skills/" + hub.id }, "Back to " + hub.title)));
    clear(out).append(...parts);
    const head = out.querySelector("h2");
    head.setAttribute("tabindex", "-1"); head.focus({ preventScroll: true });
    head.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const symCard = r => {
    const first = String((causeCol && r[causeCol]) || "").split(/[;,.]/)[0];
    const b = h("button", { type: "button", class: "symcard", "aria-pressed": "false", "data-sym": r.Symptom }, h("b", null, r.Symptom), first ? h("span", { class: "small muted" }, first) : null);
    b.addEventListener("click", () => openSymptom(r));
    return b;
  };
  // Grouped as the learner hears the problem; a guide the groups do not name goes last, on its own.
  const placed = new Set(GROUPS.flatMap(g => g[1]));
  for (const [label, list] of GROUPS.concat([["", rows.map(tsOf).filter(ts => !placed.has(ts))]])) {
    const cards = rows.filter(r => list.includes(tsOf(r))).map(symCard);
    if (cards.length) grid.append(h("div", { class: "symgroup" }, label ? h("h3", { class: "symhead" }, label) : null, h("div", { class: "symgrid" }, cards)));
  }

  // First the Tone check: it listens, and its findings open the guides below. What you worked on
  // comes last.
  const tone = toneCheck({ onFix: ts => openSymptom(rows.find(r => tsOf(r) === ts)) });
  cleanups.push(tone.cleanup);
  page.append(tone.top);
  page.append(h("section", { class: "card", id: "symptoms" }, h("h2", null, "Or pick what you hear"), grid, out,
    h("p", { class: "small muted" }, "Pain, numbness or tingling that does not go away: stop and see a doctor or physiotherapist. ",
      h("a", { href: "#/read/troubleshooting/TS-08-body-pain-and-tension.md" }, "Read the medical caution"), ". For tone, posture and embouchure, a live teacher sees what no guide can.")));
  page.append(...tone.more);
  page.append(histHost);
  drawHistory();
  // #/coach/TS-05: opened from a Tone check finding.
  const want = params && /^TS-\d\d$/.test(params[0] || "") ? params[0] : null;
  if (want) openSymptom(rows.find(r => tsOf(r) === want));
  else if (/^#\/tone$/.test(location.hash)) tone.top.querySelector("#tone").scrollIntoView({ block: "start" });
  return () => cleanups.forEach(f => f());
}
