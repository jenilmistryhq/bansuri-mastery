// 5 minutes (#/today/quick, the old #/quick): for busy days. A long tone, a game and a short
// play-back round, then it is logged as practice, so the streak continues. A full-focus screen
// (W22): (x) back to Today, the three activities as chips, "1 of 3" and its bar, the activity.
import { h, icon, toast } from "../util.js";
import { addLog } from "../state.js";
import { holdMeter, echoGame } from "../core/live.js";
import { balloon } from "../games.js";
import { bestHold } from "../livestats.js";
import { award } from "../xp.js";

const STEPS = [
  { chip: "Hold notes", title: "Wake up the tone (1 minute)", text: "Hold any note, steady and soft. Then again, a little longer.", make: () => holdMeter({ targets: null, seconds: 8, cents: 30, ghost: bestHold }) },
  { chip: "Balloon", title: "Balloon (2 minutes)", text: "Hold each note in tune to blow up the balloon.", make: () => balloon({ seconds: 90 }) },
  { chip: "Listen and play back", title: "Play it back (2 minutes)", text: "Listen to a phrase and play it back.", make: () => echoGame({ level: "srg" }) },
];

export async function render(main) {
  const page = h("div", { class: "page quickpage" });
  main.append(page);
  let i = 0, widget = null;
  const started = Date.now();
  const title = h("h2", { tabindex: "-1" }), text = h("p", { class: "muted" }), host = h("div");
  const close = h("a", { class: "lesson-close", href: "#/today", "aria-label": "Close: back to Today" }, icon("x"));
  const chips = h("ol", { class: "quickchips", "aria-label": "The three activities" }, STEPS.map((st, k) =>
    h("li", null, h("button", { type: "button", class: "lesson-chip", onclick: () => { i = k; show(); } }, h("span", { class: "quickno" }, String(k + 1)), " ", st.chip))));
  const bar = h("div", { class: "progressbar", role: "progressbar", "aria-label": "Activities done", "aria-valuemin": "0", "aria-valuemax": String(STEPS.length) }, h("i", { style: { width: "0%" } }));
  const count = h("span", { class: "small muted quickcount" });
  const next = h("button", { type: "button", class: "btn primary big" });
  const body = h("section", { class: "card quickbody" }, title, text, host, h("div", { class: "row end" }, next));
  function show() {
    if (widget) { widget.destroy(); widget = null; }
    const end = i >= STEPS.length;
    bar.firstChild.style.width = ((end ? STEPS.length : i + 1) / STEPS.length * 100) + "%"; bar.setAttribute("aria-valuenow", String(end ? STEPS.length : i + 1));
    count.textContent = (end ? STEPS.length : i + 1) + " of " + STEPS.length;
    chips.querySelectorAll("li").forEach((li, k) => { li.classList.toggle("now", k === i); li.classList.toggle("done", k < i); const b = li.firstChild; if (k === i) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current"); });
    if (end) {
      const mins = Math.max(1, Math.round((Date.now() - started) / 60000));
      addLog({ minutes: Math.max(mins, 5), note: "5-minute practice", day: null });
      award("minutes", { amount: Math.max(mins, 5) });
      title.textContent = "Done. That counts."; text.textContent = "Logged as practice, so your streak goes on. A few focused minutes every day beat a long session now and then.";
      host.replaceChildren(h("div", { class: "row" }, h("a", { class: "btn primary big", href: "#/today" }, "Back to Today"), h("a", { class: "btn", href: "#/skills/games" }, "More games")));
      next.hidden = true; toast("5-minute practice logged.");
      // The page comes back: the activity is over.
      document.documentElement.classList.remove("fullfocus");
      return;
    }
    const st = STEPS[i];
    title.textContent = st.title; text.textContent = st.text;
    widget = st.make(); host.replaceChildren(widget.el);
    next.hidden = false;
    next.textContent = i === STEPS.length - 1 ? "Finish" : "Next step";
    title.focus({ preventScroll: true });
  }
  next.addEventListener("click", () => { i++; show(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  page.append(h("header", { class: "quicktop" }, close, h("h1", null, "5 minutes")),
    h("div", { class: "quickstrip" }, chips, h("div", { class: "quickprog" }, bar, count)), body);
  // Full focus (W2, W22): no top bar and no tabs while the five minutes run; (x) leads out.
  document.documentElement.classList.add("fullfocus");
  show();
  return () => { if (widget) widget.destroy(); document.documentElement.classList.remove("fullfocus"); };
}
