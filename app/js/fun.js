// Daily quests, points and celebrations. Quests are picked from the date (the same three all day)
// and checked against what the learner plays (the "bansuri:live" results) and today's session.
import { h, today, toast } from "./util.js";
import { getState, update } from "./state.js";
import { ac, click } from "./core/audio.js";
import { award, xpState } from "./xp.js";

// Each quest: id, text(goal), the goal for this learner, and how a result advances it.
export const POOL = [
  { id: "hold", text: g => `Hold a note steady for ${g} seconds`, goal: s => Math.max(4, Math.min(20, Math.floor(bestOf(s) + 1))), step: (d, g) => d.type === "hold" && d.seconds >= g ? g : 0, once: true },
  { id: "echo", text: g => `Get ${g} phrases right in Play back`, goal: () => 3, step: d => d.type === "echo" && d.correct ? 1 : 0 },
  { id: "steer", text: g => `Score ${g} in Steer by pitch`, goal: () => 8, step: (d, g) => d.type === "game" && d.game === "steer" && d.score >= g ? g : 0, once: true },
  { id: "balloon", text: g => `Pop ${g} balloons in one round`, goal: () => 4, step: (d, g) => d.type === "game" && d.game === "balloon" && d.score >= g ? g : 0, once: true },
  { id: "falling", text: () => "Get 2 stars on a song in Falling notes", goal: () => 1, step: d => d.type === "game" && d.game === "falling" && d.stars >= 2 ? 1 : 0 },
  { id: "jam", text: g => `Jam with the band for ${g} minutes`, goal: () => 2, step: d => d.type === "game" && d.game === "jam" ? d.minutes : 0 },
  { id: "tap", text: () => "Tap a round of the beat with 70% of taps within 50 ms", goal: () => 1, step: d => d.type === "tap" && d.within >= 0.7 ? 1 : 0 },
  { id: "boat", text: g => `Sail the boat ${g} metres in Long-breath boat`, goal: () => 40, step: (d, g) => d.type === "game" && d.game === "boat" && d.score >= g ? g : 0, once: true },
  { id: "bullseye", text: g => `Score ${g} in Bullseye`, goal: () => 50, step: (d, g) => d.type === "game" && d.game === "bullseye" && d.score >= g ? g : 0, once: true },
  { id: "road", text: g => `Stay on the Glide road ${g}% of the time`, goal: () => 60, step: (d, g) => d.type === "game" && d.game === "road" && d.score >= g ? g : 0, once: true },
  { id: "wrong", text: g => `Spot ${g} wrong notes in one round`, goal: () => 4, step: (d, g) => d.type === "game" && d.game === "wrong" && d.score >= g ? g : 0, once: true },
  { id: "sam", text: g => `Catch the sam ${g} times in one round`, goal: () => 5, step: (d, g) => d.type === "game" && d.game === "sam" && d.hits >= g ? g : 0, once: true },
  { id: "ornament", text: g => `Score ${g}% in Meend bridge, Kan flick, Murki chase or Andolan lamp`, goal: () => 60, step: (d, g) => d.type === "game" && ["meendbridge", "kanflick", "murkichase", "andolanlamp"].includes(d.game) && d.score >= g ? g : 0, once: true },
  { id: "swell", text: g => `Score ${g} in Swell and fade`, goal: () => 60, step: (d, g) => d.type === "game" && d.game === "swell" && d.score >= g ? g : 0, once: true },
  { id: "phrase", text: g => `Score ${g}% on a phrase in Raga phrases`, goal: () => 70, step: (d, g) => d.type === "game" && d.game === "phrase" && d.score >= g ? g : 0, once: true },
  { id: "laya", text: g => `Score ${g}% in the Laya ladder`, goal: () => 60, step: (d, g) => d.type === "game" && d.game === "laya" && d.score >= g ? g : 0, once: true },
  { id: "tihai", text: () => "Land a tihai on sam", goal: () => 1, step: d => d.type === "game" && d.game === "tihai" && d.landed ? 1 : 0 },
  { id: "song", text: () => "Play along with a song and get 80% of the notes right", goal: () => 1, step: d => d.type === "play" && d.n && d.ok / d.n >= 0.8 ? 1 : 0 },
];
const POINTS = 20, BONUS = 20;

function bestOf(s) {
  let best = 0;
  for (const list of Object.values(s.live.holds)) for (const x of list) best = Math.max(best, x.s);
  return best;
}

// Three quests for a date, the same all day: picked from the date, one of them always today's session.
export function questsFor(date, s) {
  let seed = 0; for (const ch of date) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = POOL.slice(), picked = [];
  while (picked.length < 2 && pool.length) { seed = (seed * 1103515245 + 12345) >>> 0; picked.push(pool.splice(seed % pool.length, 1)[0]); }
  return [{ id: "session", text: () => "Finish today's session", goal: () => 1 }].concat(picked).map(q => ({ id: q.id, goal: q.goal(s), text: q.text(q.goal(s)) }));
}

function todays(s) {
  const t = today();
  if (!s.live.quests || s.live.quests.date !== t) s.live.quests = { date: t, list: questsFor(t, s), progress: {}, done: {} };
  return s.live.quests;
}

export function questState() {
  const s = getState();
  const q = s.live.quests && s.live.quests.date === today() ? s.live.quests : { date: today(), list: questsFor(today(), s), progress: {}, done: {} };
  // Today's session counts once a session has been logged today.
  const sessionDone = s.log.some(e => e.date === today() && e.day !== null && e.day !== undefined);
  return { list: q.list.map(x => ({ ...x, progress: x.id === "session" ? (sessionDone ? 1 : 0) : (q.progress[x.id] || 0), done: x.id === "session" ? sessionDone : !!q.done[x.id] })), xp: xpState().total };
}


// Advances today's quests with one result; returns the quests it completed (to celebrate).
export function advanceQuests(d) {
  const finished = [];
  let bonus = false;
  update(s => {
    const q = todays(s);
    for (const item of q.list) {
      if (q.done[item.id] || item.id === "session") continue;
      const def = POOL.find(p => p.id === item.id); if (!def) continue;
      const inc = def.step(d, item.goal);
      if (!inc) continue;
      q.progress[item.id] = def.once ? Math.max(q.progress[item.id] || 0, inc) : (q.progress[item.id] || 0) + inc;
      if (q.progress[item.id] >= item.goal) {
        q.done[item.id] = true; finished.push(item);
        if (q.list.filter(x => x.id !== "session").every(x => q.done[x.id])) bonus = true;
      }
    }
  });
  finished.forEach(() => award("quest", { amount: POINTS }));
  if (bonus) award("quest", { amount: BONUS });
  return finished;
}

// Points for finishing today's session (once a day).
export function sessionQuestPoints() {
  let first = false;
  update(s => { const q = todays(s); if (!q.done.session) { q.done.session = true; first = true; } });
  if (first) award("quest", { amount: POINTS });
}

// A short burst of confetti and a chime. Without motion when the learner prefers less motion.
export function celebrate(text) {
  if (text) toast(text);
  try { const c = ac(), t = c.currentTime + 0.02; click(t, "tali"); click(t + 0.12, "tali"); click(t + 0.24, "sam"); } catch (e) { /* audio unavailable */ }
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = h("canvas", { class: "confetti", "aria-hidden": "true" });
  document.body.append(canvas);
  const W = canvas.width = window.innerWidth, H = canvas.height = window.innerHeight, g = canvas.getContext("2d");
  const css = getComputedStyle(document.documentElement), cols = ["--accent", "--bamboo", "--good", "--warn"].map(k => css.getPropertyValue(k).trim() || "#52b8b3");
  const bits = Array.from({ length: 90 }, () => ({ x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 9 - 3, r: Math.random() * 6 + 3, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * 6 }));
  const t0 = performance.now();
  const frame = now => {
    const k = (now - t0) / 1400;
    g.clearRect(0, 0, W, H);
    for (const b of bits) { b.vy += 0.25; b.x += b.vx; b.y += b.vy; b.a += 0.2; g.globalAlpha = Math.max(0, 1 - k); g.fillStyle = b.c; g.save(); g.translate(b.x, b.y); g.rotate(b.a); g.fillRect(-b.r / 2, -b.r / 4, b.r, b.r / 2); g.restore(); }
    if (k < 1) requestAnimationFrame(frame); else canvas.remove();
  };
  requestAnimationFrame(frame);
}
