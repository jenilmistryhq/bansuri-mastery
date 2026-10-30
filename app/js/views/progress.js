// Progress (#/progress): stats, practice calendar, milestones, ear quiz, badges, and a shareable card.
import { h, today, addDays, parseDate, fmtMinutes, toast, store, storeSet } from "../util.js";
import { getState } from "../state.js";
import { totals, streaks, practiceDates, getPlan, getDay, current, milestoneState } from "../course.js";
import { rules } from "../badges.js";
import { holdSummary } from "../livestats.js";
import { codeOf } from "../core/theory.js";
import { levelBar, levelsTable, xpRules } from "../levelui.js";
import { emblem } from "../ui.js";
import { ICON_PATHS } from "../util.js";
import { xpState } from "../xp.js";

export function encodePayload(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = ""; bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function sharePayload(name) {
  const s = getState(), tt = totals(), st = streaks();
  const d = getDay(current());
  const passed = getPlan().milestones.filter(m => milestoneState(m.id).status === "passed").map(m => m.id);
  return { v: 1, n: (name || "").slice(0, 40), d: current(), p: d ? d.phase : 0, s: st.current, b: st.best, m: Math.round(tt.minutes), ms: passed, t: today(), since: s.startedAt || today() };
}

function heatmap() {
  const dates = practiceDates();
  const t = today();
  // 26 columns of weeks; each column runs Sunday to Saturday, ending with this week.
  const start = addDays(t, -(7 * 25 + parseDate(t).getDay()));
  const cells = [];
  for (let i = 0; ; i++) {
    const d = addDays(start, i);
    if (d > t) break;
    const m = dates.get(d) || 0;
    const lv = m === 0 ? "" : m < 20 ? "l1" : m < 45 ? "l2" : "l3";
    cells.push(h("i", { class: [lv, d === t ? "today" : ""].join(" "), title: d + ": " + (m ? fmtMinutes(m) : "no practice") }));
  }
  return h("div", { class: "heat", role: "img", "aria-label": "Practice calendar for the last 26 weeks" }, cells);
}

const SVG = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs, ...kids) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
  kids.forEach(c => c && el.append(c));
  return el;
}

// Minutes practised per week for the last 12 weeks (Monday to Sunday), oldest first.
export function weeklyMinutes(dates, t, n) {
  const d0 = new Date(t + "T00:00:00"), monday = new Date(d0); monday.setDate(d0.getDate() - ((d0.getDay() + 6) % 7));
  const iso = x => x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
  const weeks = [];
  for (let w = n - 1; w >= 0; w--) {
    const start = new Date(monday); start.setDate(monday.getDate() - 7 * w);
    let mins = 0;
    for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); mins += dates.get(iso(d)) || 0; }
    weeks.push({ start: iso(start), mins });
  }
  return weeks;
}

// A bar per week: one series, thin bars with a gap between, rounded tops on the baseline, a value
// on hover (title) and a table for screen readers.
// opts: { what: "Minutes practised" | "XP earned", fmt(v), floor (the smallest scale) }
function weeksChart(weeks, opts) {
  const o = Object.assign({ what: "Minutes practised", fmt: fmtMinutes, floor: 60 }, opts || {});
  // Drawn at about the size it is shown, so the labels stay readable on a phone.
  const W = typeof window !== "undefined" && window.innerWidth < 600 ? Math.max(300, window.innerWidth - 70) : 600, H = W < 600 ? 190 : 170, padL = 40, padB = 22, padT = 10, max = Math.max(o.floor, ...weeks.map(w => w.mins));
  const step = (W - padL) / weeks.length, bw = Math.max(6, step - 6), y = v => padT + (H - padT - padB) * (1 - v / max);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "wkchart", role: "img", "aria-label": o.what + " per week, last 12 weeks" });
  const nice = [60, 100, 200, 300, 500, 1000, 2000, 5000].find(n => max / n <= 4) || 10000;
  for (let v = 0; v <= max; v += nice) {
    svg.append(svgEl("line", { x1: padL, x2: W, y1: y(v), y2: y(v), class: "wk-grid" }));
    svg.append(svgEl("text", { x: padL - 6, y: y(v) + 4, class: "wk-tick", "text-anchor": "end" }, document.createTextNode(String(v))));
  }
  weeks.forEach((w, i) => {
    const x = padL + i * step + (step - bw) / 2, top = y(w.mins), base = y(0), hgt = Math.max(0, base - top), r = Math.min(4, hgt);
    const g = svgEl("g", { class: "wk-bar" + (i === weeks.length - 1 ? " now" : "") });
    // A bar with rounded top corners, square on the baseline.
    if (hgt > 0) g.append(svgEl("path", { d: `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${base} Z` }));
    g.append(svgEl("rect", { x: x - 2, y: padT, width: bw + 4, height: H - padT - padB, class: "wk-hit" }));
    g.append(svgEl("title", null, document.createTextNode("Week of " + w.start + ": " + o.fmt(w.mins))));
    if (i % 3 === 2 || i === weeks.length - 1) g.append(svgEl("text", { x: x + bw / 2, y: H - 6, class: "wk-tick", "text-anchor": "middle" }, document.createTextNode(i === weeks.length - 1 ? "this week" : w.start.slice(5).replace("-", "/"))));
    svg.append(g);
  });
  const table = h("table", { class: "sr-only" }, h("caption", null, o.what + " per week"), h("tbody", null, weeks.map(w => h("tr", null, h("td", null, w.start), h("td", null, String(Math.round(w.mins)))))));
  return h("div", null, svg, table);
}

// A small line of one note's daily best holds, with the latest value labelled.
function sparkline(list) {
  const W = 120, H = 28, pts = list.slice(-20), max = Math.max(...pts.map(p => p.s), 1);
  if (pts.length < 2) return null;
  const x = i => 2 + (W - 8) * i / (pts.length - 1), y = v => H - 3 - (H - 6) * v / max;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "spark", role: "img", "aria-label": "Daily best: " + pts.map(p => p.s.toFixed(1) + " s").join(", ") });
  svg.append(svgEl("polyline", { points: pts.map((p, i) => x(i) + "," + y(p.s)).join(" "), class: "spark-line" }));
  svg.append(svgEl("circle", { cx: x(pts.length - 1), cy: y(pts[pts.length - 1].s), r: 3, class: "spark-dot" }));
  return svg;
}

// Level: the bar, XP per week, the latest XP, every named level and how XP is earned.
const XP_SRC = { session: "Session", milestone: "Milestone", lesson: "Lesson", lessonAgain: "Lesson", card: "Flashcard", mastery: "Mastery item", review: "Review", best: "Personal best", play: "Play-along", echo: "Play back", tap: "Tapping", game: "Game", quest: "Quest", recording: "Recording", minutes: "Practice minutes" };
function levelSection() {
  const x = xpState(), days = new Map(Object.entries(x.days || {}));
  const recent = (x.recent || []).slice(0, 8);
  return h("section", { class: "card", id: "level" }, h("h2", null, "Level"), levelBar(),
    h("h3", null, "XP per week"), weeksChart(weeklyMinutes(days, today(), 12), { what: "XP earned", fmt: v => Math.round(v) + " XP", floor: 200 }),
    recent.length ? h("div", null, h("h3", null, "Latest XP"), h("ul", { class: "xprecent" }, recent.map(r => h("li", null, h("b", { class: "mono" }, "+" + r.n), " ", XP_SRC[r.src] || r.src, h("span", { class: "small muted" }, " " + r.d))))) : null,
    h("details", null, h("summary", null, "All levels"), levelsTable()),
    h("details", null, h("summary", null, "How to earn XP"), xpRules()));
}

// Each kind of badge gets its own emblem picture (the medal text stays on it, small).
const BADGE_ICONS = { streak: "flame", hours: "today", ear: "ear", ms: "check", recorder: "mic", archivist: "mic", reviewer: "reset", setup: "settings", "first-day": "wave", "week-one": "today" };
function badgeIcon(id) {
  const key = Object.keys(BADGE_ICONS).find(k => id === k || id.startsWith(k + "-"));
  return ICON_PATHS[BADGE_ICONS[key] || "star"] || ICON_PATHS.star;
}

// M0 to M10 as a path: passed, the next one, and those ahead.
function milestonePath() {
  const ms = getPlan().milestones, cur = current();
  const next = ms.find(m => milestoneState(m.id).status !== "passed");
  return h("ol", { class: "mspath" }, ms.map(m => {
    const st = milestoneState(m.id).status;
    const cls = st === "passed" ? "done" : m === next ? "next" : "ahead";
    return h("li", { class: cls }, h("a", { href: "#/milestone/" + m.id, title: m.title }, h("span", { class: "msdot" }, m.id),
      h("span", { class: "small" }, st === "passed" ? "passed" : m === next ? (m.day <= cur ? "ready" : "in " + (m.day - cur) + " d") : "Day " + m.day)));
  }));
}

export async function render(main) {
  const s = getState(), tt = totals(), st = streaks();
  const page = h("div", { class: "page" });
  const stat = (v, l) => h("div", { class: "stat" }, h("b", null, String(v)), h("span", null, l));
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Progress"), h("h1", null, "How far you have come"),
    s.startedAt ? h("p", { class: "muted" }, "Learning since " + s.startedAt + ".") : h("p", { class: "muted" }, "Start Day 0 to begin tracking.")));
  // One headline (three numbers that matter), then the details in a line.
  page.append(h("section", { class: "card headline" },
    h("div", { class: "bigstats" },
      stat(st.current + (st.current === 1 ? " day" : " days"), "current streak"),
      stat(tt.msPassed + " of " + getPlan().milestones.length, "milestones passed"),
      stat(fmtMinutes(tt.minutes), "total practice")),
    h("p", { class: "small muted" }, "Day " + current() + " of the course - " + tt.practiceDays + " days practised - best streak " + st.best + " days")));

  page.append(levelSection());
  page.append(h("section", { class: "card" }, h("h2", null, "Milestones"), milestonePath()));
  page.append(h("section", { class: "card" }, h("h2", null, "Minutes per week"), weeksChart(weeklyMinutes(practiceDates(), today(), 12))));
  page.append(h("section", { class: "card" }, h("h2", null, "Practice calendar"), heatmap(),
    h("p", { class: "small muted" }, "Darker = longer practice (under 20, under 45, 45+ minutes). Regular short practice beats occasional long practice.")));

  // Ear quiz.
  const ear = Object.entries(s.ear);
  if (ear.length) {
    page.append(h("section", { class: "card" }, h("h2", null, "Ear quiz"),
      h("div", { class: "stack" }, ear.sort().map(([lv, e]) => h("div", { class: "row between" }, h("span", null, "Level " + lv),
        h("span", { class: "mono" }, e.right + " / " + e.total + " (" + (e.total ? Math.round(100 * e.right / e.total) : 0) + "%)"))))));
  }

  // What the microphone measured: long tones, play back, play-along, tapping.
  const holds = holdSummary(), L = s.live;
  const echo = Object.entries(L.echo), plays = L.plays.slice(-5).reverse(), taps = L.taps.slice(-3).reverse();
  if (holds.length || echo.length || plays.length || taps.length) {
    const bar = (v, max) => h("span", { class: "minibar", "aria-hidden": "true" }, h("i", { style: { width: Math.min(100, v / max * 100) + "%" } }));
    const maxHold = Math.max(20, ...holds.map(x => x.best));
    page.append(h("section", { class: "card" }, h("h2", null, "Your playing"),
      h("p", { class: "small muted" }, "Measured by the microphone in sessions, the bench and milestone checks."),
      holds.length ? h("div", { class: "stack" }, h("h3", null, "Longest steady hold"),
        holds.map(x => h("div", { class: "liverow" },
          h("b", { class: "mono" }, x.key === "any" ? "any" : codeOf(Number(x.key))),
          sparkline(s.live.holds[x.key]) || bar(x.best, maxHold),
          h("span", { class: "small" }, "best " + x.best.toFixed(1) + " s" + (x.days > 1 && x.last > x.first ? ", up from " + x.first.toFixed(1) : ""))))) : null,
      echo.length ? h("div", { class: "stack" }, h("h3", null, "Play back"),
        echo.map(([, e]) => h("div", { class: "row between" }, h("span", null, e.label), h("span", { class: "small mono" }, "longest phrase " + e.best + " - " + e.right + "/" + e.total + " right")))) : null,
      plays.length ? h("div", { class: "stack" }, h("h3", null, "Play along (latest)"),
        plays.map(p => h("div", { class: "row between" }, h("span", null, p.piece), h("span", { class: "small mono" }, p.ok + "/" + p.n + " notes" + (p.timed ? ", " + p.onTime + "/" + p.timed + " on the beat" : "") + " at " + p.bpm + " BPM")))) : null,
      taps.length ? h("div", { class: "stack" }, h("h3", null, "Tap the beat (latest)"),
        taps.map(t => h("div", { class: "row between" }, h("span", null, t.bpm + " BPM" + (t.silent ? " with silent bars" : "")), h("span", { class: "small mono" }, Math.round(t.within * 100) + "% within 50 ms, spread " + t.spread + " ms")))) : null));
  }

  // Badges.
  const list = rules();
  const earned = list.filter(r => s.badges[r.id]).length;
  page.append(h("section", { class: "card" }, h("div", { class: "row between" }, h("h2", null, "Badges"), h("span", { class: "chip info" }, earned + " of " + list.length)),
    h("div", { class: "badges" }, list.map(r => h("div", { class: "badge" + (s.badges[r.id] ? " earned" : "") },
      h("span", { class: "medalwrap" }, emblem(badgeIcon(r.id), !!s.badges[r.id]), h("span", { class: "medaltxt", "aria-hidden": "true" }, r.medal)), h("b", null, r.title), h("span", { class: "small muted" }, s.badges[r.id] ? "Earned " + s.badges[r.id] : r.desc))))));

  // Share.
  const nameIn = h("input", { class: "input", id: "sh-name", maxlength: "40", placeholder: "Your first name (optional)", value: store("bansuri.shareName", "") });
  const out = h("div", { class: "stack" });
  const make = () => {
    storeSet("bansuri.shareName", nameIn.value.trim());
    const url = location.href.split("#")[0] + "#/share/" + encodePayload(sharePayload(nameIn.value.trim()));
    const linkBox = h("input", { class: "input", readonly: true, value: url, "aria-label": "Share link" });
    const copy = h("button", { type: "button", class: "btn" }, "Copy link");
    copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(url); toast("Link copied."); } catch (e) { linkBox.select(); toast("Select the link and copy it."); } });
    const native = navigator.share ? h("button", { type: "button", class: "btn primary", onclick: () => navigator.share({ title: "My bansuri progress", url }).catch(() => {}) }, "Share") : null;
    out.replaceChildren(linkBox, h("div", { class: "row" }, copy, native, h("a", { class: "btn", href: "#/share/" + url.split("#/share/")[1] }, "Preview the card")));
  };
  page.append(h("section", { class: "card" }, h("h2", null, "Share your progress"),
    h("p", { class: "small muted" }, "Creates a link to a progress card. The data travels inside the link itself; nothing is uploaded. Anyone with the link sees your day, streak, practice time and milestones."),
    h("div", { class: "row" }, h("div", { style: { flex: "1 1 220px" } }, nameIn), h("button", { type: "button", class: "btn primary", onclick: make }, "Create link")), out));
  main.append(page);
}
