// The Flute dock: drone and taal, the tuner and the fingering chart over any screen, opened from the
// top bar. It mounts the Bench's own panels (nothing new is measured or played here), and closing it
// keeps a drone started from it playing, shown as a pill in the top bar until it is stopped.
import { h, icon } from "./util.js";
import { tanpura } from "./core/audio.js";

const TABS = ["rhythm", "check", "chart"];
// The dock's own four tabs (redesign W3-W6): Drone and Taal are two halves of the Bench's
// "Tala and drone" panel, shown one at a time.
const DOCK_TABS = [["drone", "Drone", "rhythm"], ["tuner", "Tuner", "check"], ["taal", "Taal", "rhythm"], ["fingers", "Fingers", "chart"]];
const dockTab = t => (DOCK_TABS.find(d => d[0] === t || d[2] === t) || DOCK_TABS[0]);

export function createDock() {
  let bench = null, lastFocus = null;
  const host = h("div", { class: "dockbody", "data-sub": "drone" });
  const tabRow = h("div", { class: "docktabs", role: "tablist", "aria-label": "Flute tools" }, DOCK_TABS.map(([k, label]) =>
    h("button", { type: "button", role: "tab", "data-dock": k, "aria-selected": "false", onclick: () => pick(k) }, label)));
  function pick(k) {
    const d = dockTab(k);
    host.dataset.sub = d[0];
    tabRow.querySelectorAll("button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.dock === d[0])));
    if (bench) bench.setTab(d[2]);
  }
  const close = h("button", { type: "button", class: "iconbtn", "aria-label": "Close the flute tools" }, icon("x"));
  const sheet = h("section", { class: "dock", role: "dialog", "aria-modal": "false", "aria-label": "Flute tools", hidden: true },
    h("div", { class: "dockhead" }, h("span", { class: "dockgrip", "aria-hidden": "true" }), h("b", null, "Flute tools"), h("span", { class: "spacer" }), close),
    tabRow, host);
  const backdrop = h("div", { class: "dockback", hidden: true });
  const btn = h("button", { type: "button", class: "iconbtn dockbtn", title: "Drone, taal, tuner and fingering", "aria-expanded": "false" }, icon("wave"), h("span", { class: "docklabel" }, "Tools"));
  const pill = h("button", { type: "button", class: "dronepill", hidden: true, title: "The drone is playing. Open the flute tools." }, h("span", { class: "dot", "aria-hidden": "true" }), "Drone on");

  async function open(tab) {
    if (!sheet.hidden) { if (tab) pick(tab); return; }
    lastFocus = document.activeElement;
    sheet.hidden = false; backdrop.hidden = false; btn.setAttribute("aria-expanded", "true");
    document.documentElement.classList.add("dockopen");
    if (!bench) {
      const { mountBench } = await import("./bench/bench.js");
      if (sheet.hidden) return;
      bench = mountBench(host, { compact: true, heading: false, flute: false, tabs: TABS, tab: dockTab(tab || "drone")[2], keepDrone: true });
    }
    pick(tab || host.dataset.sub || "drone");
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
  pill.addEventListener("click", () => open("drone"));
  close.addEventListener("click", hide);
  backdrop.addEventListener("click", hide);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !sheet.hidden) hide(); });
  tanpura.onChange(sync);

  return { button: btn, pill, sheet, backdrop, open, hide, isOpen: () => !sheet.hidden };
}
