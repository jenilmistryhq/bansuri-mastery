// Level 3 of the navigation (redesign 03): views inside one section, as a segmented control, never a
// third row of tabs. Each view has its own address, so Back and reloads land on it.
import { h } from "./util.js";

// items: [[key, href, label]]; current: the key shown now.
export function segNav(items, current, label) {
  return h("nav", { class: "segnav", "aria-label": label || "Views" },
    items.map(([k, href, text]) => h("a", { href, "aria-current": k === current ? "page" : null }, text)));
}
