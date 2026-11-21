import { h, icon } from "../util.js";
import { startRoom, markTaskDone, saveAnswer, addTime, finishRoom, roomProgress, scheduleRoomReviews } from "./state.js";
import { renderQuestion } from "./questions.js";
import { renderHints } from "./hints.js";
import { award } from "../xp.js";
import { stopAll } from "../core/audio.js";

const FINGERINGS = [
  { note: "Sa",    holes: [0,0,0,0,0,0] },
  { note: "Re",    holes: [1,0,0,0,0,0] },
  { note: "Ga",    holes: [1,1,0,0,0,0] },
  { note: "Ma",    holes: [1,1,1,0,0,0] },
  { note: "Ma(t)", holes: [1,1,1,0.5,0,0] },
  { note: "Pa",    holes: [1,1,1,1,0,0] },
  { note: "Dha",   holes: [1,1,1,1,1,0] },
  { note: "Ni",    holes: [1,1,1,1,1,1] },
];

function buildFingeringOverlay() {
  const rows = FINGERINGS.map(f =>
    h("div", { class: "fing-row" },
      h("span", { class: "fing-note" }, f.note),
      h("span", { class: "fing-holes" },
        ...f.holes.map(v =>
          h("span", { class: "fing-hole " + (v === 0 ? "fing-closed" : v === 1 ? "fing-open" : "fing-half") })))));
  const overlay = h("div", { class: "fing-overlay", hidden: true },
    h("div", { class: "fing-panel" },
      h("div", { class: "fing-header" },
        h("h3", null, "Fingering Reference"),
        h("button", { type: "button", class: "fing-close", "aria-label": "Close" }, icon("x"))),
      h("div", { class: "fing-body" },
        h("div", { class: "fing-legend" },
          h("span", { class: "fing-hole fing-closed" }), " Closed  ",
          h("span", { class: "fing-hole fing-open" }), " Open  ",
          h("span", { class: "fing-hole fing-half" }), " Half"),
        ...rows)));
  overlay.querySelector(".fing-close").addEventListener("click", () => { overlay.hidden = true; });
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.hidden = true; });
  return overlay;
}

export function roomPlayer(room, opts) {
  const o = Object.assign({ onExit: null, onFinished: null }, opts || {});
  const rec = startRoom(room.id);
  let taskIdx = 0, qDestroys = [], hintsDestroy = null, timerInterval = null;

  const sidebar = h("nav", { class: "room-sidebar", "aria-label": "Tasks" });
  const progressBar = h("div", { class: "room-progress" }, h("div", { class: "room-progress-fill" }));
  const fill = progressBar.firstChild;
  const closeBtn = h("button", { type: "button", class: "room-close", "aria-label": "Close room" }, icon("x"));
  const fingerBtn = h("button", { type: "button", class: "room-finger-btn", title: "Fingering chart (F)" }, "Fingering");
  const fingerOverlay = buildFingeringOverlay();
  fingerBtn.addEventListener("click", () => { fingerOverlay.hidden = !fingerOverlay.hidden; });
  const timerEl = h("span", { class: "room-timer small muted" }, "0:00");
  const titleEl = h("h1", { class: "room-title" }, room.title);
  const taskTitle = h("h2", { class: "room-task-title" });
  const taskContent = h("div", { class: "room-task-content" });
  const questionsEl = h("div", { class: "room-questions" });
  const hintsEl = h("div", { class: "room-hints-area" });
  const navRow = h("div", { class: "room-nav" });
  const mainArea = h("div", { class: "room-main" });

  const el = h("div", { class: "room-player" },
    h("header", { class: "room-topbar" }, closeBtn, titleEl, fingerBtn, timerEl, progressBar),
    h("div", { class: "room-body" }, sidebar, mainArea),
    fingerOverlay);

  closeBtn.addEventListener("click", () => {
    stopTimer();
    stopAll();
    document.documentElement.classList.remove("fullfocus");
    if (o.onExit) o.onExit();
  });

  function buildSidebar() {
    sidebar.replaceChildren(
      h("div", { class: "room-sidebar-head" },
        h("span", { class: "eyebrow" }, "TASKS")),
      ...room.tasks.map((t, i) => {
        const done = rec.tasks[t.id];
        const btn = h("button", {
          type: "button",
          class: "room-sidebar-item" + (i === taskIdx ? " active" : "") + (done ? " done" : ""),
          dataset: { idx: String(i) }
        },
          h("span", { class: "room-sidebar-num" }, done ? icon("check") : String(i + 1)),
          h("span", { class: "room-sidebar-label" }, t.title));
        btn.addEventListener("click", () => showTask(i));
        return btn;
      })
    );
  }

  function updateProgress() {
    const p = roomProgress(room.id, room);
    fill.style.width = p.pct + "%";
  }

  function cleanupQuestion() {
    qDestroys.forEach(d => { if (d && d.destroy) d.destroy(); });
    qDestroys = [];
    if (hintsDestroy && hintsDestroy.destroy) hintsDestroy.destroy();
    hintsDestroy = null;
  }

  function showTask(idx) {
    cleanupQuestion();
    stopAll();
    taskIdx = idx;
    const task = room.tasks[taskIdx];
    buildSidebar();
    updateProgress();

    taskTitle.textContent = task.title;
    taskContent.replaceChildren();
    questionsEl.replaceChildren();
    hintsEl.replaceChildren();
    navRow.replaceChildren();

    if (task.content) {
      const paragraphs = (Array.isArray(task.content) ? task.content : [task.content]);
      paragraphs.forEach(p => {
        if (typeof p === "string") taskContent.appendChild(h("p", null, p));
        else if (p.type === "note") taskContent.appendChild(h("div", { class: "room-note" }, p.text));
        else if (p.type === "list") taskContent.appendChild(h("ul", null, p.items.map(li => h("li", null, li))));
        else if (p.type === "image") taskContent.appendChild(h("img", { src: p.src, alt: p.alt || "", class: "room-img" }));
      });
    }

    const questions = task.questions || [];
    const answered = {};
    let allDone = !questions.length;

    questions.forEach((q, qi) => {
      const qKey = task.id + "." + (q.id || qi);
      const prev = rec.answers[qKey];
      if (prev && prev.passed) {
        answered[qi] = true;
      }
      const qr = renderQuestion(q, result => {
        saveAnswer(room.id, qKey, result);
        if (result.passed) {
          answered[qi] = true;
          if (result.points > 0) award("room");
          checkAllDone();
        }
      });
      qDestroys.push(qr);

      const wrap = h("div", { class: "room-q-wrap" + (prev && prev.passed ? " room-q-locked" : "") },
        qr.el);
      questionsEl.appendChild(wrap);

      if (prev && prev.passed) {
        const lock = h("div", { class: "room-q-done-overlay" },
          h("span", { class: "room-q-done-badge" }, icon("check"), " Answered"));
        wrap.appendChild(lock);
      }
    });

    if (task.hints && task.hints.length) {
      const hr = renderHints(task.hints, room.id);
      hintsDestroy = hr;
      hintsEl.appendChild(hr.el);
    }

    function checkAllDone() {
      allDone = questions.length === 0 || Object.keys(answered).length >= questions.length;
      if (allDone && !rec.tasks[task.id]) {
        markTaskDone(room.id, task.id);
        buildSidebar();
        updateProgress();
      }
      updateNav();
    }

    function updateNav() {
      navRow.replaceChildren();
      if (taskIdx > 0) {
        const back = h("button", { type: "button", class: "btn ghost" }, "Previous task");
        back.addEventListener("click", () => showTask(taskIdx - 1));
        navRow.appendChild(back);
      } else {
        navRow.appendChild(h("span"));
      }

      if (taskIdx < room.tasks.length - 1) {
        const next = h("button", { type: "button", class: "btn primary" + (allDone ? "" : " disabled"), disabled: !allDone }, "Next task");
        next.addEventListener("click", () => { if (allDone) showTask(taskIdx + 1); });
        navRow.appendChild(next);
      } else {
        const finish = h("button", { type: "button", class: "btn primary" + (allDone ? "" : " disabled"), disabled: !allDone }, "Complete room");
        finish.addEventListener("click", () => { if (allDone) completeRoom(); });
        navRow.appendChild(finish);
      }
    }

    checkAllDone();

    mainArea.replaceChildren(taskTitle, taskContent, questionsEl, hintsEl, navRow);
    mainArea.scrollTo(0, 0);
  }

  function completeRoom() {
    stopTimer();
    stopAll();
    const maxScore = room.tasks.reduce((sum, t) => sum + (t.questions || []).reduce((s, q) => s + (q.points || 10), 0), 0);
    const finalRec = finishRoom(room.id, maxScore);
    award("room_complete");
    scheduleRoomReviews(room);

    const pct = maxScore ? Math.round((finalRec.score / maxScore) * 100) : 100;
    const stars = pct >= 90 ? 3 : pct >= 70 ? 2 : 1;
    const mins = Math.round(finalRec.timeS / 60);
    const pb = finalRec._pb || {};

    const wrongItems = [];
    for (const task of room.tasks) {
      for (const q of (task.questions || [])) {
        const qKey = task.id + "." + (q.id || (task.questions || []).indexOf(q));
        const ans = finalRec.answers[qKey];
        if (ans && !ans.passed) wrongItems.push({ task: task.title, prompt: q.prompt || q.type });
      }
    }

    const screen = h("div", { class: "room-complete" },
      h("div", { class: "room-complete-stars" }, Array.from({ length: 3 }, (_, i) =>
        h("span", { class: "room-star" + (i < stars ? " lit" : "") }, icon("star")))),
      h("h1", null, "Room complete!"),
      h("p", { class: "room-complete-title" }, room.title),
      (pb.score || pb.time) ? h("div", { class: "room-pb" },
        icon("star"), " New personal best!",
        pb.score ? " Score: " + finalRec.score + "/" + maxScore : "",
        pb.time ? " Time: " + formatTime(finalRec.timeS) : "") : null,
      h("div", { class: "room-complete-stats" },
        h("div", { class: "room-stat" }, h("b", null, finalRec.score), h("span", null, " / " + maxScore + " points")),
        h("div", { class: "room-stat" }, h("b", null, String(mins || "<1")), h("span", null, " minutes")),
        h("div", { class: "room-stat" }, h("b", null, String(finalRec.hintsUsed)), h("span", null, " hints used"))),
      wrongItems.length ? h("div", { class: "room-recap" },
        h("h2", null, "Review these"),
        h("p", { class: "small muted" }, "Questions you missed - they will come back as spaced reviews."),
        h("ul", { class: "room-recap-list" }, wrongItems.map(w =>
          h("li", null,
            h("span", { class: "room-recap-task" }, w.task),
            h("span", { class: "small muted" }, w.prompt))))) : null,
      h("div", { class: "room-complete-actions" },
        h("button", { type: "button", class: "btn primary", onclick: () => {
          document.documentElement.classList.remove("fullfocus");
          if (o.onFinished) o.onFinished(finalRec);
          else location.hash = "#/rooms";
        } }, "Continue"),
        h("button", { type: "button", class: "btn ghost", onclick: () => {
          showTask(0);
        } }, "Review tasks")));

    document.documentElement.classList.remove("fullfocus");
    mainArea.replaceChildren(screen);
    sidebar.querySelectorAll(".room-sidebar-item").forEach(b => b.classList.remove("active"));
  }

  let displaySeconds = rec.timeS || 0;
  function formatTime(s) {
    const m = Math.floor(s / 60), sec = s % 60;
    return m + ":" + String(sec).padStart(2, "0");
  }

  function startTimer() {
    let last = Date.now();
    timerEl.textContent = formatTime(displaySeconds);
    timerInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.round((now - last) / 1000);
      if (elapsed > 0) {
        addTime(room.id, elapsed);
        displaySeconds += elapsed;
        timerEl.textContent = formatTime(displaySeconds);
        last = now;
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function onKeydown(e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "ArrowLeft" && taskIdx > 0) { showTask(taskIdx - 1); e.preventDefault(); }
    else if (e.key === "ArrowRight" || e.key === "Enter") {
      const nextBtn = navRow.querySelector(".btn.primary:not(.disabled)");
      if (nextBtn) { nextBtn.click(); e.preventDefault(); }
    }
    else if (e.key === "f" || e.key === "F") { fingerOverlay.hidden = !fingerOverlay.hidden; e.preventDefault(); }
    else if (e.key >= "1" && e.key <= "9") {
      const opts = questionsEl.querySelectorAll(".room-option:not(.room-picked)");
      const idx = Number(e.key) - 1;
      if (idx < opts.length) { opts[idx].click(); e.preventDefault(); }
    }
  }

  document.addEventListener("keydown", onKeydown);
  document.documentElement.classList.add("fullfocus");
  startTimer();
  const resumeIdx = room.tasks.findIndex(t => !rec.tasks[t.id]);
  showTask(resumeIdx >= 0 ? resumeIdx : 0);

  return {
    el,
    destroy() {
      document.removeEventListener("keydown", onKeydown);
      stopTimer();
      cleanupQuestion();
      stopAll();
      document.documentElement.classList.remove("fullfocus");
    },
  };
}
