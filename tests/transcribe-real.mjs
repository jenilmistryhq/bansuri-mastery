// Notation from a recording, on real bansuri recordings (app/audio) with a known answer: runs the
// transcriber in a real browser (to decode mp3/ogg) and scores Sa and the notes. Prints a table;
// fails if a scale is not mostly right. Usage: node tests/transcribe-real.mjs [--verbose]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".m4a": "audio/mp4" };
const server = http.createServer((req, res) => {
  if (req.url === "/blank") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<!doctype html><title>t</title>"); return; }
  const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
// Exported files (CSV, backups, WAV) are checked in memory; the browser saves nothing to Downloads.
await (await browser.target().createCDPSession()).send("Browser.setDownloadBehavior", { behavior: "deny" });
const page = await browser.newPage();
await page.goto(BASE + "blank");

// Expected: Sa's pitch class (or classes: sankalp's flute sits between E and F, about 50 cents
// below F, and the player sags further while playing) and the notes in sargam, in order. null: just print.
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
const UP_DOWN = MAJOR.concat(MAJOR.slice().reverse());
const CASES = [
  ["bansuri-major-scale-sankalp.mp3", [4, 5], UP_DOWN, "F major scale (Sa between E and F)"],
  ["bansuri-major-scale-staccato-sankalp.mp3", [4, 5], UP_DOWN, "F major scale, staccato"],
  ["bansuri-sargam-sa-to-taar-sa-roguentropy.mp3", null, MAJOR.concat(MAJOR.slice(0, -1).reverse()), "S to S' and back"],
  ["bansuri-raag-jog-phrase-ninad-p.mp3", null, null, "a phrase in Jog"],
  ["carnatic-flute-mayamalavagowla.ogg", null, null, "Mayamalavagowla (8-hole flute)"],
  ["bansuri-e-bass-sample.ogg", [4], null, "E bass sample (a tune)"],
  ["bansuri-small-e-sample.ogg", [4], null, "small E sample (a tune)"],
  ["bansuri-sa-three-octaves-sankalp.mp3", [4, 5], null, "Sa in three octaves"],
];

const verbose = process.argv.includes("--verbose");
let failed = 0;
for (const [file, saPc, want, label] of CASES) {
  const r = await page.evaluate(async (url) => {
    const T = await import("/app/js/transcribe.js");
    const buf = await (await fetch(url)).arrayBuffer();
    const c = new OfflineAudioContext(1, 1, 44100), audio = await c.decodeAudioData(buf);
    const ch = []; for (let i = 0; i < audio.numberOfChannels; i++) ch.push(audio.getChannelData(i));
    const { data, sr } = T.monoDown(ch, audio.sampleRate);
    const t0 = performance.now();
    const tr = await T.pitchTrack(data, sr);
    const ms = performance.now() - t0;
    const res = T.transcribe(tr.track, tr.levels, { sameKey: false });
    const L = ["S", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"];
    const semis = res.notes.map(n => n.midi - res.sa);
    return { tonics: res.tonics.slice(0, 4).map(c => L[c.pc] + "/" + ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][c.pc] + " " + c.score).join(", "), sa: res.sa, saPc: ((res.sa % 12) + 12) % 12, semis, codes: semis.map(s => (s < 0 ? "." : "") + L[((s % 12) + 12) % 12] + (s >= 12 ? "'" : "")).join(" "), notation: res.notation, secs: audio.duration, ms: Math.round(ms), bpm: res.bpm };
  }, BASE + "app/audio/" + file);
  // Sargam of the notes against the detected Sa when it is one of the expected ones, else the first expected.
  const saRight = saPc === null || saPc.includes(r.saPc);
  const notes = saRight ? r.semis : r.semis.map(s => s + (r.saPc - saPc[0]));
  const L = ["S", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"];
  const shown = notes.map(s => L[((s % 12) + 12) % 12]).join(" ");
  let score = "";
  if (want) {
    const got = notes.map(s => ((s % 12) + 12) % 12), w = want.map(s => ((s % 12) + 12) % 12);
    const D = Array.from({ length: got.length + 1 }, (_, i) => [i, ...new Array(w.length).fill(0)]);
    for (let j = 1; j <= w.length; j++) D[0][j] = j;
    for (let i = 1; i <= got.length; i++) for (let j = 1; j <= w.length; j++) D[i][j] = Math.min(D[i - 1][j - 1] + (got[i - 1] === w[j - 1] ? 0 : 1), D[i - 1][j] + 1, D[i][j - 1] + 1);
    const err = D[got.length][w.length] / w.length;
    score = " | note error " + Math.round(err * 100) + "%";
    if (err > 0.25) failed++;
  }
  // A major scale: the notes found should all be in the scale (relative to the expected Sa).
  if (saPc !== null && label.includes("major")) {
    const out = notes.filter(s => !MAJOR.includes(((s % 12) + 12) % 12)).length;
    score += " | " + out + " of " + notes.length + " notes outside the scale";
    if (out / Math.max(1, notes.length) > 0.2 || notes.length < 7) failed++;
  }
  const saOk = saPc === null ? "" : saRight ? " Sa right" : " Sa WRONG (" + r.saPc + ")";
  if (!saRight) failed++;
  console.log(label + " (" + r.secs.toFixed(1) + " s, " + r.ms + " ms):" + saOk + score);
  console.log("   " + shown);
  if (verbose) console.log("   Sa candidates: " + r.tonics);
  if (verbose) console.log("   octaves: " + r.codes + "\n   " + r.notation.replace(/\n/g, "\n   "));
}
await browser.close(); server.close();
console.log(failed ? failed + " real-recording check(s) failed" : "real-recording checks passed");
process.exit(failed ? 1 : 0);
