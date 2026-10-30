// Visual regression check: screenshots of key screens (phone and wide, dark and light) with a fixed
// date and fixed progress, compared pixel by pixel with saved baselines.
// Usage: node tests/visual.mjs --update   (save new baselines after an intended change)
//        node tests/visual.mjs            (compare; fails if a screen changed more than THRESHOLD)
// Baselines live in tests/visual/ and are machine-specific (fonts render differently per OS),
// so this is a local check, not part of CI.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "tests", "visual");
const UPDATE = process.argv.includes("--update");
const THRESHOLD = 0.002; // share of pixels that may differ (anti-aliasing noise)
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".md": "text/markdown", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".png": "image/png", ".jpg": "image/jpeg" };

const STATE = { current: 40, startedAt: "2026-09-10", prefs: { howChosen: true },
  log: [{ date: "2026-10-27", minutes: 40, day: 38 }, { date: "2026-10-28", minutes: 45, day: 39 }],
  days: { 40: { blocks: { W: true, T: true } } }, badges: { setup: "2026-09-10", "week-one": "2026-09-20" },
  milestones: { M0: { status: "passed", attempts: [] }, M1: { status: "passed", attempts: [] } },
  xp: { total: 3820, day: "2026-10-30", caps: {}, once: {}, recent: [], days: { "2026-10-28": 150 }, seen: 4 } };
const SCREENS = [["today", "/today"], ["session", "/session/40"], ["plan", "/plan"], ["bench", "/bench"], ["play", "/play"], ["progress", "/progress"]];
const SIZES = [["phone", 390, 844], ["wide", 1366, 860]];
const THEMES = ["dark", "light"];

const server = http.createServer((req, res) => {
  let f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const exe = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].filter(Boolean).find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: exe, headless: true });
const page = await browser.newPage();
// A fixed clock (the week strip, quests and dates depend on it) and no animations.
await page.evaluateOnNewDocument(() => {
  const fixed = new Date("2026-10-30T12:00:00").getTime(), RealDate = Date;
  class FixedDate extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } }
  globalThis.Date = FixedDate;
});
fs.mkdirSync(DIR, { recursive: true });
let changed = 0, compared = 0;
for (const theme of THEMES) for (const [size, w, hgt] of SIZES) {
  await page.setViewport({ width: w, height: hgt, deviceScaleFactor: 1, isMobile: w < 600 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }, { name: "prefers-reduced-motion", value: "reduce" }]);
  for (const [name, route] of SCREENS) {
    await page.goto(BASE, { waitUntil: "networkidle0" });
    await page.evaluate(s => { localStorage.clear(); localStorage.setItem("bansuri.progress", JSON.stringify(s)); localStorage.setItem("bansuri.bench.howtoSeen", "1"); }, STATE);
    await page.goto(BASE + "#" + route, { waitUntil: "networkidle0" });
    await page.reload({ waitUntil: "networkidle0" });
    await new Promise(r => setTimeout(r, 900));
    await page.evaluate(() => { document.querySelectorAll(".toasts, .caption").forEach(t => t.remove()); });
    const file = path.join(DIR, `${name}-${size}-${theme}.png`);
    const shot = await page.screenshot();
    if (UPDATE || !fs.existsSync(file)) { fs.writeFileSync(file, shot); continue; }
    const a = PNG.sync.read(fs.readFileSync(file)), b = PNG.sync.read(shot);
    compared++;
    if (a.width !== b.width || a.height !== b.height) { changed++; console.log("  CHANGED (size) " + path.basename(file)); continue; }
    const diff = new PNG({ width: a.width, height: a.height });
    const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
    const share = n / (a.width * a.height);
    if (share > THRESHOLD) { changed++; fs.writeFileSync(file.replace(/\.png$/, ".diff.png"), PNG.sync.write(diff)); console.log(`  CHANGED ${path.basename(file)}: ${(share * 100).toFixed(2)}% of pixels (see .diff.png)`); }
  }
}
await browser.close(); server.close();
if (UPDATE) console.log("baselines saved in tests/visual/");
else { console.log(changed ? changed + " of " + compared + " screens changed" : "visual check passed (" + compared + " screens)"); process.exit(changed ? 1 : 0); }
