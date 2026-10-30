// Convert the bundled Ogg samples to AAC (.m4a) so iPhones play them, using headless Chrome's
// MediaRecorder (no ffmpeg needed). Plays each file in real time, so it takes as long as the audio.
// Usage: node scripts/convert_audio.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const AUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "app", "audio");
const FILES = ["bansuri-e-bass-sample.ogg", "bansuri-small-e-sample.ogg"];

const server = http.createServer((req, res) => {
  if (req.url === "/index") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<!doctype html><title>convert</title>"); return; }
  const f = path.join(AUDIO, path.basename(decodeURIComponent(req.url)));
  if (!f.endsWith(".ogg") || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": "audio/ogg" });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;
const exe = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].filter(Boolean).find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });

await Promise.all(FILES.map(async name => {
  const page = await browser.newPage();
  await page.goto(base + "index");
  page.setDefaultTimeout(0);
  const b64 = await page.evaluate(async url => {
    const ctx = new AudioContext({ sampleRate: 44100 });
    const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
    const dest = ctx.createMediaStreamDestination();
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(dest);
    const rec = new MediaRecorder(dest.stream, { mimeType: "audio/mp4;codecs=mp4a.40.2", audioBitsPerSecond: 96000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise(r => { rec.onstop = r; });
    rec.start(1000);
    src.start();
    await new Promise(r => { src.onended = r; });
    await new Promise(r => setTimeout(r, 300));
    rec.stop(); await done;
    const bytes = new Uint8Array(await new Blob(chunks, { type: "audio/mp4" }).arrayBuffer());
    let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, base + name);
  const out = path.join(AUDIO, name.replace(/\.ogg$/, ".m4a"));
  fs.writeFileSync(out, Buffer.from(b64, "base64"));
  console.log("wrote", path.relative(process.cwd(), out), fs.statSync(out).size, "bytes");
}));
await browser.close();
server.close();
