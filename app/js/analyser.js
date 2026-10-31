// The slow part of Transcribe (the pitch of every 20 ms, and separating singer and background) runs
// in a Web Worker (transcribe-worker.js), so the page stays responsive and a long analysis can be
// cancelled. Where a module worker cannot start (an old browser), the same jobs run on the page.
// Jobs: "load" (the recording's channels; mono and stereo versions are kept for the jobs after),
// "whole" (the main melody of the whole mix) and "part" (the singer or the background).
import { monoDown, stereoDown, repetitionParts, pitchTrack } from "./transcribe.js";

const MAX_SECONDS = 360;

// One job on a state object ({ mono, stereo, rep }); progress(label, pc) reports along the way.
export async function runJob(state, msg, progress) {
  if (msg.cmd === "load") {
    const m = monoDown(msg.channels, msg.sr), s = stereoDown(msg.channels, msg.sr);
    state.mono = m; state.stereo = s && s.side > 0.02 ? s : null; state.rep = null;
    return { sr: m.sr, stereo: !!state.stereo };
  }
  if (!state.mono) throw new Error("No recording loaded.");
  if (msg.cmd === "whole") return pitchTrack(state.mono.data, state.mono.sr, { maxSeconds: MAX_SECONDS, onProgress: p => progress("Finding the melody... ", p) });
  if (msg.cmd === "part") {
    const name = msg.name, st = state.stereo;
    if (st) return pitchTrack(st.M, st.sr, { maxSeconds: MAX_SECONDS, stereo: { L: st.L, R: st.R, part: name }, onProgress: p => progress("Listening for the " + name + "... ", p) });
    // Mono: separated once by repetition (both parts at once), then each part's melody.
    if (!state.rep) state.rep = await repetitionParts(state.mono.data, state.mono.sr, { maxSeconds: MAX_SECONDS, onProgress: p => progress("Finding what repeats (the background)... ", p) });
    return pitchTrack(state.mono.data, state.mono.sr, { maxSeconds: MAX_SECONDS, mags: state.rep[name], part: name, onProgress: p => progress("Listening for the " + name + "... ", p) });
  }
  throw new Error("Unknown job: " + msg.cmd);
}

// run(msg, onProgress) resolves with the job's result, or rejects with { cancelled: true } after
// cancel(). After a cancel the recording must be loaded again (the worker is started afresh).
export function analyser() {
  let worker = null, broken = false, seq = 0;
  const pending = new Map(), local = { mono: null, stereo: null, rep: null };
  function start() {
    if (worker || broken || typeof Worker === "undefined") return worker;
    try { worker = new Worker(new URL("./transcribe-worker.js", import.meta.url), { type: "module" }); }
    catch (e) { broken = true; return null; }
    worker.onmessage = e => {
      const d = e.data, p = pending.get(d.id);
      if (!p) return;
      if (d.progress) { if (p.onProgress) p.onProgress(d.progress[0], d.progress[1]); return; }
      pending.delete(d.id);
      if (d.error) p.reject(new Error(d.error)); else p.resolve(d.result);
    };
    // The worker could not start (no module workers here): every job waiting runs on the page instead.
    worker.onerror = e => {
      if (e && e.preventDefault) e.preventDefault();
      broken = true; worker.terminate(); worker = null;
      const waiting = [...pending.values()]; pending.clear();
      for (const p of waiting) runHere(p.msg, p.onProgress).then(p.resolve, p.reject);
    };
    return worker;
  }
  // On the page: the same jobs, with a pause now and then so the page can draw the progress.
  let cancelled = 0;
  async function runHere(msg, onProgress) {
    const mine = cancelled;
    const out = await runJob(local, msg, (label, pc) => { if (cancelled !== mine) throw { cancelled: true }; if (onProgress) onProgress(label, pc); });
    if (cancelled !== mine) throw { cancelled: true };
    return out;
  }
  return {
    run(msg, onProgress) {
      const w = start();
      if (!w) return runHere(msg, onProgress);
      const id = ++seq;
      return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, onProgress, msg }); w.postMessage({ ...msg, id }); });
    },
    cancel() {
      cancelled++;
      if (worker) { worker.terminate(); worker = null; }
      for (const p of pending.values()) p.reject({ cancelled: true });
      pending.clear();
      local.mono = local.stereo = local.rep = null;
    },
    destroy() { this.cancel(); },
  };
}
