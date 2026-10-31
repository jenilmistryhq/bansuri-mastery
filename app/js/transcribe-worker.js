// The Transcribe analysis off the page (see analyser.js): one job at a time, with progress messages.
import { runJob } from "./analyser.js";

const state = { mono: null, stereo: null, rep: null };
let queue = Promise.resolve();

self.onmessage = e => {
  const msg = e.data;
  queue = queue.then(async () => {
    try {
      const result = await runJob(state, msg, (label, pc) => self.postMessage({ id: msg.id, progress: [label, pc] }));
      self.postMessage({ id: msg.id, result });
    } catch (err) {
      self.postMessage({ id: msg.id, error: (err && err.message) || String(err) });
    }
  });
};
