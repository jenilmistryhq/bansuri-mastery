// Course (#/course): TryHackMe-style path > module > rooms hierarchy.
import { h, icon } from "../util.js";
import { loadRoomIndex, loadPaths } from "../rooms/loader.js";
import { allRoomRecords } from "../rooms/state.js";

const DIFF_LABEL = { beginner: "Beginner", easy: "Easy", medium: "Medium", hard: "Hard" };
const DIFF_CLASS = { beginner: "good", easy: "info", medium: "warn", hard: "bad" };

export async function render(main) {
  const page = h("div", { class: "page coursepage" });
  const pathsHost = h("div", { class: "thm-paths" });
  Promise.all([loadPaths(), loadRoomIndex()]).then(([paths, index]) => {
    if (!paths.length || !index.length) return;
    const records = allRoomRecords();
    const indexMap = {};
    index.forEach(r => { indexMap[r.id] = r; });

    const totalRooms = index.length;
    const completedCount = index.filter(r => { const rec = records[r.id]; return rec && rec.done; }).length;

    page.prepend(h("section", { class: "thm-hero" },
      h("div", null,
        h("h1", null, "Learning Paths"),
        h("p", { class: "muted" }, "Follow a structured path from your first note to your first raga. Each path contains modules, and each module contains interactive rooms.")),
      h("div", { class: "thm-hero-stats" },
        h("div", { class: "thm-hero-stat" }, h("b", null, String(completedCount)), h("span", null, " of " + totalRooms + " rooms")),
        h("a", { class: "btn", href: "#/rooms" }, "All rooms"))));

    for (const path of paths) {
      const pathRoomIds = path.modules.flatMap(m => m.rooms);
      const pathDone = pathRoomIds.filter(id => { const rec = records[id]; return rec && rec.done; }).length;
      const pathPct = pathRoomIds.length ? Math.round(pathDone / pathRoomIds.length * 100) : 0;

      const modulesEl = h("div", { class: "thm-modules" });

      for (const mod of path.modules) {
        const modRooms = mod.rooms.map(id => indexMap[id]).filter(Boolean);
        const modDone = modRooms.filter(r => { const rec = records[r.id]; return rec && rec.done; }).length;
        const allDone = modDone === modRooms.length && modRooms.length > 0;

        const roomItems = modRooms.map(r => {
          const rec = records[r.id];
          const done = rec && rec.done;
          const inProgress = rec && !rec.done && Object.keys(rec.tasks || {}).length > 0;
          const statusClass = done ? "thm-done" : inProgress ? "thm-progress" : "thm-todo";
          return h("a", { class: "thm-room-item " + statusClass, href: "#/rooms/" + r.id },
            h("span", { class: "thm-room-icon" },
              done ? icon("check") : inProgress ? h("span", { class: "thm-spinner" }) : h("span", { class: "thm-circle" })),
            h("span", { class: "thm-room-body" },
              h("span", { class: "thm-room-title" }, r.title),
              h("span", { class: "small muted" }, r.description)),
            h("span", { class: "chip " + (DIFF_CLASS[r.difficulty] || "mutedc") + " thm-diff" }, DIFF_LABEL[r.difficulty] || r.difficulty));
        });

        const details = h("details", { class: "thm-module" + (allDone ? " thm-module-done" : "") },
          h("summary", { class: "thm-module-head" },
            h("span", { class: "thm-module-status" },
              allDone ? icon("check") : h("span", null, modDone + "/" + modRooms.length)),
            h("span", { class: "thm-module-info" },
              h("b", null, mod.title),
              h("span", { class: "small muted" }, mod.description)),
            h("span", { class: "thm-chev" }, ">")),
          h("div", { class: "thm-room-list" }, ...roomItems));

        if (!allDone && modDone > 0) details.open = true;
        if (!allDone && modDone === 0) {
          const prevMod = path.modules[path.modules.indexOf(mod) - 1];
          if (!prevMod) details.open = true;
          else {
            const prevDone = prevMod.rooms.every(id => { const rec = records[id]; return rec && rec.done; });
            if (prevDone) details.open = true;
          }
        }

        modulesEl.append(details);
      }

      pathsHost.append(h("section", { class: "thm-path" },
        h("div", { class: "thm-path-head" },
          h("div", { class: "thm-path-info" },
            h("h2", null, path.title),
            h("p", { class: "small" }, path.description)),
          h("div", { class: "thm-path-progress" },
            h("span", { class: "small muted" }, pathDone + " of " + pathRoomIds.length + " rooms"),
            h("div", { class: "progressbar" }, h("i", { style: { width: pathPct + "%" } })))),
        modulesEl));
    }
  }).catch(() => {});
  page.append(pathsHost);
  page.append(h("section", { class: "card course-resources" },
    h("div", null, h("h2", null, "Keep learning your way"), h("p", { class: "small muted" }, "Review your progress or explore more rooms.")),
    h("div", { class: "row course-resource-links" },
      h("a", { class: "btn", href: "#/rooms" }, "Browse all rooms"),
      h("a", { class: "btn", href: "#/me" }, "Your progress"))));
  main.append(page);
}
