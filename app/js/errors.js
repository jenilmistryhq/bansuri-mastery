// Local error log: keeps the last few errors in this browser so a learner can copy a problem
// report into a bug report. Nothing is sent anywhere. No progress, notes or recordings are included.
const KEY = "bansuri.errors";
const MAX = 30;

function read() { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function write(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch (e) { /* storage full or blocked */ } }

export function logError(message, detail) {
  const list = read();
  list.push({
    t: new Date().toISOString(),
    route: (location.hash || "#/").split("#").slice(0, 2).join("#").slice(0, 80),
    msg: String(message || "Unknown error").slice(0, 300),
    at: detail ? String(detail).slice(0, 300) : "",
  });
  write(list);
}

export function installErrorLog() {
  window.addEventListener("error", e => {
    if (e.target && e.target !== window && (e.target.src || e.target.href)) { logError("Failed to load " + (e.target.src || e.target.href)); return; }
    logError(e.message, (e.filename || "").replace(location.origin, "") + ":" + (e.lineno || 0) + ":" + (e.colno || 0));
  }, true);
  window.addEventListener("unhandledrejection", e => {
    const r = e.reason;
    logError(r && r.message ? r.message : String(r), r && r.stack ? r.stack.split("\n").slice(0, 3).join(" | ") : "");
  });
}

export function errorList() { return read(); }
export function clearErrors() { write([]); try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

export async function problemReport() {
  let version = "unknown";
  try { version = (await (await fetch("app/data/files.json")).json()).version; } catch (e) { /* offline */ }
  const list = read();
  const lines = [
    "Bansuri Mastery problem report",
    "App version: " + version,
    "Browser: " + navigator.userAgent,
    "Screen: " + window.innerWidth + "x" + window.innerHeight + " @" + (window.devicePixelRatio || 1),
    "Installed app: " + (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches ? "yes" : "no"),
    "Errors (" + list.length + "):",
  ];
  for (const e of list) lines.push("- " + e.t + " " + e.route + " :: " + e.msg + (e.at ? " @ " + e.at : ""));
  if (!list.length) lines.push("- none recorded");
  return lines.join("\n");
}
