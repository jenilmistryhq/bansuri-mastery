// The app's voice: natural neural speech only, never the robotic device voice.
// 1. Known text (prompts, feedback, note names, numbers, every session step) plays clips made at
//    build time with Kokoro-82M (scripts/build_voice.py): app/voice/<lang>/<hash>.mp3, listed in
//    app/voice/<lang>/index.json. Instant, offline once played (the service worker keeps them).
// 2. Any other English text (a lesson card) is spoken by Kokoro running in the browser
//    (tts-worker.js), after a one-time model download the learner agrees to.
// Every spoken line is also shown as a caption, and the microphone is kept deaf while the app talks.
import { ac, master } from "./core/audio.js";
import { muteListening } from "./core/listen.js";
import { getSettings } from "./core/settings.js";
import { h, icon } from "./util.js";

const indexes = {};
const buffers = new Map();
let playing = [], gen = 0, captionEl = null, captionTimer = 0;

export const lang = () => getSettings().lang;
export const talkOn = () => getSettings().talk;

function index(l) {
  if (!indexes[l]) indexes[l] = fetch("app/voice/" + l + "/index.json").then(r => r.ok ? r.json() : null).catch(() => null);
  return indexes[l];
}

function decode(url) {
  if (!buffers.has(url)) {
    const p = fetch(url).then(r => { if (!r.ok) throw new Error("clip " + r.status); return r.arrayBuffer(); }).then(b => ac().decodeAudioData(b));
    p.catch(() => buffers.delete(url));
    buffers.set(url, p);
  }
  return buffers.get(url);
}

// A reference to a clip: "good" (a phrase id), ["note", semi, "hold"|"is"|"next"|"play"|"name"],
// ["secs", 8], ["num", 12], ["step", originalStepText], or { text } for free text.
function lookup(idx, ref) {
  if (!idx) return null;
  if (typeof ref === "string") return idx.phrases[ref] || null;
  if (!Array.isArray(ref)) return null;
  const [kind, a, b] = ref;
  if (kind === "note") return idx.notes[a + ":" + (b || "name")] || null;
  if (kind === "secs") return idx.secs[String(Math.max(1, Math.min(60, Math.round(a))))] || null;
  if (kind === "num") return idx.nums[String(Math.max(0, Math.min(100, Math.round(a))))] || null;
  if (kind === "step") return idx.steps[a] || null;
  return null;
}

// The text a reference speaks, in the current language (for captions and Hindi step text).
export async function textOf(ref) {
  const hit = lookup(await index(lang()), ref);
  return hit ? hit[1] : null;
}

function caption(text, seconds) {
  if (!text) return;
  if (!captionEl) {
    captionEl = h("div", { class: "caption", role: "status", "aria-live": "polite" });
    document.body.append(captionEl);
  }
  captionEl.textContent = text;
  captionEl.hidden = false;
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => { if (captionEl) captionEl.hidden = true; }, Math.max(1500, seconds * 1000 + 600));
}

export function stopSpeaking() {
  gen++;
  playing.forEach(s => { try { s.stop(); } catch (e) { /* already stopped */ } });
  playing = [];
  if (captionEl) captionEl.hidden = true;
  if (reader) reader.stop();
}

// Speaks clips one after another (interrupting anything already speaking). Resolves when done,
// or false when nothing could be spoken. Always speaks: use say() for spoken prompts that follow
// the learner's "Talk to me" setting.
export async function speak(...refs) {
  stopSpeaking();
  const my = gen;
  const idx = await index(lang());
  const hits = refs.flat(0).map(r => lookup(idx, r)).filter(Boolean);
  if (!hits.length || my !== gen) return false;
  let bufs;
  try { bufs = await Promise.all(hits.map(x => decode("app/voice/" + lang() + "/" + x[0]))); } catch (e) { return false; }
  if (my !== gen) return false;
  const c = ac();
  // Without a tap on the page yet, audio cannot start; never wait forever for it.
  if (c.state !== "running") { try { await Promise.race([c.resume(), new Promise(r => setTimeout(r, 300))]); } catch (e) { /* needs a tap */ } }
  let t = c.currentTime + 0.05;
  for (const b of bufs) {
    const s = c.createBufferSource(); s.buffer = b; s.connect(master()); s.start(t);
    playing.push(s); t += b.duration + 0.04;
  }
  const total = t - c.currentTime;
  muteListening(t + 0.2);
  caption(hits.map(x => x[1]).join(" "), total);
  await new Promise(r => setTimeout(r, total * 1000));
  if (my === gen) playing = [];
  return my === gen;
}

// Spoken prompts and feedback: only when the learner turned "Talk to me" on.
export function say(...refs) { return talkOn() ? speak(...refs) : Promise.resolve(false); }

// ---------- Free text with Kokoro in the browser (English) ----------
const MODEL_KEY = "bansuri.voice.model";
export const modelReady = () => { try { return localStorage.getItem(MODEL_KEY) === "ready"; } catch (e) { return false; } };
let worker = null, jobs = new Map(), jobId = 0, onProgress = null;
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./tts-worker.js", import.meta.url), { type: "module" });
  worker.addEventListener("message", e => {
    const m = e.data || {};
    if (m.type === "progress" && onProgress) onProgress(m.progress);
    else if (m.type === "ready") { try { localStorage.setItem(MODEL_KEY, "ready"); } catch (x) { /* storage unavailable */ } }
    else if (m.type === "audio" || m.type === "error") {
      const j = jobs.get(m.id); if (!j) return; jobs.delete(m.id);
      if (m.type === "audio") j.resolve({ pcm: new Float32Array(m.pcm), rate: m.sampleRate }); else j.reject(new Error(m.message));
    }
  });
  worker.addEventListener("error", e => { jobs.forEach(j => j.reject(new Error(e.message || "voice worker stopped"))); jobs.clear(); worker = null; });
  return worker;
}
function synth(text) {
  return new Promise((resolve, reject) => { const id = ++jobId; jobs.set(id, { resolve, reject }); getWorker().postMessage({ type: "synthesize", id, text, voice: "af_heart", speed: 0.95 }); });
}
// Short sentences: the first is heard quickly and the rest are made while it plays.
export function sentences(text) {
  const clean = String(text).replace(/\s+/g, " ").replace(/`/g, "").trim();
  const parts = clean.match(/[^.!?;:]+[.!?;:]*\s*/g) || [];
  const out = [];
  for (const p of parts) { const s = p.trim(); if (!s) continue; if (out.length && (out[out.length - 1].length + s.length < 160)) out[out.length - 1] += " " + s; else out.push(s); }
  return out;
}
const spokenCache = new Map();
let reader = null;
// Reads any English text aloud. progress(p) reports the first-time model download.
export function readAloud(text, progress) {
  stopSpeaking();
  const my = gen;
  onProgress = progress || null;
  const list = sentences(text);
  const c = ac();
  let stopped = false, src = null;
  reader = { stop() { stopped = true; if (src) try { src.stop(); } catch (e) { /* stopped */ } } };
  const gen1 = s => { if (!spokenCache.has(s)) { const p = synth(s); p.catch(() => spokenCache.delete(s)); spokenCache.set(s, p); } return spokenCache.get(s); };
  return (async () => {
    for (let i = 0; i < list.length; i++) {
      const a = await gen1(list[i]);
      if (i + 1 < list.length) gen1(list[i + 1]);
      if (stopped || my !== gen) return false;
      const b = c.createBuffer(1, a.pcm.length, a.rate); b.copyToChannel(a.pcm, 0);
      src = c.createBufferSource(); src.buffer = b; src.connect(master()); src.start();
      muteListening(c.currentTime + b.duration + 0.2);
      caption(list[i], b.duration);
      await new Promise(r => { src.onended = r; });
      if (stopped || my !== gen) return false;
    }
    return true;
  })();
}

// A speaker button for free text: asks once before the model download, then reads.
export function readButton(getText, label) {
  const btn = h("button", { type: "button", class: "btn small ghost speakbtn", "aria-label": label || "Read aloud" }, icon("speaker"), label || "Read aloud");
  const note = h("p", { class: "small muted", hidden: true, "aria-live": "polite" });
  let busy = false;
  const go = async () => {
    if (busy) { stopSpeaking(); busy = false; btn.classList.remove("on"); return; }
    busy = true; btn.classList.add("on");
    try {
      await readAloud(getText(), p => { if (p && p.status === "progress" && p.total) { note.hidden = false; note.textContent = "Getting the reading voice ready... " + Math.round(p.loaded / p.total * 100) + "%"; } });
    } catch (e) { note.hidden = false; note.textContent = "The reading voice could not load. Check the connection and try again."; }
    note.hidden = true; busy = false; btn.classList.remove("on");
  };
  btn.addEventListener("click", () => {
    if (modelReady() || busy) { go(); return; }
    if (note.querySelector("button")) return;
    note.hidden = false;
    note.replaceChildren("A natural reading voice is downloaded once (about 90 MB, from Hugging Face), then works on this device. ",
      h("button", { type: "button", class: "btn small primary", onclick: () => { note.hidden = true; note.replaceChildren(); go(); } }, "Download and read"),
      " ", h("button", { type: "button", class: "btn small ghost", onclick: () => { note.hidden = true; note.replaceChildren(); } }, "Not now"));
  });
  return h("span", { class: "readwrap" }, btn, note);
}

// A speaker button for known clips: refs is a list of clip references.
export function sayButton(refs, label) {
  return h("button", { type: "button", class: "btn small ghost speakbtn", "aria-label": label || "Hear it", onclick: () => speak(...refs) }, icon("speaker"), label || null);
}

// Saves every clip of the current language for offline use (the service worker keeps them).
export async function saveVoiceOffline(progress) {
  const idx = await index(lang());
  if (!idx) return 0;
  const files = new Set();
  for (const k of ["phrases", "steps", "notes", "nums", "secs"]) for (const v of Object.values(idx[k])) files.add(v[0]);
  let n = 0;
  for (const f of files) { try { await fetch("app/voice/" + lang() + "/" + f); } catch (e) { /* offline: try later */ } n++; if (progress && n % 20 === 0) progress(n / files.size); }
  return files.size;
}
