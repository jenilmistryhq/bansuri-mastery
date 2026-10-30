// Moving progress to another device without an account: the progress and settings are compressed
// into a link (#/move/<data>). Send the link to yourself, or scan it as a QR code when it is small
// enough; opening it on the other device shows what it holds and asks before replacing anything.
// Recordings are not included (they are too large for a link; use a backup file for those).
import { getState } from "./state.js";

const b64url = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64url = str => Uint8Array.from(atob(str.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

// "z" + gzip when the browser can compress, "j" + plain JSON otherwise.
export async function encodeMove() {
  let settings = null;
  try { settings = JSON.parse(localStorage.getItem("bansuri.settings") || "null"); } catch (e) { /* none */ }
  const json = new TextEncoder().encode(JSON.stringify({ app: "bansuri-mastery", kind: "move", progress: getState(), settings }));
  if (typeof CompressionStream !== "undefined") return "z" + b64url(await pipe(json, new CompressionStream("gzip")));
  return "j" + b64url(json);
}

export async function decodeMove(data) {
  const kind = data[0], bytes = unb64url(data.slice(1));
  const raw = kind === "z" ? await pipe(bytes, new DecompressionStream("gzip")) : bytes;
  const obj = JSON.parse(new TextDecoder().decode(raw));
  if (!obj || obj.app !== "bansuri-mastery" || obj.kind !== "move" || !obj.progress) throw new Error("This is not a Bansuri Mastery transfer link.");
  return obj;
}

export const moveLink = data => location.origin + location.pathname + "#/move/" + data;
// A QR code holds about 2,900 characters at the lowest error correction; keep a margin.
export const QR_LIMIT = 2300;
