// The app in WebKit, the engine of Safari on iPhone (Playwright's WebKit build, iPhone 13 size and
// touch). Catches Safari-only breakage: unsupported JavaScript or CSS, audio start-up, layout.
// The microphone cannot be faked in WebKit, so listening is covered by the Chrome smoke test.
// Usage: node tests/webkit.mjs  (first time: npx playwright-core install webkit)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webkit, devices } from "playwright-core";

const ROOT = process.env.SITE_ROOT ? path.resolve(process.env.SITE_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".png": "image/png", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json", ".m4a": "audio/mp4", ".ogg": "audio/ogg" };
const server = http.createServer((req, res) => {
  let f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

let failures = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) failures++; };
const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const go = async route => { await page.goto(BASE + "#" + route); await page.waitForLoadState("networkidle"); await sleep(500); };
try {
  console.log("WebKit (Safari engine), iPhone 13");
  await go("/today");
  check(await page.locator("#main .firstrun .btn.primary").count() === 1, "first run: the welcome and Start Day 0 render");
  await page.evaluate(() => localStorage.setItem("bansuri.progress", JSON.stringify({ current: 12, startedAt: "2026-10-01", prefs: { howChosen: true } })));
  await page.reload(); await page.waitForLoadState("networkidle"); await sleep(500);
  check(await page.locator("#main .resume").count() === 1 && await page.locator("#main .progresscard").count() === 1, "today: the Resume card and the progress card render");
  for (const [route, sel] of [["/session/12", "#main .block"], ["/plan", "#main .pathhead"], ["/library", "#main .catcard"], ["/read/lessons/L09-fingering-sa-re-ga.md", "#main .lcard"],
    ["/bench", ".bb-flute"], ["/play", "#main .gamecard"], ["/listen", "#main .listentile"], ["/songs", "#main .song"], ["/coach", "#main"], ["/journal", "#main .card"], ["/progress", "#main .headline"], ["/settings", "#main .hublist"], ["/compose", "#main .ccell"], ["/quick", "#main .lv-hold"]]) {
    await go(route);
    const n = await page.locator(sel).count();
    const broken = await page.locator("#main").innerText().then(t => /Something went wrong/.test(t));
    check(n > 0 && !broken, route + " renders");
  }
  // Interactions that touch Safari-specific code paths: audio start-up, SVG controls, a session step.
  await go("/bench");
  await page.locator(".bb-flute [data-ref=hole3]").dispatchEvent("click");
  check(await page.locator(".bb-flute [data-ref=hole3]").getAttribute("aria-label") === "Hole 4: closed", "bench: tapping a hole on the flute closes it");
  await page.locator(".bb-blow").dispatchEvent("pointerdown"); await sleep(400); await page.locator(".bb-blow").dispatchEvent("pointerup");
  check(true, "bench: blowing starts and stops the flute sound without an error");
  await go("/session/12");
  const ids = await page.locator("#main .block").evaluateAll(b => b.map(x => x.dataset.id));
  await page.locator(`#main .block[data-id="${ids[1]}"] > header`).click();
  check(await page.locator("#main .block.active").getAttribute("data-id") === ids[1], "session: tapping a step row opens it");
  await go("/today");
  await page.keyboard.press("/"); await sleep(300);
  check(await page.locator(".palette input").count() === 1, "search opens with /");
  await page.keyboard.press("Escape");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(overflow <= 1, "no sideways scrolling on an iPhone screen (" + overflow + "px)");
} catch (e) { failures++; console.log("  FAIL exception: " + e.message); }
finally {
  const relevant = errors.filter(e => !/AudioContext|NotAllowedError|api.github.com|favicon|Failed to load resource|AdwaitaLayoutTraits|Button failed to load|audio unavailable/.test(e));
  check(relevant.length === 0, "no page errors" + (relevant.length ? ":\n    " + relevant.slice(0, 8).join("\n    ") : ""));
  await browser.close(); server.close();
}
console.log(failures ? failures + " check(s) failed" : "webkit test passed");
process.exit(failures ? 1 : 0);
