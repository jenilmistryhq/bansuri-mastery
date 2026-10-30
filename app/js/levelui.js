// How the level looks: a bar toward the next level, the full list of named levels, and the
// "+N XP" that floats up when XP is earned.
import { h } from "./util.js";
import { LEVELS, RULES, levelOf, xpState } from "./xp.js";
import { getSettings } from "./core/settings.js";

const nm = l => (getSettings().lang === "hi" ? l.hi + " (" + l.en + ")" : l.en + " (" + l.hi + ")");

// Level N [Name], a bar, and the XP still needed.
export function levelBar(opts) {
  const o = Object.assign({ compact: false }, opts || {});
  const lv = levelOf(xpState().total);
  const bar = h("div", { class: "progressbar levelbar", role: "progressbar", "aria-label": "XP toward level " + (lv.level + 1), "aria-valuemin": "0", "aria-valuemax": String(lv.need || 1), "aria-valuenow": String(lv.next ? lv.into : 1) }, h("i", { style: { width: lv.pct + "%" } }));
  return h("div", { class: "levelbox" + (o.compact ? " compact" : "") },
    h("div", { class: "row between" },
      h("span", { class: "levelname" }, h("b", { class: "levelnum" }, "Level " + lv.level), " ", h("span", { class: "leveltitle" }, "[" + (getSettings().lang === "hi" ? lv.hi : lv.en) + "]")),
      h("span", { class: "small muted mono" }, lv.next ? lv.xp.toLocaleString() + " / " + lv.to.toLocaleString() + " XP" : lv.xp.toLocaleString() + " XP")),
    bar,
    o.compact ? null : h("p", { class: "small muted" }, lv.next ? (lv.to - lv.xp).toLocaleString() + " XP to Level " + lv.next.level + " [" + (getSettings().lang === "hi" ? lv.next.hi : lv.next.en) + "]." : "The highest level. Every practice still counts."));
}

// Every level with the XP it needs, the current one marked (like a game's rank list).
export function levelsTable() {
  const lv = levelOf(xpState().total);
  return h("div", { class: "levelgrid", role: "list", "aria-label": "All levels" }, LEVELS.map(l => h("div", { role: "listitem", class: "levelrow" + (l.level === lv.level ? " now" : l.level < lv.level ? " reached" : "") },
    h("span", { class: "mono levelno" }, String(l.level)), h("span", null, nm(l)), h("span", { class: "mono small" }, "≥ " + l.xp.toLocaleString() + " XP"),
    l.level < lv.level ? h("span", { class: "small", "aria-label": "reached" }, "✓") : l.level === lv.level ? h("span", { class: "small" }, "you") : h("span"))));
}

// How XP is earned, from the rules themselves.
export function xpRules() {
  return h("ul", { class: "xprules" }, Object.values(RULES).map(r => h("li", null, h("b", { class: "mono" }, "+" + r.xp), " ", r.label, r.cap ? h("span", { class: "small muted" }, " (up to " + r.cap + " a day)") : null)),
    h("li", null, h("b", { class: "mono" }, "+10%"), " while your practice streak is 7 days or more"));
}

// "+12 XP" floating up from the level badge.
export function floatXp(n) {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const badge = document.querySelector(".levelpill");
  const el = h("span", { class: "xpfloat", "aria-hidden": "true" }, "+" + n + " XP");
  if (badge) { const r = badge.getBoundingClientRect(); el.style.left = (r.left + r.width / 2) + "px"; el.style.top = (r.bottom + 4) + "px"; }
  document.body.append(el);
  setTimeout(() => el.remove(), 1300);
}
