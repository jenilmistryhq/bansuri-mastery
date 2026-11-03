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
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wasm": "application/wasm", ".task": "application/octet-stream" };

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
// Exported files (CSV, backups, WAV) are checked in memory; the browser saves nothing to Downloads.
await (await browser.target().createCDPSession()).send("Browser.setDownloadBehavior", { behavior: "deny" });
// The get-ready countdown (Settings, 5 s by default) is off in tests, except where a check turns it on.
const newPage = browser.newPage.bind(browser);
browser.newPage = async () => { const p = await newPage(); await p.evaluateOnNewDocument(() => { if (window.__countdownSeconds === undefined) window.__countdownSeconds = 0; }); return p; };
const page = await browser.newPage();
// I18N_COLLECT=<file>: list every interface string the walk sees (for app/i18n/hi.json).
const i18nSeen = new Set();
const collectI18n = async pg => {
  if (!process.env.I18N_COLLECT) return;
  await pg.exposeFunction("__i18nSave", v => { i18nSeen.add(v); });
  await pg.evaluateOnNewDocument(() => { window.__i18nCollect = true; });
};
await collectI18n(page);
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
// SMOKE_TIMING=1: print how long each section (and each walked lesson) takes, and the time in fixed sleeps.
const timing = !!process.env.SMOKE_TIMING;
let slept = 0, navMs = 0, navs = 0;
const sleep = ms => { slept += ms; return new Promise(r => setTimeout(r, ms)); };
if (timing) for (const m of ["goto", "reload"]) { const proto = Object.getPrototypeOf(page), orig = proto[m]; proto[m] = async function (...a) { const t = Date.now(); try { return await orig.apply(this, a); } finally { navMs += Date.now() - t; navs++; } }; }
process.on("exit", () => { if (timing) console.log("TIME total: fixed sleeps " + (slept / 1000).toFixed(0) + " s; " + navs + " navigations (goto/reload) took " + (navMs / 1000).toFixed(0) + " s"); });
const clickTextOn = async (pg, selector, label) => {
  const ok = await pg.evaluate((sel, lab) => { const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim().startsWith(lab)); if (el) el.click(); return !!el; }, selector, label);
  if (!ok) throw new Error("No " + selector + " starting with \"" + label + "\"");
};

const shot = async name => { if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, name + ".png"), fullPage: false }); } };
const progress = () => page.evaluate(() => JSON.parse(localStorage.getItem("bansuri.progress") || "null"));

try {
  // Each section runs on its own: a failure is reported and the next section still runs.
  // SECTION=<regex> runs only the sections whose name matches it (for working on one part).
  async function section(name, fn) {
    if (process.env.SECTION && !new RegExp(process.env.SECTION).test(name)) return;
    console.log(name);
    const t0 = Date.now(), s0 = slept;
    try { await fn(); } catch (e) { failures++; console.log("  FAIL " + name + ": " + (e && e.message ? e.message.split("\n")[0] : e)); }
    if (timing) console.log("  TIME " + ((Date.now() - t0) / 1000).toFixed(1) + " s (fixed sleeps " + ((slept - s0) / 1000).toFixed(1) + " s): " + name);
  }
  // Shared between sections.
  let link, plays, t, walkSteps, yes;
  await section("Today (first run)", async () => {
    await page.goto(BASE, { waitUntil: "networkidle0" });
    await page.evaluate(() => localStorage.clear());
    await go("/today");
    // First run asks one thing per screen (language, how you like to learn, already play?), then Day 0.
    await clickText("#main .firstchoice button", "English"); await sleep(150);
    await clickText("#main .howtile", "I like to read"); await sleep(150);
    await clickText("#main .firstchoice button", "No, I am new"); await sleep(150);
    t = await text();
    check(t.includes("learn the bansuri, one day at a time") && await page.$("#main .firstrun .btn.primary.big") !== null, "first run: a short welcome with one big Start Day 0 button");
    check(t.includes("start day 0"), "Day 0 call to action");
    check(t.includes("hear a real bansuri"), "real bansuri samples offered in Phase 1");
    check(await page.evaluate(async () => (await fetch("app/audio/bansuri-small-e-sample.ogg")).ok), "bundled bansuri sample is served");
    await shot("01-today");

  });
  await section("Routes render", async () => {
    for (const [route, needle] of [["/plan", "All phases"], ["/library", "The whole course"], ["/read/lessons/L04-first-sound.md", "First Sound"], ["/bench", "Practice Bench"], ["/journal", "Practice journal"], ["/progress", "Your progress"], ["/me/flute", "Your flute"], ["/me/settings", "Language and voice"], ["/skills", "Get better at one thing"], ["/skills/tone", "Tone and breath"], ["/skills/ornaments", "Meend bridge"], ["/skills/games", "Notes and tuning"], ["/skills/fix", "Tone check"], ["/course/milestones", "First Stable Tone"], ["/course/book", "The whole course"], ["/music", "Songs"], ["/music/ragas", "Bhupali"], ["/music/mine", "Your tunes"], ["/me", "Your progress"], ["/me/teacher", "What to review"], ["/bench/tones", "Long tones"], ["/milestone/M1", "First Stable Tone"], ["/day/14", "Milestone"], ["/day/300", "Opens after Day 299"]]) {
      await go(route);
      t = await text();
      check(t.includes(needle.toLowerCase()), route + " shows \"" + needle + "\"");
      await shot("route" + route.replace(/[\/.]/g, "_"));
    }

  });
  await section("Reader", async () => {
    await go("/read/lessons/L04-first-sound.md");
    check(await page.$$eval("#main .reader table", x => x.length) > 0, "tables render");
    check(await page.$$eval("#main .reader details", x => x.length) > 0, "answer key <details> renders");
    check(await page.$eval("#main .reader", el => !el.innerHTML.includes("<script")), "no script tags in rendered content");
    const internal = await page.$$eval("#main .reader a", as => as.map(a => a.getAttribute("href")).filter(h => h && h.startsWith("#/read/")).length);
    check(internal > 0, "internal links rewritten to app routes (" + internal + ")");
    await go("/read/05-CONVENTIONS-AND-NOTATION-KEY.md#31-master-fingering-chart-for-a-6-hole-bansuri-sa--c");
    check(await page.evaluate(() => !!document.getElementById("31-master-fingering-chart-for-a-6-hole-bansuri-sa--c")), "heading anchor ids match GitHub slugs");

  });
  await section("Lesson cards", async () => {
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
    plays = await page.$$eval("#main .playnote", x => x.length);
    check(plays > 5, "notation in lessons has play buttons (" + plays + " in L20)");
    await page.evaluate(() => [...document.querySelectorAll("#main .playnote")].find(b => b.offsetParent).click());
    check(await page.$eval("#main .playnote[aria-pressed='true']", () => true).catch(() => false), "a play button plays its notation");

  });
  await section("Lessons: practise now, glossary", async () => {
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

  });
  await section("Pace and Devanagari", async () => {
    await go("/me/settings/practice");
    await page.select("#st-pace", "short");
    await go("/session/0");
    check(/^9:00$/.test(await page.$eval("#main .block[data-id=READ] .timer", e => e.textContent.trim())), "a short daily time scales a 15-minute block to 9 minutes");
    await go("/me/settings/practice");
    await page.select("#st-pace", "standard");
    await go("/me/settings/display");
    await page.click("#st-deva");
    await go("/bench");
    await page.evaluate(() => document.querySelector('.bb-tabs button[data-tab="play"]').click());
    check(await page.$(".bb-bench .bb-score .bb-deva") !== null, "the score shows sargam in Devanagari when chosen");
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("bansuri.settings")); s.deva = false; localStorage.setItem("bansuri.settings", JSON.stringify(s)); });

  });
  await section("Songs and ragas", async () => {
    await go("/songs");
    // One list with All / Ready now / Mine (redesign U2); a song opens on its own screen (U3).
    await clickText("#main .songfilter button", "All");
    const nSongs = await page.$$eval("#main .songrow", x => x.length);
    check(nSongs >= 15, "the song library lists the melodies (" + nSongs + ")");
    await page.click("#main .songrow");
    await page.waitForSelector("#main .songpage", { timeout: 5000 }).catch(() => {});
    await clickText("#main .songpage button", "Play along");
    check(await page.$("#main .songpage .bb-bench [data-ref=checkMe]:checked") !== null, "a song opens in play-along with the mic check on");
    await go("/read/ragas/malkauns.md");
    check(/ma \(this raga leaves out pa\)/.test(await text()), "Malkauns: the drone uses Ma, since the raga leaves out Pa");
    await clickText("#main button", "Play back phrases in this raga");
    check(await page.$eval("#main .lv-echo select", el => el.selectedOptions[0].textContent).then(t => /Malkauns/i.test(t)), "raga play back uses the raga's own notes");

  });
  await section("Bench", async () => {
    await go("/bench");
    check(await page.$(".bb-bench") !== null, "bench mounted");
    check(await page.$$eval(".bb-bench tbody tr", x => x.length) >= 24, "fingering chart has 24 rows");

  });
  await section("Robustness", async () => {
    await page.evaluate(() => localStorage.setItem("bansuri.progress", JSON.stringify({ current: 14, log: [null, { date: 5 }], days: { "3": null }, milestones: { M1: { status: "failed" } }, reviews: { x: null }, badges: [] })));
    await page.reload({ waitUntil: "networkidle0" });
    await go("/today");
    t = await text();
    check(t.includes("milestone"), "damaged saved progress still renders Today (Day 14)");
    for (const r of ["/progress", "/journal", "/plan", "/milestone/M1"]) { await go(r); check((await text()).length > 50, r + " renders with damaged progress"); }
    await page.goto(BASE + "#/read/100%E0", { waitUntil: "networkidle0" });
    await new Promise(r => setTimeout(r, 400));
    check((await page.$eval("#main", el => el.innerText)).length > 0, "malformed percent-encoding in the address does not blank the app");
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle0" });

  });
  await section("Milestone checklists", async () => {
    for (let i = 0; i <= 10; i++) {
      await go("/milestone/M" + i);
      const total = await page.$$eval("#main .mitem", x => x.length);
      const required = await page.$$eval("#main .mitem .chip.info", x => x.length);
      check(total >= 3 && required >= 1, "M" + i + " checklist: " + total + " items, " + required + " required");
    }

  });
  await section("Day 0 + M0", async () => {
    await go("/session/0");
    // Sessions run one step at a time: "Done, next step" until the last step opens the finish dialog.
    walkSteps = async () => {
      const n = await page.$$eval("#main .stepdot", x => x.length);
      for (let i = 0; i < n; i++) { await page.click("#main .block.active .stepnav .btn.primary"); await sleep(120); }
      return n;
    };
    const steps0 = await walkSteps();
    check(steps0 > 0 && await page.$$eval("#main .block .stepnav", b => b.filter(x => getComputedStyle(x).display !== "none").length) === 1, "Day 0 opens one of its " + steps0 + " steps at a time (the others are rows to tap)");
    await page.waitForSelector("dialog.modal[open]");
    yes = await page.$("#fin-yes");
    if (yes) await yes.click();
    await page.click("dialog.modal button[type=submit]");
    await new Promise(r => setTimeout(r, 600));
    check((await progress()).current === 0, "Day 0 does not advance before M0 is passed");
    await go("/milestone/M0");
    await clickText("#main button", "Take the test");
    const req = await page.$$("#main .mitem input[type=checkbox]");
    for (const b of req) await b.click();
    check(req.length >= 6, "M0 checklist parsed (" + req.length + " items)");
    await page.click("#main button.btn.primary.big");
    await new Promise(r => setTimeout(r, 500));
    check((await progress()).current === 1, "passing M0 unlocks Day 1");
    await shot("02-m0-passed");

  });
  await section("Day 1", async () => {
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
    await page.evaluate(() => document.querySelector('#main .block[data-id="K"] > header').click());
    await sleep(200);
    check(await page.$("#main .block.active .lv-hold") !== null, "the first-sound step shows the live long-tone meter");
    await page.click("#main .session-head .btn.ghost");
    await sleep(100);
    check(await page.$$eval("#main .block", b => b.filter(x => getComputedStyle(x).display !== "none").length) > 1, "Show all steps lists every block");
    await page.click("#main .session-head .btn.ghost");
    await shot("03-today-day2");

  });
  await section("Share", async () => {
    await go("/me/teacher/share");
    await page.type("#sh-name", "Tester");
    const btns = await page.$$("#main button.btn.primary");
    await btns[btns.length - 1].click();
    link = await page.$eval("#main input[readonly]", el => el.value);
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

  });
  await section("Recording and pitch (fake microphone)", async () => {
    await go("/me/journal/record");
    await clickText("#main .card button", "Record");
    await page.waitForFunction(() => /Recording\./.test(document.querySelector("#main").innerText), { timeout: 8000 });
    await sleep(2500);
    await clickText("#main .card button", "Stop");
    await page.waitForFunction(() => /Saved to your journal/.test(document.querySelector("#main").innerText), { timeout: 8000 });
    check(true, "recording saved to the journal");
    await go("/me/journal/recordings");
    await page.waitForSelector("#main .rec");
    await clickText("#main .rec button", "Analyse pitch");
    await page.waitForFunction(() => /steady notes|No steady notes/.test(document.querySelector("#main .rec").innerText), { timeout: 20000 });
    check(true, "recording analysed (" + (await page.$eval("#main .rec", el => (el.innerText.match(/\d+ steady notes/) || ["no steady notes"])[0])) + ")");
    check((await progress()).recordings === 1, "recording counted once");
    await go("/bench");
    await page.evaluate(() => document.querySelector('.bb-bench .bb-tabs button[data-tab="check"]').click());
    // The live tuner is part of Long tones now: the Check my flute tab points there.
    check(await page.$(".bb-bench [data-ref=micBtn]") === null && /Check my flute/.test(await page.$eval('.bb-bench .bb-tabs button[data-tab="check"]', e => e.textContent)), "bench: no separate live tuner; the tab is Check my flute");
    await page.evaluate(() => document.querySelector(".bb-bench [data-ref=toTones]").click());
    check(await page.$eval('.bb-bench [data-panel="tones"]', e => !e.hidden), "bench: Open Long tones switches to the Long tones tab");

  });
  await section("Check my flute with a real bansuri recording", async () => {
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

  });
  await section("Ear quiz", async () => {
    await go("/bench");
    await page.evaluate(() => [...document.querySelectorAll(".bb-tabs button")].find(b => b.dataset.tab === "ear").click());
    await page.click(".bb-bench [data-ref=earReset]");
    await page.click(".bb-bench [data-ref=earNext]");
    check((await page.$$eval(".bb-bench [data-ref=earOpts] button", b => b.length)) === 2, "Level 2 offers Sa and Pa");
    await page.click(".bb-bench [data-ref=earOpts] button");
    check(/Correct|It was/.test(await page.$eval(".bb-bench [data-ref=earMsg]", e => e.textContent)) && /Score: \d \/ 1/.test(await page.$eval(".bb-bench [data-ref=earScore]", e => e.textContent)), "answering scores the question");

  });
  await section("Coach (offline)", async () => {
    await go("/coach");
    // A symptom opens its fix on its own screen (redesign W50).
    await clickText("#main .symcard", "Low notes");
    await page.waitForFunction(() => /Try this first/i.test(document.querySelector("#main").innerText) && /^#\/skills\/fix\/TS-03$/.test(location.hash), { timeout: 8000 });
    check(true, "coach: a symptom opens its fix on its own screen (#/skills/fix/TS-03)");
    check(await page.$$eval("#main .checkli input", x => x.length) > 0, "the quick checks are a checklist");
    await page.click("#main .fixtry");
    check(await page.$("#main .drillcard .lv-hold") !== null, "the coach opens a live drill (hold low Pa)");
    await clickText("#main button", "Yes, it helped");
    await go("/coach");
    check(/What you worked on/.test(await page.$eval("#main", e => e.innerText)), "the coach remembers what helped");

  });
  await section("Posture and tone levels", async () => {
    await go("/me/journal/record");
    check(await page.$$eval("#main .chipbtn", b => b.filter(x => /^[1-4]: /.test(x.textContent)).length) === 4, "the four tone levels can be heard in the Journal");
    // With video: the live posture check watches the camera preview while it records (W72).
    await clickText("#main .recswitch button", "With video");
    await sleep(300);
    await clickText("#main .card button", "Record video");
    await page.waitForFunction(() => /No one in view|Shoulders|Head|could not start/.test((document.querySelector("#main .recstage .recposture") || {}).innerText || ""), { timeout: 60000 })
      .then(async () => check(!/could not start/.test(await page.$eval("#main .recposture", e => e.innerText)) && await page.$eval("#main .recstage video.selfview", v => !v.hidden), "the posture check loads pose detection and watches the camera preview while a video records"), () => check(false, "the posture check loads pose detection and watches the camera preview while a video records"));
    await clickText("#main .card button", "Stop");
    await page.waitForFunction(() => /Saved to your journal/.test(document.querySelector("#main").innerText), { timeout: 8000 }).catch(() => {});
    check(await page.$eval("#main .recposture", e => e.hidden), "the posture check stops when the recording stops");

  });
  await section("Journal and progress", async () => {
    await go("/journal");
    await clickText("#main .chipbtn", "45 min");
    await clickText("#main .chipbtn", "Went well");
    await page.type("#j-note", "Long tones");
    await clickText("#main button", "Log it");
    await sleep(300);
    check(await page.evaluate(() => { const e = JSON.parse(localStorage.getItem("bansuri.progress")).log.pop(); return e.minutes === 45 && e.feel === "great" && e.note === "Long tones"; }), "one-tap log saves minutes, how it went and the note");
    check(/Went well/.test(await page.$eval("#main .timeline", e => e.innerText)), "the day-by-day timeline shows the entry");
    await go("/progress");
    const minutesChart = await page.$$eval("#main .wkchart", c => c.map(x => x.querySelectorAll(".wk-bar").length).join() + ":" + c.reduce((a, x) => a + x.querySelectorAll("path").length, 0));
    await go("/me/level");
    check(/^12:/.test(minutesChart) && !/:0$/.test(minutesChart) && await page.$$eval("#main .wkchart", c => c.map(x => x.querySelectorAll(".wk-bar").length).join()) === "12", "progress charts 12 weeks of practice minutes, and Level and badges 12 weeks of XP [" + minutesChart + "]");
    // More charts (W69): a row on Progress opens the other charts, one per card.
    await go("/progress");
    const moreRow = await page.$("#main a.hubrow[href='#/me/charts']") !== null;
    await go("/me/charts");
    const charts = await page.evaluate(() => ({ heads: [...document.querySelectorAll("#main .card h3")].map(x => x.textContent), bars: [...document.querySelectorAll("#main .wkchart")].map(x => x.querySelectorAll(".wk-bar").length).join(), back: !!document.querySelector("#main .crumbs a[href='#/me']") }));
    check(moreRow && charts.heads.join() === "Minutes per week,By ear,Play back,Play-along: notes right,Tap the beat,XP per week" && charts.bars === "12,12" && charts.back, "progress: More charts opens minutes, by ear, play back, play along, tap the beat and XP, one per card " + JSON.stringify(charts));
    await go("/progress");
    check(await page.$$eval("#main .mspath li", x => x.length) === 11, "progress shows the M0-M10 milestone path");

  });
  await section("Tala with tabla theka", async () => {
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

  });
  await section("Notation player stops", async () => {
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

  });
  await section("Settings: CSV and problem report", async () => {
    await go("/me/settings/data");
    const csv = await page.evaluate(() => new Promise(resolve => {
      const orig = URL.createObjectURL;
      URL.createObjectURL = b => { URL.createObjectURL = orig; b.arrayBuffer().then(buf => { const u = new Uint8Array(buf); resolve((u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf ? "BOM" : "") + new TextDecoder().decode(u)); }); return orig.call(URL, b); };
      [...document.querySelectorAll("#main button")].find(x => /CSV/.test(x.textContent)).click();
    }));
    check(/^BOMdate,day,minutes/.test(csv), "CSV starts with a UTF-8 BOM and the log header");
    check(/Smoke test note/.test(csv) && /milestone,title,status,attempts/.test(csv) && /M0,/.test(csv), "CSV has the log note and milestone rows");
    await go("/me/settings/help");
    await clickText("#main button", "Copy problem report");
    await page.waitForFunction(() => { const t = document.querySelector("#main textarea[aria-label='Problem report']"); return t && !t.hidden && t.value.length > 20; }, { timeout: 4000 })
      .then(() => check(true, "problem report is generated"), () => check(false, "problem report is generated"));
    check(/user agent|userAgent|browser/i.test(await page.$eval("#main textarea[aria-label='Problem report']", el => el.value)), "problem report names the browser");

  });
  await section("Live exercises (synthetic microphone)", async () => {
    {
      // A page whose microphone is an oscillator the test tunes to any note.
      const lp = await browser.newPage();
      await collectI18n(lp);
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
      await sleep(300);
      check(await lp.$eval(".lv-hold .lv-glowtxt", e => e.style.visibility === "hidden" && e.textContent !== ""), "long tones: the tone label keeps its place, hidden, until a note sounds (no jumping)");
      await tone(2);
      await sleep(5000);
      check(await lp.$(".lv-hold.lv-passed") === null && /target is S/.test(await lp.$eval(".lv-hold .lv-msg", e => e.textContent)), "long tones: holding the wrong note (R) does not pass, and says so");
      await tone(0.08);
      await lp.waitForSelector(".lv-hold.lv-passed", { timeout: 9000 }).then(() => check(true, "long tones: holding Sa for 4 s fills the ring"), () => check(false, "long tones: holding Sa for 4 s fills the ring"));
      check(await lp.$eval(".lv-hold .lv-glowtxt", e => e.style.visibility === "visible" && /Tone: (clear|fairly clear|airy)/.test(e.textContent)), "long tones: the ring glows with the tone quality heard");
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
      await clickTextOn(lp, "#main button", "Take the test");
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
      await lp.goto(BASE + "#/me/settings/practice", { waitUntil: "networkidle0" });
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
      await clickTextOn(lp, "#main button", "Take the test");
      await lp.evaluate(() => [...document.querySelectorAll("#main .mrow button")].find(b => /Check with mic/.test(b.textContent)).click());
      check(await lp.$("#main .micpanel .lv-quiz") !== null, "milestone M4: identifying notes opens a note-naming test");

      // Tone check, a section of the Coach: a held Sa 35 cents flat is diagnosed as flat, and
      // Show the fix opens the matching fix on its own screen (W50); back on the Tone check, the last
      // result shows as three chips (W47).
      await lp.goto(BASE + "#/tone", { waitUntil: "networkidle0" });
      await lp.waitForSelector("#main #symptoms", { timeout: 8000 }).catch(() => {});
      check(await lp.evaluate(() => /What is going wrong/.test((document.querySelector("#main h1") || {}).textContent || "") && !!document.querySelector("#main #tone") && !!document.querySelector("#main #symptoms")), "#/tone opens the Coach, with the Tone check and the symptoms on one page");
      await lp.waitForFunction(() => [...document.querySelectorAll("#main button")].some(b => /Hold a note now/.test(b.textContent)), { timeout: 5000 });
      await clickTextOn(lp, "#main button", "Hold a note now");
      await sleep(300); await tone(-0.35);
      await lp.waitForFunction(() => /cents flat/.test(document.querySelector("#main .tone-found") ? document.querySelector("#main .tone-found").innerText : ""), { timeout: 20000 })
        .then(() => check(true, "tone check hears that a held Sa is flat (the coach's diagnosis)"), async () => check(false, "tone check: " + (await lp.$eval("#main", e => e.innerText)).slice(0, 400)));
      await tone(null);
      check(await lp.evaluate(() => { const c = [...document.querySelectorAll("#main .tonelast .tonechip")]; return c.length === 3 && c.find(x => x.dataset.k === "tune").classList.contains("warn"); }), "tone check: the result shows as three chips, In tune marked to work on");
      const fix = await lp.evaluateHandle(() => [...document.querySelectorAll("#main .tone-found .notice")].find(n => /cents flat/.test(n.textContent))?.querySelector("a, button") || null);
      check(await fix.evaluate(b => !!b), "tone check: the flat finding has a Show the fix link");
      if (await fix.evaluate(b => !!b)) {
        await fix.evaluate(b => b.click());
        await lp.waitForSelector("#main .fixpage[data-ts=TS-05]", { timeout: 8000 })
          .then(() => check(true, "Show the fix opens that fix on its own screen"), () => check(false, "Show the fix opens that fix on its own screen"));
        await lp.goBack(); await lp.waitForSelector("#main .tonelast .tonechip", { timeout: 8000 }).catch(() => {});
        check(await lp.$$eval("#main .tonelast .tonechip", x => x.length) === 3, "tone check: back from the fix, the last result is there");
      }
      await lp.goto(BASE + "#/coach/TS-05", { waitUntil: "networkidle0" });
      await lp.waitForSelector("#main .fixpage[data-ts=TS-05]", { timeout: 8000 }).then(() => check(true, "#/coach/TS-05 opens that fix"), () => check(false, "#/coach/TS-05 opens that fix"));

      // A session step with a listening goal ticks itself when the goal is met.
      await lp.evaluate(() => localStorage.setItem("bansuri.progress", JSON.stringify({ current: 2, startedAt: "2026-10-01" })));
      await lp.goto(BASE + "#/session/2", { waitUntil: "networkidle0" });
      await lp.reload({ waitUntil: "networkidle0" });
      await lp.waitForSelector('#main .block[data-id="K"] > header');
      await lp.evaluate(() => document.querySelector('#main .block[data-id="K"] > header').click());
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
      await lp.goto(BASE + "#/me/flute", { waitUntil: "networkidle0" });
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

      // Play: games that listen. Earlier rounds above recorded a best hold, which the ring shows as a ghost.
      // (The flute finder above set Sa to E5; back to C5 so the test tones mean what they say.)
      await lp.evaluate(() => localStorage.removeItem("bansuri.settings"));
      await lp.goto(BASE + "#/bench", { waitUntil: "networkidle0" });
      await lp.reload({ waitUntil: "networkidle0" });
      await lp.waitForSelector(".bb-bench [data-ref=toneNote]");
      await tab("tones");
      await lp.select(".bb-bench [data-ref=toneNote]", "0");
      await lp.select(".bb-bench [data-ref=toneSecs]", "4");
      await lp.click(".lv-hold .lv-primary");
      await sleep(300); await tone(0);
      await lp.waitForSelector(".lv-hold.lv-passed", { timeout: 9000 }).catch(() => {});
      await tone(null);
      await lp.click(".lv-hold .lv-primary");
      await lp.select(".bb-bench [data-ref=toneSecs]", "8");
      check(/Your best on this note/.test(await lp.$eval(".lv-hold", e => e.innerText)), "long tones: the ring shows your best hold as a ghost to beat");

      await lp.goto(BASE + "#/play", { waitUntil: "networkidle0" });
      await lp.waitForSelector("#main .gamecard");
      // The quest card moved to Skills > For you (redesign S5): the games list has no hero, quest card or quest line.
      check(!(await lp.$("#main .playnow")) && !(await lp.$("#main .questline")) && !!(await lp.$("#main .gamefilter")), "games: the list starts with its filter, the quest card lives on Skills > For you");
      const startGame = async label => {
        // The suggested game is in the "play now" card; the others are in the grid.
        const inGrid = await lp.evaluate(l => [...document.querySelectorAll("#main .gamecard")].some(e => e.textContent.trim().startsWith(l)), label);
        if (inGrid) await clickTextOn(lp, "#main .gamecard", label); else await lp.evaluate(() => document.querySelector("#main .playnow .btn.primary").click());
        // The game shell's How to play: Play presses the game's own Start (W52).
        await lp.waitForSelector("#main .game-card .gs-play");
        await lp.click("#main .game-card .gs-play");
        await sleep(150);
        if (await lp.$("#main .game-card .lv-intro")) await lp.click("#main .game-card .lv-intro .lv-primary");
        await sleep(300);
      };
      await startGame("Balloon");
      await tone(0); await sleep(6000); await tone(null);
      await lp.click("#main .game-card .game .btn.primary");
      await lp.waitForFunction(() => /balloons? popped/.test(document.querySelector("#main .game-card .game").innerText), { timeout: 3000 }).catch(() => {});
      const popped = await lp.$eval("#main .game-card .game", e => e.innerText);
      check(/[1-9]\d* balloons? popped/.test(popped), "balloon: holding the note in tune pops a balloon (" + (/(\d+) balloons? popped/.exec(popped) || ["none"])[0] + ")");
      const link = await lp.$eval("#main .challenge-share input", e => e.value).catch(() => "");
      check(/#\/challenge\//.test(link), "balloon: a finished round offers a challenge link");
      check(await lp.evaluate(() => { const p = JSON.parse(localStorage.getItem("bansuri.progress") || "{}"); return !!(p.live && p.live.quests && p.live.quests.list.length === 3); }), "quests are tracked once a game result comes in");

      await startGame("Steer by pitch");
      await tone(0); await sleep(1500); await tone(null);
      await lp.click("#main .game-card .game .btn.primary");
      await sleep(300);
      check(/Score \d+\./.test(await lp.$eval("#main .game-card .game", e => e.innerText)), "steer by pitch: a round starts, listens and ends with a score");

      await startGame("Jam with the band");
      await tone(0); await sleep(700); await tone(null); await sleep(300);
      await tone(1); await sleep(700); await tone(null); await sleep(300);
      check(await lp.$("#main .jam-key.out") !== null && /is not in/.test(await lp.$eval("#main .game-card .game", e => e.innerText)), "jam: a note outside the raga is pointed out, with the nearby raga notes");
      await clickTextOn(lp, "#main .game-card .game button", "Stop");
      check(/% inside/.test(await lp.$eval("#main .game-card .game", e => e.innerText)), "jam: stopping sums up how much stayed inside the raga");
      check(await lp.evaluate(async () => !(await import(new URL("app/js/core/audio.js", location.href).href)).tanpura.isOn()), "jam: stopping turns the tanpura off");

      // Falling notes judges what is played: one held note, right then wrong.
      const falling = async semi => {
        await lp.evaluate(async () => {
          const m = await import(new URL("app/js/games.js", location.href).href);
          if (window.__fn) window.__fn.destroy();
          window.__fn = m.fallingNotes({ songs: [{ title: "Test", notation: "S - - -", bpm: 120 }] });
          document.querySelector("#main").prepend(window.__fn.el);
          window.__fn.el.querySelector(".btn.primary").click();
        });
        await sleep(150); await tone(semi);
        await lp.waitForFunction(() => /missed\. Score/.test(window.__fn.el.innerText), { timeout: 8000 }).catch(() => {});
        await tone(null);
        return lp.evaluate(() => window.__fn.el.querySelector("p[aria-live]").textContent);
      };
      const right = await falling(0), wrong = await falling(2);
      check(/0 missed/.test(right) && /\*\*/.test(right), "falling notes: the right note on time scores (" + right.split(".")[0] + ")");
      check(/1 missed/.test(wrong), "falling notes: a wrong note is a miss");
      await lp.evaluate(() => { window.__fn.destroy(); window.__fn.el.remove(); });

      // A challenge link replays the course for a friend.
      if (link) {
        await lp.goto(link, { waitUntil: "networkidle0" });
        await lp.waitForSelector("#main .challenge");
        // W55: who scored what, then Take it on opens the game's How to play.
        const said = await lp.$eval("#main .challenge", e => e.innerText);
        await lp.click("#main .gs-take"); await lp.waitForSelector("#main .game-card:not([hidden]) .game .game-canvas", { timeout: 5000 }).catch(() => {});
        check(/scored \d+ in Balloon/.test(said) && await lp.$("#main .game-card:not([hidden]) .gs-play") !== null, "a challenge link says the score to beat, and Take it on opens the same game");
      }

      // Make a melody: tapping cells writes notation.
      await lp.goto(BASE + "#/compose", { waitUntil: "networkidle0" });
      await lp.waitForSelector("#main .ccell");
      await lp.evaluate(() => {
        const row = l => [...document.querySelectorAll("#main .crow")].find(r => r.querySelector(".clabel").textContent === l);
        row("S").querySelectorAll(".ccell")[0].click();
        row("hold").querySelectorAll(".ccell")[1].click();
        row("G").querySelectorAll(".ccell")[2].click();
      });
      check((await lp.$eval("#main .cout", e => e.textContent)).startsWith("S - G _ |"), "make a melody: tapped cells become notation (S - G _ |)");

      // 5-minute practice: three steps, then it is logged.
      await lp.goto(BASE + "#/quick", { waitUntil: "networkidle0" });
      await lp.waitForSelector("#main .lv-hold");
      for (let i = 0; i < 3; i++) { await clickTextOn(lp, "#main button", i < 2 ? "Next step" : "Finish"); await sleep(200); }
      check(await lp.evaluate(() => (JSON.parse(localStorage.getItem("bansuri.progress") || "{}").log || []).some(e => e.note === "5-minute practice" && e.minutes >= 5)), "5-minute practice: finishing logs at least 5 minutes");
      check(await lp.evaluate(() => window.__openMics()) === 0, "the games leave no microphone open");

      console.log("Levels and XP");
      await lp.evaluate(() => localStorage.setItem("bansuri.progress", JSON.stringify({ current: 3, startedAt: "2026-10-01", prefs: { howChosen: true }, xp: { total: 450, day: null, caps: {}, once: {}, recent: [], days: {}, seen: 1 } })));
      await lp.goto(BASE + "#/today", { waitUntil: "networkidle0" });
      await lp.reload({ waitUntil: "networkidle0" });
      await lp.waitForSelector("#main .progresscard");
      check(await lp.$(".levelpill") === null && !/Level \d/.test(await lp.$eval("#main .progresscard", e => e.innerText)), "levels: quiet: no level in the top bar or on Today (redesign decision 6)");
      await lp.goto(BASE + "#/me", { waitUntil: "networkidle0" });
      await lp.waitForFunction(() => /Level 1/.test(document.querySelector("#main").innerText), { timeout: 3000 }).then(() => check(true, "levels: Level 1 [Newcomer] shows in Me"), () => check(false, "levels: Level 1 [Newcomer] shows in Me"));
      await lp.evaluate(async () => { const x = await import(new URL("app/js/xp.js", location.href).href); x.award("lesson", { key: "smoke" }); x.award("lesson", { key: "smoke2" }); });
      await lp.waitForFunction(() => [...document.querySelectorAll(".toasts *")].some(t => /Level 2/.test(t.textContent)) && document.querySelector(".xpfloat") === null, { timeout: 3000 })
        .then(() => check(true, "levels: earning XP moves the learner up to Level 2, celebrated, with no floating points"), () => check(false, "levels: earning XP moves the learner up to Level 2, celebrated, with no floating points"));
      await lp.goto(BASE + "#/me/level", { waitUntil: "networkidle0" });
      await lp.waitForSelector("#level .levelrow");
      check(await lp.$$eval("#level .levelrow", x => x.length) === 30 && /Listener/.test(await lp.$eval("#level .levelrow.now", e => e.textContent)), "levels: Progress lists the 30 named levels, the current one marked");

      console.log("Get-ready countdown");
      await lp.goto(BASE + "#/bench", { waitUntil: "networkidle0" });
      await lp.reload({ waitUntil: "networkidle0" });
      await lp.waitForSelector(".bb-bench [data-ref=toneNote]");
      await tab("tones");
      await lp.waitForSelector(".lv-hold .lv-primary");
      await lp.evaluate(() => { window.__countdownSeconds = 2; });
      await lp.evaluate(() => document.querySelector(".lv-hold .lv-primary").click());
      await sleep(300);
      check(await lp.$eval(".lv-hold .lv-countdown .lv-cdnum", e => e.textContent).catch(() => "") === "2" && /Start/.test(await lp.$eval(".lv-hold .lv-primary", e => e.textContent)), "countdown: Start counts down before listening");
      await sleep(2300);
      check(await lp.$(".lv-hold .lv-countdown") === null && /Stop/.test(await lp.$eval(".lv-hold .lv-primary", e => e.textContent)), "countdown: listening starts when it reaches zero");
      const press = async what => { const ok = await lp.evaluate(() => { const b = document.querySelector(".lv-hold .lv-primary"); if (b) b.click(); return !!b; }); if (!ok) console.log("    (debug) no meter button at " + what + ": " + (await lp.evaluate(() => (document.querySelector('.bb-bench [data-ref=toneHost]') || {}).innerHTML || "no host")).slice(0, 300)); };
      await press("stop");
      await press("start again"); // counting
      await sleep(300);
      await press("cancel"); // pressing Start again cancels
      await sleep(2500);
      check(await lp.$(".lv-hold .lv-countdown") === null && /Start|Again/.test(await lp.$eval(".lv-hold .lv-primary", e => e.textContent)) && await lp.evaluate(() => window.__openMics()) === 0, "countdown: pressing Start again cancels it, and the microphone stays closed");
      await lp.evaluate(() => { window.__countdownSeconds = 0; });

      console.log("Voice, pictures, Simple mode and Hindi");
      const setSet = patch => lp.evaluate(p => { const s = JSON.parse(localStorage.getItem("bansuri.settings") || "{}"); localStorage.setItem("bansuri.settings", JSON.stringify(Object.assign(s, p))); }, patch);
      const voiceMod = () => lp.evaluate(async () => { window.__voice = await import(new URL("app/js/voice.js", location.href).href); });
      // The natural voice: a clip plays and its words show as a caption.
      await lp.goto(BASE + "#/bench", { waitUntil: "networkidle0" });
      await voiceMod();
      check(await lp.evaluate(() => window.__voice.speak("good")) === true && /Good/.test(await lp.$eval(".caption", e => e.textContent)), "voice: a natural-voice clip plays, with a caption");
      check(await lp.evaluate(async () => { const r = await fetch("app/voice/hi/index.json"); if (!r.ok) return false; const j = await r.json(); return Object.keys(j.phrases).length > 50 && Object.keys(j.notes).length > 100; }), "voice: Hindi clips are listed for phrases and every note");

      // Talk to me: a wrong note held, then silence, is named out loud.
      await setSet({ talk: true, hints: false });
      await lp.reload({ waitUntil: "networkidle0" });
      await lp.waitForSelector(".bb-bench [data-ref=toneNote]");
      await tab("tones");
      await lp.select(".bb-bench [data-ref=toneNote]", "0");
      await lp.click(".lv-hold .lv-primary");
      await sleep(4500); await tone(2); await sleep(1500); await tone(null);
      await lp.waitForFunction(() => { const c = document.querySelector(".caption"); return c && !c.hidden && /That is Re/.test(c.textContent); }, { timeout: 6000 })
        .then(() => check(true, "talk to me: a wrong note is named (\"That is Re. Play Sa.\")"), async () => check(false, "talk to me: caption " + await lp.$eval(".caption", e => e.textContent).catch(() => "none")));
      await lp.click(".lv-hold .lv-primary");

      // Notes as pictures of the fingering.
      await setSet({ notesAs: "pictures", talk: false });
      await lp.reload({ waitUntil: "networkidle0" });
      await lp.waitForSelector(".bb-bench [data-ref=toneNote]");
      await tab("tones");
      await lp.select(".bb-bench [data-ref=toneNote]", "2");
      check(await lp.$(".lv-hold .lv-chip .fingpic, .lv-hold .lv-goal ~ * .fingpic") !== null || await lp.$(".lv-hold .fingpic") !== null, "pictures: notes show as fingering pictures");
      await setSet({ notesAs: "letters" });

      // Listen: songs on the animated flute.
      await lp.goto(BASE + "#/listen", { waitUntil: "networkidle0" });
      await lp.waitForFunction(() => document.querySelectorAll("#main .listentile").length > 12, { timeout: 8000 }).catch(() => {});
      check(await lp.$$eval("#main .listentile", x => x.length) > 12, "listen: recordings, tone levels and songs as big tiles");
      await lp.evaluate(() => [...document.querySelectorAll("#main .card")].find(c => /Watch the fingers/.test(c.innerText)).querySelector(".listentile").click());
      await lp.waitForFunction(() => document.querySelectorAll("#main .demo .df-finger.on").length > 0, { timeout: 5000 })
        .then(() => check(true, "listen: a song plays on the animated flute, fingers on the holes"), () => check(false, "listen: a song plays on the animated flute, fingers on the holes"));
      await lp.evaluate(() => [...document.querySelectorAll("#main button")].find(b => b.textContent === "Close").click());

      // Beats seen and felt.
      await setSet({ beatFlash: true });
      await lp.reload({ waitUntil: "networkidle0" });
      await lp.evaluate(async () => { const a = await import(new URL("app/js/core/audio.js", location.href).href); a.click(a.ac().currentTime + 0.05, "sam"); });
      await sleep(200);
      check(await lp.$(".beatflash") !== null, "beats: the screen edge flashes on a beat");
      await setSet({ beatFlash: false });

      // Simple mode: three big buttons, and a session that talks the learner through.
      await setSet({ simple: true });
      await lp.evaluate(() => localStorage.setItem("bansuri.progress", JSON.stringify({ current: 2, startedAt: "2026-10-01", prefs: { howChosen: true } })));
      await lp.goto(BASE + "#/today", { waitUntil: "networkidle0" });
      await lp.reload({ waitUntil: "networkidle0" });
      await lp.waitForSelector("#main .simpletile", { timeout: 5000 }).catch(() => {});
      check(await lp.$$eval("#main .simpletile", x => x.length) === 4 && await lp.$$eval(".tabbar a", x => x.length) === 3, "simple mode: four big buttons and three tabs");
      await lp.goto(BASE + "#/session/2", { waitUntil: "networkidle0" });
      await lp.waitForSelector('#main .block[data-id="K"] > header');
      await lp.evaluate(() => document.querySelector('#main .block[data-id="K"] > header').click());
      // The step is spoken, then the meter starts by itself; hold Sa to meet the goal, then Sa again to go on.
      await lp.waitForFunction(() => /Stop/.test((document.querySelector("#main .block.active .lv-hold .lv-primary") || {}).textContent || ""), { timeout: 25000 }).catch(() => {});
      await tone(0);
      await lp.waitForFunction(() => document.querySelector("#main .block.active label.check input[type=checkbox]").checked, { timeout: 15000 }).catch(() => {});
      await tone(null);
      await lp.waitForFunction(() => { const c = document.querySelector(".caption"); return c && /play Sa/i.test(c.textContent); }, { timeout: 12000 }).catch(() => {});
      await sleep(800); await tone(0);
      await lp.waitForFunction(() => { const d = document.querySelector("#main .block.active"); return d && d.dataset.id !== "K"; }, { timeout: 12000 })
        .then(() => check(true, "hands-free: the step is spoken, the meter starts itself, and playing Sa moves on"), async () => check(false, "hands-free: still on " + await lp.$eval("#main .block.active", e => e.dataset.id).catch(() => "?")));
      await tone(null);
      await lp.goto(BASE + "#/today", { waitUntil: "networkidle0" });
      await setSet({ simple: false });

      // Ornament trainer: a played meend from Re to Ga (a glide in small steps) is measured and passes.
      // A fresh page: the hands-free section's spoken prompts can still be muting the microphone.
      await lp.goto(BASE + "#/ornaments", { waitUntil: "networkidle0" });
      await lp.reload({ waitUntil: "networkidle0" });
      await lp.waitForSelector("#main .ornplot");
      // The played line starts only once the page is listening (the microphone can take a moment).
      await lp.evaluate(() => {
        const hz = s => 523.251 * Math.pow(2, s / 12); let t0 = null;
        const id = setInterval(() => {
          if (t0 === null) { if (!/Listening for/.test(document.querySelector("#main").textContent)) return; t0 = performance.now() + 300; }
          const x = (performance.now() - t0) / 1000;
          if (x < 0) return;
          window.__tone(x < 0.7 ? hz(2) : x < 1.6 ? hz(2 + 2 * (x - 0.7) / 0.9) : x < 3 ? hz(4) : 0);
          if (x > 3) clearInterval(id);
        }, 15);
        [...document.querySelectorAll("#main button")].find(b => /Try it/.test(b.textContent)).click();
      });
      await lp.waitForFunction(() => /Glide length|Too quick|Very slow|No clear note|Start on/.test(document.querySelector("#main").textContent), { timeout: 15000 }).catch(() => {});
      const ornText = await lp.$eval("#main", e => e.textContent);
      check(/Glide length/.test(ornText) && /No break in the sound/.test(ornText) && /Smooth: no step/.test(ornText), "ornaments: a played meend is measured: smooth, unbroken, the right length (" + (ornText.match(/(Glide length[^.]*|Too quick[^.]*|No clear note[^.]*|Start on[^.]*)/) || ["?"])[0] + ")");
      check(/Your best: \d of 4/.test(ornText), "ornaments: the best result is kept");
      await tone(null);

      // More games: each opens from Play and plays a short round (synthetic microphone, or taps).
      const openGame = async title => {
        await lp.goto(BASE + "#/play", { waitUntil: "networkidle0" });
        await lp.waitForFunction(t => [...document.querySelectorAll("#main button")].some(b => b.textContent.includes(t)), { timeout: 8000 }, title);
        await lp.evaluate(t => [...document.querySelectorAll("#main button")].find(b => b.textContent.includes(t)).click(), title);
        await lp.waitForSelector("#main .game-card:not([hidden]) .game", { timeout: 5000 });
      };
      const gameBtn = label => lp.evaluate(l => { const b = [...document.querySelectorAll("#main .game-card button")].find(x => x.textContent.trim() === l); if (b) b.click(); return !!b; }, label);
      const gameText = () => lp.$eval("#main .game-card", e => e.textContent);
      const waitText = (re, ms) => lp.waitForFunction(r => new RegExp(r).test(document.querySelector("#main .game-card").textContent), { timeout: ms || 8000 }, re.source).catch(() => {});
      // Back from a game returns to the list of games (not Today), and so does Close.
      await lp.goto(BASE + "#/today", { waitUntil: "networkidle0" });
      await openGame("Balloon");
      const inGame = await lp.evaluate(() => location.hash);
      await lp.goBack(); await lp.waitForSelector("#main .gamecard", { timeout: 5000 }).catch(() => {});
      check(/^#\/(play|skills\/game)\/balloon$/.test(inGame) && await lp.evaluate(() => /^#\/(play|skills\/games)$/.test(location.hash) && !!document.querySelector("#main .gamecard") && !document.querySelector("#main .game-card:not([hidden])")), "games: each game has its own address, and Back from a game returns to the game list (" + inGame + ")");
      await openGame("Bullseye"); await gameBtn("Close"); await lp.waitForSelector("#main .gamecard", { timeout: 5000 }).catch(() => {});
      check(await lp.evaluate(() => /^#\/(play|skills\/games)$/.test(location.hash) && !document.querySelector("#main .game-card:not([hidden])")), "games: Close returns to the game list");
      await lp.goto(BASE + "#/play/bingo", { waitUntil: "networkidle0" }); await lp.waitForSelector("#main .bingo", { timeout: 5000 }).catch(() => {});
      check(!!(await lp.$("#main .game-card:not([hidden]) .bingo")), "games: a game's address opens it directly");
      await lp.setViewport({ width: 1900, height: 950 });
      // The canvas shows once Play is pressed (How to play shows the instructions and options only).
      await lp.goto(BASE + "#/play/balloon", { waitUntil: "networkidle0" }); await lp.waitForSelector("#main .gs-play"); await lp.click("#main .gs-play"); await lp.waitForSelector("#main .game-canvas", { visible: true }); await sleep(200);
      const geo = await lp.evaluate(() => { const c = document.querySelector("#main .game-canvas").getBoundingClientRect(); return { l: c.left, r: innerWidth - c.right, w: c.width, h: c.height }; });
      check(Math.abs(geo.l - geo.r) < 30 && geo.w >= 1000 && geo.h <= 950 * 0.62, "games: on a wide screen the game is centred and fills the column (" + JSON.stringify(geo) + ")");
      await lp.setViewport({ width: 800, height: 600 });
      await openGame("Long-breath boat"); await gameBtn("Start"); await waitText(/Sail!/); await tone(0); await sleep(2500); await tone(null); await gameBtn("Stop"); await waitText(/sailed/);
      check(/sailed [1-9]\d* m/.test(await gameText()), "games: Long-breath boat sails while a steady note is held");
      await openGame("Bullseye"); await gameBtn("Start"); await waitText(/Hold this note:/); await tone(0); await waitText(/points/, 6000); await tone(null);
      check(/S: [-+]?\d+ cents, (10|8) points/.test(await gameText()), "games: Bullseye scores a held, in-tune Sa near the centre (" + ((await gameText()).match(/S: [^.]*points/) || ["?"])[0] + ")");
      await gameBtn("Stop");
      await openGame("Glide road"); await gameBtn("Start"); await waitText(/Start on this note:/); await tone(0); await sleep(2600); await tone(null); await gameBtn("Stop"); await waitText(/On the road \d+%\./);
      check(/On the road [1-9]\d*%\./.test(await gameText()), "games: Glide road counts the time on the road");
      await openGame("Three floors"); await gameBtn("Start"); await waitText(/Play this note:/); await tone(0); await waitText(/Next note:/, 4000); await tone(null);
      check(/Next note:/.test(await gameText()), "games: Three floors moves on when the note is played on its floor");
      await gameBtn("Stop");
      await openGame("Light the lanterns"); await gameBtn("Start"); await sleep(800); await gameBtn("Stop"); await waitText(/lanterns lit/);
      check(/lanterns lit/.test(await gameText()), "games: Light the lanterns starts and ends a round");
      await openGame("Spot the wrong note"); await gameBtn("Start"); await sleep(400);
      await lp.evaluate(() => document.querySelectorAll("#main .wn-tile")[1].click());
      check(/Right: note|Not that one: note/.test(await gameText()), "games: Spot the wrong note judges a tapped note");
      await gameBtn("Stop");
      await openGame("Higher or lower"); await gameBtn("Start"); await sleep(300); await gameBtn("Higher");
      check(/Right! Score|It went|They were/.test(await gameText()), "games: Higher or lower judges an answer");
      await gameBtn("Stop");
      await openGame("Sargam bingo"); await gameBtn("Start"); await waitText(/Call 1:/, 5000);
      const cells = await lp.$$eval("#main .bingo-cell", b => b.length);
      await lp.evaluate(() => document.querySelector("#main .bingo-cell").click());
      check(cells === 9 && /Not that one|Call/.test(await gameText()), "games: Sargam bingo deals a card of 9 and judges a tap");
      await gameBtn("Stop");
      await openGame("Catch the sam"); await gameBtn("Start"); await sleep(300);
      await lp.evaluate(() => document.querySelector("#main .samtap").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
      check(/Listen to the first cycle/.test(await gameText()), "games: Catch the sam asks to listen to the first cycle before tapping");
      await gameBtn("Stop");
      check(/Sam caught 0 of 7/.test(await gameText()), "games: Catch the sam stops and reports");
      // Ornament and technique games.
      await openGame("Meend bridge");
      await lp.evaluate(() => { const c = document.querySelector("#main .game-card input[type=checkbox]"); if (c.checked) c.click(); });
      await gameBtn("Start"); await waitText(/Your turn:/); await tone(2); await sleep(1300); await tone(null); await waitText(/points\./, 6000);
      check(/\d of \d points\./.test(await gameText()), "games: Meend bridge judges an attempt with the trainer's checks");
      await gameBtn("Stop");
      await openGame("Kan flick"); await gameBtn("Start"); await sleep(300); await gameBtn("Stop");
      check(/Score 0 of 0 \(0%\)|Score \d+ of \d+/.test(await gameText()), "games: Kan flick starts and stops");
      await openGame("Andolan lamp");
      await lp.evaluate(() => { const c = document.querySelector("#main .game-card input[type=checkbox]"); if (c.checked) c.click(); });
      await gameBtn("Start"); await waitText(/Your turn:/); await tone(3); await sleep(3500); await tone(null); await waitText(/points\./, 7000);
      check(/\d of 4 points\./.test(await gameText()) && /swing|Swing/.test(await gameText()), "games: Andolan lamp says what the swing lacked (a steady tone has none)");
      await gameBtn("Stop");
      await openGame("Swell and fade"); await gameBtn("Start"); await waitText(/clock starts/); await tone(0); await waitText(/of 100|whole six/, 10000); await tone(null);
      check(/Score \d+ of 100\. Pitch moved \d+ cents\./.test(await gameText()) && /bigger difference/.test(await gameText()), "games: Swell and fade scores the note and asks for more loudness change (the test tone is constant)");
      await openGame("Tongued beats"); await gameBtn("Start"); await waitText(/Count in/); await sleep(500); await gameBtn("Stop");
      check(/Notes on the beat: 0 of 16\./.test(await gameText()), "games: Tongued beats stops and reports");
      await openGame("Name the ornament"); await gameBtn("Start"); await sleep(300); await gameBtn("Kan");
      check(/Right\.|Not quite\./.test(await gameText()) && /: /.test(await gameText()), "games: Name the ornament judges an answer and explains it");
      await gameBtn("Stop");
      await openGame("Raga phrases"); await gameBtn("Try it"); await waitText(/Play the phrase now/); await tone(4); await sleep(700); await tone(5); await sleep(700); await tone(1); await sleep(2000); await tone(0); await sleep(900); await tone(null);
      await waitText(/Score \d+ of \d+|not recognised|No clear phrase/, 8000);
      check(/Score \d+ of \d+ \(\d+%\)/.test(await gameText()) && /andolan|swing|Swing/i.test(await gameText()), "games: Raga phrases judges G m r~ S part by part, and a steady r has no andolan");
      await openGame("Laya ladder"); await gameBtn("Start"); await waitText(/Listen for one cycle/); await sleep(400); await gameBtn("Stop");
      check(/Thah: 0 of 8 notes in time/.test(await gameText()), "games: Laya ladder reports each section");
      await openGame("Tihai"); await gameBtn("Start"); await waitText(/Start on beat 7 of the second cycle/);
      check(/Start on beat 7 of the second cycle/.test(await gameText()), "games: Tihai shows the start beat that lands on sam (S R G in keherwa: beat 7)");
      await gameBtn("Stop");
      await openGame("Taar saptak"); await gameBtn("Start"); await waitText(/Hold this note:/); await tone(12); await waitText(/Next note:/, 6000); await tone(null);
      check(/Next note:/.test(await gameText()), "games: Taar saptak scores a held upper Sa and moves on");
      await gameBtn("Stop");
      // Ornament trainer: a teacher's model from a recording becomes the target.
      {
        const os = await import("node:os"), sr = 22050, n = sr * 1.5, wav = Buffer.alloc(44 + n * 2);
        wav.write("RIFF", 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
        wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(n * 2, 40);
        for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 587.33 * i / sr) * 12000), 44 + i * 2);
        const file = path.join(os.tmpdir(), "bansuri-model-test.wav"); fs.writeFileSync(file, wav);
        await lp.goto(BASE + "#/ornaments", { waitUntil: "networkidle0" }); await lp.waitForSelector("#orn-modelfile");
        check(/Your teacher's model/.test(await lp.$eval("#main", e => e.textContent)), "ornaments: the trainer offers a teacher's model");
        await (await lp.$("#orn-modelfile")).uploadFile(file);
        await lp.waitForFunction(() => /Use it as the target/.test(document.querySelector("#main").textContent), { timeout: 10000 }).catch(() => {});
        check(/Use it as the target/.test(await lp.$eval("#main", e => e.textContent)), "ornaments: a recording becomes the teacher's model and the target");
        fs.unlinkSync(file);
        await lp.evaluate(() => localStorage.removeItem("bansuri.ornament.models"));
      }
      await lp.goto(BASE + "#/today", { waitUntil: "networkidle0" });

      // Hindi: the interface, and a session step, in Hindi.
      await setSet({ lang: "hi" });
      await lp.goto(BASE + "#/session/2", { waitUntil: "networkidle0" });
      await lp.reload({ waitUntil: "networkidle0" });
      await lp.waitForSelector("#main .block .steptext");
      await sleep(500);
      check(await lp.evaluate(() => document.documentElement.lang === "hi" && /[\u0900-\u097F]/.test(document.querySelector(".tabbar").innerText)), "hindi: the tabs are in Hindi");
      check(await lp.evaluate(() => [...document.querySelectorAll("#main .steptext")].some(p => /[\u0900-\u097F]/.test(p.textContent))), "hindi: session steps are shown in Hindi");
      await lp.goto(BASE + "#/read/ragas/yaman.md", { waitUntil: "networkidle0" });
      await lp.waitForSelector("#main .hiraga", { timeout: 8000 }).catch(() => {});
      check(await lp.evaluate(() => { const d = document.querySelector("#main .hiraga"); return !!d && /([\u0900-\u097F]+\s+){10}/.test(d.textContent) && d.querySelectorAll("h2").length >= 4 && !!document.querySelector("#main article"); }), "hindi: a raga card shows its sections in Hindi, with the English card below");
      for (const [route, what] of [["/ornaments", "ornament trainer"], ["/coach", "coach (with the tone check)"], ["/review", "teacher review"]]) {
        await lp.goto(BASE + "#" + route, { waitUntil: "networkidle0" });
        await sleep(300);
        check(await lp.evaluate(() => /[\u0900-\u097F]/.test(document.querySelector("#main h1").textContent) && [...document.querySelectorAll("#main button")].every(b => !/[A-Za-z]{3}/.test(b.textContent) || /[\u0900-\u097F]/.test(b.textContent))), "hindi: the " + what + " page's heading and buttons are in Hindi");
      }
      // A textarea's placeholder is translated; what the learner types is not.
      await lp.goto(BASE + "#/me/teacher", { waitUntil: "networkidle0" });
      await lp.waitForSelector("#main textarea", { timeout: 8000 }).catch(() => {});
      await lp.type("#main textarea", "Your name").catch(() => {});
      await sleep(200);
      check(await lp.evaluate(() => { const t = document.querySelector("#main textarea"); return !!t && /[\u0900-\u097F]/.test(t.placeholder) && t.value === "Your name"; }), "hindi: a textarea's placeholder is in Hindi (Teacher > Ask), the text typed into it stays as typed");
      await setSet({ lang: "en" });

      await lp.evaluate(() => localStorage.clear());
      await lp.close();
    }

  });
  await section("Offline and updates (service worker)", async () => {
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
      // The rest of the course is saved in the background after the first load: a lesson opens offline too.
      await sp.setOfflineMode(false);
      await sp.goto(BASE + "#/today", { waitUntil: "networkidle0" });
      await sp.waitForFunction(async () => { for (const k of await caches.keys()) if (await (await caches.open(k)).match("bansuri-mastery/lessons/L12-alankars.md")) return true; return false; }, { timeout: 30000, polling: 500 }).catch(() => {});
      await sp.setOfflineMode(true);
      await sp.goto(BASE + "#/read/lessons/L12-alankars.md", { waitUntil: "load" }).catch(() => {});
      await sp.waitForSelector("#main .lcard", { timeout: 10000 }).then(() => check(true, "offline: a lesson saved in the background opens"), () => check(false, "offline: a lesson saved in the background opens"));
      await sp.setOfflineMode(false);
      await sp.close();
    }

  });
  await section("Dashboard, rooms, paths and search", async () => {
    await page.evaluate(() => localStorage.setItem("bansuri.progress", JSON.stringify({ current: 3, startedAt: "2026-10-20", prefs: { howChosen: true } })));
    await page.reload({ waitUntil: "networkidle0" });
    await go("/today");
    check(await page.$("#main .resume .btn.primary") !== null && await page.$("#main .resume .streakchip") !== null && await page.$("#main .progresscard .weekstrip") !== null && await page.$$eval("#main .quickact", x => x.length) === 0, "today: Resume (with the streak) on top, progress at the side, nothing else competing");
    await go("/progress");
    check(await page.$$eval("#main .dashq", x => x.length) === 5, "me: the progress dashboard answers its five questions in order");
    await go("/course#phases");
    check(await page.$$eval("#main .pathhead .ring", x => x.length) >= 5, "course map: every phase shows a progress ring");
    await page.keyboard.press("/");
    await page.waitForSelector(".palette input", { timeout: 3000 }).catch(() => {});
    await page.type(".palette input", "yaman");
    await sleep(300);
    check(/Yaman/i.test(await page.$eval(".palette .pal-list", e => e.innerText).catch(() => "")), "search: pressing / and typing finds the Yaman raga card");
    await page.keyboard.press("Enter");
    await sleep(800);
    check(/#\/read\/.*yaman/i.test(await page.evaluate(() => location.hash)) && await page.$(".palette") === null, "search: Enter opens it and closes the search");

  });
  await section("Weak spots, stuck check, moving devices, teacher link, Hindi lessons", async () => {
    await page.evaluate(() => {
      const today = new Date(), d = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
      localStorage.setItem("bansuri.progress", JSON.stringify({ current: 20, startedAt: "2026-09-20", prefs: { howChosen: true },
        log: [{ date: d, minutes: 30, day: 19 }], milestones: { M1: { status: "failed", attempts: [{ date: d, passed: false }, { date: d, passed: false }] } },
        live: { holds: { "4": [{ d, s: 2.4 }] }, echo: {}, taps: [], plays: [{ d, piece: "Morning Steps", bpm: 60, ok: 4, n: 10, onTime: 3, timed: 10 }] } }));
    });
    await page.reload({ waitUntil: "networkidle0" });
    await go("/today");
    check(/Morning Steps: 40%/.test(await page.$eval("#main .fixtoday", e => e.innerText).catch(() => "")), "today: the single weakest spot is offered as one line to fix today");
    await go("/progress");
    const weakTxt = await page.$eval("#main .weakcard", e => e.innerText).catch(() => "");
    check(/Hold G longer/.test(weakTxt) && /Morning Steps: 40%/.test(weakTxt), "me: weak spots list a short Ga hold and a 40% play-along, with one tap each");
    await go("/milestone/M1");
    check(await page.$("#main .stuckcard .btn.primary") !== null, "stuck: after two failed tries a milestone offers the three-minute check");
    // Move to another device: make the link, open it, see what it holds.
    await go("/me/settings/move");
    await page.evaluate(() => [...document.querySelectorAll("#main button")].find(b => /Make a move link/.test(b.textContent)).click());
    await page.waitForSelector("#main input[aria-label='Transfer link']", { timeout: 5000 }).catch(() => {});
    const moveUrl = await page.$eval("#main input[aria-label='Transfer link']", e => e.value).catch(() => "");
    check(/#\/move\/[zj]/.test(moveUrl) && await page.$("#main .qrimg") !== null, "move: a transfer link (and a QR code while small) is made");
    if (moveUrl) {
      await page.goto(moveUrl, { waitUntil: "networkidle0" });
      await page.waitForSelector("#main table", { timeout: 5000 }).catch(() => {});
      check(/Day 20/.test(await page.$eval("#main", e => e.innerText)), "move: opening the link shows what it holds before replacing anything");
    }
    // A teacher link carries the measured practice.
    await go("/me/teacher/share");
    await page.evaluate(() => { document.querySelector("#sh-teacher").click(); [...document.querySelectorAll("#main button")].find(b => /Create link/.test(b.textContent)).click(); });
    const shareUrl = await page.$eval("#main input[aria-label='Share link']", e => e.value).catch(() => "");
    await page.goto(shareUrl, { waitUntil: "networkidle0" }); await sleep(400);
    check(/Practice details for a teacher/.test(await page.$eval("#main", e => e.innerText)) && /Morning Steps/.test(await page.$eval("#main", e => e.innerText)), "teacher link: the shared page shows the measured practice");
    // Hindi lessons.
    await page.evaluate(() => { localStorage.setItem("bansuri.settings", JSON.stringify({ lang: "hi" })); localStorage.removeItem("bansuri.cardpos.lessons/L09-fingering-sa-re-ga.md"); localStorage.setItem("bansuri.readerMode", JSON.stringify("cards")); });
    await page.goto(BASE + "#/read/lessons/L09-fingering-sa-re-ga.md", { waitUntil: "networkidle0" }); await page.reload({ waitUntil: "networkidle0" }); await sleep(600);
    const hiCard = await page.evaluate(() => { const c = document.querySelector("#main .lcard .lbody"); return { ok: !!c && (c.innerText.match(/[\u0900-\u097F]/g) || []).length > 40 && !!document.querySelector("#main .lcard .origtext"), text: ((document.querySelector("#main .lcard") || document.querySelector("#main") || {}).innerText || "").slice(0, 200), lang: localStorage.getItem("bansuri.settings") }; });
    check(hiCard.ok, "hindi: lesson cards show the Hindi text, with the English a tap away" + (hiCard.ok ? "" : " [" + JSON.stringify(hiCard) + "]"));
    await page.evaluate(() => localStorage.removeItem("bansuri.settings"));
    await page.reload({ waitUntil: "networkidle0" });

  });
  await section("Privacy, my students, plain lessons, reference kit", async () => {
    await go("/privacy");
    check(/everything stays on your device/i.test(await text()), "privacy: the page says what stays on the device");
    // A teacher pastes a student's link and sees the student in the table.
    await go("/me/teacher/share");
    await page.evaluate(() => { const b = document.querySelector("#sh-teacher"); if (!b.checked) b.click(); const n = document.querySelector("#sh-name"); n.value = "Asha"; n.dispatchEvent(new Event("input", { bubbles: true })); [...document.querySelectorAll("#main button")].find(x => /Create link/.test(x.textContent)).click(); });
    const studentLink = await page.$eval("#main input[aria-label='Share link']", e => e.value).catch(() => "");
    await go("/students");
    await page.evaluate(l => { document.querySelector("#main textarea").value = l; [...document.querySelectorAll("#main button")].find(x => x.textContent === "Add").click(); }, studentLink);
    await sleep(300);
    check(/Asha\s+20\s/.test(await page.$eval("#main table", e => e.innerText).catch(() => "")), "my students: a pasted teacher link appears in the table");
    // Lessons read in plain words: no skill codes.
    await page.evaluate(() => localStorage.setItem("bansuri.readerMode", JSON.stringify("full")));
    await go("/read/lessons/L09-fingering-sa-re-ga.md");
    const l9 = await page.$eval("#main", e => e.innerText).catch(() => "");
    check(l9.length > 500 && !/FNG-01/.test(l9), "lessons: course codes are hidden (FNG-01 not shown)");
    await page.evaluate(() => localStorage.setItem("bansuri.readerMode", JSON.stringify("cards")));
    await go("/me/journal/recordings");
    check(/reference kit/.test(await text()), "journal: the reference kit for recordings a teacher can check");
  });
  await section("Notation from a recording", async () => {
    // A recording made here: S R G R S on a C5 flute (harmonics, breath noise), 0.5 s a note, as a WAV.
    const sr = 22050, notes = [72, 74, 76, 74, 72], len = Math.floor(sr * (0.4 + notes.length * 0.5 + 0.4)), pcm = new Int16Array(len);
    let ph = 0;
    notes.forEach((m, k) => { const f = 440 * Math.pow(2, (m - 69) / 12), i0 = Math.floor(sr * (0.4 + k * 0.5)); for (let i = 0; i < sr * 0.5; i++) { ph += 2 * Math.PI * f / sr; const env = Math.min(1, i / 300, (sr * 0.5 - i) / 400); pcm[i0 + i] = Math.round(9000 * env * (Math.sin(ph) + 0.2 * Math.sin(2 * ph)) + 300 * (Math.random() - 0.5)); } });
    const wav = Buffer.alloc(44 + pcm.length * 2);
    wav.write("RIFF", 0); wav.writeUInt32LE(36 + pcm.length * 2, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(pcm.length * 2, 40);
    Buffer.from(pcm.buffer).copy(wav, 44);
    const wavPath = path.join(process.env.TEMP || process.env.TMPDIR || "/tmp", "bansuri-transcribe-test.wav");
    fs.writeFileSync(wavPath, wav);
    await go("/transcribe");
    const input = await page.$("#tr-file");
    await input.uploadFile(wavPath);
    await page.waitForFunction(() => /^Done/.test((document.querySelector("#main [role=status]") || {}).textContent || ""), { timeout: 20000 }).catch(() => {});
    const out = await page.$eval("#main textarea[aria-label^='Notation']", e => e.value).catch(() => "");
    const plain = out.replace(/[|_-]/g, " ").replace(/\s+/g, " ").trim();
    check(/S R G R S/.test(plain), "transcribe: a recorded S R G R S comes back as sargam [" + out.replace(/\n/g, " / ") + "]");
    const sa = await page.$eval("#main select[aria-label='Sa of the recording']", e => e.options[e.selectedIndex].textContent).catch(() => "");
    check(/^C/.test(sa), "transcribe: the recording's Sa is found (C) [" + sa + "]");
    await shot("20-transcribe-result");
    // The notation view, the two layouts, and the players.
    check(/S/.test(await page.$eval("#main .nview", e => e.innerText).catch(() => "")), "transcribe: the notation is shown as phrases");
    await page.evaluate(() => [...document.querySelectorAll("#main .seg-btn")].find(b => b.textContent === "Taal and beats").click());
    check(await page.$("#main .nview .nsep") !== null, "transcribe: Bars and beats shows the notes in bars");
    await page.click("#main button[aria-label='Play: Both together']");
    await sleep(400);
    check(await page.$("#main button[aria-label='Stop: Both together']") !== null, "transcribe: the recording and the notes found play together");
    await page.click("#main button[aria-label='Stop: Both together']");
    await page.evaluate(() => [...document.querySelectorAll("#main .seg-btn")].find(b => b.textContent === "Phrases").click());
    // Downloads: each player makes a WAV file (the link click is caught, not saved).
    await page.evaluate(() => { window.__dl = []; HTMLAnchorElement.prototype.click = function () { if (this.download) window.__dl.push(this.download); }; });
    for (const t of ["The recording", "The notation", "Both together"]) await page.click(`#main button[aria-label='Download: ${t}']`);
    await page.waitForFunction(() => window.__dl.length >= 3, { timeout: 15000 }).catch(() => {});
    const dls = await page.evaluate(() => window.__dl);
    check(dls.length === 3 && dls.every(n => /\.wav$/.test(n)), "transcribe: the recording, the notation and both together download as WAV files [" + dls.join(", ") + "]");
    await page.evaluate(() => [...document.querySelectorAll("#main .seg-btn")].find(b => b.textContent === "सा रे ग").click());
    check(/सा/.test(await page.$eval("#main .nview", e => e.innerText)), "transcribe: the notation can be shown in Devanagari");
    await page.evaluate(() => [...document.querySelectorAll("#main .seg-btn")].find(b => b.textContent === "S R G").click());
    // Each line shows where it starts; its time plays that line (and picks it for practice).
    await page.click("#main .nview .ntime").catch(() => {});
    await sleep(150);
    check(await page.$("#main .nview .nrow.nplaying") !== null && await page.$$eval("#main select[aria-label='Line to practise'] option", o => o.length).catch(() => 0) >= 1, "transcribe: a line's time plays it, and lines can be practised with the recording");
    // Practise the line: the recording loops and the (fake) microphone's pass is scored.
    await page.evaluate(() => { document.querySelector("#tr-phear").checked = false; [...document.querySelectorAll("#main .practice button")].find(b => /Start/.test(b.textContent)).click(); });
    await page.waitForFunction(() => /^Pass 1 at \d+%: \d+ of \d+ notes right/.test((document.querySelector("#main .pout p") || {}).textContent || ""), { timeout: 20000 }).catch(() => {});
    const pass1 = await page.$eval("#main .pout p", e => e.textContent).catch(() => "");
    await page.evaluate(() => [...document.querySelectorAll("#main .practice button")].find(b => /Stop/.test(b.textContent)).click());
    check(/^Pass 1 at \d+%/.test(pass1) && await page.$$eval("#main .pmarks .chip", c => c.length).catch(() => 0) >= 3, "transcribe: practising a line scores each pass, note by note [" + pass1 + "]");
    await page.evaluate(() => [...document.querySelectorAll("#main .seg-btn")].find(b => b.textContent === "Easier").click());
    const easy = (await page.$eval("#main textarea[aria-label^='Notation']", e => e.value)).replace(/[|_,-]/g, " ").replace(/\s+/g, " ").trim();
    await page.evaluate(() => [...document.querySelectorAll("#main .seg-btn")].find(b => b.textContent === "As played").click());
    check(/S R G R S/.test(easy), "transcribe: the easier version of a plain tune keeps its notes [" + easy + "]");
    check(await page.$("#tr-follow") !== null, "transcribe: the bars can follow tempo changes");
    // On a D flute, playing with the recording: C is komal Ni below Sa, so S R G R S is written n S R S n.
    check(await page.evaluate(() => [...document.querySelectorAll("#main .seg-btn")].find(b => b.textContent === "My flute's own key").getAttribute("aria-pressed")) === "true", "transcribe: the sargam is written from the song's own Sa by default (as tutorials write it)");
    await page.evaluate(() => [...document.querySelectorAll("#main .seg-btn")].find(b => b.textContent === "Same key as the recording").click());
    await page.select("#main select[aria-label='Your flute']", "74");
    await sleep(200);
    const onD = (await page.$eval("#main textarea[aria-label^='Notation']", e => e.value)).replace(/[|_-]/g, " ").replace(/\s+/g, " ").trim();
    check(/n S R S n/.test(onD.replace(/\.n/g, "n").replace(/n'/g, "n")), "transcribe: on a D flute the same sound is written n S R S n [" + onD + "]");
    await page.evaluate(() => [...document.querySelectorAll("#main .seg-btn")].find(b => b.textContent === "My flute's own key").click());
    // The separation model is offered for Singer and Background (not downloaded in this test).
    // A mono file: the singer is told apart by repetition, and the page says so.
    await page.evaluate(() => [...document.querySelectorAll("#main .partseg .seg-btn")].find(b => b.textContent === "Singer").click());
    await page.waitForFunction(() => /mono \(one channel\)/.test((document.querySelector("#main .partpick") || {}).textContent || "") && document.querySelector("#main .partpick .trbusy").hidden, { timeout: 30000 }).catch(() => {});
    check(/mono \(one channel\)/.test(await page.$eval("#main .partpick", e => e.textContent).catch(() => "")) && /S/.test(await page.$eval("#main textarea[aria-label^='Notation']", e => e.value).catch(() => "")), "transcribe: Singer on a mono recording asks for the separation model (no repetition guess)");
    check(/Download the model and separate/.test(await page.$eval("#main .sepbox", e => e.textContent).catch(() => "")), "transcribe: the separation model is offered for the singer");
    await page.evaluate(() => [...document.querySelectorAll("#main .partseg .seg-btn")].find(b => b.textContent === "Whole song").click());
    // The analysis runs in a worker and can be cancelled: a long recording, cancelled at once.
    {
      const n3 = sr * 90, long = Buffer.alloc(44 + n3 * 2);
      long.write("RIFF", 0); long.writeUInt32LE(36 + n3 * 2, 4); long.write("WAVEfmt ", 8); long.writeUInt32LE(16, 16); long.writeUInt16LE(1, 20); long.writeUInt16LE(1, 22);
      long.writeUInt32LE(sr, 24); long.writeUInt32LE(sr * 2, 28); long.writeUInt16LE(2, 32); long.writeUInt16LE(16, 34); long.write("data", 36); long.writeUInt32LE(n3 * 2, 40);
      for (let i = 0; i < n3; i++) long.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 523.25 * i / sr) * (Math.floor(i / sr) % 2 ? 1 : 0.2)), 44 + i * 2);
      const longPath = path.join(process.env.TEMP || process.env.TMPDIR || "/tmp", "bansuri-transcribe-long.wav");
      fs.writeFileSync(longPath, long);
      await (await page.$("#tr-file")).uploadFile(longPath);
      await page.waitForFunction(() => { const b = [...document.querySelectorAll("#main .trbusy .btn")].find(x => x.textContent === "Cancel" && x.offsetParent !== null); if (b) b.click(); return !!b; }, { timeout: 15000 }).catch(() => {});
      await page.waitForFunction(() => /^Cancelled/.test((document.querySelector("#main [role=status]") || {}).textContent || ""), { timeout: 5000 }).catch(() => {});
      check(/^Cancelled/.test(await page.$eval("#main [role=status]", e => e.textContent).catch(() => "")), "transcribe: a long analysis can be cancelled");
      fs.unlinkSync(longPath);
      await page.evaluate(async () => { const m = await import(new URL("app/js/captures.js", document.baseURI).href); for (const c of await m.listCaptures()) if (/long/.test(c.name)) await m.deleteCapture(c.id); });
      await go("/today");
      await go("/transcribe");
      await page.waitForSelector("#main .caprow .btn.primary", { timeout: 5000 }).catch(() => {});
      // Back to the short recording.
      await page.evaluate(() => [...document.querySelectorAll("#main .caprow")].find(r => /bansuri-transcribe-test/.test(r.textContent)).querySelector(".btn.primary").click());
      await page.waitForSelector(".trresults:not([hidden])", { timeout: 20000 }).catch(() => {});
    }
    // Kept in the app: the file is listed under Your recordings; Save keeps an edited notation,
    // and Open brings the recording back with it, without any file.
    await page.waitForFunction(() => /bansuri-transcribe-test/.test((document.querySelector("#main .caprow") || {}).textContent || ""), { timeout: 5000 }).catch(() => {});
    check(/bansuri-transcribe-test/.test(await page.$eval("#main .caprow", e => e.innerText).catch(() => "")), "transcribe: the opened file is kept under Your recordings [" + await page.$$eval("#main .caprow b", r => r.map(x => x.textContent).join(", ")).catch(() => "") + "]");
    await page.evaluate(() => { const t = document.querySelector("#main textarea[aria-label^='Notation']"); t.value = "S R G R S - - - ||"; [...document.querySelectorAll("#main button")].find(b => b.textContent === "Save").click(); });
    await page.waitForFunction(() => /notation saved/.test((document.querySelector("#main .caprow") || {}).textContent || ""), { timeout: 5000 }).catch(() => {});
    await go("/transcribe");
    await page.waitForSelector("#main .caprow .btn.primary", { timeout: 5000 }).catch(() => {});
    const hiddenFirst = await page.$("#main .capnotation") === null;
    await page.evaluate(() => [...document.querySelectorAll("#main .caprow button")].find(b => b.textContent === "Show notation").click());
    check(hiddenFirst && /S R G R S/.test(await page.$eval("#main .capnotation", e => e.textContent).catch(() => "")), "transcribe: a saved notation stays hidden until Show notation");
    await page.evaluate(() => document.querySelector("#main .caprow .btn.primary").click());
    await page.waitForSelector(".trresults:not([hidden])", { timeout: 20000 }).catch(() => {});
    check(/S R G R S - - - \|\|/.test(await page.$eval("#main textarea[aria-label^='Notation']", e => e.value).catch(() => "")), "transcribe: Open brings the recording back with its saved notation");
    // A stereo file: P D N panned left first (the "background"), then S R G R S in the centre (the "singer").
    {
      const sr2 = 22050, seq = [[79, 0.4, "L"], [81, 0.9, "L"], [83, 1.4, "L"], [72, 2.4, "C"], [74, 2.9, "C"], [76, 3.4, "C"], [74, 3.9, "C"], [72, 4.4, "C"]];
      const n2 = Math.floor(sr2 * 5.2), Lc = new Int16Array(n2), Rc = new Int16Array(n2);
      for (const [m, t0, pos] of seq) { const f = 440 * Math.pow(2, (m - 69) / 12), i0 = Math.floor(sr2 * t0); let ph2 = 0; for (let i = 0; i < sr2 * 0.45; i++) { ph2 += 2 * Math.PI * f / sr2; const env = Math.min(1, i / 300, (sr2 * 0.45 - i) / 400), v = 9000 * env * (Math.sin(ph2) + 0.3 * Math.sin(2 * ph2) + 0.15 * Math.sin(3 * ph2)); Lc[i0 + i] += v; Rc[i0 + i] += pos === "L" ? v * 0.15 : v; } }
      const st2 = Buffer.alloc(44 + n2 * 4);
      st2.write("RIFF", 0); st2.writeUInt32LE(36 + n2 * 4, 4); st2.write("WAVEfmt ", 8); st2.writeUInt32LE(16, 16); st2.writeUInt16LE(1, 20); st2.writeUInt16LE(2, 22);
      st2.writeUInt32LE(sr2, 24); st2.writeUInt32LE(sr2 * 4, 28); st2.writeUInt16LE(4, 32); st2.writeUInt16LE(16, 34); st2.write("data", 36); st2.writeUInt32LE(n2 * 4, 40);
      for (let i = 0; i < n2; i++) { st2.writeInt16LE(Lc[i], 44 + i * 4); st2.writeInt16LE(Rc[i], 46 + i * 4); }
      const stPath = path.join(process.env.TEMP || process.env.TMPDIR || "/tmp", "bansuri-transcribe-stereo.wav");
      fs.writeFileSync(stPath, st2);
      await page.select("#main select[aria-label='Your flute']", "72").catch(() => {});
      await page.evaluate(() => { document.querySelector("#main [role=status]").textContent = ""; });
      await (await page.$("#tr-file")).uploadFile(stPath);
      await page.waitForFunction(() => /^Done/.test((document.querySelector("#main [role=status]") || {}).textContent || ""), { timeout: 20000 }).catch(() => {});
      await page.waitForFunction(() => { const b = document.querySelector("#main .partseg .seg-btn:nth-child(2)"); return b && !b.disabled; }, { timeout: 5000 }).catch(() => {});
      const plainOf = () => page.$eval("#main textarea[aria-label^='Notation']", e => e.value.replace(/[|_,-]/g, " ").replace(/\s+/g, " ").trim());
      await page.evaluate(() => [...document.querySelectorAll("#main .partseg .seg-btn")].find(b => b.textContent === "Singer").click());
      await page.waitForFunction(() => /^Only the singer/.test((document.querySelector("#main .partpick p") || {}).textContent || ""), { timeout: 30000 }).catch(() => {});
      await sleep(300);
      const sing = await plainOf().catch(() => "");
      await page.evaluate(() => [...document.querySelectorAll("#main .partseg .seg-btn")].find(b => b.textContent === "Background").click());
      await page.waitForFunction(() => /^Only the music/.test((document.querySelector("#main .partpick p") || {}).textContent || ""), { timeout: 30000 }).catch(() => {});
      await sleep(300);
      const back = await plainOf().catch(() => "");
      check(/S R G R S/.test(sing) && !/P/.test(sing) && /P D N/.test(back) && !/G/.test(back), "transcribe: a stereo song splits into the singer (centre) and the background (sides) [" + sing + " / " + back + "]");
      fs.unlinkSync(stPath);
      await go("/transcribe");
    }
    // A MIDI file: exact notes from the melody track, Sa from its key (D), its tempo; then Check by ear.
    {
      const vlq = n => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
      const trk = evs => { const body = []; for (const [dt, ...bytes] of evs) body.push(...vlq(dt), ...bytes); body.push(0, 0xff, 0x2f, 0); return [0x4d, 0x54, 0x72, 0x6b, body.length >>> 24, (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255, ...body]; };
      const nm = s2 => [0xff, 0x03, s2.length, ...[...s2].map(c => c.charCodeAt(0))];
      const mel = [[0, ...nm("Melody")]]; for (const [m, b] of [[62, 1], [64, 1], [66, 1], [67, 1], [69, 2], [67, 2]]) mel.push([0, 0x90, m, 90], [b * 480, 0x80, m, 0]);
      const pad = [[0, ...nm("Strings")], [0, 0xc1, 48]]; for (const ch of [[50, 54, 57], [55, 59, 62]]) { ch.forEach(m => pad.push([0, 0x91, m, 60])); ch.forEach((m, i) => pad.push([i ? 0 : 1920, 0x81, m, 0])); }
      const bytes = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 3, 0x01, 0xe0, ...trk([[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20], [0, 0xff, 0x59, 2, 2, 0]]), ...trk(mel), ...trk(pad)]);
      const midPath = path.join(process.env.TEMP || process.env.TMPDIR || "/tmp", "bansuri-transcribe-test.mid");
      fs.writeFileSync(midPath, bytes);
      await page.evaluate(() => { document.querySelector("#main [role=status]").textContent = ""; });
      await (await page.$("#tr-midi")).uploadFile(midPath);
      await page.waitForFunction(() => /^Done: \d+ notes read/.test((document.querySelector("#main [role=status]") || {}).textContent || ""), { timeout: 20000 }).catch(() => {});
      await page.evaluate(() => [...document.querySelectorAll("#main .seg-btn")].find(b => b.textContent === "My flute's own key").click());
      await sleep(200);
      const midNot = await page.$eval("#main textarea[aria-label^='Notation']", e => e.value).catch(() => "");
      const trackLabel = await page.$eval("#main select[aria-label='MIDI track']", e => e.options[e.selectedIndex].textContent).catch(() => "");
      const saLabel = await page.$eval("#main select[aria-label='Sa of the recording']", e => e.options[e.selectedIndex].textContent).catch(() => "");
      check(/^X S R G m \| 0 P - m - \|\|/.test(midNot.trim()) && /Melody/.test(trackLabel) && /^D \(the file's key\)/.test(saLabel), "midi: the melody track's exact notes, Sa from the key [" + midNot.trim() + " / " + trackLabel + " / " + saLabel + "]");
      // Check by ear: pick the first note with the keyboard, raise it a semitone, undo; delete one.
      await page.focus("#main .earplot");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowUp");
      await sleep(150);
      const raised = await page.$eval("#main textarea[aria-label^='Notation']", e => e.value.trim()).catch(() => "");
      await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control");
      await sleep(150);
      const undone = await page.$eval("#main textarea[aria-label^='Notation']", e => e.value.trim()).catch(() => "");
      await page.keyboard.press("Delete");
      await sleep(150);
      const deleted = await page.$eval("#main textarea[aria-label^='Notation']", e => e.value.trim()).catch(() => "");
      check(/^X r R G m/.test(raised) && /^X S R G m/.test(undone) && /^X _ R G m/.test(deleted), "ear: a note picked with the keys is raised, the change undone, and a note deleted [" + raised.slice(0, 12) + " / " + undone.slice(0, 12) + " / " + deleted.slice(0, 12) + "]");
      check(/Note \d+ of \d+/.test(await page.$eval("#main .earinfo", e => e.textContent).catch(() => "")), "ear: the picked note is described");
      // Split the picked note (R) in two, then add a note after it with the keys; undo both.
      await page.focus("#main .earplot");
      await page.keyboard.press("s");
      await sleep(150);
      const split = await page.$eval("#main textarea[aria-label^='Notation']", e => e.value.trim()).catch(() => "");
      await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.press("z"); await page.keyboard.up("Control");
      check(/^X _ RR G m/.test(split), "ear: S splits the picked note in two [" + split.slice(0, 14) + "]");
      // The line-by-line check: the first line is offered, Enter marks it right and moves on.
      await page.evaluate(() => [...document.querySelectorAll("#main button")].find(b => b.textContent === "Check line by line").click());
      await sleep(200);
      const line1 = await page.$eval("#main .guide p", e => e.innerText).catch(() => "");
      await page.keyboard.press("Enter"); await sleep(300);
      const line2 = await page.$eval("#main .guide p", e => e.innerText).catch(() => "");
      await page.evaluate(() => { const b = [...document.querySelectorAll("#main button")].find(x => x.textContent === "Stop checking"); if (b) b.click(); });
      check(/^Line 1 of \d+/.test(line1) && /^Line 2 of|Every line is checked/.test(line2), "ear: the line-by-line check walks the lines [" + line1.slice(0, 30) + " / " + line2.slice(0, 30) + "]");
      await page.click("#main button[aria-label='Hear the original around this note (Space)']");
      await sleep(400);
      await page.click("#main button[aria-label='Stop']");
      // Tap the beat: six taps half a second apart give 120 BPM.
      await page.evaluate(() => [...document.querySelectorAll("#main button")].find(b => b.textContent === "Tap the beat").click());
      for (let k = 0; k < 6; k++) { await page.keyboard.press("t"); await sleep(500); }
      await page.evaluate(() => [...document.querySelectorAll("#main button")].find(b => b.textContent === "Done").click());
      const tapped = Number(await page.$eval("#main input[aria-label='Tempo (BPM)']", e => e.value));
      check(Math.abs(tapped - 120) <= 6, "transcribe: tapping the beat sets the tempo [" + tapped + " BPM]");
      // Save as MIDI, and Add to Songs (then the Songs page lists it).
      await page.evaluate(() => { window.__dl = []; HTMLAnchorElement.prototype.click = function () { if (this.download) window.__dl.push(this.download); }; });
      await page.evaluate(() => { document.querySelector("#main input[aria-label='Name']").value = "Smoke tune"; [...document.querySelectorAll("#main button")].find(b => /Save as MIDI/.test(b.textContent)).click(); [...document.querySelectorAll("#main button")].find(b => /Add to Songs/.test(b.textContent)).click(); });
      const dl2 = await page.evaluate(() => window.__dl);
      check(dl2.some(n => /\.mid$/.test(n)), "transcribe: the notation saves as a MIDI file [" + dl2.join(", ") + "]");
      check(await page.$("#main .trsteps") !== null, "transcribe: a bar of links to the steps");
      // A backup carries My songs and Transcribe's recordings.
      const bk = await page.evaluate(async () => { const m = await import(new URL("app/js/backup.js", document.baseURI).href); const o = await m.backupWith(true); return { songs: /Smoke tune/.test((o.stores || {})["bansuri.mysongs"] || ""), caps: (o.captures || []).length, data: /^data:/.test(((o.captures || [])[0] || {}).data || "") }; }).catch(e => ({ err: String(e) }));
      check(bk.songs && bk.caps >= 1 && bk.data, "backup: My songs and Transcribe's recordings are in the backup [" + JSON.stringify(bk) + "]");
      fs.unlinkSync(midPath);
      await go("/songs");
      check(/my songs/.test(await text().catch(() => "")) && /smoke tune/.test(await text().catch(() => "")), "songs: a notation added from Transcribe is under My songs");
      await go("/transcribe");
    }
    fs.unlinkSync(wavPath);
  });
  await section("Navigation: five places, section tabs", async () => {
    await go("/today");
    const tabs = await page.$$eval("nav.tabbar a", a => a.map(x => x.textContent.trim()));
    check(tabs.join() === "Today,Course,Skills,Music,Me" && !(await page.$("#main .sectiontabs")), "five places at the bottom, and no section tabs on Today [" + tabs.join(", ") + "]");
    await go("/skills/rhythm");
    const cur = await page.$eval("#main .sectiontabs [aria-current=page]", e => e.textContent.trim()).catch(() => "");
    const place = await page.$eval("nav.tabbar [aria-current=page]", e => e.textContent.trim()).catch(() => "");
    check(cur === "Rhythm" && place === "Skills" && (await page.$$eval("#main .sectiontabs a", a => a.length)) === 8, "a skill shows its place and its section as current (" + place + " > " + cur + ")");
    // The place remembers its section: away to Today, then the Skills tab lands on Rhythm again.
    await go("/today");
    await page.click("nav.tabbar a[data-k=skills]"); // a real click (an earlier test stubs scripted link clicks)
    await page.waitForFunction(() => location.hash === "#/skills/rhythm", { timeout: 3000 }).catch(() => {});
    const h1 = await page.evaluate(() => location.hash);
    check(h1 === "#/skills/rhythm", "each place remembers its last section (" + h1 + ")");
    // Tapping the place you are in (at the top) goes to its first section.
    await page.click("nav.tabbar a[data-k=skills]"); // a real click (an earlier test stubs scripted link clicks)
    await page.waitForFunction(() => location.hash === "#/skills", { timeout: 3000 }).catch(() => {});
    const h2 = await page.evaluate(() => location.hash);
    check(h2 === "#/skills", "tapping the current place goes to its first section (" + h2 + ")");
    // Old addresses still open, under their new place.
    for (const [route, want] of [["/bench", "Skills"], ["/songs", "Music"], ["/plan", "Course"], ["/journal", "Me"], ["/coach/TS-05", "Skills"], ["/play", "Skills"]]) {
      await go(route);
      check(await page.$eval("nav.tabbar [aria-current=page]", e => e.textContent.trim()).catch(() => "") === want, route + " still opens, under " + want);
    }
    // The address bar shows the new address for an old one.
    await go("/songs");
    check(await page.evaluate(() => location.hash) === "#/music", "an old address shows its new one (/songs -> #/music)");
    await go("/settings#g-help");
    check(await page.evaluate(() => location.hash) === "#/me/settings#g-help", "the anchor survives the move (/settings#g-help)");
    // Wide screen: the rail lists the place's sections under it, with search at its top.
    await go("/skills/tone");
    const rail = await page.evaluate(() => ({ secs: [...document.querySelectorAll("nav.tabbar .railsecs a")].map(a => a.textContent.trim()), cur: (document.querySelector("nav.tabbar .railsecs [aria-current=page]") || {}).textContent, search: !!document.querySelector("nav.tabbar .railsearch") && document.querySelector("nav.tabbar .railsearch").offsetParent !== null }));
    check(rail.secs.length === 8 && rail.cur === "Tone" && rail.search, "wide screen: the rail lists Skills' sections under it, and search at its top [" + rail.secs.join(", ") + "]");
    // Arrow keys move along the tab row.
    await page.focus("nav.tabbar a[data-k=today]"); await page.keyboard.press("ArrowDown");
    check(await page.evaluate(() => document.activeElement && document.activeElement.dataset.k === "course"), "arrow keys move between the places");
    // A ring on Today for today's progress, a dot on Me for unseen teacher feedback.
    await page.evaluate(() => { localStorage.setItem("bansuri.feedback", JSON.stringify([{ id: "smoke-fb", date: "2026-01-01", teacher: "T", what: "x", comment: "", task: "", due: null, scores: {}, notes: {} }])); localStorage.removeItem("bansuri.feedback.seen"); });
    await go("/today");
    check(await page.evaluate(() => document.querySelector("nav.tabbar a[data-k=me]").classList.contains("dotted")), "new teacher feedback puts a dot on Me");
    await go("/me/teacher"); await go("/today");
    check(await page.evaluate(() => !document.querySelector("nav.tabbar a[data-k=me]").classList.contains("dotted")), "opening the Teacher tab clears the dot");
    await page.evaluate(() => localStorage.removeItem("bansuri.feedback"));
    // Offline: a quiet line under the top bar, and back online with a toast.
    await page.setOfflineMode(true); await sleep(300);
    const off = await page.evaluate(() => { const e = document.querySelector(".offlinebar"); return !!e && !e.hidden; });
    await page.setOfflineMode(false); await sleep(300);
    check(off && await page.evaluate(() => document.querySelector(".offlinebar").hidden), "offline: a line under the top bar, gone when back online");
    await page.evaluate(() => { try { localStorage.removeItem("bansuri.nav.last"); } catch (e) { /* storage blocked */ } });
  });
  await section("Flute dock", async () => {
    await go("/today");
    await page.click(".topbar .dockbtn");
    await page.waitForSelector(".dock:not([hidden]) .bb-bench", { timeout: 8000 }).catch(() => {});
    const tabs = await page.$$eval(".dock .docktabs button", b => b.map(x => x.dataset.dock));
    check(tabs.join() === "drone,tuner,taal,fingers", "the dock has four tabs: drone, tuner, taal and fingering [" + tabs.join(", ") + "]");
    await page.evaluate(() => document.querySelector(".dock [data-dock=taal]").click()); await sleep(200);
    check(await page.evaluate(() => { const vis = e => e && e.offsetParent !== null; return vis(document.querySelector(".dock [data-ref=talaBtn]")) && !vis(document.querySelector(".dock [data-ref=tanBtn]")); }), "the Taal tab shows the tala, not the drone");
    await page.evaluate(() => document.querySelector(".dock [data-dock=drone]").click()); await sleep(200);
    await page.evaluate(() => document.querySelector(".dock [data-ref=tanBtn]").click());
    await page.click(".dock .dockhead button");
    await go("/skills");
    const st = await page.evaluate(() => ({ open: !document.querySelector(".dock").hidden, pill: !document.querySelector(".dronepill").hidden, bench: !!document.querySelector(".dock .bb-bench") }));
    check(!st.open && st.pill && !st.bench, "closing the dock keeps its drone playing across screens, shown as a pill " + JSON.stringify(st));
    await page.click(".dronepill");
    await page.waitForSelector(".dock:not([hidden]) [data-ref=tanBtn]", { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => document.querySelector(".dock [data-ref=tanBtn]").click());
    await page.keyboard.press("Escape");
    check(await page.evaluate(() => document.querySelector(".dock").hidden && document.querySelector(".dronepill").hidden), "the pill reopens the dock; stopping the drone and Escape close everything");
  });
  await section("Focus mode", async () => {
    await page.evaluate(() => { const st = JSON.parse(localStorage.getItem("bansuri.settings") || "{}"); st.focus = true; localStorage.setItem("bansuri.settings", JSON.stringify(st)); });
    await page.reload({ waitUntil: "networkidle0" }); await go("/today");
    const tabs = await page.$$eval("nav.tabbar a", a => a.map(x => x.textContent.trim().toLowerCase()));
    const pill = await page.$eval(".levelpill", e => getComputedStyle(e).display).catch(() => "none");
    await go("/skills/tone");
    const secs = await page.$$eval("#main .sectiontabs a", a => a.map(x => x.textContent.trim().toLowerCase()));
    const games = await page.$$eval("#main a[href^='#/play/']", a => a.length);
    check(tabs.join() === "today,course,skills,music,me" && !secs.includes("games") && !games && pill === "none", "focus mode: no Games section, no games in a skill, no level [" + tabs.join(", ") + " | " + secs.join(", ") + "]");
    await page.evaluate(() => { const st = JSON.parse(localStorage.getItem("bansuri.settings") || "{}"); st.focus = false; localStorage.setItem("bansuri.settings", JSON.stringify(st)); });
    await page.reload({ waitUntil: "networkidle0" });
  });
  await section("Teacher review", async () => {
    // The student asks; the link is caught where it would be shared or copied.
    await go("/review");
    await page.evaluate(() => { window.__sent = []; navigator.share = undefined; navigator.canShare = undefined; navigator.clipboard.writeText = t => { window.__sent.push(t); return Promise.resolve(); }; });
    await page.type("#main input[aria-label='Title']", "Raga Yaman alap");
    await page.evaluate(() => [...document.querySelectorAll("#main button")].find(b => /Make the review link/.test(b.textContent)).click());
    await page.waitForSelector("#main input[aria-label='Review link']", { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => [...document.querySelectorAll("#main .rvlinkout button")].find(b => /^Copy/.test(b.textContent.trim())).click());
    await page.waitForFunction(() => window.__sent.length, { timeout: 5000 }).catch(() => {});
    const reqLink = (await page.evaluate(() => window.__sent[0] || "")).match(/#\/review\/[A-Za-z0-9_-]+/);
    check(!!reqLink, "review: the student's request becomes a link");
    // The teacher rates and sends the reply.
    await go(reqLink ? reqLink[0].slice(1) : "/review/x");
    await page.evaluate(() => { window.__sent = []; navigator.share = undefined; navigator.clipboard.writeText = t => { window.__sent.push(t); return Promise.resolve(); }; });
    await page.evaluate(() => { document.querySelector("#rv-tone-3").click(); document.querySelector("#rv-pitch-4").click(); const t = document.querySelector("#main textarea[aria-label='Practice task']"); t.value = "Long tones on Sa, 10 minutes a day"; [...document.querySelectorAll("#main button")].find(b => /Send the review/.test(b.textContent)).click(); });
    await page.waitForFunction(() => window.__sent.length, { timeout: 5000 }).catch(() => {});
    const fbLink = (await page.evaluate(() => window.__sent[0] || "")).match(/#\/feedback\/[A-Za-z0-9_-]+/);
    check(!!fbLink && /raga yaman alap/.test(await text()), "review: the teacher sees the request and makes a reply link");
    // The student opens the reply: saved, and the task is on Today.
    await go(fbLink ? fbLink[0].slice(1) : "/feedback/x");
    const fbText = await text();
    check(/clear but small/.test(fbText) && /long tones on sa/.test(fbText), "review: the student's app shows the ratings and the task");
    await go("/today");
    check(/from your teacher/.test(await text()) && /long tones on sa/.test(await text()), "review: the practice task is on Today");
  });
  await section("Day 0 lesson (interactive)", async () => {
    // The whole lesson, as a learner does it: a synthetic microphone plays Sa for the flute finder
    // and the time capsule; timers run fast (window.__lessonTime). Its own browser context, so its
    // storage (a fresh learner) does not touch the other sections' pages.
    const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
    const lp = await ctx.newPage();
    await collectI18n(lp);
    lp.on("pageerror", e => errors.push("pageerror: " + e.message));
    lp.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
    await lp.evaluateOnNewDocument(() => {
      const voices = []; let current = 0;
      const apply = (v, hz) => { const t = v.c.currentTime; if (hz) { v.o.frequency.setValueAtTime(hz, t); v.g.gain.setTargetAtTime(0.4, t, 0.005); } else v.g.gain.setTargetAtTime(0, t, 0.005); };
      window.__tone = hz => { current = hz; voices.forEach(v => apply(v, hz)); };
      navigator.mediaDevices.getUserMedia = async () => {
        const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(), d = c.createMediaStreamDestination();
        o.type = "triangle"; g.gain.value = 0; o.connect(g); g.connect(d); o.start();
        const v = { c, o, g, stream: d.stream }; voices.push(v); apply(v, current);
        return d.stream;
      };
      window.__lessonTime = 0.05;
    });
    const tone = hz => lp.evaluate(f => window.__tone(f), hz);
    const clickL = (sel, re) => lp.evaluate((sel, src) => { const b = [...document.querySelectorAll(sel)].find(x => new RegExp(src).test(x.textContent) && !x.disabled && !x.hidden); if (b) b.click(); return !!b; }, sel, re.source);
    const tapPart = id => lp.evaluate(id => document.querySelector(`[data-part="${id}"]`).dispatchEvent(new MouseEvent("click", { bubbles: true })), id);
    const ready = () => lp.$eval(".lesson-next", b => !b.disabled);
    const title = () => lp.$eval(".lesson-title", e => e.textContent);
    // One Day N: the session's blocks come as cards between the steps ("learn"); next() reads each
    // card it passes (ready at once, with the block's words) and goes on to the next step.
    const cardsSeen = [];
    const next = async () => {
      for (let k = 0; k < 3; k++) {
        const t0 = await title();
        await lp.evaluate(() => document.querySelector(".lesson-next").click());
        await lp.waitForFunction(t => { const e = document.querySelector(".lesson-title"); return !e || e.textContent !== t; }, { timeout: 4000 }, t0).catch(() => {});
        await sleep(150);
        const card = await lp.evaluate(() => { const s = document.querySelector(".lesson-stage"); return s && s.dataset.kind === "learn" ? { id: s.dataset.step, text: s.querySelector(".lesson-lead").textContent, ready: !document.querySelector(".lesson-next").disabled } : null; });
        if (!card) break;
        cardsSeen.push(card);
      }
    };
    await lp.goto(BASE + "#/today", { waitUntil: "networkidle0" });
    await lp.evaluate(() => { localStorage.clear(); localStorage.setItem("bansuri.settings", JSON.stringify({ countdown: 0 })); localStorage.setItem("bansuri.progress", JSON.stringify({ current: 0, prefs: { langChosen: true, howChosen: true, playAsked: true } })); });
    await lp.reload({ waitUntil: "networkidle0" });
    await lp.waitForSelector("#main .firstrun a.btn");
    check(await lp.$eval("#main .firstrun a.btn", a => a.getAttribute("href")) === "#/lesson/m0", "Day 0: Start Day 0 opens the lesson");
    await lp.goto(BASE + "#/lesson/m0", { waitUntil: "networkidle0" });
    await lp.waitForSelector("#main .lesson-cover");
    check(/Meet your flute/.test(await lp.$eval("#main .lesson-cover h1", e => e.textContent)) && await lp.$$eval("#main .lesson-chapters li", l => l.length) === 6, "lesson: the cover names the lesson and its six chapters");
    await clickL("#main button", /^Start$/);
    await lp.waitForSelector(".lesson-title");
    const shown = sel => lp.evaluate(q => { const e = document.querySelector(q); return !!e && getComputedStyle(e).display !== "none"; }, sel);
    check(!(await shown(".topbar")) && !(await shown("nav.tabbar")), "lesson: full focus, no top bar and no tabs while the lesson plays (W2)");

    // 1. The hook: a guess, then the answer explained.
    check(await ready() === false, "lesson: Continue waits until the step is done");
    await clickL(".lesson-option", /small reed/);
    check(await lp.$(".lesson-reveal.warn") !== null && await ready(), "lesson hook: a wrong guess is explained, and the lesson goes on");
    await next();
    // 2. The parts: one slip, then every part.
    const NAMES = { "The blowing hole": "blow", "The cork end (closed)": "cork", "The open end": "open", "A binding (thread wrap)": "bind" };
    let slip = false;
    for (let i = 0; i < 8; i++) {
      const want = await lp.$eval(".lesson-q b", e => e.textContent);
      const id = NAMES[want] || "h" + /(\d)$/.exec(want)[1];
      if (!slip) { await tapPart(id === "open" ? "cork" : "open"); slip = true; check(/You tapped/.test(await lp.$eval(".lesson-stage", e => e.textContent)), "lesson parts: a wrong part says what was tapped"); }
      await tapPart(id); await sleep(60);
    }
    check(/All found, with one slip/.test(await lp.$eval(".lesson-q", e => e.textContent)) && await ready(), "lesson parts: every part found, the slip counted");
    await next();
    // 3. The holes: a gap leaks; the top three closed is Sa.
    await tapPart("h1"); await tapPart("h3"); await clickL("button", /^Blow$/);
    check(/leaks/.test(await lp.$eval(".lesson-stage .lesson-q", e => e.textContent)) && !(await ready()), "lesson holes: a gap between closed holes is not a note");
    await tapPart("h2"); await clickL("button", /^Blow$/);
    check(await lp.$eval(".lesson-note", e => e.textContent) === "S" && await ready(), "lesson holes: holes 1-3 closed play Sa, and the step is done");
    await next();
    // 4. The flute check: a problem found gets its advice.
    await lp.evaluate(() => { const cards = document.querySelectorAll(".lesson-card"); cards.forEach((c, i) => [...c.querySelectorAll("button")][i === 3 ? 1 : 0].click()); });
    check(/splinter/.test(await lp.$eval(".lesson-card.found", e => e.textContent)) && await ready(), "lesson check: a splinter found gets TS-12's advice");
    // The session's reading for this block, from the step itself: a sheet over the lesson that
    // closes back to the same step.
    const atStep = await title();
    await lp.evaluate(() => document.querySelector(".lesson-stage .lesson-why summary").click());
    await clickL(".lesson-stage .lesson-why .lesson-read", /Your Flute/);
    await lp.waitForSelector("dialog.sheet[open] .sheet-body .reader", { timeout: 8000 }).catch(() => {});
    check(/Your Flute/i.test(await lp.$eval("dialog.sheet[open] .sheet-title", e => e.textContent).catch(() => "")), "lesson: a step's reading (L00) opens in a sheet over the lesson");
    await clickL("dialog.sheet .sheet-head .btn.primary", /Back to the step/);
    await sleep(200);
    check(!(await lp.$("dialog.sheet")) && await title() === atStep && await ready(), "lesson: closing the reading goes back to the same step, still done");
    await next();
    // 5. The side, then holding the flute.
    await clickL(".lesson-choice", /Pointing left/);
    check(await ready(), "lesson: the holding side is chosen");
    await next();
    await clickL("button", /Start 30/); await sleep(800);
    await lp.evaluate(() => document.querySelectorAll(".lesson-stage input[type=checkbox]").forEach(c => c.click()));
    check(await ready(), "lesson hold: the timer, then the three checks");
    await next();
    // 6. The flute finder hears Sa.
    await clickL(".lesson-stage button", /Listen for my Sa/);
    await lp.waitForSelector(".lesson-stage .lv-intro .lv-primary", { timeout: 3000 }).then(b => b.click()).catch(() => {});
    await sleep(300); await tone(523.251);
    check(await lp.evaluate(() => document.querySelector(".lesson").classList.contains("lesson-playing")), "lesson: playing mode while the microphone listens");
    check(await lp.evaluate(() => { const p = document.querySelector(".micpill"); return !!p && !p.hidden; }), "the top bar shows Listening while the microphone is on");
    await lp.waitForFunction(() => [...document.querySelectorAll(".lesson-stage button")].some(b => /Use this for my flute/.test(b.textContent) && !b.hidden), { timeout: 10000 }).catch(() => {});
    await clickL(".lesson-stage button", /Use this for my flute/);
    await tone(0);
    check(await ready(), "lesson finder: the flute's Sa is found (C5) and used");
    await next();
    await lp.waitForFunction(() => !document.querySelector(".lesson").classList.contains("lesson-playing"), { timeout: 3000 }).then(() => check(true, "lesson: playing mode ends when the microphone closes"), () => check(false, "lesson: playing mode ends when the microphone closes"));
    // 7. The drone; 8. the metronome.
    await clickL("button", /Play the drone/); await sleep(4500);
    check(await ready(), "lesson drone: ten seconds of listening (four, in the test) done");
    await next();
    await clickL(".lesson-stage button", /^Start$/);
    await sleep(3500);
    for (let i = 0; i < 8; i++) { await lp.evaluate(() => document.querySelector(".lesson-pad").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))); await sleep(833); }
    await lp.waitForFunction(() => !document.querySelector(".lesson-next").disabled, { timeout: 6000 }).catch(() => {});
    check(/taps/.test(await lp.$eval(".lesson-stage .lesson-q", e => e.textContent)) && await ready(), "lesson metronome: a round of taps is scored");
    await next();
    // 9. The time capsule is recorded into the Journal.
    await tone(523.251);
    await clickL(".lesson-stage button", /Record 6 seconds/);
    await lp.waitForFunction(() => /Saved in your Journal/.test(document.querySelector(".lesson-stage").textContent), { timeout: 12000 }).catch(() => {});
    await tone(0);
    check(await ready(), "lesson: the Day 0 time capsule is recorded");
    await next();
    // 10. Safety: a wrong answer explains; then all four right.
    await clickL(".lesson-option", /deep breaths/);
    check(/over-breathing|breathing out more air/.test(await lp.$eval(".lesson-stage", e => e.textContent)) && !(await ready()), "lesson safety: a wrong answer explains why, and must be put right");
    for (const re of [/Stop, stay seated/, /doctor or physiotherapist/, /In its bag/, /six days/]) { await clickL(".lesson-option", re); await sleep(100); await clickL("button", /Next question/); await sleep(100); }
    check(await ready() && !/null/.test(await lp.$eval(".lesson-stage", e => e.textContent)), "lesson safety: all four answered");
    await next();
    // 11. The practice plan.
    await lp.evaluate(() => document.querySelectorAll(".lesson-chips").forEach(g => g.children[1].click()));
    check(await ready(), "lesson plan: when, how long and where are chosen");
    await next();
    // 12. The reward, then Day 0 is done and M0 passed.
    check(/Setup complete/.test(await title()) && await lp.$$eval(".lesson-done li.ok", l => l.length) === 8, "lesson reward: every item is ticked");
    check(cardsSeen.map(c => c.id).join() === "learn-M,learn-READ,learn-K,learn-E,learn-R" && cardsSeen.every(c => c.ready && c.text.length > 20),
      "one day: the session's five blocks come as cards in the lesson, each ready at once (" + cardsSeen.map(c => c.id).join() + ")");
    check(/Complete M0/.test(await lp.$eval(".lesson-stage .lesson-goal", e => e.textContent).catch(() => "")), "one day: the reward shows the day's pass check");
    check(await lp.evaluate(() => { const ey = [...document.querySelectorAll(".lesson-stage .eyebrow")].map(e => e.textContent); const w = ey.indexOf("What went well"), t = ey.findIndex(x => /Tomorrow/.test(x)); return w >= 0 && t > w && !/XP/.test(document.querySelector(".lesson-stage").textContent); }), "lesson reward: what went well first, tomorrow after, no points on the reward");
    await clickL(".lesson-next", /Finish Day 0/);
    await lp.waitForSelector(".lesson-end", { timeout: 5000 }).catch(() => {});
    check(await shown(".topbar") && /XP today/.test(await lp.$eval(".lesson-end", e => e.textContent).catch(() => "")), "lesson end: the top bar is back, and the points come last, quietly");
    const st = await lp.evaluate(() => JSON.parse(localStorage.getItem("bansuri.progress")));
    check(st.current === 1 && st.milestones.M0.status === "passed" && st.days[0].done, "lesson: finishing passes M0 and opens Day 1");
    check(/Holding side: left/.test(st.log.map(l => l.note).join(" ")), "lesson: the choices are written in the practice log");
    check(/Day 1 is open/.test(await lp.$eval(".lesson-end", e => e.textContent)), "lesson: the end screen says Day 1 is open");
    await lp.goto(BASE + "#/today", { waitUntil: "networkidle0" }); await sleep(300);
    check(!(await lp.$('#main a[href="#/lesson/m0"]')), "Today (Day 1) no longer offers the Day 0 lesson");
    // Hindi: the cover and the first step.
    await lp.evaluate(() => localStorage.setItem("bansuri.settings", JSON.stringify({ countdown: 0, lang: "hi" })));
    await lp.goto(BASE + "#/lesson/m0", { waitUntil: "networkidle0" });
    await lp.reload({ waitUntil: "networkidle0" });
    await lp.waitForSelector("#main .lesson-cover"); await sleep(300);
    check(await lp.evaluate(() => /[\u0900-\u097F]/.test(document.querySelector("#main h1").textContent) && [...document.querySelectorAll("#main .lesson-cover button, #main .lesson-cover a")].every(b => /[\u0900-\u097F]/.test(b.textContent))), "hindi: the lesson cover is in Hindi");
    await lp.evaluate(() => document.querySelector("#main .lesson-cover .btn.primary").click());
    await lp.waitForSelector(".lesson-title"); await sleep(300);
    check(await lp.evaluate(() => [...document.querySelectorAll(".lesson-title, .lesson-q, .lesson-option")].every(e => /[\u0900-\u097F]/.test(e.textContent))), "hindi: the lesson's first step is in Hindi");
    await ctx.close();
  });
  await section("Result after an attempt", async () => {
    // Redesign L4c: a missed phrase keeps its result (the note that broke, in amber, Half speed
    // beside Hear it); after two misses the step offers the fitting guide in a sheet, and a skip.
    const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
    const lp = await ctx.newPage();
    lp.on("pageerror", e => errors.push("pageerror: " + e.message));
    await lp.evaluateOnNewDocument(() => {
      const voices = []; let current = 0;
      const apply = (v, hz) => { const t = v.c.currentTime; if (hz) { v.o.frequency.setValueAtTime(hz, t); v.g.gain.setTargetAtTime(0.4, t, 0.005); } else v.g.gain.setTargetAtTime(0, t, 0.005); };
      window.__tone = hz => { current = hz; voices.forEach(v => apply(v, hz)); };
      navigator.mediaDevices.getUserMedia = async () => { const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(), d = c.createMediaStreamDestination(); o.type = "triangle"; g.gain.value = 0; o.connect(g); g.connect(d); o.start(); const v = { c, o, g, stream: d.stream }; voices.push(v); apply(v, current); return d.stream; };
      window.__lessonTime = 0.05;
    });
    const tone = hz => lp.evaluate(f => window.__tone(f), hz);
    const hz = n => 523.251 * Math.pow(2, n / 12);
    await lp.goto(BASE + "#/today", { waitUntil: "networkidle0" });
    // Day 9's lesson, resumed at its phrase step (S G S G S).
    const at = await lp.evaluate(async () => {
      const u = p => import(new URL("app/js/" + p, location.href).href);
      const [{ LESSONS }, OD, C, P] = await Promise.all([u("lessons/index.js"), u("lessons/oneday.js"), u("course.js"), u("lesson/player.js")]);
      const days = {}; for (let i = 0; i < 9; i++) days[i] = { done: true };
      localStorage.setItem("bansuri.settings", JSON.stringify({ countdown: 0 }));
      localStorage.setItem("bansuri.progress", JSON.stringify({ current: 9, startedAt: "2026-01-01", days, milestones: { M0: { status: "passed", attempts: [] } }, prefs: { howChosen: true } }));
      const i = P.flatSteps(OD.oneDay(LESSONS.m9, C.getDay(9))).findIndex(s => s.id === "sgsg");
      localStorage.setItem("bansuri.lessons", JSON.stringify({ m0: { at: 0, done: "2026-01-01", data: { side: "right" } }, m9: { at: i, data: {}, done: null } }));
      return i;
    });
    await lp.goto(BASE + "#/lesson/m9", { waitUntil: "networkidle0" }); await lp.reload({ waitUntil: "networkidle0" });
    await lp.waitForSelector("#main .lesson-cover .btn.primary");
    await lp.evaluate(() => document.querySelector("#main .lesson-cover .btn.primary").click());
    await lp.waitForSelector('.lesson-stage[data-step="sgsg"]', { timeout: 5000 }).catch(() => {});
    check(at > 0 && await lp.$('.lesson-stage[data-step="sgsg"]') !== null && await lp.$(".lesson-trouble:not([hidden])") === null, "result: the phrase step opens with no help offered yet");
    await lp.evaluate(() => document.querySelector(".lesson-stage .lv-primary").click());
    await sleep(150); await lp.evaluate(() => { const b = document.querySelector(".lesson-stage .lv-intro .lv-primary"); if (b) b.click(); }); await sleep(400);
    // Two passes with the second note wrong (R for G).
    for (let rep = 0; rep < 2; rep++) { for (const n of [0, 2, 0, 4, 0]) { await tone(hz(n)); await sleep(650); await tone(0); await sleep(180); } await sleep(900); }
    const res = await lp.evaluate(() => ({ wrong: document.querySelectorAll(".lesson-stage .lv-slot.lv-wrong").length, color: (() => { const e = document.querySelector(".lesson-stage .lv-slot.lv-wrong"); return e ? getComputedStyle(e).borderTopColor : ""; })(), warn: getComputedStyle(document.documentElement).getPropertyValue("--warn").trim(), msg: document.querySelector(".lesson-stage .lv-msg").textContent, slow: !!document.querySelector(".lesson-stage .lv-btn:not([hidden])") && [...document.querySelectorAll(".lesson-stage .lv-btn")].some(b => b.textContent === "Half speed" && !b.hidden), trouble: document.querySelector(".lesson-trouble") && !document.querySelector(".lesson-trouble").hidden ? document.querySelector(".lesson-trouble").textContent : "" }));
    check(res.wrong >= 1 && /slipped/.test(res.msg) && res.slow, "result: the note that broke stays marked, named, with Half speed beside Hear it [" + res.msg + "]");
    check(/Having trouble\?/.test(res.trouble) && /Skip for now/.test(res.trouble), "result: after two misses, Having trouble? and Skip for now [" + res.trouble + "]");
    await lp.evaluate(() => [...document.querySelectorAll(".lesson-trouble button")].find(b => /Having trouble/.test(b.textContent)).click());
    await lp.waitForFunction(() => { const d = document.querySelector("dialog.sheet[open]"); return d && /TS-0\d/.test(d.textContent); }, { timeout: 5000 }).then(() => check(true, "result: Having trouble? opens the fitting guide over the lesson"), () => check(false, "result: Having trouble? opens the fitting guide over the lesson"));
    await lp.evaluate(() => [...document.querySelectorAll("dialog.sheet[open] button")].find(b => /Back to the step/.test(b.textContent)).click());
    await sleep(200);
    await lp.evaluate(() => [...document.querySelectorAll(".lesson-trouble button")].find(b => /Skip for now/.test(b.textContent)).click());
    await sleep(300);
    check(await lp.evaluate(() => document.querySelector(".lesson-stage").dataset.step !== "sgsg" && JSON.parse(localStorage.getItem("bansuri.lessons")).m9.data.sgsg.skipped === true), "result: Skip for now goes on, and the step is remembered as skipped");
    await tone(0); await ctx.close();
  });
  await section("Course: path, one cover per day, milestone, book, quiz, inside a step", async () => {
    // docs/redesign 05 L2-L8: the unit as a path, #/day/N and the cover as one, the milestone cover,
    // the course book, the quiz's marks, and the chapter strip, drone switch and why-Continue-waits.
    const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
    const lp = await ctx.newPage();
    lp.on("pageerror", e => errors.push("pageerror: " + e.message));
    const lgo = async hash => { await lp.goto(BASE + "#" + hash, { waitUntil: "networkidle0" }); await lp.waitForFunction(() => { const m = document.querySelector("#main"); return m && m.children.length && !m.querySelector(":scope > .boot"); }, { timeout: 10000 }).catch(() => {}); await sleep(400); };
    const learner = (cur, lessons) => lp.evaluate((cur, lessons) => {
      localStorage.clear();
      localStorage.setItem("bansuri.settings", JSON.stringify({ countdown: 0 }));
      const ms = {}; ["M0", "M1", "M2", "M3", "M4", "M5", "M6", "M7"].forEach(m => { ms[m] = { status: "passed", passedOn: "2026-06-01", attempts: [] }; });
      localStorage.setItem("bansuri.progress", JSON.stringify({ current: cur, startedAt: "2025-11-01", prefs: { howChosen: true }, milestones: ms }));
      localStorage.setItem("bansuri.lessons", JSON.stringify(Object.assign({ m0: { at: 0, done: "2025-11-01", data: { side: "right" } }, p315: { at: 0, done: "2026-09-01", data: { quiz: { firstTry: 5, of: 6 } } } }, lessons || {})));
    }, cur, lessons || null);
    await lgo("/today"); await learner(330);
    await lgo("/course"); await lp.reload({ waitUntil: "networkidle0" }); await sleep(400);
    const path = await lp.evaluate(() => ({ today: !!document.querySelector("#main .coursepath .cpnode.today"), cont: (document.querySelector("#main .cpunit .btn.primary") || {}).getAttribute?.("href"),
      folds: document.querySelectorAll("#main .cprun details").length, at: /day \d+ of \d+/.test(document.querySelector("#main .cpunit").textContent), text: document.querySelector("#main .coursepath").textContent }));
    check(path.today && path.at && path.folds >= 1, "course path: today's unit, with day N of M, today's node and folded runs of days");
    check(path.cont === "#/lesson/p330", "course path: Continue opens the day's lesson (" + path.cont + ")");
    check(/quiz 5\/6/.test(path.text), "course path: a review day shows its quiz score");
    const cover = await lp.evaluate(async () => {
      const { units } = await import(new URL("app/js/views/plan.js", location.href).href);
      const { getPlan } = await import(new URL("app/js/course.js", location.href).href);
      const list = units(getPlan()); let next = 0, ok = true;
      for (const u of list) { if (u.from !== next) ok = false; next = u.to + 1; }
      return ok && next === getPlan().days.length && list.length > 10;
    });
    check(cover, "course path: the units cover every day of the plan, in order");
    await lgo("/course#phases");
    check(await lp.$$eval("#main details.phasebox", x => x.length) === 6 && await lp.$$eval("#main .cpunits a[href^='#/course#u']", x => x.length) > 10, "course: All phases lists every phase with its units");
    await lgo("/day/330");
    check(await lp.evaluate(() => location.hash) === "#/lesson/p330" && !!(await lp.$("#main .lesson-cover .backlink[href='#/course']")) && /Talk me through/.test(await lp.$eval("#main .lesson-cover", e => e.textContent)), "day: #/day/N opens the lesson cover, with a Course back link and Talk me through");
    await lgo("/day/14");
    check(await lp.evaluate(() => location.hash) === "#/milestone/M1", "day: a test day opens its milestone");
    await lgo("/day/345");
    check(/Opens after Day 344/.test(await lp.$eval("#main .lesson-cover", e => e.textContent)) && !(await lp.$("#main .lesson-cover .btn.primary")), "day: a future day shows its cover, with when it opens instead of Start");
    // Part done: opening the day goes to the step; closing comes back to the cover.
    await learner(330, { p330: { at: 3, data: {}, done: null } });
    await lgo("/day/330"); await lp.reload({ waitUntil: "networkidle0" }); await sleep(500);
    check(/#resume$/.test(await lp.evaluate(() => location.hash)) && !!(await lp.$(".lesson-stage")), "day: a part-done lesson opens straight at its step");
    check(await lp.$eval(".lesson-chaps li[aria-current=step]", e => e.textContent.trim()).catch(() => "") !== "" && /^\d+ \/ \d+$/.test(await lp.$eval(".lesson-count", e => e.textContent)), "step: numbered chapters with the current one marked, and the step count");
    await lp.evaluate(() => document.querySelector(".lesson-close").click()); await sleep(300);
    check(!!(await lp.$("#main .lesson-cover")) && /You stopped at step 4/.test(await lp.$eval("#main .lesson-cover", e => e.textContent)), "step: closing the player comes back to the cover, the place kept");
    // A long-tone step: the drone switch, the word element, and why Continue waits.
    const i = await lp.evaluate(async () => {
      const u = q => import(new URL("app/js/" + q, location.href).href);
      const [PR, OD, C, P] = await Promise.all([u("lessons/practice.js"), u("lessons/oneday.js"), u("course.js"), u("lesson/player.js")]);
      return P.flatSteps(OD.oneDay(PR.practiceLesson("p330"), C.getDay(330))).findIndex(s => s.kind === "hold");
    });
    await learner(330, { p330: { at: i, data: {}, done: null } });
    await lgo("/day/330"); await lp.reload({ waitUntil: "networkidle0" }); await sleep(500);
    check(await lp.$eval(".lesson-stage", e => e.dataset.kind) === "hold" && !!(await lp.$(".lesson-tools:not([hidden]) .lesson-drone input")) && await lp.$$eval(".lesson-stage .lv-dronebox", x => x.filter(e => getComputedStyle(e).display !== "none").length) === 0, "step: one Drone switch on a step that plays");
    await lp.evaluate(() => document.querySelector(".lesson-drone input").click()); await sleep(200);
    check(await lp.evaluate(() => localStorage.getItem("bansuri.lessons.drone")) === "true", "step: the drone switch is remembered");
    await lp.evaluate(() => document.querySelector(".lesson-drone input").click());
    check(await lp.$eval(".lesson-stage .lv-hold .lv-word", e => getComputedStyle(e).display === "none").catch(() => false), "step: the one word waits for playing mode");
    await lp.evaluate(() => document.querySelector(".lesson-nextwhy").click()); await sleep(150);
    check(/^Finish the step first: play it/.test(await lp.$eval(".lesson-whymsg", e => e.hidden ? "" : e.textContent)), "step: a tap on the waiting Continue says why, in one line");
    // A review day's quiz: a symbol and a word on each answer, amber for a wrong one.
    await learner(336);
    await lgo("/lesson/p336"); await lp.reload({ waitUntil: "networkidle0" }); await sleep(400);
    await lp.evaluate(() => document.querySelector("#main .lesson-cover .btn.primary").click()); await sleep(400);
    const q = await lp.evaluate(() => {
      const opts = [...document.querySelectorAll(".lesson-option")];
      for (const o of opts) { o.click(); if (o.classList.contains("right")) break; }
      const w = document.querySelector(".lesson-option.wrong"), r = document.querySelector(".lesson-option.right");
      return { right: r ? r.querySelector(".lesson-optmark").textContent + (r.querySelector(".lesson-optmark svg") ? "+icon" : "") : "", wrong: w ? w.querySelector(".lesson-optmark").textContent : "none",
        amber: w ? getComputedStyle(w).borderTopColor === getComputedStyle(document.querySelector(".lesson-optmark") ? w.querySelector(".lesson-optmark") : w).color : true };
    });
    check(q.right === "Right+icon" && (q.wrong === "none" || (q.wrong === "Not this one" && q.amber)), "quiz: the right answer has a tick and a word, a wrong one an amber cross and a word [" + q.right + ", " + q.wrong + "]");
    // The milestone cover (L7), then Not yet leading with what passed.
    await learner(434);
    await lgo("/milestone/M8"); await lp.reload({ waitUntil: "networkidle0" }); await sleep(500);
    check(await lp.evaluate(() => { const h = [...document.querySelectorAll("#main .ms-cover h2")].map(e => e.textContent); return h[0] === "What is checked" && h[1] === "How to take it"; }) && /Take the test/.test(await lp.$eval("#main .ms-ways", e => e.textContent)) && /Rehearse first/.test(await lp.$eval("#main .ms-ways", e => e.textContent)), "milestone: what is checked, then how to take it, then Take the test beside Rehearse first");
    await clickTextOn(lp, "#main button", "Take the test"); await sleep(200);
    await lp.evaluate(() => document.querySelector("#main .mitem input[type=checkbox]").click());
    await clickTextOn(lp, "#main button", "Save this attempt"); await sleep(400);
    check(/Passed 1 of 7/.test(await lp.$eval("#main .ms-test", e => e.textContent)) && !!(await lp.$("#main .ms-notyet")), "milestone: Not yet shows what passed, then what is for next time");
    // The course book (L8).
    await lgo("/course/book");
    const book = await lp.evaluate(() => ({ parts: [...document.querySelectorAll("#main .bookpart")].map(e => e.textContent).join("|"), ragas: !!document.querySelector('#main a[href="#/music/ragas"]'), fix: !!document.querySelector('#main a[href="#/skills/fix"]'), copies: [...document.querySelectorAll("#main h3")].some(e => /^(Ragas|Troubleshooting)$/.test(e.textContent)) }));
    check(book.parts === "The course|Look it up|Elsewhere" && book.ragas && book.fix && !book.copies, "book: The course, Look it up, Elsewhere; ragas and fixes linked, not copied");
    await lgo("/read/lessons/L04-first-sound.md");
    check(await lp.$eval("#main .crumbs a", e => e.textContent + " " + e.getAttribute("href")) === "Course book #/course/book", "book: the reader's breadcrumb says Course book");
    await ctx.close();
  });
  await section("Me: progress, journal, teacher, flute, settings", async () => {
    await go("/today");
    const saved = await page.evaluate(() => ({ p: localStorage.getItem("bansuri.progress"), s: localStorage.getItem("bansuri.settings") }));
    await page.evaluate(() => {
      const t = new Date(), d = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
      localStorage.setItem("bansuri.progress", JSON.stringify({ current: 20, startedAt: "2026-09-20", prefs: { howChosen: true, pace: "short" }, log: [{ date: d, minutes: 30, day: 19 }],
        live: { holds: { "4": [{ d, s: 2.4 }] }, echo: { lv1: { label: "Level 1", best: 2, len: 2, right: 1, total: 6, d } }, taps: [], plays: [{ d, piece: "Morning Steps", bpm: 60, ok: 4, n: 10, onTime: 3, timed: 10 }] } }));
      localStorage.removeItem("bansuri.settings");
    });
    await page.reload({ waitUntil: "networkidle0" });
    // Progress: five questions, doors to the capsule, the course path, one level row, your flute.
    await go("/me");
    const me = await page.evaluate(() => ({ capsule: !!document.querySelector("#main a[href='#/me/journal/capsule']"), path: !!document.querySelector("#main a.courselink[href='#/course']"),
      level: (document.querySelector("#main a.hubrow[href='#/me/level']") || {}).innerText || "", flute: (document.querySelector("#main a.hubrow[href='#/me/flute']") || {}).innerText || "",
      moved: !document.querySelector("#sh-name") && !/Teacher reviews/.test(document.querySelector("#main").innerText), levels: document.querySelectorAll("#main .levelrow").length }));
    check(me.capsule && me.path && /Level 1/.test(me.level) && /badge/.test(me.level) && /C natural/.test(me.flute) && /Sa C5/.test(me.flute) && me.moved && !me.levels,
      "me: Day 0 vs today, Where am I to the path, one Level and badges row, Your flute with its Sa; reviews and sharing moved out " + JSON.stringify(me));
    // What should I work on? opens the skill's tab.
    for (const [label, want] of [["Long tones", "#/skills/tone"], ["Notes and tuning", "#/skills/notes"], ["Play back", "#/skills/ear"]]) {
      await go("/me");
      await clickText("#main .weakcard button", label);
      await page.waitForFunction(w => location.hash === w, { timeout: 3000 }, want).catch(() => {});
      check(await page.evaluate(() => location.hash) === want, "me: work on \"" + label + "\" opens " + want);
    }
    await go("/me/level");
    check(await page.$("#level .levelrow") !== null && await page.$("#main .badges") !== null, "me: the level row opens the full level and badges");
    // Journal: three views as a segmented control (level 3), Log extra practice at the end of Days.
    await go("/me/journal");
    const j = await page.evaluate(() => ({ seg: [...document.querySelectorAll("#main .segnav a")].map(a => a.textContent + (a.getAttribute("aria-current") ? "*" : "")).join(), tab: (document.querySelector("#main .sectiontabs [aria-current=page]") || {}).textContent,
      last: ([...document.querySelectorAll("#main .page > section.card")].pop() || {}).id, record: !!document.querySelector("#j-label") }));
    check(j.seg === "Days*,Recordings,Capsule" && j.tab === "Journal" && j.last === "log" && !j.record, "journal: Days, Recordings and Capsule as one segmented control; Days ends with Log extra practice " + JSON.stringify(j));
    await go("/me/journal/capsule");
    check(/no time capsule yet/.test(await text()), "journal: the Capsule view says when there is no time capsule yet");
    await page.evaluate(async () => {
      const r = await import(new URL("app/js/recorder.js", location.href).href);
      const blob = new Blob([new Uint8Array(64)], { type: "audio/webm" });
      await r.saveRecording({ id: "smokecap", created: "2026-01-01T10:00:00.000Z", date: "2026-01-01", day: 0, label: "Day 0 time capsule", mime: "audio/webm", blob, durationS: 6, kind: "audio" }, { count: false });
      await r.saveRecording({ id: "smokenow", created: new Date().toISOString(), date: "2026-11-01", day: 20, label: "Long Sa", mime: "audio/webm", blob, durationS: 9, kind: "audio" }, { count: false });
    });
    await go("/me/journal");
    await go("/me/journal/capsule");
    check(await page.$$eval("#main .capsulepair .capsulecol audio", a => a.length) === 2 && /day 0/.test(await text()), "journal: the Capsule view plays the Day 0 time capsule next to the newest recording");
    await page.evaluate(async () => { const r = await import(new URL("app/js/recorder.js", location.href).href); await r.deleteRecording("smokecap"); await r.deleteRecording("smokenow"); });
    // Teacher: Ask, Feedback, Students, Share progress.
    for (const [route, cur, needle] of [["/me/teacher", "Ask", "what to review"], ["/me/teacher/feedback", "Feedback", "feedback from your teacher"], ["/students", "Students", "my students"], ["/me/teacher/share", "Share progress", "for my teacher"]]) {
      await go(route);
      const seg = await page.evaluate(() => ({ cur: (document.querySelector("#main .segnav [aria-current=page]") || {}).textContent, n: document.querySelectorAll("#main .segnav a").length, tab: (document.querySelector("#main .sectiontabs [aria-current=page]") || {}).textContent }));
      check(seg.cur === cur && seg.n === 4 && seg.tab === "Teacher" && (await text()).includes(needle), "teacher: " + route + " opens the " + cur + " view " + JSON.stringify(seg));
    }
    // Flute: Check my flute first among the checks; the microphone-blocked message links here.
    await go("/me/flute");
    check(await page.evaluate(() => { const hd = document.querySelector("#g-checks"); const next = hd && hd.nextElementSibling; const first = next && next.querySelector("a.hubrow"); return !!first && first.getAttribute("href") === "#/me/flute/check"; }), "flute: Check my flute is the first check");
    await go("/bench/tones");
    await page.evaluate(() => { localStorage.setItem("bansuri.live.micIntro", "1"); navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError")); });
    await page.evaluate(() => document.querySelector("#main .lv-hold .lv-primary").click());
    await page.waitForSelector("#main .lv-msg a[href='#/me/flute#g-checks']", { timeout: 5000 }).then(() => check(true, "flute: a blocked microphone links to Me > Flute"), async () => check(false, "flute: a blocked microphone links to Me > Flute [" + await page.$eval("#main .lv-hold .lv-msg", e => e.innerText).catch(() => "") + "]"));
    // Settings: a Me tab (no gear), five groups showing their values, groups and privacy at their own addresses.
    await go("/me/settings");
    const st = await page.evaluate(() => ({ gear: !!document.querySelector(".topbar a[href*='settings']"), rows: [...document.querySelectorAll("#main .settingsgroups .hubrow")].map(r => r.innerText.replace(/\s+/g, " ")) }));
    check(!st.gear && st.rows.length === 5 && /English/.test(st.rows[0]) && /Talk to me: off/.test(st.rows[0]) && /25-35 min a day/.test(st.rows[2]) && /No reminder/.test(st.rows[2]) && /^Help and about/.test(st.rows[4]),
      "settings: no gear in the top bar; five groups, each with its current values " + JSON.stringify(st));
    await go("/me/settings/data");
    check(/download backup/.test(await text()) && /start over/.test(await text()) && !/problem report/.test(await text()), "settings: Your data opens at #/me/settings/data");
    await go("/me/settings/help");
    check(/pilot study/.test(await text()) && await page.$("#main a[href='#/me/privacy']") !== null, "settings: Pilot study and Privacy are under Help and about");
    await go("/settings");
    await page.goto(BASE + "#/settings#countdown", { waitUntil: "networkidle0" }); await sleep(300);
    check(await page.$("#main #countdown") !== null && await page.$("#main #st-placetest") !== null, "settings: an old link to a card (#/settings#countdown) opens its group");
    await go("/me/privacy");
    check(/everything stays on your device/i.test(await text()) && await page.$eval("nav.tabbar [aria-current=page]", e => e.textContent.trim()).catch(() => "") === "Me", "settings: #/me/privacy opens Privacy under Me");
    await page.evaluate(v => { if (v.p) localStorage.setItem("bansuri.progress", v.p); else localStorage.removeItem("bansuri.progress"); if (v.s) localStorage.setItem("bansuri.settings", v.s); else localStorage.removeItem("bansuri.settings"); }, saved);
    await page.reload({ waitUntil: "networkidle0" });
  });
  // Skills and Music (redesign 06 and 07): each tool on its own screen, the hubs' measures, Fix a
  // problem in groups, the games list and a game in full focus, songs, a song, ragas and a raga.
  const seedSkills = async () => {
    await page.evaluate(() => {
      const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
      localStorage.setItem("bansuri.progress", JSON.stringify({ v: 1, current: 230, startedAt: day(30), live: {
        holds: { "0": [{ d: day(6), s: 6 }, { d: day(4), s: 9 }, { d: day(2), s: 14 }, { d: day(1), s: 11 }] }, taps: [], echo: {},
        plays: [{ d: day(1), piece: "1.1 Morning Steps", ok: 8, n: 10, onTime: 7, timed: 10, bpm: 60 }] }, ear: { "2": { right: 8, total: 10 } } }));
      localStorage.setItem("bansuri.game.balloon.best.srg", "7");
      localStorage.removeItem("bansuri.game.boat.best");
      localStorage.setItem("bansuri.mysongs", JSON.stringify([{ id: "mysmoke", title: "Smoke bhajan", notation: "S R G - | G R S -", bpm: 70, added: day(1) }]));
      localStorage.setItem("bansuri.coach.history", JSON.stringify([{ d: day(3), ts: "TS-02", symptom: "Squeaks / note jumps up an octave", helped: true }]));
      localStorage.removeItem("bansuri.songs.last");
    });
    await page.reload({ waitUntil: "networkidle0" });
  };
  await section("Skills: tools on their own screens, hubs, fix, games", async () => {
    await seedSkills();
    await go("/skills/tone");
    const hub = await page.evaluate(() => ({
      hist: (document.querySelector("#main .hubhist") || {}).innerText || "",
      main: (document.querySelector("#main .hubmain") || {}).getAttribute?.("href"),
      best: [...document.querySelectorAll("#main a.hubrow")].find(a => a.getAttribute("href") === "#/skills/game/balloon")?.innerText || "",
      boat: [...document.querySelectorAll("#main a.hubrow")].find(a => a.getAttribute("href") === "#/skills/game/boat")?.innerText || "",
      fix: !!document.querySelector("#main a.hubrow[href='#/skills/fix/TS-02/tone']"),
    }));
    check(/6 s/.test(hub.hist) && /14 s \(best\)/.test(hub.hist) && hub.main === "#/skills/tone/longtones", "tone hub: your latest shows the last holds with the best marked, Long tones is the one main tool [" + hub.hist.replace(/\n/g, " ") + "]");
    check(/best 7/.test(hub.best) && /new/.test(hub.boat) && hub.fix, "tone hub: games show their best or new, fixes link back to the hub");
    await go("/skills/tone/longtones");
    const tool = await page.evaluate(() => ({ back: (document.querySelector("#main .backhead .backlink") || {}).getAttribute?.("href"), sw: document.querySelectorAll("#main .toolswitch a").length,
      hold: !!document.querySelector("#main .lv-hold"), tabs: !!document.querySelector("#main .sectiontabs"), bench: /Practice Bench/.test(document.querySelector("#main").innerText) }));
    check(tool.back === "#/skills/tone" && tool.sw === 2 && tool.hold && !tool.tabs && !tool.bench, "long tones: its own screen with a back link to Tone and breath, the Long tones / Tone check switch, the meter, no Practice Bench " + JSON.stringify(tool));
    await page.evaluate(() => document.dispatchEvent(new CustomEvent("bansuri:mic", { detail: { on: true } })));
    const playing = await page.evaluate(() => document.querySelector("#main .toolpage").classList.contains("playmode"));
    await page.evaluate(() => document.dispatchEvent(new CustomEvent("bansuri:mic", { detail: { on: false } })));
    check(playing && !(await page.evaluate(() => document.querySelector("#main .toolpage").classList.contains("playmode"))), "long tones: playing mode (the shared class) while the microphone listens");
    // The note as chips (W46): they drive the Bench's hidden list, which remembers the note, so the
    // note Progress's "Work on these" sets before opening shows picked. The Bench keeps its list.
    const pickedChip = () => page.evaluate(() => ({ n: document.querySelectorAll("#main .tonechips button").length, hidden: !!document.querySelector("#main [data-ref=toneNote]")?.closest(".bb-field").hidden, sel: document.querySelector("#main [data-ref=toneNote]")?.value, picked: [...document.querySelectorAll("#main .tonechips [aria-pressed=true]")].map(b => b.dataset.v).join() }));
    await clickText("#main .tonechips button", "R");
    const chipA = await pickedChip(), stored = await page.evaluate(() => localStorage.getItem("bansuri.bench.live.toneNote"));
    await go("/skills/tone");
    await page.evaluate(() => localStorage.setItem("bansuri.bench.live.toneNote", JSON.stringify("4")));
    await go("/skills/tone/longtones");
    const chipB = await pickedChip();
    await go("/bench");
    const benchList = await page.evaluate(() => !document.querySelector("#main .tonechips") && !!document.querySelector("#main [data-ref=toneNote]") && !document.querySelector("#main [data-ref=toneNote]").closest(".bb-field").hidden);
    await page.evaluate(() => localStorage.removeItem("bansuri.bench.live.toneNote"));
    check(chipA.n === 12 && chipA.hidden && chipA.sel === "2" && chipA.picked === "2" && stored === "\"2\"" && chipB.picked === "4" && chipB.sel === "4" && benchList, "long tones: note chips in place of the list, remembered, a preset note shows picked; the Bench keeps its list " + JSON.stringify([chipA, chipB, benchList]));
    for (const [route, sel, what] of [["/skills/tone/check", "#tone", "tone check"], ["/skills/rhythm/tap", ".lv-pad", "tap the beat"], ["/skills/ornaments/trainer", ".ornTabs", "ornament trainer"], ["/skills/ear/quiz", ".bb-bench [data-ref=earNext]", "ear quiz"], ["/skills/ear/playback", ".lv-echo", "play it back"]]) {
      await go(route);
      check(!!(await page.$("#main " + sel)) && !!(await page.$("#main .backhead")), what + ": opens on its own screen (" + route + ")");
    }
    await go("/skills/notes");
    await clickText("#main button.hubmain", "Tuner");
    await page.waitForSelector(".dock:not([hidden]) .bb-bench", { timeout: 8000 }).catch(() => {});
    check(await page.evaluate(() => !document.querySelector(".dock").hidden && document.querySelector(".dock .bb-tabs [aria-selected=true]")?.dataset.tab === "check"), "notes hub: the tuner opens in the Flute dock");
    await page.keyboard.press("Escape");
    await go("/skills/fix");
    const fix = await page.evaluate(() => ({ heads: [...document.querySelectorAll("#main .symhead")].map(x => x.textContent.trim()), last: [...document.querySelectorAll("#main .page > *")].pop().innerText, eyebrow: document.querySelector("#main .hero .eyebrow").textContent }));
    check(fix.heads.join() === "Sound,Fingers and body,Musicianship,The flute" && /^What you worked on/.test(fix.last) && fix.eyebrow === "Fix a problem", "fix: symptoms in four groups, what you worked on last, named Fix a problem [" + fix.heads.join(", ") + "]");
    await go("/skills/fix/TS-02/tone");
    await page.waitForSelector("#main .fixback", { timeout: 8000 }).catch(() => {});
    check(await page.evaluate(() => { const a = document.querySelector("#main .fixback"); return !!a && a.getAttribute("href") === "#/skills/tone" && a.textContent === "Back to Tone and breath"; }), "a fix opened from a hub links back to it");
    await go("/skills/games");
    await clickText("#main .gamefilter button", "No microphone");
    const noMic = await page.$$eval("#main .gamecard", x => x.map(e => e.dataset.game).sort().join());
    check(noMic === "bingo,higherlower,nameorn,sam,wrong", "games: No microphone keeps the games played by ear or by tapping [" + noMic + "]");
    await clickText("#main .gamefilter button", "All");
    await go("/skills/tone");
    await page.click("#main a.hubrow[href='#/skills/game/balloon']");
    await page.waitForSelector("#main .game-card:not([hidden]) .game", { timeout: 8000 }).catch(() => {});
    check(await page.evaluate(() => location.hash === "#/skills/game/balloon" && document.documentElement.classList.contains("fullfocus") && getComputedStyle(document.querySelector("nav.tabbar")).display === "none"), "a game has its address under Skills and plays full focus");
    await page.evaluate(() => [...document.querySelectorAll("#main .game-card button")].find(b => b.textContent.trim() === "Close").click());
    await page.waitForFunction(() => location.hash === "#/skills/tone", { timeout: 5000 }).catch(() => {});
    check(await page.evaluate(() => location.hash === "#/skills/tone" && !document.documentElement.classList.contains("fullfocus")), "closing a game opened from a hub returns to the hub, out of full focus");
  });
  await section("Music: songs, a song, ragas, a raga, listen", async () => {
    await seedSkills();
    await go("/music");
    await page.waitForFunction(() => /open/.test(document.querySelector("#main .hubgroup")?.innerText || ""), { timeout: 8000 }).catch(() => {});
    const top = await page.evaluate(() => ({ carry: (document.querySelector("#main .carryon") || {}).innerText || "", counts: document.querySelector("#main .hubgroup").innerText }));
    check(/Morning Steps/.test(top.carry) && /ready now/.test(top.counts) && /\d+ open/.test(top.counts) && /saved/.test(top.counts), "songs: Carry on with the last song played, then counted rows [" + top.counts.replace(/\n/g, " ") + "]");
    await clickText("#main .songfilter button", "Mine");
    check((await page.$$eval("#main .songrow", x => x.map(e => e.innerText))).join("|").includes("Smoke bhajan"), "songs: Mine keeps the songs made from recordings");
    await go("/music/song/1.1");
    const song = await page.evaluate(() => ({ hear: [...document.querySelectorAll("#main button")].some(b => /Hear it/.test(b.textContent)), bpm: !!document.querySelector("#main .songbpm input"), drone: !!document.getElementById("song-drone"), taal: !!document.getElementById("song-taal"),
      game: (document.querySelector("#main a[href^='#/skills/game/falling/']") || {}).getAttribute?.("href"), back: (document.querySelector("#main .backlink") || {}).getAttribute?.("href") }));
    check(song.hear && song.bpm && song.drone && song.taal && song.game === "#/skills/game/falling/1.1" && song.back === "#/music", "a song: Hear it, BPM, drone and taal, and Falling notes with this song " + JSON.stringify(song));
    await page.click("#main a[href='#/skills/game/falling/1.1']");
    await page.waitForSelector("#main .game-card:not([hidden]) select", { timeout: 8000 }).catch(() => {});
    check(/^1\.1 /.test(await page.$eval("#main .game-card select", s => s.selectedOptions[0].textContent).catch(() => "")), "Falling notes opens on the song it came from");
    await page.evaluate(() => [...document.querySelectorAll("#main .game-card button")].find(b => b.textContent.trim() === "Close").click());
    await page.waitForFunction(() => location.hash === "#/music/song/1.1", { timeout: 5000 }).catch(() => {});
    check(await page.evaluate(() => location.hash) === "#/music/song/1.1", "closing the game returns to the song");
    await go("/music/ragas");
    await page.waitForSelector("#main .ragarow", { timeout: 8000 }).catch(() => {});
    const st = await page.$$eval("#main .ragarow .chip", x => x.map(e => e.textContent));
    check(st.length >= 14 && st.includes("open") && st.some(s => /^after L\d\d$/.test(s)), "ragas: each raga is open or after its lesson [" + st.join(", ") + "]");
    await go("/music/raga/khamaj");
    await page.waitForSelector("#main .ragascale", { timeout: 8000 }).catch(() => {});
    const about = await page.evaluate(() => ({ dt: [...document.querySelectorAll("#main .ragascale dt")].map(x => x.textContent).join(), hear: [...document.querySelectorAll("#main button")].some(b => b.textContent === "Hear the scale"), card: /Character/.test(document.querySelector("#main").innerText) }));
    check(about.dt === "Aroh,Avroh,Pakad" && about.hear && about.card, "a raga: aroh, avroh and pakad, Hear the scale and the card's text " + JSON.stringify(about));
    await clickText("#main .toolswitch button", "Play it");
    const play = await page.evaluate(() => ({ jam: (document.querySelector("#main a[href^='#/skills/game/jam/']") || {}).getAttribute?.("href"), phrase: !!document.querySelector("#main a[href='#/skills/game/phrase']"), day: /In the course: Day \d+/.test(document.querySelector("#main").innerText) }));
    check(play.jam === "#/skills/game/jam/khamaj" && play.phrase && play.day, "a raga: Jam with the band, Raga phrases and its day in the course " + JSON.stringify(play));
    await page.click("#main a[href='#/skills/game/jam/khamaj']");
    await page.waitForSelector("#main .game-card:not([hidden]) select", { timeout: 8000 }).catch(() => {});
    check(await page.$eval("#main .game-card select", s => s.selectedOptions[0].textContent).catch(() => "") === "Khamaj", "Jam with the band opens in the raga it came from");
    await go("/music/listen");
    const lis = await page.evaluate(() => ({ lib: !!document.querySelector("#main a[href='#/read/08-LISTENING-LIBRARY.md']"), scales: [...document.querySelectorAll("#main h2")].some(x => /Raga scales/.test(x.textContent)) }));
    check(lis.lib && !lis.scales, "listen: the listening library is a row, and raga scales moved onto each raga");
    await page.evaluate(() => { for (const k of ["bansuri.mysongs", "bansuri.coach.history", "bansuri.game.balloon.best.srg", "bansuri.songs.last"]) localStorage.removeItem(k); });
  });
  await section("Today: first run, before and after practice, cards and toasts", async () => {
    // Its own browser context: a fresh learner each time, without touching the other sections.
    const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
    const tp = await ctx.newPage();
    await collectI18n(tp);
    tp.on("pageerror", e => errors.push("pageerror: " + e.message));
    tp.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
    await tp.goto(BASE + "#/today", { waitUntil: "networkidle0" });
    const T = await tp.evaluate(() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); });
    const ago = n => { const d = new Date(T + "T12:00:00"); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const load = async (prog, lessons) => {
      await tp.evaluate((p, l) => { localStorage.clear(); localStorage.setItem("bansuri.settings", JSON.stringify({ countdown: 0 })); if (p) localStorage.setItem("bansuri.progress", JSON.stringify(p)); if (l) localStorage.setItem("bansuri.lessons", JSON.stringify(l)); }, prog, lessons);
      await tp.goto(BASE + "#/today", { waitUntil: "networkidle0" }); await tp.reload({ waitUntil: "networkidle0" }); await sleep(400);
    };
    const tText = () => tp.$eval("#main", e => e.innerText);
    // First run (F1): one choice per screen, remembered across a reload.
    await load(null);
    check(await tp.$$eval("#main .firstchoice button", b => b.length) === 2 && !(await tp.$("#main .firstrun a.btn")), "first run: the language comes first, on a screen of its own");
    await clickTextOn(tp, "#main .firstchoice button", "English"); await sleep(150);
    check(await tp.$("#main .howcard") !== null && !(await tp.$("#main .firstchoice")), "first run: then how you like to learn");
    await clickTextOn(tp, "#main .howtile", "I like to read"); await sleep(150);
    await tp.reload({ waitUntil: "networkidle0" }); await sleep(300);
    check(/Already play\?/.test(await tText()) && await tp.$("#main .firstplay") !== null, "first run: then Already play?, as a step of its own (remembered across a reload)");
    await clickTextOn(tp, "#main .firstchoice button", "Yes: take the playing test"); await sleep(200);
    check(await tp.$("#main .firstplay .placement") !== null, "first run: Yes opens the playing test in place");
    await tp.reload({ waitUntil: "networkidle0" }); await sleep(300);
    await clickTextOn(tp, "#main .firstchoice button", "No, I am new"); await sleep(150);
    check(await tp.$eval("#main .firstrun a.btn.primary.big", a => a.getAttribute("href")).catch(() => "") === "#/lesson/m0" && await tp.$$eval("#main .btn.primary", b => b.length) === 1, "first run: then Day 0, with Start Day 0 as the one primary action");
    // Before practice (L1): a lesson part way says which step; the step list is a link; the unit strip
    // replaces the phase bar; the session list, readings and pager are on the day's cover now.
    const days = n => { const o = {}; for (let i = 0; i < n; i++) o[i] = { done: true, date: ago(40) }; return o; };
    const m0 = { at: 0, done: ago(40), data: { side: "right", time: "evening", minutes: "30", place: "living" } };
    const prefs = { langChosen: true, howChosen: true, playAsked: true, newsSeen: "2026-11-progress" };
    const base = (cur, extra) => Object.assign({ current: cur, startedAt: ago(40), lastBackup: T, days: days(cur), milestones: { M0: { status: "passed", attempts: [] }, M1: { status: "passed", attempts: [] }, M2: { status: "passed", attempts: [] } }, log: [{ date: ago(1), day: cur - 1, minutes: 30, passed: true }], prefs }, extra || {});
    await load(base(47), { m0, p47: { at: 6, data: {}, done: null, started: T } });
    const btn = await tp.$eval("#main .todayhero .btn.primary", a => ({ href: a.getAttribute("href"), text: a.textContent })).catch(() => ({}));
    check(btn.href === "#/lesson/p47" && /^Continue: step 7 of \d+$/.test(btn.text), "today: a lesson in progress says Continue: step 7 of N [" + btn.text + "]");
    let tt = await tText();
    check(/min left/.test(tt) && !/min in all/.test(tt) && await tp.$('#main .todayhero a[href="#/session/47"]') !== null, "today: minutes left, and a Step list link");
    check(/Practice day/i.test(tt) && /Goal:/.test(tt) && /Your time: Evening, 30 min, The living room/.test(tt), "today: the kind of day, the goal line and the practice time chosen on Day 0");
    check(await tp.$("#main .unitstrip .unit-dots i.now") !== null && /days to the milestone/.test(tt) && !(await tp.$("#main .journey")), "today: the current unit's strip in place of the phase bar");
    check(!(await tp.$("#main .blocklist")) && !(await tp.$("#main .pager")) && !/Read for this day/.test(tt), "today: the session list, readings and day pager are off Today");
    check(await tp.$('#main a[href="#/today/quick"]') !== null, "today: Short on time? goes to #/today/quick");
    // After practice (L1b): done, the longest steady note today, the next day offered quietly.
    const done = base(48); done.days[47] = { done: true, date: T }; done.live = { holds: { "0": [{ d: ago(30), s: 6.2 }, { d: T, s: 14.1 }] }, echo: {}, taps: [], plays: [] };
    await load(done, { m0 });
    tt = await tText();
    check(await tp.$("#main .todaydone") !== null && /Day 47 practised/.test(tt) && /14\.1 s today/.test(tt) && /Day 48 is open/.test(tt), "today after practice: Day 47 practised, the longest steady note, Day 48 is open");
    check(!(await tp.$("#main .todaydone .btn.primary")) && await tp.$('#main .todaydone a[href="#/today/quick"]') !== null && /Quest game/.test(tt), "today after practice: going on is offered, not pushed; or 5 minutes, or the quest game");
    // Quest game opens the game for today's first open quest (the one Skills offers), and Close comes back.
    const qg = await tp.$eval("#main .todaydone a.questgame", a => a.getAttribute("href")).catch(() => "");
    const qWant = await tp.evaluate(async () => { const [{ questGame }, { questState }] = await Promise.all([import("/app/js/skillmap.js"), import("/app/js/fun.js")]); return "#/skills/game/" + questGame(questState().list).key; });
    await tp.click("#main .todaydone a.questgame").catch(() => {});
    const qOpen = await tp.waitForSelector("#main .game-card:not([hidden]) button", { timeout: 8000 }).then(() => true, () => false);
    await clickTextOn(tp, "#main .game-card button", "Close").catch(() => {});
    await tp.waitForFunction(() => location.hash === "#/today", { timeout: 5000 }).catch(() => {});
    check(qg === qWant && qOpen && await tp.evaluate(() => location.hash) === "#/today", "today after practice: Quest game opens today's quest game itself (" + qg + "), and Close comes back to Today");
    // Coming back after three days (W17): the main card, no count of days, Continue to the day's
    // lesson and a gentle start with 5 minutes.
    await load(base(47, { log: [{ date: ago(3), day: 46, minutes: 30, passed: true }] }), { m0 });
    const wb = await tp.evaluate(() => { const c = document.querySelector("#main .welcomeback"); return c ? { main: c === document.querySelector("#main .page").firstElementChild || !document.querySelector("#main .todayhero:not(.welcomeback)"), text: c.innerText,
      btns: [...c.querySelectorAll("a.btn")].map(x => ({ href: x.getAttribute("href"), primary: x.classList.contains("primary"), t: x.textContent })) } : null; });
    check(!!wb && wb.main && !/has been|days ago/i.test(wb.text) && /Day 47/.test(wb.text) && wb.btns.length === 2 && wb.btns[0].primary && /^Continue/.test(wb.btns[0].t) && /^#\/lesson\//.test(wb.btns[0].href) && wb.btns[1].href === "#/today/quick" && !wb.btns[1].primary,
      "welcome back after 3 days: the main card, no day count; Continue to the day's lesson, or start with 5 minutes " + JSON.stringify(wb));
    // News: a one-time toast, not a card.
    await load(base(47, { prefs: Object.assign({}, prefs, { newsSeen: null }) }), { m0 });
    check(await tp.$(".msgtoast") !== null && !(await tp.$("#main .newscard")), "news: a toast, not a card on Today");
    await tp.reload({ waitUntil: "networkidle0" }); await sleep(400);
    check(!(await tp.$(".msgtoast")), "news: shown once, remembered");
    await tp.goto(BASE + "#/today/quick", { waitUntil: "networkidle0" });
    check(await tp.waitForSelector("#main .lv-hold", { timeout: 5000 }).then(() => true, () => false), "#/today/quick opens the 5-minute practice (#/quick still works)");
    await ctx.close();
  });
  await section("Hindi: day titles, goal line, week strip, long-tone meter", async () => {
    // The course's day titles, pass checks and the meter's generated lines reach the screen in Hindi
    // (app/i18n/hi.json: whole titles, and patterns such as "{x} - wk {n} of {m}" for the generated ones).
    const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
    const hp = await ctx.newPage();
    hp.on("pageerror", e => errors.push("pageerror: " + e.message));
    hp.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
    // Hindi with no English words left: course codes (EX-EAR, BPM, XXO) are upper case, notation too.
    const hindi = s => /[ऀ-ॿ]/.test(s) && !/[a-z]{3}/.test(s);
    const hgo = async hash => { await hp.goto(BASE + "#" + hash, { waitUntil: "networkidle0" }); await hp.reload({ waitUntil: "networkidle0" }); await hp.waitForFunction(() => { const m = document.querySelector("#main"); return m && m.children.length && !m.querySelector(":scope > .boot"); }, { timeout: 10000 }).catch(() => {}); await sleep(400); };
    const learner = cur => hp.evaluate(cur => {
      localStorage.clear();
      localStorage.setItem("bansuri.settings", JSON.stringify({ countdown: 0, lang: "hi" }));
      const ms = {}; ["M0", "M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"].forEach(m => { ms[m] = { status: "passed", passedOn: "2026-06-01", attempts: [] }; });
      localStorage.setItem("bansuri.progress", JSON.stringify({ current: cur, startedAt: "2025-11-01", prefs: { langChosen: true, howChosen: true, playAsked: true, newsSeen: "2026-11-progress" }, milestones: ms }));
      localStorage.setItem("bansuri.lessons", JSON.stringify({ m0: { at: 0, done: "2025-11-01", data: { side: "right" } } }));
    }, cur);
    await hp.goto(BASE + "#/today", { waitUntil: "networkidle0" });
    for (const cur of [5, 120, 330, 480]) {
      await learner(cur); await hgo("/course");
      const titles = await hp.$$eval("#main .coursepath .cptitle", e => e.map(x => x.textContent.trim()).filter(Boolean)).catch(() => []);
      check(titles.length >= 2 && titles.every(hindi), "hindi course path (day " + cur + "): the days' titles are in Hindi " + JSON.stringify(titles.filter(x => !hindi(x)).slice(0, 3)));
    }
    for (const d of [5, 47, 200, 330, 640]) {
      await learner(d); await hgo("/day/" + d);
      const c = await hp.evaluate(() => ({ h1: (document.querySelector("#main .lesson-cover h1") || {}).textContent || "", goal: (document.querySelector("#main .lesson-cover .lesson-goal p") || {}).textContent || null,
        reads: [...document.querySelectorAll("#main .lesson-cover .lesson-read span")].map(s => s.textContent) }));
      check(hindi(c.h1) && (c.goal === null || hindi(c.goal)) && c.reads.every(r => /[ऀ-ॿ]/.test(r)), "hindi lesson cover, day " + d + ": the title, today's goal and the readings [" + c.h1 + (c.goal ? " / " + c.goal : "") + "] " + JSON.stringify(c.reads.filter(r => !/[ऀ-ॿ]/.test(r))));
    }
    await learner(5); await hgo("/today");
    const td = await hp.evaluate(() => ({ h1: (document.querySelector("#main .todayhero h1") || {}).textContent || "", goal: (document.querySelector("#main .todaygoal") || {}).textContent || "",
      week: [...document.querySelectorAll("#main .weekstrip .wkday span")].map(s => s.textContent) }));
    check(hindi(td.h1) && hindi(td.goal), "hindi today: the day's title and the Goal line (from its pass check) [" + td.h1 + " / " + td.goal + "]");
    check(td.week.length === 7 && td.week.every(s => /^[ऀ-ॿ]+$/.test(s)), "hindi today: the week strip's days are Hindi (" + td.week.join(" ") + ")");
    // The meter's goal line, for every note it can name, and on a real long-tone step.
    const lines = await hp.evaluate(async () => {
      const [{ t }, { codeOf, nameOf }] = await Promise.all([import(new URL("app/js/core/i18n.js", location.href).href), import(new URL("app/js/core/theory.js", location.href).href)]);
      return [-5, -3, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14].map(s => t(`Hold ${codeOf(s)} (${nameOf(s)}) for 8 s, within 20 cents.`));
    });
    check(lines.every(hindi), "hindi meter: 'Hold <note> for 8 s, within 20 cents.' for every note " + JSON.stringify(lines.filter(x => !hindi(x))));
    const i = await hp.evaluate(async () => {
      const u = q => import(new URL("app/js/" + q, location.href).href);
      const [PR, OD, C, P] = await Promise.all([u("lessons/practice.js"), u("lessons/oneday.js"), u("course.js"), u("lesson/player.js")]);
      return P.flatSteps(OD.oneDay(PR.practiceLesson("p47"), C.getDay(47))).findIndex(s => s.kind === "hold");
    });
    await learner(47);
    await hp.evaluate(i => localStorage.setItem("bansuri.lessons", JSON.stringify({ m0: { at: 0, done: "2025-11-01", data: {} }, p47: { at: i, data: {}, done: null } })), i);
    await hgo("/day/47");
    const goal = await hp.waitForSelector(".lesson-stage .lv-goal", { timeout: 8000 }).then(() => hp.$eval(".lesson-stage .lv-goal", e => e.textContent), () => "");
    check(hindi(goal), "hindi long-tone step: the meter's goal line [" + goal + "]");
    await ctx.close();
  });
  await section("Me screens (redesign 2): journal days, record, capsule, teacher, flute, your data, simple mode", async () => {
    // Its own browser context, so its storage and recordings do not touch the other sections.
    const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
    const mp = await ctx.newPage();
    await collectI18n(mp);
    mp.on("pageerror", e => errors.push("pageerror: " + e.message));
    mp.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
    await mp.goto(BASE + "#/today", { waitUntil: "networkidle0" });
    const T = await mp.evaluate(() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); });
    const to = async hash => {
      await mp.goto(BASE + "#" + hash, { waitUntil: "networkidle0" });
      await mp.waitForFunction(() => { const m = document.querySelector("#main"); return m && m.children.length && !m.querySelector(":scope > .boot"); }, { timeout: 10000 }).catch(() => {});
      await sleep(250);
    };
    const mText = () => mp.$eval("#main", e => e.innerText);
    await mp.evaluate(p => { localStorage.clear(); localStorage.setItem("bansuri.settings", JSON.stringify({ countdown: 0 })); localStorage.setItem("bansuri.progress", JSON.stringify(p)); },
      { current: 20, startedAt: "2026-09-20", prefs: { langChosen: true, howChosen: true, playAsked: true, newsSeen: "2026-11-progress" }, log: [{ date: T, minutes: 30, day: 19 }] });
    await mp.reload({ waitUntil: "networkidle0" });
    // Two real recordings (a steady tone on Sa, as WAV): the Day 0 time capsule and one from today.
    await mp.evaluate(async t => {
      const wav = (secs, hz) => {
        const sr = 22050, n = Math.round(sr * secs), b = new DataView(new ArrayBuffer(44 + n * 2));
        const w = (o, s) => { for (let i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
        w(0, "RIFF"); b.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
        b.setUint32(24, sr, true); b.setUint32(28, sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, "data"); b.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) b.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * hz * i / sr) * 12000 * Math.min(1, i / 2000, (n - i) / 2000)), true);
        return new Blob([b.buffer], { type: "audio/wav" });
      };
      const r = await import(new URL("app/js/recorder.js", location.href).href);
      await r.saveRecording({ id: "mecap", created: "2026-01-01T10:00:00.000Z", date: "2026-01-01", day: 0, label: "Day 0 time capsule", mime: "audio/wav", blob: wav(2.5, 523.25), durationS: 2.5, kind: "audio" }, { count: false });
      await r.saveRecording({ id: "menow", created: new Date().toISOString(), date: t, day: 20, label: "Long Sa", mime: "audio/wav", blob: wav(5, 523.25), durationS: 5, kind: "audio" }, { count: false });
    }, T);
    // W70 Days: this week's total, and today's recording plays from the day.
    await to("/me/journal");
    const days = await mp.evaluate(() => ({ week: (document.querySelector("#main .weektotal") || {}).textContent || "", rec: !!document.querySelector("#main .tday .tdayrec") }));
    check(/^This week \. 30 min$/.test(days.week.trim()) && days.rec, "journal days: a THIS WEEK total, and the day's recording as a button " + JSON.stringify(days));
    await mp.evaluate(() => document.querySelector("#main .tday .tdayrec").click());
    check(await mp.$("#main .tday .tdayrecs audio") !== null, "journal days: tapping the day's recording plays it there");
    // W71, W72 Record: Record now opens its own screen, back to the Journal, Sound only or With video.
    await to("/me/journal/recordings");
    check(await mp.$("#main .recordnow a[href='#/me/journal/record']") !== null && !(await mp.$("#j-label")), "journal recordings: Record now opens the Record screen");
    await to("/me/journal/record");
    const rs = await mp.evaluate(() => ({ back: !!document.querySelector("#main .backhead a.backlink[href='#/me/journal/recordings']"), tabs: !!document.querySelector("#main .sectiontabs"),
      sw: [...document.querySelectorAll("#main .recswitch button")].map(b => b.textContent + (b.getAttribute("aria-pressed") === "true" ? "*" : "")).join() }));
    check(rs.back && !rs.tabs && rs.sw === "Sound only*,With video", "record: its own screen (< Journal, Record), with a Sound only / With video switch " + JSON.stringify(rs));
    await clickTextOn(mp, "#main .recswitch button", "With video"); await sleep(200);
    check(await mp.$("#main .recstage .pose-overlay") !== null && await mp.$("#main .recstage video.selfview") !== null && /Record video/.test(await mText()), "record: With video shows the camera stage with the posture overlay");
    // W73 Time capsule: how long each recording's steadiest note lasts.
    await to("/me/journal/capsule");
    await mp.waitForFunction(() => document.querySelectorAll("#main .capsulesteady b").length === 2, { timeout: 20000 }).catch(() => {});
    const steady = await mp.$$eval("#main .capsulepair .capsulesteady", x => x.map(e => e.innerText.trim()));
    check(steady.length === 2 && steady.every(s => /^\d+(\.\d)? s steady$/.test(s)) && parseFloat(steady[1]) > parseFloat(steady[0]), "capsule: an N s steady figure under Day 0 and Today " + JSON.stringify(steady));
    // W74 Teacher > Ask: What your teacher rates as a row; Make the review link, then Copy and Share.
    await to("/me/teacher");
    check(await mp.$("#main a.hubrow[href='#/me/teacher/rates']") !== null && !(await mp.$("#main .rvlinkout:not([hidden])")), "teacher ask: What your teacher rates is a row; the link comes after Make the review link");
    await mp.evaluate(() => { window.__sent = []; navigator.share = undefined; navigator.clipboard.writeText = t => { window.__sent.push(t); return Promise.resolve(); }; });
    await mp.evaluate(() => { const f = document.querySelector("#rv-file"), dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(64)], "take.webm", { type: "audio/webm" })); f.files = dt.files; f.dispatchEvent(new Event("change")); });
    await clickTextOn(mp, "#main button", "Make the review link");
    await mp.waitForSelector("#main input[aria-label='Review link']", { timeout: 5000 }).catch(() => {});
    const ask = await mp.evaluate(() => ({ link: (document.querySelector("#main input[aria-label='Review link']") || {}).value || "", btns: [...document.querySelectorAll("#main .rvlinkout button")].map(b => b.textContent.trim()).join() }));
    check(/#\/review\/[zj][A-Za-z0-9_-]+$/.test(ask.link) && ask.btns === "Copy,Share", "teacher ask: the review link, then Copy and Share " + JSON.stringify(ask.btns));
    await to("/me/teacher/rates");
    check(await mp.$("#main .backhead a[href='#/me/teacher']") !== null && await mp.$$eval("#main .rvrates li", x => x.length) === 7, "teacher: What your teacher rates opens on its own, the seven points");
    // W75 Feedback: Listen, for a review whose request kept its recording.
    const reqId = await mp.evaluate(() => (JSON.parse(localStorage.getItem("bansuri.review.requests") || "[]")[0] || {}).id || "");
    await mp.evaluate(id => localStorage.setItem("bansuri.feedback", JSON.stringify([{ id, date: "2026-11-01", teacher: "T", what: "A song", comment: "Ga is flat", task: "", due: null, scores: { tone: 3 }, notes: {} }])), reqId);
    await to("/me/teacher/feedback");
    await mp.waitForSelector("#main .rvlisten", { timeout: 5000 }).catch(() => {});
    check(!!reqId && await mp.$("#main .rvlisten") !== null, "teacher feedback: Listen on a review that has its recording");
    // W78 Flute: the checks as rows; Check my flute in the player shell, one note per screen.
    await to("/me/flute");
    check((await mp.$$eval("#main .flutechecks a.hubrow", a => a.map(x => x.getAttribute("href")))).join() === "#/me/flute/check,#/me/flute/mic,#/me/flute/calibrate", "flute: Check my flute, Microphone check and Calibrate as rows");
    await to("/me/flute/mic");
    check(await mp.$("#main .backhead a[href='#/me/flute']") !== null && /15-second microphone check/.test(await mText()), "flute: the microphone check opens on its own screen");
    await to("/me/flute/check");
    check(await mp.$$eval("#main a.hubrow[href^='#/me/flute/check/']", a => a.length) === 7, "flute check: a row for each set of notes");
    await to("/me/flute/check/1");
    const fc = await mp.evaluate(() => ({ full: document.documentElement.classList.contains("fullfocus"), chaps: document.querySelectorAll("#main .lesson-chaps li").length, note: !!document.querySelector("#main .lesson-stage .fc-note") }));
    check(fc.full && fc.chaps === 8 && fc.note, "flute check: the player shell, full focus, one screen per note and the results " + JSON.stringify(fc));
    for (let i = 0; i < 7; i++) { await clickTextOn(mp, "#main .lesson-stage button", "Skip this note"); await sleep(120); }
    check(/7 notes/.test(await mText()) && await mp.$$eval("#main .fc-table tbody tr", r => r.length) === 7, "flute check: the last screen sums up every note");
    await clickTextOn(mp, "#main .lesson-foot button", "Finish");
    await mp.waitForFunction(() => location.hash === "#/me/flute", { timeout: 4000 }).catch(() => {});
    check(await mp.evaluate(() => location.hash === "#/me/flute" && !document.documentElement.classList.contains("fullfocus")), "flute check: Finish comes back to Me > Flute");
    // W80 Display: the preview of S R G m follows the settings.
    await to("/me/settings/display");
    const pv1 = await mp.$eval("#main .notepreview", e => e.innerText).catch(() => "");
    await mp.evaluate(() => document.querySelector("#st-deva").click()); await sleep(150);
    const pv2 = await mp.$eval("#main .notepreview", e => e.innerText).catch(() => "");
    check(/S\s*R\s*G\s*m/.test(pv1.replace(/\n/g, " ")) && /सा/.test(pv2), "display: the preview shows S R G m as it will look, and follows the settings");
    // W81, W82 Your data: Move as a row to its own screen; Start over says what it removes.
    await to("/me/settings/data");
    check(await mp.$("#main a.hubrow[href='#/me/settings/move']") !== null && /Removes all progress on this phone\./.test(await mText()) && !/Make a/.test(await mText()), "your data: Move to another phone is a row; Start over says it removes all progress on this phone");
    await to("/me/settings/move");
    check(await mp.$("#main .backhead a[href='#/me/settings/data']") !== null && /On this phone/i.test(await mText()) && /On the new phone/i.test(await mText()) && /Bring it here/.test(await mText()), "move: its own screen, On this phone and On the new phone");
    // W11 Simple mode home: the other language, today's quests, and the way out.
    await mp.evaluate(() => localStorage.setItem("bansuri.settings", JSON.stringify({ countdown: 0, simple: true })));
    await mp.goto(BASE + "#/today", { waitUntil: "networkidle0" }); await mp.reload({ waitUntil: "networkidle0" }); await sleep(300);
    const sm = await mp.evaluate(() => ({ lang: (document.querySelector("#main .simplelang") || {}).textContent, quests: (document.querySelector("#main .simplequests .eyebrow") || {}).textContent, day: (document.querySelector("#main .simpletile.primary") || {}).innerText || "", leave: !!document.querySelector("#main .simpleleave button") }));
    check(sm.lang === "हिन्दी" && sm.quests === "Today's quests" && /Day 20/.test(sm.day) && sm.leave, "simple mode: a Hindi button, TODAY'S QUESTS, Start practice names the day, Leave Simple mode " + JSON.stringify(sm));
    await clickTextOn(mp, "#main .simpleleave button", "Leave Simple mode");
    await mp.waitForFunction(() => !JSON.parse(localStorage.getItem("bansuri.settings")).simple && !!document.querySelector("#main .todayhero"), { timeout: 8000 }).catch(() => {});
    check(await mp.evaluate(() => !JSON.parse(localStorage.getItem("bansuri.settings")).simple && !document.querySelector("#main .simpletiles")), "simple mode: Leave Simple mode goes back to the usual Today");
    await ctx.close();
  });
  await section("Skills (redesign 2): a fix's own screen, the game shell, challenges, ornaments, tone check", async () => {
    await go("/today");
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem("bansuri.progress", JSON.stringify({ v: 1, current: 20, startedAt: "2026-10-01", prefs: { howChosen: true } })); });
    // W50: a fix on its own screen, opened from its hub; Back returns to the hub.
    await go("/skills/tone");
    await page.evaluate(() => document.querySelector("#main a.hubrow[href='#/skills/fix/TS-02/tone']").click());
    await page.waitForSelector("#main .fixpage[data-ts=TS-02] .fixstep", { timeout: 8000 }).catch(() => {});
    const fx = await page.evaluate(() => ({ back: document.querySelector("#main .backhead .backlink")?.getAttribute("href"), title: document.querySelector("#main .backhead h1")?.textContent,
      heads: [...document.querySelectorAll("#main .fixpart .grouphead")].map(x => x.textContent).join("|"), steps: document.querySelectorAll("#main .fixstep").length, tries: document.querySelectorAll("#main .fixtry").length,
      hear: !!document.querySelector("#main .fixhear"), guide: !!document.querySelector("#main a[href='#/read/troubleshooting/TS-02-squeaks-and-wrong-octave.md']"), teacher: !!document.querySelector("#main a.fixteacher[href='#/me/teacher']"),
      tabs: !!document.querySelector("#main .sectiontabs"), fixback: document.querySelector("#main .fixback")?.textContent }));
    check(fx.back === "#/skills/fix" && /Squeaks/.test(fx.title) && fx.heads === "What it sounds like|Try this first" && fx.steps >= 3 && fx.tries === fx.steps && fx.hear && fx.guide && fx.teacher && !fx.tabs && fx.fixback === "Back to Tone and breath",
      "fix (W50): its own screen: back to Fix a problem, what it sounds like, numbered fixes each with Try, a good example, the full guide, ask your teacher, back to the hub " + JSON.stringify(fx));
    await page.click("#main .fixtry");
    check(await page.$("#main .fixstep .drillcard:not([hidden]) .lv-hold") !== null, "fix: Try opens the topic's drill under the fix");
    await page.click("#main .fixback"); await page.waitForFunction(() => location.hash === "#/skills/tone", { timeout: 5000 }).catch(() => {});
    check(await page.evaluate(() => location.hash) === "#/skills/tone", "fix: Back to Tone and breath returns to the hub (history Back)");
    // Opened from a lesson: Back returns to the lesson; a fix with no drill and no example shows neither.
    await go("/session/2");
    await page.evaluate(() => { location.hash = "#/skills/fix/TS-01"; });
    await page.waitForSelector("#main .fixpage[data-ts=TS-01] .fixback", { timeout: 8000 }).catch(() => {});
    const lessonBack = await page.$eval("#main .fixback", e => e.textContent).catch(() => "");
    await page.click("#main .fixback"); await page.waitForFunction(() => location.hash === "#/session/2", { timeout: 5000 }).catch(() => {});
    check(lessonBack === "Back to the lesson" && await page.evaluate(() => location.hash) === "#/session/2", "fix: opened from a lesson, Back returns to it (" + lessonBack + ")");
    await go("/skills/fix/TS-11");
    await page.waitForSelector("#main .fixpage .fixstep", { timeout: 8000 }).catch(() => {});
    check(await page.evaluate(() => document.querySelectorAll("#main .fixstep").length >= 3 && !document.querySelector("#main .fixtry") && !document.querySelector("#main .fixhear") && !!document.querySelector("#main .fixback")), "fix: only the drills and examples a topic has (TS-11: none)");
    // W44: the Ornaments hub's four tiles open the trainer on their ornament; what the microphone can judge.
    await go("/skills/ornaments");
    const orn = await page.evaluate(() => ({ tiles: [...document.querySelectorAll("#main .orntile")].map(a => a.getAttribute("href")).join(), chips: document.querySelectorAll("#main .hublatest .chip").length,
      judge: !!document.querySelector("#main a.hubrow[href='#/skills/ornaments/trainer#judge']") }));
    check(orn.tiles === "#/skills/ornaments/trainer/meend,#/skills/ornaments/trainer/kan,#/skills/ornaments/trainer/murki,#/skills/ornaments/trainer/andolan" && orn.chips === 4 && orn.judge, "ornaments hub (W44): four tiles, the four chips from the start, what the microphone can judge " + JSON.stringify(orn));
    await page.evaluate(() => document.querySelector("#main .orntile[data-orn=murki]").click());
    await page.waitForSelector("#main .ornTabs", { timeout: 8000 }).catch(() => {});
    check(await page.evaluate(() => document.querySelector("#main .ornTabs [aria-selected=true]")?.textContent === "Murki" && /^Murki/.test(document.querySelector("#main .backhead h1").textContent) && !!document.querySelector("#main .toolstart")), "ornament trainer: opens on the ornament of its tile, named in the title, with one Try it");
    await go("/skills/ornaments/trainer#judge");
    check(!!(await page.$("#main #judge")), "ornament trainer: What the microphone can judge has its own anchor");
    // S3: the ear quiz, play it back and tap the beat: setup above, one Start.
    for (const [route, what] of [["/skills/ear/quiz", "ear quiz"], ["/skills/ear/playback", "play it back"], ["/skills/rhythm/tap", "tap the beat"], ["/skills/tone/check", "tone check"]]) {
      await go(route);
      check(await page.$$eval("#main .toolstart", x => x.length) === 1, what + ": one full-width Start under its setup (S3)");
    }
    // W47: the tone check opens on the last result, as three chips with details behind them.
    await page.evaluate(() => localStorage.setItem("bansuri.tone.history", JSON.stringify([{ date: "2026-11-01", note: 0, p: { pitchSD: 4, levelCV: 9, air: 6, attack: 100, overshoot: 20, cents: -5, seconds: 5 }, score: 7.3 }])));
    await go("/skills/tone");
    await go("/skills/tone/check");
    await page.waitForSelector("#main .tonelast .tonechip", { timeout: 8000 }).catch(() => {});
    const tc =await page.evaluate(() => ({ chips: [...document.querySelectorAll("#main .tonelast .tonechip")].map(c => c.dataset.k + ":" + (c.classList.contains("good") ? "ok" : "warn")).join(), fix: document.querySelector("#main .tonelast .tonefix")?.getAttribute("href"),
      btn: [...document.querySelectorAll("#main button")].some(b => /Hold a note now/.test(b.textContent)) }));
    await page.click("#main .tonechip[data-k=air]");
    const detail = await page.$eval("#main .tonedetail", e => !e.hidden && /Clear tone/.test(e.innerText) && !!e.querySelector("a[href='#/skills/fix/TS-01']")).catch(() => false);
    check(tc.chips === "steady:ok,tune:ok,air:warn" && tc.fix === "#/skills/fix/TS-01" && tc.btn && detail, "tone check (W47): last result as Steady, In tune and Air chips, the details behind a chip, Airy tone: what to try " + JSON.stringify(tc));
    // W52-W54: the game shell: How to play (the game's instructions and options, Play, Drone),
    // Playing, Result (score, best, Again, Another game, Challenge a friend).
    await go("/skills/games");
    await page.evaluate(() => [...document.querySelectorAll("#main .gamecard")].find(b => b.dataset.game === "bullseye").click());
    await page.waitForSelector("#main .gshell .gs-play", { timeout: 8000 }).catch(() => {});
    const intro = await page.evaluate(() => { const s = document.querySelector("#main .gshell"), vis = el => !!el && el.offsetParent !== null; return { phase: s.dataset.phase, play: vis(s.querySelector(".gs-play")), drone: vis(s.querySelector(".gs-drone")), start: vis(s.querySelector(".gs-start")), canvas: vis(s.querySelector(".game-canvas")), howto: /Hold the note shown/.test(s.innerText), notes: vis(s.querySelector(".game select")) }; });
    check(intro.phase === "intro" && intro.play && intro.drone && !intro.start && !intro.canvas && intro.howto && intro.notes, "game shell: How to play shows the instructions, the options, Play and Drone " + JSON.stringify(intro));
    await page.click("#main .gs-play"); await sleep(200);
    const playing = await page.evaluate(() => document.querySelector("#main .gshell").dataset.phase);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent("bansuri:live", { detail: { type: "game", game: "bullseye", score: 42, best: true } })));
    await sleep(200);
    const res = await page.evaluate(() => { const s = document.querySelector("#main .gshell"); return { phase: s.dataset.phase, score: s.querySelector(".gs-score")?.innerText, best: s.querySelector(".gs-best")?.innerText, again: !!s.querySelector(".gs-again"), other: !!s.querySelector(".gs-other"), share: s.querySelector(".challenge-share input")?.value || "" }; });
    check(playing === "play" && res.phase === "result" && /42/.test(res.score) && /new best/i.test(res.best) && res.again && res.other && /#\/challenge\//.test(res.share), "game shell: Play, then the result: score, best, Play again, Another game, a challenge link for Bullseye " + JSON.stringify(res));
    await page.click("#main .gs-other"); await page.waitForFunction(() => location.hash === "#/skills/games" && !document.querySelector("#main .game-card:not([hidden])"), { timeout: 5000 }).catch(() => {});
    check(await page.evaluate(() => location.hash === "#/skills/games" && !document.querySelector("#main .game-card:not([hidden])")), "game shell: Another game returns to the games");
    // W55: a challenge in a game other than Steer, Balloon and Phrase; Take it on, then Send your score back.
    const payload = Buffer.from(JSON.stringify({ g: "bullseye", n: 34, by: "Asha" })).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await go("/challenge/" + payload);
    const chal = await page.$eval("#main .challenge", e => e.innerText).catch(() => "");
    await page.click("#main .gs-take"); await page.waitForSelector("#main .gshell .gs-play", { timeout: 5000 }).catch(() => {});
    await page.click("#main .gs-play"); await sleep(200);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent("bansuri:live", { detail: { type: "game", game: "bullseye", score: 40, best: false } })));
    await sleep(200);
    const back = await page.evaluate(() => ({ vs: document.querySelector("#main .gs-vs")?.innerText || "", send: [...document.querySelectorAll("#main .challenge-share button")].some(b => /Send your score back/.test(b.textContent)), link: document.querySelector("#main .challenge-share input")?.value || "" }));
    check(/Asha scored 34 in Bullseye/.test(chal) && /beat Asha/.test(back.vs) && back.send && /#\/challenge\//.test(back.link), "challenge (W55): who scored what, Take it on, and the result offers Send your score back " + JSON.stringify(back));
    // Hindi: the fix screen and the game shell.
    await page.evaluate(() => localStorage.setItem("bansuri.settings", JSON.stringify({ lang: "hi" })));
    await page.goto(BASE + "#/skills/fix/TS-02/tone", { waitUntil: "networkidle0" }); await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector("#main .fixstep", { timeout: 8000 }).catch(() => {}); await sleep(300);
    const hiFix = await page.evaluate(() => [...document.querySelectorAll("#main .fixpart .grouphead, #main button, #main .fixback, #main .fixteacher b")].filter(b => /[A-Za-z]{3}/.test(b.textContent) && !/[ऀ-ॿ]/.test(b.textContent)).map(b => b.textContent));
    await page.goto(BASE + "#/skills/game/bullseye", { waitUntil: "networkidle0" }); await page.waitForSelector("#main .gs-play", { timeout: 8000 }).catch(() => {}); await sleep(300);
    const hiGame = await page.evaluate(() => [...document.querySelectorAll("#main .gshell button, #main .gshell label, #main .gs-howto")].filter(b => b.offsetParent !== null && /[A-Za-z]{3}/.test(b.textContent) && !/[ऀ-ॿ]/.test(b.textContent)).map(b => b.textContent));
    check(!hiFix.length && !hiGame.length, "hindi: the fix screen and the game shell are in Hindi " + JSON.stringify(hiFix.concat(hiGame)));
    await page.evaluate(() => localStorage.removeItem("bansuri.settings"));
    await page.reload({ waitUntil: "networkidle0" });
  });
  await section("Every day's lesson, walked through", async () => {
    // Each lesson in app/js/lessons, done start to finish by a walker that knows how to complete
    // each kind of step (the player marks the step's kind on the stage). A fresh learner on the
    // lesson's day, a synthetic microphone (Sa), fast timers. Finishing must open the next day.
    const { LESSONS } = await import("../app/js/lessons/index.js");
    // Plus a sample of practice days, built from their blocks (lessons/practice.js), across all five phases.
    const PRACTICE = [6, 20, 47, 101, 160, 260, 330, 421, 520, 640, 695].map(n => ({ id: "p" + n, day: n }))
      .concat([7, 98, 259, 553].map(n => ({ id: "p" + n, day: n, review: true }))); // and review days
    // WALK_SHARD=k/n walks every n-th lesson from the k-th (1-based), so tests/run.mjs can walk them in parallel processes.
    const [shardK, shardN] = (process.env.WALK_SHARD || "1/1").split("/").map(Number);
    for (const lesson of Object.values(LESSONS).concat(PRACTICE).filter(l => !process.env.WALK_ONLY || process.env.WALK_ONLY.split(",").includes(l.id)).filter((l, i) => i % shardN === shardK - 1)) {
      const lt0 = Date.now(), ls0 = slept;
      const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
      const lp = await ctx.newPage();
      await collectI18n(lp);
      const errs = [];
      lp.on("pageerror", e => errs.push(e.message));
      await lp.evaluateOnNewDocument(() => {
        if (!navigator.mediaDevices) return;
        const voices = []; let current = 0;
        const apply = (v, hz) => { const t = v.c.currentTime; if (hz) { v.o.frequency.setValueAtTime(hz, t); v.g.gain.setTargetAtTime(0.4, t, 0.005); } else v.g.gain.setTargetAtTime(0, t, 0.005); };
        window.__tone = hz => { current = hz; voices.forEach(v => apply(v, hz)); };
        navigator.mediaDevices.getUserMedia = async () => { const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(), d = c.createMediaStreamDestination(); o.type = "triangle"; g.gain.value = 0; o.connect(g); g.connect(d); o.start(); const v = { c, o, g }; voices.push(v); apply(v, current); return d.stream; };
        window.__lessonTime = 0.05;
        document.addEventListener("click", e => { if (window.__walkDebug) console.log("CLICK " + (e.target.outerHTML || "").slice(0, 160)); }, true);
        window.addEventListener("hashchange", () => { if (window.__walkDebug) console.log("HASH " + location.hash); });
      });
      if (process.env.WALK_DEBUG) { lp.on("console", m => { if (/^(CLICK|HASH)/.test(m.text())) console.log("      " + m.text()); }); await lp.evaluateOnNewDocument(() => { window.__walkDebug = true; }); }
      const SA = 523.251;
      const tone = hz => lp.evaluate(f => window.__tone(f), hz);
      const clickL = (sel, re) => lp.evaluate((sel, src) => { const b = [...document.querySelectorAll(sel)].find(x => new RegExp(src).test(x.textContent) && !x.disabled && !x.hidden); if (b) b.click(); return !!b; }, sel, re.source);
      const tapPart = id => lp.evaluate(id => document.querySelector(`.lesson-stage [data-part="${id}"]`).dispatchEvent(new MouseEvent("click", { bubbles: true })), id);
      const isReady = () => lp.$eval(".lesson-next", b => !b.disabled);
      const waitReady = ms => lp.waitForFunction(() => !document.querySelector(".lesson-next").disabled, { timeout: ms }).then(() => true, () => false);
      const intro = async () => { await sleep(100); if (await lp.evaluate(() => { const b = document.querySelector(".lesson-stage .lv-intro .lv-primary"); if (b) b.click(); return !!b; })) await sleep(150); };
      await lp.goto(BASE + "#/today", { waitUntil: "networkidle0" });
      await lp.evaluate(day => {
        localStorage.clear();
        localStorage.setItem("bansuri.settings", JSON.stringify({ countdown: 0 }));
        if (day > 0) {
          const days = {}; for (let i = 0; i < day; i++) days[i] = { done: true };
          // One repertoire piece due for review (review days play it).
          const reviews = { "EX-MEL-1.1": { label: "EX-MEL 1.1 Morning Steps", learned: "2026-01-01", next: "2026-01-02", stage: 0, bench: { notation: "S R G - | G R S - ||" }, done: 0 } };
          localStorage.setItem("bansuri.progress", JSON.stringify({ current: day, startedAt: "2026-01-01", days, reviews, milestones: { M0: { status: "passed", attempts: [] } }, prefs: { howChosen: true } }));
          localStorage.setItem("bansuri.lessons", JSON.stringify({ m0: { at: 0, done: "2026-01-01", data: { side: "right" } } }));
        }
      }, lesson.day);
      if (lesson.id[0] === "p") {
        await lp.goto(BASE + "#/today", { waitUntil: "networkidle0" }); await lp.reload({ waitUntil: "networkidle0" }); await sleep(300);
        check(!!(await lp.$('#main a[href="#/lesson/' + lesson.id + '"]')) && !!(await lp.$('#main a[href="#/session/' + lesson.day + '"]')), "Today (Day " + lesson.day + ") starts the practice lesson, with the step list one tap away");
        if (lesson.id === "p47") {
          // A block ticked in the step list carries over: the lesson leaves it out, Today says Continue.
          await lp.evaluate(n => { const st = JSON.parse(localStorage.getItem("bansuri.progress")); st.days[n] = { blocks: { W: true } }; localStorage.setItem("bansuri.progress", JSON.stringify(st)); }, lesson.day);
          await lp.reload({ waitUntil: "networkidle0" }); await sleep(300);
          check(/Continue today's practice/.test(await lp.$eval('#main a[href="#/lesson/p47"]', e => e.textContent)), "Today: a practice day started in the step list continues as a lesson");
          await lp.goto(BASE + "#/lesson/p47", { waitUntil: "networkidle0" }); await sleep(300);
          check(!(await lp.$$eval("#main .lesson-chapters li", l => l.map(x => x.firstChild.textContent))).includes("Warm-up"), "practice lesson: a block done in the step list is left out");
        }
      }
      await lp.goto(BASE + "#/lesson/" + lesson.id, { waitUntil: "networkidle0" });
      await lp.reload({ waitUntil: "networkidle0" });
      await lp.waitForSelector("#main .lesson-cover .btn.primary");
      await lp.evaluate(() => document.querySelector("#main .lesson-cover .btn.primary").click());
      await lp.waitForSelector(".lesson-stage");
      let stuck = null, steps = 0;
      for (let guard = 0; guard < 60; guard++) {
        const { kind, step, target, notes } = await lp.$eval(".lesson-stage", e => ({ kind: e.dataset.kind, step: e.dataset.step, target: Number(e.dataset.target || 0), notes: e.dataset.notes ? e.dataset.notes.split(",").map(Number) : [] }));
        const hzOf = n => SA * Math.pow(2, n / 12);
        const NOTE = SA * Math.pow(2, target / 12); // the step's note (Sa unless it asks for another)
        steps++;
        const st0 = Date.now();
        if (kind === "listen" || kind === "choose") await lp.evaluate(() => document.querySelector(".lesson-option, .lesson-choice").click());
        else if (kind === "quiz") {
          for (let q = 0; q < 12 && !(await isReady()); q++) {
            await lp.evaluate(() => { const b = [...document.querySelectorAll(".lesson-option")].find(x => !x.disabled && !x.classList.contains("wrong")); if (b) b.click(); });
            await sleep(80); await clickL(".lesson-stage button", /Next question/); await sleep(80);
          }
        } else if (kind === "cards") await lp.evaluate(() => document.querySelectorAll(".lesson-card").forEach(c => c.querySelector("button").click()));
        else if (kind === "form") await lp.evaluate(() => document.querySelectorAll(".lesson-chips").forEach(g => g.children[0].click()));
        else if (kind === "timer") { await clickL(".lesson-stage button", /^Start/); if (await clickL(".lesson-stage .linkbtn", /^Done early$/)) await sleep(50); else await lp.waitForFunction(() => !document.querySelector(".lesson-stage .stack[hidden]"), { timeout: 8000 }).catch(() => {}); await lp.evaluate(() => document.querySelectorAll(".lesson-stage input[type=checkbox]").forEach(c => c.click())); }
        else if (kind === "parts" || kind === "tapquiz") { for (let i = 0; i < 12 && !(await isReady()); i++) { const id = await lp.$eval(".lesson-stage .lesson-q b[data-part]", e => e.dataset.part).catch(() => null); if (!id) break; await tapPart(id); await sleep(50); } }
        else if (kind === "holes") { const goal = await lp.$eval(".lesson-stage [data-goal]", e => e.dataset.goal); for (let i = 0; i < 6; i++) { const closed = await lp.$eval(`.lesson-stage [data-part="h${i + 1}"]`, e => e.classList.contains("fl-closed")); if (closed !== (goal[i] === "X")) await tapPart("h" + (i + 1)); } await clickL(".lesson-stage button", /^Blow$/); }
        else if (kind === "beat") { await clickL(".lesson-stage button", /^Start$/); await sleep(3400); for (let i = 0; i < 8; i++) { await lp.evaluate(() => document.querySelector(".lesson-pad").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))); await sleep(833); } await waitReady(6000); }
        else if (kind === "breathe") { await clickL(".lesson-stage button", /^Start$/); await waitReady(15000); }
        else if (kind === "hiss") { await clickL(".lesson-stage button", /Start/); await intro(); await sleep(700); await tone(SA); await sleep(2500); await tone(0); await waitReady(5000); }
        else if (kind === "firstSound") { await clickL(".lesson-stage button", /Start/); await intro(); await sleep(400); for (let k = 0; k < 5 && !(await isReady()); k++) { await tone(NOTE); await sleep(1300); await tone(0); await sleep(500); } }
        else if (kind === "record") { await tone(SA); await clickL(".lesson-stage button", /Record/); await intro(); await waitReady(50000); await tone(0); }
        else if (kind === "hold") { await clickL(".lesson-stage .lv-primary", /Start/); await intro(); await sleep(300); const seq = notes.length ? notes : [target, target, target, target]; for (let k = 0; k < seq.length + 2 && !(await isReady()); k++) { await tone(hzOf(seq[Math.min(k, seq.length - 1)])); await lp.waitForFunction(() => /Held|held|Every|Well done/.test(document.querySelector(".lesson-stage .lv-msg").textContent) || !document.querySelector(".lesson-next").disabled, { timeout: 9000 }).catch(() => {}); await tone(0); await sleep(1500); } }
        else if (kind === "phrase") { await clickL(".lesson-stage .lv-primary", /Start/); await intro(); await sleep(400); for (let rep = 0; rep < 2 && !(await isReady()); rep++) { for (const n of notes) { await tone(hzOf(n)); await sleep(650); await tone(0); await sleep(180); } await sleep(1200); } if (!(await isReady())) { await waitReady(4000); await clickL(".lesson-stage .linkbtn", /Not yet/); } }
        else if (kind === "hum") { await clickL(".lesson-stage button", /Hear/); await sleep(900); await tone(NOTE); await clickL(".lesson-stage button", /Hum it/); await intro(); if (!(await waitReady(4000))) { await sleep(800); await clickL(".lesson-stage .linkbtn", /hummed/); } await tone(0); }
        else if (kind === "beats") { await clickL(".lesson-stage button", /Play/); await lp.evaluate(() => { const r = document.querySelector(".lesson-stage input[type=range]"); r.value = "0"; r.dispatchEvent(new Event("input", { bubbles: true })); }); await waitReady(4000); await clickL(".lesson-stage button", /Stop/); }
        else if (kind === "curves") { for (let k = 0; k < 20 && !(await isReady()); k++) { await lp.evaluate(() => { const b = [...document.querySelectorAll(".lesson-option")].find(x => !x.disabled); if (b) b.click(); }); await sleep(60); await clickL(".lesson-stage button", /Next one/); await sleep(60); } }
        else if (kind === "rhythm") { for (let k = 0; k < 8 && !(await isReady()); k++) { if (!(await clickL(".lesson-stage .linkbtn", /Next line/))) await clickL(".lesson-stage .btn.primary", /Start|Again|Next/); await sleep(400); for (let t = 0; t < 6; t++) { await lp.evaluate(() => document.querySelector(".lesson-pad").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))); await sleep(60); } await sleep(1200); } }
        else if (kind === "judge") { for (let k = 0; k < 8 && !(await isReady()); k++) { await clickL(".lesson-chip", /^A$/); await sleep(80); await clickL(".lesson-stage button", /Next pair/); await sleep(80); } }
        else if (kind === "rubric") await lp.evaluate(() => document.querySelectorAll(".lesson-stage .lesson-chips").forEach(g => g.children[1].click()));
        else if (kind === "order") { await lp.evaluate(() => { const filled = () => document.querySelectorAll(".lesson-stage .lesson-line .now").length; for (let guard = 0; guard < 200; guard++) { const bs = [...document.querySelectorAll(".lesson-stage .lesson-chips .lesson-chip:not(:disabled)")]; if (!bs.length) break; const before = filled(); for (const b of bs) { b.click(); if (filled() > before) break; } } }); }
        else if (kind === "complete") { for (let k = 0; k < 30 && !(await isReady()); k++) { await lp.evaluate(() => { const b = [...document.querySelectorAll(".lesson-stage .lesson-chip")].find(x => !x.disabled); if (b) b.click(); }); await sleep(60); await clickL(".lesson-stage button", /Next pattern/); await sleep(60); } }
        else if (kind === "overblow") { await clickL(".lesson-stage button", /Blow/); for (const v of ["80", "20", "80"]) { await lp.evaluate(v => { const r = document.querySelector(".lesson-stage input[type=range]"); r.value = v; r.dispatchEvent(new Event("input", { bubbles: true })); }, v); await sleep(150); } await waitReady(3000); await clickL(".lesson-stage button", /Stop/); }
        else if (kind === "fills") { await clickL(".lesson-stage button", /Start/); await intro(); for (let k = 0; k < 400 && !(await isReady()); k++) { const ph = await lp.evaluate(() => { const e = document.querySelector(".lesson-stage [data-phase]"); return e ? e.dataset.phase : ""; }); await tone(ph === "gap" ? NOTE : 0); await sleep(50); } await tone(0); }
        else if (kind === "energy") { await lp.evaluate(() => { const want = [1, 2, 3, 2, 4, 5]; document.querySelectorAll(".lesson-stage .lesson-energy-row").forEach((r, i) => r.querySelectorAll("button")[(want[i] || 3) - 1].click()); }); await clickL(".lesson-stage button", /Check the shape/); await waitReady(2000); }
        else if (kind === "plan") { await lp.evaluate(() => document.querySelectorAll(".lesson-stage textarea").forEach(t => { t.value = "A test plan"; t.dispatchEvent(new Event("input", { bubbles: true })); })); await waitReady(2000); }
        else if (kind === "tihai") { for (let k = 0; k < 10 && !(await isReady()); k++) { await lp.evaluate(() => { const g = document.querySelector(".lesson-stage .lesson-tihai"); g.children[Number(g.dataset.start) - 1].click(); }); await lp.waitForFunction(() => !document.querySelector(".lesson-next").disabled || [...document.querySelectorAll(".lesson-stage button")].some(b => /Next one/.test(b.textContent)), { timeout: 20000 }).catch(() => {}); await clickL(".lesson-stage button", /Next one/); await sleep(60); } }
        else if (kind === "clapwave") { await clickL(".lesson-stage .btn.primary", /Start/); await waitReady(30000); }
        else if (kind === "halfhole" && await lp.$eval(".lesson-stage input[type=range]", r => r.value === "0")) { await clickL(".lesson-stage button", /Play/); for (let v = 0; v <= 100; v += 5) { await lp.evaluate(v => { const r = document.querySelector(".lesson-stage input[type=range]"); r.value = String(v); r.dispatchEvent(new Event("input", { bubbles: true })); }, v); await sleep(40); } await waitReady(2000); await clickL(".lesson-stage button", /Stop/); }
        else if (kind === "halfhole") { await clickL(".lesson-stage button", /Play/); for (let v = 100; v >= 0 && !(await isReady()); v -= 2) { await lp.evaluate(v => { const r = document.querySelector(".lesson-stage input[type=range]"); r.value = String(v); r.dispatchEvent(new Event("input", { bubbles: true })); }, v); const c = await lp.$eval(".lesson-stage .lesson-note + .small", e => parseInt(e.textContent, 10)).catch(() => NaN); if (Math.abs(c) <= 8) { await waitReady(2500); } } await clickL(".lesson-stage button", /Stop/); }
        else if (kind === "bend") { await clickL(".lesson-stage button", /Start/); await intro(); await sleep(300); for (const c of [0, -20, 0, 20, 0]) { await tone(NOTE * Math.pow(2, c / 1200)); await sleep(1700); } await tone(0); await waitReady(3000); }
        else if (kind === "swell") { await clickL(".lesson-stage button", /Start/); await intro(); await sleep(200); await tone(NOTE); await waitReady(14000); await tone(0); }
        else if (kind === "dictate") { for (let k = 0; k < 12 && !(await isReady()); k++) { for (let j = 0; j < 9; j++) await lp.evaluate(() => { const b = document.querySelector(".lesson-stage .lesson-chips .lesson-chip"); if (b) b.click(); }); await clickL(".lesson-stage button", /^Check$/); await sleep(80); for (let j = 0; j < 9; j++) await clickL(".lesson-stage button", /^Undo$/); await clickL(".lesson-stage button", /Next phrase/); await sleep(80); } }
        else if (kind === "pick") { await clickL(".lesson-stage button", /^Check$/); await waitReady(1000); if (!(await isReady())) await clickL(".lesson-stage button", /^Check$/); }
        else if (kind === "ornament") { await clickL(".lesson-stage button", /Try it/); await intro(); await sleep(300); const seq = notes.length ? notes : [target]; if (seq.length === 1) { const t0 = Date.now(); while (Date.now() - t0 < 4500) { const x = (Date.now() - t0) / 1000; await tone(hzOf(seq[0]) * Math.pow(2, -0.4 * (1 - Math.cos(2 * Math.PI * x)) / 2 / 12)); await sleep(40); } } else for (const n of seq) { await tone(hzOf(n)); await sleep(700); } await tone(0); await waitReady(12000); }
        else if (kind === "improv") { await clickL(".lesson-stage button", /Start/); await intro(); await sleep(300); for (const n of notes.length ? notes : [0, 2, 4, 2, 0]) { await tone(hzOf(n)); await sleep(500); } await tone(0); await waitReady(8000); }
        else if (kind === "bhatkhande" || kind === "staff" || kind === "nyas" || kind === "styles") { for (let k = 0; k < 30 && !(await isReady()); k++) { await lp.evaluate(() => { const b = [...document.querySelectorAll(".lesson-stage .lesson-chip")].find(x => !x.disabled); if (b) b.click(); }); await sleep(60); await clickL(".lesson-stage button", /Next one/); await sleep(60); } }
        else if (kind === "answer") { for (let k = 0; k < 6 && !(await isReady()); k++) { await clickL(".lesson-stage button", /^ ?Answer$/); await intro(); await sleep(300); for (const n of [2, 4, 2, 0]) { await tone(hzOf(n)); await sleep(450); } await tone(0); await lp.waitForFunction(() => /Home|open/.test(document.querySelector(".lesson-stage").textContent) && !/Answer now/.test(document.querySelector(".lesson-stage").textContent), { timeout: 6000 }).catch(() => {}); await clickL(".lesson-stage button", /Next question/); await sleep(150); } }
        else if (kind === "compose") { for (const v of ["R", "G", "P", "G", "Hold", "R", "G", "Hold", "G", "P", "D", "P", "G", "R", "S", "Hold"]) await lp.evaluate(v => { const b = [...document.querySelectorAll(".lesson-stage .lesson-chip")].find(x => x.textContent === v); if (b) b.click(); }, v); await clickL(".lesson-stage button", /Save it/); }
        else if (kind === "higherlower") { for (let i = 0; i < 20 && !(await isReady()); i++) { await clickL(".lesson-stage button", /Play|Next pair/); await sleep(120); await clickL(".lesson-chip", /Higher/); await sleep(80); } }
        else if (kind === "custom") {
          // Custom steps: a skip link, or the main button (then wait).
          if (!(await isReady())) { if (!(await clickL(".lesson-stage .linkbtn", /Skip/))) await clickL(".lesson-stage .btn.primary", /./); await waitReady(8000); }
        }
        if (timing) console.log("    step " + ((Date.now() - st0) / 1000).toFixed(1) + " s: " + step + " (" + kind + ")");
        if (process.env.WALK_DEBUG) await lp.screenshot({ path: process.env.WALK_DEBUG + "/" + lesson.id + "-" + step + ".png" }).catch(() => {});
        if (!(await lp.$(".lesson-next"))) { stuck = step + " (" + kind + "): left the lesson, now at " + await lp.evaluate(() => location.hash); break; }
        if (!(await isReady())) { stuck = step + " (" + kind + ")"; break; }
        const last = await lp.$eval(".lesson-count", e => { const [a, b] = e.textContent.split("/").map(Number); return a === b; });
        await lp.evaluate(() => document.querySelector(".lesson-next").click());
        if (last) break;
        await lp.waitForFunction(st => document.querySelector(".lesson-stage") && document.querySelector(".lesson-stage").dataset.step !== st, { timeout: 4000 }, step).catch(() => {});
        await sleep(100);
      }
      await lp.waitForSelector(".lesson-end", { timeout: 5000 }).catch(() => {});
      const st = await lp.evaluate(() => JSON.parse(localStorage.getItem("bansuri.progress") || "{}"));
      check(!stuck && st.current === lesson.day + 1 && st.days && st.days[lesson.day] && st.days[lesson.day].done,
        "lesson " + lesson.id + " (Day " + lesson.day + ", " + steps + " steps): walked through; Day " + (lesson.day + 1) + " opens" + (stuck ? " - stuck at " + stuck : ""));
      if (lesson.review) {
        const r = st.reviews && st.reviews["EX-MEL-1.1"], logged = (st.log || []).map(l => l.note).join(" ");
        check(r && r.stage === 1 && r.done === 1, "review day " + lesson.day + ": the piece played moves along its review schedule");
        check(/Quiz \d\/6/.test(logged), "review day " + lesson.day + ": the quiz score goes in the practice log");
      }
      check(!errs.length, "lesson " + lesson.id + ": no page errors" + (errs.length ? ": " + errs[0] : ""));
      await ctx.close();
      if (timing) console.log("  TIME " + ((Date.now() - lt0) / 1000).toFixed(1) + " s (fixed sleeps " + ((slept - ls0) / 1000).toFixed(1) + " s): lesson " + lesson.id + ", " + steps + " steps");
    }
  });
  await section("Tone check", async () => {
    await go("/tone");
    check(/tone check: let the app listen/.test(await text()), "tone: the Tone check opens in the Coach");
    await page.evaluate(() => [...document.querySelectorAll("#main button")].find(b => /Hold a note now/.test(b.textContent)).click());
    await page.waitForFunction(() => /out of 10|No steady note|could not be read/.test(document.querySelector("#main").textContent), { timeout: 30000 }).catch(() => {});
    check(/out of 10|No steady note/.test(await page.$eval("#main", e => e.textContent)), "tone: a check with the (fake) microphone ends in a result or a clear message");
  });
  await section("Standalone bench pages", async () => {
    for (const f of ["interactive-flute.html", "practice-bench.html"]) {
      await page.goto(BASE + "bansuri-mastery/tools/" + f, { waitUntil: "networkidle0" });
      await page.evaluate(() => { const b = document.querySelector('.bb-tabs button[data-tab="tones"]'); if (b) b.click(); });
      await sleep(300);
      check(await page.$(".lv-hold") !== null, f + ": loads, and the long-tone meter (shared widgets) works");
    }
    // The flute is played directly: tapping a hole closes it; Enter on a focused hole changes it too.
    await page.evaluate(() => document.querySelector(".bb-flute [data-ref=hole3]").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    check(await page.$eval(".bb-flute [data-ref=hole3]", e => e.getAttribute("aria-label")) === "Hole 4: closed" && await page.$(".bb-holebtn") === null, "flute: tapping hole 4 on the flute closes it (no separate buttons)");
    await page.evaluate(() => document.querySelector(".bb-flute [data-ref=hole3]").focus()); await page.keyboard.press("Enter");
    check(await page.$eval(".bb-flute [data-ref=hole3]", e => e.getAttribute("aria-label")) === "Hole 4: half closed", "flute: Enter on a focused hole half-closes it");

  });
  await section("No stray null, undefined or NaN on any screen", async () => {
    const bad = [];
    for (const r of ["/today", "/session/0", "/session/2", "/plan", "/bench", "/coach", "/listen", "/songs", "/transcribe", "/tone", "/ornaments", "/play", "/compose", "/quick", "/progress", "/journal", "/settings", "/review", "/read/ragas/yaman.md", "/skills", "/skills/tone", "/skills/notes", "/skills/rhythm", "/skills/ornaments", "/skills/ear", "/course/milestones", "/music/ragas", "/music/mine", "/me/flute"]) {
      await go(r);
      const hits = await page.evaluate(() => { const out = []; const w = document.createTreeWalker(document.querySelector("#main"), NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (/null|undefined|NaN/.test(n.nodeValue)) out.push(n.nodeValue.trim().slice(0, 60)); return out; });
      if (hits.length) bad.push(r + ": " + hits.join(" | "));
    }
    check(!bad.length, "no screen shows null, undefined or NaN as text" + (bad.length ? " (" + bad.join("; ") + ")" : ""));
  });
  await section("Accessibility (axe-core: WCAG 2.1 A and AA rules)", async () => {
    {
      const axeSrc = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "node_modules", "axe-core", "axe.min.js"), "utf8");
      for (const route of ["/today", "/session/2", "/play", "/listen", "/compose", "/quick", "/transcribe", "/tone", "/ornaments", "/review", "/settings", "/bench", "/plan", "/progress", "/journal", "/coach", "/skills", "/skills/tone", "/course/milestones", "/music/ragas", "/music/mine", "/me/flute"]) {
        await go(route);
        await sleep(400);
        await page.evaluate(axeSrc);
        const res = await page.evaluate(async () => {
          const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
          return r.violations.filter(v => v.impact === "serious" || v.impact === "critical").map(v => v.id + " (" + v.nodes.length + "): " + v.nodes.slice(0, 2).map(n => n.target.join(" ") + (v.id === "color-contrast" ? " [" + ((n.any[0] || {}).message || "") + "]" : "")).join(", "));
        });
        check(res.length === 0, route + ": no serious accessibility problems" + (res.length ? ":\n    " + res.join("\n    ") : ""));
      }
    }

  });
  await section("Phone layout (iPhone 13 emulation: size, touch, user agent; the engine is still Chromium)", async () => {
    await page.emulate(KnownDevices["iPhone 13"]);
    for (const [route, name] of [["/today", "05-phone-today"], ["/session/2", "06-phone-session"], ["/bench", "07-phone-bench"], ["/coach", "09-phone-coach"], ["/journal", "10-phone-journal"], ["/plan", "11-phone-plan"], ["/milestone/M1", "12-phone-milestone"], ["/skills", "13-phone-skills"], ["/skills/tone", "14-phone-skill-tone"], ["/music/ragas", "15-phone-ragas"], ["/progress", "13-phone-progress"], ["/settings", "14-phone-settings"], ["/listen", "18-phone-listen"], ["/play", "15-phone-play"], ["/compose", "16-phone-compose"], ["/quick", "17-phone-quick"], ["/transcribe", "19-phone-transcribe"]]) {
      await go(route);
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(ov <= 1, route + " fits an iPhone screen (" + ov + "px overflow)");
      await shot(name);
    }
  });
} catch (e) {
  failures++;
  console.log("  FAIL exception: " + e.message);
} finally {
  // The docs theme asks api.github.com for repo stats; that third-party call is not ours to test.
  // MediaPipe logs its normal start-up ("Created TensorFlow Lite XNNPACK delegate") as a console error.
  const relevant = errors.filter((e, i, all) => !/AudioContext was not allowed to start/.test(e) && !/XNNPACK|TensorFlow Lite|Graph successfully started|gl_context|OpenGL error checking/.test(e) && !/api.github.com/.test(e) && !/favicon\.ico/.test(e) && !(/Failed to load resource/.test(e) && all.some(x => /api.github.com|favicon.ico/.test(x))));
  check(relevant.length === 0, "no console errors, page errors or failed requests" + (relevant.length ? ":\n    " + relevant.slice(0, 10).join("\n    ") : ""));
  if (process.env.I18N_COLLECT) fs.writeFileSync(process.env.I18N_COLLECT, JSON.stringify([...i18nSeen].sort(), null, 1));
  await browser.close();
  server.close();
}
console.log(failures ? failures + " check(s) failed" : "smoke test passed");
process.exit(failures ? 1 : 0);
