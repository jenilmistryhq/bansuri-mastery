// Today (#/today) and any single day (#/day/<n>).
import { h, fmtDate, fmtMinutes } from "../util.js";
import { getState, update } from "../state.js";
import { daysBetween, addDays } from "../util.js";
import { listRecordings } from "../recorder.js";
import { getDay, current, dayState, phaseOf, lessonInfo, milestoneInfo, milestoneState, dueReviews, upcomingReviews, markReview, streaks, totals, practiceDates, lastIndex, getPlan } from "../course.js";
import { today } from "../util.js";
import { mountBench } from "../bench/bench.js";
import { renderInline, fetchDoc } from "../content.js";
import { dayResults, lastPlayedDay } from "../livestats.js";
import { questState } from "../fun.js";
import { levelBar } from "../levelui.js";
import { codeOf } from "../core/theory.js";
import { makePlayable } from "../playable.js";
import { icon } from "../util.js";
import { getSettings, setSettings } from "../core/settings.js";
import { speak, sayButton } from "../voice.js";
import { stepMeta, plainText } from "../steps.js";
import { ring, weekStrip } from "../ui.js";
import { saveBackup } from "../backup.js";
import { levelOf, xpState } from "../xp.js";
import { profileStrip, weakSpots, weekSummary, installCard, resumeCard, quickActions, reviewsCard, adaptiveCard, songOfWeekCard, lastSessionCard, backupNudge, realBansuriCard, journey } from "./today-cards.js";

// First run: how the learner likes to learn, in pictures and both languages, so it works without
// reading English. Each choice can be changed later in Settings.
function howCard() {
  const tile = (ic, label, sub, onClick) => h("button", { type: "button", class: "howtile", onclick: onClick }, icon(ic), h("b", null, label), sub ? h("span", { class: "small" }, sub) : null);
  const done = patch => { setSettings(patch); update(st => { st.prefs.howChosen = true; }); };
  return h("section", { class: "card howcard", "aria-label": "How do you like to learn?" },
    h("div", { class: "row between" }, h("h2", null, "How do you like to learn?"), sayButton(["welcome"], "Hear this")),
    h("div", { class: "row langpick", translate: "no" },
      h("button", { type: "button", class: "btn" + (getSettings().lang === "en" ? " primary" : ""), onclick: () => setSettings({ lang: "en" }) }, "English"),
      h("button", { type: "button", class: "btn" + (getSettings().lang === "hi" ? " primary" : ""), onclick: () => setSettings({ lang: "hi" }) }, "हिन्दी")),
    h("div", { class: "howtiles" },
      tile("read", "I like to read", "Lessons and steps as text", () => { done({ talk: false }); location.reload(); }),
      tile("speaker", "Talk to me", "The app says each step and how each note went", () => { done({ talk: true }); speak("welcome"); location.reload(); }),
      tile("hand", "Simple mode", "Three big buttons; the app talks you through everything", () => done({ talk: true, simple: true, notesAs: "pictures" }))));
}

// Simple mode: three big choices and today's quests, no reading needed.
function simpleToday(page, cur, day) {
  const big = (href, ic, label, ref, cls) => h("a", { class: "simpletile " + (cls || ""), href, onclick: () => speak(ref) }, icon(ic), h("b", null, label));
  page.append(
    h("section", { class: "hero simplehero" }, h("span", { class: "eyebrow" }, "Day " + cur), h("h1", null, day && day.title ? day.title : "Today"), sayButton(["welcome"], "Listen")),
    h("div", { class: "simpletiles" },
      big(day && day.kind === "milestone" ? "#/milestone/" + day.milestone : "#/session/" + cur, "play", "Start practice", "session_start", "primary"),
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
        b.read && b.read.length ? h("div", { class: "linklist" }, b.read.map(r => h("a", { href: "#/read/" + r.path + (r.anchor ? "#" + r.anchor : "") }, r.label))) : null));
  }));
  makePlayable(list);
  return list;
}

// The first screen a new learner sees: what this is, one big button, and the language.
function firstRun(day) {
  return h("section", { class: "hero firstrun" },
    h("h1", null, "Learn the bansuri, one day at a time"),
    h("p", { class: "muted" }, "A short guided session each day. The app listens to your flute and tells you how it went."),
    h("a", { class: "btn primary big", href: "#/session/0" }, "Start Day 0"),
    h("p", { class: "small muted" }, "About " + (day.minutes || 45) + " minutes: get to know your flute and find its Sa. Already play? ", h("a", { href: "#/settings#already-play" }, "Take the playing test"), "."));
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
    page.append(firstRun(day));
    if (!s.prefs.howChosen) page.append(howCard());
    page.append(realBansuriCard(), welcome());
  } else if (isToday && !s.prefs.howChosen) page.append(howCard());

  // Status and primary action.
  let statusChip, action;
  const blocksDone = Object.values(ds.blocks || {}).filter(Boolean).length;
  if (n === cur) {
    statusChip = null; // the page itself says this is today
    const msOpen = day.milestone && milestoneState(day.milestone).status !== "passed";
    const sessionLabel = blocksDone ? (blocksDone === day.blocks.length ? "Finish today's session" : "Resume") : (n === 0 ? "Start Day 0" : "Start today's session");
    if (msOpen && day.kind === "milestone") {
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

  if (isToday && !firstTime) page.append(profileStrip(), resumeCard(n, day, ds, phase, action), quickActions());
  else if (!firstTime) page.append(h("section", { class: "hero" },
    h("span", { class: "eyebrow" }, (phase ? "Phase " + phase.id + ": " + phase.title : "") + (day.week ? " - Week " + day.week : "") + " - Day " + n + (day.repeatOf !== null ? " (repeats Day " + day.repeatOf + ")" : "")),
    h("h1", { class: "title" }, day.title || ("Day " + n)),
    h("div", { class: "row" }, statusChip, h("span", { class: "chip mutedc" }, KIND_LABEL[day.kind] || "Practice"), day.minutes ? h("span", { class: "chip mutedc" }, "About " + day.minutes + " min") : null,
      day.milestone ? h("a", { class: "chip warn", href: "#/milestone/" + day.milestone }, "Milestone " + day.milestone) : null),
    action,
    isToday ? journey(n, phase) : null));

  // Two columns on a wide screen: the practice itself, and everything around it.
  const mainCol = h("div", { class: "todaymain" }), side = h("aside", { class: "todayside", "aria-label": "Your progress and extras" });
  page.append(h("div", { class: "todaygrid" }, mainCol, side));
  if (isToday && !firstTime) {
    const help = adaptiveCard(cur);
    if (help) mainCol.append(help);
    const rc = reviewsCard(cleanups);
    if (rc) mainCol.append(rc);
    const weak = weakSpots();
    if (weak) mainCol.append(weak);
  }

  mainCol.append(h("section", { class: "card" },
    h("div", { class: "row between" }, h("h2", null, firstTime ? "Day 0 at a glance" : "The session"), h("span", { class: "small muted" }, day.blocks.reduce((a, b) => a + (b.minutes || 0), 0) + " min planned")),
    blockLines(day),
    day.pass ? h("p", { class: "small passline" }, h("b", null, "To pass: "), day.pass) : null));

  // Lessons to read.
  const lessons = (day.lessons || []).map(id => [id, lessonInfo(id)]).filter(([, l]) => l);
  if (lessons.length) {
    mainCol.append(h("section", { class: "card" }, h("h2", null, "Read for this day"),
      h("div", { class: "lessonlinks" }, lessons.map(([id, l]) => h("a", { class: "lessonlink", href: "#/read/" + l.path }, icon("read"), h("span", null, h("span", { class: "small muted" }, id), " ", l.title))))));
  }

  if (isToday && !firstTime) {
    // Level and quests together: where you stand, and what to do for XP today.
    const qs = questState(), left = qs.list.filter(q => !q.done);
    side.append(h("section", { class: "card sidecard" },
      h("h2", null, "Daily quests"),
      h("ul", { class: "questlist" }, qs.list.map(q => h("li", { class: q.done ? "done" : "" }, h("span", { class: "qmark", "aria-hidden": "true" }, q.done ? "\u2713" : ""), h("span", null, q.text)))),
      h("a", { class: "questline small", href: "#/play" }, left.length ? (qs.list.length - left.length) + " of " + qs.list.length + " done - games and quests are in Play" : "All done! New quests tomorrow.")));
    const week = weekSummary();
    if (week) side.prepend(week);
    const inst = installCard();
    if (inst) side.append(inst);
    const lastCard = lastSessionCard();
    if (lastCard) side.append(lastCard);
    const songHost = h("div");
    side.append(songHost);
    songOfWeekCard().then(c => songHost.replaceWith(c || h("a", { class: "card songlink", href: "#/songs" }, h("b", null, "Songs"), h("span", { class: "small muted" }, "Play along with a melody; the microphone checks every note."))));
    side.append(h("a", { class: "card songlink", href: "#/quick" }, h("b", null, "Short on time?"), h("span", { class: "small muted" }, "A 5-minute practice still counts.")));
    if (cur <= 42) side.append(realBansuriCard());
    const nudge = backupNudge();
    if (nudge) side.append(nudge);
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
    h("a", { class: "btn ghost", href: "#/plan" }, "Course map"),
    n < lastIndex() + 200 ? h("a", { class: "btn ghost", href: "#/day/" + (n + 1) }, "Day " + (n + 1)) : h("span")));
  if (phase) page.append(h("p", { class: "small muted" }, "This day comes from the ", h("a", { href: "#/read/" + phase.doc }, "Phase " + phase.id + " roadmap"), "."));

  main.append(page);
  return () => cleanups.forEach(f => f());
}
