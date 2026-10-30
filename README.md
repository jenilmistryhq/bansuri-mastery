# Bansuri Mastery

A practical, research-based learning system for the Indian bamboo flute (bansuri), taking a
learner from zero musical knowledge toward advanced, independent musicianship.

- **Learn with the app:** https://jenilmistryhq.github.io/bansuri-mastery/ (day-by-day sessions, works offline)
- **Read the whole course:** https://jenilmistryhq.github.io/bansuri-mastery/docs/
- **Or start from the files:** [bansuri-mastery/README.md](bansuri-mastery/README.md), then Day 0 in
  [phases/phase-0-setup.md](bansuri-mastery/phases/phase-0-setup.md).

## The app

A static web app (no server, no account, no framework) that teaches the course one practice day at a time:

- **Today:** the current day's plan, lessons to read, due spaced reviews, your streak.
- **Guided sessions, one step at a time:** each day's blocks (warm-up, tone, technique, music, ear, log) shown one at a time with a timer, the right tool opened automatically, and "Done, next step".
- **It listens to your real flute:** long-tone steps show a live meter (note, cents, a ring that fills while you hold steady); "Play it back" plays a phrase for you to echo and checks each note; play-along marks every note of a melody green or red as you play it; milestone items such as "hold Sa 8 s within 20 cents" can be checked with the microphone.
- **701 practice days** across six phases, generated from the roadmaps. **11 milestone tests** gate progress: the checklist comes from each milestone file, with rubric scoring and the remedies shown when a test is not passed.
- **Practice Bench:** fingering chart, play-along (loop a bar, step the tempo, count-in, bar accents), long tones, play it back, tanpura, tala metronome with a synthesised tabla theka, a tap-the-beat game with silent bars, ear quiz and pitch checker.
- **Songs:** every practice melody with "Play along" (the mic checks each note), marked ready once its notes are taught.
- **Raga tools:** on each raga card, a drone with the right first string and play-back phrases in the raga's notes.
- **Your playing:** best long tones per note, play-back level, play-along and tapping results on Progress, and "Last time" on Today to beat.
- **Find my flute:** play Sa and the app sets your flute's key, octave and tuning (Day 0 and Settings). Settings also has a 15-second microphone check with a copyable report.
- **Lessons as cards:** each lesson opens as short cards (the idea, each step, common mistakes to tap and reveal, the quiz as flashcards, a mastery checklist), with the full text one tap away. Any notation in the course has a play button.
- **Journal:** practice log, recordings kept on the device, pitch analysis, before/after comparison, and a **video self-check** (record yourself with the camera to check posture and embouchure).
- **Progress:** streak calendar, statistics, badges and a shareable progress card (the data travels inside the link).
- **Coach:** an offline problem solver. Pick a symptom ("airy tone", "low notes will not sound") and it shows the likely causes, fixes and drills from the troubleshooting guides.
- **Hear a real bansuri:** public-domain recordings of a real flute on the first weeks' Today screen, so the synthesised sound is not your only model.
- **Send to a teacher:** share a recording and its pitch summary with a human teacher through the phone's share sheet. Save a teacher's (or your best) take as the **reference** for a piece; it plays next to that piece in spaced review.
- **Library and reader:** every course page rendered in the app, with full-text search.
- **Daily reminder** (a repeating calendar event) and a weekly **backup nudge**.
- Installable and offline (service worker). Progress stays in the browser; backups export to a file, and the practice log and milestone results export to **CSV** for a spreadsheet.
- **Problem report:** Settings keeps a short local log of app errors that you can copy into a bug report. Nothing is sent anywhere.

How it is built: [ARCHITECTURE.md](ARCHITECTURE.md).

## What is inside

| Part | Contents |
|---|---|
| App | The day-by-day web app described above |
| Roadmap | Day 0 setup, a day-by-day Phase 1 plan, and week/module plans for Phases 2-5 |
| 38 lessons | From holding the flute to full raga presentation, each with practice, mistakes, tests and mastery criteria |
| Knowledge tree | 184 learning objectives with prerequisites and mastery tests |
| Exercises | Alankars, rhythm, ear training (10 levels), notation, theory, melodies, tone, improvisation, with answer keys |
| Ragas, milestones, troubleshooting | 14 raga cards, 11 milestone tests with remediation, 12 diagnosis guides |
| Libraries | Verified video, website, book and app resources; 65 bansuri recordings across 14 ragas; staged song suggestions |
| Practice Bench | An interactive flute in the browser: fingering chart, notation player, tanpura, tala metronome, ear quiz and pitch checker |

The curriculum is written for a 6-hole C natural medium bansuri (Sa = C5) but works for any
6-hole bansuri, because sargam is relative to Sa. Set your flute's Sa in the app's Settings.

## Repository layout

```
index.html, sw.js        the app shell and its service worker
manifest.webmanifest     makes the app installable
app/                     app styles, fonts, vendored marked, data (plan.json, files.json), JS modules
  js/core/, js/bench/    Practice Bench modules, shared with the standalone bench pages
bansuri-mastery/         the curriculum (Markdown): read by the app, and the docs folder of the /docs/ site
  tools/                 standalone Practice Bench pages (generated from app/js)
mkdocs.yml               reference site configuration (the nav section is generated)
scripts/
  validate.py            checks links, anchors, objective IDs and typography
  gen_nav.py             regenerates the reference site navigation
  build_bench.py         bundles the bench modules into tools/practice-bench.html and interactive-flute.html
  build_plan.py, plan/   generates app/data/plan.json (the day-by-day plan) from the roadmaps
  build_app.py           lists app files for offline use and versions sw.js
  check_links.py         checks every external link in the course (run weekly by CI)
  convert_audio.mjs      makes the AAC (.m4a) copies of the reference recordings for Safari
tests/                   unit tests and a headless-browser smoke test
.github/workflows/       validates, tests, builds and deploys to GitHub Pages; weekly link check
.github/ISSUE_TEMPLATE/  forms for content corrections and reference recordings
TEACHER-REVIEW.md        a review guide for bansuri teachers, and how to contribute recordings
```

## Run it locally

```
python -m http.server 8000      then open http://localhost:8000 (the app)
```

The app fetches its files, so open it through a local server, not by double-clicking `index.html`.

To build and test everything (Python 3.10+, Node 20+, and Chrome or Edge installed):

```
python -m venv .venv
.venv\Scripts\activate          (on macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
npm ci
npm run build                   regenerates bench, plan, app file list and nav
python scripts/validate.py
npm test                        unit tests + headless-browser smoke test
mkdocs serve                    the reference site at http://127.0.0.1:8000
```

**After editing:**

- a course page: run `python scripts/build_app.py`, and `python scripts/build_plan.py` if a
  roadmap, lesson title, milestone or exercise changed;
- adding or renaming a page: also `python scripts/gen_nav.py`;
- the bench (`app/js/core`, `app/js/bench`): `python scripts/build_bench.py`.

CI fails if any generated file is stale, a link or anchor breaks, a test fails, or the reference
site build has a warning. Before a release, also run the real-device checklist in
[TESTING.md](TESTING.md).

To check external links by hand: `python scripts/check_links.py` (a GitHub workflow also runs it
every Monday and fails if a link is broken).

## Writing conventions

- Plain ASCII hyphens, quotes and `...` (no em or en dashes, curly quotes or ellipsis characters).
- Notation and fingering follow [05-CONVENTIONS-AND-NOTATION-KEY.md](bansuri-mastery/05-CONVENTIONS-AND-NOTATION-KEY.md).
- Every lesson, exercise and milestone references its objective IDs from the knowledge tree.
- Claims are labelled Fact, Recommendation, Disputed or Uncertain. Resources record how they were verified.

## Privacy

The app has no server and no analytics. Progress, journal notes and recordings stay in your
browser (localStorage and IndexedDB). The microphone is used only when you press Record or start
the tuner, and the camera only for the video self-check. A share link carries a small progress
summary inside the link itself. Sharing a recording with a teacher uses your phone's own share
sheet; the app never uploads anything.

Every project on `jenilmistryhq.github.io` shares one browser origin, so they could read each
other's storage. A custom domain separates them:
[docs-custom-domain.md](docs-custom-domain.md).

## Limitations

See [07-QUALITY-REPORT.md](bansuri-mastery/07-QUALITY-REPORT.md): text cannot hear or see you,
listed videos were verified to exist but not watched, and some data (song ranges, a few raga
details) is marked uncertain. The app's flute sound is synthesised: it shows pitch and melody,
not what a good bansuri tone sounds like.

## License

- **Curriculum content** (everything in `bansuri-mastery/` except the code inside `tools/`):
  [CC BY-NC-SA 4.0](LICENSE). You may share and adapt it for non-commercial purposes, with credit,
  under the same license.
- **Code** (`index.html`, `sw.js`, `app/js/`, `app/*.css`, `scripts/`, `tests/`, `.github/`, and the
  JavaScript/CSS of the Practice Bench pages): [MIT](LICENSE-CODE).
- **Fonts** in `app/fonts/` (Hind, Rozha One, JetBrains Mono): SIL Open Font License 1.1, licences beside the files.
- **marked** in `app/vendor/`: MIT, licence beside the file.
- **Reference recordings** in `app/audio/`: public domain, by Prithoo on Wikimedia Commons (see `CREDITS.txt`).
- Linked videos, websites, books and recordings belong to their creators; this project only links to them.

Copyright (c) 2026 Jenil Mistry.
