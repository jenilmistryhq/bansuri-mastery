// Daily practice reminder as a notification. Browsers cannot schedule a notification for an exact
// time, but an installed app (Chrome on Android, desktop Chrome) can be woken now and then by the
// browser (periodic background sync). Each time, the service worker checks: is it past the reminder
// time, and has the learner not practised today? Then it shows one reminder for the day.
// The worker cannot read localStorage, so the reminder time and the last practice day are kept in
// IndexedDB ("bansuri-meta"), which both can read.
export const META_DB = "bansuri-meta";

function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(META_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function metaSet(key, value) {
  const d = await db();
  await new Promise((res, rej) => { const t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(value, key); t.oncomplete = res; t.onerror = () => rej(t.error); });
  d.close();
}

export const remindersSupported = () => typeof Notification !== "undefined" && "serviceWorker" in navigator && "periodicSync" in (window.ServiceWorkerRegistration ? ServiceWorkerRegistration.prototype : {});

// Turns the notification reminder on at "HH:MM". Resolves with a short message for the learner.
export async function enableReminder(time) {
  if (typeof Notification === "undefined") return "This browser cannot show notifications. Use the calendar reminder below.";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "Notifications are blocked for this site. Allow them in the browser's site settings, or use the calendar reminder.";
  await metaSet("reminder", { time, on: true });
  const reg = await navigator.serviceWorker.ready;
  if (!reg.periodicSync) return "Saved, but this browser cannot wake the app in the background. Install the app (Chrome on Android) or use the calendar reminder.";
  try {
    await reg.periodicSync.register("practice-reminder", { minInterval: 60 * 60 * 1000 });
    return "Reminder on: after " + time + ", if you have not practised that day, you get one notification.";
  } catch (e) {
    return "Saved. The browser lets an installed app check in the background; install the app (Add to home screen) for the reminder to work.";
  }
}

export async function disableReminder() {
  await metaSet("reminder", { on: false });
  try { const reg = await navigator.serviceWorker.ready; if (reg.periodicSync) await reg.periodicSync.unregister("practice-reminder"); } catch (e) { /* not registered */ }
}

// Called whenever practice is logged, so the worker knows not to remind.
export function notePractice(date) { metaSet("lastPractice", date).catch(() => {}); }
