// Today (#/today) and any single day (#/day/<n>).
import { h, fmtDate, today } from "../util.js";
import { getState, update } from "../state.js";
import { getDay, current, dayState, phaseOf, lessonInfo, milestoneInfo, milestoneState, lastIndex, streaks } from "../course.js";
import { holdGrowth } from "../livestats.js";
import { listRecordings } from "../recorder.js";
import { nameOf } from "../core/theory.js";
import { t } from "../core/i18n.js";
import { placementTest, startAtPhase } from "../placement.js";
import { renderInline } from "../content.js";
import { questState } from "../fun.js";
import { levelBar } from "../levelui.js";
import { makePlayable } from "../playable.js";
import { icon } from "../util.js";
import { getSettings, setSettings } from "../core/settings.js";
import { speak, sayButton } from "../voice.js";
import { stepMeta, plainText } from "../steps.js";
import { plainCodes } from "../codes.js";
import { lessonForDay } from "../lessons/index.js";
import { oneDay } from "../lessons/oneday.js";
import { practiceLesson, plainBlock } from "../lessons/practice.js";
import { lessonRecord, flatSteps } from "../lesson/player.js";
import { adaptiveCard, dayHref, fixToday, messageToast, mondayCard, progressCard, realBansuriCard, reviewsCard, teacherTaskCard, unitStrip } from "./today-cards.js";

// How the learner likes to learn, in pictures, so it works without reading English. Each choice can
// be changed later in Settings. then(): after a choice that does not reload the app.
function howCard(then) {
  const tile = (ic, label, sub, onClick) => h("button", { type: "button", class: "howtile", onclick: onClick }, icon(ic), h("b", null, label), sub ? h("span", { class: "small" }, sub) : null);
  const done = patch => { setSettings(patch); update(st => { st.prefs.howChosen = true; }); };
  const next = () => (then ? then() : location.reload());
  return h("section", { class: "card howcard", "aria-label": "How do you like to learn?" },
    h("div", { class: "row between" }, h("h2", null, "How do you like to learn?"), sayButton(["welcome"], "Hear this")),
    h("div", { class: "howtiles" },
      tile("read", "I like to read", "Lessons and steps as text", () => { done({ talk: false }); next(); }),
      tile("speaker", "Talk to me", "The app says each step and how each note went", () => { done({ talk: true }); speak("welcome"); next(); }),
      tile("hand", "Simple mode", "Three big buttons; the app talks you through everything", () => done({ talk: true, simple: true, notesAs: "pictures" }))),
    h("p", { class: "small muted" }, "You can change this in Settings."));
}

// First run (redesign F1): one choice per screen. The language, then how you like to learn, then
// whether you already play; then Day 0, with Start Day 0 as the one big button. Each answer is
// remembered, so a reload (a new language reloads the app) carries on at the next screen.
function firstRunFlow(day, cleanups) {
  const host = h("div", { class: "firstflow" });
  let placer = null;
  const mark = key => update(st => { st.prefs[key] = true; });
  const draw = () => {
    if (placer) { placer.destroy(); placer = null; }
    const p = getState().prefs;
    host.replaceChildren(...(!p.langChosen ? [langStep()] : !p.howChosen ? [howCard(draw)] : !p.playAsked ? [playStep()] : [firstRun(day), realBansuriCard(), welcome()]));
    window.scrollTo(0, 0);
  };
  // The language first, in both scripts.
  const langStep = () => {
    const pick = lang => { mark("langChosen"); if (getSettings().lang === lang) draw(); else setSettings(lang === "hi" ? { lang, deva: true } : { lang }); };
    return h("section", { class: "hero firstrun" },
      h("h1", null, "Learn the bansuri, one day at a time"),
      h("p", { class: "muted" }, "A short guided session each day. The app listens to your flute and tells you how it went."),
      h("div", { class: "firstchoice", translate: "no" },
        h("button", { type: "button", class: "btn big", lang: "en", onclick: () => pick("en") }, "English"),
        h("button", { type: "button", class: "btn big", lang: "hi", onclick: () => pick("hi") }, "हिन्दी")));
  };
  // Already play? The playing test places the learner; a beginner goes on to Day 0.
  const playStep = () => {
    const testHost = h("div", { class: "toolhost", hidden: true });
    const choices = h("div", { class: "firstchoice" },
      h("button", { type: "button", class: "btn big", onclick: () => { mark("playAsked"); draw(); } }, "No, I am new to the bansuri"),
      h("button", { type: "button", class: "btn big", onclick: () => {
        choices.hidden = true; testHost.hidden = false;
        placer = placementTest({ onResult: phase => {
          testHost.append(h("div", { class: "row" },
            phase > 0 ? h("button", { type: "button", class: "btn primary big", onclick: () => { mark("playAsked"); if (startAtPhase(phase) !== null) location.reload(); } }, "Start from this phase") : null,
            h("button", { type: "button", class: phase > 0 ? "btn" : "btn primary big", onclick: () => { mark("playAsked"); draw(); } }, "Start at Day 0")));
        } });
        testHost.replaceChildren(placer.el);
      } }, "Yes: take the playing test"));
    return h("section", { class: "card firstplay" }, h("h2", null, "Already play?"),
      h("p", { class: "muted" }, "If you can already do what earlier phases teach, start later. The playing test takes about five minutes: play a few items into the microphone and it recommends a phase."),
      choices, testHost);
  };
  cleanups.push(() => { if (placer) placer.destroy(); });
  draw();
  return host;
}

// The interactive lesson of a day, while it is not finished (Day 0: "Meet your flute").
function lessonDue(n) {
  const l = lessonForDay(n);
  if (!l) return null;
  const r = lessonRecord(l.id);
  return r && r.done ? null : l;
}

// Simple mode: three big choices and today's quests, no reading needed.
function simpleToday(page, cur, day) {
  const big = (href, ic, label, ref, cls) => h("a", { class: "simpletile " + (cls || ""), href, onclick: () => speak(ref) }, icon(ic), h("b", null, label));
  page.append(
    h("section", { class: "hero simplehero" }, h("span", { class: "eyebrow" }, "Day " + cur), h("h1", null, day && day.title ? day.title : "Today"), sayButton(["welcome"], "Listen")),
    h("div", { class: "simpletiles" },
      big(lessonDue(cur) ? "#/lesson/" + lessonDue(cur).id : day && day.kind === "milestone" ? "#/milestone/" + day.milestone : practiceLesson("p" + cur) ? "#/lesson/p" + cur : "#/session/" + cur, "play", "Start practice", "session_start", "primary"),
      big("#/play", "star", "Play a game", "steer_intro"),
      big("#/listen", "listen", "Listen", "listen_intro"),
      big("#/quick", "today", "5 minutes", "quick_intro")));
  page.append(h("a", { class: "card levelcard", href: "#/progress#level" }, levelBar()));
  const qs = questState();
  page.append(h("section", { class: "card" }, h("ul", { class: "questlist" }, qs.list.map(q => h("li", { class: q.done ? "done" : "" }, h("span", { class: "qmark", "aria-hidden": "true" }, q.done ? "✓" : ""), h("span", null, q.text))))));
}

const KIND_LABEL = { setup: "Setup day", review: "Review day", milestone: "Milestone", practice: "Practice day" };

// The session at a glance: one row per step (icon, name, minutes), with the instruction in plain
// words and the readings one tap away.
export function blockLines(day) {
  const list = h("div", { class: "blocklist" }, day.blocks.map(b => {
    const m = stepMeta(b), text = h("p", { class: "small", translate: "no" }, renderInline(b.text || "", "phases/README.md"));
    plainText(b).then(t => { if (t) text.replaceWith(h("p", { class: "small" }, t)); });
    return h("details", { class: "blockline" },
      h("summary", null, h("span", { class: "stepicon " + b.id, "aria-hidden": "true" }, icon(m.icon)), h("b", null, b.label || m.name), h("span", { class: "small muted" }, b.minutes ? b.minutes + " min" : "")),
      h("div", { class: "blockbody" }, text,
        b.read && b.read.length ? h("div", { class: "linklist" }, b.read.map(r => h("a", { href: "#/read/" + r.path + (r.anchor ? "#" + r.anchor : "") }, plainCodes(r.label)))) : null));
  }));
  makePlayable(list);
  return list;
}

// The first screen a new learner sees: what this is, one big button, and the language.
function firstRun(day) {
  return h("section", { class: "hero firstrun" },
    h("h1", null, "Learn the bansuri, one day at a time"),
    h("p", { class: "muted" }, "A short guided session each day. The app listens to your flute and tells you how it went."),
    h("a", { class: "btn primary big", href: lessonForDay(0) ? "#/lesson/" + lessonForDay(0).id : "#/session/0" }, "Start Day 0"),
    h("p", { class: "small muted" }, "About " + (lessonForDay(0) ? oneDay(lessonForDay(0), day).minutes : day.minutes || 45) + " minutes: get to know your flute and find its Sa."));
}

function welcome() {
  return h("details", { class: "card" },
    h("summary", null, h("b", null, "How the course works")),
    h("ol", { class: "welcome-steps" },
      h("li", null, h("span", null, h("b", null, "Day 0 sets you up: "), "check your flute, find Sa, and get the tanpura, metronome and tuner ready.")),
      h("li", null, h("span", null, h("b", null, "Each day is a guided session "), "of about 45-60 minutes: warm-up, tone, technique, music, ear training and a short log. Timers and tools are built in.")),
      h("li", null, h("span", null, h("b", null, "Milestones prove progress. "), "You move on by passing practical tests, not by the calendar. A failed test tells you exactly what to practise.")),
      h("li", null, h("span", null, h("b", null, "Your progress stays on this device. "), "Export a backup in Settings to move it to another device."))),
    h("p", { class: "small muted" }, "Built for a 6-hole C natural medium bansuri (Sa = C5). Another flute? Day 0 finds its Sa for you. Already play? ", h("a", { href: "#/settings" }, "Take the playing test"), " to start at the right phase."));
}

// The lesson that carries day n (its interactive lesson, or the practice or review day as a lesson),
// with the day's session folded in as the lesson page plays it; null when the day has none.
function playedLesson(n) {
  const raw = lessonDue(n) || practiceLesson("p" + n);
  return raw && raw.day !== undefined ? oneDay(raw, getDay(raw.day)) : raw;
}

// How far into day n's lesson the learner is, { step, of, lesson }, while it is part way; else null.
function lessonAt(n) {
  const lesson = playedLesson(n), r = lesson && lessonRecord(lesson.id);
  if (!r || r.done || !(r.at > 0)) return null;
  const of = flatSteps(lesson).length;
  return { step: Math.min(r.at + 1, of), of, lesson };
}

// The day finished today, when today's session is done and the next day not yet begun; else null.
function doneDay(cur) {
  const prev = cur > 0 ? dayState(cur - 1) : null;
  if (!prev || !prev.done || prev.date !== today()) return null;
  const next = playedLesson(cur), r = next && lessonRecord(next.id);
  if (Object.values((dayState(cur) || {}).blocks || {}).some(Boolean) || (r && r.at > 0 && !r.done)) return null;
  return cur - 1;
}

// The practice time and place chosen on Day 0 (the "plan" step of the Day 0 lesson), in its words.
function practiceTime() {
  const r = lessonRecord("m0"), d = r && r.data, m0 = lessonForDay(0);
  const step = m0 && flatSteps(m0).find(x => x.id === "plan");
  if (!d || !d.time || !step) return null;
  const word = (key, id) => { const g = step.groups.find(x => x.key === key), o = g && g.options.find(x => x.id === id); return o ? o.text : null; };
  const parts = [word("time", d.time), word("minutes", d.minutes), word("place", d.place)].filter(Boolean);
  return h("p", { class: "small todaytime" }, h("span", { class: "muted" }, "Your time:"), ...parts.flatMap((p, i) => [i ? ", " : " ", h("span", null, p)]));
}

const streakChip = () => {
  const st = streaks();
  return h("a", { class: "streakchip" + (st.current ? " lit" : ""), href: "#/me", title: "Practice streak" }, icon("flame"), h("b", null, String(st.current)), h("span", { class: "small" }, st.current === 1 ? " day" : " days"));
};
const todayLine = (...bits) => h("span", { class: "row resume-top" }, h("span", { class: "eyebrow todayline" }, bits.filter(Boolean).map(b => h("span", null, b))), streakChip());

// Before practice (L1): the kind of day and its minutes, the day, its goal (the day's own pass check,
// or its main block), one button, how much is left, the step list, and the practice time.
function beforeCard(n, day, ds, action) {
  const lesson = playedLesson(n), at = lessonAt(n);
  const total = lesson ? lesson.minutes : day.minutes || day.blocks.reduce((a, b) => a + (b.minutes || 0), 0);
  const ticked = ds.blocks || {};
  const left = at ? Math.max(1, Math.round(total * (at.of - at.step + 1) / at.of))
    : Object.values(ticked).some(Boolean) ? day.blocks.filter(b => !ticked[b.id]).reduce((a, b) => a + (b.minutes || 0), 0) : 0;
  // The goal: the day's pass check (what the cover calls today's goal), or else its main block, in the
  // learner's language, to its first sentence.
  const main = day.blocks.filter(b => b.id !== "W" && b.id !== "R").sort((a, b) => (b.minutes || 0) - (a.minutes || 0))[0];
  const first = s => (String(s).match(/^.*?[.।](?=\s|$)/) || [String(s)])[0];
  const goal = h("span", null, first(day.pass ? t(day.pass) : main ? plainBlock(main.text) : ""));
  if (!day.pass && main) plainText(main).then(x => { if (x) goal.textContent = first(x); });
  const kind = lessonDue(n) ? "Lesson" : KIND_LABEL[day.kind] || "Practice day";
  return h("section", { class: "resume todayhero" },
    h("div", { class: "resume-body" },
      todayLine("Today", kind, total ? total + " min" : null),
      h("h1", { class: "title" }, "Day " + n + ": " + (day.title || (lesson && lesson.title) || "")),
      goal.textContent ? h("p", { class: "todaygoal" }, h("b", null, "Goal:"), " ", goal) : null,
      action,
      h("p", { class: "small muted row todaysub" }, left ? h("span", null, "About " + left + " min left") : null, h("a", { href: "#/session/" + n }, "Step list")),
      practiceTime()));
}

// After practice (L1b): the day done, your longest steady note today, today's recording, the next
// day offered (not pushed), and two smaller things to do.
function doneCard(d, cur, cleanups) {
  const g = holdGrowth(getState().live.holds, today());
  const rec = h("div", { class: "todayrec" });
  let closed = false;
  cleanups.push(() => { closed = true; });
  listRecordings().then(list => {
    const r = list.find(x => x.date === today());
    if (!r || closed) return;
    const url = URL.createObjectURL(r.blob);
    cleanups.push(() => URL.revokeObjectURL(url));
    const btn = h("button", { type: "button", class: "btn" }, icon("play"), " Listen to today's recording");
    btn.addEventListener("click", () => {
      const media = r.kind === "video" ? h("video", { controls: true, src: url, playsinline: true, class: "selfview" }) : h("audio", { controls: true, src: url });
      btn.replaceWith(media);
      media.play().catch(() => {});
    });
    rec.append(btn);
  }).catch(() => { /* recordings unavailable */ });
  return h("section", { class: "resume todayhero todaydone" },
    h("div", { class: "resume-body" },
      todayLine("Today", "Done"),
      h("h1", { class: "title donetitle" }, h("span", { class: "donetick", "aria-hidden": "true" }, icon("check")), h("span", null, "Day " + d + " practised")),
      g ? h("p", null, "Longest steady " + (g.key === "any" ? "note" : nameOf(Number(g.key))) + ": ", g.then !== null ? h("span", { class: "muted" }, g.then.toFixed(1) + " s a few weeks ago, ") : null, h("b", null, g.now.toFixed(1) + " s today")) : null,
      rec,
      h("div", { class: "row todaynext" }, h("span", null, "Day " + cur + " is open"), h("a", { class: "btn", href: dayHref(cur) }, "Go on")),
      h("div", { class: "row todayor" }, h("span", { class: "muted" }, "Or:"), h("a", { class: "btn", href: "#/today/quick" }, "5 minutes"),
        getSettings().focus ? null : h("a", { class: "btn", href: "#/skills" }, "Quest game"))));
}

// Today: the day (before or after practice), the current unit, at most two message cards, the 5
// minutes; the week and quests at the side. Other news is a one-time toast.
function todayHome(page, { n, day, ds, action, cleanups }) {
  const d = doneDay(n);
  page.append(d === null ? beforeCard(n, day, ds, action) : doneCard(d, n, cleanups));
  const mainCol = h("div", { class: "todaymain" }), side = h("aside", { class: "todayside", "aria-label": "Your progress and extras" });
  page.append(h("div", { class: "todaygrid" }, mainCol, side));
  const unit = unitStrip(n);
  if (unit) mainCol.append(unit);
  // Two messages at most, the most important first (05 L1): the teacher's task; coming back or
  // being stuck; pieces due for review (not on a review day, which plays them); today's fix; last
  // week, on Mondays. The day stays the first thing on the screen.
  const picks = [() => teacherTaskCard(), () => adaptiveCard(n), () => (day.kind === "review" ? null : reviewsCard(cleanups)), () => fixToday(), () => mondayCard()];
  const cards = [];
  for (const make of picks) { if (cards.length >= 2) break; const c = make(); if (c) cards.push(c); }
  cards.forEach(c => { if (/notice/.test(c.className)) c.classList.add("notice-one"); mainCol.append(c); });
  if (d === null) mainCol.append(h("p", { class: "row between quickline" }, h("span", { class: "muted" }, "Short on time?"), h("a", { class: "btn", href: "#/today/quick" }, "5 minutes")));
  side.append(progressCard());
  if (n <= 7) side.append(realBansuriCard());
  messageToast(cleanups);
}

export async function render(main, { params, view }) {
  const isToday = params[0] === undefined;
  const cur = current();
  const n = isToday ? cur : Math.max(0, Number(params[0]));
  const day = getDay(n);
  const cleanups = [];
  if (!day) { main.append(h("div", { class: "page" }, h("p", null, "That day does not exist."))); return; }
  const ds = dayState(n) || {};
  const phase = phaseOf(day);
  const s = getState();
  const page = h("div", { class: "page" });

  if (isToday && getSettings().simple) { simpleToday(page, cur, day); main.append(page); return; }
  const firstTime = isToday && !s.startedAt && cur === 0;
  if (firstTime) {
    page.append(firstRunFlow(day, cleanups));
    main.append(page);
    return () => cleanups.forEach(f => f());
  } else if (isToday && !s.prefs.howChosen) page.append(howCard());

  // Status and primary action.
  let statusChip, action;
  const blocksDone = Object.values(ds.blocks || {}).filter(Boolean).length;
  if (n === cur) {
    statusChip = null; // the page itself says this is today
    const msOpen = day.milestone && milestoneState(day.milestone).status !== "passed";
    const sessionLabel = blocksDone ? (blocksDone === day.blocks.length ? "Finish today's session" : "Resume") : (n === 0 ? "Start Day 0" : "Start today's session");
    const lesson = lessonDue(n);
    if (lesson) {
      // A day taught by an interactive lesson: the lesson is the day (and passes its milestone).
      const r = lessonRecord(lesson.id), at = lessonAt(n);
      action = isToday ? h("a", { class: "btn primary big", href: "#/lesson/" + lesson.id }, at ? "Continue: step " + at.step + " of " + at.of : "Start the lesson: " + lesson.title)
        : h("div", { class: "row" },
          h("a", { class: "btn primary big", href: "#/lesson/" + lesson.id }, r && r.at > 0 ? "Continue the lesson" : "Start the lesson: " + lesson.title),
          h("a", { class: "btn ghost", href: "#/session/" + n }, "The reading version"));
    } else if (msOpen && day.kind === "milestone") {
      // A test day: the test is the main action, the session is rehearsal.
      const ms = milestoneState(day.milestone);
      action = h("div", { class: "row" },
        h("a", { class: "btn primary big", href: "#/milestone/" + day.milestone }, ms.status === "failed" ? "Retake the test" : "Take the milestone test"),
        h("a", { class: "btn", href: "#/session/" + n }, "Rehearse first"));
      if (ms.status === "failed") statusChip = h("span", { class: "chip warn" }, "Not passed yet");
    } else if (msOpen) {
      // A normal day that ends with a short milestone check (Day 0 and M0).
      action = h("div", { class: "row" },
        h("a", { class: "btn primary big", href: "#/session/" + n }, sessionLabel),
        h("a", { class: "btn", href: "#/milestone/" + day.milestone }, "Then complete " + day.milestone));
    } else if (practiceLesson("p" + n)) {
      // A practice or review day: its blocks as a lesson, drills from the lessons so far (a review
      // day opens with a quiz); the step list stays one tap away.
      const r = lessonRecord("p" + n), started = (r && r.at > 0) || blocksDone, at = lessonAt(n);
      const label = at ? "Continue: step " + at.step + " of " + at.of : day.kind === "review" ? (started ? "Continue today's review" : "Start today's review") : started ? "Continue today's practice" : "Start today's practice";
      action = isToday ? h("a", { class: "btn primary big", href: "#/lesson/p" + n }, label)
        : h("div", { class: "row" }, h("a", { class: "btn primary big", href: "#/lesson/p" + n }, label), h("a", { class: "btn ghost", href: "#/session/" + n }, "The step list"));
    } else {
      action = h("a", { class: "btn primary big", href: "#/session/" + n }, sessionLabel);
    }
  } else if (n < cur) {
    statusChip = h("span", { class: "chip good" }, "Completed" + (ds.date ? " " + fmtDate(ds.date) : ""));
    action = h("div", { class: "row" }, h("a", { class: "btn", href: "#/session/" + n }, "Practise this day again"), h("a", { class: "btn primary", href: "#/today" }, "Go to today (Day " + cur + ")"));
  } else {
    statusChip = h("span", { class: "chip mutedc" }, "Locked");
    action = h("p", { class: "notice info" }, "This day unlocks after Day " + (n - 1) + ". You can read ahead, but practise in order: each day builds on the last.");
  }

  // Today has a page of its own (redesign 05 L1, L1b); the day's step list, readings, milestone and
  // its neighbours are on the day's cover and in Course.
  if (isToday) {
    todayHome(page, { n, day, ds, action, cleanups });
    main.append(page);
    return () => cleanups.forEach(f => f());
  }

  page.append(h("section", { class: "hero" },
    h("span", { class: "eyebrow" }, (phase ? "Phase " + phase.id + ": " + phase.title : "") + (day.week ? " - Week " + day.week : "") + " - Day " + n + (day.repeatOf !== null ? " (repeats Day " + day.repeatOf + ")" : "")),
    h("h1", { class: "title" }, day.title || ("Day " + n)),
    h("div", { class: "row" }, statusChip, h("span", { class: "chip mutedc" }, KIND_LABEL[day.kind] || "Practice"), day.minutes ? h("span", { class: "chip mutedc" }, "About " + day.minutes + " min") : null,
      day.milestone ? h("a", { class: "chip warn", href: "#/milestone/" + day.milestone }, "Milestone " + day.milestone) : null),
    action));

  // Two columns on a wide screen: the practice itself, and everything around it.
  const mainCol = h("div", { class: "todaymain" }), side = h("aside", { class: "todayside", "aria-label": "Your progress and extras" });
  page.append(h("div", { class: "todaygrid" }, mainCol, side));

  mainCol.append(h("section", { class: "card" },
    h("div", { class: "row between" }, h("h2", null, "The session"), h("span", { class: "small muted" }, day.blocks.reduce((a, b) => a + (b.minutes || 0), 0) + " min planned")),
    blockLines(day),
    day.pass ? h("p", { class: "small passline" }, h("b", null, "To pass: "), day.pass) : null));

  // Lessons to read.
  const lessons = (day.lessons || []).map(id => [id, lessonInfo(id)]).filter(([, l]) => l);
  if (lessons.length) {
    mainCol.append(h("section", { class: "card" }, h("h2", null, "Read for this day"),
      h("div", { class: "lessonlinks" }, lessons.map(([id, l]) => h("a", { class: "lessonlink", href: "#/read/" + l.path }, icon("read"), h("span", null, h("span", { class: "small muted" }, id), " ", l.title))))));
  }

  // Milestone summary.
  if (day.milestone) {
    const info = milestoneInfo(day.milestone);
    const ms = milestoneState(day.milestone);
    mainCol.append(h("section", { class: "card" }, h("h2", null, "Milestone " + day.milestone + ": " + (info ? info.title : "")),
      h("p", null, "Milestones are the only proof of progress in this course. Pass every required item to unlock the next day."),
      h("div", { class: "row" }, h("span", { class: "chip " + (ms.status === "passed" ? "good" : ms.status === "failed" ? "warn" : "mutedc") }, ms.status === "passed" ? "Passed" : ms.status === "failed" ? "Not passed yet" : "Not taken"),
        h("span", { class: "small muted" }, ms.attempts.length + " attempt" + (ms.attempts.length === 1 ? "" : "s")),
        h("a", { href: "#/milestone/" + day.milestone }, "Open the test"))));
  }

  // Neighbours.
  page.append(h("nav", { class: "pager" },
    n > 0 ? h("a", { class: "btn ghost", href: "#/day/" + (n - 1) }, "Day " + (n - 1)) : h("span"),
    h("a", { class: "btn ghost", href: "#/course" }, "Course"),
    n < lastIndex() + 200 ? h("a", { class: "btn ghost", href: "#/day/" + (n + 1) }, "Day " + (n + 1)) : h("span")));
  if (phase) page.append(h("p", { class: "small muted" }, "This day comes from the ", h("a", { href: "#/read/" + phase.doc }, "Phase " + phase.id + " roadmap"), "."));

  main.append(page);
  return () => cleanups.forEach(f => f());
}
