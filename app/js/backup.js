// One-tap backup: the share sheet where the phone can share files (save to Files, Drive, mail),
// otherwise a download. Recordings are included only when asked (they can be large).
import { backupObject, update } from "./state.js";
import { today } from "./util.js";
import { listRecordings, blobToDataUrl } from "./recorder.js";
import { listCaptures, getCapture, putCapture } from "./captures.js";

// The backup object; with recordings, the Journal's recordings and Transcribe's recordings (with
// their saved notation and corrections) as data URLs.
export async function backupWith(withRecordings) {
  const obj = backupObject();
  if (withRecordings) {
    const recs = await listRecordings();
    obj.recordings = [];
    for (const r of recs) obj.recordings.push(Object.assign({}, r, { blob: undefined, data: await blobToDataUrl(r.blob) }));
    obj.captures = [];
    try {
      for (const c of await listCaptures()) {
        const full = await getCapture(c.id);
        if (full && full.blob) obj.captures.push(Object.assign({}, full, { blob: undefined, data: await blobToDataUrl(full.blob) }));
      }
    } catch (e) { /* this browser keeps no Transcribe recordings */ }
  }
  return obj;
}

// Transcribe's recordings from a backup; b64ToBlob turns a data URL back into a Blob.
export async function restoreCaptures(list, b64ToBlob) {
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (const c of list) {
    const blob = b64ToBlob(c.data);
    if (!blob || typeof c.id !== "string" || !/^c[a-z0-9]{1,30}$/.test(c.id)) continue;
    const rec = { id: c.id, name: String(c.name || "Recording").slice(0, 60), seconds: Number(c.seconds) || 0, created: String(c.created || new Date().toISOString()), blob,
      notation: typeof c.notation === "string" ? c.notation.slice(0, 50000) : null };
    if (c.settings && typeof c.settings === "object") rec.settings = c.settings;
    if (Array.isArray(c.manual)) rec.manual = c.manual.filter(n => n && Number.isFinite(n.t0) && Number.isFinite(n.t1) && Number.isFinite(n.midi)).slice(0, 20000);
    if (typeof c.saved === "string") rec.saved = c.saved;
    try { await putCapture(rec); n++; } catch (e) { /* storage full */ }
  }
  return n;
}

export async function saveBackup({ withRecordings = false, share = true } = {}) {
  const obj = await backupWith(withRecordings);
  const name = "bansuri-backup-" + today() + ".json", text = JSON.stringify(obj);
  let how = "downloaded";
  const file = typeof File !== "undefined" ? new File([text], name, { type: "application/json" }) : null;
  if (share && file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Bansuri practice backup" }); how = "shared"; }
    catch (e) { if (e && e.name === "AbortError") return "cancelled"; how = "downloaded"; download(name, text); }
  } else download(name, text);
  update(st => { st.lastBackup = today(); });
  return how;
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
