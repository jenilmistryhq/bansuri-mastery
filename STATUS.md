# Status (2026-10-31)

- App version `6795a5ee6b1d`; last commit: 8ecfe50 Launch safety, plain lessons, full Hindi lessons, teacher tools and test isolation
- Course: 701 days, 11 milestones, 38 lessons
- Hindi interface: 1887 of 1914 strings translated
- Hindi lessons: 38 of 38 lessons, 382 sections
- Voice clips: English 13.2 MB, Hindi 27.2 MB; whole app 91.9 MB
- Claims for a teacher to review: 63 (TEACHER-REVIEW-CLAIMS.md)
- Launch checklist: 0 done, 12 open (LAUNCH.md)

## Still open before launch

- A full Day 1 session on a real iPhone (Safari, then added to the home screen): sound, microphone, recording, the countdown, the games.
- The same on an Android phone in Chrome, installed: the reminder notification arrives after the chosen time on a day without practice.
- A screen reader pass: VoiceOver (iPhone) and TalkBack (Android) through Today, a session and a game (TESTING.md has the details).
- Two or three players run Settings > Help > "Calibrate with your flute" and send their files; set the thresholds from them.
- Try Practice > Transcribe on 5-10 real recordings (solo bansuri, a single voice, a film song) and write down how many notes were right; adjust the claims on the page if they are too hopeful.
- Listen to the voice in English and Hindi (Settings > Voice and language > Hear the voice) and a hands-free session.
- A native Hindi speaker reviews `hindi-review.csv` (`python scripts/hindi_review.py`), and the corrections are applied with `--apply` (then `python scripts/build_voice.py`).
- A bansuri teacher reviews `TEACHER-REVIEW-CLAIMS.md` (63 claims marked Uncertain or Disputed) and the lessons are corrected.
- A teacher records the eight sounds of the reference kit (Journal > Reference kit) on a good flute; export them as a backup so they can be bundled later.
- Push the repository to GitHub (account jenilmistryhq) and turn on GitHub Pages (Settings > Pages > GitHub Actions).
- Optional: a custom domain (docs-custom-domain.md), so the app's storage is not shared with other projects on the same github.io address.
- Open the published app on a phone, add it to the home screen, and practise one day with it.

Checks: run `npm test`, `node tests/webkit.mjs`, `python scripts/validate.py` and the other checks in TESTING.md.
