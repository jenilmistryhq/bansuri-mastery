import { h, icon, today } from "../util.js";
import { loadRoomIndex } from "./loader.js";
import { allRoomRecords } from "./state.js";

const DIFF_LABEL = { beginner: "Beginner", easy: "Easy", medium: "Medium", hard: "Hard" };
const DIFF_CLASS = { beginner: "good", easy: "info", medium: "warn", hard: "bad" };

function preqsDone(room, records) {
  if (!room.prerequisites || !room.prerequisites.length) return true;
  return room.prerequisites.every(preId => {
    const rec = records[preId];
    return rec && rec.done;
  });
}

function nextUpId(rooms, records) {
  for (const room of rooms) {
    const rec = records[room.id];
    if (rec && rec.done) continue;
    if (preqsDone(room, records)) return room.id;
  }
  return null;
}

function starsFor(rec) {
  if (!rec || !rec.done || !rec.maxScore) return 0;
  const pct = Math.round((rec.score / rec.maxScore) * 100);
  return pct >= 90 ? 3 : pct >= 70 ? 2 : 1;
}

function starIcons(count) {
  return h("span", { class: "room2-stars" },
    ...Array.from({ length: 3 }, (_, i) =>
      h("span", { class: "room2-star" + (i < count ? " lit" : "") }, icon("star"))));
}

function gridCard(room, records, isNext) {
  const rec = records[room.id];
  const done = rec && rec.done;
  const pct = rec ? (room.taskCount ? Math.round(Object.keys(rec.tasks).length / room.taskCount * 100) : 0) : 0;
  const stars = starsFor(rec);

  return h("a", { class: "rg-card" + (done ? " rg-done" : "") + (isNext ? " rg-next" : ""), href: "#/rooms/" + room.id },
    h("div", { class: "rg-card-top" },
      h("span", { class: "rg-order" }, String(room.order || "")),
      done ? h("span", { class: "rg-check" }, icon("check")) : pct > 0 ? h("span", { class: "rg-pct" }, pct + "%") : null),
    h("h3", { class: "rg-title" }, room.title),
    h("p", { class: "rg-desc small muted" }, room.description),
    h("div", { class: "rg-footer" },
      h("span", { class: "chip " + (DIFF_CLASS[room.difficulty] || "mutedc") }, DIFF_LABEL[room.difficulty] || room.difficulty),
      done ? starIcons(stars) : null,
      h("span", { class: "rg-meta small muted" }, room.minutes ? room.minutes + " min" : "")));
}

export function upNextCard(index, records) {
  const sorted = [...index].sort((a, b) => (a.order || 99) - (b.order || 99));
  const nextId = nextUpId(sorted, records);
  if (!nextId) return null;
  const room = sorted.find(r => r.id === nextId);
  if (!room) return null;
  const rec = records[room.id];
  const pct = rec ? (room.taskCount ? Math.round(Object.keys(rec.tasks).length / room.taskCount * 100) : 0) : 0;

  return h("article", { class: "card room2-upnext-card" },
    h("div", { class: "row between" },
      h("span", { class: "eyebrow" }, "NEXT ROOM"),
      h("span", { class: "chip " + (DIFF_CLASS[room.difficulty] || "mutedc") }, DIFF_LABEL[room.difficulty] || room.difficulty)),
    h("h3", null, room.title),
    h("p", { class: "small muted" }, room.description),
    h("div", { class: "room-meta small muted" },
      (room.minutes ? room.minutes + " min" : ""),
      room.taskCount ? " - " + room.taskCount + " tasks" : ""),
    pct > 0 ? h("div", { class: "progressbar small", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct) }, h("i", { style: { width: pct + "%" } })) : null,
    h("div", { class: "row roomcard-actions" },
      h("a", { class: "btn primary", href: "#/rooms/" + room.id + "/play" }, pct > 0 ? "Continue" : "Start room"),
      h("a", { class: "btn ghost", href: "#/rooms" }, "All rooms")));
}

export function recommendedCards(index, records) {
  const sorted = [...index].sort((a, b) => (a.order || 99) - (b.order || 99));
  const recs = [];
  for (const room of sorted) {
    if (recs.length >= 4) break;
    const rec = records[room.id];
    if (rec && rec.done) continue;
    recs.push(room);
  }
  if (!recs.length) return null;
  return h("div", { class: "rg-grid" }, recs.map(r => gridCard(r, records, false)));
}

function dailyChallengeCard(sorted, records) {
  const completed = sorted.filter(r => records[r.id] && records[r.id].done);
  if (!completed.length) return null;
  let cs = {};
  try { cs = JSON.parse(localStorage.getItem("bansuri.dailyChallenge") || "{}"); } catch (e) { /* empty */ }
  const done = cs.date === today() && cs.done;
  return h("section", { class: "card room-daily-card" },
    h("div", { class: "row between" },
      h("span", { class: "eyebrow" }, "DAILY CHALLENGE"),
      done ? h("span", { class: "chip good" }, icon("check"), " Done") : h("span", { class: "chip accent" }, "New")),
    h("h3", null, done ? "Today's challenge complete!" : "Ready for today's challenge?"),
    h("p", { class: "small muted" }, done ? "Come back tomorrow for a new one." : "One random task from your completed rooms."),
    h("div", { class: "row roomcard-actions" },
      h("a", { class: "btn" + (done ? " ghost" : " primary"), href: done ? "#/rooms/quick-practice" : "#/rooms/daily-challenge" },
        done ? "Quick Practice" : "Start challenge")));
}

function weaknessSection(sorted, records) {
  const skillWrong = {}, skillTotal = {};
  for (const room of sorted) {
    const rec = records[room.id];
    if (!rec || !rec.done || !rec.answers) continue;
    const skills = room.skills || [];
    let wrong = 0, total = 0;
    for (const ans of Object.values(rec.answers)) { total++; if (!ans.passed) wrong++; }
    for (const skill of skills) {
      skillWrong[skill] = (skillWrong[skill] || 0) + wrong;
      skillTotal[skill] = (skillTotal[skill] || 0) + total;
    }
  }
  const weak = Object.entries(skillWrong).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!weak.length) return null;
  return h("section", { class: "card room-weakness-card" },
    h("h2", null, "Areas to revisit"),
    h("p", { class: "small muted" }, "Skills where you missed the most questions"),
    h("div", { class: "room-weakness-list" },
      ...weak.map(([skill, wrong]) => {
        const total = skillTotal[skill];
        const pct = Math.round((1 - wrong / total) * 100);
        return h("div", { class: "room-weakness-item" },
          h("span", { class: "room-weakness-skill" }, skill),
          h("div", { class: "room-weakness-bar" },
            h("div", { class: "progressbar small" }, h("i", { style: { width: pct + "%" } })),
            h("span", { class: "small muted" }, pct + "% correct")));
      })));
}

export async function renderCatalog(main) {
  const loading = h("div", { class: "page" }, h("div", { class: "boot" }, "Loading rooms..."));
  main.appendChild(loading);

  const index = await loadRoomIndex();
  loading.remove();

  if (!index.length) {
    main.appendChild(h("div", { class: "page" },
      h("section", { class: "card" },
        h("h1", null, "Rooms"),
        h("p", { class: "muted" }, "No rooms available yet. Check back soon!"))));
    return;
  }

  const sorted = [...index].sort((a, b) => (a.order || 99) - (b.order || 99));
  const titleMap = {};
  sorted.forEach(r => { titleMap[r.id] = r.title; });
  sorted.forEach(r => { r._preqTitles = titleMap; });

  const records = {};
  try {
    const raw = JSON.parse(localStorage.getItem("bansuri.rooms") || "{}");
    Object.assign(records, raw);
  } catch (e) { /* empty */ }

  const diffFilters = ["all", "beginner", "easy", "medium", "hard"];
  let activeDiff = "all";

  const allSkills = [...new Set(sorted.flatMap(r => r.skills || []))].sort();
  let activeSkill = "all";

  const grid = h("div", { class: "rg-grid" });
  const filterRow = h("div", { class: "room-filters" });
  const skillRow = h("div", { class: "room-filters room-skill-filters" });

  const nextId = nextUpId(sorted, records);

  function render() {
    let filtered = sorted;
    if (activeDiff !== "all") filtered = filtered.filter(r => r.difficulty === activeDiff);
    if (activeSkill !== "all") filtered = filtered.filter(r => (r.skills || []).includes(activeSkill));
    grid.replaceChildren(...filtered.map(room => gridCard(room, records, room.id === nextId)));
    filterRow.replaceChildren(...diffFilters.map(f => {
      const btn = h("button", {
        type: "button",
        class: "chip" + (f === activeDiff ? " active" : " mutedc")
      }, f === "all" ? "All" : DIFF_LABEL[f] || f);
      btn.addEventListener("click", () => { activeDiff = f; render(); });
      return btn;
    }));
    skillRow.replaceChildren(
      h("span", { class: "small muted room-skill-label" }, "Skill:"),
      ...["all", ...allSkills].map(s => {
        const btn = h("button", {
          type: "button",
          class: "chip" + (s === activeSkill ? " active" : " mutedc")
        }, s === "all" ? "All" : s);
        btn.addEventListener("click", () => { activeSkill = s; render(); });
        return btn;
      }));
  }

  const completedRooms = sorted.filter(r => records[r.id] && records[r.id].done);
  const completedCount = completedRooms.length;
  const totalTimeS = Object.values(records).reduce((sum, r) => sum + (r.timeS || 0), 0);
  const totalMins = Math.round(totalTimeS / 60);
  const totalStars = completedRooms.reduce((sum, r) => sum + starsFor(records[r.id]), 0);
  const maxStars = sorted.length * 3;
  const avgScore = completedCount
    ? Math.round(completedRooms.reduce((sum, r) => {
        const rec = records[r.id];
        return sum + (rec.maxScore ? (rec.score / rec.maxScore) * 100 : 100);
      }, 0) / completedCount)
    : 0;

  const statsCard = completedCount > 0
    ? h("section", { class: "card room-stats-card" },
        h("div", { class: "room-stats-grid" },
          h("div", { class: "room-stat-item" },
            h("b", null, String(completedCount)),
            h("span", { class: "small muted" }, completedCount === 1 ? "room done" : "rooms done")),
          h("div", { class: "room-stat-item" },
            h("b", null, totalStars + " / " + maxStars),
            h("span", { class: "small muted" }, "stars")),
          h("div", { class: "room-stat-item" },
            h("b", null, totalMins < 60 ? totalMins + " min" : Math.floor(totalMins / 60) + "h " + (totalMins % 60) + "m"),
            h("span", { class: "small muted" }, "time spent")),
          h("div", { class: "room-stat-item" },
            h("b", null, avgScore + "%"),
            h("span", { class: "small muted" }, "avg score"))))
    : null;

  const dailyCard = dailyChallengeCard(sorted, records);
  const weakCard = weaknessSection(sorted, records);
  const quickLink = completedCount > 0
    ? h("div", { class: "room-quick-links" },
        h("a", { class: "btn ghost small", href: "#/rooms/quick-practice" }, "Quick Practice"),
        h("a", { class: "btn ghost small", href: "#/rooms/daily-challenge" }, "Daily Challenge"))
    : null;

  const page = h("div", { class: "page" },
    h("section", { class: "room-catalog-head" },
      h("div", { class: "row between" },
        h("div", null,
          h("h1", null, "Rooms"),
          h("p", { class: "muted" }, "All interactive challenges. Pick any room and start learning.")),
        h("a", { class: "btn", href: "#/course" }, "Learning paths")),
      h("div", { class: "room-catalog-progress" },
        h("span", { class: "small muted" }, completedCount + " of " + sorted.length + " completed"),
        h("div", { class: "progressbar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(sorted.length), "aria-valuenow": String(completedCount) },
          h("i", { style: { width: (sorted.length ? Math.round(completedCount / sorted.length * 100) : 0) + "%" } })))),
    dailyCard,
    statsCard,
    quickLink,
    weakCard,
    filterRow,
    skillRow,
    grid);
  main.appendChild(page);
  render();
}
