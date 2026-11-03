// Check my flute (#/me/flute/check, redesign W78): the Bench's note-by-note check, one note per
// screen in the lesson player's shell (lesson/player.js, full focus). First the notes to check
// (#/me/flute/check), then each note on its own screen (#/me/flute/check/<plan>): play it, hold it,
// and the app says how many cents it is off, with the existing pitch detection (core/listen.js).
// The last screen sums up, and offers to tune the app when every note is off by the same amount.
import { h, icon, store, storeSet } from "../util.js";
import { CHECK_PLANS, verdict } from "../core/pitch.js";
import { listenMic, holdTracker } from "../core/listen.js";
import { micIntro, countdown } from "../core/live.js";
import { playNote } from "../core/audio.js";
import { codeOf, westOf, tuneCents } from "../core/theory.js";
import { noteLabel } from "../core/fingers.js";
import { getSettings, setSettings } from "../core/settings.js";
import { lessonPlayer } from "../lesson/player.js";
import { backHead } from "../backhead.js";

const ID = "flutecheck";
const HOLD_S = 2;
// The plans that name their notes ("Anything" is the recording check's).
// The verdict in words ("Close" alone reads as the close button in Hindi).
const verdictOf = c => { const v = verdict(c); return [v[0] === "Close" ? "Close to it" : v[0], v[1]]; };
const PLANS = CHECK_PLANS.map((p, i) => [i, p[0], p[1]]).filter(p => p[2].length);

// One note: Start, play it and hold it for two seconds; the median of the held readings is the result.
function noteStep(note, k) {
  return {
    id: "n" + k, kind: "custom", title: "Play and hold " + codeOf(note),
    intro: "Hold it steadily for " + HOLD_S + " seconds. The app says how in tune it is.",
    make(s, api) {
      let unsub = null, tracker = null, held = [], dead = false;
      const big = h("div", { class: "fc-note" }, noteLabel(note));
      const needle = h("i", { class: "lv-needle" });
      const cents = h("span", { class: "lv-cents" }, "");
      const secs = h("span", { class: "fc-secs mono" }, "0.0 s");
      const msg = h("p", { class: "fc-msg", "aria-live": "polite" }, "Press Start, then play " + codeOf(note) + ".");
      const result = h("div", { class: "fc-result", hidden: true });
      const start = h("button", { type: "button", class: "btn primary big" }, icon("mic"), " ", h("span", null, "Start"));
      const hear = h("button", { type: "button", class: "btn" }, icon("play"), " ", h("span", null, "Hear the note"));
      const skip = h("button", { type: "button", class: "linkbtn" }, "Skip this note");
      const stop = () => { if (unsub) { unsub(); unsub = null; } start.replaceChildren(icon("mic"), " ", h("span", null, api.data[s.id] && !api.data[s.id].skipped ? "Again" : "Start")); };
      const show = c => {
        const v = verdictOf(c);
        result.hidden = false;
        result.replaceChildren(h("span", { class: "chip " + v[1] }, v[0]), " ", h("b", { class: "mono" }, (c > 0 ? "+" : "") + c + " cents"),
          h("p", { class: "small muted" }, Math.abs(c) <= 10 ? "This note is in tune." : c > 0 ? "This note is sharp: cover the hole a little more, or blow a little less hard." : "This note is flat: roll the flute out a little, or blow a little faster."));
      };
      const onReading = r => {
        if (dead || !tracker) return;
        const st = tracker.feed(r);
        if (r.semi !== null && r.semi > -7.5) {
          const c = Math.round((r.semi - note) * 100 - tuneCents(note));
          needle.style.left = (50 + Math.max(-50, Math.min(50, c))) + "%";
          needle.className = "lv-needle " + (Math.abs(c) <= 10 ? "lv-good" : Math.abs(c) <= 25 ? "lv-warn" : "lv-bad");
          cents.textContent = (c > 0 ? "+" : "") + c + " cents";
          if (r.near !== note) msg.textContent = "That is " + codeOf(r.near) + " (" + westOf(r.near) + "). The note to play is " + codeOf(note) + ".";
          else msg.textContent = "Hold it...";
          if (st.ok) held.push(c); else if (!st.held) held = [];
        }
        secs.textContent = st.held.toFixed(1) + " s";
        if (st.done) {
          const sorted = held.slice().sort((a, b) => a - b), c = sorted.length ? sorted[sorted.length >> 1] : 0;
          api.data[s.id] = { note, cents: c };
          api.save();
          msg.textContent = "Measured.";
          show(c);
          stop();
          api.ready();
        }
      };
      start.addEventListener("click", async () => {
        if (unsub) { stop(); return; }
        if (!(await micIntro(start.parentElement)) || dead) return;
        if (!(await countdown(start.parentElement, { btn: start })) || dead) return;
        tracker = holdTracker({ target: note, seconds: HOLD_S, cents: 50 }); held = [];
        try {
          const u = await listenMic(onReading);
          if (dead) { u(); return; }
          unsub = u;
          start.replaceChildren(icon("stop"), " ", h("span", null, "Stop"));
          msg.textContent = "Listening... play " + codeOf(note) + ".";
        } catch (e) { msg.textContent = "The microphone is not available: allow it in the browser, then try again."; }
      });
      hear.addEventListener("click", () => playNote(note, 1.6));
      skip.addEventListener("click", () => { stop(); api.data[s.id] = { note, skipped: true }; api.save(); api.ready(); api.next(); });
      const prev = api.data[s.id];
      if (prev && Number.isFinite(prev.cents)) { show(prev.cents); api.ready(); }
      return {
        el: h("div", { class: "stack fc-step" }, big,
          h("div", { class: "lv-tune fc-tune" }, h("div", { class: "lv-bar" }, h("i", { class: "lv-mid" }), needle), h("div", { class: "lv-scale" }, h("span", null, "flat"), cents, h("span", null, "sharp"))),
          secs, msg, result, h("div", { class: "row" }, start, hear), skip),
        destroy() { dead = true; if (unsub) { unsub(); unsub = null; } },
      };
    },
  };
}

// The last screen: every note's result, and the whole flute's offset when it is the same everywhere.
function resultStep(notes) {
  return {
    id: "res", kind: "custom", title: "Your flute", always: true, next: "Finish",
    make(s, api) {
      const rows = notes.map((n, k) => [n, api.data["n" + k]]);
      const got = rows.filter(([, d]) => d && Number.isFinite(d.cents)).map(([, d]) => d.cents);
      const table = h("div", { class: "tablewrap" }, h("table", { class: "fc-table" },
        h("thead", null, h("tr", null, h("th", null, "Note"), h("th", null, "Off by"), h("th", null, "Verdict"))),
        h("tbody", null, rows.map(([n, d]) => {
          const v = d && Number.isFinite(d.cents) ? verdictOf(d.cents) : null;
          return h("tr", null, h("td", null, h("b", { class: "mono" }, codeOf(n)), " ", westOf(n)),
            h("td", { class: "mono" }, v ? (d.cents > 0 ? "+" : "") + d.cents + " cents" : "-"),
            h("td", null, v ? h("span", { class: "chip " + v[1] }, v[0]) : h("span", { class: "muted" }, "Skipped")));
        }))));
      const inTune = got.filter(c => Math.abs(c) <= 10).length;
      const out = [h("p", null, inTune + " of " + notes.length + " notes in tune.")];
      // The whole flute off by about the same amount: many bansuris are tuned that way.
      if (got.length >= 2) {
        const mean = got.reduce((a, c) => a + c, 0) / got.length, spread = Math.max(...got) - Math.min(...got);
        const a4 = getSettings().a4, target = Math.round(a4 * Math.pow(2, mean / 1200) * 10) / 10;
        if (Math.abs(mean) >= 20 && spread <= 24 && target >= 415 && target <= 466) {
          const tune = h("button", { type: "button", class: "btn primary" }, "Tune the app to my flute (A4 = {x} Hz)".replace("{x}", target));
          tune.addEventListener("click", () => { setSettings({ a4: target }); tune.disabled = true; tune.textContent = "Done: A4 = {x} Hz".replace("{x}", target); });
          out.push(h("div", { class: "notice info" }, h("p", null, "Every note is off by about the same amount. Your flute is probably tuned that way: many bansuris are. Tuning the app to your flute makes the tuner, drone and checks match it."), tune));
        }
      }
      out.push(h("p", { class: "small muted" }, "Within 10 cents is in tune; within 25 is close (fine for a beginner). More means adjust the angle, the air speed or how much of a half-hole you cover."),
        h("a", { href: "#/bench/check" }, "Check a recording of your flute instead"));
      return { el: h("div", { class: "stack" }, table, ...out) };
    },
  };
}

export async function render(main, { params }) {
  const page = h("div", { class: "page lessonpage flutecheckpage" });
  main.append(page);
  const plan = PLANS.find(p => String(p[0]) === String((params || [])[0]));
  if (!plan) {
    // Which notes to check: one row each, and the recording check for anything else.
    page.append(backHead("#/me/flute", "Flute", "Check my flute"),
      h("p", { class: "muted" }, "Play the notes one at a time. The app listens to each one and says how in tune it is."),
      h("section", { class: "card" }, h("h2", { class: "eyebrow" }, "What to check"),
        h("div", { class: "hublist" }, PLANS.map(([i, label]) => h("a", { class: "hubrow", href: "#/me/flute/check/" + i },
          h("span", { class: "stack" }, h("b", null, label)), h("span", { class: "chev", "aria-hidden": "true" }, ">"))))),
      h("p", { class: "small muted" }, "Or ", h("a", { href: "#/bench/check" }, "check a recording of your flute"), ": record the notes with any voice recorder and upload the file."));
    return undefined;
  }
  // A fresh check each time: forget the last run's place and results.
  const all = store("bansuri.lessons", {});
  if (all[ID]) { delete all[ID]; storeSet("bansuri.lessons", all); }
  const notes = plan[2];
  const lesson = { id: ID, title: "Check my flute",
    chapters: notes.map((n, k) => ({ title: codeOf(n), steps: [noteStep(n, k)] })).concat([{ title: "Results", steps: [resultStep(notes)] }]),
    finish: () => ({}) };
  const player = lessonPlayer(lesson, {
    onExit: () => { location.hash = "#/me/flute/check"; },
    onFinished: () => { location.hash = "#/me/flute"; },
  });
  page.append(player.el);
  return () => player.destroy();
}
