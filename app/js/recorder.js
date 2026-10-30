// Recordings of the learner's playing: captured with MediaRecorder, kept in this browser's
// IndexedDB, never uploaded. The microphone is opened only when the learner presses Record.
import { update } from "./state.js";
import { h, icon, fmtClock, toast, today } from "./util.js";

const DB = "bansuri", STORE = "recordings";

function openDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) { reject(new Error("This browser cannot store recordings.")); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let t;
    try { t = db.transaction(STORE, mode); } catch (e) { db.close(); reject(e); return; }
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(out && "result" in out ? out.result : out); };
    t.onerror = () => { db.close(); reject(t.error || new Error("Storage error")); };
    // A full disk or quota makes the transaction abort without an error event.
    t.onabort = () => { db.close(); reject(t.error || new Error("Storage is full or the save was interrupted.")); };
  });
}

export async function saveRecording(rec, { count = true } = {}) {
  await tx("readwrite", s => s.put(rec));
  if (count) update(st => { st.recordings = (st.recordings || 0) + 1; });
  return rec;
}
export async function listRecordings() {
  const all = await tx("readonly", s => s.getAll());
  return (all || []).sort((a, b) => (a.created < b.created ? 1 : -1));
}
export async function getRecording(id) { return tx("readonly", s => s.get(id)); }
export async function deleteRecording(id) { return tx("readwrite", s => s.delete(id)); }
export async function patchRecording(id, patch) {
  const rec = await getRecording(id);
  if (!rec) return null;
  Object.assign(rec, patch);
  await tx("readwrite", s => s.put(rec));
  return rec;
}
export async function clearRecordings() { return tx("readwrite", s => s.clear()); }

export function recordingSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

function pickMime(video) {
  const opts = video ? ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"] : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const m of opts) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

// Starts recording (audio, or video with sound). Returns { stop(): Promise<{blob, mime, durationS}>, cancel() }.
export async function startRecording({ onLevel, video, preview } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    video: video ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } } : false,
  });
  if (video && preview) { preview.srcObject = stream; preview.muted = true; preview.play().catch(() => {}); }
  const mime = pickMime(video);
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const AC = window.AudioContext || window.webkitAudioContext;
  const actx = new AC();
  const src = actx.createMediaStreamSource(stream);
  const an = actx.createAnalyser(); an.fftSize = 1024; src.connect(an);
  const buf = new Float32Array(an.fftSize);
  let raf = 0;
  const loop = () => {
    an.getFloatTimeDomainData(buf);
    let peak = 0; for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
    if (onLevel) onLevel(peak);
    raf = requestAnimationFrame(loop);
  };
  const t0 = performance.now();
  mr.start(250);
  loop();
  const cleanup = () => { cancelAnimationFrame(raf); stream.getTracks().forEach(t => t.stop()); actx.close().catch(() => {}); if (preview) preview.srcObject = null; };
  return {
    stop() {
      const result = () => ({ blob: new Blob(chunks, { type: mr.mimeType || mime || (video ? "video/webm" : "audio/webm") }), mime: mr.mimeType || mime, durationS: (performance.now() - t0) / 1000 });
      // The recorder may already have stopped itself (headset unplugged, a call, an iOS interruption).
      if (mr.state === "inactive") { cleanup(); return Promise.resolve(result()); }
      return new Promise(resolve => {
        mr.onstop = () => { cleanup(); resolve(result()); };
        try { mr.stop(); } catch (e) { cleanup(); resolve(result()); }
      });
    },
    cancel() { try { mr.stop(); } catch (e) { /* already stopped */ } cleanup(); },
  };
}

export function newId() { return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// A compact Record widget used in sessions, milestones and the journal. With video: true it records
// a mirrored camera view with sound (for posture, hands and embouchure self-checks).
export function recordWidget({ day, label, onSaved, video }) {
  const status = h("span", { class: "small muted" }, recordingSupported() ? "Ready" : "Recording is not supported in this browser.");
  const clock = h("span", { class: "timer" }, "0:00");
  const bar = h("i");
  const meter = h("div", { class: "meterbar", "aria-hidden": "true" }, bar);
  const recLabel = video ? "Record video" : "Record";
  const btn = h("button", { type: "button", class: "btn primary" }, icon("mic"), recLabel);
  const audio = video ? h("video", { controls: true, hidden: true, playsinline: true, class: "selfview" }) : h("audio", { controls: true, hidden: true });
  const preview = video ? h("video", { hidden: true, playsinline: true, muted: true, class: "mirror selfview", "aria-label": "Camera preview" }) : null;
  let rec = null, timer = 0, t0 = 0, url = null, disposed = false, starting = false;
  const currentLabel = () => (typeof label === "function" ? label() : label) || "Practice recording";
  btn.disabled = !recordingSupported();
  btn.addEventListener("click", async () => {
    if (rec) {
      const r = rec; rec = null; clearInterval(timer);
      btn.replaceChildren(icon("mic"), recLabel);
      if (preview) preview.hidden = true;
      status.textContent = "Saving...";
      const { blob, mime, durationS } = await r.stop();
      const item = { id: newId(), created: new Date().toISOString(), date: today(), day: day ?? null, label: currentLabel(), mime, blob, durationS, kind: video ? "video" : "audio" };
      try {
        await saveRecording(item);
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(blob);
        audio.src = url; audio.hidden = false;
        status.textContent = "Saved to your journal (" + durationS.toFixed(1) + " s).";
        if (onSaved) onSaved(item);
      } catch (e) { status.textContent = "Could not save: " + e.message; }
      bar.style.width = "0%";
      return;
    }
    if (starting) return;
    starting = true;
    try {
      if (preview) preview.hidden = false;
      const started = await startRecording({ video: !!video, preview, onLevel: p => { bar.style.width = Math.min(100, p * 140) + "%"; bar.style.background = p > 0.95 ? "var(--bad)" : "var(--good)"; } });
      starting = false;
      if (disposed) { started.cancel(); return; }
      rec = started;
      t0 = performance.now();
      timer = setInterval(() => { clock.textContent = fmtClock((performance.now() - t0) / 1000); }, 250);
      btn.replaceChildren(icon("stop"), "Stop");
      status.textContent = video ? "Recording video. Play, then press Stop." : "Recording. Play, then press Stop.";
    } catch (e) {
      rec = null; starting = false;
      if (preview) preview.hidden = true;
      status.textContent = video ? "The camera or microphone is not available: allow access in the browser, then try again." : "The microphone is not available: allow access in the browser, then try again.";
      toast(video ? "Camera permission was refused or no camera was found." : "Microphone permission was refused or no microphone was found.");
    }
  });
  const el = h("div", { class: "stack" }, h("div", { class: "row" }, btn, clock, status), meter, preview, audio);
  el.cleanup = () => { disposed = true; if (rec) rec.cancel(); rec = null; clearInterval(timer); if (url) URL.revokeObjectURL(url); };
  return el;
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
}
export async function dataUrlToBlob(url) { const res = await fetch(url); return res.blob(); }
