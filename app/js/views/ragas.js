// Music > Ragas (#/music/ragas): the raga cards in the course's learning order, each opening its card
// in the reader, and the two ways to play in a raga (Jam with the band, Raga phrases).
import { h } from "../util.js";
import { fetchDoc } from "../content.js";

export function parseRagaIndex(md) {
  return [...md.matchAll(/^\|\s*(\d+)\s*\|\s*\[([^\]]+)\]\(([a-z-]+\.md)\)\s*\|\s*([^|]*)\|\s*([^|]*)\|[^|]*\|[^|]*\|\s*([^|]*)\|/gm)]
    .map(m => ({ n: Number(m[1]), name: m[2], file: m[3], thaat: m[4].trim(), notes: m[5].trim(), when: m[6].replace(/\(\[[^\]]*\]\([^)]*\)\)/g, "").trim() }));
}

export async function render(main) {
  const page = h("div", { class: "page" });
  page.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Music"), h("h1", null, "Ragas"),
    h("p", { class: "muted" }, "A raga card is a reference sheet: its notes, phrases and mood. Learn a raga by listening and playing; use the card to check.")));
  page.append(h("section", { class: "card row between" }, h("span", null, "Play in a raga"),
    h("span", { class: "row" }, h("a", { class: "btn primary", href: "#/play/jam" }, "Jam with the band"), h("a", { class: "btn", href: "#/play/phrase" }, "Raga phrases"))));
  const list = h("div", { class: "hublist" }, h("p", { class: "small muted" }, "Loading..."));
  page.append(h("section", { class: "card hubgroup" }, h("h2", { class: "grouphead" }, "Raga cards"), list));
  main.append(page);
  try {
    const rows = parseRagaIndex(await fetchDoc("ragas/README.md"));
    list.replaceChildren(...rows.map(r => h("a", { class: "hubrow", href: "#/read/ragas/" + r.file },
      h("span", { class: "stack" }, h("b", null, r.name), h("span", { class: "small muted mono", translate: "no" }, r.notes)),
      h("span", { class: "small muted" }, r.when), h("span", { class: "chev", "aria-hidden": "true" }, ">"))));
  } catch (e) {
    list.replaceChildren(h("p", { class: "small muted" }, "The raga cards could not be loaded."));
  }
}
