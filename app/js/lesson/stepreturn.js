// "Having trouble?" in the player opens Skills > Fix (redesign F9) and comes back to exactly the
// step it came from [C4]. The player keeps its place (bansuri.lessons) and leaves the lesson's
// address in the history as "#/lesson/<id>#resume", so the browser's Back resumes the step; the
// fix screen also gets a "Back to the step" link at its top (main.js), until another place opens.
import { h } from "../util.js";

const KEY = "bansuri.stepReturn";

export function setStepReturn(href) { try { sessionStorage.setItem(KEY, href); } catch (e) { /* the browser's Back still works */ } }

// The link for the top of a fix screen, or null. Any other screen forgets the way back.
export function stepReturnBar(path) {
  let href = null;
  try { href = sessionStorage.getItem(KEY); } catch (e) { href = null; }
  if (!href) return null;
  if (!/^\/skills\/fix\//.test(path || "")) { try { sessionStorage.removeItem(KEY); } catch (e) { /* nothing kept */ } return null; }
  return h("a", { class: "backlink stepreturn", href },
    h("span", { class: "chev", "aria-hidden": "true" }, "<"), h("span", null, "Back to the step"));
}
