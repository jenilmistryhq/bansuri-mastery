// One-tap backup: the share sheet where the phone can share files (save to Files, Drive, mail),
// otherwise a download. Recordings are included only when asked (they can be large).
import { backupObject, update } from "./state.js";
import { today } from "./util.js";
import { listRecordings, blobToDataUrl } from "./recorder.js";

export async function saveBackup({ withRecordings = false, share = true } = {}) {
  const obj = backupObject();
  if (withRecordings) {
    const recs = await listRecordings();
    obj.recordings = [];
    for (const r of recs) obj.recordings.push(Object.assign({}, r, { blob: undefined, data: await blobToDataUrl(r.blob) }));
  }
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
