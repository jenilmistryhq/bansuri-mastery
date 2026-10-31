# Testing

## Automated (runs in CI on every push)

```
npm ci
npx eslint .    # lint (CI runs it first)
# The browser tests refuse downloads (exports are checked in memory), so nothing lands in Downloads.
npm test        # unit tests, plan test, transcription accuracy test, headless-browser smoke test
node tests/transcribe-real.mjs [--verbose]   # notation from real bansuri recordings (app/audio), scored (CI runs it)
SITE_ROOT=_site node tests/smoke.mjs   # the same smoke test against the assembled site (CI does this)
node tests/webkit.mjs   # Safari's engine (WebKit), iPhone 13 size (CI does this; first: npx playwright-core install webkit)
node tests/visual.mjs   # local only: screenshots compared with tests/visual/ baselines (--update after an intended change)
```

The smoke test drives the app in headless Chrome or Edge with a **fake microphone**
(`--use-fake-device-for-media-stream`), so it covers recording, saving, pitch analysis and the live
tuner without a real device. Each section runs on its own (`section(name, fn)`): a failure is
reported as `FAIL <section>: <error>` and the next section still runs, so one broken screen does
not hide the rest. It also covers:

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
- updates and offline: a stale, incompatible module in the cache is never mixed in while online, and the app loads from the cache when offline;
- the games with the synthetic microphone: a held note pops a balloon and offers a challenge link that opens the same game; steer by pitch runs a round; the jam points out a note outside the raga and turns the tanpura off when stopped; falling notes scores a right note and misses a wrong one; quests are tracked; make a melody turns tapped cells into notation; 5-minute practice logs at least 5 minutes; no microphone is left open;
- voice and access: a natural-voice clip plays with a caption; "Talk to me" names a wrong note; notes shown as fingering pictures; Listen plays a song on the animated flute; the beat flash; Simple mode's big buttons and a hands-free session (the step is spoken, the meter starts itself, and playing Sa moves on); Hindi tabs and Hindi session steps;
- an accessibility scan (axe-core, WCAG 2.1 A and AA) of the main screens: no serious or critical problems;
- notation from a recording: a generated WAV of S R G R S comes back as sargam with Sa = C, and as .n S R S .n on a D flute;
- the Privacy page, My students (a pasted teacher link appears in the table), course codes hidden in lessons, and the Journal's reference kit;
- phone layouts with iPhone 13 emulation.

CI also runs `scripts/size_budget.py` (one file under 25 MB, voice clips under 60 MB, the site
under 150 MB). `python scripts/status.py` writes STATUS.md, and LAUNCH.md lists the checks that
need people.

What automation cannot check: real phone browsers (iOS Safari uses WebKit, not Chromium), a real
microphone, camera and flute, and how the audio sounds. Use the checklist below before a release
and after any change to audio or recording.

## Manual checklist on real devices

Use one iPhone (Safari) and one Android phone (Chrome). Open the live site, not a local file.

### Install and offline
- [ ] Add to Home Screen (iOS: Share > Add to Home Screen; Android: menu > Install app). It opens full screen.
- [ ] Turn on airplane mode, open the app: Today, a lesson and the Bench still work.
- [ ] After a new deploy, keep a page open: it switches to the new version at the next screen change (not during a session), with no "Something went wrong".

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

### Notation from a recording (Practice > Transcribe)
- [ ] Desktop Chrome: open a solo bansuri video on YouTube in another tab, "Listen to a browser tab", share it with "Share tab audio", play 20-30 s, Stop. Sa and most notes should be right; note what is wrong.
- [ ] The same with a film song (voice plus band): expect many wrong notes; the page should say why.
- [ ] Phone: play a recording near the microphone, Stop: notation appears.
- [ ] Change the flute and the key mode: the notation changes as expected; "Play along" plays it.

### Listening with a real flute (the most important manual check)
- [ ] Bench > Long tones, target Sa: play Sa. The note shows as `S`, the ring fills, the needle moves when you blow harder or softer.
- [ ] With the drone on, the meter still follows your flute (it must not lock onto the drone).
- [ ] Bench > Play it back, "S R G": the phrase plays; playing it back is marked correct; a wrong note is marked red.
- [ ] Bench > Play along, "I play, the mic checks", Mary at 60 BPM: notes you play right turn green.
- [ ] Session, a long-tone step: the meter appears; Done, next step moves on and starts the next timer.
- [ ] Milestone M1 (or any unlocked milestone): "Check with mic" on "Long tone Sa" ticks the item when you pass.
- [ ] Settings > Detect from my flute: play your Sa for 3 s; it names your flute's key correctly.
- [ ] Bench > Tala & drone > Tap the beat: the first Start calibrates (8 clicks), then plays a round; the lights flash with the click you hear; tapping well reads "on the beat", also with Bluetooth headphones.
- [ ] Coach > Let the coach listen: play a long Sa; a deliberately airy or flat note is named as such.
- [ ] Play a tongued `G G G` in Play back or a milestone phrase: each repeat is counted.
- [ ] Settings > Microphone check: run it, copy the report, and send it along with any problem.
- [ ] Settings > Already play? > Take the playing test: each item passes when played well; the recommended phase makes sense.
- [ ] A lesson's last card (Practise it now): the exercise starts and listens; a recording marked "Reference for Lxx" in the Journal plays there.
- [ ] Journal > record a long Sa > Analyse pitch: the tone estimate (1-4) matches what you hear; compare with the four tone levels.
- [ ] Journal > Video self-check > Live posture check: raise one shoulder, tilt the head, lift the elbows; each is noticed within a second or two.
- [ ] Play > Balloon and Steer by pitch with a real flute: the balloon grows only while you are in tune; the bird follows your notes without lag that makes the gates unfair.
- [ ] Play > Falling notes on a known song at 60 BPM: notes played on time read Perfect or Good; the stars match how it went.
- [ ] Play > Jam: the tabla and tanpura keep time; a note outside the raga is named with the nearby raga notes.
- [ ] Bench > Long tones: the ring glows brighter for a clear tone than for an airy one; play-along shows the next fingering just before each note.
- [ ] Note the phone, room and distance from the phone when anything misreads.

### Voice, Hindi and access (with a real phone)
- [ ] Settings > Language, voice and access > Hear the voice: it sounds like a natural person, in English and in हिन्दी. Ask a native Hindi speaker to listen to a session and read the Hindi screens (scripts/voice/*.json and app/i18n/hi.json are machine-drafted).
- [ ] Talk to me on, Bench > Long tones: play a wrong note, then stop: the app names it, then plays a slide to the right note. It never talks while you hold a note, and does not hear itself.
- [ ] Simple mode, Start practice: the session talks you through each step; playing Sa moves on after the goal or the time. Try it without looking at the screen.
- [ ] A lesson card's speaker: the first time it asks before downloading (about 90 MB), then reads the card in a natural voice; next time it starts at once, also offline.
- [ ] Keep the voice for offline use, then flight mode: the spoken prompts still play.
- [ ] Screen readers: TalkBack (Android) and VoiceOver (iPhone) read the tabs, buttons, the meter's progress and the game status; the games can be played with Game sounds on and the screen covered.
- [ ] Text size 160%, easy font and high contrast: nothing overlaps or is cut off on a phone.
- [ ] Calibration: two or three players run Settings > Help > Calibrate with your flute and send the files; set the thresholds from them.
- [ ] Hindi: a native speaker reviews hindi-review.csv (python scripts/hindi_review.py) and the corrections are applied with --apply.
- [ ] Reminder notification on an installed Android app: arrives once after the chosen time on a day without practice.
- [ ] Move to another device: the link and the QR code open on a second phone and bring the progress over.
- [ ] Use the app as a new learner on a phone: the first screen has one obvious button; Today, a session and a lesson can be followed without the course codes; the five tabs and the menus at the top of each section make every screen easy to find.
- [ ] Levels: a normal day of practice earns roughly 150-250 XP; Level 2 takes a few days; the level badge, "+XP" and the level-up celebration appear; Progress lists every level in English and Hindi.
- [ ] The countdown (Settings, default 5 s) gives enough time to pick up the flute after tapping Start or Record; 0 turns it off; pressing Start again cancels it.
- [ ] Beat flash and vibrate (Android) follow the metronome and the tabla.

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
