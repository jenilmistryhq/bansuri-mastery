// Schema checks for app/data/plan.json (no dependencies).
// Run: node tests/plan.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const plan = JSON.parse(readFileSync(join(root, "app", "data", "plan.json"), "utf8"));

let failures = 0;
const fail = (msg) => { failures++; console.error("FAIL: " + msg); };
const ok = (cond, msg) => { if (!cond) fail(msg); };

const SEMI = { S: 0, r: 1, R: 2, g: 3, G: 4, m: 5, M: 6, P: 7, d: 8, D: 9, n: 10, N: 11 };

// Same token rules as the Practice Bench parser: words that are not notation are skipped.
function notes(notation) {
  const out = [];
  for (const raw of notation.split(/\s+/).filter(Boolean)) {
    if (!/^[.SrRgGmMPdDnN'\-_{}~()^,|]+$/.test(raw)) continue;
    let i = 0;
    while (i < raw.length) {
      let low = 0;
      while (raw[i] === ".") { low++; i++; }
      const L = raw[i];
      if (L in SEMI) {
        i++;
        let high = 0;
        while (raw[i] === "'") { high++; i++; }
        out.push(SEMI[L] + 12 * (high - low));
      } else i++;
    }
  }
  return out;
}

// Earliest practice day a note may appear (L09, L11, Day 22 .P, L14, L16, L22, L25).
function unlockDay(s) {
  if (s < -5) return Infinity;
  const pc = ((s % 12) + 12) % 12;
  if ([1, 3, 8, 10].includes(pc)) return 309;
  if (s >= 13) return 141;
  if (s === 5) return 64;
  if (s >= 6) return 43;
  if (s === -5) return 22;
  if (s < 0) return 15;
  return 8;
}

ok(plan.version === 1, "version is 1");
ok(Array.isArray(plan.days) && plan.days.length > 600, "has days");
ok(plan.phases.length === 6, "6 phases");
ok(Object.keys(plan.lessons).length === 38, "38 lessons");
ok(plan.milestones.map((m) => m.id).join() === "M0,M1,M2,M3,M4,M5,M6,M7,M8,M9,M10", "milestones M0-M10 in order");

const milestoneIds = new Set(plan.milestones.map((m) => m.id));
plan.days.forEach((d, i) => {
  const where = `day ${d.n}`;
  ok(d.n === i, `${where}: contiguous numbering (index ${i})`);
  ok(["setup", "practice", "review", "milestone"].includes(d.kind), `${where}: kind`);
  const blocks = d.blocks || (plan.templates[d.template] && plan.templates[d.template].blocks);
  ok(Array.isArray(blocks) && blocks.length > 0, `${where}: blocks or valid template`);
  if (!blocks) return;
  const sum = blocks.reduce((a, b) => a + b.minutes, 0);
  if (d.kind === "practice") ok(sum >= 25 && sum <= 75, `${where}: ${sum} minutes`);
  ok(sum === d.minutes, `${where}: minutes field matches blocks`);
  if (d.kind === "milestone") ok(milestoneIds.has(d.milestone), `${where}: milestone ${d.milestone} exists`);
  const ids = blocks.map((b) => b.id);
  ok(new Set(ids).size === ids.length, `${where}: unique block ids`);
  const benches = blocks.filter((b) => b.bench).map((b) => b.bench)
    .concat((d.newItems || []).filter((it) => it.bench).map((it) => it.bench));
  for (const b of benches) {
    if (!b.notation) continue;
    for (const s of notes(b.notation)) ok(unlockDay(s) <= d.n, `${where}: note ${s} used before it is unlocked (day ${unlockDay(s)})`);
  }
});

for (const m of plan.milestones) {
  const d = plan.days[m.day];
  ok(d && d.milestone === m.id, `milestone ${m.id} points at its day`);
}
for (const p of plan.phases) ok(plan.days[p.firstDay] && plan.days[p.firstDay].phase === p.id, `phase ${p.id} firstDay`);
const c = plan.cycle;
ok(c && c.from > 0 && c.from < c.to && c.to < plan.days.length, "cycle bounds");
ok(plan.days.slice(c.from, c.to + 1).every((d) => d.phase === 5), "cycle stays inside Phase 5");

// Hindi: every day title and pass check reads in Hindi through the interface dictionary
// (app/i18n/hi.json, whole strings and {x} patterns, applied as app/js/core/i18n.js does). Course
// codes (EX-EAR, BPM) and notation are upper case, so a run of lower-case letters is English left.
{
  const { setDict, t } = await import(new URL("../app/js/core/i18n.js", import.meta.url).href);
  setDict(JSON.parse(readFileSync(join(root, "app", "i18n", "hi.json"), "utf8")));
  for (const [field, name] of [["title", "titles"], ["pass", "pass checks"]]) {
    const all = [...new Set(plan.days.map((d) => d[field]).filter(Boolean))];
    const left = all.filter((s) => /[a-z]{3}/.test(t(s)));
    console.log(`plan.test: day ${name} with Hindi: ${all.length - left.length} of ${all.length}`);
    ok(!left.length, `day ${name} without Hindi: ${left.slice(0, 5).join(" | ")}`);
  }
}

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log(`plan.test: OK (${plan.days.length} days, ${Object.keys(plan.templates).length} templates)`);
