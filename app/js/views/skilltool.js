// A training tool on its own screen (#/skills/<skill>/<tool>, redesign S3, W46-W48): a back link to
// its skill, a switch between the skill's tools (Long tones / Tone check), the tool's setup and its
// one Start. The tools are the existing widgets (the Bench's panels, core/live.js, the Tone check,
// the ornament trainer); while one listens, the screen is in playing mode, as in the lesson player.
import { h } from "../util.js";
import { skillById, TOOLS } from "../skillmap.js";
import { backHead, followMic } from "../backhead.js";
import { bestHold } from "../livestats.js";
import { codeOf } from "../core/theory.js";

// Long tones' note as chips (W46), from mandra Pa to taar Sa, in place of the Bench's note list. The
// chips drive that list (hidden here, unchanged on the Bench), so the note it remembers, and the one
// Me > Progress's "Work on these" sets before opening, is the chip shown picked.
const CHIP_NOTES = [-5, -3, -1, 0, 2, 4, 5, 7, 9, 11, 12];
function noteChips(box) {
  const sel = box.querySelector("[data-ref=toneNote]");
  if (!sel) return;
  const field = sel.closest(".bb-field");
  field.hidden = true;
  const notes = CHIP_NOTES.map(String);
  if (sel.value !== "any" && !notes.includes(sel.value)) notes.push(sel.value);
  notes.sort((a, b) => Number(a) - Number(b));
  const label = v => (([...sel.options].find(o => o.value === v) || {}).textContent || "").replace(/\s+/g, " ").trim();
  const chips = h("div", { class: "chips tonechips", role: "group", "aria-label": "Note" });
  const draw = () => chips.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === sel.value)));
  const pick = v => { sel.value = v; sel.dispatchEvent(new Event("change")); draw(); };
  chips.append(h("button", { type: "button", class: "chipbtn", dataset: { v: "any" }, onclick: () => pick("any") }, "Any note"),
    ...notes.map(v => h("button", { type: "button", class: "chipbtn tonechip", translate: "no", dataset: { v }, title: label(v), onclick: () => pick(v) }, codeOf(Number(v)))));
  field.closest(".bb-row").before(h("div", { class: "tonepick" }, h("span", { class: "small muted" }, "Notes"), chips));
  draw();
}

// Each tool: (host) -> cleanup. Imports are loaded only for the tool that opens.
const MAKE = {
  async longtones(host) {
    const { mountBench } = await import("../bench/bench.js");
    const best = bestHold(0);
    if (best) host.append(h("p", { class: "toolbest" }, h("span", { class: "muted" }, "Your best Sa: "), h("b", null, "{n} s".replace("{n}", Math.round(best)))));
    const box = h("div");
    host.append(box);
    const bench = mountBench(box, { compact: true, heading: false, flute: false, tabs: ["tones"], tab: "tones", ghost: bestHold });
    noteChips(box);
    return () => bench.destroy();
  },
  async check(host) {
    const { toneCheck } = await import("./tone.js");
    const tone = toneCheck();
    host.append(tone.top, ...tone.more);
    return tone.cleanup;
  },
  async tap(host) {
    const { tapGame } = await import("../core/live.js");
    const game = tapGame({ bpm: 72 });
    host.append(h("section", { class: "card" }, h("p", { class: "small muted" }, "Tap with the click to see whether you rush or drag. \"Then two silent bars\" tests the pulse you keep in your head (L06, L15)."), game.el));
    return () => game.destroy();
  },
  async trainer(host) {
    const { render } = await import("./ornaments.js");
    const ret = await render(host);
    return typeof ret === "function" ? ret : null;
  },
  async quiz(host) {
    const [{ mountBench }, { recordEar }] = await Promise.all([import("../bench/bench.js"), import("./session.js")]);
    const box = h("div");
    host.append(box);
    const bench = mountBench(box, { compact: true, heading: false, flute: false, tabs: ["ear"], tab: "ear", onEar: recordEar });
    return () => bench.destroy();
  },
  async playback(host) {
    const { mountBench } = await import("../bench/bench.js");
    const box = h("div");
    host.append(box);
    const bench = mountBench(box, { compact: true, heading: false, flute: false, tabs: ["echo"], tab: "echo" });
    return () => bench.destroy();
  },
};

export async function render(main, { params }) {
  const skill = skillById(params[0]), tools = TOOLS[params[0]] || [];
  const tool = tools.find(t => t[0] === params[1]);
  if (!skill || !tool) { location.replace("#/skills/" + (skill ? skill.id : "")); return; }
  const body = h("div", { class: "toolbody" });
  const page = h("div", { class: "page toolpage", dataset: { noswipe: "1", tool: tool[0] } },
    backHead("#/skills/" + skill.id, skill.title, tool[1]),
    tools.length > 1 ? h("nav", { class: "seg toolswitch", "aria-label": "Tools" }, tools.map(([id, label]) => h("a", { href: "#/skills/" + skill.id + "/" + id, "aria-current": id === tool[0] ? "page" : null }, label))) : null,
    body);
  main.append(page);
  const cleanups = [followMic(page, "toolplaying")];
  const done = await MAKE[tool[0]](body);
  if (done) cleanups.push(done);
  return () => cleanups.forEach(f => { try { f(); } catch (e) { /* already gone */ } });
}
