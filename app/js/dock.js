// The Flute dock: drone and taal, the tuner and the fingering chart over any screen, opened from the
// top bar (redesign W3-W7). Drone and Taal mount the Bench's own tala and drone panel; the Tuner is
// core/live.js's tuner on the shared microphone; Fingers shows one note's holes and plays it, with the
// Bench's full chart under it. Closing the dock keeps a drone started from it playing, shown as a
// pill in the top bar until it is stopped. On a wide screen the dock is a right column that stays
// open beside the page (W91); in full focus (the player, a game) a handle at the edge opens it.
import { h, icon } from "./util.js";
import { tanpura, playNote } from "./core/audio.js";
import { getSettings, setSettings, onSettings } from "./core/settings.js";
import { WEST, fingOf, codeOf, nameOf, westOf, hzOf } from "./core/theory.js";

// The dock's four tabs: [key, label, the Bench tab it shows (or null)].
const DOCK_TABS = [["drone", "Drone", "rhythm"], ["tuner", "Tuner", null], ["taal", "Taal", "rhythm"], ["fingers", "Fingers", "chart"]];
// Older names for the tabs (the Bench's tab names, used by links such as "dock:check").
const ALIAS = { check: "tuner", chart: "fingers", rhythm: "drone", tanpura: "drone", tala: "taal" };
const dockTab = t => DOCK_TABS.find(d => d[0] === (ALIAS[t] || t)) || DOCK_TABS[0];
// Fingers: the notes of the middle octave and taar Sa (the full chart below has every note).
const FING_NOTES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const NOTE_KEY = "bansuri.dock.note";

// W3: "Sa [ C5 v ]", the flute's Sa and octave in one select (the same settings as Me > Flute).
function saSelect() {
  const sel = h("select", { class: "input dock-sa", "aria-label": "Your flute's Sa" });
  for (const oct of [4, 5]) for (let i = 0; i < 12; i++) sel.append(h("option", { value: i + ":" + oct }, WEST[i] + oct));
  const fill = () => { const s = getSettings(); sel.value = s.saNote + ":" + s.saOct; };
  fill();
  sel.addEventListener("change", () => { const [n, o] = sel.value.split(":").map(Number); setSettings({ saNote: n, saOct: o }); });
  const off = onSettings(fill);
  return { el: h("label", { class: "dock-saline" }, h("b", null, "Sa"), sel, h("span", { class: "small muted" }, "Your flute's Sa, as in Me > Flute")), destroy: off };
}

// W6: tap a note, see its six holes (filled = closed) and the breath, and hear it.
function fingersPanel() {
  let semi = 0;
  try { const v = Number(localStorage.getItem(NOTE_KEY)); if (FING_NOTES.includes(v)) semi = v; } catch (e) { /* storage blocked */ }
  const chips = h("div", { class: "chips dock-notes", role: "group", "aria-label": "Note" });
  const big = h("b", { class: "dock-notebig", translate: "no" });
  const facts = h("span", { class: "small muted dock-notefacts" });
  const holes = h("ol", { class: "dock-holes", "aria-label": "Holes, from the blowing hole down" });
  const breath = h("p", { class: "small dock-breath" });
  const hear = h("button", { type: "button", class: "btn dock-hear", onclick: () => { try { playNote(semi, 1.2); } catch (e) { /* audio unavailable */ } } }, icon("play"), h("span", null, "Hear it"));
  const draw = () => {
    const fo = fingOf(semi), f = fo.f || "OOOOOO";
    chips.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.s) === semi)));
    big.textContent = codeOf(semi);
    facts.setAttribute("translate", "no");
    facts.textContent = nameOf(semi) + " . " + westOf(semi) + " . " + hzOf(semi).toFixed(1) + " Hz";
    holes.replaceChildren(...f.split("").map((c, i) => h("li", { class: c === "X" ? "closed" : c === "H" ? "half" : "open" },
      h("i", { "aria-hidden": "true" }), h("span", null, "Hole " + (i + 1)), h("span", { class: "muted" }, c === "X" ? "closed" : c === "H" ? "half closed" : "open"))));
    breath.textContent = fo.reg === 2 ? "Faster air (the upper register)" : "Gentle air";
  };
  chips.append(...FING_NOTES.map(s => h("button", { type: "button", class: "chipbtn tonechip", translate: "no", dataset: { s: String(s) }, title: nameOf(s),
    onclick: () => { semi = s; try { localStorage.setItem(NOTE_KEY, String(s)); } catch (e) { /* this visit only */ } draw(); } }, codeOf(s))));
  draw();
  const off = onSettings(draw);
  return { el: h("div", { class: "dock-fingers" }, chips, h("div", { class: "dock-fing" }, holes, h("div", { class: "dock-fingside" }, big, facts, breath, hear))), destroy: off };
}

export function createDock() {
  let bench = null, tuner = null, extras = [], lastFocus = null, explicit = false;
  const droneTop = h("div", { class: "dock-part dock-dronetop" });
  const tunerBox = h("div", { class: "dock-part dock-tuner" });
  const fingBox = h("div", { class: "dock-part dock-fingbox" });
  const benchHost = h("div", { class: "dock-bench" });
  const host = h("div", { class: "dockbody", "data-sub": "drone", role: "tabpanel" }, droneTop, tunerBox, fingBox, benchHost);
  const tabRow = h("div", { class: "docktabs", role: "tablist", "aria-label": "Flute tools" }, DOCK_TABS.map(([k, label]) =>
    h("button", { type: "button", role: "tab", id: "docktab-" + k, "data-dock": k, "aria-selected": "false", tabindex: "-1", onclick: () => { explicit = true; pick(k); } }, label)));
  // Arrow keys move along the tabs (and pick them), as in any tab list.
  tabRow.addEventListener("keydown", e => {
    const keys = { ArrowLeft: -1, ArrowRight: 1 }, bs = [...tabRow.querySelectorAll("button")], i = bs.indexOf(document.activeElement);
    if (i < 0 || !(e.key in keys || e.key === "Home" || e.key === "End")) return;
    e.preventDefault();
    const j = e.key === "Home" ? 0 : e.key === "End" ? bs.length - 1 : (i + keys[e.key] + bs.length) % bs.length;
    bs[j].focus(); explicit = true; pick(bs[j].dataset.dock);
  });
  function pick(k) {
    const d = dockTab(k);
    host.dataset.sub = d[0];
    host.setAttribute("aria-labelledby", "docktab-" + d[0]);
    tabRow.querySelectorAll("button").forEach(b => { const on = b.dataset.dock === d[0]; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    if (bench && d[2]) bench.setTab(d[2]);
    // The tuner listens only while its tab shows, and starts when it is picked (or opened on).
    if (tuner) { if (d[0] === "tuner" && explicit) tuner.start(); else if (d[0] !== "tuner") tuner.stop(); }
    explicit = false;
  }
  const close = h("button", { type: "button", class: "iconbtn", "aria-label": "Close the flute tools" }, icon("x"));
  const sheet = h("section", { class: "dock", role: "dialog", "aria-modal": "false", "aria-label": "Flute tools", hidden: true },
    h("div", { class: "dockhead" }, h("span", { class: "dockgrip", "aria-hidden": "true" }), h("b", null, "Flute tools"), h("span", { class: "spacer" }), close),
    tabRow, host);
  const backdrop = h("div", { class: "dockback", hidden: true });
  const btn = h("button", { type: "button", class: "iconbtn dockbtn", title: "Drone, taal, tuner and fingering", "aria-expanded": "false" }, icon("wave"), h("span", { class: "docklabel" }, "Tools"));
  const pill = h("button", { type: "button", class: "dronepill", hidden: true, title: "The drone is playing. Open the flute tools." }, h("span", { class: "dot", "aria-hidden": "true" }), h("span", null, "Drone"), h("span", { class: "dronepill-sa", translate: "no" }, ""));
  // Full focus hides the top bar: this handle at the screen's edge opens the dock there (W91).
  const fab = h("button", { type: "button", class: "dockfab", "aria-label": "Flute tools", title: "Drone, taal, tuner and fingering", "aria-expanded": "false" }, icon("wave"));

  async function open(tab) {
    if (!sheet.hidden) { if (tab) { explicit = true; pick(tab); } return; }
    lastFocus = document.activeElement;
    sheet.hidden = false; backdrop.hidden = false; btn.setAttribute("aria-expanded", "true"); fab.setAttribute("aria-expanded", "true");
    document.documentElement.classList.add("dockopen");
    if (!bench) {
      const [{ mountBench }, { tunerMeter }] = await Promise.all([import("./bench/bench.js"), import("./core/live.js")]);
      if (sheet.hidden) return;
      bench = mountBench(benchHost, { compact: true, heading: false, flute: false, tabs: ["rhythm", "chart"], tab: dockTab(tab || host.dataset.sub)[2] || "rhythm", keepDrone: true });
      const sa = saSelect(), fing = fingersPanel();
      tuner = tunerMeter();
      droneTop.replaceChildren(sa.el); fingBox.replaceChildren(fing.el); tunerBox.replaceChildren(tuner.el);
      extras = [sa.destroy, fing.destroy];
    }
    explicit = !!tab;
    pick(tab || host.dataset.sub || "drone");
    sync();
    close.focus();
  }
  function hide() {
    if (sheet.hidden) return;
    sheet.hidden = true; backdrop.hidden = true; btn.setAttribute("aria-expanded", "false"); fab.setAttribute("aria-expanded", "false");
    document.documentElement.classList.remove("dockopen");
    // The tuner's microphone and the taal stop; a drone started here keeps playing.
    if (tuner) { tuner.destroy(); tuner = null; }
    if (bench) { bench.destroy(); bench = null; }
    extras.forEach(f => { try { f(); } catch (e) { /* already gone */ } }); extras = [];
    droneTop.replaceChildren(); fingBox.replaceChildren(); tunerBox.replaceChildren();
    sync();
    if (lastFocus && lastFocus.focus && lastFocus.isConnected) lastFocus.focus();
  }
  function sync() {
    const on = tanpura.isOn();
    pill.hidden = !(on && sheet.hidden);
    // W7: the pill names the drone's Sa ("Drone C5").
    const s = getSettings();
    pill.lastChild.textContent = WEST[s.saNote] + s.saOct;
  }

  btn.addEventListener("click", () => (sheet.hidden ? open() : hide()));
  fab.addEventListener("click", () => (sheet.hidden ? open() : hide()));
  pill.addEventListener("click", () => open("drone"));
  close.addEventListener("click", hide);
  backdrop.addEventListener("click", hide);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !sheet.hidden) hide(); });
  tanpura.onChange(sync);
  onSettings(sync);

  return { button: btn, pill, fab, sheet, backdrop, open, hide, isOpen: () => !sheet.hidden };
}
