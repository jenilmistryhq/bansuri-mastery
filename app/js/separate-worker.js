// The separation model (demucs.js) off the page. The model (about 172 MB) is downloaded once from
// Hugging Face, only when the learner asks, and kept in the browser's cache (MODEL_CACHE); the
// runtime (ONNX Runtime Web) is served from this site. WebGPU (a graphics card) when the browser
// has it, otherwise the processor. The recording is only sent to this worker, never uploaded.
// Messages: { id, cmd: "status" } -> { cached }; { id, cmd: "separate", left, right } (44.1 kHz)
// -> progress messages, then { vocals, other, backend }; { id, cmd: "forget" } removes the model.
import * as ort from "../vendor/ort/ort.webgpu.bundle.min.mjs";
import { separate } from "./demucs.js";

// Pinned to one version of the file, so the download is always the model this code was tested with.
const MODEL_URL = "https://huggingface.co/timcsy/demucs-web-onnx/resolve/92e33df61cfc9eb820272aaa62d2ef6dcf4d950d/htdemucs_embedded.onnx";
const MODEL_CACHE = "demucs-model-v1", MODEL_BYTES = 180534758;
// The file's SHA-256 at that commit (Hugging Face's own record of it): checked before the model is
// used or cached, so a changed or damaged download is never run.
const MODEL_SHA256 = "e5e425c17683f163a472462eb5f5a4ffcd11c31858d57fbd0833b012d8b88077";
async function checked(buf) {
  const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map(b => b.toString(16).padStart(2, "0")).join("");
  if (hex !== MODEL_SHA256) throw new Error("The downloaded model is not the expected file. Try again later.");
  return buf;
}
ort.env.wasm.wasmPaths = new URL("../vendor/ort/", import.meta.url).href;
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;

let session = null, backend = null;
const post = (id, msg, transfer) => self.postMessage({ id, ...msg }, transfer || []);

async function cached() {
  try { const c = await caches.open(MODEL_CACHE); return !!(await c.match(MODEL_URL)); } catch (e) { return false; }
}
// The model's bytes: from the cache, or downloaded (with progress) and then cached.
async function modelBytes(id) {
  let cache = null;
  try { cache = await caches.open(MODEL_CACHE); const hit = await cache.match(MODEL_URL); if (hit) return checked(await hit.arrayBuffer()).catch(async e => { await cache.delete(MODEL_URL); throw e; }); } catch (e) { if (e && /not the expected file/.test(e.message)) throw e; cache = null; }
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) throw new Error("The model could not be downloaded (" + res.status + ").");
  const total = Number(res.headers.get("Content-Length")) || MODEL_BYTES, reader = res.body.getReader(), parts = [];
  let got = 0, last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    const pc = Math.min(100, Math.round(got / total * 100));
    if (pc !== last) { last = pc; post(id, { progress: ["Downloading the separation model (once)... ", pc] }); }
  }
  const blob = new Blob(parts), buf = await checked(await blob.arrayBuffer());
  if (cache) { try { await cache.put(MODEL_URL, new Response(blob, { headers: { "Content-Type": "application/octet-stream" } })); } catch (e) { /* no room: it is downloaded again next time */ } }
  return buf;
}
async function load(id) {
  if (session) return session;
  const bytes = await modelBytes(id);
  post(id, { progress: ["Starting the separation model... ", 0] });
  const tries = typeof navigator !== "undefined" && navigator.gpu ? ["webgpu", "wasm"] : ["wasm"];
  let err = null;
  for (const ep of tries) {
    try { session = await ort.InferenceSession.create(bytes, { executionProviders: [ep], graphOptimizationLevel: "basic" }); backend = ep; return session; }
    catch (e) { err = e; }
  }
  throw err || new Error("The separation model could not start.");
}

let queue = Promise.resolve();
self.onmessage = e => {
  const m = e.data;
  queue = queue.then(async () => {
    try {
      if (m.cmd === "status") post(m.id, { result: { cached: await cached() } });
      else if (m.cmd === "forget") { session = null; try { await caches.delete(MODEL_CACHE); } catch (err) { /* nothing kept */ } post(m.id, { result: true }); }
      else if (m.cmd === "separate") {
        const s = await load(m.id), t0 = Date.now();
        const out = await separate(ort, s, m.left, m.right, (done, total) => {
          const left = done < total ? Math.round((Date.now() - t0) / done * (total - done) / 1000) : 0;
          post(m.id, { progress: ["Separating the singer (" + (backend === "webgpu" ? "graphics card" : "processor") + ")" + (done < total ? ", about " + (left >= 90 ? Math.round(left / 60) + " min" : left + " s") + " left" : "") + "... ", Math.round(done / total * 100)] });
        });
        post(m.id, { result: { vocals: out.vocals, other: out.other, backend } }, [out.vocals.buffer, out.other.buffer]);
      } else throw new Error("Unknown job: " + m.cmd);
    } catch (err) {
      post(m.id, { error: (err && err.message) || String(err) });
    }
  });
};
