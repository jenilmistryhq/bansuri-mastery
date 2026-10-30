// Shared progress card (#/share/<payload>). The payload lives in the link; it is self-reported.
import { h, fmtMinutes, fmtDate, toast } from "../util.js";
import { getPlan } from "../course.js";

function decode(p) {
  try {
    const b64 = p.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((p.length + 3) % 4);
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    const o = JSON.parse(new TextDecoder().decode(bytes));
    if (!o || o.v !== 1) return null;
    const int = (x, max) => Number.isInteger(x) && x >= 0 && x <= max ? x : null;
    const date = x => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null;
    const out = { name: typeof o.n === "string" ? o.n.slice(0, 40) : "", day: int(o.d, 100000), phase: int(o.p, 9), streak: int(o.s, 100000), best: int(o.b, 100000), minutes: int(o.m, 10000000),
      ms: Array.isArray(o.ms) ? o.ms.filter(x => typeof x === "string" && /^M\d{1,2}$/.test(x)).slice(0, 20) : [], date: date(o.t), since: date(o.since) };
    if (out.day === null) return null;
    return out;
  } catch (e) { return null; }
}

function drawImage(c) {
  const W = 1080, H = 1080, cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, "#0d6a6e"); grad.addColorStop(1, "#06393b");
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.fillStyle = "#c9a552"; g.save(); g.translate(W * 0.5, H * 0.86); g.rotate(-0.12); g.fillRect(-460, -14, 920, 28); g.restore();
  g.fillStyle = "#ffffff"; g.textBaseline = "top";
  g.font = "56px 'Rozha One', Georgia, serif"; g.fillText((c.name ? c.name + "'s " : "My ") + "bansuri journey", 80, 80);
  g.font = "200px 'Rozha One', Georgia, serif"; g.fillText("Day " + c.day, 80, 190);
  g.font = "44px Hind, sans-serif";
  const lines = ["Phase " + c.phase, c.streak + "-day streak (best " + c.best + ")", fmtMinutes(c.minutes) + " of practice", c.ms.length ? "Milestones: " + c.ms.join(" ") : "First milestone ahead"];
  lines.forEach((l, i) => g.fillText(l, 80, 470 + i * 70));
  g.font = "32px Hind, sans-serif"; g.fillStyle = "rgba(255,255,255,0.8)"; g.fillText("Bansuri Mastery - self-reported progress" + (c.date ? " - " + c.date : ""), 80, 980);
  return cv;
}

export async function render(main, { params }) {
  const c = decode(params[0]);
  const page = h("div", { class: "page" });
  main.append(page);
  if (!c) { page.append(h("div", { class: "card" }, h("h2", null, "This share link is not valid"), h("a", { href: "#/today" }, "Open Bansuri Mastery"))); return; }
  const plan = getPlan();
  const total = plan ? plan.milestones.length : 11;
  page.append(h("div", { class: "sharecard" },
    h("span", { class: "eyebrow", style: { color: "rgba(255,255,255,0.85)" } }, "Bansuri Mastery"),
    h("h2", null, (c.name ? c.name + "'s" : "A") + " bansuri journey"),
    h("span", { class: "big" }, "Day " + c.day),
    h("div", { class: "kv" }, h("span", null, "Phase ", h("b", null, String(c.phase))), h("span", null, "Streak ", h("b", null, String(c.streak))), h("span", null, "Best ", h("b", null, String(c.best))), h("span", null, "Practice ", h("b", null, fmtMinutes(c.minutes)))),
    h("span", null, "Milestones passed: " + (c.ms.length ? c.ms.join(", ") : "none yet") + " (" + c.ms.length + " of " + total + ")"),
    h("span", { class: "small muted" }, (c.since ? "Learning since " + fmtDate(c.since) + ". " : "") + "Self-reported progress" + (c.date ? ", shared " + fmtDate(c.date) : "") + ".")));
  const dl = h("button", { type: "button", class: "btn" }, "Download as image");
  dl.addEventListener("click", () => {
    const cv = drawImage(c);
    cv.toBlob(b => {
      if (!b) { toast("Could not create the image."); return; }
      const url = URL.createObjectURL(b);
      const a = h("a", { href: url, download: "bansuri-day-" + c.day + ".png" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
  });
  page.append(h("div", { class: "row" }, dl, h("a", { class: "btn primary", href: "#/today" }, "Start learning the bansuri")));
}
