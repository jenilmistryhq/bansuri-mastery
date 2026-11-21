// Today (#/today) and any single day (#/day/<n>).
import { h, fmtDate, today } from "../util.js";
import { getState, update } from "../state.js";
import { getDay, current, dayState, phaseOf, lessonInfo, milestoneInfo, milestoneState, lastIndex, totals } from "../course.js";
import { holdGrowth } from "../livestats.js";
import { listRecordings } from "../recorder.js";
import { nameOf } from "../core/theory.js";
import { t } from "../core/i18n.js";
import { placementTest, startAtPhase } from "../placement.js";
import { renderInline } from "../content.js";
import { questState } from "../fun.js";
import { questGame } from "../skillmap.js";
import { GAME_FROM } from "./skills.js";
import { levelBar } from "../levelui.js";
import { makePlayable } from "../playable.js";
import { loadRoomIndex } from "../rooms/loader.js";
import { recommendedCards } from "../rooms/catalog.js";
import { icon } from "../util.js";
import { getSettings, setSettings } from "../core/settings.js";
import { speak, sayButton } from "../voice.js";
import { stepMeta, plainText } from "../steps.js";
import { plainCodes } from "../codes.js";
import { lessonForDay } from "../lessons/index.js";
import { oneDay } from "../lessons/oneday.js";
import { practiceLesson, plainBlock } from "../lessons/practice.js";
import { dayHref } from "../lessons/days.js";
import { lessonRecord, flatSteps } from "../lesson/player.js";
import { adaptiveCard, fixToday, messageToast, mondayCard, progressCard, realBansuriCard, reviewsCard, teacherTaskCard, unitStrip, welcomeBackCard } from "./today-cards.js";

// First run: choose a language, complete a baseline assessment, then enter the self-paced dashboard.
function firstRunFlow(day, cleanups) {
  const host = h("div", { class: "firstflow" });
  let placer = null;
  const mark = key => update(st => { st.prefs[key] = true; });
  const draw = () => {
    if (placer) { placer.destroy(); placer = null; }
    const p = getState().prefs;
    host.replaceChildren(...(!p.langChosen ? [langStep()] : !p.assessmentCompleted ? [assessmentStep()] : [assessmentDone()]));
    window.scrollTo(0, 0);
  };
  // The language first, in both scripts.
  const langStep = () => {
    const pick = lang => { mark("langChosen"); if (getSettings().lang === lang) draw(); else setSettings(lang === "hi" ? { lang, deva: true } : { lang }); };
    return h("section", { class: "hero firstrun" },
      h("h1", null, "Learn the bansuri at your own pace"),
      h("p", { class: "muted" }, "Choose a starting point that fits your instrument and experience. You can practise whenever you like."),
      h("div", { class: "firstchoice", translate: "no" },
        h("button", { type: "button", class: "btn big", lang: "en", onclick: () => pick("en") }, "English"),
        h("button", { type: "button", class: "btn big", lang: "hi", onclick: () => pick("hi") }, "हिन्दी")));
  };
  const assessmentStep = () => {
    const testHost = h("div", { class: "toolhost", hidden: true });
    const start = h("button", { type: "button", class: "btn primary big" }, "Start baseline assessment");
    start.addEventListener("click", () => {
      start.hidden = true; testHost.hidden = false;
      placer = placementTest({ onResult: (phase, profile) => {
        update(st => { st.prefs.assessmentCompleted = true; st.prefs.assessment = profile; st.prefs.recommendedPhase = phase; });
        startAtPhase(phase);
        setTimeout(() => { location.hash = "#/today#ready"; }, 0);
      } });
      testHost.replaceChildren(placer.el);
    });
    return h("section", { class: "card baseline-intro" }, h("span", { class: "eyebrow" }, "YOUR STARTING POINT"),
      h("h1", null, "Let's find your current level"),
      h("p", { class: "muted" }, "A guided check of tone, notes, range, ear and rhythm will help shape your path. It is not an exam: mark anything unfamiliar as Not yet and keep going."),
      h("p", { class: "small muted" }, "Have your flute ready for the playing checks. The ear and rhythm checks work on their own."), start, testHost);
  };
  const assessmentDone = () => {
    const phase = getState().prefs.recommendedPhase || 0;
    const go = h("button", { type: "button", class: "btn primary big" }, "Build my path from this level");
    go.addEventListener("click", () => { startAtPhase(phase); location.hash = "#/today"; });
    return h("section", { class: "hero firstrun" }, h("span", { class: "eyebrow" }, "BASELINE SAVED"),
      h("h1", null, "Your learning dashboard is ready"), h("p", { class: "muted" }, "Your starting snapshot is saved to your profile. Your path is self-paced, and you can retake checks whenever your playing changes."),
      go, h("a", { class: "btn ghost", href: "#/me" }, "View my profile"));
  };
  cleanups.push(() => { if (placer) placer.destroy(); });
  draw();
  return host;
}

// Legacy interactive lessons are now rooms; this always returns null.
function lessonDue(n) {
  return null;
}

// Simple mode (W11): the other language one tap away, big choices (Start practice names the day),
// today's quests, and the way out of Simple mode. No reading needed.
function simpleToday(page, cur, day) {
  const big = (href, ic, label, ref, cls, sub) => h("a", { class: "simpletile " + (cls || ""), href, onclick: () => speak(ref) }, icon(ic), h("span", { class: "stack" }, h("b", null, label), sub ? h("span", { class: "small" }, sub) : null));
  // The language button is written in the language it switches to, so it can be found without reading.
  const hi = getSettings().lang === "hi";
  const langBtn = h("button", { type: "button", class: "btn simplelang", translate: "no", lang: hi ? "en" : "hi", onclick: () => setSettings(hi ? { lang: "en" } : { lang: "hi", deva: true }) }, hi ? "English" : "हिन्दी");
  page.append(
    h("div", { class: "row between simpletop" }, sayButton(["welcome"], "Listen"), langBtn),
    h("div", { class: "simpletiles" },
      big(day && day.kind === "milestone" ? "#/milestone/" + day.milestone : practiceLesson("p" + cur) ? "#/lesson/p" + cur + "#start" : "#/session/" + cur, "play", "Start practice", "session_start", "primary", day && day.title || "Your next skill"),
      big("#/play", "star", "Play a game", "steer_intro"),
      big("#/listen", "listen", "Listen", "listen_intro"),
      big("#/quick", "today", "5 minutes", "quick_intro")));
  const qs = questState();
  page.append(h("section", { class: "card simplequests" }, h("h2", { class: "eyebrow" }, "Today's quests"),
    h("ul", { class: "questlist" }, qs.list.map(q => h("li", { class: q.done ? "done" : "" }, h("span", { class: "qmark", "aria-hidden": "true" }, q.done ? "✓" : ""), h("span", null, q.text))))));
  page.append(h("a", { class: "card levelcard", href: "#/progress#level" }, levelBar()));
  page.append(h("div", { class: "row simpleleave" }, h("button", { type: "button", class: "btn", onclick: () => setSettings({ simple: false }) }, "Leave Simple mode")));
}

const KIND_LABEL = { setup: "Setup", review: "Review", milestone: "Milestone", practice: "Practice" };

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
    h("h1", null, "Start with your flute"),
    h("p", { class: "muted" }, "Set up your instrument, find its Sa, and choose your first interactive room."),
    h("a", { class: "btn primary big", href: "#/rooms/meet-your-flute" }, "Set up my flute"),
    h("p", { class: "small muted" }, "The path moves when you are ready. Practise on your schedule."));
}

function welcome() {
  return h("details", { class: "card" },
    h("summary", null, h("b", null, "How the course works")),
    h("ol", { class: "welcome-steps" },
      h("li", null, h("span", null, h("b", null, "Your first activity sets you up: "), "check your flute, find Sa, and get the tanpura, metronome and tuner ready.")),
      h("li", null, h("span", null, h("b", null, "Every activity is guided "), "with warm-up, tone, technique, music, ear training and a short log. Timers and tools are built in.")),
      h("li", null, h("span", null, h("b", null, "Milestones prove progress. "), "You move on by passing practical tests, not by the calendar. A failed test tells you exactly what to practise.")),
      h("li", null, h("span", null, h("b", null, "Your progress stays on this device. "), "Export a backup in Settings to move it to another device."))),
    h("p", { class: "small muted" }, "For a 6-hole bansuri. Set or detect your flute's Sa in Me > Flute; the app tunes its notes and drone to match. Already play? ", h("a", { href: "#/settings#already-play" }, "Take the playing test"), " to start at the right phase."));
}

// The lesson that carries day n (its interactive lesson, or the practice or review day as a lesson),
// with the day's session folded in as the lesson page plays it; null when the day has none.
function playedLesson(n) {
  const raw = lessonDue(n) || practiceLesson("p" + n);
  // M0 is now a standalone setup room; do not merge the legacy 58-minute day plan into its 20-minute lesson.
  if (!raw || raw.id === "m0") return raw;
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

const todayLine = (...bits) => h("span", { class: "row resume-top" }, h("span", { class: "eyebrow todayline" }, bits.filter(Boolean).map(b => h("span", null, b))));

// Part way through (W13): how far the day has come, as a bar and "7 of 12" (the lesson's steps, or
// the blocks ticked in the step list). Null before the day starts.
function partWay(at, day, ticked) {
  const blocks = day.blocks.filter(b => ticked[b.id]).length;
  const [done, of, now] = at ? [at.step - 1, at.of, at.step] : blocks ? [blocks, day.blocks.length, blocks] : [0, 0, 0];
  if (!of) return null;
  return h("div", { class: "row todayprog" },
    h("div", { class: "progressbar", role: "progressbar", "aria-label": at ? "Steps done" : "Blocks done", "aria-valuemin": "0", "aria-valuemax": String(of), "aria-valuenow": String(done) },
      h("i", { style: { width: Math.round(done / of * 100) + "%" } })),
    h("span", { class: "small muted" }, now + " of " + of));
}

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
  const goal = h("span", null, first(lesson && lesson.goal ? lesson.goal : day.pass ? t(day.pass) : main ? plainBlock(main.text) : ""));
  if (!(lesson && lesson.goal) && !day.pass && main) plainText(main).then(x => { if (x) goal.textContent = first(x); });
  const kind = lessonDue(n) ? "Lesson" : KIND_LABEL[day.kind] || "Practice";
  const title = String((lesson && lesson.title) || day.title || "Continue learning").replace(/^Day\s*\d+\s*:\s*/i, "");
  return h("section", { class: "resume todayhero" },
    h("div", { class: "resume-body" },
      todayLine("UP NEXT", kind, total ? total + " min" : null),
      h("h1", { class: "title" }, title),
      goal.textContent ? h("p", { class: "todaygoal" }, h("b", null, "Goal:"), " ", goal) : null,
      partWay(at, day, ticked),
      action,
      h("p", { class: "small muted row todaysub" }, left ? h("span", null, "About " + left + " min left") : null, lesson && lesson.id === "m0" ? null : h("a", { href: "#/session/" + n }, "Step list")),
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
      h("h1", { class: "title donetitle" }, h("span", { class: "donetick", "aria-hidden": "true" }, icon("check")), h("span", null, "Practice session complete")),
      g ? h("p", null, "Longest steady " + (g.key === "any" ? "note" : nameOf(Number(g.key))) + ": ", g.then !== null ? h("span", { class: "muted" }, g.then.toFixed(1) + " s a few weeks ago, ") : null, h("b", null, g.now.toFixed(1) + " s today")) : null,
      rec,
      h("div", { class: "row todaynext" }, h("span", null, "Your next step is ready"), h("a", { class: "btn", href: dayHref(cur) }, "Keep learning")),
      h("div", { class: "row todayor" }, h("span", { class: "muted" }, "Or:"), h("a", { class: "btn", href: "#/today/quick" }, "5 minutes"),
        getSettings().focus ? null : questGameLink())));
}

// "Quest game": straight into the game for today's first open quest (the one Skills offers too);
// its Close comes back here.
function questGameLink() {
  const a = h("a", { class: "btn questgame", href: "#/skills/game/" + questGame(questState().list).key }, "Quest game");
  a.addEventListener("click", () => { try { sessionStorage.setItem(GAME_FROM, location.hash); } catch (e) { /* Close then goes to the games */ } });
  return a;
}

// Today: the day (before or after practice), the current unit, at most two message cards, the 5
// minutes; the week and quests at the side. Other news is a one-time toast.
function todayHome(page, { n, day, ds, action, cleanups }) {
  const d = doneDay(n);
  page.append(d === null ? beforeCard(n, day, ds, action) : doneCard(d, n, cleanups));
  // Back after a gap (W17): the welcome is the main card, in place of the day's card.
  const back = d === null ? welcomeBackCard(n) : null;
  if (back) page.lastElementChild.replaceWith(back);
  const s = getState(), stats = totals();
  const hour = new Date().getHours(), greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  page.prepend(h("section", { class: "dashwelcome" }, h("div", null,
    h("span", { class: "eyebrow" }, "YOUR LEARNING DASHBOARD"),
    h("h1", null, greeting + (s.prefs.displayName ? ", " + s.prefs.displayName : ", bansuri learner")),
    h("p", { class: "muted" }, "Your path, your pace. Pick up a skill, practise it, and move on when you are ready.")),
    h("a", { class: "btn ghost", href: "#/me" }, "View profile")));
  const mainCol = h("div", { class: "todaymain" }), side = h("aside", { class: "todayside", "aria-label": "Your progress and extras" });
  page.append(h("div", { class: "todaygrid" }, mainCol, side));
  const unit = unitStrip(n);
  if (unit) mainCol.append(unit);
  const assessment = s.prefs.assessment;
  if (assessment && assessment.skills) {
    const labels = { tone: "Tone", notes: "Note control", range: "Range", intonation: "Intonation", ear: "Ear", rhythm: "Rhythm" };
    const entries = Object.entries(assessment.skills), focus = entries.find(([, v]) => v.passed < v.total) || null;
    const routes = { tone: "#/skills/tone", notes: "#/skills/notes", range: "#/skills/notes", intonation: "#/skills/tone", ear: "#/skills/ear", rhythm: "#/skills/rhythm" };
    mainCol.append(h("section", { class: "card assessment-focus" }, h("div", { class: "row between" }, h("div", null, h("span", { class: "eyebrow" }, "YOUR LATEST CHECK-IN"), h("h2", null, focus ? "Build your " + (labels[focus[0]] || focus[0]) : "Ready for a new challenge?")), h("a", { class: "small", href: "#/me" }, "Full profile")),
      h("p", { class: "small muted" }, "Retake skill checks as your flute playing changes; your Path stays self-paced."),
      h("div", { class: "assessment-chips" }, entries.map(([key, v]) => h("span", { class: "chip " + (v.passed === v.total ? "good" : "mutedc") }, (labels[key] || key) + " " + v.passed + "/" + v.total))),
      h("div", { class: "row" }, focus ? h("a", { class: "btn primary", href: routes[focus[0]] || "#/skills" }, "Practise " + (labels[focus[0]] || focus[0])) : h("a", { class: "btn primary", href: "#/course" }, "Explore learning paths"), h("a", { class: "btn ghost", href: "#/me" }, "Retake assessment"))));
  }
  // Two messages at most, the most important first (05 L1): the teacher's task; coming back or
  // being stuck; pieces due for review (not on a review day, which plays them); today's fix; last
  // week, on Mondays. The day stays the first thing on the screen.
  const picks = [() => teacherTaskCard(), () => adaptiveCard(n), () => (day.kind === "review" ? null : reviewsCard(cleanups)), () => fixToday(), () => mondayCard()];
  const cards = [];
  for (const make of picks) { if (cards.length >= 2) break; const c = make(); if (c) cards.push(c); }
  cards.forEach(c => { if (/notice/.test(c.className)) c.classList.add("notice-one"); mainCol.append(c); });
  if (!getSettings().focus) {
    const roomsSection = h("section", { class: "card dashboard-rooms today-rooms-section" },
      h("div", { class: "row between" },
        h("div", null, h("span", { class: "eyebrow" }, "LEARN BY PLAYING"), h("h2", null, "Rooms")),
        h("a", { class: "btn small", href: "#/rooms" }, "All rooms")),
      h("p", { class: "small muted" }, "Interactive challenges on your learning path."));
    mainCol.append(roomsSection);
    loadRoomIndex().then(index => {
      if (!index.length) return;
      let records = {};
      try { records = JSON.parse(localStorage.getItem("bansuri.rooms") || "{}"); } catch (e) { /* empty */ }
      const grid = recommendedCards(index, records);
      if (grid) { grid.classList.add("today-rooms-grid"); roomsSection.append(grid); }
      roomsSection.append(h("div", { class: "row", style: { marginTop: "10px", gap: "8px" } },
        h("a", { class: "btn primary small", href: "#/course" }, "Learning paths"),
        h("a", { class: "btn ghost small", href: "#/rooms" }, "Browse all")));
    });
  }
  if (d === null && !back) mainCol.append(h("p", { class: "row between quickline" }, h("span", { class: "muted" }, "Short on time?"), h("a", { class: "btn", href: "#/today/quick" }, "5 minutes")));
  side.append(progressCard());
  side.append(h("section", { class: "card dashstats" }, h("h2", null, "Your stats"), h("div", { class: "dashstatgrid" },
    h("div", null, h("b", null, String(stats.sessions)), h("span", { class: "small muted" }, "practice sessions")),
    h("div", null, h("b", null, String(stats.msPassed)), h("span", { class: "small muted" }, "milestones passed")),
    h("div", null, h("b", null, Math.round(stats.minutes / 60 * 10) / 10 + "h"), h("span", { class: "small muted" }, "total practice")))));
  const recent = s.log.slice(-3).reverse();
  side.append(h("section", { class: "card dashfeed" }, h("div", { class: "row between" }, h("h2", null, "Recent practice"), h("a", { class: "small", href: "#/me/journal" }, "Journal")),
    recent.length ? h("ul", null, recent.map(e => h("li", null, h("b", null, e.label || "Practice"), h("span", { class: "small muted" }, (e.minutes || 0) + " min · " + e.date))))
      : h("p", { class: "small muted" }, "Your practice activity will show up here.")));
  if (n <= 7) side.append(realBansuriCard());
  messageToast(cleanups);
}

export async function render(main, { params, view }) {
  const isToday = params[0] === undefined;
  const cur = current();
  const n = isToday ? cur : Math.max(0, Number(params[0]));
  const day = getDay(n);
  const cleanups = [];
  // One way into a day: #/day/N opens the day's lesson cover (at the step, when part done) or its
  // milestone, so a day has a single cover (redesign L3).
  if (!isToday && day) { location.replace(dayHref(n) || "#/session/" + n); return undefined; }
  if (!day) { main.append(h("div", { class: "page" }, h("p", null, "That day does not exist."))); return; }
  const ds = dayState(n) || {};
  const phase = phaseOf(day);
  const s = getState();
  const page = h("div", { class: "page" });

  const firstTime = isToday && !s.startedAt && cur === 0 && !s.prefs.assessmentCompleted;
  if (firstTime) {
    page.append(firstRunFlow(day, cleanups));
    main.append(page);
    return () => cleanups.forEach(f => f());
  }
  if (isToday && getSettings().simple) { simpleToday(page, cur, day); main.append(page); return; }

  // Status and primary action.
  let statusChip, action;
  const blocksDone = Object.values(ds.blocks || {}).filter(Boolean).length;
  if (n === cur) {
    statusChip = null; // the page itself says this is today
    const msOpen = day.milestone && milestoneState(day.milestone).status !== "passed";
    const sessionLabel = blocksDone ? (blocksDone === day.blocks.length ? "Finish this session" : "Resume learning") : (n === 0 ? "Set up my flute" : "Start practising");
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
    } else if (practiceLesson("p" + n)) {
      // A practice or review day: its blocks as a lesson, drills from the lessons so far (a review
      // day opens with a quiz); the step list stays one tap away.
      const r = lessonRecord("p" + n), started = (r && r.at > 0) || blocksDone, at = lessonAt(n);
      const label = at ? "Continue: step " + at.step + " of " + at.of : day.kind === "review" ? (started ? "Continue today's review" : "Start today's review") : started ? "Continue today's practice" : "Start today's practice";
      action = isToday ? h("a", { class: "btn primary big", href: "#/lesson/p" + n + "#start" }, label)
        : h("div", { class: "row" }, h("a", { class: "btn primary big", href: "#/lesson/p" + n + "#start" }, label), h("a", { class: "btn ghost", href: "#/session/" + n }, "The step list"));
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
