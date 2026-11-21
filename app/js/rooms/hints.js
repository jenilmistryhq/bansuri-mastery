import { h } from "../util.js";
import { useHint } from "./state.js";

export function renderHints(hints, roomId) {
  if (!hints || !hints.length) return { el: h("span"), destroy() {} };
  let revealed = 0;
  const list = h("ol", { class: "room-hints" });
  const btn = h("button", { type: "button", class: "btn ghost small room-hint-btn" }, "Show hint (1 of " + hints.length + ")");

  function update() {
    if (revealed >= hints.length) {
      btn.hidden = true;
    } else {
      btn.textContent = "Show hint (" + (revealed + 1) + " of " + hints.length + ")";
    }
  }

  btn.addEventListener("click", () => {
    if (revealed >= hints.length) return;
    const hint = hints[revealed];
    const li = h("li", { class: "room-hint" }, typeof hint === "string" ? hint : hint.text || "");
    list.appendChild(li);
    revealed++;
    useHint(roomId);
    update();
  });

  update();
  return {
    el: h("div", { class: "room-hints-wrap" }, list, btn),
    destroy() {},
  };
}
