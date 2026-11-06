// Data carried inside a link (#/review/, #/feedback/, #/move/): "z" + base64url gzip, or "j" +
// base64url JSON where the browser cannot compress. Links come from anyone, so decoding is
// bounded: a few kilobytes of gzip can expand to gigabytes, and a link that large would hang or
// crash the tab. MAX_LINK caps the link text; each caller sets the most the JSON may expand to.
const MAX_LINK = 400000;

const b64url = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64url = str => Uint8Array.from(atob(str.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

// Inflates gzip, stopping as soon as the output passes max bytes.
async function inflate(bytes, max) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { try { await reader.cancel(); } catch (e) { /* already closed */ } throw new Error("This link holds more than the app accepts."); }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export async function encodeData(obj) {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream !== "undefined") return "z" + b64url(await pipe(json, new CompressionStream("gzip")));
  return "j" + b64url(json);
}

export async function decodeData(data, maxBytes) {
  data = String(data || "");
  if (data.length > MAX_LINK) throw new Error("This link is too long.");
  const bytes = unb64url(data.slice(1));
  let raw;
  if (data[0] === "z") raw = await inflate(bytes, maxBytes);
  else if (bytes.length > maxBytes) throw new Error("This link holds more than the app accepts.");
  else raw = bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}
