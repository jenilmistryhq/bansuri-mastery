// Runs the test suites in parallel, as separate processes, and reports each one's time and result.
// Usage: node tests/run.mjs           the full tier: every unit test, lint, the build check, the whole
//                                      smoke test (its lesson walk split over several processes),
//                                      WebKit and the visual check
//        node tests/run.mjs --fast    the quick tier for every change: unit tests, lint, the build
//                                      check, every smoke section except the lesson walk, and a walk of
//                                      the lessons that together use every step kind once
//        --shards=N                   processes for the lesson walk (default 16 full, 8 fast)
//        --no-webkit, --no-visual     leave those out of the full tier
// Each suite still runs on its own exactly as before (npm test, node tests/smoke.mjs, ...).
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const fast = args.includes("--fast");
const opt = name => { const a = args.find(x => x.startsWith("--" + name + "=")); return a ? a.split("=")[1] : undefined; };
const shards = Number(opt("shards") || (fast ? 8 : 16));

// The lessons whose walk, together, covers every step kind the walker knows (a greedy set cover of
// the kinds in app/js/lessons), plus one review day (built by lessons/practice.js like a practice
// day, with the review quiz and the spaced-review piece on top). Lesson-specific content in the
// other lessons, and the other practice days, are walked in the full tier only.
const FAST_WALK = "m0,m1,m3,m4,m43,m85,m127,m183,m190,m216,m372,m407,m466,m467,m617,p7";

const node = (name, file, env = {}, extra = []) => ({ name, cmd: process.execPath, args: [file, ...extra], env });
const tasks = [
  ...["core", "live", "plan", "transcribe", "ornaments", "games", "lesson"].map(t => node("unit " + t, "tests/" + t + ".test.mjs")),
  node("eslint", "node_modules/eslint/bin/eslint.js", {}, ["."]),
  { name: "build check", cmd: process.platform === "win32" ? "python" : "python3", args: ["scripts/build_app.py", "--check"], env: {} },
  // Most smoke sections share one page and its stored progress, in order, so they stay in one process.
  // The live exercises (their own page, settings reset first) and the lesson walk (each lesson in its
  // own fresh browser context) do not depend on them, so they run beside it.
  node("smoke: sections", "tests/smoke.mjs", { SECTION: "^(?!Every day's lesson|Live exercises)" }),
  node("smoke: live exercises", "tests/smoke.mjs", { SECTION: "^Live exercises" }),
  ...Array.from({ length: shards }, (_, i) => node("smoke: lesson walk " + (i + 1) + "/" + shards, "tests/smoke.mjs",
    Object.assign({ SECTION: "^Every day's lesson", WALK_SHARD: (i + 1) + "/" + shards }, fast ? { WALK_ONLY: FAST_WALK } : {}))),
];
if (!fast && !args.includes("--no-webkit")) tasks.push(node("webkit", "tests/webkit.mjs"));
if (!fast && !args.includes("--no-visual")) tasks.push(node("visual", "tests/visual.mjs"));

const t0 = Date.now();
const secs = ms => (ms / 1000).toFixed(1) + " s";
const run = task => new Promise(resolve => {
  const start = Date.now();
  const p = spawn(task.cmd, task.args, { cwd: ROOT, env: Object.assign({}, process.env, task.env) });
  let out = "";
  p.stdout.on("data", d => { out += d; });
  p.stderr.on("data", d => { out += d; });
  p.on("error", e => { out += String(e); });
  p.on("close", code => {
    const ms = Date.now() - start;
    const oks = out.split("\n").filter(l => /^\s*ok\s/.test(l)).length;
    console.log((code === 0 ? "pass " : "FAIL ") + secs(ms).padStart(8) + "  " + task.name + (oks ? " (" + oks + " checks)" : ""));
    if (code !== 0) console.log(out.split("\n").filter(l => !/^\s*ok\s/.test(l) && !/MODULE_TYPELESS|Reparsing as ES|To eliminate this warning|trace-warnings/.test(l)).map(l => "      " + l).join("\n"));
    resolve({ task, code, ms, oks });
  });
});
console.log((fast ? "Fast" : "Full") + " tier: " + tasks.length + " processes in parallel");
const results = await Promise.all(tasks.map(run));
const failed = results.filter(r => r.code !== 0);
console.log((failed.length ? failed.length + " of " + results.length + " failed" : "all " + results.length + " passed") + ", " + results.reduce((a, r) => a + r.oks, 0) + " checks ok, in " + secs(Date.now() - t0));
process.exit(failed.length ? 1 : 0);
