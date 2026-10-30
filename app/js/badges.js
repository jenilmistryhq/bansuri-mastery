// Badges: earned from real progress (days, milestones, streaks, hours, recordings, reviews, ear quiz).
import { getState, update } from "./state.js";
import { totals, streaks, getPlan } from "./course.js";
import { today, toast } from "./util.js";

function earAcc(s, level) {
  const e = s.ear[level];
  return e && e.total >= 20 && e.right / e.total >= 0.9;
}

export function rules() {
  const plan = getPlan();
  const ms = plan ? plan.milestones : [];
  const list = [
    { id: "setup", medal: "0", title: "Set up", desc: "Finished Day 0: flute checked, tools ready.", test: s => !!(s.days[0] && s.days[0].done) },
    { id: "first-day", medal: "1", title: "First breath", desc: "Finished your first practice day.", test: s => !!(s.days[1] && s.days[1].done) },
    { id: "week-one", medal: "7", title: "First week", desc: "Reached Day 8.", test: s => s.current >= 8 },
    { id: "streak-3", medal: "3", title: "Three in a row", desc: "Practised 3 days in a row.", test: (s, c) => c.streaks.best >= 3 },
    { id: "streak-7", medal: "7d", title: "A week of riyaz", desc: "Practised 7 days in a row.", test: (s, c) => c.streaks.best >= 7 },
    { id: "streak-30", medal: "30", title: "A month of riyaz", desc: "Practised 30 days in a row.", test: (s, c) => c.streaks.best >= 30 },
    { id: "streak-100", medal: "100", title: "Hundred days", desc: "Practised 100 days in a row.", test: (s, c) => c.streaks.best >= 100 },
    { id: "hours-5", medal: "5h", title: "Five hours", desc: "5 hours of logged practice.", test: (s, c) => c.totals.minutes >= 300 },
    { id: "hours-25", medal: "25h", title: "Twenty-five hours", desc: "25 hours of logged practice.", test: (s, c) => c.totals.minutes >= 1500 },
    { id: "hours-100", medal: "100h", title: "Hundred hours", desc: "100 hours of logged practice.", test: (s, c) => c.totals.minutes >= 6000 },
    { id: "recorder", medal: "R", title: "On the record", desc: "Saved your first recording.", test: s => (s.recordings || 0) >= 1 },
    { id: "archivist", medal: "25R", title: "Listening back", desc: "Saved 25 recordings.", test: s => (s.recordings || 0) >= 25 },
    { id: "reviewer", medal: "SR", title: "Nothing forgotten", desc: "Completed 25 spaced reviews.", test: s => Object.values(s.reviews).reduce((a, r) => a + (r.done || 0), 0) >= 25 },
    { id: "ear-2", medal: "E2", title: "Sa or Pa", desc: "Ear quiz Level 2: 90% over 20+ answers.", test: s => earAcc(s, "2") },
    { id: "ear-3", medal: "E3", title: "Four swaras", desc: "Ear quiz Level 3: 90% over 20+ answers.", test: s => earAcc(s, "3") },
    { id: "ear-4", medal: "E4", title: "Seven swaras", desc: "Ear quiz Level 4: 90% over 20+ answers.", test: s => earAcc(s, "4") },
    { id: "ear-6", medal: "E6", title: "Twelve notes", desc: "Ear quiz Level 6: 90% over 20+ answers.", test: s => earAcc(s, "6") },
  ];
  for (const m of ms) list.push({ id: "ms-" + m.id, medal: m.id, title: m.title, desc: "Passed milestone " + m.id + ".", test: s => s.milestones[m.id] && s.milestones[m.id].status === "passed" });
  return list;
}

export function evaluate() {
  const s = getState();
  const ctx = { totals: totals(), streaks: streaks() };
  const fresh = rules().filter(r => !s.badges[r.id] && r.test(s, ctx));
  if (!fresh.length) return [];
  update(st => { for (const r of fresh) st.badges[r.id] = today(); });
  for (const r of fresh) toast("Badge earned: " + r.title);
  return fresh;
}
