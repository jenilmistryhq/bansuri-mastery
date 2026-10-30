// Translation of the interface (Hindi), shared by the app and the bench widgets.
// The dictionary maps English interface text to Hindi: exact strings, and patterns with {placeholders}
// ("Score {n}." -> "स्कोर {n}।"). observe(root) translates every text node and label under root as it
// appears or changes, so views need no changes; canvas text and spoken text go through t().
// Course content (rendered Markdown, notation) is marked translate="no" and left alone.

let dict = null;
let patterns = [];
let templates = new Map();
const ATTRS = ["aria-label", "title", "placeholder", "alt"];

export function setDict(d) {
  dict = new Map();
  patterns = [];
  templates = new Map();
  for (const [en, hi] of Object.entries(d || {})) {
    if (!hi) continue;
    if (/\{[a-z]\w*\}/.test(en)) {
      const names = [];
      const re = new RegExp("^" + en.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{([a-z]\w*)\\?\}/g, (_, n) => { names.push(n); return "(.+?)"; }) + "$");
      patterns.push({ re, names, hi });
      templates.set(en, hi);
    } else dict.set(en, hi);
  }
}

export function hasDict() { return !!dict; }

// Translates one string; anything unknown stays as it is.
export function t(s) {
  if (!dict || typeof s !== "string") return s;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), core = m[2];
  if (!core || !/[A-Za-z]/.test(core)) return s;
  let out = dict.get(core);
  if (out === undefined) {
    for (const p of patterns) {
      const r = p.re.exec(core);
      if (!r) continue;
      out = p.hi;
      p.names.forEach((n, i) => { out = out.split("{" + n + "}").join(t(r[i + 1])); });
      break;
    }
  }
  return out === undefined ? s : m[1] + out + m[3];
}

// "Score {n}." with values: the English template and its translation share the placeholders.
export function tf(template, vals) {
  let out = templates.get(template) || (dict && dict.get(template)) || template;
  for (const [k, v] of Object.entries(vals || {})) out = out.split("{" + k + "}").join(String(v));
  return out;
}

const skip = el => !!(el && el.closest && el.closest('[translate="no"], code, pre, script, style, textarea, .mono'));
// Collect mode (tests/smoke.mjs with I18N_COLLECT): every interface string seen is reported, to list
// what the dictionary needs.
const seenSet = typeof window !== "undefined" && window.__i18nCollect ? new Set() : null;
const seen = seenSet && { add(v) { if (v && !seenSet.has(v)) { seenSet.add(v); if (window.__i18nSave) window.__i18nSave(v); } } };

function doText(node) {
  const p = node.parentElement;
  if (!p || skip(p)) return;
  const v = node.nodeValue;
  if (seen && /[A-Za-z]{2}/.test(v)) seen.add(v.trim());
  if (!dict) return;
  const nv = t(v);
  if (nv !== v) node.nodeValue = nv;
}
function doAttrs(el) {
  if (skip(el)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    if (seen && /[A-Za-z]{2}/.test(v)) seen.add(v.trim());
    if (!dict) continue;
    const nv = t(v);
    if (nv !== v) el.setAttribute(a, nv);
  }
}
export function translateTree(root) {
  if (!root) return;
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1) return;
  doAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
}

// Keeps everything under root translated as views render and update.
export function observe(root) {
  if (!dict && !seen) return () => {};
  translateTree(root);
  const mo = new MutationObserver(list => {
    for (const m of list) {
      if (m.type === "characterData") doText(m.target);
      else if (m.type === "attributes") doAttrs(m.target);
      else m.addedNodes.forEach(translateTree);
    }
  });
  mo.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  return () => mo.disconnect();
}
