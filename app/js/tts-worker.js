// Kokoro-82M (Apache 2.0) in a worker, so making speech never freezes the page. Same approach as
// Synapse: the model is downloaded once from Hugging Face (only after the learner agrees) and cached
// by the browser; the runtime (kokoro.web.js, onnxruntime WebAssembly) is served from this site.
// The text is only sent to this local worker.
import { KokoroTTS, env } from "../vendor/kokoro/kokoro.web.js";

env.wasmPaths = new URL("../vendor/kokoro/", import.meta.url).href;

let model = null, loading = null, queue = Promise.resolve();

// The model is pinned to one commit, so a later change upstream cannot change what this code runs
// (two local edits in vendor/kokoro/kokoro.web.js: KokoroTTS.from_pretrained passes `revision` on,
// and the voice files point at the same commit). A copy downloaded
// before the pin (from "main", the same files) keeps being used, so nobody downloads it twice.
const REPO = "onnx-community/Kokoro-82M-v1.0-ONNX", PINNED = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";
async function revision() {
  try {
    const keys = await (await caches.open("transformers-cache")).keys();
    if (keys.some(r => r.url.includes("/" + REPO + "/resolve/main/"))) return "main";
  } catch (e) { /* no cache: download the pinned files */ }
  return PINNED;
}

function getModel() {
  if (model) return Promise.resolve(model);
  if (!loading) {
    loading = revision().then(rev => KokoroTTS.from_pretrained(REPO, {
      revision: rev,
      dtype: "q8",
      device: "wasm",
      progress_callback: progress => self.postMessage({ type: "progress", progress }),
    })).then(tts => { model = tts; self.postMessage({ type: "ready" }); return tts; }, e => { loading = null; throw e; });
  }
  return loading;
}

async function synthesize({ id, text, voice, speed }) {
  try {
    const tts = await getModel();
    const result = await tts.generate(text, { voice, speed });
    const pcm = result.audio;
    self.postMessage({ type: "audio", id, pcm: pcm.buffer, sampleRate: result.sampling_rate }, [pcm.buffer]);
  } catch (e) {
    self.postMessage({ type: "error", id, message: String((e && e.message) || e) });
  }
}

self.addEventListener("message", e => {
  const m = e.data;
  if (m && m.type === "synthesize") queue = queue.then(() => synthesize(m));
});
