import { store, storeSet, today, addDays } from "../util.js";
import { getState, update } from "../state.js";

const KEY = "bansuri.rooms";

export function allRoomRecords() { return store(KEY, {}); }
export function roomRecord(id) { return allRoomRecords()[id] || null; }

function save(all) { storeSet(KEY, all); }

export function startRoom(id) {
  const all = allRoomRecords();
  if (!all[id]) all[id] = { started: today(), done: null, score: 0, maxScore: 0, tasks: {}, answers: {}, hintsUsed: 0, timeS: 0 };
  save(all);
  return all[id];
}

export function markTaskDone(roomId, taskId) {
  const all = allRoomRecords(), rec = all[roomId];
  if (!rec) return;
  rec.tasks[taskId] = true;
  save(all);
}

export function saveAnswer(roomId, questionKey, result) {
  const all = allRoomRecords(), rec = all[roomId];
  if (!rec) return;
  const prev = rec.answers[questionKey];
  rec.answers[questionKey] = {
    passed: result.passed,
    attempts: (prev ? prev.attempts : 0) + 1,
    points: result.points || 0,
  };
  if (result.passed && result.points) rec.score += result.points;
  save(all);
}

export function useHint(roomId) {
  const all = allRoomRecords(), rec = all[roomId];
  if (!rec) return;
  rec.hintsUsed++;
  save(all);
}

export function finishRoom(roomId, maxScore) {
  const all = allRoomRecords(), rec = all[roomId];
  if (!rec) return rec;
  rec.done = rec.done || today();
  rec.maxScore = maxScore;
  const pb = {};
  if (!rec.bestScore || rec.score > rec.bestScore) { rec.bestScore = rec.score; pb.score = true; }
  if (rec.timeS > 0 && (!rec.bestTimeS || rec.timeS < rec.bestTimeS)) { rec.bestTimeS = rec.timeS; pb.time = true; }
  save(all);
  return Object.assign(rec, { _pb: pb });
}

export function addTime(roomId, seconds) {
  const all = allRoomRecords(), rec = all[roomId];
  if (!rec) return;
  rec.timeS += seconds;
  save(all);
}

export function roomProgress(roomId, room) {
  const rec = roomRecord(roomId);
  if (!rec) return { done: 0, total: room.tasks.length, pct: 0 };
  const done = room.tasks.filter(t => rec.tasks[t.id]).length;
  return { done, total: room.tasks.length, pct: room.tasks.length ? Math.round(done / room.tasks.length * 100) : 0 };
}

export function getJournal(roomId) {
  const all = allRoomRecords();
  return (all[roomId] && all[roomId].journal) || "";
}

export function saveJournal(roomId, text) {
  const all = allRoomRecords();
  if (!all[roomId]) return;
  all[roomId].journal = text;
  save(all);
}

export function scheduleRoomReviews(room) {
  const rec = roomRecord(room.id);
  if (!rec) return;
  const d = today();
  update(s => {
    for (const task of room.tasks) {
      for (const q of (task.questions || [])) {
        const qKey = task.id + "." + (q.id || (task.questions || []).indexOf(q));
        const ans = rec.answers[qKey];
        if (ans && !ans.passed) {
          const rid = "room:" + room.id + ":" + qKey;
          if (s.reviews[rid]) continue;
          s.reviews[rid] = { label: q.prompt || task.title, learned: d, next: addDays(d, 1), stage: 0, bench: null, read: null, done: 0 };
        }
      }
    }
  });
}
