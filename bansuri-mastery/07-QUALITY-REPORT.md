# Quality Report

Validation run on 2026-10-29, when the curriculum was built. Read this once so you know what
the curriculum checks and what it cannot.

## 1. What was checked, and the results

| Check | Method | Result |
|---|---|---|
| Knowledge tree and roadmap cover the same objectives | Script: every one of the 184 objective IDs in `knowledge-tree/` was searched for in lessons, exercises, raga cards, projects and troubleshooting | All 184 are referenced. 181 are in lessons/exercises/projects; BOD-08, PRA-04 and PRA-06 are taught in troubleshooting guides ([TS-08](troubleshooting/TS-08-body-pain-and-tension.md), [README](troubleshooting/README.md), [TS-11](troubleshooting/TS-11-practice-plateaus-and-motivation.md)) and assessed in [M10](projects/M10-independent-musician.md) |
| Every lesson is placed in a roadmap | Script: each of the 38 lesson files is referenced in `phases/` | All 38 placed |
| No undefined IDs | Script: every `XXX-NN` ID used anywhere exists in the knowledge tree | 0 unknown IDs |
| Internal links and section anchors | Script over all 118 Markdown files | 0 broken file links, 0 broken anchors |
| External URLs | Every URL requested over HTTP; YouTube links checked through YouTube's oEmbed service | All resolve, except: a retailer page for *The Raga Guide* was dead (replaced with a catalogue record); parrikar.org, tanarang.com and catalog.hathitrust.org block automated checks (the research agent loaded parrikar.org and tanarang.com normally) |
| Resource titles | YouTube titles and channels from oEmbed; websites fetched and read | Titles in the library are exact. Two titles that were approximate in the first draft were corrected |
| Prerequisites and order | Manual review of the [dependency spine](01-KNOWLEDGE-TREE.md#3-dependency-spine) against lessons and exercise unlock levels | One defect found and fixed: the kan test ORN-03 used `{P}G`, which crosses registers and is too hard at that stage. It now uses same-register kans first |
| Fingering facts | Master chart compared with three written sources (R-W01, R-W02, R-W03) and acoustics | Consistent. One source (Radhe Flutes) uses a conflicting convention and is excluded |
| Melodies | Traditional/public-domain melodies (Mary, Twinkle, Ode to Joy, Jingle Bells, Happy Birthday, Hot Cross Buns) checked note by note; each placed at the correct unlock level | Correct. Rhythms of Ode to Joy and Happy Birthday are simplified and labelled so |
| Raga facts | Raga cards checked against Wikipedia (and SwarGanga where reachable) | 13 of 14 verified for scale/thaat; vadi/samvadi disputes recorded (Durga, Kafi, Bhairavi, Hamsadhwani, Shivranjani); time of Des disputed. **Pahadi is not verified online** |
| Tihai arithmetic | Hand-checked worked examples in [L32](lessons/L32-bandish-taans-layakari-tihai.md) | Correct (start beat = 18 minus total length, in teentaal) |
| Writing style | Script: no em dashes, en dashes, curly quotes or ellipsis characters | 0 found |
| Advanced skills have practical assessments | Every objective of difficulty 4-5 has a mastery test in its domain file, and milestones M7-M10 test them in performance | Yes |
| Duplicate lessons | Manual review | No duplicates. Some intentional overlap: intonation appears in L07 (tools), L17 (control) and L25 (half-holes), each at a different depth |

## 2. Coverage of your goals

See the [goal coverage table](01-KNOWLEDGE-TREE.md#5-coverage-of-your-goals). Every stated goal
maps to objectives, lessons and at least one milestone.

## 3. Known gaps and limitations

### Limits of a text curriculum

1. **No audio of the correct sound.** Lessons describe what you should hear and point to
   videos, but this curriculum contains no recordings of its own. For sound-dependent skills
   (tone, intonation, meend, gamak, raga phrasing) the descriptions **cannot replace
   hearing a teacher**. That is why teacher checkpoints are marked throughout.
2. **No one watches you play.** Embouchure, hand position and tension are checked only
   through your own mirror and video. A teacher check at Weeks 2-3 is the single most
   valuable addition you can make.
3. **Ear-training answer keys rely on you.** No Hindustani sargam ear-training app was
   found. The [self-recorded dictation method](exercises/EX-EAR-ear-training-system.md) works,
   but it depends on you recording accurately and waiting before you transcribe.

### Resource limits

4. **Videos were not watched.** YouTube resources are verified for existence, title and
   channel only. Their teaching quality is **not assessed**. If a video contradicts this
   curriculum (especially on Ma fingering), see the
   [known disagreements](02-RESOURCE-LIBRARY.md#known-disagreements-between-sources).
5. **No free structured course by a top performer was found.** Paid options and teachers are
   listed in the [Resource Library](02-RESOURCE-LIBRARY.md#4-courses-and-teachers-paid-or-structured).
6. **Few verified resources** for: breathing (from an established bansuri teacher), posture
   on a C medium flute, gamak progression, improvisation, composition, accompaniment, and
   bansuri Bhupali recordings. Original lessons fill these, but with no external check.
7. **Android apps:** no verified Android tanpura or tabla app listing was found. The browser
   drone R-A01 works on any device.
8. **App prices and availability change.** Prices were not recorded deliberately.

### Content that needs your verification

9. **Your flute is unique.** Half-hole positions, cross-fingerings and all 3rd-register
   fingerings must be checked with a tuner on your own flute. Lessons L22 and L25 have you
   build and verify your own charts.
10. **Pahadi** raga card: not verified online.
11. **Unverified claims, all labelled Uncertain in the text:** cross-fingering candidates (L25),
    recommendations for a second flute (L26), microphone placement (L35), the "safed/kali" key-name
    mapping (L34), crack-repair judgement (TS-12), tolerance for handmade flute tuning
    (TS-05), lip coverage of the blowing hole (L04).
12. **Pakads and characteristic phrases** use widely taught forms. Teachers and gharanas vary.
13. **Original compositions** (practice melodies, the Bhupali and Yaman compositions, the
    Bhupali gat, the alap phrases) were written for this curriculum. They follow the raga
    rules as described, but no master musician has reviewed them. They are labelled
    "original" wherever they appear.

### Scope limits

14. **Film songs are not notated.** Copyrighted melodies are not written out. Instead you learn
    them by ear with the [song-learning system](lessons/L18-song-learning-system.md), which is
    the skill you asked to develop.
15. **Carnatic music** is covered only as an overview (THY-13). This is a Hindustani-oriented
    curriculum.
16. **Not every musical concept is covered.** Examples not covered in depth: dhrupad-style
    alap conventions, detailed gharana styles, the full 22-shruti theory, the Paluskar notation
    system (awareness only), harmony beyond basics, and studio production. The 184 objectives
    aim for comprehensive coverage of what a bansuri player needs. They do not claim
    completeness.
17. **Timelines are estimates.** Phase durations assume 45-60 minutes a day and are not
    promises.

### Second audit (2026-10-29): found and fixed

| Problem | Fix |
|---|---|
| Phase 1 Days 12, 18 and 24 pointed to alankar sets that use notes not yet taught (mandra Pa arrives on Day 22) | Days now use the EX-ALK S R G warm-ups, a self-written `.N .D` extension, then L12 Versions A/B |
| Day 17 pointed to "EX-MEL Level 2", which includes pieces with `.P` | Now names 2.1 Evening Lamp (uses only `.N .D`) |
| Milestone remediation tables named drills by names the lessons do not use (e.g. "tihai worksheet", "octave drill", "Sa-finding drill") | Now cite the lessons' actual steps and sections |
| L01 promised a "cumulative review week" that the phase files did not schedule | L01 now defines the cumulative review itself |
| No guidance on returning after a break | Added to [L01](lessons/L01-how-to-practise.md) section 4.7 |
| Vocal health missing, though singing is used daily | Added to [L05](lessons/L05-what-is-music-pitch-sa-sargam.md) Step 2 |
| "Recognizing recurring patterns" (requested in the brief) had no drills | Added to [EX-EAR](exercises/EX-EAR-ear-training-system.md) Level 7 |
| Glossary sent "gharana", "lehra" and "guru-shishya" to lessons that did not mention them | Links corrected; guru-shishya added to L01 |
| 11 objectives were taught but not tagged with their IDs | Tags added |

### Still open (would need more research or your input)

18. ~~Thin listening library~~ **Resolved:** [08-LISTENING-LIBRARY.md](08-LISTENING-LIBRARY.md) has 65 YouTube
    recordings (61 across the 14 ragas, each with a short "start here" item) plus general listening.
    Every YouTube link was checked twice through oEmbed. The recordings were **not listened to**.
    Some are re-uploads; Khamaj and Kafi are mostly light-classical forms.
19. ~~No suggested song list~~ **Resolved, with caveats:** [09-SONG-SUGGESTIONS.md](09-SONG-SUGGESTIONS.md)
    stages 37 songs (plus 10 named but not pre-checked) by range and special notes. Ranges come from a self-taught author's
    notation site, and keys from automatic key-detection databases that often disagree. Every
    song carries a confidence label, and the file tells you to check the range by ear first.
20. **File numbering** skips `04-`. This is cosmetic; the README lists every top-level file.

### Third audit (2026-10-29): correctness of answer keys and facts

Checked by hand: all EX-THY answers (intervals, 10 thaats, raga grammar, transposition), the
EX-NOT conversion and staff-reading keys, the L26 key-mapping tables, the core facts on all 14
raga cards, and the three L32 tihai examples. **No errors found.** Fixed:

| Problem | Fix |
|---|---|
| L18, L26 and TRN-01 called `M'` the comfortable top, but the song list and the fit rules use `G'` | All now say: comfortable to `G'` (E6), practical ceiling `M'` (F#6) |
| Glossary lacked thumri, ghazal, arti, deepchandi and mishra | Added |
| Mastery map did not list the listening library or the song suggestions | Added to "Parallel tracks" |
| L32 tihai examples used <code>&#124;</code> for phrase repetitions, which conflicts with its meaning as a vibhag line | Clarifying note added |

Not hand-checked: every individual alankar line in EX-ALK (generated by script and matched to
L12) and the full EX-RHY and EX-EAR answer lists.

### The app (added 2026-10-30)

**Tested:** unit tests for the notation parser, theory helpers and pitch helpers; a plan test that
checks all 701 days (schema, milestone references, note unlock order, cycle bounds); and a
headless-browser smoke test. The smoke test visits every route, renders lessons (tables, answer keys,
link rewriting, GitHub-style anchors), mounts the Practice Bench, completes Day 0 and M0, completes
Day 1, earns a badge, creates and opens a share card, checks phone width for horizontal scrolling,
and fails on any console error. CI runs all of these on every push, against the repository and
against the assembled site.

**Not yet tested:**

- Real phones, iOS Safari in particular (its recording format and audio unlock rules differ).
- Microphone recording and the live tuner. Headless tests cannot grant a microphone.
- Audio quality and timing by ear.
- Long-term use: hundreds of days of progress, large recording libraries, storage limits.

Try these on your own devices before relying on them.

**The day plan is generated.** Phase 1's days are transcribed from its table. Phases 2-5 are
expanded from their module schedules and weekly rotations by `scripts/build_plan.py`. Where a
roadmap left a slot unassigned, the generator fills it with consolidation of material already
taught, never with new content. Every notation it uses is copied from the curriculum files and
checked against the note unlock order. The phase roadmaps stay the authority. If a generated day
reads oddly, the roadmap wins; fix the plan source in `scripts/plan/`.

### Later additions (2026-10-30)

**What was added:**

- An offline coach built on the troubleshooting guides.
- "Send to a teacher" sharing for recordings, and reference recordings per piece.
- A video self-check for posture and embouchure (recorded and kept on the device).
- A synthesised tabla theka for the tala metronome.
- A daily calendar reminder, a weekly backup nudge, CSV export and a local problem report.
- Two public-domain bansuri samples (Ogg and AAC), plus links to openly licensed teaching clips.
- A weekly automatic check of every external link.
- More varied day titles.

**Tested automatically:**

- **Offline coach:** it shows the guide for a chosen symptom.
- **Fake microphone:** recording, saving, analysis and the live tuner.
- **Phone layout:** every main screen at iPhone 13 size, with no horizontal scrolling.

**Not tested:**

- **Real devices:** iOS Safari, real microphones and cameras, and the audio clips on iPhone. See [TESTING.md](https://github.com/jenilmistryhq/bansuri-mastery/blob/main/TESTING.md).
- **The audio by ear.** The tabla is synthesised and only approximates real strokes. The two bundled samples are amateur, low-bitrate recordings in E. Openly licensed bansuri audio is scarce. Professional references remain the linked recordings in the [listening library](08-LISTENING-LIBRARY.md).
- **Review by a bansuri teacher.** See [TEACHER-REVIEW.md](https://github.com/jenilmistryhq/bansuri-mastery/blob/main/TEACHER-REVIEW.md).

## 4. How to keep this curriculum healthy

- When a link dies, search the exact title and creator, then update the library entry.
- When a teacher corrects something in a lesson, write the correction into that lesson
  (mark it "Teacher correction, date") so the system stays accurate for you.
- Re-run your own checks yearly: does the tracker still reflect what you can actually do?
