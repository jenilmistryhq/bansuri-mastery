// Boot, layout and hash router.
import { stopPlayable } from "./playable.js";
import { recordLive, bestHold } from "./livestats.js";
import { advanceQuests, celebrate } from "./fun.js";
import { codeOf } from "./core/theory.js";
import { installErrorLog, logError } from "./errors.js";
import { h, icon, clear, toast } from "./util.js";
import { getSettings, onSettings } from "./core/settings.js";
import { setDict, observe } from "./core/i18n.js";
import { setSpeaker } from "./core/live.js";
import { onBeat } from "./core/audio.js";
import { say } from "./voice.js";
import { award, onXp, levelOf, xpState, markLevelSeen } from "./xp.js";
import { floatXp } from "./levelui.js";
installErrorLog();
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
    done.forEach(q => { celebrate("Quest complete: " + q.text + " (+20)"); say("quest_done"); });
  } catch (err) { logError(err && err.message ? err.message : String(err), "live result"); }
});
import { getState, onChange, isStorageOk } from "./state.js";
import { loadPlan, getDay, current } from "./course.js";
import { evaluate as evaluateBadges } from "./badges.js";

const ROUTES = [
  [/^\/?$/, "today"], [/^\/today$/, "today"], [/^\/day\/(\d+)$/, "today"], [/^\/session\/(\d+)$/, "session"],
  [/^\/plan$/, "plan"], [/^\/read\/(.+)$/, "reader"], [/^\/library$/, "library"], [/^\/milestone\/(M\d+)$/, "milestone"],
  [/^\/journal$/, "journal"], [/^\/progress$/, "progress"], [/^\/share\/([A-Za-z0-9_-]+)$/, "share"],
  [/^\/bench$/, "bench"], [/^\/settings$/, "settings"], [/^\/coach$/, "coach"], [/^\/songs$/, "songs"],
  [/^\/play$/, "play"], [/^\/challenge\/([A-Za-z0-9_-]+)$/, "challenge"], [/^\/compose$/, "compose"], [/^\/quick$/, "quick"], [/^\/listen$/, "listen"], [/^\/teacher(\/coach)?$/, "coach"],
];
// Five tabs; related screens sit together under one tab, with a small menu at the top of each.
const NAV = [["today", "#/today", "Today"], ["plan", "#/plan", "Course"], ["bench", "#/bench", "Practice"], ["play", "#/play", "Play"], ["progress", "#/progress", "Me"]];
const NAV_ICON = { today: "today", plan: "plan", bench: "bench", play: "play", progress: "me", listen: "listen" };
const GROUPS = {
  plan: [["plan", "#/plan", "Course map"], ["library", "#/library", "Library"]],
  bench: [["bench", "#/bench", "Bench"], ["coach", "#/coach", "Coach"], ["listen", "#/listen", "Listen"], ["songs", "#/songs", "Songs"]],
  play: [["play", "#/play", "Games"], ["compose", "#/compose", "Make a melody"], ["quick", "#/quick", "5 minutes"]],
  progress: [["progress", "#/progress", "Progress"], ["journal", "#/journal", "Journal"], ["settings", "#/settings", "Settings"]],
};
// Which tab a screen belongs to.
const TAB_OF = { today: "today", session: "today", plan: "plan", library: "plan", reader: "plan", milestone: "plan", bench: "bench", coach: "bench", listen: "bench", songs: "bench", play: "play", challenge: "play", compose: "play", quick: "play", progress: "progress", journal: "progress", settings: "progress", share: "progress" };
// Simple mode: three big choices, no reading needed.
const NAV_SIMPLE = [["today", "#/today", "Practice"], ["play", "#/play", "Play"], ["listen", "#/listen", "Listen"]];

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
  root.lang = s.lang === "hi" ? "hi" : "en";
}

// XP earned floats up from the level badge; a new level is celebrated, and spoken.
let levelPill = null;
function showLevel() {
  if (!levelPill) return;
  const lv = levelOf(xpState().total);
  levelPill.textContent = "Lv " + lv.level;
  levelPill.title = "Level " + lv.level + " [" + lv.name + "], " + lv.xp.toLocaleString() + " XP";
  levelPill.setAttribute("aria-label", levelPill.title);
}
onXp(({ gained, level, leveledUp }) => {
  floatXp(gained);
  showLevel();
  if (leveledUp) { celebrate("Level " + level.level + ": " + level.name + "!"); say("level_reached"); markLevelSeen(); }
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

function shell() {
  const app = document.getElementById("app");
  dayPill = h("a", { class: "daypill", href: "#/today" }, "");
  const top = h("header", { class: "topbar" },
    h("a", { class: "brand", href: "#/today", "aria-label": "Bansuri Mastery, today" }, h("img", { src: "app/icon.svg", alt: "" }), h("b", null, "Bansuri Mastery")),
    h("span", { class: "spacer" }),
    h("span", { class: "statuspills" }, dayPill, (levelPill = h("a", { class: "levelpill", href: "#/progress#level" }, ""))),
    h("a", { class: "iconbtn", href: "#/settings", title: "Settings" }, icon("settings", "Settings")));
  navEl = h("nav", { class: "tabbar", "aria-label": "Main" }, (getSettings().simple ? NAV_SIMPLE : NAV).map(([k, href, label]) => h("a", { href, dataset: { k } }, icon(NAV_ICON[k] || k), h("span", null, label))));
  mainEl = h("main", { id: "main", tabindex: "-1" });
  clear(app).append(top, h("div", { class: "layout" }, navEl, mainEl));
}

function updateChrome(viewName) {
  const n = current();
  const d = getDay(n);
  dayPill.textContent = d ? (d.kind === "milestone" ? "Milestone " + d.milestone : "Day " + n) : "Day " + n;
  for (const a of navEl.querySelectorAll("a")) {
    const on = a.dataset.k === viewName || a.dataset.k === TAB_OF[viewName];
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
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
  const { path, anchor } = parseHash();
  let view = "today", params = [];
  for (const [re, name] of ROUTES) { const m = re.exec(path); if (m) { view = name; params = m.slice(1); break; } }
  if (cleanup) { try { cleanup(); } catch (e) { /* view cleanup errors are not fatal */ } cleanup = null; }
  stopPlayable();
  updateChrome(view);
  clear(mainEl).append(h("div", { class: "boot" }, "Loading..."));
  try {
    const mod = await import("./views/" + (view === "challenge" ? "play" : view) + ".js");
    if (token !== routeToken) return;
    clear(mainEl);
    const ret = await mod.render(mainEl, { params, anchor, view });
    if (token !== routeToken) { if (typeof ret === "function") ret(); return; }
    cleanup = typeof ret === "function" ? ret : null;
    // The small menu of the tab's other screens.
    const group = !getSettings().simple && GROUPS[TAB_OF[view]];
    if (group) mainEl.prepend(h("nav", { class: "subnav", "aria-label": "In this section" }, group.map(([k, href, label]) => h("a", { href, "aria-current": k === view || (view === "challenge" && k === "play") || (view === "reader" && k === "library") ? "page" : null }, label))));
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
      h("div", { class: "row" }, mismatch ? h("button", { type: "button", class: "btn primary", onclick: freshReload }, "Update and reload") : null, h("a", { href: "#/today" }, "Back to today")))));
  }
}

let evaluating = false;
function afterChange() {
  if (evaluating) return;
  evaluating = true;
  try { evaluateBadges(); } catch (e) { console.warn("Badge check failed", e); } finally { evaluating = false; }
  updateChrome(parseHash().path.split("/")[1] || "today");
  showLevel();
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
  let wasSimple = getSettings().simple, wasLang = getSettings().lang;
  onSettings(s => { applyAccess(); if (s.simple !== wasSimple || s.lang !== wasLang) { wasSimple = s.simple; wasLang = s.lang; location.reload(); } });
  shell();
  try { await loadPlan(); }
  catch (e) {
    clear(mainEl).append(h("div", { class: "page" }, h("div", { class: "card" }, h("h2", null, "The course plan could not be loaded"), h("p", null, String(e.message)), h("p", null, "If you opened index.html straight from a folder, serve it instead: run ", h("code", null, "python -m http.server"), " in the project folder and open http://localhost:8000."))));
    return;
  }
  onChange(() => { applyTheme(); afterChange(); });
  window.addEventListener("hashchange", route);
  await route();
  showLevel();
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
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        if (w) w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offerUpdate(w); });
      });
    }).catch(() => { /* offline support is optional */ });
  }
}

boot();
