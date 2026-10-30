# Testing

## Automated (runs in CI on every push)

```
npm ci
npm test        # unit tests, plan test, headless-browser smoke test
SITE_ROOT=_site node tests/smoke.mjs   # the same smoke test against the assembled site (CI does this)
```

The smoke test drives the app in headless Chrome or Edge with a **fake microphone**
(`--use-fake-device-for-media-stream`), so it covers recording, saving, pitch analysis and the live
tuner without a real device. It also covers:

- every route;
- the lesson reader: tables, answer keys, link rewriting and anchors;
- milestone checklists and gating;
- Day 0 and Day 1 progression;
- damaged saved progress;
- share cards;
- the offline coach;
- the tala metronome with the tabla theka, the problem report and the CSV export;
- the listening exercises, with a synthetic microphone (an oscillator the test tunes to any note): the long-tone meter (a wrong note must not pass), play it back, play-along marking right and wrong notes, and a milestone item passed by microphone;
- sessions one step at a time (a met goal ticks the step), lesson cards with flashcards, and play buttons on notation;
- the microphone explainer, find my flute (an E5 tone is recognised and saved), "Your playing" on Progress, the song library and the raga tools;
- phone layouts with iPhone 13 emulation.

What automation cannot check: real phone browsers (iOS Safari uses WebKit, not Chromium), a real
microphone, camera and flute, and how the audio sounds. Use the checklist below before a release
and after any change to audio or recording.

## Manual checklist on real devices

Use one iPhone (Safari) and one Android phone (Chrome). Open the live site, not a local file.

### Install and offline
- [ ] Add to Home Screen (iOS: Share > Add to Home Screen; Android: menu > Install app). It opens full screen.
- [ ] Turn on airplane mode, open the app: Today, a lesson and the Bench still work.
- [ ] After a new deploy, the "A new version is ready" banner appears; "Update now" reloads cleanly.

### Sound
- [ ] Bench: tap holes and hold "blow". The note sounds while you hold and stops when you let go.
- [ ] Play notation: the Mary preset plays in time, and the flute fingering follows the notes.
- [ ] Tanpura starts, keeps playing while you scroll, and stops.
- [ ] Tala metronome, Tabla theka: Teentaal sounds like a tabla (dha dhin dhin dha), sam is clearly the strongest, and the dayan sits near Sa. "Clicks" still works.
- [ ] Today (Phase 1) > "Hear a real bansuri": both clips play (Safari uses the .m4a copies, other browsers the Ogg files).
- [ ] With the phone's silent switch on (iPhone), note whether sound still plays. Write the result down: iOS may mute web audio.

### Sessions
- [ ] Start a block timer, lock the phone for 2 minutes, unlock: the timer has advanced by about 2 minutes.
- [ ] Let a block run to zero with the screen on: the chime plays.
- [ ] While a timer runs, the screen does not dim (wake lock), on browsers that support it.
- [ ] Finish the session: the pass-check dialog works; "Yes" unlocks the next day.

### Microphone and recording
- [ ] Journal > Record: the first press asks for microphone permission; recording starts.
- [ ] Play Sa for 3 seconds, Stop: the recording saves and plays back.
- [ ] Analyse pitch: your Sa appears as `S` with a cents value (a C5 flute should read close to 0).
- [ ] Bench > Check my flute > Start microphone: the tuner follows your notes.
- [ ] Deny microphone permission once: the app explains and nothing breaks.
- [ ] "Send to a teacher": the share sheet offers the audio file (or it downloads and the summary is copied).

### Listening with a real flute (the most important manual check)
- [ ] Bench > Long tones, target Sa: play Sa. The note shows as `S`, the ring fills, the needle moves when you blow harder or softer.
- [ ] With the drone on, the meter still follows your flute (it must not lock onto the drone).
- [ ] Bench > Play it back, "S R G": the phrase plays; playing it back is marked correct; a wrong note is marked red.
- [ ] Bench > Play along, "I play, the mic checks", Mary at 60 BPM: notes you play right turn green.
- [ ] Session, a long-tone step: the meter appears; Done, next step moves on and starts the next timer.
- [ ] Milestone M1 (or any unlocked milestone): "Check with mic" on "Long tone Sa" ticks the item when you pass.
- [ ] Settings > Detect from my flute: play your Sa for 3 s; it names your flute's key correctly.
- [ ] Bench > Tala & drone > Tap the beat > Calibrate, then a normal run: results are near "on the beat" when you tap well.
- [ ] Play a tongued `G G G` in Play back or a milestone phrase: each repeat is counted.
- [ ] Settings > Microphone check: run it, copy the report, and send it along with any problem.
- [ ] Note the phone, room and distance from the phone when anything misreads.

### Camera
- [ ] Journal > Video self-check > Record: the camera permission prompt appears, the preview is mirrored like a mirror.
- [ ] Stop: the saved video plays back (not mirrored) with sound, and appears in the recordings list.
- [ ] Deny camera permission once: the app explains and nothing breaks.

### Coach
- [ ] Coach: pick "Low notes (.N .D .P) will not sound or crack". Causes, quick checks and fixes appear, and the guide link opens.

### Data
- [ ] Settings > Download backup (with recordings, including a video), Reset, then Restore: progress, recordings and videos come back.
- [ ] Settings > Export CSV: the file opens in Excel or Google Sheets with the log and milestones.
- [ ] Settings > Problem report > Copy: the text pastes with app version and browser.
- [ ] Settings > Daily practice reminder: the .ics file adds a daily event with an alert to the phone calendar.

Record results (device, OS version, browser, pass/fail, notes) in the pull request or an issue.
