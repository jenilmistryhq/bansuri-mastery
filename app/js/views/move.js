// Bring progress from another device (#/move/<data>): shows what the link holds, then replaces this
// device's progress only after a second, deliberate tap. Move to another phone (#/me/settings/move,
// redesign W82): making the link on this phone, and what the new phone shows.
import { h, toast } from "../util.js";
import { getState, restoreFrom } from "../state.js";
import { decodeMove, encodeMove, moveLink, QR_LIMIT } from "../move.js";
import { levelOf } from "../xp.js";
import { backHead } from "../backhead.js";

// On this phone: a link (and a QR code while small enough) carrying the progress. On the new phone:
// what opening it shows.
function moveOut(main) {
  const out = h("div", { class: "stack", hidden: true });
  const make = h("button", { type: "button", class: "btn primary big" }, "Make a move link");
  make.addEventListener("click", async () => {
    const data = await encodeMove(), link = moveLink(data);
    const input = h("input", { class: "input", readonly: true, value: link, "aria-label": "Transfer link", onfocus: e => e.target.select() });
    const send = h("button", { type: "button", class: "btn primary", onclick: async () => { try { if (navigator.share) await navigator.share({ title: "My bansuri progress", url: link }); else { await navigator.clipboard.writeText(link); toast("Link copied."); } } catch (e) { /* cancelled */ } } }, "Send the link");
    let qr = null;
    if (link.length <= QR_LIMIT) {
      const { default: qrcode } = await import("../../vendor/qrcode/qrcode.mjs");
      const q = qrcode(0, "L"); q.addData(link); q.make();
      qr = h("img", { class: "qrimg", src: q.createDataURL(4, 8), alt: "QR code of the transfer link: scan it with the other device's camera" });
    }
    out.replaceChildren(h("div", { class: "row" }, input, send), qr || h("p", { class: "small muted" }, "Your progress is too large for a QR code now; send the link to yourself instead (WhatsApp, email)."));
    out.hidden = false;
  });
  main.append(h("div", { class: "page movepage" },
    backHead("#/me/settings/data", "Your data", "Move to another phone"),
    h("p", { class: "muted" }, "No account needed: a link carries your progress to your other phone or computer."),
    h("section", { class: "card" }, h("h2", { class: "eyebrow" }, "On this phone"), h("div", { class: "row" }, make), out),
    h("section", { class: "card" }, h("h2", { class: "eyebrow" }, "On the new phone"),
      h("p", null, "Open the link there. It shows:"),
      h("div", { class: "movepreview" }, h("b", null, "Bring your progress here"), h("span", { class: "btn primary" }, "Bring it here")),
      h("p", { class: "small muted" }, "It shows what the link holds and asks before replacing anything. Recordings are not included; move those with a backup file."))));
}

export async function render(main, { params, view }) {
  if (view === "moveout") return moveOut(main);
  const page = h("div", { class: "page" });
  main.append(page);
  page.append(h("section", { class: "hero" }, h("h1", null, "Bring your progress here")));
  let obj;
  try { obj = await decodeMove(params[0] || ""); }
  catch (e) { page.append(h("p", { class: "notice" }, "This link could not be read. Make a new one on the other device (Settings, Your data, Move to another device).")); return; }
  const p = obj.progress, here = getState();
  const xp = p.xp ? levelOf(p.xp.total) : null;
  const line = (label, there, mine) => h("tr", null, h("th", { scope: "row" }, label), h("td", null, there), h("td", null, mine));
  const btn = h("button", { type: "button", class: "btn primary big" }, "Bring it here");
  btn.addEventListener("click", () => {
    if (btn.dataset.armed !== "1") { btn.dataset.armed = "1"; btn.textContent = "Tap again: replace this device's progress"; setTimeout(() => { btn.dataset.armed = ""; btn.textContent = "Bring it here"; }, 5000); return; }
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
