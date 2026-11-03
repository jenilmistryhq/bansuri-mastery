// Today's cards: the dashboard (profile strip, Resume, quick actions), weak spots, last week, the
// install offer, and the side cards (reviews, help, song of the week, last time, backup, a real bansuri).
import { h, fmtDate, fmtMinutes, store, storeSet } from "../util.js";
import { getState } from "../state.js";
import { daysBetween, addDays } from "../util.js";
import { listRecordings } from "../recorder.js";
import { getDay, current, milestoneState, dueReviews, upcomingReviews, markReview, streaks, totals, practiceDates, lastIndex, getPlan } from "../course.js";
import { today } from "../util.js";
import { mountBench } from "../bench/bench.js";
import { fetchDoc } from "../content.js";
import { dayResults, lastPlayedDay } from "../livestats.js";
import { questState } from "../fun.js";
import { currentTask, markTaskDone } from "../review.js";
import { codeOf } from "../core/theory.js";
import { getSettings } from "../core/settings.js";
import { icon } from "../util.js";
import { weekStrip } from "../ui.js";
import { saveBackup } from "../backup.js";
import { levelOf, xpState } from "../xp.js";
import { NEWS } from "../news.js";
import { lessonForDay } from "../lessons/index.js";
import { practiceLesson } from "../lessons/practice.js";

// Who you are in the course at a glance: level and XP, the streak, and this week's practice days.
export function profileStrip() {
  const lv = levelOf(xpState().total), st = streaks(), dates = practiceDates();
  return h("section", { class: "profile" },
    h("a", { class: "profile-level", href: "#/progress#level" },
      h("span", { class: "levelbadge", "aria-hidden": "true" }, String(lv.level)),
      h("span", { class: "profile-text" }, h("b", null, "Level " + lv.level + " "), h("span", { class: "leveltitle" }, lv.name),
        h("span", { class: "progressbar levelbar thin", role: "progressbar", "aria-label": "XP toward the next level", "aria-valuemin": "0", "aria-valuemax": String(lv.need || 1), "aria-valuenow": String(lv.into) }, h("i", { style: { width: lv.pct + "%" } })),
        h("span", { class: "small muted mono" }, lv.next ? lv.xp.toLocaleString() + " / " + lv.to.toLocaleString() + " XP" : lv.xp.toLocaleString() + " XP"))),
    h("a", { class: "profile-streak" + (st.current ? " lit" : ""), href: "#/journal", title: "Practice streak" },
      h("span", { class: "flame", "aria-hidden": "true" }, icon("flame")), h("b", null, String(st.current)), h("span", { class: "small muted" }, st.current === 1 ? "day streak" : "day streak"),
      st.restThisWeek ? h("span", { class: "small muted", title: "One missed day a week does not break the streak" }, "rest day used") : null),
    weekStrip(new Set(dates.keys())));
}

// Weak spots, from what the microphone measured: the notes held shortest, the pieces with the most
// missed notes, the play-back levels with the most misses. Each has one tap to practise it.
function weakList() {
  const L = getState().live || {}, since = addDays(today(), -14), out = [];
  // Each one opens its skill's tab (redesign 03: doors open the right section); the Bench tool inside
  // it is set up first, so Long tones or Play it back open where they should.
  const bench = (tab, skill, extra) => () => { try { localStorage.setItem("bansuri.bench.tab", JSON.stringify(tab)); for (const [k, v] of Object.entries(extra || {})) localStorage.setItem("bansuri.bench." + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } location.hash = "#/skills/" + skill; };
  for (const [k, list] of Object.entries(L.holds || {})) {
    if (k === "any" || !list.length) continue;
    const last = list[list.length - 1];
    if (last.s < 5) out.push({ score: last.s / 5, text: "Hold " + codeOf(Number(k)) + " longer: your best lately is " + last.s.toFixed(1) + " s", label: "Long tones", go: bench("tones", "tone", { "live.toneNote": k }) });
  }
  const pieces = {};
  for (const p of (L.plays || []).filter(x => x.d >= since && x.n)) { const q = pieces[p.piece] || (pieces[p.piece] = { ok: 0, n: 0 }); q.ok += p.ok; q.n += p.n; }
  for (const [piece, q] of Object.entries(pieces)) if (q.ok / q.n < 0.75) out.push({ score: q.ok / q.n, text: piece + ": " + Math.round(q.ok / q.n * 100) + "% of notes right lately. Try it 10 BPM slower.", label: "Notes and tuning", go: () => { location.hash = "#/skills/notes"; } });
  for (const e of Object.values(L.echo || {})) if (e.total >= 5 && e.right / e.total < 0.5) out.push({ score: e.right / e.total, text: "Play back (" + e.label + "): " + e.right + " of " + e.total + " right", label: "Play back", go: bench("echo", "ear") });
  out.sort((a, b) => a.score - b.score);
  return out;
}

// The single weakest spot, as one line with one button (Today).
export function fixToday() {
  const w = weakList()[0];
  if (!w) return null;
  return h("section", { class: "fixtoday" }, h("span", { class: "fixicon", "aria-hidden": "true" }, icon("wave")),
    h("span", { class: "fixtext" }, h("b", null, "Fix today: "), w.text), h("button", { type: "button", class: "btn small", onclick: w.go }, w.label));
}

// The weakest spots (up to three), each with one tap to practise (Progress).
export function weakSpots() {
  const out = weakList();
  if (!out.length) return null;
  return h("section", { class: "card weakcard" }, h("h2", null, "Work on these"),
    h("ul", { class: "weaklist" }, out.slice(0, 3).map(w => h("li", null, h("span", null, w.text), h("button", { type: "button", class: "btn small", onclick: w.go }, w.label)))),
    h("p", { class: "small muted" }, "From what the microphone heard in the last two weeks."));
}

// Last week in numbers, early in the week: days, minutes, XP and the best long tone. Shareable.
export function weekSummary() {
  const t = today(), dow = (parseDateLocal(t).getDay() + 6) % 7; // 0 = Monday
  if (dow > 2) return null;
  const mon = addDays(t, -dow - 7), days = [...Array(7)].map((_, i) => addDays(mon, i));
  const s = getState(), dates = practiceDates(), xp = xpState();
  const practised = days.filter(d => dates.has(d)).length;
  if (!practised) return null;
  const minutes = days.reduce((a, d) => a + (dates.get(d) || 0), 0), gained = days.reduce((a, d) => a + ((xp.days || {})[d] || 0), 0);
  let best = null;
  for (const [k, list] of Object.entries(s.live.holds || {})) for (const x of list) if (days.includes(x.d) && (!best || x.s > best.s)) best = { k, s: x.s };
  const text = "My bansuri week: " + practised + " of 7 days, " + fmtMinutes(minutes) + ", +" + gained + " XP" + (best ? ", longest steady " + (best.k === "any" ? "note" : codeOf(Number(best.k))) + " " + best.s.toFixed(1) + " s" : "") + ".";
  const share = h("button", { type: "button", class: "btn small", onclick: async () => {
    try { if (navigator.share) await navigator.share({ title: "My bansuri week", text }); else { await navigator.clipboard.writeText(text); share.textContent = "Copied"; } } catch (e) { /* cancelled */ }
  } }, icon("share"), "Share");
  return h("section", { class: "card weekcard" },
    h("div", { class: "row between" }, h("h2", null, "Last week"), share),
    h("div", { class: "bigstats" },
      h("div", { class: "stat" }, h("b", null, practised + "/7"), h("span", null, "days")),
      h("div", { class: "stat" }, h("b", null, fmtMinutes(minutes)), h("span", null, "practised")),
      h("div", { class: "stat" }, h("b", null, "+" + gained), h("span", null, "XP"))),
    best ? h("p", { class: "small muted" }, "Longest steady " + (best.k === "any" ? "note" : codeOf(Number(best.k))) + ": " + best.s.toFixed(1) + " s") : null);
}

// Last week's summary is one of Today's cards on Mondays (redesign 05 L1).
export function mondayCard() {
  return (parseDateLocal(today()).getDay() === 1) ? weekSummary() : null;
}

// On iPhone, Safari deletes a website's saved data after about 7 days without a visit, unless the
// app is on the home screen (the backup reminder comes more often there).
export const iosBrowser = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) && !navigator.standalone;
const parseDateLocal = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

// Where day n is played: its interactive lesson, its open milestone test, its practice or review
// day as a lesson, or else its session page.
export function dayHref(n) {
  const l = lessonForDay(n), day = getDay(n);
  if (l) return "#/lesson/" + l.id;
  if (day && day.kind === "milestone" && day.milestone && milestoneState(day.milestone).status !== "passed") return "#/milestone/" + day.milestone;
  return practiceLesson("p" + n) ? "#/lesson/p" + n : "#/session/" + n;
}

// The current unit (redesign 05 L1): the days from the last milestone to the next one still open,
// as a short strip around today (the days just done, today, the next few) ending at the milestone.
export function unitStrip(n) {
  const plan = getPlan(), ms = plan.milestones.find(m => m.day >= n && milestoneState(m.id).status !== "passed");
  if (!ms) return null;
  const prev = plan.milestones.filter(m => m.day < Math.min(n, ms.day)).pop();
  const first = prev ? prev.day + 1 : 0, from = Math.max(first, n - 4), to = Math.min(ms.day - 1, n + 3), left = ms.day - n;
  const dots = [];
  if (from > first) dots.push(h("i", { class: "unit-more" }));
  for (let d = from; d <= to; d++) dots.push(h("i", { class: d < n ? "done" : d === n ? "now" : "" }));
  if (to < ms.day - 1) dots.push(h("i", { class: "unit-more" }));
  dots.push(h("b", { class: "unit-ms" + (left === 0 ? " now" : "") }, ms.id));
  return h("section", { class: "card unitstrip" },
    h("div", { class: "stack tight" }, h("span", { class: "eyebrow" }, "This unit"), h("b", null, ms.title)),
    h("div", { class: "unit-dots", role: "img", "aria-label": "Day " + (n - first + 1) + " of " + (ms.day - first + 1) + " in this unit" }, dots),
    h("a", { class: "unit-link", href: "#/milestone/" + ms.id }, h("span", null, left === 0 ? "The milestone is today" : left + (left === 1 ? " day" : " days") + " to the milestone"), h("span", { class: "chev", "aria-hidden": "true" }, ">")));
}

// Messages that are not about today's practice (news, the backup reminder, the install offer) are
// toasts, each shown once and remembered (redesign 05 L1); one at most per visit to Today.
function toastCard(title, body, actions, closeLabel, cleanups) {
  const host = h("div", { class: "toasts msgtoasts", role: "status" });
  const close = () => { el.classList.add("leaving"); setTimeout(() => host.remove(), 180); };
  const el = h("div", { class: "msgtoast" }, h("b", null, title), body, h("div", { class: "row" }, ...actions(close), h("button", { type: "button", class: "btn ghost small", onclick: close }, closeLabel)));
  host.append(el);
  document.body.append(host);
  cleanups.push(() => host.remove());
  return host;
}

// Install the app (a home-screen icon, full screen, reminders): offered once, after Day 0's reward.
// On iPhone the browser has no install button, so the steps are shown instead.
// What was shown is remembered in a key of its own, so showing a toast never rewrites the progress
// (older answers in prefs still count).
const SEEN = "bansuri.toasts";
const seen = () => Object.assign({}, getState().prefs, store(SEEN, {}));
const remember = (k, v) => storeSet(SEEN, Object.assign(store(SEEN, {}), { [k]: v }));

function installToast(cleanups) {
  const s = getState(), ios = /iPhone|iPad|iPod/.test(navigator.userAgent), evt = window.__installEvent;
  if ((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone) return null;
  if (seen().installOffered || s.prefs.installDismissed || !(s.days[0] && s.days[0].done) || (!ios && !evt)) return null;
  remember("installOffered", today());
  return toastCard("Put the app on your home screen",
    ios ? h("p", { class: "small" }, h("b", null, "Keeps your progress safe: "), "on iPhone, Safari deletes a website's saved data when it is not opened for about a week. On the home screen, the app keeps it.", " ", "In Safari, tap the Share button, then \"Add to Home Screen\".")
      : h("p", { class: "small" }, "One tap to practise, full screen, works offline, and daily reminders can reach you."),
    close => (ios ? [] : [h("button", { type: "button", class: "btn primary small", onclick: async () => { evt.prompt(); await evt.userChoice.catch(() => null); close(); } }, "Install the app")]),
    "Not now", cleanups);
}

// What's new after an update: once. New learners do not hear about changes they never knew.
function newsToast(cleanups) {
  const s = getState();
  if (seen().newsSeen === NEWS.id) return null;
  remember("newsSeen", NEWS.id);
  if (!s.startedAt) return null;
  return toastCard(NEWS.title, h("ul", { class: "small" }, NEWS.items.map(t => h("li", null, t))),
    close => [h("a", { class: "btn small", href: "#/me", onclick: close }, "See your progress")], "Got it", cleanups);
}

// Everything lives in this browser, so a backup reminder about once a week (every 3 days in Safari
// on iPhone, where progress is at more risk): shown once, then not again for a week.
function backupToast(cleanups) {
  const s = getState(), t = today();
  if (!s.startedAt || daysBetween(s.lastBackup || s.startedAt, t) < (iosBrowser() ? 3 : 7)) return null;
  const snooze = [s.prefs.backupSnooze, store(SEEN, {}).backupSnooze].filter(Boolean).sort().pop();
  if (snooze && snooze > t) return null;
  remember("backupSnooze", addDays(t, 7));
  return toastCard("Back up your progress.",
    h("p", { class: "small" }, s.lastBackup ? "Your last backup was " + daysBetween(s.lastBackup, t) + " days ago." : "You have not made a backup yet. Your progress lives only in this browser."),
    close => [h("button", { type: "button", class: "btn primary small", onclick: async () => { const how = await saveBackup(); if (how !== "cancelled") close(); } }, "Back up now")],
    "Not now", cleanups);
}

// The one toast for this visit, if any: the install offer first (it comes once, after Day 0), then news, then the backup.
export function messageToast(cleanups) {
  return installToast(cleanups) || newsToast(cleanups) || backupToast(cleanups);
}

// Your progress in one card: level and how far to the next (in days, not XP), this week, quests.
export function progressCard() {
  // Points stay quiet (redesign decision 6): the level lives in Me > Progress and on the reward;
  // Today keeps the week and one line of quests.
  const qs = questState(), left = qs.list.filter(q => !q.done);
  return h("section", { class: "card progresscard" },
    h("a", { class: "small muted", href: "#/me" }, "Your week"),
    weekStrip(new Set(practiceDates().keys())),
    h("a", { class: "questline small", href: "#/skills" }, left.length ? "Quests: " + (qs.list.length - left.length) + " of " + qs.list.length + " done. Next: " + left[0].text : "All of today's quests are done."));
}

// One tap to the tools used most.
export function quickActions() {
  const a = (href, ic, label) => h("a", { class: "quickact", href }, h("span", { class: "quickicon", "aria-hidden": "true" }, icon(ic)), h("span", null, label));
  return h("nav", { class: "quickacts", "aria-label": "Quick actions" },
    a("#/bench", "bench", "Flute and tuner"), a("#/skills/tone/check", "coach", "Tone check"), getSettings().focus ? a("#/skills/fix", "coach", "Fix a problem") : a("#/play", "star", "Play a game"),
    a("#/songs", "note", "Songs"), a("#/listen", "listen", "Listen"), a("#/quick", "today", "5 minutes"));
}


// The practice task from the teacher's latest review (review.js), until marked done.
export function teacherTaskCard() {
  const f = currentTask();
  if (!f) return null;
  const overdue = f.due && f.due < today();
  const done = h("button", { type: "button", class: "btn small", onclick: () => { markTaskDone(f.id); card.remove(); } }, icon("check"), " Done");
  const card = h("section", { class: "card teachertask" }, h("div", { class: "row between" }, h("h2", null, "From your teacher"), f.due ? h("span", { class: "chip " + (overdue ? "warn" : "info") }, (overdue ? "Review was due " : "Next review by ") + f.due) : null),
    h("p", null, f.task), h("p", { class: "small muted" }, (f.teacher ? f.teacher + " on " : "On ") + f.what),
    h("div", { class: "row tight" }, done, h("a", { class: "btn small ghost", href: "#/review" }, "Ask for the next review")));
  return card;
}

export function reviewsCard(cleanups) {
  const due = dueReviews();
  const up = upcomingReviews(3);
  if (!due.length && !up.length) return null;
  const list = h("div", { class: "stack" });
  const refTargets = [];
  for (const r of due) {
    const host = h("div", { class: "toolhost", hidden: true });
    let bench = null;
    const toggle = h("button", { type: "button", class: "btn" }, "Practise it");
    toggle.addEventListener("click", () => {
      if (bench) { bench.destroy(); bench = null; host.hidden = true; toggle.textContent = "Practise it"; return; }
      host.hidden = false; toggle.textContent = "Close";
      // Reviews are played from memory: the mic checks each note while the app keeps the beat.
      bench = mountBench(host, Object.assign({ compact: true, tabs: ["play", "chart"], tab: "play", checkMe: true, title: r.label }, r.bench || {}));
    });
    cleanups.push(() => bench && bench.destroy());
    const row = h("div", { class: "card flat", style: { padding: "12px" } },
      h("div", { class: "row between" },
        h("div", { class: "stack", style: { gap: "2px" } }, h("b", null, r.label), h("span", { class: "small muted" }, "Learned " + fmtDate(r.learned) + " - review " + (r.stage + 1) + " of 6")),
        h("div", { class: "row" },
          r.bench ? toggle : (r.read ? h("a", { class: "btn", href: "#/read/" + r.read.path + (r.read.anchor ? "#" + r.read.anchor : "") }, "Open") : null),
          h("button", { type: "button", class: "btn primary", onclick: () => { markReview(r.id, true); row.remove(); } }, "Played it well"),
          h("button", { type: "button", class: "btn", onclick: () => { markReview(r.id, false); row.remove(); } }, "Needs work"))),
      r.bench ? host : null);
    refTargets.push([r.id, row]);
    list.append(row);
  }
  referencePlayers(refTargets, cleanups);
  return h("section", { class: "card" },
    h("div", { class: "row between" }, h("h2", null, "Spaced review"), h("span", { class: "chip info" }, due.length + " due")),
    due.length ? h("p", { class: "small muted" }, "Play each piece once from memory. Mark how it went; the next review is scheduled for you.") : h("p", { class: "small muted" }, "Nothing due today."),
    list,
    up.length ? h("p", { class: "small muted" }, "Coming up: " + up.map(u => u.label + " (" + fmtDate(u.next) + ")").join(", ")) : null);
}

// Days since the learner last practised (0 when never).
function daysAway() {
  const dates = [...new Set(getState().log.map(e => e.date))].sort();
  const last = dates[dates.length - 1];
  return last ? daysBetween(last, today()) : 0;
}

// Back after three or more days (redesign W17): the main card on Today, a welcome with no count of
// missed days, Continue to the day where the learner left off, or a gentle start with 5 minutes.
export function welcomeBackCard(cur) {
  if (!getState().startedAt || cur <= 1 || daysAway() < 3) return null;
  return h("section", { class: "resume todayhero welcomeback" },
    h("div", { class: "resume-body" },
      h("h1", { class: "title" }, "Welcome back"),
      h("p", null, "You left off at Day " + cur + "."),
      h("p", { class: "muted" }, "A gentle restart is ready."),
      h("a", { class: "btn primary big", href: dayHref(cur) || "#/session/" + cur }, "Continue"),
      h("a", { class: "btn", href: "#/today/quick" }, "Start with 5 minutes")));
}

// Help when a day keeps not passing (a break is welcomed by welcomeBackCard, as the main card).
export function adaptiveCard(cur) {
  const s = getState(), log = s.log;
  if (!s.startedAt) return null;
  const tries = log.filter(e => e.day === cur && !e.passed).length;
  if (tries >= 2) {
    const day = getDay(cur);
    const bench = day && day.blocks.find(b => b.bench && b.bench.bpm);
    return h("section", { class: "card notice-card" }, h("h2", null, "This day is taking a few tries"),
      h("p", null, "That is normal: " + tries + " sessions on Day " + cur + " so far. Three things usually help:"),
      h("ul", { class: "stack", style: { margin: "0", paddingLeft: "1.2em" } },
        h("li", null, bench ? "Slow down: play the exercises 10 BPM slower (" + Math.max(30, bench.bench.bpm - 10) + " BPM), then build back up." : "Slow down: play everything at a slower tempo, then build back up."),
        h("li", null, "Find the exact problem: ", h("a", { href: "#/skills/tone/check" }, "let the app listen"), " to a long note, or loop the hard bar in the Bench."),
        h("li", null, "Rest a day if your lips or hands are tired; it often clicks the day after.")),
      h("div", { class: "row" }, h("a", { class: "btn", href: "#/skills/fix" }, "Fix a problem"), h("a", { class: "btn", href: "#/session/" + Math.max(0, cur - 1) }, "Practise Day " + Math.max(0, cur - 1) + " again")));
  }
  return null;
}

// One playable melody a week, picked from the songs the learner can already play.
export async function songOfWeekCard() {
  try {
    const { parseSongs } = await import("./songs.js");
    const songs = parseSongs(await fetchDoc("exercises/EX-MEL-practice-melodies.md"));
    let reached = 0;
    for (let n = 0; n <= current(); n++) { const d = getDay(n); if (d && d.lessons) for (const id of d.lessons) reached = Math.max(reached, Number(String(id).replace(/\D/g, "")) || 0); }
    const ready = songs.filter(x => x.lesson <= reached);
    if (!ready.length) return null;
    const week = Math.floor(daysBetween("2026-01-05", today()) / 7);
    const song = ready[((week % ready.length) + ready.length) % ready.length];
    return h("a", { class: "card songlink", href: "#/songs" }, h("span", { class: "eyebrow" }, "Song of the week"), h("b", null, song.id + " " + song.title), h("span", { class: "small muted" }, "A fun extra: play it along with the app; the microphone checks every note."));
  } catch (e) { return null; }
}

// "Last time" from the microphone: something concrete to beat today.
export function lastSessionCard() {
  const day = lastPlayedDay();
  if (!day) return null;
  const r = dayResults(day), bits = [];
  for (const x of r.holds.slice(0, 4)) bits.push(h("li", null, "Longest steady " + (x.key === "any" ? "note" : codeOf(Number(x.key))) + ": ", h("b", null, x.s.toFixed(1) + " s")));
  for (const p of r.plays.slice(-2)) bits.push(h("li", null, p.piece + ": ", h("b", null, p.ok + " of " + p.n + " notes"), " at " + p.bpm + " BPM"));
  for (const e of r.echo.slice(0, 2)) bits.push(h("li", null, "Play back (" + e.label + "): phrases of ", h("b", null, String(e.len)), " notes"));
  for (const t of r.taps.slice(-1)) bits.push(h("li", null, "Tapping: ", h("b", null, Math.round(t.within * 100) + "%"), " within 50 ms"));
  if (!bits.length) return null;
  return h("section", { class: "card lastcard" }, h("div", { class: "row between" }, h("h2", null, "Last time"), h("span", { class: "small muted" }, fmtDate(day))),
    h("ul", { class: "stack", style: { margin: "0", paddingLeft: "1.2em" } }, bits), h("p", { class: "small muted" }, "Try to beat one of these today."));
}

// The learner's own reference recordings for review items (set in the Journal), if any.
// Reads the recordings once; object URLs are released when the view closes.
export async function referencePlayers(targets, cleanups) {
  if (!targets.length) return;
  let recs = [];
  try { recs = await listRecordings(); } catch (e) { return; }
  for (const [itemId, host] of targets) {
    const rec = recs.find(r => r.ref === itemId);
    if (!rec) continue;
    const url = URL.createObjectURL(rec.blob);
    cleanups.push(() => URL.revokeObjectURL(url));
    host.append(h("div", { class: "stack", style: { gap: "2px" } }, h("span", { class: "small muted" }, "Your reference: " + rec.label), h("audio", { controls: true, src: url, preload: "none" })));
  }
}

// The Bench's flute is synthesised; in the first weeks, let the learner hear the real instrument.
export function realBansuriCard() {
  // AAC (.m4a) plays everywhere including iPhones; the original Ogg is the fallback.
  const clip = (src, label) => h("div", { class: "stack", style: { gap: "2px" } }, h("span", { class: "small" }, label),
    h("audio", { controls: true, preload: "none" }, h("source", { src: src.replace(/\.ogg$/, ".m4a"), type: "audio/mp4" }), h("source", { src, type: "audio/ogg" })));
  return h("details", { class: "card" },
    h("summary", null, h("b", null, "Hear a real bansuri"), h("span", { class: "small muted" }, " - what a bamboo flute actually sounds like")),
    // Two sentences, two strings: the second names the library's "Start here" tag, which Hindi glosses.
    h("p", { class: "small muted" }, "The flute sound in the Practice Bench is synthesised: it gets the pitches right, not the breathy bamboo tone. These short, openly licensed recordings are by amateur players (credits in app/audio/CREDITS.txt); some are in other keys than your C flute.",
      " ", "For professional tone, listen to the short tracks marked \"Start here\" in the ",
      h("a", { href: "#/read/08-LISTENING-LIBRARY.md" }, "listening library"), "."),
    h("div", { class: "stack", style: { gap: "2px" } }, h("span", { class: "small" }, "A held Sa, then Sa up to upper Sa and back (sankalp, CC BY 4.0; roguentropy, CC0; Freesound)"),
      h("audio", { controls: true, preload: "none", src: "app/audio/bansuri-sa-middle-octave-sankalp.mp3" }),
      h("audio", { controls: true, preload: "none", src: "app/audio/bansuri-sargam-sa-to-taar-sa-roguentropy.mp3" })),
    clip("app/audio/bansuri-e-bass-sample.ogg", "Bass bansuri in E (1:39)"),
    clip("app/audio/bansuri-small-e-sample.ogg", "Small bansuri in E (0:54)"));
}

export function statsRow() {
  const st = streaks(), tt = totals();
  const todayMin = practiceDates().get(today()) || 0;
  const stat = (v, l) => h("div", { class: "stat" }, h("b", null, String(v)), h("span", null, l));
  return h("div", { class: "stats" },
    stat(st.current, st.current === 1 ? "day streak" : "day streak"),
    stat(fmtMinutes(todayMin), "practised today"),
    stat(tt.daysDone, "days completed"),
    stat(fmtMinutes(tt.minutes), "total practice"));
}

// Where the learner is: progress through the current phase, and the next milestone.
export function journey(n, phase) {
  const plan = getPlan();
  if (!phase) return null;
  const next = plan.phases.find(p => p.firstDay > phase.firstDay);
  const first = phase.firstDay, last = next ? next.firstDay - 1 : lastIndex();
  const len = last - first + 1, done = Math.min(len, Math.max(0, n - first));
  const ms = plan.milestones.find(m => m.day >= n && milestoneState(m.id).status !== "passed");
  return h("div", { class: "journey" },
    h("div", { class: "row between small" },
      h("span", null, h("b", null, "Phase " + phase.id + ": "), "day " + (done + 1) + " of " + len),
      ms ? h("a", { href: "#/milestone/" + ms.id, class: "muted" }, ms.day === n ? ms.id + " " + ms.title + ": today" : ms.id + " " + ms.title + " in " + (ms.day - n) + " day" + (ms.day - n === 1 ? "" : "s")) : null),
    h("div", { class: "progressbar", role: "progressbar", "aria-label": "Progress through phase " + phase.id, "aria-valuemin": "0", "aria-valuemax": String(len), "aria-valuenow": String(done) },
      h("i", { style: { width: (len ? done / len * 100 : 0) + "%" } })));
}
