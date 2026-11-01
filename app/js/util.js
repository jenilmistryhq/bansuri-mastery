// DOM and date helpers. All text is inserted as text, never as HTML.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "dataset" && typeof v === "object") Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

const SVG_NS = "http://www.w3.org/2000/svg";
const ICONS = {
  today: "M3 10h18M7 3v4M17 3v4M5 6h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z",
  plan: "M4 6h16M4 12h16M4 18h10",
  bench: "M3 14l14-9 3 4-14 9zM8 12.5l1 1.5M11 10.5l1 1.5M14 8.5l1 1.5",
  journal: "M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6zM6 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2M9 8h6M9 12h6",
  progress: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  library: "M4 4h5v16H4zM10 4h5v16h-5zM16 5l4 1-3 14-4-1z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  play: "M7 4l13 8-13 8z",
  pause: "M7 4h4v16H7zM14 4h4v16h-4z",
  reset: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
  mic: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  stop: "M6 6h12v12H6z",
  share: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13",
  check: "M5 12l5 5L20 7",
  coach: "M12 3l9 4.5-9 4.5-9-4.5zM6 10v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M21 7.5V13",
  speaker: "M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11",
  listen: "M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1zM20 15h-3v5h2a1 1 0 0 0 1-1z",
  hand: "M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 8-7 8-3 0-4.5-2-6-5l-1.2-2.4a1.5 1.5 0 0 1 2.6-1.4L8 15",
  warmup: "M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  wave: "M2 12c1.5-4 3-4 4.5 0s3 4 4.5 0 3-4 4.5 0 3 4 4.5 0",
  note: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  ear: "M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0M10 9a2 2 0 0 1 4 0c0 1.5-2 2-2 3.5",
  me: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  flame: "M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8zM9 21h6",
  search: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM21 21l-5-5",
  screen: "M3 5h18v11H3zM8 20h8M12 16v4",
  file: "M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6",
  star: "M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5 6.5 20.4l1-6.3L3 9.7l6.2-.9z",
  read: "M3 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H3zM21 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z",
  x: "M6 6l12 12M18 6L6 18",
};
export const ICON_PATHS = ICONS;
export function icon(name, label) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  if (label) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", label); }
  else svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", ICONS[name] || "");
  svg.appendChild(p);
  return svg;
}

// Dates are local calendar dates as YYYY-MM-DD strings.
export function today() { return dateStr(new Date()); }
export function dateStr(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
export function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return dateStr(d); }
export function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
export function fmtDate(s) {
  if (!s) return "";
  return parseDate(s).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
export function fmtMinutes(m) {
  m = Math.round(m || 0);
  if (m < 60) return m + " min";
  const hh = Math.floor(m / 60), mm = m % 60;
  return hh + " h" + (mm ? " " + mm + " min" : "");
}
export function fmtClock(sec) {
  const neg = sec < 0; sec = Math.abs(Math.round(sec));
  return (neg ? "+" : "") + Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}

// Toasts raised within a moment of each other (finishing a session can save, pass a milestone and
// earn several badges) are shown as one card, at most three cards are on screen, and a tap dismisses one.
let toastHost = null, toastBatch = null;
export function toast(msg, ms) {
  if (!toastHost) { toastHost = h("div", { class: "toasts", role: "status", "aria-live": "polite" }); document.body.appendChild(toastHost); }
  if (toastBatch) { toastBatch.lines.push(msg); toastBatch.ms = Math.max(toastBatch.ms, ms || 0); return; }
  toastBatch = { lines: [msg], ms: ms || 0 };
  setTimeout(() => {
    // The main event (a milestone passed, a day complete) leads; badges follow it.
    // Badges are merged into one line, so a burst of them never covers the screen.
    const all = toastBatch.lines.slice(), badges = all.filter(l => /^Badge earned: /.test(String(l))).map(l => String(l).slice(14));
    const lines = all.filter(l => !/^Badge earned: /.test(String(l)));
    if (badges.length) lines.push((badges.length > 1 ? "Badges earned: " : "Badge earned: ") + badges.join(", "));
    const wait = Math.max(toastBatch.ms, 3500 + 1200 * (lines.length - 1));
    toastBatch = null;
    const t = h("div", { class: "toast" + (lines.length > 1 ? " multi" : "") }, lines.length > 1 ? lines.map(l => h("div", null, l)) : lines[0]);
    const close = () => { t.classList.add("leaving"); setTimeout(() => t.remove(), 180); };
    t.addEventListener("click", close);
    toastHost.appendChild(t);
    while (toastHost.children.length > 1) toastHost.firstChild.remove();
    setTimeout(close, wait);
  }, 350);
}

export function store(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
}
export function storeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}

export function pad2(n) { return String(n).padStart(2, "0"); }
export function lessonId(n) { return "L" + pad2(n); }
