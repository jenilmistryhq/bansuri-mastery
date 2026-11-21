import { h, icon } from "../util.js";

// The interactive lesson remains the source of truth; this outline lets learners preview its
// tasks and see which chapters they have completed before entering the player.
export function taskList(lesson, record) {
  let first = 0;
  const active = record && !record.done ? Number(record.at) || 0 : -1;
  let opened = false;
  return h("div", { class: "lesson-tasklist" }, lesson.chapters.map((chapter, i) => {
    const start = first, end = start + chapter.steps.length;
    first = end;
    const done = !!record && (record.done && !(record.at > 0) ? true : (record.at || 0) >= end);
    const current = !done && active >= start && active < end;
    const isOpen = !opened && (current || active === -1 && !done);
    if (isOpen) opened = true;
    const items = chapter.steps.map(step => {
      const title = typeof step.title === "string" ? step.title : "Interactive activity";
      const intro = typeof step.intro === "string" ? step.intro : "";
      return h("li", null, h("b", null, title), intro ? h("span", { class: "small muted" }, intro) : null);
    });
    return h("details", { class: "lesson-task", open: isOpen },
      h("summary", null,
        h("span", { class: "lesson-task-label" }, "Task " + (i + 1)),
        h("span", { class: "lesson-task-title" }, chapter.title),
        h("span", { class: "lesson-task-state " + (done ? "done" : current ? "current" : ""), "aria-label": done ? "Complete" : current ? "In progress" : "Not started" }, done ? icon("check") : current ? "In progress" : ""),
        h("span", { class: "lesson-task-chevron", "aria-hidden": "true" }, "⌄")),
      h("div", { class: "lesson-task-content" },
        chapter.description ? h("p", { class: "small muted lesson-task-purpose" }, chapter.description) : null,
        h("ol", null, items),
        current ? h("p", { class: "small muted" }, "You are partway through this task. Continue the lesson to pick up where you left off.") : null));
  }));
}

