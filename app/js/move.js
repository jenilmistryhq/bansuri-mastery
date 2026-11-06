// Moving progress to another device without an account: the progress and settings are compressed
// into a link (#/move/<data>). Send the link to yourself, or scan it as a QR code when it is small
// enough; opening it on the other device shows what it holds and asks before replacing anything.
// Recordings are not included (they are too large for a link; use a backup file for those).
import { getState } from "./state.js";
import { encodeData, decodeData } from "./linkdata.js";

// Years of practice log fit in well under this; it also keeps a link from filling storage.
const MAX_MOVE = 2 * 1024 * 1024;

// "z" + gzip when the browser can compress, "j" + plain JSON otherwise.
export async function encodeMove() {
  let settings = null;
  try { settings = JSON.parse(localStorage.getItem("bansuri.settings") || "null"); } catch (e) { /* none */ }
  return encodeData({ app: "bansuri-mastery", kind: "move", progress: getState(), settings });
}

export async function decodeMove(data) {
  const obj = await decodeData(data, MAX_MOVE);
  if (!obj || obj.app !== "bansuri-mastery" || obj.kind !== "move" || !obj.progress) throw new Error("This is not a Bansuri Mastery transfer link.");
  return obj;
}

export const moveLink = data => location.origin + location.pathname + "#/move/" + data;
// A QR code holds about 2,900 characters at the lowest error correction; keep a margin.
export const QR_LIMIT = 2300;
