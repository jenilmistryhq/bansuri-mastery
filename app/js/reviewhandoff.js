// Hands a recording and its measurements from one screen (Tone check) to the review request page,
// within the same visit (a Blob cannot go in a link or in localStorage).
let pending = null;
export function handOff(item) { pending = item; }
export function takeHandoff() { const p = pending; pending = null; return p; }
