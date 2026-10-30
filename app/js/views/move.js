// Bring progress from another device (#/move/<data>): shows what the link holds, then replaces this
// device's progress only after a second, deliberate tap.
import { h, toast } from "../util.js";
import { getState, restoreFrom } from "../state.js";
import { decodeMove } from "../move.js";
import { levelOf } from "../xp.js";

export async function render(main, { params }) {
  const page = h("div", { class: "page" });
  main.append(page);
  page.append(h("section", { class: "hero" }, h("h1", null, "Bring your progress here")));
  let obj;
  try { obj = await decodeMove(params[0] || ""); }
  catch (e) { page.append(h("p", { class: "notice" }, "This link could not be read. Make a new one on the other device (Settings, Your data, Move to another device).")); return; }
  const p = obj.progress, here = getState();
  const xp = p.xp ? levelOf(p.xp.total) : null;
  const line = (label, there, mine) => h("tr", null, h("th", { scope: "row" }, label), h("td", null, there), h("td", null, mine));
  const btn = h("button", { type: "button", class: "btn primary big" }, "Use this progress on this device");
  btn.addEventListener("click", () => {
    if (btn.dataset.armed !== "1") { btn.dataset.armed = "1"; btn.textContent = "Tap again: replace this device's progress"; setTimeout(() => { btn.dataset.armed = ""; btn.textContent = "Use this progress on this device"; }, 5000); return; }
    restoreFrom({ app: "bansuri-mastery", kind: "backup", progress: p, settings: obj.settings });
    toast("Progress moved. Welcome back to Day " + p.current + ".");
    location.hash = "#/today";
  });
  page.append(h("section", { class: "card" },
    h("p", null, "This link carries the progress from your other device. Recordings are not included; move those with a backup file."),
    h("div", { class: "tablewrap" }, h("table", null,
      h("thead", null, h("tr", null, h("th", null, ""), h("th", null, "From the link"), h("th", null, "On this device"))),
      h("tbody", null,
        line("Course day", "Day " + (p.current || 0), "Day " + (here.current || 0)),
        line("Level", xp ? "Level " + xp.level + " [" + xp.name + "]" : "-", here.xp ? "Level " + levelOf(here.xp.total).level : "-"),
        line("Practice entries", String((p.log || []).length), String(here.log.length)),
        line("Milestones passed", String(Object.values(p.milestones || {}).filter(m => m.status === "passed").length), String(Object.values(here.milestones).filter(m => m.status === "passed").length))))),
    h("div", { class: "row" }, btn, h("a", { class: "btn", href: "#/today" }, "Keep this device as it is"))));
}
