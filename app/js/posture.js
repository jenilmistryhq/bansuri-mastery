// Live posture check for the video self-check: pose detection runs in the browser (MediaPipe,
// vendored in app/vendor/pose, loaded only when opened) and a few body measurements become plain
// advice from L02. No image leaves the device. It cannot see the embouchure: that stays with the
// recording, the mirror and a teacher.
import { h } from "./util.js";

// Landmark numbers in the pose model: ears, shoulders, elbows, wrists.
const P = { lEar: 7, rEar: 8, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16 };
const VIS = 0.5;

// Pure checks on one set of landmarks ({x, y, visibility}, x and y from 0 to 1, y down).
// Returns [{ id, ok, text }]; a check whose body parts are not visible is left out.
export function postureChecks(lm) {
  const seen = (...ids) => ids.every(i => lm[i] && (lm[i].visibility === undefined || lm[i].visibility >= VIS));
  const out = [];
  if (!seen(P.lSh, P.rSh)) return out;
  const L = lm[P.lSh], R = lm[P.rSh], width = Math.hypot(L.x - R.x, L.y - R.y) || 1e-6;
  const deg = (a, b) => Math.abs(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI);
  const tilt = (a, b) => { const d = deg(a, b); return Math.min(d, 180 - d); };
  out.push(tilt(L, R) <= 7 ? { id: "shoulders", ok: true, text: "Shoulders level." } : { id: "shoulders", ok: false, text: "One shoulder is higher: let it drop and relax both." });
  if (seen(P.lEar, P.rEar)) {
    const earY = (lm[P.lEar].y + lm[P.rEar].y) / 2, shY = (L.y + R.y) / 2;
    const neck = (shY - earY) / width; // smaller when the shoulders rise toward the ears
    out.push(neck >= 0.38 ? { id: "raised", ok: true, text: "Shoulders relaxed, not raised." } : { id: "raised", ok: false, text: "Shoulders are creeping up toward the ears: breathe out and let them fall." });
    out.push(tilt(lm[P.lEar], lm[P.rEar]) <= 14 ? { id: "head", ok: true, text: "Head level." } : { id: "head", ok: false, text: "Head tilted: keep it level and bring the flute to your lips, not your lips to the flute." });
  }
  if (seen(P.lWr, P.rWr)) {
    const a = tilt(lm[P.lWr], lm[P.rWr]);
    out.push(a <= 22 ? { id: "flute", ok: true, text: "Flute roughly level." } : { id: "flute", ok: false, text: "The hands are at very different heights: keep the flute roughly level, sloping only slightly away." });
  }
  if (seen(P.lEl, P.rEl)) {
    const shY = (L.y + R.y) / 2, elY = (lm[P.lEl].y + lm[P.rEl].y) / 2;
    const drop = (elY - shY) / width;
    out.push(drop > 0.15 && drop < 1.1 ? { id: "elbows", ok: true, text: "Elbows relaxed, away from the body." } : drop <= 0.15 ? { id: "elbows", ok: false, text: "Elbows are lifted high: lower them; the arms should hang loosely." } : { id: "elbows", ok: false, text: "Arms look fully dropped: lift the flute to the lips with the elbows slightly away from the body." });
  }
  return out;
}

let loading = null;
async function landmarker() {
  if (!loading) loading = (async () => {
    const vision = await import("../vendor/pose/vision_bundle.mjs");
    const base = new URL("../vendor/pose/", import.meta.url).href;
    return vision.PoseLandmarker.createFromOptions({ wasmLoaderPath: base + "vision_wasm_internal.js", wasmBinaryPath: base + "vision_wasm_internal.wasm" }, {
      baseOptions: { modelAssetPath: base + "pose_landmarker_lite.task", delegate: "CPU" },
      runningMode: "VIDEO", numPoses: 1,
    });
  })().catch(e => { loading = null; throw e; });
  return loading;
}

// The widget: camera preview (mirrored), the detected shoulders and arms drawn on top, and a live
// checklist. Returns { el, destroy }.
export function postureCheck() {
  let stream = null, raf = 0, stopped = false, history = [];
  const video = h("video", { class: "selfview mirror", playsinline: true, muted: true, autoplay: true });
  const canvas = h("canvas", { class: "pose-overlay mirror", "aria-hidden": "true" });
  const list = h("ul", { class: "pose-list", "aria-live": "polite" });
  const msg = h("p", { class: "small muted" }, "Sit or stand facing the camera, about two metres away, so your head, shoulders and arms are in view. Hold the flute as if playing.");
  const btn = h("button", { type: "button", class: "btn primary" }, "Start the posture check");
  const el = h("div", { class: "stack posture" }, msg, h("div", { class: "pose-stage" }, video, canvas), list, h("div", { class: "row" }, btn));

  function draw(lm) {
    const W = canvas.width = video.videoWidth || 640, H = canvas.height = video.videoHeight || 480;
    const g = canvas.getContext("2d");
    g.clearRect(0, 0, W, H);
    if (!lm) return;
    g.lineWidth = Math.max(3, W / 160); g.strokeStyle = "rgba(82, 184, 179, 0.9)"; g.fillStyle = "#f6f3ea";
    for (const [a, b] of [[P.lSh, P.rSh], [P.lSh, P.lEl], [P.lEl, P.lWr], [P.rSh, P.rEl], [P.rEl, P.rWr], [P.lEar, P.rEar]]) {
      if (!lm[a] || !lm[b] || lm[a].visibility < VIS || lm[b].visibility < VIS) continue;
      g.beginPath(); g.moveTo(lm[a].x * W, lm[a].y * H); g.lineTo(lm[b].x * W, lm[b].y * H); g.stroke();
    }
  }
  // Each check's verdict is the majority over the last second, so the advice does not flicker.
  function show(checks) {
    history.push(checks); if (history.length > 12) history.shift();
    if (!checks.length) { list.replaceChildren(h("li", { class: "pose-none" }, "No one in view yet: move back until your shoulders and arms are in the picture.")); return; }
    const ids = [...new Set(history.flat().map(c => c.id))];
    list.replaceChildren(...ids.map(id => {
      const recent = history.map(cs => cs.find(c => c.id === id)).filter(Boolean);
      const ok = recent.filter(c => c.ok).length >= recent.length / 2;
      const last = recent.filter(c => c.ok === ok).pop();
      return h("li", { class: ok ? "pose-ok" : "pose-warn" }, last.text);
    }));
  }
  async function start() {
    btn.disabled = true; msg.textContent = "Loading pose detection (about 19 MB the first time)...";
    try {
      const [pose, s] = await Promise.all([landmarker(), navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: false })]);
      if (stopped) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s; video.srcObject = s; await video.play().catch(() => {});
      msg.textContent = "Checking. Hold the flute as if playing. This sees posture and arms only; check the embouchure with a recording and a mirror.";
      btn.textContent = "Stop"; btn.disabled = false;
      let last = 0;
      const loop = now => {
        if (stopped || !stream) return;
        if (now - last > 90 && video.readyState >= 2) {
          last = now;
          try {
            const res = pose.detectForVideo(video, now);
            const lm = res.landmarks && res.landmarks[0];
            draw(lm); show(lm ? postureChecks(lm) : []);
          } catch (e) { /* skip a frame */ }
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    } catch (e) {
      btn.disabled = false;
      msg.textContent = /Permission|NotAllowed/i.test(String(e && e.name) + String(e && e.message)) ? "The camera is blocked. Allow it in the browser's site settings, then try again." : "Pose detection could not start on this device (" + (e && e.message ? e.message : "unknown error") + "). The video self-check still works.";
    }
  }
  function stop() {
    cancelAnimationFrame(raf);
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    video.srcObject = null; btn.textContent = "Start the posture check"; btn.disabled = false;
  }
  btn.addEventListener("click", () => { if (stream) stop(); else { stopped = false; start(); } });
  return { el, destroy() { stopped = true; stop(); } };
}
