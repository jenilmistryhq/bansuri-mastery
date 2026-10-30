// Progress (#/progress): stats, practice calendar, milestones, ear quiz, badges, and a shareable card.
import { h, today, addDays, parseDate, fmtMinutes, toast, store, storeSet } from "../util.js";
import { getState } from "../state.js";
import { totals, streaks, practiceDates, getPlan, getDay, current, milestoneState } from "../course.js";
import { rules } from "../badges.js";
import { holdSummary } from "../livestats.js";
import { codeOf } from "../core/theory.js";

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

export async function render(main) {
  const s = getState(), tt = totals(), st = streaks();
  const page = h("div", { class: "page" });
  const stat = (v, l) => h("div", { class: "stat" }, h("b", null, String(v)), h("span", null, l));
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Progress"), h("h1", null, "How far you have come"),
    s.startedAt ? h("p", { class: "muted" }, "Learning since " + s.startedAt + ".") : h("p", { class: "muted" }, "Start Day 0 to begin tracking.")));
  page.append(h("div", { class: "stats" },
    stat("Day " + current(), "current day"), stat(tt.practiceDays, "days practised"), stat(fmtMinutes(tt.minutes), "total practice"),
    stat(st.current, "current streak"), stat(st.best, "best streak"), stat(tt.msPassed + "/" + getPlan().milestones.length, "milestones passed")));

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
          bar(x.best, maxHold),
          h("span", { class: "small" }, x.best.toFixed(1) + " s" + (x.days > 1 && x.last > x.first ? "  (from " + x.first.toFixed(1) + " s)" : ""))))) : null,
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
      h("span", { class: "medal", "aria-hidden": "true" }, r.medal), h("b", null, r.title), h("span", { class: "small muted" }, s.badges[r.id] ? "Earned " + s.badges[r.id] : r.desc))))));

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
