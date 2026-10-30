// 5-minute practice (#/quick): for busy days. A long tone, a game and a short play-back round,
// then it is logged as practice, so the streak continues.
import { h, toast } from "../util.js";
import { addLog } from "../state.js";
import { holdMeter, echoGame } from "../core/live.js";
import { balloon } from "../games.js";
import { bestHold } from "../livestats.js";
import { award } from "../xp.js";

const STEPS = [
  { title: "1. Wake up the tone (1 minute)", text: "Hold any note, steady and soft. Then again, a little longer.", make: () => holdMeter({ targets: null, seconds: 8, cents: 30, ghost: bestHold }) },
  { title: "2. Balloon (2 minutes)", text: "Hold each note in tune to blow up the balloon.", make: () => balloon({ seconds: 90 }) },
  { title: "3. Play it back (2 minutes)", text: "Listen to a phrase and play it back.", make: () => echoGame({ level: "srg" }) },
];

export async function render(main) {
  const page = h("div", { class: "page" });
  main.append(page);
  let i = 0, widget = null;
  const started = Date.now();
  const title = h("h2"), text = h("p", { class: "muted" }), host = h("div");
  const bar = h("div", { class: "progressbar", role: "progressbar", "aria-label": "Steps done", "aria-valuemin": "0", "aria-valuemax": String(STEPS.length) }, h("i", { style: { width: "0%" } }));
  const next = h("button", { type: "button", class: "btn primary big" });
  function show() {
    if (widget) { widget.destroy(); widget = null; }
    bar.firstChild.style.width = (i / STEPS.length * 100) + "%"; bar.setAttribute("aria-valuenow", String(i));
    if (i >= STEPS.length) {
      const mins = Math.max(1, Math.round((Date.now() - started) / 60000));
      addLog({ minutes: Math.max(mins, 5), note: "5-minute practice", day: null });
      award("minutes", { amount: Math.max(mins, 5) });
      title.textContent = "Done. That counts."; text.textContent = "Logged as practice, so your streak goes on. A few focused minutes every day beat a long session now and then.";
      host.replaceChildren(h("div", { class: "row" }, h("a", { class: "btn primary", href: "#/today" }, "Back to Today"), h("a", { class: "btn", href: "#/play" }, "More games")));
      next.hidden = true; toast("5-minute practice logged.");
      return;
    }
    const st = STEPS[i];
    title.textContent = st.title; text.textContent = st.text;
    widget = st.make(); host.replaceChildren(widget.el);
    next.textContent = i === STEPS.length - 1 ? "Finish" : "Next step";
  }
  next.addEventListener("click", () => { i++; show(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "5-minute practice"), h("h1", null, "Short on time? Play for five minutes")), bar,
    h("section", { class: "card" }, title, text, host, h("div", { class: "row end" }, next)));
  show();
  return () => { if (widget) widget.destroy(); };
}
