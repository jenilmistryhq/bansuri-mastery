// Today's cards: the dashboard (profile strip, Resume, quick actions), weak spots, last week, the
// install offer, and the side cards (reviews, help, song of the week, last time, backup, a real bansuri).
import { h, fmtDate, fmtMinutes } from "../util.js";
import { getState, update } from "../state.js";
import { daysBetween, addDays } from "../util.js";
import { listRecordings } from "../recorder.js";
import { getDay, current, milestoneState, dueReviews, upcomingReviews, markReview, streaks, totals, practiceDates, lastIndex, getPlan } from "../course.js";
import { today } from "../util.js";
import { mountBench } from "../bench/bench.js";
import { fetchDoc } from "../content.js";
import { dayResults, lastPlayedDay } from "../livestats.js";
import { questState } from "../fun.js";
import { codeOf } from "../core/theory.js";
import { getSettings } from "../core/settings.js";
import { icon } from "../util.js";
import { stepMeta } from "../steps.js";
import { ring, weekStrip } from "../ui.js";
import { saveBackup } from "../backup.js";
import { levelOf, xpState } from "../xp.js";

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
  const bench = (tab, extra) => () => { try { localStorage.setItem("bansuri.bench.tab", JSON.stringify(tab)); for (const [k, v] of Object.entries(extra || {})) localStorage.setItem("bansuri.bench." + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } location.hash = "#/bench"; };
  for (const [k, list] of Object.entries(L.holds || {})) {
    if (k === "any" || !list.length) continue;
    const last = list[list.length - 1];
    if (last.s < 5) out.push({ score: last.s / 5, text: "Hold " + codeOf(Number(k)) + " longer: your best lately is " + last.s.toFixed(1) + " s", label: "Long tones", go: bench("tones", { "live.toneNote": k }) });
  }
  const pieces = {};
  for (const p of (L.plays || []).filter(x => x.d >= since && x.n)) { const q = pieces[p.piece] || (pieces[p.piece] = { ok: 0, n: 0 }); q.ok += p.ok; q.n += p.n; }
  for (const [piece, q] of Object.entries(pieces)) if (q.ok / q.n < 0.75) out.push({ score: q.ok / q.n, text: piece + ": " + Math.round(q.ok / q.n * 100) + "% of notes right lately. Try it 10 BPM slower.", label: "Play it", go: () => { location.hash = "#/songs"; } });
  for (const e of Object.values(L.echo || {})) if (e.total >= 5 && e.right / e.total < 0.5) out.push({ score: e.right / e.total, text: "Play back (" + e.label + "): " + e.right + " of " + e.total + " right", label: "Play back", go: bench("echo") });
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

// After a few days: install the app (a home-screen icon, full screen, reminders). On iPhone the
// browser has no install button, so the steps are shown instead.
// On iPhone, Safari deletes a website's saved data after about 7 days without a visit, unless the
// app is on the home screen. So there the offer comes from Day 1, says why, and comes back weekly.
export const iosBrowser = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) && !navigator.standalone;

export function installCard() {
  const s = getState();
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent), evt = window.__installEvent;
  if (current() < (ios ? 1 : 3) || (s.prefs.installDismissed && !(ios && daysBetween(s.prefs.installDismissed === true ? today() : s.prefs.installDismissed, today()) >= 7))) return null;
  if (!ios && !evt) return null;
  const card = h("section", { class: "card installcard" },
    h("div", { class: "row between" }, h("h2", null, "Put the app on your home screen"),
      h("button", { type: "button", class: "btn ghost small", "aria-label": "Not now", onclick: () => { update(st => { st.prefs.installDismissed = today(); }); card.remove(); } }, "Not now")),
    ios ? h("p", { class: "small" }, h("b", null, "Keeps your progress safe: "), "on iPhone, Safari deletes a website's saved data when it is not opened for about a week. On the home screen, the app keeps it.")
      : h("p", { class: "small muted" }, "One tap to practise, full screen, works offline, and daily reminders can reach you."),
    ios ? h("p", { class: "small" }, "In Safari, tap the Share button, then \"Add to Home Screen\".")
      : h("button", { type: "button", class: "btn primary", onclick: async () => { evt.prompt(); const r = await evt.userChoice.catch(() => null); if (r && r.outcome === "accepted") card.remove(); } }, "Install the app"));
  return card;
}
const parseDateLocal = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

// "Resume": the day, how far into it you are, the next step, and one button that goes straight there.
export function resumeCard(n, day, ds, phase, action) {
  const done = Object.values(ds.blocks || {}).filter(Boolean).length, total = day.blocks.length;
  const next = day.blocks.find(b => !(ds.blocks || {})[b.id]);
  const pct = total ? done / total * 100 : 0;
  const st = streaks();
  return h("section", { class: "resume" },
    ring(pct, done + "/" + total, { size: 76, stroke: 8, cls: "resume-ring" }),
    h("div", { class: "resume-body" },
      h("span", { class: "row resume-top" }, h("span", { class: "small muted" }, "Today"),
        h("a", { class: "streakchip" + (st.current ? " lit" : ""), href: "#/progress", title: "Practice streak" }, icon("flame"), h("b", null, String(st.current)), h("span", { class: "small" }, st.current === 1 ? " day" : " days"))),
      h("h1", { class: "title" }, "Day " + n + ": " + (day.title || "")),
      h("span", { class: "small muted" }, (done ? "Next: " : "First: ") + (next ? (next.label || stepMeta(next).name) + (next.minutes ? ", " + next.minutes + " min" : "") : "all steps done") + " - about " + (day.minutes || 0) + " min in all"),
      action),
    journey(n, phase));
}

// Your progress in one card: level and how far to the next (in days, not XP), this week, quests.
export function progressCard() {
  const lv = levelOf(xpState().total), x = xpState(), t = today();
  let recent = 0; for (let i = 0; i < 14; i++) recent += (x.days || {})[addDays(t, -i)] || 0;
  const perDay = recent / 14, daysLeft = lv.next && perDay > 0 ? Math.ceil((lv.to - lv.xp) / perDay) : null;
  const qs = questState(), left = qs.list.filter(q => !q.done);
  return h("section", { class: "card progresscard" },
    h("a", { class: "profile-level", href: "#/progress" },
      h("span", { class: "levelbadge", "aria-hidden": "true" }, String(lv.level)),
      h("span", { class: "profile-text" }, h("b", null, "Level " + lv.level + " "), h("span", { class: "leveltitle" }, lv.name),
        h("span", { class: "progressbar levelbar thin", role: "progressbar", "aria-label": "Toward the next level", "aria-valuemin": "0", "aria-valuemax": String(lv.need || 1), "aria-valuenow": String(lv.into) }, h("i", { style: { width: lv.pct + "%" } })),
        h("span", { class: "small muted" }, !lv.next ? "The highest level" : daysLeft ? "About " + daysLeft + (daysLeft === 1 ? " day" : " days") + " to Level " + lv.next.level + " at your pace" : (lv.to - lv.xp).toLocaleString() + " XP to Level " + lv.next.level))),
    weekStrip(new Set(practiceDates().keys())),
    h("a", { class: "questline small", href: "#/play" }, left.length ? "Quests: " + (qs.list.length - left.length) + " of " + qs.list.length + " done. Next: " + left[0].text : "All of today's quests are done."));
}

// One tap to the tools used most.
export function quickActions() {
  const a = (href, ic, label) => h("a", { class: "quickact", href }, h("span", { class: "quickicon", "aria-hidden": "true" }, icon(ic)), h("span", null, label));
  return h("nav", { class: "quickacts", "aria-label": "Quick actions" },
    a("#/bench", "bench", "Flute and tuner"), a("#/tone", "coach", "Tone check"), getSettings().focus ? a("#/coach", "coach", "Coach") : a("#/play", "star", "Play a game"),
    a("#/songs", "note", "Songs"), a("#/listen", "listen", "Listen"), a("#/quick", "today", "5 minutes"));
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

// Help when a day keeps not passing, and a gentle restart after a break.
export function adaptiveCard(cur) {
  const s = getState(), log = s.log;
  if (!s.startedAt) return null;
  const tries = log.filter(e => e.day === cur && !e.passed).length;
  const dates = [...new Set(log.map(e => e.date))].sort();
  const last = dates[dates.length - 1];
  const away = last ? daysBetween(last, today()) : 0;
  if (away >= 4 && cur > 1) {
    return h("section", { class: "card notice-card" }, h("h2", null, "Welcome back"),
      h("p", null, "It has been " + away + " days. Fingers and lips forget quickly but return quickly too: start with a short review of the last day you did, then carry on."),
      h("div", { class: "row" }, h("a", { class: "btn primary", href: "#/session/" + (cur - 1) }, "Review Day " + (cur - 1) + " first"), h("a", { class: "btn", href: "#/session/" + cur }, "Go straight to Day " + cur)));
  }
  if (tries >= 2) {
    const day = getDay(cur);
    const bench = day && day.blocks.find(b => b.bench && b.bench.bpm);
    return h("section", { class: "card notice-card" }, h("h2", null, "This day is taking a few tries"),
      h("p", null, "That is normal: " + tries + " sessions on Day " + cur + " so far. Three things usually help:"),
      h("ul", { class: "stack", style: { margin: "0", paddingLeft: "1.2em" } },
        h("li", null, bench ? "Slow down: play the exercises 10 BPM slower (" + Math.max(30, bench.bench.bpm - 10) + " BPM), then build back up." : "Slow down: play everything at a slower tempo, then build back up."),
        h("li", null, "Find the exact problem: ", h("a", { href: "#/coach" }, "let the Coach listen"), " to a long note, or loop the hard bar in the Bench."),
        h("li", null, "Rest a day if your lips or hands are tired; it often clicks the day after.")),
      h("div", { class: "row" }, h("a", { class: "btn", href: "#/coach" }, "Open the Coach"), h("a", { class: "btn", href: "#/session/" + Math.max(0, cur - 1) }, "Practise Day " + Math.max(0, cur - 1) + " again")));
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

// Everything lives in this browser, so remind the learner to export a backup about once a week.
export function backupNudge() {
  const s = getState();
  if (!s.startedAt) return null;
  const t = today();
  const since = s.lastBackup || s.startedAt;
  // In Safari on iPhone (not installed) progress is at more risk: remind every 3 days there.
  if (daysBetween(since, t) < (iosBrowser() ? 3 : 7)) return null;
  if (s.prefs.backupSnooze && s.prefs.backupSnooze > t) return null;
  const box = h("div", { class: "notice row between" },
    h("span", null, h("b", null, "Back up your progress. "), s.lastBackup ? "Your last backup was " + daysBetween(s.lastBackup, t) + " days ago." : "You have not made a backup yet. Your progress lives only in this browser."),
    h("span", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: async () => { const how = await saveBackup(); if (how !== "cancelled") box.remove(); } }, "Back up now"),
      h("button", { type: "button", class: "btn ghost", onclick: () => { update(st => { st.prefs.backupSnooze = addDays(t, 7); }); box.remove(); } }, "Remind me in a week")));
  return box;
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
    h("p", { class: "small muted" }, "The flute sound in the Practice Bench is synthesised: it gets the pitches right, not the breathy bamboo tone. These short, openly licensed recordings are by amateur players (credits in app/audio/CREDITS.txt); some are in other keys than your C flute. For professional tone, listen to the short \"start here\" tracks in the ",
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
