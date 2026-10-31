// The separation model in a real browser (headless Chrome), end to end: the page offers it, the
// model "downloads" (served from a local copy: DEMUCS_MODEL=path/to/htdemucs_embedded.onnx, so no
// 172 MB download), separates, and Singer gives the singer's notes. Not in CI (it needs the
// model file and takes minutes).
//
//   DEMUCS_MODEL=... node tests/separate-browser.mjs path/to/song.wav [seconds]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const MODEL = process.env.DEMUCS_MODEL, SONG = process.argv[2], SECONDS = Number(process.argv[3] || 30);
if (!MODEL || !SONG) { console.log("usage: DEMUCS_MODEL=model.onnx node tests/separate-browser.mjs song.wav [seconds]"); process.exit(0); }
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".md": "text/markdown", ".wasm": "application/wasm" };
const server = http.createServer((req, res) => {
  if (req.url === "/__model") { res.writeHead(200, { "Content-Type": "application/octet-stream", "Access-Control-Allow-Origin": "*", "Content-Length": fs.statSync(MODEL).size }); fs.createReadStream(MODEL).pipe(res); return; }
  let f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const exe = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--enable-unsafe-webgpu", "--autoplay-policy=no-user-gesture-required"] });
await (await browser.target().createCDPSession()).send("Browser.setDownloadBehavior", { behavior: "deny" });
const page = await browser.newPage();
page.on("pageerror", e => console.log("pageerror: " + e.message));
// A short WAV from the song (the first SECONDS).
const b = fs.readFileSync(SONG);
let p = 12, fmt = null, data = null;
while (p + 8 <= b.length) { const id = b.toString("ascii", p, p + 4), len = b.readUInt32LE(p + 4); if (id === "fmt ") fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12) }; if (id === "data") { data = b.subarray(p + 8, p + 8 + len); } p += 8 + len + (len & 1); }
const bytes = Math.min(data.length, SECONDS * fmt.sr * fmt.ch * 2), clip = Buffer.alloc(44 + bytes);
clip.write("RIFF", 0); clip.writeUInt32LE(36 + bytes, 4); clip.write("WAVEfmt ", 8); clip.writeUInt32LE(16, 16); clip.writeUInt16LE(1, 20); clip.writeUInt16LE(fmt.ch, 22); clip.writeUInt32LE(fmt.sr, 24); clip.writeUInt32LE(fmt.sr * fmt.ch * 2, 28); clip.writeUInt16LE(fmt.ch * 2, 32); clip.writeUInt16LE(16, 34); clip.write("data", 36); clip.writeUInt32LE(bytes, 40);
data.copy(clip, 44, 0, bytes);
const clipPath = path.join(os.tmpdir(), "bansuri-separate-clip.wav");
fs.writeFileSync(clipPath, clip);

await page.goto(BASE + "#/transcribe", { waitUntil: "networkidle0" });
// The model is put in the browser's cache from the local file (as if downloaded before), under the
// address the worker asks for.
const modelUrl = /MODEL_URL = "([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "app/js/separate-worker.js"), "utf8"))[1];
await page.evaluate(async url => { const res = await fetch("/__model"); const c = await caches.open("demucs-model-v1"); await c.put(url, new Response(await res.blob())); }, modelUrl);
console.log("model in the cache");
await page.reload({ waitUntil: "networkidle0" });
console.log("webgpu in the page: " + await page.evaluate(() => !!navigator.gpu));
await (await page.$("#tr-file")).uploadFile(clipPath);
await page.waitForFunction(() => /^Done/.test((document.querySelector("#main [role=status]") || {}).textContent || ""), { timeout: 120000 });
await page.evaluate(() => [...document.querySelectorAll("#main .partseg .seg-btn")].find(b => b.textContent === "Singer").click());
await page.waitForFunction(() => /Separate with the model/.test((document.querySelector("#main .sepbox") || {}).textContent || ""), { timeout: 60000 }).catch(async () => {
  console.log("sepbox: " + await page.$eval("#main .sepbox", e => e.textContent).catch(() => "none"));
  console.log("cache has it: " + await page.evaluate(async url => !!(await (await caches.open("demucs-model-v1")).match(url)), modelUrl));
  throw new Error("the model was not seen as kept");
});
const t0 = Date.now();
await page.evaluate(() => [...document.querySelectorAll("#main .sepbox button")].find(b => /separate/i.test(b.textContent)).click());
let lastNote = "";
for (;;) {
  const st = await page.evaluate(() => ({ note: (document.querySelector("#main .partpick p") || {}).textContent || "", done: /separated by the model/.test((document.querySelector("#main .sepbox") || {}).textContent || "") }));
  if (st.note !== lastNote && /%/.test(st.note)) { lastNote = st.note; process.stdout.write("\r" + st.note.slice(0, 100).padEnd(100)); }
  if (st.done) break;
  if (Date.now() - t0 > 30 * 60000) throw new Error("timed out");
  await new Promise(r => setTimeout(r, 1000));
}
console.log("\nseparated " + SECONDS + " s of audio in " + ((Date.now() - t0) / 1000).toFixed(0) + " s");
const notation = await page.$eval("#main textarea[aria-label^='Notation']", e => e.value);
console.log("singer's notation:\n" + notation.split("\n").slice(0, 8).join("\n"));
const cached = await page.evaluate(async () => !!(await (await caches.open("demucs-model-v1")).keys()).length);
console.log("model kept in the browser's cache: " + cached);
fs.unlinkSync(clipPath);
await browser.close(); server.close();
