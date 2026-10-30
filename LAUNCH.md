# Before launch

What only people can do. Tick each item when done; `python scripts/status.py` counts what is left.

## Real devices
- [ ] A full Day 1 session on a real iPhone (Safari, then added to the home screen): sound, microphone, recording, the countdown, the games.
- [ ] The same on an Android phone in Chrome, installed: the reminder notification arrives after the chosen time on a day without practice.
- [ ] A screen reader pass: VoiceOver (iPhone) and TalkBack (Android) through Today, a session and a game (TESTING.md has the details).

## The flute and the voice
- [ ] Two or three players run Settings > Help > "Calibrate with your flute" and send their files; set the thresholds from them.
- [ ] Listen to the voice in English and Hindi (Settings > Voice and language > Hear the voice) and a hands-free session.

## Content
- [ ] A native Hindi speaker reviews `hindi-review.csv` (`python scripts/hindi_review.py`), and the corrections are applied with `--apply` (then `python scripts/build_voice.py`).
- [ ] A bansuri teacher reviews `TEACHER-REVIEW-CLAIMS.md` (63 claims marked Uncertain or Disputed) and the lessons are corrected.
- [ ] A teacher records the eight sounds of the reference kit (Journal > Reference kit) on a good flute; export them as a backup so they can be bundled later.

## Publishing
- [ ] Push the repository to GitHub (account jenilmistryhq) and turn on GitHub Pages (Settings > Pages > GitHub Actions).
- [ ] Optional: a custom domain (docs-custom-domain.md), so the app's storage is not shared with other projects on the same github.io address.
- [ ] Open the published app on a phone, add it to the home screen, and practise one day with it.
