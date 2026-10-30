// Browser smoke test: serves the repo, drives the app in headless Chrome/Edge, fails on any
// console error, and walks the main flows (Day 0 + M0, Day 1, reader, bench, share).
// Usage: node tests/smoke.mjs   (CHROME_PATH = browser to use; SHOTS = folder for screenshots;
//        SITE_ROOT = an assembled site folder such as _site, which also checks the docs/ site)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { KnownDevices } from "puppeteer-core";

const ROOT = process.env.SITE_ROOT ? path.resolve(process.env.SITE_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  let file = path.join(ROOT, url);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const candidates = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean);
const executablePath = candidates.find(p => fs.existsSync(p));
if (!executablePath) { console.error("No Chrome/Edge found; set CHROME_PATH."); process.exit(2); }

// Fake media devices give the tests a microphone (a generated tone) without a permission prompt.
const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errors = [];
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("requestfailed", r => { if (!r.url().includes("favicon")) errors.push("requestfailed: " + r.url()); });
page.on("response", r => { if (r.status() >= 400) errors.push("http " + r.status() + ": " + r.url()); });

const shots = process.env.SHOTS;
let failures = 0;
const check = (cond, msg) => { if (cond) console.log("  ok   " + msg); else { failures++; console.log("  FAIL " + msg); } };
const go = async hash => {
  await page.goto(BASE + "#" + hash, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => { const m = document.querySelector("#main"); return m && m.children.length && !m.querySelector(":scope > .boot"); }, { timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 250));
};
const text = () => page.$eval("#main", el => el.innerText.toLowerCase());
const clickText = async (selector, label) => {
  const ok = await page.evaluate((sel, lab) => { const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim().startsWith(lab)); if (el) el.click(); return !!el; }, selector, label);
  if (!ok) throw new Error("No " + selector + " starting with \"" + label + "\"");
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clickTextOn = async (pg, selector, label) => {
  const ok = await pg.evaluate((sel, lab) => { const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim().startsWith(lab)); if (el) el.click(); return !!el; }, selector, label);
  if (!ok) throw new Error("No " + selector + " starting with \"" + label + "\"");
};

const shot = async name => { if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, name + ".png"), fullPage: false }); } };
const progress = () => page.evaluate(() => JSON.parse(localStorage.getItem("bansuri.progress") || "null"));

try {
  console.log("Today (first run)");
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await go("/today");
  let t = await text();
  check(t.includes("learn the bansuri one day at a time"), "welcome card on first run");
  check(t.includes("start day 0"), "Day 0 call to action");
  check(t.includes("hear a real bansuri"), "real bansuri samples offered in Phase 1");
  check(await page.evaluate(async () => (await fetch("app/audio/bansuri-small-e-sample.ogg")).ok), "bundled bansuri sample is served");
  await shot("01-today");

  console.log("Routes render");
  for (const [route, needle] of [["/plan", "Course map"], ["/library", "The whole course"], ["/read/lessons/L04-first-sound.md", "First Sound"], ["/bench", "Practice Bench"], ["/journal", "Practice journal"], ["/progress", "How far you have come"], ["/settings", "Your flute"], ["/milestone/M1", "First Stable Tone"], ["/day/14", "Milestone"], ["/day/300", "Locked"]]) {
    await go(route);
    t = await text();
    check(t.includes(needle.toLowerCase()), route + " shows \"" + needle + "\"");
    await shot("route" + route.replace(/[\/.]/g, "_"));
  }

  console.log("Reader");
  await go("/read/lessons/L04-first-sound.md");
  check(await page.$$eval("#main .reader table", x => x.length) > 0, "tables render");
  check(await page.$$eval("#main .reader details", x => x.length) > 0, "answer key <details> renders");
  check(await page.$eval("#main .reader", el => !el.innerHTML.includes("<script")), "no script tags in rendered content");
  const internal = await page.$$eval("#main .reader a", as => as.map(a => a.getAttribute("href")).filter(h => h && h.startsWith("#/read/")).length);
  check(internal > 0, "internal links rewritten to app routes (" + internal + ")");
  await go("/read/05-CONVENTIONS-AND-NOTATION-KEY.md#31-master-fingering-chart-for-a-6-hole-bansuri-sa--c");
  check(await page.evaluate(() => !!document.getElementById("31-master-fingering-chart-for-a-6-hole-bansuri-sa--c")), "heading anchor ids match GitHub slugs");

  console.log("Lesson cards");
  await page.evaluate(() => { localStorage.removeItem("bansuri.readerMode"); Object.keys(localStorage).filter(k => k.startsWith("bansuri.cardpos")).forEach(k => localStorage.removeItem(k)); });
  await go("/read/lessons/L07-long-tones-tuner-and-drone.md");
  const deckCount = await page.$eval("#main .deck .small.muted", el => el.textContent);
  check(/^1 of \d+$/.test(deckCount) && Number(deckCount.split(" of ")[1]) >= 8, "L07 opens as cards (" + deckCount + ")");
  let sawQuiz = false;
  for (let i = 0; i < 20 && !sawQuiz; i++) {
    sawQuiz = await page.$("#main .deck .flash") !== null;
    if (!sawQuiz) await page.click("#main .deck-nav .btn.primary");
  }
  check(sawQuiz, "the quiz becomes flashcards");
  await clickText("#main .deck .flash button", "Show answer");
  check(await page.$eval("#main .deck .flash-a", el => !el.hidden && el.textContent.length > 3), "a flashcard shows its answer");
  await clickText("#main .seg button", "Full lesson");
  check(await page.$eval("#main .page > article.card", el => el.offsetParent !== null && el.querySelectorAll("h2").length > 5), "the full lesson is one tap away");
  await clickText("#main .seg button", "Cards");
  await go("/read/lessons/L20-raga-bhupali.md");
  const plays = await page.$$eval("#main .playnote", x => x.length);
  check(plays > 5, "notation in lessons has play buttons (" + plays + " in L20)");
  await page.evaluate(() => [...document.querySelectorAll("#main .playnote")].find(b => b.offsetParent).click());
  check(await page.$eval("#main .playnote[aria-pressed='true']", () => true).catch(() => false), "a play button plays its notation");

  console.log("Lessons: practise now, glossary");
  await page.evaluate(() => { Object.keys(localStorage).filter(k => k.startsWith("bansuri.cardpos")).forEach(k => localStorage.removeItem(k)); });
  await go("/read/lessons/L07-long-tones-tuner-and-drone.md");
  for (let i = 0; i < 30 && !(await page.$("#main .deck .lcard .eyebrow").then(e => e && e.evaluate(x => /Practise it now/.test(x.textContent)))); i++) await page.click("#main .deck-nav .btn.primary");
  check(/Practise it now/i.test(await page.$eval("#main .deck .lcard", e => e.innerText)), "a lesson ends with a Practise it now card");
  await clickText("#main .deck .lcard button", "Hold Sa");
  check(await page.$("#main .deck .lcard .lv-hold") !== null, "Practise it now opens the lesson's live exercise");
  await page.waitForSelector("#main .gloss", { timeout: 5000 }).then(() => check(true, "glossary terms are tap-to-define"), () => check(false, "glossary terms are tap-to-define"));
  await page.evaluate(() => document.querySelector("#main .gloss").click());
  check(await page.$eval("#main .glossdef:not([hidden])", e => e.textContent.length > 10).catch(() => false), "tapping a term shows its meaning");
  await go("/read/ragas/README.md");
  await clickText("#main button", "Play Name that raga");
  await page.waitForSelector("#main .lv-ragaquiz", { timeout: 8000 });
  await clickText("#main .lv-ragaquiz button", "Play a phrase");
  check(await page.$$eval("#main .lv-ragaquiz .lv-ans", x => x.length) === 4, "Name that raga offers four ragas to choose from");

  console.log("Pace and Devanagari");
  await go("/settings");
  await page.select("#st-pace", "short");
  await go("/session/0");
  check(/^18:00$/.test(await page.$eval("#main .block .timer", e => e.textContent.trim())), "a short daily time scales a 30-minute block to 18 minutes");
  await go("/settings");
  await page.select("#st-pace", "standard");
  await page.click("#st-deva");
  await go("/bench");
  await page.evaluate(() => document.querySelector('.bb-tabs button[data-tab="play"]').click());
  check(await page.$(".bb-bench .bb-score .bb-deva") !== null, "the score shows sargam in Devanagari when chosen");
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("bansuri.settings")); s.deva = false; localStorage.setItem("bansuri.settings", JSON.stringify(s)); });

  console.log("Songs and ragas");
  await go("/songs");
  await page.evaluate(() => { const f = document.getElementById("songs-ready"); if (f.checked) f.click(); });
  const nSongs = await page.$$eval("#main .song", x => x.length);
  check(nSongs >= 15, "the song library lists the melodies (" + nSongs + ")");
  await clickText("#main .song button", "Play along");
  check(await page.$("#main .song .bb-bench [data-ref=checkMe]:checked") !== null, "a song opens in play-along with the mic check on");
  await go("/read/ragas/malkauns.md");
  check(/ma \(this raga leaves out pa\)/.test(await text()), "Malkauns: the drone uses Ma, since the raga leaves out Pa");
  await clickText("#main button", "Play back phrases in this raga");
  check(await page.$eval("#main .lv-echo select", el => el.selectedOptions[0].textContent).then(t => /Malkauns/i.test(t)), "raga play back uses the raga's own notes");

  console.log("Bench");
  await go("/bench");
  check(await page.$(".bb-bench") !== null, "bench mounted");
  check(await page.$$eval(".bb-bench tbody tr", x => x.length) >= 24, "fingering chart has 24 rows");

  console.log("Robustness");
  await page.evaluate(() => localStorage.setItem("bansuri.progress", JSON.stringify({ current: 14, log: [null, { date: 5 }], days: { "3": null }, milestones: { M1: { status: "failed" } }, reviews: { x: null }, badges: [] })));
  await go("/today");
  t = await text();
  check(t.includes("milestone"), "damaged saved progress still renders Today (Day 14)");
  for (const r of ["/progress", "/journal", "/plan", "/milestone/M1"]) { await go(r); check((await text()).length > 50, r + " renders with damaged progress"); }
  await page.goto(BASE + "#/read/100%E0", { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 400));
  check((await page.$eval("#main", el => el.innerText)).length > 0, "malformed percent-encoding in the address does not blank the app");
  await page.evaluate(() => localStorage.clear());

  console.log("Milestone checklists");
  for (let i = 0; i <= 10; i++) {
    await go("/milestone/M" + i);
    const total = await page.$$eval("#main .mitem", x => x.length);
    const required = await page.$$eval("#main .mitem .chip.info", x => x.length);
    check(total >= 3 && required >= 1, "M" + i + " checklist: " + total + " items, " + required + " required");
  }

  console.log("Day 0 + M0");
  await go("/session/0");
  // Sessions run one step at a time: "Done, next step" until the last step opens the finish dialog.
  const walkSteps = async () => {
    const n = await page.$$eval("#main .stepdot", x => x.length);
    for (let i = 0; i < n; i++) { await page.click("#main .block.active .stepnav .btn.primary"); await sleep(120); }
    return n;
  };
  const steps0 = await walkSteps();
  check(steps0 > 0 && await page.$$eval("#main .block", b => b.filter(x => getComputedStyle(x).display !== "none").length) === 1, "Day 0 shows one of its " + steps0 + " steps at a time");
  await page.waitForSelector("dialog.modal[open]");
  const yes = await page.$("#fin-yes");
  if (yes) await yes.click();
  await page.click("dialog.modal button[type=submit]");
  await new Promise(r => setTimeout(r, 600));
  check((await progress()).current === 0, "Day 0 does not advance before M0 is passed");
  await go("/milestone/M0");
  const req = await page.$$("#main .mitem input[type=checkbox]");
  for (const b of req) await b.click();
  check(req.length >= 6, "M0 checklist parsed (" + req.length + " items)");
  await page.click("#main button.btn.primary.big");
  await new Promise(r => setTimeout(r, 500));
  check((await progress()).current === 1, "passing M0 unlocks Day 1");
  await shot("02-m0-passed");

  console.log("Day 1");
  await go("/session/1");
  await walkSteps();
  await page.waitForSelector("dialog.modal[open]");
  await page.click("#fin-yes");
  await page.type("#fin-note", "Smoke test note");
  await page.click("dialog.modal button[type=submit]");
  await new Promise(r => setTimeout(r, 600));
  const p1 = await progress();
  check(p1.current === 2, "finishing Day 1 with the pass check unlocks Day 2");
  check(p1.log.length >= 2 && p1.log.some(e => e.note === "Smoke test note"), "session logged with note");
  check(!!p1.badges["first-day"], "badge 'first-day' earned");
  await go("/today");
  t = await text();
  check(t.includes("day 2"), "Today moves on to Day 2");
  await go("/session/2");
  await page.click('#main .stepdot[data-id="K"]');
  await sleep(200);
  check(await page.$("#main .block.active .lv-hold") !== null, "the first-sound step shows the live long-tone meter");
  await page.click("#main .session-head .btn.ghost");
  await sleep(100);
  check(await page.$$eval("#main .block", b => b.filter(x => getComputedStyle(x).display !== "none").length) > 1, "Show all steps lists every block");
  await page.click("#main .session-head .btn.ghost");
  await shot("03-today-day2");

  console.log("Share");
  await go("/progress");
  await page.type("#sh-name", "Tester");
  const btns = await page.$$("#main button.btn.primary");
  await btns[btns.length - 1].click();
  const link = await page.$eval("#main input[readonly]", el => el.value);
  check(link.includes("#/share/"), "share link created");
  await page.goto(link, { waitUntil: "networkidle0" });
  await page.waitForSelector(".sharecard");
  t = await text();
  check(t.includes("tester") && t.includes("day 2"), "share card shows name and day");
  await shot("04-share");

  if (process.env.SITE_ROOT) {
    console.log("Reference site");
    const r = await page.goto(BASE + "docs/", { waitUntil: "networkidle0" });
    check(r && r.status() === 200, "docs/ reference site loads");
    check((await page.title()).includes("Bansuri Mastery"), "docs/ has the site title");
    await page.goto(BASE + "#/today", { waitUntil: "networkidle0" });
  }

  console.log("Recording and pitch (fake microphone)");
  await go("/journal");
  await clickText("#main .card button", "Record");
  await page.waitForFunction(() => /Recording\./.test(document.querySelector("#main").innerText), { timeout: 8000 });
  await sleep(2500);
  await clickText("#main .card button", "Stop");
  await page.waitForFunction(() => /Saved to your journal/.test(document.querySelector("#main").innerText), { timeout: 8000 });
  check(true, "recording saved to the journal");
  await page.waitForSelector("#main .rec");
  await clickText("#main .rec button", "Analyse pitch");
  await page.waitForFunction(() => /steady notes|No steady notes/.test(document.querySelector("#main .rec").innerText), { timeout: 20000 });
  check(true, "recording analysed (" + (await page.$eval("#main .rec", el => (el.innerText.match(/\d+ steady notes/) || ["no steady notes"])[0])) + ")");
  check((await progress()).recordings === 1, "recording counted once");
  await go("/bench");
  await page.evaluate(() => document.querySelector('.bb-bench .bb-tabs button[data-tab="check"]').click());
  await page.evaluate(() => { const b = [...document.querySelectorAll(".bb-bench button")].find(x => /start microphone/i.test(x.textContent)); if (b) b.click(); });
  await page.waitForFunction(() => /Listening/.test(document.querySelector(".bb-bench").innerText), { timeout: 8000 }).then(() => check(true, "live tuner starts with a microphone"), () => check(false, "live tuner starts with a microphone"));

  console.log("Check my flute with a real bansuri recording");
  {
    // The bundled small E bansuri sample is tuned about half a semitone sharp of E5 at A4 = 440.
    await page.evaluate(() => localStorage.setItem("bansuri.settings", JSON.stringify({ saNote: 4, saOct: 5, a4: 440, volume: 0.75 })));
    await page.goto(BASE + "#/bench", { waitUntil: "networkidle0" });
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector(".bb-bench [data-ref=fileIn]");
    await page.evaluate(() => [...document.querySelectorAll(".bb-tabs button")].find(b => b.dataset.tab === "check").click());
    await page.select(".bb-bench [data-ref=plan]", "7");
    const done = () => page.waitForFunction(() => /^Done/.test(document.querySelector("[data-ref=fileStatus]").textContent), { timeout: 30000 });
    await (await page.$(".bb-bench [data-ref=fileIn]")).uploadFile(path.join(ROOT, "app/audio/bansuri-small-e-sample.ogg"));
    await done();
    const inTune = () => page.$$eval("[data-ref=resBody] tr", trs => trs.filter(tr => /In tune/.test(tr.innerText)).length + " of " + trs.length);
    const before = await inTune();
    check(await page.$eval("[data-ref=tuneNote]", el => !el.hidden && /cents/.test(el.textContent)), "a consistently sharp flute is recognised (" + before + " notes in tune before)");
    await page.click("[data-ref=tuneNote] button");
    await done(); await sleep(300);
    const after = await inTune(), [k, n] = after.split(" of ").map(Number);
    check(k / n >= 0.6, "after tuning the app to the flute, " + after + " notes read in tune");
    check(!(await page.$$eval("[data-ref=resBody] tr", trs => trs.some(tr => /\.\.S|\.\.r/.test(tr.innerText)))), "impossible notes two octaves down are dropped");
    await page.select(".bb-bench [data-ref=plan]", "0");
    check(await page.$eval("[data-ref=resBody]", el => /Extra|Missing|In tune|Close|Different/.test(el.innerText)), "changing the plan re-checks the same recording");
    await page.evaluate(() => localStorage.removeItem("bansuri.settings"));
  }

  console.log("Ear quiz");
  await go("/bench");
  await page.evaluate(() => [...document.querySelectorAll(".bb-tabs button")].find(b => b.dataset.tab === "ear").click());
  await page.click(".bb-bench [data-ref=earReset]");
  await page.click(".bb-bench [data-ref=earNext]");
  check((await page.$$eval(".bb-bench [data-ref=earOpts] button", b => b.length)) === 2, "Level 2 offers Sa and Pa");
  await page.click(".bb-bench [data-ref=earOpts] button");
  check(/Correct|It was/.test(await page.$eval(".bb-bench [data-ref=earMsg]", e => e.textContent)) && /Score: \d \/ 1/.test(await page.$eval(".bb-bench [data-ref=earScore]", e => e.textContent)), "answering scores the question");

  console.log("Coach (offline)");
  await go("/coach");
  await clickText("#main button", "Low notes");
  await page.waitForFunction(() => /Fixes and drills|How to verify/i.test(document.querySelector("#main").innerText), { timeout: 8000 });
  check(true, "coach shows the troubleshooting guide for a symptom");
  check(await page.$$eval("#main .checkli input", x => x.length) > 0, "the quick checks are a checklist");
  await clickText("#main button", "Try the drill now");
  check(await page.$("#main .drillcard .lv-hold") !== null, "the coach opens a live drill (hold low Pa)");
  await clickText("#main button", "Yes, it helped");
  check(/What you worked on/.test(await page.$eval("#main", e => e.innerText)), "the coach remembers what helped");

  console.log("Journal and progress");
  await go("/journal");
  await clickText("#main .chipbtn", "45 min");
  await clickText("#main .chipbtn", "Went well");
  await page.type("#j-note", "Long tones");
  await clickText("#main button", "Log it");
  await sleep(300);
  check(await page.evaluate(() => { const e = JSON.parse(localStorage.getItem("bansuri.progress")).log.pop(); return e.minutes === 45 && e.feel === "great" && e.note === "Long tones"; }), "one-tap log saves minutes, how it went and the note");
  check(/Went well/.test(await page.$eval("#main .timeline", e => e.innerText)), "the day-by-day timeline shows the entry");
  await go("/progress");
  check(await page.$$eval("#main .wkchart .wk-bar", x => x.length) === 12 && await page.$("#main .wkchart path") !== null, "progress charts 12 weeks of practice");
  check(await page.$$eval("#main .mspath li", x => x.length) === 11, "progress shows the M0-M10 milestone path");

  console.log("Tala with tabla theka");
  await go("/bench");
  await page.evaluate(() => { const b = [...document.querySelectorAll(".bb-bench .bb-tabs button, .bb-bench [role=tab]")].find(x => /tala/i.test(x.textContent)); if (b) b.click(); });
  const talas = await page.$$eval(".bb-bench [data-ref=talaSel] option", os => os.map(o => o.value));
  check(talas.length >= 4, talas.length + " talas offered");
  check(await page.$eval(".bb-bench [data-ref=talaSound]", el => el.value) === "tabla", "tala plays the tabla theka by default");
  for (const k of talas) {
    await page.select(".bb-bench [data-ref=talaSel]", k);
    await page.$eval(".bb-bench [data-ref=talaBpm]", el => { el.value = "240"; });
    await page.click(".bb-bench [data-ref=talaBtn]");
    const lit = await page.waitForSelector(".bb-bench .bb-beat.bb-on", { timeout: 4000 }).then(() => true, () => false);
    await page.click(".bb-bench [data-ref=talaBtn]");
    check(lit, "tala " + k + " plays and lights its beats");
  }

  console.log("Notation player stops");
  {
    // A second page whose audio output is tapped, to measure sound after Stop.
    const ap = await browser.newPage();
    ap.on("pageerror", e => errors.push("pageerror: " + e.message));
    await ap.evaluateOnNewDocument(() => {
      const orig = AudioNode.prototype.connect;
      window.__out = [];
      AudioNode.prototype.connect = function (dest, ...rest) {
        if (dest instanceof AudioDestinationNode && !this.__tapped) {
          const c = this.context;
          if (!c.__tap) { const sp = c.createScriptProcessor(1024, 1, 1); sp.onaudioprocess = e => { window.__out.push(Float32Array.from(e.inputBuffer.getChannelData(0))); if (window.__out.length > 16) window.__out.shift(); }; const z = c.createGain(); z.gain.value = 0; orig.call(sp, z); orig.call(z, c.destination); c.__tap = sp; }
          orig.call(this, c.__tap); this.__tapped = true;
        }
        return orig.call(this, dest, ...rest);
      };
    });
    await ap.goto(BASE + "#/bench", { waitUntil: "networkidle0" });
    await ap.waitForSelector(".bb-bench [data-ref=playBtn]");
    await ap.evaluate(() => { [...document.querySelectorAll(".bb-tabs button")].find(b => b.dataset.tab === "play").click(); const c = document.querySelector("[data-ref=clickOn]"); if (c && !c.checked) c.click(); const d = document.querySelector("[data-ref=droneWithPlay]"); if (d && !d.checked) d.click(); });
    const level = () => ap.evaluate(() => window.__out.slice(-6).reduce((p, b) => b.reduce((q, v) => Math.max(q, Math.abs(v)), p), 0));
    await ap.click("[data-ref=playBtn]"); await sleep(1200);
    check(await level() > 0.05, "notation plays");
    await ap.click("[data-ref=stopBtn]"); await sleep(600);
    check(await level() < 0.005, "Stop silences the notation, its beat click and its tanpura");
    await ap.click("[data-ref=playBtn]"); await sleep(500); await ap.click("[data-ref=playBtn]"); await sleep(800);
    await ap.click("[data-ref=stopBtn]"); await sleep(600);
    check(await level() < 0.005, "pressing Play twice leaves nothing playing after Stop");
    await ap.evaluate(() => { const s = document.querySelector("[data-ref=notation]"); s.value = "S R"; s.dispatchEvent(new Event("input")); document.querySelector("[data-ref=bpm]").value = "200"; });
    await ap.click("[data-ref=playBtn]"); await sleep(3500); // one bar of count-in, two beats, then the end
    check(await level() < 0.005, "the beat click and tanpura stop when the notation ends");
    await ap.close();
  }

  console.log("Settings: CSV and problem report");
  await go("/settings");
  const csv = await page.evaluate(() => new Promise(resolve => {
    const orig = URL.createObjectURL;
    URL.createObjectURL = b => { URL.createObjectURL = orig; b.arrayBuffer().then(buf => { const u = new Uint8Array(buf); resolve((u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf ? "BOM" : "") + new TextDecoder().decode(u)); }); return orig.call(URL, b); };
    [...document.querySelectorAll("#main button")].find(x => /CSV/.test(x.textContent)).click();
  }));
  check(/^BOMdate,day,minutes/.test(csv), "CSV starts with a UTF-8 BOM and the log header");
  check(/Smoke test note/.test(csv) && /milestone,title,status,attempts/.test(csv) && /M0,/.test(csv), "CSV has the log note and milestone rows");
  await clickText("#main button", "Copy problem report");
  await page.waitForFunction(() => { const t = document.querySelector("#main textarea[aria-label='Problem report']"); return t && !t.hidden && t.value.length > 20; }, { timeout: 4000 })
    .then(() => check(true, "problem report is generated"), () => check(false, "problem report is generated"));
  check(/user agent|userAgent|browser/i.test(await page.$eval("#main textarea[aria-label='Problem report']", el => el.value)), "problem report names the browser");

  console.log("Live exercises (synthetic microphone)");
  {
    // A page whose microphone is an oscillator the test tunes to any note.
    const lp = await browser.newPage();
    lp.on("pageerror", e => errors.push("pageerror: " + e.message));
    lp.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
    await lp.evaluateOnNewDocument(() => {
      // Every stream the app opens plays the current test tone (window.__tone sets it; 0 = silence).
      const voices = []; let current = 0;
      const apply = (v, hz) => { const t = v.c.currentTime; if (hz) { v.o.frequency.setValueAtTime(hz, t); v.g.gain.setTargetAtTime(0.4, t, 0.005); } else v.g.gain.setTargetAtTime(0, t, 0.005); };
      window.__tone = hz => { current = hz; voices.forEach(v => apply(v, hz)); };
      navigator.mediaDevices.getUserMedia = async () => {
        const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(), d = c.createMediaStreamDestination();
        o.type = "triangle"; g.gain.value = 0; o.connect(g); g.connect(d); o.start();
        const v = { c, o, g, stream: d.stream }; voices.push(v); apply(v, current);
        return d.stream;
      };
      // How many microphone streams the app still holds open.
      window.__openMics = () => voices.filter(v => v.stream.getTracks().some(t => t.readyState === "live")).length;
      const realStop = MediaStreamTrack.prototype.stop;
      MediaStreamTrack.prototype.stop = function () { return realStop.call(this); };
      window.__noop = () => {
      };
    });
    const hz = semi => 523.251 * Math.pow(2, semi / 12);
    const tone = semi => lp.evaluate(f => window.__tone && window.__tone(f), semi === null ? 0 : hz(semi));
    const tab = name => lp.evaluate(n => document.querySelector(`.bb-tabs button[data-tab="${n}"]`).click(), name);
    await lp.goto(BASE + "#/bench", { waitUntil: "networkidle0" });
    await lp.evaluate(() => { localStorage.removeItem("bansuri.settings"); localStorage.removeItem("bansuri.live.echo"); });
    await lp.reload({ waitUntil: "networkidle0" });
    await lp.waitForSelector(".bb-bench [data-ref=toneNote]");

    await tab("tones");
    await lp.select(".bb-bench [data-ref=toneNote]", "0");
    await lp.select(".bb-bench [data-ref=toneSecs]", "4");
    await lp.click(".lv-hold .lv-primary");
    await lp.waitForSelector(".lv-hold .lv-intro", { timeout: 3000 }).then(() => check(true, "the first microphone use explains why, before the browser asks"), () => check(false, "the first microphone use explains why, before the browser asks"));
    await lp.click(".lv-hold .lv-intro .lv-primary");
    await sleep(300); await tone(2);
    await sleep(5000);
    check(await lp.$(".lv-hold.lv-passed") === null && /target is S/.test(await lp.$eval(".lv-hold .lv-msg", e => e.textContent)), "long tones: holding the wrong note (R) does not pass, and says so");
    await tone(0.08);
    await lp.waitForSelector(".lv-hold.lv-passed", { timeout: 9000 }).then(() => check(true, "long tones: holding Sa for 4 s fills the ring"), () => check(false, "long tones: holding Sa for 4 s fills the ring"));
    await tone(null);

    await tab("echo");
    await lp.select(".lv-echo select", "sp");
    await lp.click(".lv-echo .lv-check input");
    await lp.click(".lv-echo .lv-primary");
    await sleep(200);
    const phrase = await lp.$$eval(".lv-echo .lv-slot", x => x.map(e => e.textContent));
    await lp.waitForFunction(() => /Your turn/.test(document.querySelector(".lv-echo .lv-msg").textContent), { timeout: 6000 });
    for (const code of phrase) { await tone({ S: 0, P: 7 }[code]); await sleep(500); await tone(null); await sleep(180); }
    await lp.waitForFunction(() => /Correct/.test(document.querySelector(".lv-echo .lv-msg").textContent), { timeout: 4000 })
      .then(() => check(true, "play it back: echoing " + phrase.join(" ") + " is marked correct"), async () => check(false, "play it back: " + await lp.$eval(".lv-echo .lv-msg", e => e.textContent)));

    await tab("play");
    await lp.evaluate(() => {
      const n = document.querySelector(".bb-bench [data-ref=notation]"); n.value = "S - - -"; n.dispatchEvent(new Event("input"));
      document.querySelector(".bb-bench [data-ref=bpm]").value = "120";
      const ck = document.querySelector(".bb-bench [data-ref=clickOn]"); if (ck.checked) ck.click();
      const me = document.querySelector(".bb-bench [data-ref=checkMe]"); if (!me.checked) me.click();
    });
    await tone(0);
    await lp.click(".bb-bench [data-ref=playBtn]");
    await lp.waitForFunction(() => /1 of 1 notes right/.test(document.querySelector(".bb-bench [data-ref=checkSum]").textContent), { timeout: 6000 })
      .then(() => check(true, "play along: the mic marks the note played right"), () => check(false, "play along: the mic marks the note played right"));
    await tone(4);
    await lp.click(".bb-bench [data-ref=playBtn]");
    await lp.waitForFunction(() => /0 of 1 notes right/.test(document.querySelector(".bb-bench [data-ref=checkSum]").textContent), { timeout: 6000 })
      .then(() => check(true, "play along: a wrong note is marked wrong"), () => check(false, "play along: a wrong note is marked wrong"));
    await tone(null);
    await lp.evaluate(() => { const me = document.querySelector(".bb-bench [data-ref=checkMe]"); if (me.checked) me.click(); });

    // No microphone is left open: a double Start, then leaving the tab; and leaving a page mid-start.
    await tab("tones");
    await lp.evaluate(() => { const b = document.querySelector(".lv-hold .lv-primary"); b.click(); b.click(); });
    await sleep(400);
    await tab("chart");
    await sleep(300);
    check(await lp.evaluate(() => window.__openMics()) === 0, "a double Start, then leaving the tab, leaves no microphone open");

    await lp.evaluate(() => localStorage.setItem("bansuri.progress", JSON.stringify({ current: 14 })));
    await lp.goto(BASE + "#/milestone/M1", { waitUntil: "networkidle0" });
    await lp.reload({ waitUntil: "networkidle0" });
    await lp.waitForSelector("#main .mrow");
    await lp.evaluate(() => [...document.querySelectorAll("#main .mrow button")].find(b => /Check with mic/.test(b.textContent)).click());
    await lp.click("#main .micpanel .lv-primary");
    await sleep(300); await tone(-0.05);
    await lp.waitForFunction(() => [...document.querySelectorAll("#main .mrow")].some(r => r.querySelector(".micpanel") && r.querySelector("input[type=checkbox]").checked), { timeout: 12000 })
      .then(() => check(true, "milestone M1: holding Sa 8 s with the mic ticks item 3"), () => check(false, "milestone M1: holding Sa 8 s with the mic ticks item 3"));
    await tone(null);
    await lp.evaluate(() => [...document.querySelectorAll("#main .mrow")].find(r => /S R G R S/.test(r.innerText)).querySelector("button").click());
    await lp.evaluate(() => [...document.querySelectorAll("#main .micpanel .lv-primary")].pop().click());
    await sleep(300);
    for (const n of [0, 2, 4, 2, 0, 2, 4]) { await tone(n); await sleep(420); await tone(null); await sleep(160); }
    await sleep(400);
    check(await lp.evaluate(() => { const rows = [...document.querySelectorAll("#main .mrow")].filter(r => r.querySelector(".micpanel")); const r = rows[rows.length - 1]; return !r.querySelector("input[type=checkbox]").checked && /1 of 3 clean/.test(r.innerText); }),
      "milestone phrase: one clean pass counts once (1 of 3), not more");
    await lp.evaluate(() => [...document.querySelectorAll("#main .micpanel .lv-primary")].pop().click());

    // Placement: pass the first item (hold Sa), then stop: the test recommends Phase 1.
    await lp.goto(BASE + "#/settings", { waitUntil: "networkidle0" });
    await lp.waitForSelector("#st-placetest", { timeout: 5000 });
    await lp.click("#st-placetest");
    await lp.click("#main .placement .lv-primary");
    await sleep(300); await tone(0);
    await lp.waitForFunction(() => /S R G R S/.test(document.querySelector("#main .placement h3").textContent), { timeout: 9000 })
      .then(() => check(true, "placement: holding Sa passes item 1 and moves on"), () => check(false, "placement: holding Sa passes item 1 and moves on"));
    await tone(null);
    await clickTextOn(lp, "#main .placement button", "I cannot play this yet");
    check(/Recommended start: Phase 1/.test(await lp.$eval("#main .placement", e => e.innerText)) && await lp.$eval("#st-phase", e => e.value) === "1", "placement recommends Phase 1 and preselects it");

    // Milestone M4: identifying notes is a note-naming test.
    await lp.evaluate(() => localStorage.setItem("bansuri.progress", JSON.stringify({ current: 130, startedAt: "2026-05-01" })));
    await lp.goto(BASE + "#/milestone/M4", { waitUntil: "networkidle0" });
    await lp.reload({ waitUntil: "networkidle0" });
    await lp.waitForSelector("#main .mrow");
    await lp.evaluate(() => [...document.querySelectorAll("#main .mrow button")].find(b => /Check with mic/.test(b.textContent)).click());
    check(await lp.$("#main .micpanel .lv-quiz") !== null, "milestone M4: identifying notes opens a note-naming test");

    // The coach listens: a held Sa 35 cents flat is diagnosed as flat.
    await lp.goto(BASE + "#/coach", { waitUntil: "networkidle0" });
    await lp.waitForFunction(() => [...document.querySelectorAll("#main button")].some(b => /Start listening/.test(b.textContent)), { timeout: 5000 });
    await clickTextOn(lp, "#main button", "Start listening");
    await sleep(300); await tone(-0.35);
    await lp.waitForFunction(() => /cents flat/.test(document.querySelector("#main").innerText), { timeout: 12000 })
      .then(() => check(true, "the coach hears that a held Sa is flat"), async () => check(false, "coach: " + (await lp.$eval("#main", e => e.innerText)).slice(0, 300)));
    await tone(null);

    // A session step with a listening goal ticks itself when the goal is met.
    await lp.evaluate(() => localStorage.setItem("bansuri.progress", JSON.stringify({ current: 2, startedAt: "2026-10-01" })));
    await lp.goto(BASE + "#/session/2", { waitUntil: "networkidle0" });
    await lp.reload({ waitUntil: "networkidle0" });
    await lp.waitForSelector('#main .stepdot[data-id="K"]');
    await lp.click('#main .stepdot[data-id="K"]');
    await lp.click("#main .block.active .lv-hold .lv-primary");
    await sleep(300); await tone(0);
    await lp.waitForFunction(() => document.querySelector("#main .block.active label.check input[type=checkbox]").checked, { timeout: 8000 })
      .then(() => check(true, "session: reaching the long-tone goal ticks the step"), () => check(false, "session: reaching the long-tone goal ticks the step"));
    await tone(null);
    await lp.click("#main .block.active .lv-hold .lv-primary"); // stop listening: the best hold is recorded

    // Your playing: the results are stored and shown.
    await lp.goto(BASE + "#/progress", { waitUntil: "networkidle0" });
    await lp.reload({ waitUntil: "networkidle0" });
    await lp.waitForSelector("#main .liverow", { timeout: 4000 }).then(() => check(true, "progress shows the measured long tones"), () => check(false, "progress shows the measured long tones"));

    // Find my flute: playing E5 as Sa sets the flute to E.
    await lp.goto(BASE + "#/settings", { waitUntil: "networkidle0" });
    await lp.waitForFunction(() => [...document.querySelectorAll("#main button")].some(b => /Detect from my flute/.test(b.textContent)), { timeout: 5000 });
    await clickTextOn(lp, "#main button", "Detect from my flute");
    await clickTextOn(lp, "#main .lv-finder button", "Listen for my Sa");
    await sleep(300); await tone(4);
    await lp.waitForFunction(() => /Your Sa is E5/.test(document.querySelector("#main .lv-finder .lv-msg").textContent), { timeout: 8000 })
      .then(() => check(true, "find my flute: a Sa of E5 is recognised"), async () => check(false, "find my flute: " + await lp.$eval("#main .lv-finder .lv-msg", e => e.textContent)));
    await tone(null);
    await clickTextOn(lp, "#main .lv-finder button", "Use this for my flute");
    await clickTextOn(lp, "#main .lv-finder button", "Listen again");
    await lp.evaluate(() => { location.hash = "#/today"; });
    await sleep(600);
    check(await lp.evaluate(() => window.__openMics()) === 0, "leaving Settings while the flute finder listens closes the microphone");
    check(await lp.evaluate(() => { const s = JSON.parse(localStorage.getItem("bansuri.settings") || "{}"); return s.saNote === 4 && s.saOct === 5; }), "find my flute: the flute is saved as Sa = E5");

    await lp.evaluate(() => localStorage.clear());
    await lp.close();
  }

  console.log("Offline and updates (service worker)");
  {
    const sp = await browser.newPage();
    sp.on("pageerror", e => errors.push("pageerror: " + e.message));
    await sp.goto(BASE + "#/today", { waitUntil: "networkidle0" });
    await sp.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 15000 }).catch(() => {});
    if (!(await sp.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller)))) { await sp.reload({ waitUntil: "networkidle0" }); }
    const controlled = await sp.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
    check(controlled, "the service worker controls the app");
    // An old, incompatible copy of a module in the cache (what a half-applied update looks like)...
    await sp.evaluate(async () => {
      for (const k of await caches.keys()) {
        const c = await caches.open(k);
        await c.put(new Request(new URL("app/js/core/listen.js", location.href)), new Response("export const old = 1;", { headers: { "Content-Type": "text/javascript" } }));
      }
    });
    await sp.reload({ waitUntil: "networkidle0" });
    await sp.waitForFunction(() => { const m = document.querySelector("#main"); return m && !m.querySelector(":scope > .boot"); }, { timeout: 10000 }).catch(() => {});
    check(!/Something went wrong/.test(await sp.$eval("#main", e => e.innerText)), "online, a stale cached module is never mixed in (the app loads fresh files)");
    // ...and offline, the whole app comes from the saved copy (restore the real module first).
    await sp.evaluate(async () => { for (const k of await caches.keys()) { const c = await caches.open(k); await c.put(new Request(new URL("app/js/core/listen.js", location.href)), await fetch("app/js/core/listen.js", { cache: "no-store" })); } });
    await sp.setOfflineMode(true);
    await sp.goto(BASE + "#/bench", { waitUntil: "load" }).catch(() => {});
    await sp.waitForSelector(".bb-bench", { timeout: 10000 }).then(() => check(true, "offline, the app and the Practice Bench load from the saved copy"), () => check(false, "offline, the app and the Practice Bench load from the saved copy"));
    await sp.setOfflineMode(false);
    await sp.close();
  }

  console.log("Phone layout (iPhone 13 emulation: size, touch, user agent; the engine is still Chromium)");
  await page.emulate(KnownDevices["iPhone 13"]);
  for (const [route, name] of [["/today", "05-phone-today"], ["/session/2", "06-phone-session"], ["/bench", "07-phone-bench"], ["/coach", "09-phone-coach"], ["/journal", "10-phone-journal"], ["/plan", "11-phone-plan"], ["/milestone/M1", "12-phone-milestone"], ["/progress", "13-phone-progress"], ["/settings", "14-phone-settings"]]) {
    await go(route);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(ov <= 1, route + " fits an iPhone screen (" + ov + "px overflow)");
    await shot(name);
  }
} catch (e) {
  failures++;
  console.log("  FAIL exception: " + e.message);
} finally {
  // The docs theme asks api.github.com for repo stats; that third-party call is not ours to test.
  const relevant = errors.filter((e, i, all) => !/AudioContext was not allowed to start/.test(e) && !/api.github.com/.test(e) && !(/Failed to load resource/.test(e) && all.some(x => /api.github.com/.test(x))));
  check(relevant.length === 0, "no console errors, page errors or failed requests" + (relevant.length ? ":\n    " + relevant.slice(0, 10).join("\n    ") : ""));
  await browser.close();
  server.close();
}
console.log(failures ? failures + " check(s) failed" : "smoke test passed");
process.exit(failures ? 1 : 0);
