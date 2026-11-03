// Milestone test (#/milestone/<id>): checklist parsed from the milestone file, rubric, record, pass/fail.
// The cover (docs/redesign 05 L7, W35): what is checked first, then how to take it (the test day's
// own steps and the milestone's own conditions), the rubric, then Take the test beside Rehearse
// first. The test runs in the lesson player, one check per step (W36, F7), then the recording and
// the score. Not yet (W38) leads with what passed and says where to practise the rest; passed (W37)
// shows the badge and plays the Day 0 time capsule next to today's recording.
import { h, fmtDate, toast, icon, today, store, storeSet, ICON_PATHS } from "../util.js";
import { milestoneInfo, milestoneState, recordAttempt, current, getDay } from "../course.js";
import { fetchDoc, tablesOf, renderInline, renderMarkdown, sectionOf, routeFor } from "../content.js";
import { recordWidget, listRecordings } from "../recorder.js";
import { celebrate } from "../fun.js";
import { holdMeter, phraseCheck, noteQuiz, echoGame } from "../core/live.js";
import { parseNotation } from "../core/notation.js";
import { lessonPlayer, lessonRecord } from "../lesson/player.js";
import { backHead } from "../backhead.js";
import { stepMeta, plainText } from "../steps.js";
import { makePlayable } from "../playable.js";
import { emblem } from "../ui.js";

const SWARA = { Sa: 0, Re: 2, Ga: 4, Ma: 5, Pa: 7, Dha: 9, Ni: 11 };
function notesOf(text) {
  const p = parseNotation(text);
  if (p.skipped.length) return [];
  const out = [];
  for (const tk of p.tokens) if (tk.type === "beat") for (const it of tk.items) if (it.semi !== undefined) out.push(it.semi);
  return out;
}

// Items the microphone can judge, read from the item's own wording:
// "Long tone Sa | Held 8 s; tuner within +/-20 cents" -> hold Sa 8 s within 20 cents;
// "`S R G R S` at 50 BPM | 3 clean repetitions in a row" -> play the phrase cleanly 3 times.
export function micSpec(label, criterion) {
  const crit = criterion || "";
  const codes = [...label.matchAll(/`([^`]+)`/g)].map(m => notesOf(m[1])).filter(n => n.length);
  const held = crit.match(/held (\d+) s/i) || label.match(/held (\d+) s/i);
  const centsOf = t => { const m = t.match(/\+\/-(\d+) cents/); return m ? Number(m[1]) : null; };
  const score = crit.match(/(\d+)\s*\/\s*(\d+)/);
  // "Identify 20 single notes from `S R G P` against the drone | 18/20": a note-naming test.
  if (/^identify/i.test(label) && codes.length && score) return { kind: "ear", notes: [...new Set(codes.flat())], count: Number(score[2]), pass: Number(score[1]) };
  // "Phrase memory: hear 2 times, then play back 10 two-bar phrases | 8/10": a play-back test.
  if (/play back/i.test(label) && score) return { kind: "echo", rounds: Number(score[2]), pass: Number(score[1]), len: 4 };
  // "Each komal note held 4 s | within +/-15 cents".
  if (/komal note/i.test(label) && held) return { kind: "hold", targets: [1, 3, 8, 10], seconds: Number(held[1]), cents: centsOf(crit) || 20 };
  // "Tuning: hold each of `S G P` against the drone ... | All within +/-10 cents".
  if (/\bhold\b/i.test(label) && codes.length && centsOf(crit) && !held) return { kind: "hold", targets: [...new Set(codes.flat())], seconds: 4, cents: centsOf(crit) };
  // "Chromatic scale `S r R ...` up and down, slowly with drone | Every note within +/-20 cents".
  if (/up and down/i.test(label) && codes.length && codes[0].length >= 3) return { kind: "phrase", phrase: codes[0].concat(codes[0].slice(0, -1).reverse()), reps: 1 };
  if (/long tone/i.test(label) && held) {
    let targets = codes.length ? [...new Set(codes.flat())] : [];
    if (!targets.length) for (const [w, v] of Object.entries(SWARA)) if (new RegExp("\\b" + w + "\\b").test(label)) targets.push(v);
    const cents = crit.match(/\+\/-(\d+) cents/);
    return { kind: "hold", targets: targets.length ? targets : null, seconds: Number(held[1]), cents: cents ? Number(cents[1]) : 30 };
  }
  if (codes.length && /BPM/i.test(label) && codes[0].length >= 3) {
    const reps = crit.match(/(\d+) clean repetitions?/i) || crit.match(/(\d+) [a-z ]*in a row/i);
    // "Kalyan scale `S R G M P D N S'` and back": up, then down again.
    const phrase = /and back/i.test(label) ? codes[0].concat(codes[0].slice(0, -1).reverse()) : codes[0];
    return { kind: "phrase", phrase, reps: reps ? Math.min(5, Number(reps[1])) : 1 };
  }
  return null;
}

const RUBRIC = [["T", "Tone"], ["P", "Pitch"], ["R", "Rhythm"], ["Tr", "Transitions / technique"], ["E", "Expression"]];

// Every table that has a "Required" column becomes part of the checklist.
function checklist(md) {
  const items = [];
  for (const t of tablesOf(md)) {
    const req = t.head.find(x => /^required$/i.test(x));
    if (!req) continue;
    const labelCol = t.head.find(x => /item|criterion|portfolio/i.test(x) && !/pass criterion/i.test(x)) || t.head[1];
    const critCol = t.head.find(x => /pass criterion/i.test(x));
    for (const r of t.rows) {
      const required = /^yes/i.test(r[req] || "");
      items.push({ key: (r["#"] || String(items.length + 1)) + ":" + (r[labelCol] || "").slice(0, 40), num: r["#"] || "", label: r[labelCol] || "", criterion: critCol ? r[critCol] : "", required, requiredText: r[req] || "" });
    }
  }
  return items;
}

// Three short checks (a steady Sa, a clean phrase, playing back by ear), then the lessons that fix
// whichever one did not pass.
function stuckCheck(cleanups) {
  const CHECKS = [
    { name: "A steady Sa for 6 seconds", make: done => holdMeter({ targets: [0], seconds: 6, cents: 25, onPass: done }), fix: ["L07 long tones", "lessons/L07-long-tones-tuner-and-drone.md"] },
    { name: "S R G R S, clean", make: done => phraseCheck({ phrase: [0, 2, 4, 2, 0], reps: 1, onPass: done }), fix: ["L09 fingering and clean changes", "lessons/L09-fingering-sa-re-ga.md"] },
    { name: "Play back a phrase by ear", make: done => echoGame({ level: "srg", test: { rounds: 3, pass: 2, len: 3 }, onPass: done }), fix: ["L05 pitch and Sa", "lessons/L05-what-is-music-pitch-sa-sargam.md"] },
  ];
  const results = CHECKS.map(() => null);
  let i = 0, widget = null;
  const host = h("div"), title = h("h3"), out = h("div", { class: "stack" });
  const skip = h("button", { type: "button", class: "btn" }, "I cannot do this yet");
  const show = () => {
    if (widget) { widget.destroy(); widget = null; }
    if (i >= CHECKS.length) {
      host.replaceChildren(); title.textContent = "What to practise"; skip.hidden = true;
      const weak = CHECKS.filter((c, k) => !results[k]);
      out.replaceChildren(weak.length ? h("p", null, "These basics need work before the milestone can pass. Spend 5-7 practice days on them:") : h("p", null, "Your basics are fine: the trouble is in this milestone's own items. Practise the remedies below for the items that failed, then retest only those."),
        weak.length ? h("ul", null, weak.map(c => h("li", null, c.name + ": ", h("a", { href: "#/read/" + c.fix[1] }, c.fix[0])))) : null);
      return;
    }
    const c = CHECKS[i];
    title.textContent = "Check " + (i + 1) + " of " + CHECKS.length + ": " + c.name;
    widget = c.make(() => { results[i] = true; i++; setTimeout(show, 900); });
    host.replaceChildren(widget.el);
  };
  skip.addEventListener("click", () => { results[i] = false; i++; show(); });
  cleanups.push(() => widget && widget.destroy());
  const start = h("button", { type: "button", class: "btn primary" }, "Find out what is holding me back");
  const body = h("div", { class: "stack", hidden: true }, title, host, h("div", { class: "row" }, skip), out);
  start.addEventListener("click", () => { start.hidden = true; body.hidden = false; show(); });
  return h("section", { class: "card stuckcard" }, h("h2", null, "Stuck on this milestone?"),
    h("p", { class: "small muted" }, "Two tries have not passed yet. Three short checks (about 3 minutes) show which basic skill to work on."), start, body);
}

// Your sound then and now (W37): the Day 0 time capsule (lessons/m0.js records it with day 0) next to
// a recording made today, when both are kept in this browser. Empty until both are found.
function thenAndNow(cleanups) {
  const box = h("section", { class: "card ms-thennow", hidden: true });
  const urls = [];
  cleanups.push(() => urls.forEach(u => URL.revokeObjectURL(u)));
  listRecordings().then(all => {
    const audio = (all || []).filter(r => r && r.blob && r.kind !== "video");
    const day0 = audio.filter(r => r.day === 0);
    const capsule = day0.find(r => /capsule/i.test(r.label || "")) || day0[day0.length - 1];
    const now = audio.find(r => r.date === today() && r !== capsule);
    if (!capsule || !now) return;
    const clip = (label, r) => { const u = URL.createObjectURL(r.blob); urls.push(u); return h("div", { class: "stack tight" }, h("b", null, label), h("audio", { controls: true, preload: "none", src: u, "aria-label": label })); };
    box.append(h("h2", null, "Your sound then and now"), h("div", { class: "ms-pair" }, clip("Day 0", capsule), clip("Today", now)));
    box.hidden = false;
  }).catch(() => { /* recordings unavailable: nothing to compare */ });
  return box;
}

// "How to take it" from the milestone's own words: the prose around its checklist (the conditions
// in a heading, an intro, "What success sounds like"), without the tables and the remedies.
export function ownText(md) {
  const lines = md.split("\n"), out = [];
  let pendingHead = null;
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^##\s+If you did not pass/i.test(l)) break;
    if (/^\s*\|/.test(l) || /^\[Projects\]/.test(l)) continue;
    const hd = /^#{2,6}\s+(.*)$/.exec(l);
    if (hd) {
      const m = /^(.*?)\s*\((.+)\)\s*$/.exec(hd[1]);
      // "Test (record everything; drone on C)": the condition is the useful part.
      if (m) { pendingHead = null; out.push("", "**" + m[1].trim() + ":** " + m[2].trim(), ""); }
      else pendingHead = hd[1].trim();
      continue;
    }
    if (!l.trim()) { out.push(""); continue; }
    // A plain heading is kept only when prose follows it.
    if (pendingHead) { out.push("", "**" + pendingHead + "**", ""); pendingHead = null; }
    out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// The item numbers a remedy row covers: "1, 2", "4, 5, 6", "1 (`.P`)", "3 (Expression)".
export function remedyFor(md, num) {
  const sec = sectionOf(md, /if you did not pass/i);
  if (!sec || !num) return null;
  for (const t of tablesOf(sec)) {
    const first = t.head[0], last = t.head[t.head.length - 1];
    for (const r of t.rows) {
      const nums = (String(r[first] || "").split("(")[0].match(/\d+/g) || []).map(Number);
      if (nums.includes(Number(num))) return r[last] || "";
    }
  }
  return null;
}

// Where to practise a failed item (W38): the Skills tool that trains what the microphone checks,
// else the first lesson (or other course page) its remedy names, else the rehearsal day.
export function practiseLink(it, md, path, day) {
  const spec = micSpec(it.label, it.criterion);
  if (spec && spec.kind === "hold") return { href: "#/skills/tone/longtones", label: "Long tones" };
  if (spec && spec.kind === "ear") return { href: "#/skills/ear/quiz", label: "Ear quiz" };
  if (spec && spec.kind === "echo") return { href: "#/skills/ear/playback", label: "Play it back" };
  const rem = remedyFor(md, it.num);
  if (rem) {
    const links = [...rem.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)].map(m => ({ label: m[1], href: routeFor(path, m[2]) })).filter(l => /^#\//.test(l.href));
    const pick = links.find(l => /#\/read\/lessons\//.test(l.href)) || links[0];
    if (pick) {
      const ts = /#\/read\/troubleshooting\/(TS-\d\d)/.exec(pick.href);
      return ts ? { href: "#/skills/fix/" + ts[1], label: pick.label } : pick;
    }
  }
  return { href: "#/session/" + day, label: "Rehearse first" };
}

const LESSONS_KEY = "bansuri.lessons";
const runId = id => "ms-" + id;
function clearRun(id) { const all = store(LESSONS_KEY, {}); if (all[runId(id)]) { delete all[runId(id)]; storeSet(LESSONS_KEY, all); } }

// One check of the test, as a step of the player (W36): the item large, its pass criterion, the
// microphone check when the app can judge it, and the learner's own verdict (the mic sets it).
function checkStep(it, info, unlocked) {
  return {
    id: "check" + it.key, kind: "custom",
    make(s, api) {
      const items = api.data.items || (api.data.items = {});
      let widget = null;
      const yes = h("button", { type: "button", class: "lesson-chip", "aria-pressed": "false" }, icon("check"), " Passed");
      const no = h("button", { type: "button", class: "lesson-chip", "aria-pressed": "false" }, "Not yet");
      const setVerdict = v => {
        items[it.key] = v; api.save();
        yes.classList.toggle("picked", v === true); yes.setAttribute("aria-pressed", String(v === true));
        no.classList.toggle("picked", v === false); no.setAttribute("aria-pressed", String(v === false));
        api.ready(true);
      };
      yes.addEventListener("click", () => setVerdict(true));
      no.addEventListener("click", () => setVerdict(false));
      const spec = unlocked ? micSpec(it.label, it.criterion) : null;
      if (spec) {
        const onPass = () => { setVerdict(true); toast("Item " + (it.num || "") + " passed."); };
        widget = spec.kind === "hold" ? holdMeter({ targets: spec.targets, seconds: spec.seconds, cents: spec.cents, onPass })
          : spec.kind === "ear" ? noteQuiz({ notes: spec.notes, count: spec.count, pass: spec.pass, onPass })
          : spec.kind === "echo" ? echoGame({ level: "bil", test: { rounds: spec.rounds, pass: spec.pass, len: spec.len }, onPass })
          : phraseCheck({ phrase: spec.phrase, reps: spec.reps, onPass });
      }
      const el = h("div", { class: "stack ms-check" },
        h("h2", { class: "lesson-title ms-checktitle", tabindex: "-1" }, it.num ? h("span", { class: "ms-checknum" }, it.num + ". ") : null, renderInline(it.label, info.path)),
        h("div", { class: "row" }, h("span", { class: "chip " + (it.required ? "info" : "mutedc") }, it.required ? "Required" : (it.requiredText || "Optional"))),
        it.criterion ? h("p", { class: "ms-crit" }, h("span", { class: "eyebrow" }, "To pass"), h("span", null, renderInline(it.criterion, info.path))) : null,
        widget ? h("div", { class: "micpanel" }, widget.el) : h("p", { class: "small muted" }, "Play it and record it; then say how it went."),
        h("fieldset", { class: "lesson-group ms-verdict" }, h("legend", null, "Did it pass?"), h("div", { class: "lesson-chips" }, yes, no)));
      makePlayable(el);
      if (items[it.key] !== undefined) setVerdict(items[it.key]);
      return { el, destroy() { if (widget) widget.destroy(); } };
    },
  };
}

export async function render(main, { params }) {
  const id = params[0];
  const info = milestoneInfo(id);
  const page = h("div", { class: "page mspage" });
  main.append(page);
  if (!info) { page.append(h("p", null, "Unknown milestone.")); return; }
  const md = await fetchDoc(info.path);
  const items = checklist(md);
  const state = milestoneState(id);
  const unlocked = info.day <= current();
  const cleanups = [];
  let player = null;

  // The top (W35): back to the course, the milestone's number and title, where it stands.
  const chip = h("span", { class: "chip " + (state.status === "passed" ? "good" : state.status === "failed" ? "warn" : "mutedc") }, state.status === "passed" ? "Passed " + fmtDate(state.passedOn) : state.status === "failed" ? "Not passed yet" : "Not taken");
  page.append(backHead("#/course/milestones", "Course", info.title,
    h("div", { class: "row ms-sub" }, h("span", { class: "eyebrow" }, "Milestone " + id + " - Day " + info.day), chip, h("a", { href: "#/read/" + info.path }, "Read the full test"))));

  if (!unlocked) page.append(h("div", { class: "notice info" }, "This milestone is ahead of you (Day " + info.day + "). You can read it now; the test opens when you reach that day."));
  // Two tries without passing: a three-minute check finds which basic skill is holding things back.
  if (state.status !== "passed" && state.attempts.filter(x => !x.passed).length >= 2) page.append(stuckCheck(cleanups));
  // Passed: your sound then and now.
  if (state.status === "passed") page.append(thenAndNow(cleanups));

  // The cover: what is checked (with its count), how to take it, then the two ways on.
  const cover = h("div", { class: "stack ms-cover" });
  const required = items.filter(it => it.required).length;
  cover.append(h("section", { class: "card" },
    h("div", { class: "row between" }, h("h2", null, "What is checked"), h("span", { class: "chip mutedc", "aria-label": items.length + " checks" }, String(items.length))),
    items.length ? h("ul", { class: "ms-checked" }, items.map(it => h("li", null,
      h("span", { class: "stack", style: { gap: "2px" } }, h("span", null, it.num ? h("b", null, it.num + ". ") : null, renderInline(it.label, info.path)), it.criterion ? h("span", { class: "small muted" }, renderInline(it.criterion, info.path)) : null),
      h("span", { class: "chip " + (it.required ? "info" : "mutedc") }, it.required ? "Required" : (it.requiredText || "Optional"))))) : h("p", null, "No checklist table was found in this milestone file."),
    required && required < items.length ? h("p", { class: "small muted" }, "Every required check must pass; the others are a bonus.") : null));

  // How to take it: the test day's own steps (plan.json, in plain words and in Hindi when chosen),
  // the milestone file's own conditions, then the rubric it is scored with.
  const day = getDay(info.day);
  const steps = day && day.kind === "milestone" ? (day.blocks || []).filter(b => b.text) : [];
  const how = h("ol", { class: "stack ms-how" });
  if (steps.length) {
    for (const b of steps) {
      const li = h("li", null, h("b", null, stepMeta(b).name, ". "), h("span", null, b.text));
      how.append(li);
      plainText(b).then(t => { if (t) li.lastChild.textContent = t; });
    }
  } else {
    how.append(h("li", null, "Warm up for at most 10 minutes."),
      h("li", null, "Record each item in one take (two attempts allowed; the better one counts). No editing."),
      h("li", null, "Wait at least a day, then listen back and score honestly with the rubric."),
      h("li", null, "Every item marked Required must pass. If not, practise the remedies below and retest only the failed items."));
  }
  const own = ownText(md);
  let ownNode = null;
  if (own) { ownNode = renderMarkdown(own, info.path).node; ownNode.classList.add("reader", "ms-own"); }
  cover.append(h("section", { class: "card" }, h("h2", null, "How to take it"), how, ownNode,
    h("a", { class: "ms-rowlink", href: "#/read/lessons/L08-recording-and-self-assessment.md#5-the-standard-rubric-canonical-for-all-milestones" }, h("span", null, "Rubric (1-4, from L08)"), h("span", { class: "chev", "aria-hidden": "true" }, ">")),
    h("p", { class: "small muted" }, "From ", h("a", { href: "#/read/projects/README.md" }, "how every milestone works"), ". From M3 on, a second listener (ideally a teacher) helps: trust the lower score.")));

  // Take the test (in the player, one check per step) or rehearse with the day's session.
  const prior = lessonRecord(runId(id));
  const midway = unlocked && prior && !prior.done && prior.at > 0;
  const takeBtn = h("button", { type: "button", class: "btn primary big" }, midway ? "Carry on the test" : state.status === "failed" ? "Retake the test" : state.status === "passed" ? "Take it again" : "Take the test");
  takeBtn.addEventListener("click", () => { if (!midway) clearRun(id); play(); });
  const restartBtn = midway ? h("button", { type: "button", class: "btn ghost" }, "Start over") : null;
  if (restartBtn) restartBtn.addEventListener("click", () => { clearRun(id); play(); });
  cover.append(h("div", { class: "row ms-ways" },
    unlocked ? takeBtn : h("p", { class: "small muted" }, "Opens on Day " + info.day + "."),
    restartBtn,
    h("a", { class: "btn", href: "#/session/" + info.day }, "Rehearse first")));

  // Previous attempts: one row, opening the list (date, rubric, result).
  let history = null;
  if (state.attempts.length) {
    history = h("details", { class: "card ms-attempts" },
      h("summary", { class: "ms-rowlink" }, h("span", null, "Previous attempts: " + state.attempts.length), h("span", { class: "chev", "aria-hidden": "true" }, ">")),
      h("div", { class: "stack" }, state.attempts.slice().reverse().map(a => h("div", { class: "row between" },
        h("span", null, fmtDate(a.date)),
        h("span", { class: "small mono" }, RUBRIC.map(([k]) => k + (a.rubric && a.rubric[k] ? a.rubric[k] : "-")).join(" ")),
        h("span", { class: "chip " + (a.passed ? "good" : "warn") }, a.passed ? "Passed" : "Not yet")))));
    cover.append(history);
  }
  page.append(cover);
  const coverParts = [...page.children];

  // The test (W36): the checks one per step in the full-focus player, then the recording, then the
  // score. The attempt is saved in the same form as always ({ items, rubric, notes }).
  function testLesson() {
    const n = items.length;
    const recordStep = {
      id: "record", kind: "custom", always: true, title: "Record the test",
      make() {
        const rw = recordWidget({ day: info.day, label: id + " test" });
        return { el: h("div", { class: "stack" }, h("p", { class: "small muted" }, "Recordings are saved in your journal. Listen back before you score."), rw), destroy() { if (rw.cleanup) rw.cleanup(); } };
      },
    };
    const scoreStep = {
      id: "score", kind: "custom", always: true, title: "Score it", next: "Save this attempt",
      make(s, api) {
        const rubric = api.data.rubric || (api.data.rubric = {});
        const rub = h("div", { class: "rubric" }, RUBRIC.map(([k, label]) => {
          const seg = h("div", { class: "seg", role: "group", "aria-label": label });
          for (let v = 1; v <= 4; v++) {
            const b = h("button", { type: "button", "aria-pressed": String(rubric[k] === v) }, String(v));
            b.addEventListener("click", () => { rubric[k] = v; api.save(); seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); });
            seg.append(b);
          }
          return h("div", { class: "rrow" }, h("span", null, label), seg);
        }));
        const notes = h("textarea", { class: "input", id: "ms-notes", placeholder: "What you noticed when listening back. Second listener's comments." });
        notes.value = api.data.notes || "";
        notes.addEventListener("input", () => { api.data.notes = notes.value; api.save(); });
        return { el: h("div", { class: "stack" }, h("h3", null, "Rubric (1-4, from L08)"), rub, h("label", { class: "field", for: "ms-notes" }, "Your notes", notes)) };
      },
    };
    return {
      id: runId(id), title: id + " " + info.title,
      chapters: [{ title: "Checks", steps: items.map(it => checkStep(it, info, unlocked)) }, { title: "Record the test", steps: [recordStep] }, { title: "Score it", steps: [scoreStep] }],
      countText: at => at < n ? id + ": check " + (at + 1) + " of " + n : id + ": " + (at === n ? "recording" : "your score"),
      finish(data) {
        const got = data.items || {}, passedItems = {};
        let allRequired = true;
        for (const it of items) { passedItems[it.key] = got[it.key] === true; if (it.required && !passedItems[it.key]) allRequired = false; }
        const passed = items.length > 0 && allRequired;
        const res = recordAttempt(id, { items: passedItems, rubric: Object.assign({}, data.rubric || {}), notes: String(data.notes || "").trim() }, passed);
        return { passed, passedItems, advanced: res.advanced };
      },
    };
  }

  function showCover() {
    if (player) { player.destroy(); player = null; }
    page.replaceChildren(...coverParts);
    window.scrollTo(0, 0);
  }
  function play() {
    if (player) player.destroy();
    player = lessonPlayer(testLesson(), { onExit: showCover, onFinished: res => showResult(res) });
    player.el.classList.add("ms-run");
    page.replaceChildren(player.el);
  }

  // The result: passed (W37) or not yet (W38), as the end of the run.
  function showResult(res) {
    if (player) { player.destroy(); player = null; }
    const ok = res.passedItems || {};
    const box = h("section", { class: "card ms-result" });
    if (res.passed) {
      const next = getDay(info.day + 1), here = getDay(info.day);
      const newPhase = next && here && next.phase !== here.phase;
      box.classList.add("ms-passed");
      box.append(h("div", { class: "ms-badge" }, emblem(ICON_PATHS.star, true), h("b", null, id)),
        h("h1", null, "Milestone " + id + " passed"),
        h("div", { class: "ms-allchecks" }, h("span", null, "All " + items.length + " checks"), h("span", { class: "ms-ticks", "aria-hidden": "true" }, items.map(it => h("i", { class: ok[it.key] ? "ok" : "" }, ok[it.key] ? icon("check") : "")))),
        h("p", { class: "muted" }, "Well earned. " + (res.advanced ? "The next day is unlocked." : "")),
        thenAndNow(cleanups),
        h("a", { class: "btn primary big", href: "#/today" }, newPhase ? "On to Phase " + next.phase : "Go to today"));
      celebrate("Milestone " + id + " passed!");
    } else {
      // Not yet (W38): what passed first, then what is for next time, each with where to practise it.
      const passedNow = items.filter(it => ok[it.key]);
      const failed = items.filter(it => it.required && !ok[it.key]);
      const remedy = sectionOf(md, /if you did not pass/i);
      const row = (it, good) => {
        const link = good ? null : practiseLink(it, md, info.path, info.day);
        return h("li", { class: good ? "ok" : "later" }, h("span", { class: "lesson-tick", "aria-hidden": "true" }, good ? icon("check") : "!"),
          h("span", { class: "stack tight" }, h("span", null, it.num ? it.num + ". " : "", renderInline(it.label, info.path)),
            link ? h("a", { class: "ms-practise", href: link.href }, h("span", { class: "chev", "aria-hidden": "true" }, ">"), " Practise this", h("span", { class: "small muted" }, " (", link.label, ")")) : null));
      };
      const stuckHost = h("div");
      const stuckBtn = h("button", { type: "button", class: "ms-rowlink linkrow" }, h("span", null, "Stuck on this milestone?"), h("span", { class: "chev", "aria-hidden": "true" }, ">"));
      stuckBtn.addEventListener("click", () => { stuckBtn.hidden = true; stuckHost.append(stuckCheck(cleanups)); });
      box.append(h("h1", null, "Milestone " + id + ": not yet"),
        h("div", { class: "notice ms-notyet" }, "Failing is information, not a judgement."),
        passedNow.length ? h("div", { class: "stack tight lesson-well" }, h("span", { class: "eyebrow" }, "Passed " + passedNow.length + " of " + items.length), h("ul", { class: "lesson-done" }, passedNow.map(it => row(it, true)))) : null,
        h("div", { class: "stack tight lesson-later" }, h("span", { class: "eyebrow" }, "For next time"), h("ul", { class: "lesson-done" }, failed.map(it => row(it, false))),
          h("p", { class: "small" }, "Practise the remedies below for 5-10 practice days, then retest only those items.")));
      if (remedy) { const r = renderMarkdown(remedy, info.path); r.node.classList.add("reader"); const rh = r.node.querySelector("h2"); if (rh) rh.remove(); box.append(h("details", { class: "ms-remedy" }, h("summary", null, "If you did not pass"), r.node)); }
      box.append(stuckBtn, stuckHost, h("a", { class: "btn primary big", href: "#/course" }, "Back to the course"));
    }
    page.replaceChildren(box);
    window.scrollTo(0, 0);
  }

  return () => { if (player) player.destroy(); cleanups.forEach(f => f()); };
}
