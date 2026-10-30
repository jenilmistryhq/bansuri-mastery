// Experience (XP) and named levels, like a game. Every level has a name in English and Hindi, and each
// level takes more XP than the last: the gap from level L to L+1 is 500 x L, so a level's threshold
// is 250 x L x (L - 1). Level 2 takes a few days of practice; the end of the course is near level 25.
// XP comes from practice that builds skill (sessions, lessons, milestones, reviews, measured playing),
// with daily caps where repeating would otherwise beat practising; every game round earns a little.
import { getState, update } from "./state.js";
import { today, addDays } from "./util.js";
import { getSettings } from "./core/settings.js";

export const LEVELS = [
  ["Newcomer", "नवागंतुक"], ["Listener", "श्रोता"], ["Seeker", "जिज्ञासु"], ["Student", "विद्यार्थी"], ["Disciple", "शिष्य"],
  ["Practitioner", "अभ्यासी"], ["Breath Keeper", "साँस-साधक"], ["Tone Seeker", "सुर-खोजी"], ["Melody Maker", "धुन-कार"], ["Sadhak", "साधक"],
  ["Rhythm Keeper", "लय-पालक"], ["Raga Explorer", "राग-यात्री"], ["Kan Crafter", "कण-शिल्पी"], ["Improviser", "उपज-कार"], ["Composer", "रचनाकार"],
  ["Performer", "वादक"], ["Artist", "कलाकार"], ["Swara Sadhak", "स्वर-साधक"], ["Raga Scholar", "राग-विद्वान"], ["Virtuoso", "गुणी"],
  ["Maestro", "सिद्धहस्त"], ["Bansuri Master", "बाँसुरी-सिद्ध"], ["Raga Sage", "राग-मनीषी"], ["Nada Yogi", "नाद-योगी"], ["Grandmaster", "महारथी"],
  ["Luminary", "ज्योति"], ["Legend", "दिग्गज"], ["Mythic", "पौराणिक"], ["Ascended", "ऊर्ध्वगामी"], ["Anahad Nada", "अनहद नाद"],
].map(([en, hi], i) => ({ level: i + 1, xp: 250 * (i + 1) * i, en, hi }));

// The rules: XP per event, a daily cap per source (null = none), and once = only the first time per key.
export const RULES = {
  session: { xp: 50, once: true, label: "Finished a session, once a day (+10 per step done)" },
  milestone: { xp: 300, once: true, label: "Passed a milestone" },
  lesson: { xp: 30, once: true, label: "Finished a lesson's cards (first time)" },
  lessonAgain: { xp: 5, cap: 10, label: "Went through a lesson again" },
  card: { xp: 5, once: true, label: "A flashcard answered right (first time)" },
  mastery: { xp: 20, once: true, label: "A mastery checklist item ticked" },
  review: { xp: 10, cap: null, label: "A spaced review done" },
  best: { xp: 15, cap: null, label: "A new personal best" },
  play: { xp: 20, cap: 60, label: "Play-along with 80% of the notes right" },
  echo: { xp: 3, cap: 30, label: "A phrase played back right" },
  tap: { xp: 5, cap: 20, label: "A tapping round on the beat" },
  game: { xp: 3, cap: null, label: "A game round played" },
  quest: { xp: 20, cap: null, label: "A daily quest (+20 for all three)" },
  recording: { xp: 15, cap: 30, label: "A recording made" },
  minutes: { xp: 1, cap: 60, label: "Each minute of practice logged" },
};
const STREAK_BONUS = 0.1; // +10% while the practice streak is 7 days or more

export function levelOf(total) {
  let i = 0;
  while (i + 1 < LEVELS.length && total >= LEVELS[i + 1].xp) i++;
  const cur = LEVELS[i], next = LEVELS[i + 1] || null;
  const into = total - cur.xp, need = next ? next.xp - cur.xp : 0;
  return { level: cur.level, en: cur.en, hi: cur.hi, name: getSettings().lang === "hi" ? cur.hi : cur.en, xp: total, from: cur.xp, to: next ? next.xp : null, into, need, pct: next ? Math.min(100, Math.floor(into / need * 100)) : 100, next };
}

function practiceStreak(s) {
  const days = new Set(s.log.map(e => e.date));
  let n = 0, d = today();
  if (!days.has(d)) d = addDays(d, -1);
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

// XP from the learner's history, for learners who practised before XP existed.
export function xpFromHistory(s) {
  let total = 0;
  for (const ds of Object.values(s.days || {})) {
    if (!ds || !ds.done) continue;
    total += RULES.session.xp + 10 * Object.values(ds.blocks || {}).filter(Boolean).length;
  }
  const perDay = {};
  for (const e of s.log || []) perDay[e.date] = (perDay[e.date] || 0) + (e.minutes || 0);
  for (const m of Object.values(perDay)) total += Math.min(RULES.minutes.cap, m);
  for (const m of Object.values(s.milestones || {})) if (m.status === "passed") total += RULES.milestone.xp;
  for (const r of Object.values(s.reviews || {})) total += RULES.review.xp * (r.stage || 0);
  total += (s.live && s.live.points) || 0; // quest points from before XP
  total += RULES.recording.xp * Math.min(200, s.recordings || 0);
  return total;
}

function fresh(s) { return { total: xpFromHistory(s), day: today(), caps: {}, once: {}, recent: [], days: {}, seen: null }; }
export function xpState() {
  const s = getState();
  return s.xp || fresh(s);
}

const listeners = new Set();
// fn({ gained, src, level, leveledUp }) after each award (main.js shows it).
export function onXp(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Awards XP for one event. key: for once-only rules (a lesson's path, a milestone id). extra: added
// XP on top of the rule (the per-step part of a session). Returns the XP actually given.
export function award(src, opts) {
  const rule = RULES[src];
  if (!rule) return 0;
  const o = opts || {};
  let gained = 0, before = 0, after = 0;
  update(s => {
    if (!s.xp) s.xp = fresh(s);
    const x = s.xp, d = today();
    if (x.day !== d) { x.day = d; x.caps = {}; }
    if (rule.once) { const k = src + ":" + (o.key || ""); if (x.once[k]) return; x.once[k] = d; }
    let n = (o.amount !== undefined ? o.amount : rule.xp) + (o.extra || 0);
    if (rule.cap !== null && rule.cap !== undefined) n = Math.max(0, Math.min(n, rule.cap - (x.caps[src] || 0)));
    if (n <= 0) return;
    x.caps[src] = (x.caps[src] || 0) + n;
    if (practiceStreak(s) >= 7) n = Math.round(n * (1 + STREAK_BONUS));
    before = x.total; x.total += n; after = x.total; gained = n;
    x.days[d] = (x.days[d] || 0) + n;
    const keys = Object.keys(x.days); if (keys.length > 400) delete x.days[keys.sort()[0]];
    x.recent.unshift({ d, src, n }); x.recent.length = Math.min(x.recent.length, 40);
  });
  if (gained) {
    const lv = levelOf(after), up = lv.level > levelOf(before).level;
    listeners.forEach(fn => { try { fn({ gained, src, level: lv, leveledUp: up }); } catch (e) { /* ignore */ } });
  }
  return gained;
}

// Remembers which level the learner has seen celebrated (so a backfilled level is announced once).
export function markLevelSeen() { update(s => { if (!s.xp) s.xp = fresh(s); s.xp.seen = levelOf(s.xp.total).level; }); }
