// Privacy (#/privacy): what the app keeps, where, and what (rarely) leaves the device.
import { h } from "../util.js";

export async function render(main) {
  const item = (title, ...text) => h("section", { class: "card" }, h("h2", null, title), ...text.map(t => h("p", null, t)));
  main.append(h("div", { class: "page" },
    h("section", { class: "hero" }, h("h1", null, "Privacy"), h("p", { class: "muted" }, "Short version: everything stays on your device. There are no accounts, no tracking and no ads.")),
    item("What is kept, and where", "Your progress, practice log, settings and recordings are stored in this browser on this device (localStorage and IndexedDB). They are never uploaded.",
      "Backups, transfer links and share links are made by you, and go only where you send them."),
    item("The microphone and camera", "The microphone is used only while an exercise, game, tuner or recording is running, after a countdown you can see. It measures pitch in the browser; sound is recorded only when you press Record, and stays on this device.",
      "The camera is used only for the posture check and video self-check you start."),
    item("What leaves the device", "Nothing, unless you choose it: the lesson reading voice downloads a voice model from Hugging Face the first time you ask for it (your text is turned into speech on your device, never sent). The site itself is served by GitHub Pages, which keeps its usual server logs.",
      "No analytics, no cookies for tracking, no third-party scripts."),
    item("Deleting your data", "Settings > Your data > Start over deletes everything stored by the app on this device. Clearing the browser's site data does the same."),
    item("Safety of your progress", "Because nothing is stored on a server, a lost phone or a cleared browser means lost progress. Make a backup now and then (Settings > Your data), and on iPhone add the app to your home screen: Safari can delete a website's data after about a week without a visit.")));
}
