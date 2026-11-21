import { h, icon, today } from "../util.js";
import { loadRoom, loadRoomIndex } from "../rooms/loader.js";
import { roomRecord, roomProgress, allRoomRecords, getJournal, saveJournal } from "../rooms/state.js";
import { renderCatalog } from "../rooms/catalog.js";
import { roomPlayer } from "../rooms/player.js";
import { renderQuestion } from "../rooms/questions.js";
import { award } from "../xp.js";
import { stopAll } from "../core/audio.js";

const DIFF_LABEL = { beginner: "Beginner", easy: "Easy", medium: "Medium", hard: "Hard" };
const DIFF_CLASS = { beginner: "good", easy: "info", medium: "warn", hard: "bad" };

function fmtTime(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return m + ":" + String(sec).padStart(2, "0");
}

async function detail(main, id) {
  const room = await loadRoom(id);
  if (!room) {
    main.appendChild(h("div", { class: "page" },
      h("section", { class: "card" },
        h("h1", null, "Room not found"),
        h("a", { href: "#/rooms" }, "Back to rooms"))));
    return;
  }
  const rec = roomRecord(room.id);
  const done = rec && rec.done;
  const p = roomProgress(room.id, room);

  const index = await loadRoomIndex();
  const preqTitles = {};
  index.forEach(r => { preqTitles[r.id] = r.title; });

  const page = h("div", { class: "page room-detail room2-detail" });
  page.append(
    h("a", { class: "backlink", href: "#/rooms" }, "< All rooms"),
    h("section", { class: "hero room-hero" },
      h("div", { class: "row between" },
        room.order ? h("span", { class: "room2-order-badge" }, "Room " + room.order) : null,
        h("span", { class: "chip " + (DIFF_CLASS[room.difficulty] || "mutedc") }, DIFF_LABEL[room.difficulty] || room.difficulty),
        done ? h("span", { class: "chip good" }, icon("check"), " Complete") : null),
      h("h1", null, room.title),
      h("p", { class: "muted" }, room.description),
      h("p", { class: "small muted" },
        (room.minutes ? room.minutes + " minutes" : "") +
        (room.tasks ? " - " + room.tasks.length + " tasks" : "")),
      done && rec.bestScore ? h("p", { class: "room-pb-detail small" },
        icon("star"), " Best: " + rec.bestScore + "/" + rec.maxScore +
        (rec.bestTimeS ? " in " + fmtTime(rec.bestTimeS) : "")) : null,
      h("div", { class: "lesson-cover-progress" },
        h("div", { class: "row between small" },
          h("span", null, "Progress"),
          h("b", null, p.done + " / " + p.total + " tasks")),
        h("div", { class: "progressbar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(p.total || 1), "aria-valuenow": String(p.done) },
          h("i", { style: { width: p.pct + "%" } })))),
    h("section", { class: "card" },
      h("h2", null, "Tasks"),
      h("ol", { class: "room-task-list" }, room.tasks.map((t, i) => {
        const taskDone = rec && rec.tasks[t.id];
        return h("li", { class: taskDone ? "done" : "" },
          h("span", { class: "room-task-num" }, taskDone ? icon("check") : String(i + 1)),
          h("span", null, t.title),
          h("span", { class: "small muted" }, (t.questions || []).length + " questions"));
      }))),
    h("section", { class: "card" },
      h("h2", null, "Skills covered"),
      h("div", { class: "room-tags" }, (room.skills || []).map(s => h("span", { class: "chip mutedc" }, s))),
      room.prerequisites && room.prerequisites.length
        ? h("div", { class: "room2-prereqs" },
            h("p", { class: "small muted" }, "Suggested first:"),
            h("ul", { class: "room2-prereq-list" }, room.prerequisites.map(preId => {
              const preRec = roomRecord(preId);
              const preDone = preRec && preRec.done;
              return h("li", { class: preDone ? "done" : "" },
                h("span", null, preDone ? icon("check") : icon("star")),
                h("a", { href: "#/rooms/" + preId }, preqTitles[preId] || preId),
                preDone ? h("span", { class: "small muted" }, " Complete") : null);
            })))
        : null));

  page.append(h("section", { class: "card room-start" },
    h("a", { class: "btn primary big", href: "#/rooms/" + room.id + "/play" }, done ? "Play again" : p.done > 0 ? "Continue" : "Start room")));

  const journalText = getJournal(room.id);
  const textarea = h("textarea", { class: "room-journal-input", placeholder: "Write your notes about this room...", rows: "4" });
  textarea.value = journalText;
  let saveTimeout = null;
  textarea.addEventListener("input", () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveJournal(room.id, textarea.value), 500);
  });
  page.append(h("section", { class: "card room-journal" },
    h("h2", null, "Your notes"),
    h("p", { class: "small muted" }, "Private notes - only stored on this device."),
    textarea));

  main.appendChild(page);
}

async function play(main, id) {
  const room = await loadRoom(id);
  if (!room) {
    main.appendChild(h("div", { class: "page" },
      h("section", { class: "card" },
        h("h1", null, "Room not found"),
        h("a", { href: "#/rooms" }, "Back to rooms"))));
    return;
  }

  const player = roomPlayer(room, {
    onExit() { location.hash = "#/rooms/" + room.id; },
    onFinished() { location.hash = "#/rooms/" + room.id; },
  });
  main.appendChild(player.el);
  return () => player.destroy();
}

async function quickPractice(main) {
  const loading = h("div", { class: "page" }, h("div", { class: "boot" }, "Loading..."));
  main.appendChild(loading);

  const index = await loadRoomIndex();
  const records = allRoomRecords();
  const completedIds = index.filter(r => records[r.id] && records[r.id].done).map(r => r.id);

  if (!completedIds.length) {
    loading.remove();
    main.appendChild(h("div", { class: "page" },
      h("section", { class: "card" },
        h("h1", null, "Quick Practice"),
        h("p", { class: "muted" }, "Complete at least one room to unlock Quick Practice."),
        h("a", { class: "btn primary", href: "#/rooms" }, "Browse rooms"))));
    return;
  }

  const questions = [];
  for (const id of completedIds) {
    const room = await loadRoom(id);
    if (!room) continue;
    for (const task of room.tasks) {
      for (const q of (task.questions || [])) {
        if (["hold", "play", "ear"].includes(q.type)) {
          questions.push({ ...q, _roomTitle: room.title, _taskTitle: task.title });
        }
      }
    }
  }
  loading.remove();

  if (!questions.length) {
    main.appendChild(h("div", { class: "page" },
      h("section", { class: "card" },
        h("h1", null, "Quick Practice"),
        h("p", { class: "muted" }, "No practice questions found in your completed rooms."),
        h("a", { class: "btn primary", href: "#/rooms" }, "Browse rooms"))));
    return;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  shuffle(questions);
  const batch = questions.slice(0, 10);
  let idx = 0, score = 0;
  const total = batch.length;
  let qDestroy = null;

  document.documentElement.classList.add("fullfocus");

  const titleEl = h("h1", { class: "room-title" }, "Quick Practice");
  const counterEl = h("span", { class: "room-timer small muted" }, "1 / " + total);
  const closeBtn = h("button", { type: "button", class: "room-close", "aria-label": "Close" }, icon("x"));
  const progressBar = h("div", { class: "room-progress" }, h("div", { class: "room-progress-fill" }));
  const fill = progressBar.firstChild;
  const content = h("div", { class: "room-main" });

  const el = h("div", { class: "room-player" },
    h("header", { class: "room-topbar" }, closeBtn, titleEl, counterEl, progressBar),
    h("div", { class: "room-body" }, content));

  function cleanup() {
    if (qDestroy && qDestroy.destroy) qDestroy.destroy();
    qDestroy = null;
    stopAll();
  }

  function showQuestion() {
    cleanup();
    if (idx >= batch.length) { showResults(); return; }
    const q = batch[idx];
    counterEl.textContent = (idx + 1) + " / " + total;
    fill.style.width = Math.round((idx / total) * 100) + "%";

    const qr = renderQuestion(q, result => {
      if (result.passed && result.points > 0) { score += result.points; award("room"); }
      setTimeout(() => { idx++; showQuestion(); }, 800);
    });
    qDestroy = qr;

    const skipBtn = h("button", { type: "button", class: "btn ghost" }, "Skip");
    skipBtn.addEventListener("click", () => { idx++; showQuestion(); });

    content.replaceChildren(
      h("p", { class: "small muted" }, q._roomTitle + " - " + q._taskTitle),
      qr.el,
      h("div", { class: "room-nav" }, skipBtn));
    content.scrollTo(0, 0);
  }

  function showResults() {
    cleanup();
    fill.style.width = "100%";
    document.documentElement.classList.remove("fullfocus");

    const againBtn = h("button", { type: "button", class: "btn ghost" }, "Practice again");
    againBtn.addEventListener("click", () => {
      idx = 0; score = 0;
      shuffle(batch);
      document.documentElement.classList.add("fullfocus");
      showQuestion();
    });

    content.replaceChildren(
      h("div", { class: "room-complete" },
        h("h1", null, "Practice complete!"),
        h("div", { class: "room-complete-stats" },
          h("div", { class: "room-stat" }, h("b", null, String(score)), h("span", null, " points")),
          h("div", { class: "room-stat" }, h("b", null, String(total)), h("span", null, " questions"))),
        h("div", { class: "room-complete-actions" },
          h("a", { class: "btn primary", href: "#/rooms" }, "Back to rooms"),
          againBtn)));
  }

  closeBtn.addEventListener("click", () => {
    cleanup();
    document.documentElement.classList.remove("fullfocus");
    location.hash = "#/rooms";
  });

  main.appendChild(el);
  showQuestion();

  return () => {
    cleanup();
    document.documentElement.classList.remove("fullfocus");
  };
}

async function dailyChallenge(main) {
  const loading = h("div", { class: "page" }, h("div", { class: "boot" }, "Loading..."));
  main.appendChild(loading);

  const index = await loadRoomIndex();
  const records = allRoomRecords();
  const completed = index.filter(r => records[r.id] && records[r.id].done);

  if (!completed.length) {
    loading.remove();
    main.appendChild(h("div", { class: "page" },
      h("section", { class: "card" },
        h("h1", null, "Daily Challenge"),
        h("p", { class: "muted" }, "Complete at least one room to unlock the daily challenge."),
        h("a", { class: "btn primary", href: "#/rooms" }, "Browse rooms"))));
    return;
  }

  const d = today();
  let seed = 0;
  for (const ch of d) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  seed = (seed * 1103515245 + 12345) >>> 0;
  const roomInfo = completed[seed % completed.length];

  const room = await loadRoom(roomInfo.id);
  loading.remove();

  if (!room || !room.tasks.length) {
    main.appendChild(h("div", { class: "page" },
      h("section", { class: "card" },
        h("h1", null, "Daily Challenge"),
        h("p", { class: "muted" }, "Could not load today's challenge."),
        h("a", { class: "btn primary", href: "#/rooms" }, "Browse rooms"))));
    return;
  }

  seed = (seed * 1103515245 + 12345) >>> 0;
  const task = room.tasks[seed % room.tasks.length];

  const cKey = "bansuri.dailyChallenge";
  let cs = {};
  try { cs = JSON.parse(localStorage.getItem(cKey) || "{}"); } catch (e) { /* empty */ }

  if (cs.date === d && cs.done) {
    main.appendChild(h("div", { class: "page" },
      h("section", { class: "card room-daily-done" },
        h("div", { class: "room-daily-badge" }, icon("check")),
        h("h1", null, "Today's challenge complete!"),
        h("p", { class: "muted" }, "From \"" + room.title + "\" - " + task.title),
        h("p", { class: "small muted" }, "Come back tomorrow for a new one."),
        h("div", { class: "room-complete-actions" },
          h("a", { class: "btn primary", href: "#/rooms" }, "Browse rooms"),
          h("a", { class: "btn ghost", href: "#/rooms/quick-practice" }, "Quick Practice")))));
    return;
  }

  document.documentElement.classList.add("fullfocus");

  const titleEl = h("h1", { class: "room-title" }, "Daily Challenge");
  const closeBtn = h("button", { type: "button", class: "room-close", "aria-label": "Close" }, icon("x"));
  const progressBar = h("div", { class: "room-progress" }, h("div", { class: "room-progress-fill" }));
  const content = h("div", { class: "room-main" });
  let qDestroys = [];

  const el = h("div", { class: "room-player" },
    h("header", { class: "room-topbar" }, closeBtn, titleEl, h("span"), progressBar),
    h("div", { class: "room-body" }, content));

  function cleanup() {
    qDestroys.forEach(fn => { if (fn && fn.destroy) fn.destroy(); });
    qDestroys = [];
    stopAll();
  }

  const questions = task.questions || [];
  const answered = {};

  function checkComplete() {
    if (Object.keys(answered).length >= questions.length) {
      progressBar.firstChild.style.width = "100%";
      try { localStorage.setItem(cKey, JSON.stringify({ date: d, done: true })); } catch (e) { /* empty */ }
      award("room");
      document.documentElement.classList.remove("fullfocus");

      content.replaceChildren(
        h("div", { class: "room-complete" },
          h("h1", null, "Challenge complete!"),
          h("p", { class: "muted" }, "From: " + room.title + " - " + task.title),
          h("div", { class: "room-complete-actions" },
            h("a", { class: "btn primary", href: "#/rooms" }, "Back to rooms"),
            h("a", { class: "btn ghost", href: "#/rooms/quick-practice" }, "Quick Practice"))));
    }
  }

  const taskContent = h("div", { class: "room-task-content" });
  if (task.content) {
    const paragraphs = Array.isArray(task.content) ? task.content : [task.content];
    paragraphs.forEach(p => {
      if (typeof p === "string") taskContent.appendChild(h("p", null, p));
      else if (p.type === "note") taskContent.appendChild(h("div", { class: "room-note" }, p.text));
      else if (p.type === "list") taskContent.appendChild(h("ul", null, p.items.map(li => h("li", null, li))));
    });
  }

  const questionsEl = h("div", { class: "room-questions" });
  questions.forEach((q, qi) => {
    const qr = renderQuestion(q, result => {
      if (result.passed) {
        answered[qi] = true;
        if (result.points > 0) award("room");
        checkComplete();
      }
    });
    qDestroys.push(qr);
    questionsEl.appendChild(h("div", { class: "room-q-wrap" }, qr.el));
  });

  content.replaceChildren(
    h("p", { class: "small muted" }, room.title),
    h("h2", { class: "room-task-title" }, task.title),
    taskContent,
    questionsEl);

  closeBtn.addEventListener("click", () => {
    cleanup();
    document.documentElement.classList.remove("fullfocus");
    location.hash = "#/rooms";
  });

  main.appendChild(el);

  return () => {
    cleanup();
    document.documentElement.classList.remove("fullfocus");
  };
}

export async function render(main, { params, anchor } = {}) {
  const id = params && params[0];
  const action = params && params[1];

  if (!id) {
    return renderCatalog(main);
  }

  if (id === "quick-practice") {
    return quickPractice(main);
  }

  if (id === "daily-challenge") {
    return dailyChallenge(main);
  }

  if (action === "play") {
    return play(main, id);
  }

  return detail(main, id);
}
