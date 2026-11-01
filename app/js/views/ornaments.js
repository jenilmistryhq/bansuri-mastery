// Ornament trainer (#/ornaments): meend, kan, murki and andolan. For each, an exercise on the
// learner's own flute: hear the target (full or half speed), play it, and see the two pitch curves
// together with what to change (ornaments.js measures the attempt). Best results are kept in this
// browser (bansuri.ornaments).
import { h, store, storeSet, today, icon } from "../util.js";
import { codeOf } from "../core/theory.js";
import { playCurve } from "../core/audio.js";
import { relSemi } from "../core/pitch.js";
import { listenMic } from "../core/listen.js";
import { micIntro, countdown } from "../core/live.js";
import { ORNAMENTS, targetCurve, analyse, cleanReadings } from "../ornaments.js";

const KEY = "bansuri.ornaments";
const name = s => codeOf(s);

export async function render(main) {
  const page = h("div", { class: "page ornpage" });
  main.append(page);
  const cleanups = [];
  let gone = false, unsub = null, timer = 0, player = null;
  cleanups.push(() => { gone = true; clearInterval(timer); if (unsub) { unsub(); unsub = null; } if (player) try { player.voice.stop(); } catch (e) { /* ended */ } });

  let orn = ORNAMENTS[0], ex = orn.ex[0], attempt = null;
  const hist = store(KEY, {});
  const tabs = h("div", { class: "row ornTabs", role: "tablist", "aria-label": "Ornament" });
  const exSel = h("select", { class: "input", "aria-label": "Exercise" });
  const speedSel = h("select", { class: "input", "aria-label": "Speed of the demonstration" }, h("option", { value: "1" }, "Full speed"), h("option", { value: "0.5" }, "Half speed"));
  const about = h("div", { class: "ornAbout" });
  const canvas = h("canvas", { class: "ornplot", role: "img", "aria-label": "The target pitch curve and your attempt" });
  const msg = h("p", { class: "small", "aria-live": "polite" });
  const out = h("div", { class: "stack", "aria-live": "polite" });
  const best = h("p", { class: "small muted" });
  const hearBtn = h("button", { type: "button", class: "btn" }, icon("play"), " Hear it");
  const tryBtn = h("button", { type: "button", class: "btn primary" }, icon("mic"), " Try it");

  function showTabs() {
    tabs.replaceChildren(...ORNAMENTS.map(o => h("button", { type: "button", role: "tab", class: "btn" + (o === orn ? " primary" : ""), "aria-selected": String(o === orn),
      onclick: () => { orn = o; ex = o.ex[0]; attempt = null; out.replaceChildren(); showAll(); } }, o.name)));
  }
  function showAll() {
    showTabs();
    exSel.replaceChildren(...orn.ex.map(e => h("option", { value: e.id }, e.label)));
    exSel.value = ex.id;
    about.replaceChildren(h("p", null, h("b", null, orn.name + ": "), orn.what), h("p", { class: "small" }, h("b", null, "How: "), orn.how));
    const b = hist[orn.key + "/" + ex.id];
    best.textContent = b ? "Your best: " + b.passed + " of " + b.of + " checks (" + b.date + "), " + b.tries + (b.tries === 1 ? " try." : " tries.") : "Not tried yet.";
    msg.textContent = "Hear the target, then press Try it and play it once.";
    draw();
  }
  exSel.addEventListener("change", () => { ex = orn.ex.find(e => e.id === exSel.value) || orn.ex[0]; attempt = null; out.replaceChildren(); showAll(); });

  function draw() {
    const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth || 600, H = canvas.clientHeight || 220;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const g = canvas.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const css = getComputedStyle(canvas), col = (k, d) => (css.getPropertyValue(k) || "").trim() || d;
    const C = { ink: col("--ink", "#1b2420"), line: col("--line", "#cfd6ca"), muted: col("--muted", "#56645d"), accent: col("--accent", "#0d6a6e"), warn: col("--warn", "#9a6512"), mono: col("--mono", "monospace") };
    const tgt = targetCurve(orn.key, ex), mine = attempt || [];
    const all = tgt.concat(mine.filter(r => r.semi !== null));
    let lo = Math.min(...all.map(r => r.semi)), hi = Math.max(...all.map(r => r.semi));
    lo = Math.floor(lo) - 1; hi = Math.ceil(hi) + 1; if (hi - lo < 4) { hi = lo + 4; }
    const tEnd = Math.max(tgt[tgt.length - 1].t, mine.length ? mine[mine.length - 1].t : 0) + 0.1;
    const padL = 34, padB = 16, x = t => padL + t / tEnd * (W - padL - 6), y = s => 6 + (hi - s) / (hi - lo) * (H - 6 - padB);
    g.font = "11px " + C.mono; g.textBaseline = "middle"; g.fillStyle = C.muted;
    for (let s = lo; s <= hi; s++) {
      const natural = [0, 2, 4, 5, 7, 9, 11].includes(((s % 12) + 12) % 12);
      g.strokeStyle = C.line; g.globalAlpha = natural ? 0.9 : 0.35; g.beginPath(); g.moveTo(padL, y(s)); g.lineTo(W, y(s)); g.stroke(); g.globalAlpha = 1;
      if (natural || hi - lo <= 8) g.fillText(name(s), 2, y(s));
    }
    g.textBaseline = "top";
    for (let t = 0; t <= tEnd; t += tEnd > 3 ? 1 : 0.5) g.fillText(t + "s", x(t) - 6, H - padB + 3);
    const line = (pts, color, width, dash) => {
      g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash || []); g.beginPath(); let pen = false, prev = null;
      for (const p of pts) { if (p.semi === null || (prev && p.t - prev.t > 0.12)) { pen = false; prev = p.semi === null ? null : p; if (p.semi === null) continue; } if (pen) g.lineTo(x(p.t), y(p.semi)); else { g.moveTo(x(p.t), y(p.semi)); pen = true; } prev = p; }
      g.stroke(); g.setLineDash([]);
    };
    line(tgt, C.muted, 3, [6, 4]);
    if (mine.length) line(mine, C.accent, 2);
  }

  hearBtn.addEventListener("click", () => {
    const tgt = targetCurve(orn.key, ex), sp = Number(speedSel.value);
    player = playCurve(tgt, sp);
    msg.textContent = "Playing " + ex.label + (sp < 1 ? " at half speed" : "") + ". The dashed line is the target.";
  });

  tryBtn.addEventListener("click", async () => {
    if (unsub) return;
    if (!(await micIntro(tryBtn.parentElement)) || gone) return;
    if (!(await countdown(tryBtn.parentElement, { btn: tryBtn, label: "Get ready: " + ex.label })) || gone || unsub) return;
    const reads = [];
    try {
      // The raw pitch of each reading (r.f), not the smoothed one: a kan lasts only a few readings.
      unsub = await listenMic(r => reads.push({ t: r.t, semi: r.f && r.semi !== null ? relSemi(r.f) : null }));
      if (gone) { unsub(); unsub = null; return; }
    } catch (e) { msg.textContent = "The microphone is not available here. You can still hear the demonstrations."; return; }
    const tgt = targetCurve(orn.key, ex), secs = tgt[tgt.length - 1].t + 2.5, t0 = Date.now();
    tryBtn.disabled = true; out.replaceChildren();
    msg.textContent = "Listening for " + Math.round(secs) + " seconds: play " + ex.label + " now.";
    timer = setInterval(() => {
      if ((Date.now() - t0) / 1000 < secs) return;
      clearInterval(timer); unsub(); unsub = null; tryBtn.disabled = false;
      attempt = cleanReadings(reads);
      const res = analyse(orn.key, ex, reads, name);
      draw();
      msg.textContent = res.verdict;
      out.replaceChildren(...res.checks.map(c => h("div", { class: "notice" + (c.ok ? " good" : "") }, h("b", null, c.ok ? "OK " : "Change "), c.text)));
      if (res.of) {
        const k = orn.key + "/" + ex.id, b = hist[k] || { passed: -1, of: res.of, tries: 0 };
        b.tries++; if (res.passed >= b.passed) { b.passed = res.passed; b.of = res.of; b.date = today(); }
        hist[k] = b; storeSet(KEY, hist); showAllKeep();
      }
    }, 150);
  });
  // Refresh the "best" line without clearing the result.
  function showAllKeep() { const m = msg.textContent; showAll(); msg.textContent = m; }

  page.append(
    h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Practice"), h("h1", null, "Ornament trainer"),
      h("p", { class: "muted" }, "Meend, kan, murki and andolan on your own flute: hear the shape, play it, and compare your pitch curve with the target.")),
    h("section", { class: "card" }, tabs, about,
      h("div", { class: "row" }, h("label", { class: "field" }, "Exercise", exSel), h("label", { class: "field" }, "Demonstration", speedSel)),
      h("div", { class: "ornwrap" }, canvas),
      h("p", { class: "small muted" }, "Dashed: the target. Solid: your attempt, from your first clear note."),
      h("div", { class: "row" }, hearBtn, tryBtn), msg, out, best),
    h("section", { class: "card" }, h("h2", null, "What the microphone can judge"),
      h("p", { class: "small" }, "It reads the pitch about 30 times a second, so it can judge the shape, width, speed and evenness of a meend or an andolan well. A kan shorter than about 40 ms, or the notes of a very fast murki, can slip between readings: if a check says a note was missing and you heard it clearly, record again a little slower."),
      h("p", { class: "small" }, "It cannot judge whether the ornament suits the raga or the song, or how it sounds. The shapes here are one common way to play them; teachers differ on how wide and slow an andolan is and how a murki is shaped (Disputed). Ask your teacher, and listen to recordings. ",
        h("a", { href: "#/read/knowledge-tree/D11-ORN-ornaments.md" }, "Read about ornaments"), ".")));
  showAll();
  const onResize = () => draw();
  window.addEventListener("resize", onResize);
  cleanups.push(() => window.removeEventListener("resize", onResize));
  return () => cleanups.forEach(f => f());
}
