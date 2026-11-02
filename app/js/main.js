// Boot, layout and hash router.
import { stopPlayable } from "./playable.js";
import { recordLive, bestHold } from "./livestats.js";
import { advanceQuests, celebrate } from "./fun.js";
import { codeOf } from "./core/theory.js";
import { installErrorLog, logError, problemReport } from "./errors.js";
import { h, icon, clear, toast } from "./util.js";
import { getSettings, onSettings } from "./core/settings.js";
import { setDict, observe } from "./core/i18n.js";
import { setSpeaker } from "./core/live.js";
import { onBeat } from "./core/audio.js";
import { say, removeSavedVoice } from "./voice.js";
import { award, onXp, levelOf, xpState, markLevelSeen } from "./xp.js";
import { openPalette, installPaletteKey } from "./palette.js";
import { notePractice } from "./reminder.js";
import { createDock } from "./dock.js";
installPaletteKey();
// The browser's install offer is kept so Today can show it at a good moment (after a few days).
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); window.__installEvent = e; });
installErrorLog();
// No Web Audio in this browser: say so once, instead of buttons that silently do nothing.
let noAudioSaid = false;
const noAudio = msg => { if (!noAudioSaid && /audio unavailable/.test(String(msg))) { noAudioSaid = true; toast("This browser cannot play sound. Open the app in Safari, Chrome or Edge to hear the flute.", 6000); } };
window.addEventListener("error", e => noAudio(e.message));
window.addEventListener("unhandledrejection", e => noAudio(e.reason && e.reason.message));
// The shared widgets speak through the app's natural voice (when "Talk to me" is on).
setSpeaker(say);
// Results from the listening exercises (bench, sessions, milestones) are kept in the progress state.
document.addEventListener("bansuri:live", e => {
  try {
    const d = e.detail || {};
    const before = d.type === "hold" ? bestHold(d.target) : 0;
    recordLive(d);
    const done = advanceQuests(d);
    // Experience from measured playing.
    if (d.type === "hold" && before > 0 && d.seconds >= before + 0.3) award("best");
    if (d.type === "echo" && d.correct) award("echo");
    if (d.type === "game") { award("game"); if (d.best && d.score) award("best"); }
    if (d.type === "play" && d.n && d.ok / d.n >= 0.8) award("play");
    if (d.type === "tap" && d.within >= 0.7) award("tap");
    // Celebrate personal bests and finished quests.
    if (d.type === "hold" && before >= 2 && d.seconds >= before + 0.5) { celebrate("New best: " + (d.target === null || d.target === undefined ? "a note" : codeOf(d.target)) + " held " + d.seconds.toFixed(1) + " s!"); say("new_best"); }
    else if (d.type === "game" && d.best && d.score) { celebrate("New best score: " + d.score + "!"); say("new_best"); }
    if (!getSettings().focus) done.forEach(q => { celebrate("Quest complete: " + q.text + " (+20)"); say("quest_done"); });
  } catch (err) { logError(err && err.message ? err.message : String(err), "live result"); }
});
import { getState, onChange, isStorageOk } from "./state.js";
import { loadPlan, getDay, current, dayState } from "./course.js";
import { feedback } from "./review.js";
import { evaluate as evaluateBadges } from "./badges.js";

const ROUTES = [
  // The five places and their sections (see docs/redesign/03-structure.md).
  [/^\/course(?:\/path)?$/, "plan"], [/^\/course\/milestones$/, "milestones"], [/^\/course\/book$/, "library"],
  [/^\/skills$/, "skills"], [/^\/skills\/(tone|notes|rhythm|ornaments|ear)$/, "skills"], [/^\/skills\/games$/, "play"], [/^\/skills\/fix$/, "coach"], [/^\/skills\/fix\/(TS-\d\d)$/, "coach"],
  [/^\/music(?:\/songs)?$/, "songs"], [/^\/music\/ragas$/, "ragas"], [/^\/music\/mine$/, "mine"], [/^\/music\/listen$/, "listen"], [/^\/music\/transcribe$/, "transcribe"], [/^\/music\/compose$/, "compose"],
  [/^\/me$/, "progress"], [/^\/me\/journal$/, "journal"], [/^\/me\/teacher$/, "review"], [/^\/me\/flute$/, "flute"], [/^\/me\/settings$/, "settings"],
  // Me: level and badges, the Journal's and the Teacher's views (level 3), the settings groups, privacy.
  [/^\/me\/(level)$/, "progress"], [/^\/me\/journal\/(days|recordings|capsule)$/, "journal"], [/^\/me\/teacher\/(feedback|students|share)$/, "review"], [/^\/(students)$/, "review"],
  [/^\/me\/settings\/(voice|display|practice|data|help)$/, "settings"], [/^\/me\/privacy$/, "privacy"],
  [/^\/bench\/([a-z]+)$/, "bench"],
  [/^\/?$/, "today"], [/^\/today$/, "today"], [/^\/day\/(\d+)$/, "today"], [/^\/session\/(\d+)$/, "session"],
  [/^\/plan$/, "plan"], [/^\/read\/(.+)$/, "reader"], [/^\/library$/, "library"], [/^\/milestone\/(M\d+)$/, "milestone"],
  [/^\/journal$/, "journal"], [/^\/progress$/, "progress"], [/^\/share\/([A-Za-z0-9_-]+)$/, "share"],
  [/^\/bench$/, "bench"], [/^\/settings$/, "settings"], [/^\/coach$/, "coach"], [/^\/coach\/(TS-\d\d)$/, "coach"], [/^\/songs$/, "songs"],
  [/^\/play$/, "play"], [/^\/play\/([a-z]+)$/, "play"], [/^\/challenge\/([A-Za-z0-9_-]+)$/, "challenge"], [/^\/compose$/, "compose"], [/^\/quick$/, "quick"], [/^\/listen$/, "listen"], [/^\/privacy$/, "privacy"], [/^\/transcribe$/, "transcribe"], [/^\/tone$/, "coach"], [/^\/lesson\/([a-z0-9]+)$/, "lesson"], [/^\/ornaments$/, "ornaments"], [/^\/review$/, "review"], [/^\/review\/([A-Za-z0-9_-]+)$/, "review"], [/^\/feedback\/([A-Za-z0-9_-]+)$/, "feedback"], [/^\/students$/, "students"], [/^\/move\/([A-Za-z0-9_-]+)$/, "move"], [/^\/teacher(\/coach)?$/, "coach"],
];
// Old addresses and where they live now (the view is the same; only the address changes).
const MOVED = { "/plan": "/course", "/library": "/course/book", "/journal": "/me/journal", "/progress": "/me", "/settings": "/me/settings",
  "/coach": "/skills/fix", "/songs": "/music", "/play": "/skills/games", "/compose": "/music/compose", "/listen": "/music/listen",
  "/transcribe": "/music/transcribe", "/review": "/me/teacher" };
// Two levels of navigation. Five places at the bottom (each kind of thing has one home); inside a
// place, its sections as tabs at the top, swiped or tapped. Today has one job, so no sections.
const NAV = [["today", "#/today", "Today"], ["course", "#/course", "Course"], ["skills", "#/skills", "Skills"], ["music", "#/music", "Music"], ["me", "#/me", "Me"]];
const NAV_ICON = { today: "today", course: "plan", skills: "wave", music: "note", me: "me", play: "play", listen: "listen" };
const SECTIONS = {
  course: [["path", "#/course", "Path"], ["milestones", "#/course/milestones", "Milestones"], ["book", "#/course/book", "Book"]],
  skills: [["foryou", "#/skills", "For you"], ["tone", "#/skills/tone", "Tone"], ["notes", "#/skills/notes", "Notes"], ["rhythm", "#/skills/rhythm", "Rhythm"],
    ["ornaments", "#/skills/ornaments", "Ornaments"], ["ear", "#/skills/ear", "Ear"], ["games", "#/skills/games", "Games"], ["fix", "#/skills/fix", "Fix"]],
  music: [["songs", "#/music", "Songs"], ["ragas", "#/music/ragas", "Ragas"], ["mine", "#/music/mine", "Mine"], ["listen", "#/music/listen", "Listen"]],
  me: [["progress", "#/me", "Progress"], ["journal", "#/me/journal", "Journal"], ["teacher", "#/me/teacher", "Teacher"], ["flute", "#/me/flute", "Flute"], ["settings", "#/me/settings", "Settings"]],
};
// The Bench's tabs, by the place and section each one serves.
const BENCH_HOME = { tones: ["skills", "tone"], echo: ["skills", "ear"], ear: ["skills", "ear"], rhythm: ["skills", "rhythm"], chart: ["skills", "notes"], check: ["me", "flute"], play: ["music", "songs"] };
// Which place, and which of its sections, a screen belongs to.
function placeOf(view, params, path) {
  const p = params && params[0];
  switch (view) {
    case "plan": return ["course", "path"];
    case "milestones": case "milestone": return ["course", "milestones"];
    case "library": case "reader": return ["course", "book"];
    case "skills": return ["skills", p || "foryou"];
    case "play": case "challenge": return ["skills", "games"];
    case "coach": return ["skills", /^\/tone/.test(path || "") ? "tone" : "fix"];
    case "ornaments": return ["skills", "ornaments"];
    case "bench": return BENCH_HOME[p] || ["skills", null];
    case "songs": case "transcribe": return ["music", "songs"];
    case "compose": case "mine": return ["music", "mine"];
    case "ragas": return ["music", "ragas"];
    case "listen": return ["music", "listen"];
    case "progress": return ["me", "progress"];
    case "journal": return ["me", "journal"];
    case "review": case "feedback": case "students": case "share": return ["me", "teacher"];
    case "flute": return ["me", "flute"];
    case "settings": case "move": case "privacy": return ["me", "settings"];
    default: return ["today", null];
  }
}
// Focus mode: no games, points or quests (CSS hides most; the Games section goes).
const sectionsOf = place => (SECTIONS[place] || []).filter(([k]) => !(getSettings().focus && k === "games"));
// Simple mode: three big choices, no reading needed.
const NAV_SIMPLE = [["today", "#/today", "Practice"], ["play", "#/play", "Play"], ["listen", "#/listen", "Listen"]];
// The view module that draws a screen, when it is not named after the screen.
const MODULE = { challenge: "play", flute: "settings" };
// Each place remembers its last section, so coming back lands where you were.
const LAST = "bansuri.nav.last";
// Kept in memory for this visit, and saved when storage allows (it can be full or blocked).
const lastSeen = (() => { try { return JSON.parse(localStorage.getItem(LAST) || "{}") || {}; } catch (e) { return {}; } })();
const lastSection = place => lastSeen[place] || null;
const rememberSection = (place, href) => { lastSeen[place] = href; try { localStorage.setItem(LAST, JSON.stringify(lastSeen)); } catch (e) { /* remembered for this visit only */ } };
let here = ["today", null];

let mainEl, navEl, dayPill, cleanup = null, routeToken = 0, updateReady = false;

// Clears the saved copies of the app and reloads from the network: the way out when an update left
// mismatched files (an ES module importing something an older module does not have).
async function freshReload() {
  try {
    if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    if (window.caches) for (const k of await caches.keys()) if (k.startsWith("bansuri-")) await caches.delete(k);
  } catch (e) { /* reload anyway */ }
  location.reload();
}

function applyTheme() {
  const t = getState().prefs.theme;
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
}

// Reading and seeing: text size, an easy-to-read font, high contrast, bigger buttons, Simple mode.
function applyAccess() {
  const s = getSettings(), root = document.documentElement;
  root.style.setProperty("--text-scale", String(s.textSize));
  root.classList.toggle("easyfont", s.easyFont);
  root.classList.toggle("contrast", s.contrast);
  root.classList.toggle("bigtargets", s.bigTargets);
  root.classList.toggle("simple", s.simple);
  // Focus mode: no games, points, levels, badges or quests (CSS hides them; the tab bar swaps Play for Listen).
  root.classList.toggle("focus", s.focus);
  root.lang = s.lang === "hi" ? "hi" : "en";
}

// Points stay quiet (redesign decision 6): no level in the top bar and no "+XP" floating over
// what you play. A new level is still celebrated and spoken, but never over a lesson: one reached
// while the player is open waits until it closes.
let levelWaiting = null;
function celebrateLevel(level) {
  celebrate("Level " + level.level + ": " + level.name + "!"); say("level_reached"); markLevelSeen();
}
function levelLater() {
  if (!levelWaiting || document.documentElement.classList.contains("fullfocus")) return;
  const lv = levelWaiting; levelWaiting = null; celebrateLevel(lv);
}
onXp(({ level, leveledUp }) => {
  if (!leveledUp || getSettings().focus) return;
  if (document.documentElement.classList.contains("fullfocus")) levelWaiting = level;
  else celebrateLevel(level);
});

// Beats seen and felt: a flash at the edge of the screen, and a buzz on phones that can.
let flashEl = null;
onBeat(kind => {
  const s = getSettings();
  if (s.beatFlash) {
    if (!flashEl) { flashEl = h("div", { class: "beatflash", "aria-hidden": "true" }); document.body.append(flashEl); }
    flashEl.classList.remove("on", "sam"); void flashEl.offsetWidth; flashEl.classList.add("on"); if (kind === "sam") flashEl.classList.add("sam");
  }
  if (s.vibrate && navigator.vibrate) { try { navigator.vibrate(kind === "sam" ? 60 : 25); } catch (e) { /* not supported */ } }
});

let dock = null;
// While the microphone listens anywhere, the top bar says so (redesign W legend "(o)").
const micPill = h("span", { class: "micpill", role: "status", hidden: true }, icon("mic"), h("span", null, "Listening"));
document.addEventListener("bansuri:mic", e => { micPill.hidden = !(e.detail && e.detail.on); });

function shell() {
  const app = document.getElementById("app");
  dock = createDock();
  dayPill = h("a", { class: "daypill", href: "#/today" }, "");
  const top = h("header", { class: "topbar" },
    h("a", { class: "brand", href: "#/today", "aria-label": "Bansuri Mastery, today" }, h("img", { src: "app/icon.svg", alt: "" }), h("b", null, "Bansuri Mastery")),
    h("span", { class: "spacer" }),
    h("span", { class: "statuspills" }, dayPill, dock.pill, micPill),
    h("button", { type: "button", class: "iconbtn", title: "Search (press /)", onclick: openPalette }, icon("search", "Search")),
    // Settings is a Me tab now (redesign 03), so the top bar has no gear.
    dock.button);
  navEl = h("nav", { class: "tabbar", "aria-label": "Main" }, (getSettings().simple ? NAV_SIMPLE : NAV).map(([k, href, label]) => h("a", { href, dataset: { k } }, h("span", { class: "tabicon" }, icon(NAV_ICON[k] || k)), h("span", null, label))));
  // On a wide screen, search sits at the top of the rail.
  navEl.prepend(h("button", { type: "button", class: "railsearch", onclick: openPalette }, icon("search"), h("span", null, "Search")));
  arrowKeys(navEl, "a[data-k], .railsecs a");
  // A tap on a place: its last section; on the place you are in: to the top, then to its first section.
  navEl.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest("a[data-k]");
    if (!a || getSettings().simple || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const k = a.dataset.k, first = (sectionsOf(k)[0] || [])[1];
    if (k === here[0]) {
      e.preventDefault();
      if (window.scrollY > 40) window.scrollTo({ top: 0, behavior: "smooth" });
      else if (first && location.hash !== first) location.hash = first;
      return;
    }
    const last = lastSection(k);
    if (last && sectionsOf(k).some(s => s[1] === last)) { e.preventDefault(); location.hash = last; }
  });
  mainEl = h("main", { id: "main", tabindex: "-1" });
  swipeSections(mainEl);
  // Offline (redesign 09, top bar states): a quiet line under the top bar while there is no
  // connection, and a toast when it comes back. Everything opened before keeps working.
  const offline = h("div", { class: "offlinebar", role: "status", hidden: navigator.onLine !== false }, "Offline. What you have opened before still works.");
  window.addEventListener("offline", () => { offline.hidden = false; });
  window.addEventListener("online", () => { if (!offline.hidden) toast("Back online."); offline.hidden = true; });
  clear(app).append(top, offline, h("div", { class: "layout" }, navEl, mainEl), dock.backdrop, dock.sheet);
}

// Teacher feedback the learner has not opened yet puts one dot on Me (redesign 03: one dot at most).
const FB_SEEN = "bansuri.feedback.seen";
function unseenFeedback() {
  let seen = []; try { seen = JSON.parse(localStorage.getItem(FB_SEEN) || "[]"); } catch (e) { /* none seen */ }
  const all = feedback().map(f => f.id || f.date);
  if (here[0] === "me" && here[1] === "teacher") { try { localStorage.setItem(FB_SEEN, JSON.stringify(all)); } catch (e) { /* this visit only */ } return false; }
  return all.some(id => !seen.includes(id));
}

// On a wide screen the rail lists the current place's sections under it, so both levels show at once.
function railSections() {
  for (const old of navEl.querySelectorAll(".railsecs")) old.remove();
  const list = getSettings().simple ? [] : sectionsOf(here[0]);
  const at = navEl.querySelector('a[data-k="' + here[0] + '"]');
  if (!list.length || !at) return;
  at.after(h("div", { class: "railsecs", role: "group", "aria-label": "Sections" }, list.map(([k, href, label]) => h("a", { href, "aria-current": k === here[1] ? "page" : null }, label))));
}

function updateChrome() {
  const n = current();
  const d = getDay(n);
  dayPill.textContent = d ? (d.kind === "milestone" ? "Milestone " + d.milestone : "Day " + n) : "Day " + n;
  // Today's tab carries a ring for how much of today's session is done.
  const todayTab = navEl.querySelector('a[data-k="today"]');
  if (todayTab && d && d.blocks && d.blocks.length) {
    const ds = dayState(n) || {}, done = d.blocks.filter(b => (ds.blocks || {})[b.id]).length;
    todayTab.style.setProperty("--p", String(Math.round(done / d.blocks.length * 100)));
    todayTab.classList.toggle("ringed", done > 0);
  }
  const meTab = navEl.querySelector('a[data-k="me"]');
  if (meTab) meTab.classList.toggle("dotted", unseenFeedback());
  railSections();
  for (const a of navEl.querySelectorAll("a[data-k]")) {
    // Simple mode's three tiles keep their own names (today, play, listen).
    const on = getSettings().simple ? a.dataset.k === (here[0] === "today" ? "today" : here[1] === "games" ? "play" : here[1] === "listen" ? "listen" : "") : a.dataset.k === here[0];
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
}

// Swipe left or right on a place to move to its next or previous section. Not on anything that
// takes its own touches (inputs, canvases, sliders, games, the Bench, scrolling rows).
function swipeSections(el) {
  let x0 = 0, y0 = 0, t0 = 0, ok = false;
  el.addEventListener("touchstart", e => {
    const t = e.touches[0], tgt = e.target;
    ok = e.touches.length === 1 && !!sectionsOf(here[0]).length && !(tgt.closest && tgt.closest("input, textarea, select, canvas, svg, audio, video, [data-noswipe], .game-card, .bb-bench, .sectiontabs, .tablewrap, .bb-tablewrap, pre"));
    x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
  }, { passive: true });
  el.addEventListener("touchend", e => {
    if (!ok) return;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 45 || Date.now() - t0 > 600) return;
    const list = sectionsOf(here[0]), i = list.findIndex(s => s[0] === here[1]);
    if (i < 0) return;
    const next = list[i + (dx < 0 ? 1 : -1)];
    if (next) location.hash = next[1];
  }, { passive: true });
}

// The section tabs of the place a screen belongs to: one row, scrolled so the current one shows.
function sectionTabs() {
  const list = getSettings().simple ? [] : sectionsOf(here[0]);
  if (!list.length) return null;
  const nav = h("nav", { class: "subnav sectiontabs", "aria-label": "Sections" }, list.map(([k, href, label]) => h("a", { href, "aria-current": k === here[1] ? "page" : null }, label)));
  arrowKeys(nav, "a");
  const cur = nav.querySelector("[aria-current]");
  if (cur) requestAnimationFrame(() => { const l = cur.offsetLeft - nav.offsetLeft; if (l + cur.offsetWidth > nav.clientWidth) nav.scrollLeft = l - 24; });
  return nav;
}

// Arrow keys move between the links of a tab row (and Home and End to its ends); Enter opens one.
function arrowKeys(row, sel) {
  row.addEventListener("keydown", e => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    const links = [...row.querySelectorAll(sel)].filter(a => a.offsetParent !== null), i = links.indexOf(document.activeElement);
    if (i < 0) return;
    const step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
    const j = e.key === "Home" ? 0 : e.key === "End" ? links.length - 1 : (i + step + links.length) % links.length;
    e.preventDefault(); links[j].focus();
  });
}

function parseHash() {
  let raw = location.hash.replace(/^#/, "");
  try { raw = decodeURI(raw); } catch (e) { /* keep the raw hash if it is not valid percent-encoding */ }
  raw = raw || "/today";
  const i = raw.indexOf("#");
  return { path: i >= 0 ? raw.slice(0, i) : raw, anchor: i >= 0 ? raw.slice(i + 1) : "" };
}

async function route() {
  // A new version took over while this page was open: load it now, between screens, so the old code
  // in memory never meets newer modules (and an active session is never interrupted).
  if (updateReady) { location.reload(); return; }
  const token = ++routeToken;
  // A level reached during a lesson is celebrated once the lesson has closed.
  setTimeout(levelLater, 0);
  const parsed = parseHash(), anchor = parsed.anchor;
  // Old addresses still work, and the address bar shows the new one (redesign 03, old routes).
  let path = parsed.path;
  const moved = MOVED[path] || (/^\/coach\/(TS-\d\d)$/.test(path) ? "/skills/fix/" + path.slice(7) : null);
  if (moved) { path = moved; try { history.replaceState(history.state, "", "#" + moved + (anchor ? "#" + anchor : "")); } catch (e) { /* the old address stays shown */ } }
  let view = "today", params = [];
  for (const [re, name] of ROUTES) { const m = re.exec(path); if (m) { view = name; params = m.slice(1).filter(x => x !== undefined); break; } }
  if (cleanup) { try { cleanup(); } catch (e) { /* view cleanup errors are not fatal */ } cleanup = null; }
  stopPlayable();
  here = placeOf(view, params, path);
  const sec = sectionsOf(here[0]).find(s => s[0] === here[1]);
  if (sec && "#" + path === sec[1]) rememberSection(here[0], sec[1]);
  updateChrome();
  clear(mainEl).append(h("div", { class: "boot" }, "Loading..."));
  try {
    const mod = await import("./views/" + (MODULE[view] || view) + ".js");
    if (token !== routeToken) return;
    clear(mainEl);
    const ret = await mod.render(mainEl, { params, anchor, view });
    if (token !== routeToken) { if (typeof ret === "function") ret(); return; }
    cleanup = typeof ret === "function" ? ret : null;
    // The place's sections, as tabs at the top.
    const tabs = sectionTabs();
    if (tabs) mainEl.prepend(tabs);
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest(".tabbar, .topbar")) mainEl.focus({ preventScroll: true });
    if (anchor) {
      const target = document.getElementById(anchor);
      if (target) target.scrollIntoView({ block: "start" }); else window.scrollTo(0, 0);
    } else window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    logError(e && e.message ? e.message : String(e), "route " + path);
    const mismatch = /does not provide an export|dynamically imported module|Importing a module script failed/i.test(String(e && e.message));
    clear(mainEl).append(h("div", { class: "page" }, h("div", { class: "card" }, h("h2", null, "Something went wrong"), h("p", null, String(e.message || e)),
      mismatch ? h("p", null, "This usually means an update was only half loaded. Updating fixes it; your progress is kept.") : null,
      h("div", { class: "row" }, mismatch ? h("button", { type: "button", class: "btn primary", onclick: freshReload }, "Update and reload") : null,
        // Report it (redesign 09, error state): the problem report, copied, ready to paste.
        h("button", { type: "button", class: "btn", onclick: async () => {
          try { await navigator.clipboard.writeText(await problemReport()); toast("Problem report copied. Paste it into your bug report."); }
          catch (err) { location.hash = "#/me/settings#g-help"; }
        } }, "Report it"),
        h("a", { href: "#/today" }, "Back to today")))));
  }
}

let evaluating = false;
function afterChange() {
  if (evaluating) return;
  evaluating = true;
  try { evaluateBadges(); } catch (e) { console.warn("Badge check failed", e); } finally { evaluating = false; }
  updateChrome();
}

function offerUpdate(worker) {
  if (document.querySelector(".update-banner")) return;
  const bar = h("div", { class: "toasts update-banner", role: "status" },
    h("div", { class: "toast row between" }, h("span", null, "A new version of the course is ready."),
      h("button", { type: "button", class: "btn primary", onclick: () => { worker.postMessage({ type: "SKIP_WAITING" }); bar.remove(); } }, "Update now")));
  document.body.appendChild(bar);
}

async function boot() {
  applyTheme();
  applyAccess();
  // Hindi: the interface dictionary is loaded before anything renders, then every screen is translated as it appears.
  if (getSettings().lang === "hi") {
    try { setDict(await (await fetch("app/i18n/hi.json")).json()); } catch (e) { console.warn("Hindi dictionary not loaded", e); }
  }
  observe(document.body);
  let wasSimple = getSettings().simple, wasLang = getSettings().lang, wasFocus = getSettings().focus;
  onSettings(s => {
    applyAccess();
    if (s.focus !== wasFocus) { wasFocus = s.focus; location.reload(); return; }
    if (s.simple !== wasSimple || s.lang !== wasLang) {
      const langChanged = s.lang !== wasLang;
      wasSimple = s.simple; wasLang = s.lang;
      // A new language: the other language's saved voice clips are no longer needed.
      (langChanged ? removeSavedVoice(s.lang) : Promise.resolve()).finally(() => location.reload());
    }
  });
  shell();
  try { await loadPlan(); }
  catch (e) {
    clear(mainEl).append(h("div", { class: "page" }, h("div", { class: "card" }, h("h2", null, "The course plan could not be loaded"), h("p", null, String(e.message)), h("p", null, "If you opened index.html straight from a folder, serve it instead: run ", h("code", null, "python -m http.server"), " in the project folder and open http://localhost:8000."))));
    return;
  }
  onChange(s => { applyTheme(); afterChange(); const last = s.log.length ? s.log[s.log.length - 1].date : null; if (last) notePractice(last); });
  window.addEventListener("hashchange", route);
  await route();
  // Ask the browser to keep this site's storage (progress, recordings) even when space runs low or
  // the site is not opened for a while. Granted silently for installed or often-used apps.
  if (getState().startedAt && navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => {});
  // Learners who practised before levels existed: their level (rebuilt from history) is announced once.
  const x = xpState(), lv0 = levelOf(x.total);
  if (!getState().xp) { markLevelSeen(); if (lv0.level > 1) toast("Your practice so far puts you at Level " + lv0.level + ": " + lv0.name + ".", 6000); }
  try { evaluateBadges(); } catch (e) { console.warn("Badge check failed", e); }
  if (!isStorageOk()) toast("This browser is not saving progress (private mode?). Export a backup in Settings.", 6000);
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    // A new service worker takes over at once (see sw.js). Reload at the next screen change; reloading
    // right away could cut off a running session or recording.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController) updateReady = true; });
    navigator.serviceWorker.register("sw.js").then(reg => {
      // Once the app is showing, the rest of the course is saved for offline use in the background.
      navigator.serviceWorker.ready.then(r => { if (r.active) r.active.postMessage({ type: "CACHE_REST" }); }).catch(() => {});
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      // A tab left open keeps its old code: look for a new version every 30 minutes and on
      // coming back to the tab; it takes over at the next screen change.
      const check = () => reg.update().catch(() => {});
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        if (w) w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offerUpdate(w); });
      });
    }).catch(() => { /* offline support is optional */ });
  }
}

boot();
