// The Flute dock: drone and taal, the tuner and the fingering chart over any screen, opened from the
// top bar. It mounts the Bench's own panels (nothing new is measured or played here), and closing it
// keeps a drone started from it playing, shown as a pill in the top bar until it is stopped.
import { h, icon } from "./util.js";
import { tanpura } from "./core/audio.js";

const TABS = ["rhythm", "check", "chart"];

export function createDock() {
  let bench = null, lastFocus = null;
  const host = h("div", { class: "dockbody" });
  const close = h("button", { type: "button", class: "iconbtn", "aria-label": "Close the flute tools" }, icon("x"));
  const sheet = h("section", { class: "dock", role: "dialog", "aria-modal": "false", "aria-label": "Flute tools", hidden: true },
    h("div", { class: "dockhead" }, h("span", { class: "dockgrip", "aria-hidden": "true" }), h("b", null, "Flute tools"), h("span", { class: "spacer" }), close),
    host);
  const backdrop = h("div", { class: "dockback", hidden: true });
  const btn = h("button", { type: "button", class: "iconbtn dockbtn", title: "Drone, taal, tuner and fingering", "aria-expanded": "false" }, icon("wave"), h("span", { class: "docklabel" }, "Tools"));
  const pill = h("button", { type: "button", class: "dronepill", hidden: true, title: "The drone is playing. Open the flute tools." }, h("span", { class: "dot", "aria-hidden": "true" }), "Drone on");

  async function open(tab) {
    if (!sheet.hidden) { if (tab && bench) bench.setTab(tab); return; }
    lastFocus = document.activeElement;
    sheet.hidden = false; backdrop.hidden = false; btn.setAttribute("aria-expanded", "true");
    document.documentElement.classList.add("dockopen");
    if (!bench) {
      const { mountBench } = await import("./bench/bench.js");
      if (sheet.hidden) return;
      bench = mountBench(host, { compact: true, heading: false, flute: false, tabs: TABS, tab: tab || "rhythm", keepDrone: true });
    } else if (tab) bench.setTab(tab);
    sync();
    close.focus();
  }
  function hide() {
    if (sheet.hidden) return;
    sheet.hidden = true; backdrop.hidden = true; btn.setAttribute("aria-expanded", "false");
    document.documentElement.classList.remove("dockopen");
    // The tuner's microphone and the taal stop; a drone started here keeps playing.
    if (bench) { bench.destroy(); bench = null; }
    sync();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function sync() { pill.hidden = !(tanpura.isOn() && sheet.hidden); }

  btn.addEventListener("click", () => (sheet.hidden ? open() : hide()));
  pill.addEventListener("click", () => open("rhythm"));
  close.addEventListener("click", hide);
  backdrop.addEventListener("click", hide);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !sheet.hidden) hide(); });
  tanpura.onChange(sync);

  return { button: btn, pill, sheet, backdrop, open, hide, isOpen: () => !sheet.hidden };
}
