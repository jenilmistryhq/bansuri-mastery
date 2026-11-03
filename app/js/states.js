// The shared empty and error states (redesign 09, W85 and W86).
// An empty state: one picture, one line, one action. An error state: what happened, what to do,
// ( Back ) and ( Report it ).
import { h, icon, toast } from "./util.js";
import { problemReport } from "./errors.js";

// emptyState(pic, text, action?, onAction?): pic is an icon name from util.js; the action is a
// button (onAction a function) or a link (onAction an address).
export function emptyState(pic, text, action, onAction) {
  const act = !action ? null : typeof onAction === "string" ? h("a", { class: "btn primary", href: onAction }, action)
    : h("button", { type: "button", class: "btn primary", onclick: onAction }, action);
  return h("section", { class: "card emptycard emptypic" }, h("span", { class: "emptyicon", "aria-hidden": "true" }, icon(pic)), h("p", { class: "emptyline" }, text), act);
}

// errorState(title, text, back): back is the address ( Back ) leads to when there is no history.
export function errorState(title, text, back) {
  const goBack = () => { if (history.length > 1) history.back(); else location.hash = back || "#/today"; };
  const report = async () => {
    try { await navigator.clipboard.writeText(await problemReport()); toast("Problem report copied. Paste it into your bug report."); }
    catch (e) { location.hash = "#/me/settings/help"; }
  };
  return h("section", { class: "card errorcard", role: "alert" }, h("span", { class: "emptyicon erroricon", "aria-hidden": "true" }, icon("x")),
    h("h1", null, title), h("p", null, text),
    h("div", { class: "row" }, h("button", { type: "button", class: "btn", onclick: goBack }, "Back"), h("button", { type: "button", class: "btn", onclick: report }, "Report it")));
}
