// Boot, layout and hash router.
import { stopPlayable } from "./playable.js";
import { recordLive, bestHold } from "./livestats.js";
import { advanceQuests, celebrate } from "./fun.js";
import { codeOf } from "./core/theory.js";
import { installErrorLog, logError } from "./errors.js";
import { h, icon, clear, toast } from "./util.js";
installErrorLog();
// Results from the listening exercises (bench, sessions, milestones) are kept in the progress state.
document.addEventListener("bansuri:live", e => {
  try {
    const d = e.detail || {};
    const before = d.type === "hold" ? bestHold(d.target) : 0;
    recordLive(d);
    const done = advanceQuests(d);
    // Celebrate personal bests and finished quests.
    if (d.type === "hold" && before >= 2 && d.seconds >= before + 0.5) celebrate("New best: " + (d.target === null || d.target === undefined ? "a note" : codeOf(d.target)) + " held " + d.seconds.toFixed(1) + " s!");
    else if (d.type === "game" && d.best && d.score) celebrate("New best score: " + d.score + "!");
    done.forEach(q => celebrate("Quest complete: " + q.text + " (+20)"));
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
  [/^\/play$/, "play"], [/^\/challenge\/([A-Za-z0-9_-]+)$/, "challenge"], [/^\/compose$/, "compose"], [/^\/quick$/, "quick"], [/^\/teacher(\/coach)?$/, "coach"],
];
const NAV = [["today", "#/today", "Today"], ["plan", "#/plan", "Course"], ["bench", "#/bench", "Bench"], ["play", "#/play", "Play"], ["coach", "#/coach", "Coach"], ["journal", "#/journal", "Journal"], ["progress", "#/progress", "Progress"]];

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

function shell() {
  const app = document.getElementById("app");
  dayPill = h("a", { class: "daypill", href: "#/today" }, "");
  const top = h("header", { class: "topbar" },
    h("a", { class: "brand", href: "#/today", "aria-label": "Bansuri Mastery, today" }, h("img", { src: "app/icon.svg", alt: "" }), h("b", null, "Bansuri Mastery")),
    h("span", { class: "spacer" }),
    dayPill,
    h("a", { class: "iconbtn", href: "#/library", title: "Course library" }, icon("library", "Course library")),
    h("a", { class: "iconbtn", href: "#/settings", title: "Settings" }, icon("settings", "Settings")));
  navEl = h("nav", { class: "tabbar", "aria-label": "Main" }, NAV.map(([k, href, label]) => h("a", { href, dataset: { k } }, icon(k), h("span", null, label))));
  mainEl = h("main", { id: "main", tabindex: "-1" });
  clear(app).append(top, h("div", { class: "layout" }, navEl, mainEl));
}

function updateChrome(viewName) {
  const n = current();
  const d = getDay(n);
  dayPill.textContent = d ? (d.kind === "milestone" ? "Milestone " + d.milestone : "Day " + n) : "Day " + n;
  for (const a of navEl.querySelectorAll("a")) {
    const on = a.dataset.k === viewName || (viewName === "session" && a.dataset.k === "today") || ((viewName === "reader" || viewName === "library" || viewName === "milestone") && a.dataset.k === "plan");
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
  shell();
  try { await loadPlan(); }
  catch (e) {
    clear(mainEl).append(h("div", { class: "page" }, h("div", { class: "card" }, h("h2", null, "The course plan could not be loaded"), h("p", null, String(e.message)), h("p", null, "If you opened index.html straight from a folder, serve it instead: run ", h("code", null, "python -m http.server"), " in the project folder and open http://localhost:8000."))));
    return;
  }
  onChange(() => { applyTheme(); afterChange(); });
  window.addEventListener("hashchange", route);
  await route();
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
