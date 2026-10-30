// Milestone test (#/milestone/<id>): checklist parsed from the milestone file, rubric, record, pass/fail.
import { h, fmtDate, toast } from "../util.js";
import { milestoneInfo, milestoneState, recordAttempt, current } from "../course.js";
import { fetchDoc, tablesOf, renderInline, renderMarkdown, sectionOf } from "../content.js";
import { recordWidget } from "../recorder.js";
import { celebrate } from "../fun.js";
import { holdMeter, phraseCheck, noteQuiz, echoGame } from "../core/live.js";
import { parseNotation } from "../core/notation.js";

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

export async function render(main, { params }) {
  const id = params[0];
  const info = milestoneInfo(id);
  const page = h("div", { class: "page" });
  main.append(page);
  if (!info) { page.append(h("p", null, "Unknown milestone.")); return; }
  const md = await fetchDoc(info.path);
  const items = checklist(md);
  const state = milestoneState(id);
  const unlocked = info.day <= current();
  const cleanups = [];

  const chip = h("span", { class: "chip " + (state.status === "passed" ? "good" : state.status === "failed" ? "warn" : "mutedc") }, state.status === "passed" ? "Passed " + fmtDate(state.passedOn) : state.status === "failed" ? "Not passed yet" : "Not taken");
  page.append(h("section", { class: "hero" },
    h("span", { class: "eyebrow" }, "Milestone " + id + " - Day " + info.day),
    h("h1", null, info.title),
    h("div", { class: "row" }, chip, h("span", { class: "small muted" }, state.attempts.length + " attempt" + (state.attempts.length === 1 ? "" : "s")), h("a", { href: "#/read/" + info.path }, "Read the full test"))));

  if (!unlocked) page.append(h("div", { class: "notice info" }, "This milestone is ahead of you (Day " + info.day + "). You can read it now; the test opens when you reach that day."));

  page.append(h("section", { class: "card" }, h("h2", null, "How to take it"),
    h("ol", { class: "stack", style: { paddingLeft: "1.2em", margin: "0" } },
      h("li", null, "Warm up for at most 10 minutes."),
      h("li", null, "Record each item in one take (two attempts allowed; the better one counts). No editing."),
      h("li", null, "Wait at least a day, then listen back and score honestly with the rubric."),
      h("li", null, "Every item marked Required must pass. If not, practise the remedies below and retest only the failed items.")),
    h("p", { class: "small muted" }, "From ", h("a", { href: "#/read/projects/README.md" }, "how every milestone works"), ". From M3 on, a second listener (ideally a teacher) helps: trust the lower score.")));

  // Recording for the test.
  const rw = recordWidget({ day: info.day, label: id + " test" });
  cleanups.push(() => rw.cleanup && rw.cleanup());
  page.append(h("section", { class: "card" }, h("h2", null, "Record the test"), h("p", { class: "small muted" }, "Recordings are saved in your journal. Listen back before you score."), rw));

  // Checklist.
  const checks = {};
  const list = h("div", null, items.map(it => {
    const cb = h("input", { type: "checkbox", "aria-label": "Passed: " + it.label });
    checks[it.key] = cb;
    const spec = unlocked ? micSpec(it.label, it.criterion) : null;
    let panel = null, widget = null, micBtn = null;
    if (spec) {
      panel = h("div", { class: "micpanel", hidden: true });
      micBtn = h("button", { type: "button", class: "btn small" }, "Check with mic");
      micBtn.addEventListener("click", e => {
        e.preventDefault();
        if (!panel.hidden) { panel.hidden = true; if (widget) { widget.destroy(); widget = null; } micBtn.textContent = "Check with mic"; return; }
        const onPass = () => { cb.checked = true; micBtn.textContent = "Passed by mic"; micBtn.classList.add("passed"); toast("Item " + (it.num || "") + " passed."); };
        widget = spec.kind === "hold" ? holdMeter({ targets: spec.targets, seconds: spec.seconds, cents: spec.cents, onPass })
          : spec.kind === "ear" ? noteQuiz({ notes: spec.notes, count: spec.count, pass: spec.pass, onPass })
          : spec.kind === "echo" ? echoGame({ level: "bil", test: { rounds: spec.rounds, pass: spec.pass, len: spec.len }, onPass })
          : phraseCheck({ phrase: spec.phrase, reps: spec.reps, onPass });
        panel.replaceChildren(widget.el); panel.hidden = false; micBtn.textContent = "Close the check";
        cleanups.push(() => widget && widget.destroy());
      });
    }
    return h("div", { class: "mrow" }, h("label", { class: "mitem" }, cb,
      h("div", { class: "stack", style: { gap: "2px" } }, h("span", null, it.num ? h("b", null, it.num + ". ") : null, renderInline(it.label, info.path)), it.criterion ? h("span", { class: "small muted" }, renderInline(it.criterion, info.path)) : null, micBtn ? h("div", null, micBtn) : null),
      h("span", { class: "chip " + (it.required ? "info" : "mutedc") }, it.required ? "Required" : (it.requiredText || "Optional"))), panel);
  }));
  // Rubric.
  const rubric = {};
  const rub = h("div", { class: "rubric" }, RUBRIC.map(([k, label]) => {
    const seg = h("div", { class: "seg", role: "group", "aria-label": label });
    for (let v = 1; v <= 4; v++) {
      const b = h("button", { type: "button", "aria-pressed": "false" }, String(v));
      b.addEventListener("click", () => { rubric[k] = v; seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); });
      seg.append(b);
    }
    return h("div", { class: "rrow" }, h("span", null, label), seg);
  }));
  const notes = h("textarea", { class: "input", id: "ms-notes", placeholder: "What you noticed when listening back. Second listener's comments." });
  const submit = h("button", { type: "button", class: "btn primary big" }, "Save this attempt");
  submit.disabled = !unlocked;
  const result = h("div", { class: "stack" });

  submit.addEventListener("click", async () => {
    const passedItems = {};
    let allRequired = true;
    for (const it of items) { passedItems[it.key] = checks[it.key].checked; if (it.required && !checks[it.key].checked) allRequired = false; }
    const passed = items.length > 0 && allRequired;
    const res = recordAttempt(id, { items: passedItems, rubric: Object.assign({}, rubric), notes: notes.value.trim() }, passed);
    result.replaceChildren();
    if (passed) {
      result.append(h("div", { class: "notice good" }, h("b", null, "Passed. "), "Well earned. " + (res.advanced ? "The next day is unlocked." : "")), h("a", { class: "btn primary", href: "#/today" }, "Go to today"));
      celebrate("Milestone " + id + " passed!");
    } else {
      const failed = items.filter(it => it.required && !checks[it.key].checked);
      const remedy = sectionOf(md, /if you did not pass/i);
      result.append(h("div", { class: "notice" }, h("b", null, "Not passed yet. "), "Failing is information, not a judgement. Required items still to pass: " + failed.map(f => f.num || f.label).join(", ") + ". Practise the remedies below for 5-10 practice days, then retest only those items."));
      if (remedy) { const r = renderMarkdown(remedy, info.path); r.node.classList.add("reader"); result.append(h("div", { class: "card" }, r.node)); }
    }
    result.scrollIntoView({ behavior: "smooth" });
  });

  page.append(h("section", { class: "card" }, h("h2", null, "Checklist"), items.length ? list : h("p", null, "No checklist table was found in this milestone file."),
    h("h3", null, "Rubric (1-4, from L08)"), rub,
    h("label", { class: "field", for: "ms-notes" }, "Notes", notes),
    h("div", { class: "row" }, submit, unlocked ? null : h("span", { class: "small muted" }, "Opens on Day " + info.day + ".")),
    result));

  // History.
  if (state.attempts.length) {
    page.append(h("section", { class: "card" }, h("h2", null, "Previous attempts"),
      h("div", { class: "stack" }, state.attempts.slice().reverse().map(a => h("div", { class: "row between" },
        h("span", null, fmtDate(a.date)),
        h("span", { class: "small mono" }, RUBRIC.map(([k]) => k + (a.rubric && a.rubric[k] ? a.rubric[k] : "-")).join(" ")),
        h("span", { class: "chip " + (a.passed ? "good" : "warn") }, a.passed ? "Passed" : "Not yet"))))));
  }
  return () => cleanups.forEach(f => f());
}
