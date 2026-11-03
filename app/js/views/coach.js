// Fix a problem (Skills > Fix, #/skills/fix; the old #/coach): diagnose a practice problem from the
// course's troubleshooting guides. Works offline; no AI and no network beyond the app's own files.
// Offers the matching live drill and remembers what helped. Its first section is the Tone check
// (views/tone.js), which listens to a held note, scores it and runs diagnose() below. Each symptom,
// and each Tone check finding, opens its fix on its own screen (redesign W50): #/skills/fix/TS-nn
// (#/coach/TS-nn), and #/skills/fix/TS-nn/<skill> also links back to that skill; #/tone opens the
// Fix tab at the Tone check.
import { h, clear, store, storeSet, today, fmtDate, icon } from "../util.js";
import { renderMarkdown, fetchDoc, tablesOf, sectionOf } from "../content.js";
import { holdMeter, phraseCheck, echoGame, tapGame } from "../core/live.js";
import { codeOf } from "../core/theory.js";
import { toneCheck } from "./tone.js";
import { SKILLS, skillById, FIX_INFO, FIX_FILE } from "../skillmap.js";
import { backHead } from "../backhead.js";

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

// Where the learner was before this screen (main.js keeps the previous address for the tab), so a
// fix opened from a lesson step or a hub goes back there with the browser's own Back.
const PREV = "bansuri.nav.prev";
const prevHash = () => { try { return sessionStorage.getItem(PREV) || ""; } catch (e) { return ""; } };
// A good example to hear, for the guides about the sound itself (app/audio, the reference player).
const EXAMPLES = {
  "TS-01": "bansuri-sa-middle-octave-sankalp.mp3", "TS-02": "bansuri-sa-middle-octave-sankalp.mp3", "TS-03": "bansuri-sa-lower-octave-sankalp.mp3",
  "TS-04": "bansuri-sa-three-octaves-sankalp.mp3", "TS-05": "bansuri-sa-middle-octave-sankalp.mp3", "TS-07": "bansuri-sa-middle-octave-sankalp.mp3",
};
const historyOf = () => store(HISTORY, []);
function remember(ts, helped) {
  const list = historyOf().filter(x => !(x.d === today() && x.ts === ts));
  list.push({ d: today(), ts, symptom: FIX_INFO[ts] || ts, helped });
  storeSet(HISTORY, list.slice(-12));
}
// A guide's section without its heading line (the screen gives its own headings).
const body = (md, re) => sectionOf(md, re).replace(/^#{1,6}[^\n]*\n/, "").trim();
// The fixes of a guide: its "### Fix A: ..." parts under "Fixes and drills" (or "Fixes").
export function fixesOf(md) {
  const sec = sectionOf(md, /^fixes/i);
  return sec.split(/^###\s+/m).slice(1).map(part => {
    const nl = part.indexOf("\n");
    return { head: (nl < 0 ? part : part.slice(0, nl)).replace(/^Fix [A-Z]:\s*/, "").trim(), text: nl < 0 ? "" : part.slice(nl + 1).trim() };
  });
}

// A fix on its own screen (redesign W50, #/skills/fix/TS-nn and #/skills/fix/TS-nn/<skill>): what it
// sounds like, the guide's fixes numbered, each with Try for the topic's live drill, a good example to
// hear, the full guide, the teacher, and the way back to where it was opened from.
async function fixScreen(main, ts, fromSkill) {
  const path = "troubleshooting/" + FIX_FILE[ts], title = FIX_INFO[ts] || ts;
  const page = h("div", { class: "page fixpage", dataset: { noswipe: "1", ts } },
    backHead("#/skills/fix", "Fix a problem", title, h("span", { class: "chip mutedc fixcode", translate: "no" }, ts)));
  main.append(page);
  let drill = null, audio = null;
  const guide = await fetchDoc(path).catch(() => "");
  const block = (head, ...kids) => h("section", { class: "card fixpart" }, h("h2", { class: "grouphead" }, head), ...kids);
  const md = text => { const n = renderMarkdown(text, path).node; n.classList.add("reader"); return n; };
  const sounds = body(guide, /^symptoms/i);
  if (sounds) page.append(block("What it sounds like", md(sounds)));
  // Try this first: the guide's fixes in order, each opening to its steps; Try opens the drill.
  const fixes = fixesOf(guide), drillDef = DRILLS[ts];
  const closeDrill = () => { if (!drill) return; drill.w.destroy(); drill.host.hidden = true; drill.host.replaceChildren(); drill.btn.textContent = "Try"; drill.btn.setAttribute("aria-expanded", "false"); drill = null; };
  const openDrill = (host, btn) => {
    const same = drill && drill.host === host;
    closeDrill();
    if (same) return;
    const w = drillDef[1]();
    host.replaceChildren(h("p", { class: "small muted" }, drillDef[0]), w.el); host.hidden = false;
    btn.textContent = "Close"; btn.setAttribute("aria-expanded", "true");
    drill = { w, host, btn };
    remember(ts, null);
  };
  if (fixes.length) {
    page.append(block("Try this first", h("ol", { class: "fixlist" }, fixes.map((f, i) => {
      const host = h("div", { class: "toolhost drillcard", hidden: true });
      const tryBtn = drillDef ? h("button", { type: "button", class: "btn small fixtry", "aria-expanded": "false" }, "Try") : null;
      if (tryBtn) tryBtn.addEventListener("click", () => openDrill(host, tryBtn));
      return h("li", { class: "fixstep" }, h("div", { class: "fixrow" }, h("span", { class: "fixnum", "aria-hidden": "true" }, String(i + 1)),
        h("details", { class: "fixmore" }, h("summary", null, h("b", { translate: "no" }, f.head)), md(f.text)), tryBtn), host);
    }))));
  }
  // The quick checks as a list to tick, and how to know it worked (the guide's own words).
  const checks = body(guide, /^quick checks/i), verify = body(guide, /^how to verify/i), seek = body(guide, /^when to seek/i);
  if (checks) {
    const node = md(checks), key = "bansuri.coach.checks." + ts, ticked = store(key, {});
    node.querySelectorAll("li").forEach((li, i) => {
      const cb = h("input", { type: "checkbox", "aria-label": "Checked" });
      cb.checked = !!ticked[i];
      cb.addEventListener("change", () => { const t = store(key, {}); t[i] = cb.checked; storeSet(key, t); });
      const text = h("span"); text.append(...li.childNodes);
      li.classList.add("checkli"); li.append(cb, text);
    });
    page.append(h("details", { class: "card fixpart" }, h("summary", null, h("b", null, "Quick checks")), node));
  }
  if (verify) page.append(h("details", { class: "card fixpart" }, h("summary", null, h("b", null, "How to know it worked")), md(verify)));
  const helped = h("div", { class: "row" },
    h("button", { type: "button", class: "btn", onclick: () => { remember(ts, true); helped.replaceChildren(h("span", { class: "chip good" }, "Great. Keep the drill in your warm-up for a week.")); } }, "Yes, it helped"),
    h("button", { type: "button", class: "btn", onclick: () => { remember(ts, false); helped.replaceChildren(h("span", { class: "small" }, "Give it 5-10 practice days. If nothing changes, a teacher's eye is the fastest fix.")); } }, "Not yet"));
  page.append(h("section", { class: "card flat fixhelped" }, h("b", null, "Did this help?"), helped));

  // Hear a good example, the full guide, the teacher, and the way back.
  const links = h("div", { class: "stack fixlinks" });
  if (EXAMPLES[ts]) links.append(h("div", { class: "row" }, h("button", { type: "button", class: "btn fixhear", onclick: () => { if (audio) audio.pause(); audio = new Audio("app/audio/" + EXAMPLES[ts]); audio.play().catch(() => {}); } }, icon("play"), " Hear a good example")));
  links.append(h("div", { class: "hublist" },
    h("a", { class: "hubrow", href: "#/read/" + path }, h("b", null, "Open the full guide"), h("span"), h("span", { class: "chev", "aria-hidden": "true" }, ">")),
    h("a", { class: "hubrow fixteacher", href: "#/me/teacher" }, h("span", { class: "stack" }, h("span", { class: "small muted" }, "Still stuck?"), h("b", null, "Ask your teacher")), h("span"), h("span", { class: "chev", "aria-hidden": "true" }, ">"))));
  if (seek) links.append(h("details", { class: "small fixseek" }, h("summary", null, "When to see a teacher"), md(seek)));
  page.append(h("section", { class: "card fixpart" }, links));
  // Back: to the hub it was opened from (or belongs to). When the screen before this one is that hub,
  // or another screen of the app (a lesson step), the browser's own Back, so that screen keeps its place.
  const hub = fromSkill && fromSkill.fixes.includes(ts) ? fromSkill : SKILLS.find(s => s.fixes.includes(ts));
  const prev = prevHash(), hubHref = hub ? "#/skills/" + hub.id : null;
  const prevSkill = /^#\/skills\/([a-z]+)$/.exec(prev), other = prevSkill ? skillById(prevSkill[1]) : null;
  let back;
  if (hub && (fromSkill || prev === hubHref)) {
    back = h("a", { class: "btn ghost fixback", href: hubHref }, "Back to " + hub.title);
    if (prev === hubHref) back.addEventListener("click", e => { e.preventDefault(); history.back(); });
  } else if (prev && prev !== location.hash && !/^#\/skills\/fix\/TS-/.test(prev)) {
    const label = /^#\/(skills\/fix|coach|tone)$/.test(prev) ? "Back to Fix a problem" : /^#\/(lesson|session|day)\//.test(prev) ? "Back to the lesson" : other ? "Back to " + other.title : "Back";
    back = h("button", { type: "button", class: "btn ghost fixback", onclick: () => history.back() }, label);
  } else if (hub) back = h("a", { class: "btn ghost fixback", href: hubHref }, "Back to " + hub.title);
  else back = h("a", { class: "btn ghost fixback", href: "#/skills/fix" }, "Back to Fix a problem");
  page.append(h("div", { class: "row" }, back));
  return () => { closeDrill(); if (audio) audio.pause(); };
}

export async function render(main, { params } = {}) {
  // #/skills/fix/TS-nn (and #/coach/TS-nn): the fix on its own screen.
  const want = params && /^TS-\d\d$/.test(params[0] || "") ? params[0] : null;
  if (want && FIX_FILE[want]) return fixScreen(main, want, params[1] ? skillById(params[1]) : null);
  const page = h("div", { class: "page" });
  main.append(page);
  const cleanups = [];
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Fix a problem"), h("h1", null, "What is going wrong?"),
    h("p", { class: "muted" }, "Let the app listen to a held note, or pick the closest symptom. Each opens its fix: what it sounds like, what to try first, a drill that shows when it works, and when to see a teacher.")));

  const md = await fetchDoc("troubleshooting/README.md");
  const table = tablesOf(md).find(t => t.head.some(x => /symptom/i.test(x)));
  const rows = table ? table.rows : [];
  const causeCol = table ? table.head.find(x => /cause/i.test(x)) : null;
  const tsOf = r => ((/TS-\d\d/.exec(r.Guide || "") || [])[0]) || null;
  const grid = h("div", { class: "symgroups", role: "group", "aria-label": "Symptoms" });

  const histHost = h("div");
  function drawHistory() {
    const list = historyOf().slice().reverse();
    clear(histHost);
    if (!list.length) return;
    histHost.append(h("section", { class: "card" }, h("h2", null, "What you worked on"),
      h("div", { class: "stack" }, list.slice(0, 5).map(x => h("div", { class: "row between" },
        h("a", { class: "linkbtn", href: "#/skills/fix/" + x.ts }, FIX_INFO[x.ts] || x.symptom),
        h("span", { class: "small muted" }, fmtDate(x.d) + " - " + (x.helped === true ? "it helped" : x.helped === false ? "not yet" : "tried")))))));
  }

  // Each symptom opens its fix on its own screen (W50).
  const symCard = r => {
    const first = String((causeCol && r[causeCol]) || "").split(/[;,.]/)[0];
    return h("a", { class: "symcard", href: "#/skills/fix/" + tsOf(r), "data-sym": r.Symptom }, h("b", null, r.Symptom), first ? h("span", { class: "small muted" }, first) : null);
  };
  // Grouped as the learner hears the problem; a guide the groups do not name goes last, on its own.
  const placed = new Set(GROUPS.flatMap(g => g[1]));
  for (const [label, list] of GROUPS.concat([["", rows.map(tsOf).filter(ts => !placed.has(ts))]])) {
    const cards = rows.filter(r => list.includes(tsOf(r))).map(symCard);
    if (cards.length) grid.append(h("div", { class: "symgroup" }, label ? h("h3", { class: "symhead" }, label) : null, h("div", { class: "symgrid" }, cards)));
  }

  // First the Tone check: it listens, and each finding opens its fix. What you worked on comes last.
  const tone = toneCheck();
  cleanups.push(tone.cleanup);
  page.append(tone.top);
  page.append(h("section", { class: "card", id: "symptoms" }, h("h2", null, "Or pick what you hear"), grid,
    h("p", { class: "small muted" }, "Pain, numbness or tingling that does not go away: stop and see a doctor or physiotherapist. ",
      h("a", { href: "#/read/troubleshooting/TS-08-body-pain-and-tension.md" }, "Read the medical caution"), ". For tone, posture and embouchure, a live teacher sees what no guide can.")));
  page.append(...tone.more);
  page.append(histHost);
  drawHistory();
  if (/^#\/tone$/.test(location.hash)) tone.top.querySelector("#tone").scrollIntoView({ block: "start" });
  return () => cleanups.forEach(f => f());
}

