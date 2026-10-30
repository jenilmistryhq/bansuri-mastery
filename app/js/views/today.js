// Today (#/today) and any single day (#/day/<n>).
import { h, fmtDate, fmtMinutes } from "../util.js";
import { getState, update } from "../state.js";
import { daysBetween, addDays } from "../util.js";
import { listRecordings } from "../recorder.js";
import { getDay, current, dayState, phaseOf, lessonInfo, milestoneInfo, milestoneState, dueReviews, upcomingReviews, markReview, streaks, totals, practiceDates, lastIndex, getPlan } from "../course.js";
import { today } from "../util.js";
import { mountBench } from "../bench/bench.js";
import { renderInline } from "../content.js";
import { dayResults, lastPlayedDay } from "../livestats.js";
import { codeOf } from "../core/theory.js";
import { makePlayable } from "../playable.js";

const KIND_LABEL = { setup: "Setup day", review: "Review day", milestone: "Milestone", practice: "Practice day" };

export function blockLines(day) {
  const list = h("div", { class: "blocklist" }, day.blocks.map(b => h("div", { class: "blockline" },
    h("span", { class: "tag " + b.id }, b.id === "READ" ? "Read" : b.id === "TEST" ? "Test" : b.id),
    h("div", { class: "stack", style: { gap: "4px" } },
      h("b", null, b.label),
      h("span", { class: "small" }, renderInline(b.text || "", "phases/README.md")),
      b.read && b.read.length ? h("div", { class: "linklist" }, b.read.map(r => h("a", { href: "#/read/" + r.path + (r.anchor ? "#" + r.anchor : "") }, r.label))) : null),
    h("span", { class: "small muted mono" }, b.minutes ? b.minutes + " min" : ""))));
  makePlayable(list);
  return list;
}

function welcome() {
  return h("section", { class: "card" },
    h("span", { class: "eyebrow" }, "Welcome"),
    h("h2", null, "Learn the bansuri one day at a time"),
    h("ol", { class: "welcome-steps" },
      h("li", null, h("span", null, h("b", null, "Day 0 sets you up: "), "check your flute, find Sa, and get the tanpura, metronome and tuner ready.")),
      h("li", null, h("span", null, h("b", null, "Each day is a guided session "), "of about 45-60 minutes: warm-up, tone, technique, music, ear training and a short log. Timers and tools are built in.")),
      h("li", null, h("span", null, h("b", null, "Milestones prove progress. "), "You move on by passing practical tests, not by the calendar. A failed test tells you exactly what to practise.")),
      h("li", null, h("span", null, h("b", null, "Your progress stays on this device. "), "Export a backup in Settings to move it to another device."))),
    h("p", { class: "small muted" }, "Built for a 6-hole C natural medium bansuri (Sa = C5). Using another flute? Set its Sa in ", h("a", { href: "#/settings" }, "Settings"), "."));
}

function reviewsCard(cleanups) {
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

// "Last time" from the microphone: something concrete to beat today.
function lastSessionCard() {
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

// Everything lives in this browser, so remind the learner to export a backup about once a week.
function backupNudge() {
  const s = getState();
  if (!s.startedAt) return null;
  const t = today();
  const since = s.lastBackup || s.startedAt;
  if (daysBetween(since, t) < 7) return null;
  if (s.prefs.backupSnooze && s.prefs.backupSnooze > t) return null;
  const box = h("div", { class: "notice row between" },
    h("span", null, h("b", null, "Back up your progress. "), s.lastBackup ? "Your last backup was " + daysBetween(s.lastBackup, t) + " days ago." : "You have not made a backup yet. Your progress lives only in this browser."),
    h("span", { class: "row" }, h("a", { class: "btn primary", href: "#/settings" }, "Back up now"),
      h("button", { type: "button", class: "btn ghost", onclick: () => { update(st => { st.prefs.backupSnooze = addDays(t, 7); }); box.remove(); } }, "Remind me in a week")));
  return box;
}

// The learner's own reference recordings for review items (set in the Journal), if any.
// Reads the recordings once; object URLs are released when the view closes.
async function referencePlayers(targets, cleanups) {
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
function realBansuriCard() {
  // AAC (.m4a) plays everywhere including iPhones; the original Ogg is the fallback.
  const clip = (src, label) => h("div", { class: "stack", style: { gap: "2px" } }, h("span", { class: "small" }, label),
    h("audio", { controls: true, preload: "none" }, h("source", { src: src.replace(/\.ogg$/, ".m4a"), type: "audio/mp4" }), h("source", { src, type: "audio/ogg" })));
  return h("details", { class: "card" },
    h("summary", null, h("b", null, "Hear a real bansuri"), h("span", { class: "small muted" }, " - what a bamboo flute actually sounds like")),
    h("p", { class: "small muted" }, "The flute sound in the Practice Bench is synthesised: it gets the pitches right, not the breathy bamboo tone. These two short public-domain samples (by Prithoo, Wikimedia Commons) are amateur recordings in E, so they sound a little higher or lower than your C flute. For professional tone, listen to the short \"start here\" tracks in the ",
      h("a", { href: "#/read/08-LISTENING-LIBRARY.md" }, "listening library"), "."),
    clip("app/audio/bansuri-e-bass-sample.ogg", "Bass bansuri in E (1:39)"),
    clip("app/audio/bansuri-small-e-sample.ogg", "Small bansuri in E (0:54)"));
}

function statsRow() {
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
function journey(n, phase) {
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

  if (isToday && !s.startedAt && cur === 0) page.append(welcome());

  // Status and primary action.
  let statusChip, action;
  const blocksDone = Object.values(ds.blocks || {}).filter(Boolean).length;
  if (n === cur) {
    statusChip = null; // the page itself says this is today
    const msOpen = day.milestone && milestoneState(day.milestone).status !== "passed";
    const sessionLabel = blocksDone ? "Continue the session (" + blocksDone + " of " + day.blocks.length + " done)" : (n === 0 ? "Start Day 0" : "Start today's session");
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

  page.append(h("section", { class: "hero" },
    h("span", { class: "eyebrow" }, (phase ? "Phase " + phase.id + ": " + phase.title : "") + (day.week ? " - Week " + day.week : "") + " - Day " + n + (day.repeatOf !== null ? " (repeats Day " + day.repeatOf + ")" : "")),
    h("h1", { class: "title" }, day.title || ("Day " + n)),
    h("div", { class: "row" }, statusChip, h("span", { class: "chip mutedc" }, KIND_LABEL[day.kind] || "Practice"), day.minutes ? h("span", { class: "chip mutedc" }, "About " + day.minutes + " min") : null,
      day.milestone ? h("a", { class: "chip warn", href: "#/milestone/" + day.milestone }, "Milestone " + day.milestone) : null),
    action,
    isToday ? journey(n, phase) : null));

  if (isToday) {
    const nudge = backupNudge();
    if (nudge) page.append(nudge);
    page.append(statsRow());
    page.append(h("a", { class: "card songlink", href: "#/songs" }, h("b", null, "Songs"), h("span", { class: "small muted" }, "Play along with a melody; the microphone checks every note.")));
    const lastCard = lastSessionCard();
    if (lastCard) page.append(lastCard);
    if (cur <= 42) page.append(realBansuriCard());
    const rc = reviewsCard(cleanups);
    if (rc) page.append(rc);
  }

  // Lessons to read.
  const lessons = (day.lessons || []).map(id => [id, lessonInfo(id)]).filter(([, l]) => l);
  if (lessons.length) {
    page.append(h("section", { class: "card" }, h("h2", null, "Read for this day"),
      h("div", { class: "stack" }, lessons.map(([id, l]) => h("a", { href: "#/read/" + l.path }, id + " - " + l.title)))));
  }

  page.append(h("section", { class: "card" },
    h("div", { class: "row between" }, h("h2", null, "The session"), h("span", { class: "small muted" }, day.blocks.reduce((a, b) => a + (b.minutes || 0), 0) + " min planned")),
    blockLines(day),
    day.pass ? h("div", { class: "notice good" }, h("b", null, "Pass check: "), day.pass) : null));

  // Milestone summary.
  if (day.milestone) {
    const info = milestoneInfo(day.milestone);
    const ms = milestoneState(day.milestone);
    page.append(h("section", { class: "card" }, h("h2", null, "Milestone " + day.milestone + ": " + (info ? info.title : "")),
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
