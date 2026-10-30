"""Day 0 (Phase 0) and Days 1-42 (Phase 1), transcribed from phases/phase-0-setup.md and
phases/phase-1-foundations.md. Each Phase 1 table row becomes one day; block minutes and texts
follow the row. Notation strings are copied from the curriculum files by md.py, never typed here
except where the phase table itself writes the phrase (e.g. `S R G R S`)."""
from .blocks import (EX, L, M, blk, chart, check, drone, ear, item, lesson, play, rd, tala, warmup)
from .md import alankars, melodies, read, warmups

P0 = "phases/phase-0-setup.md"
P1 = "phases/phase-1-foundations.md"
MEL = melodies()
ALK_A = alankars(L(12), "Version A")
ALK_B = alankars(L(12), "Version B")
WU = warmups()


def mel(num, bpm=60):
    """Bench options + read link + review item for an EX-MEL piece."""
    m = MEL[num]
    link = rd(f"EX-MEL {num} {m['title']}", EX["MEL"])
    link["anchor"] = m["anchor"]
    bench = play(m["notation"], bpm) if m["notation"] else None
    return m, link, bench, item(f"EX-MEL-{num}", f"EX-MEL {num} {m['title']}", bench=bench, read=link)


def mel_inline(num, bpm=60):
    """EX-MEL entries written inline (no code block), e.g. 2.2b: join the inline code spans."""
    import re
    m = MEL[num]
    if m["notation"]:
        return mel(num, bpm)
    lines = read(EX["MEL"]).split("\n")
    start = next(i for i, l in enumerate(lines) if l.startswith(f"### {num} "))
    spans = []
    for l in lines[start + 1:]:
        if l.startswith("#"):
            break
        spans += re.findall(r"`([^`]+)`", l)
    spans = [s for s in spans if re.fullmatch(r"[.SrRgGmMPdDnN' ]+", s)]
    notation = " || ".join(spans) + " ||"
    link = rd(f"EX-MEL {num} {m['title']}", EX["MEL"])
    link["anchor"] = m["anchor"]
    bench = play(notation, bpm)
    return m, link, bench, item(f"EX-MEL-{num}", f"EX-MEL {num} {m['title']}", bench=bench, read=link)


def alk(version, n, bpm=60):
    table = ALK_A if version == "A" else ALK_B
    bench = play(table[n], bpm)
    link = lesson(12, "Version " + version, label=f"L12 Version {version}")
    return bench, item(f"L12-{version}-{n}", f"Alankar {n}, Version {version}", bench=bench, read=link)


def R(text="Log today's practice (L01 log template).", record=None, minutes=3):
    return blk("R", minutes, text, read=[lesson(1, "5. Templates", label="L01 practice log")], record=record)


def day(n, title, blocks, lessons, pas=None, kind="practice", week=None, milestone=None, items=None, docsec=None):
    d = {"n": n, "phase": 0 if n == 0 else 1, "week": week if week is not None else (0 if n == 0 else (n - 1) // 7 + 1),
         "kind": kind, "title": title, "lessons": lessons, "blocks": blocks,
         "minutes": sum(b["minutes"] for b in blocks)}
    if pas:
        d["pass"] = pas
    if milestone:
        d["milestone"] = milestone
    if items:
        d["newItems"] = items
    d["doc"] = (P0 if n == 0 else P1) + (("#" + docsec) if docsec else "")
    return d


def build():
    from .md import anchor
    wk = {w: anchor(P1, f"Week {w} ") for w in (1, 2, 3, 4)}
    wk56 = anchor(P1, "Weeks 5-6")
    days = []
    ear1 = rd("EX-EAR Level 1", EX["EAR"], "Level 1:")
    rhy1 = rd("EX-RHY Level 1", EX["RHY"], "Level 1:")
    rhy2 = rd("EX-RHY Level 2", EX["RHY"], "Level 2:")
    ton2 = rd("EX-TON long tones", EX["TON"], "Part 2:")
    listen = rd("Listening library", "08-LISTENING-LIBRARY.md", "How to listen")

    # ---------------- Day 0: setup ----------------
    days.append(day(0, "Day 0: Setup", [
        blk("READ", 30, "A. Your flute: read L00. Learn the parts (INS-01), do the inspection checklist (INS-03), note the maker's care instructions (INS-05), choose and write down your holding side, and set up the care routine (INS-04).",
            read=[lesson(0), rd("Phase 0 checklist", P0, "Checklist")]),
        blk("K", 20, "B. Tools: set the drone (tanpura) to C, and try the tuner, metronome and recorder. The Practice Bench covers drone, tala and tuner.",
            read=[rd("Phase 0: Tools", P0, "B. Tools")], bench=drone(), label="Tools"),
        blk("E", 15, "C. How you will practise: read L01 (daily session structure, the '3 clean in a row' rule). Choose a fixed time and place. Skim the progress tracker and the conventions.",
            read=[lesson(1), rd("Conventions and notation key", "05-CONVENTIONS-AND-NOTATION-KEY.md")], label="Plan your practice"),
        blk("R", 10, "D. Safety: read the dizziness protocol (L03) and the pain warning signs (TS-08). E. Optional: find a teacher for a check around Week 2-3.",
            read=[lesson(3), rd("TS-08 Body pain and tension", "troubleshooting/TS-08-body-pain-and-tension.md")], label="Safety and next steps"),
    ], ["L00", "L01", "L03"], pas="Complete M0 - Setup", kind="setup", milestone="M0", docsec=None))

    # ---------------- Week 1 ----------------
    days.append(day(1, "Body, breath, first sound", [
        blk("READ", 10, "Read L02 (posture and holding) and L03 (breathing).", read=[lesson(2), lesson(3)]),
        warmup(),
        blk("K", 20, "Posture and holding drill 10 min. Then read L04 and make first-sound attempts on the blowing hole only, 10 min max with rests.", read=[lesson(2), lesson(4)]),
        blk("T", 8, "Breathing: low breathing 10 breaths x3, then the hiss test (5 min).", read=[lesson(3)]),
        blk("E", 5, "L05 part 1 (what pitch is); higher/lower game.", read=[lesson(5), ear1]),
        R("Log today's practice."),
    ], ["L01", "L02", "L03", "L04", "L05"], "You can hold the flute in position 60 s with relaxed shoulders", docsec=wk[1]))

    days.append(day(2, "First sound on Sa", [
        warmup(),
        blk("T", 5, "Breathing 5 min.", read=[lesson(3)]),
        blk("K", 12, "First sound on Sa (`XXX OOO`), 3 x 4 min with 1-min rests.", read=[lesson(4)], bench=chart()),
        blk("E", 10, "Hum Sa with the C drone 5 min (L05). Then read L06 and clap with a metronome at 60 BPM for 5 min.", read=[lesson(5), lesson(6)], bench=drone()),
        R(),
    ], ["L04", "L05", "L06"], "Any sound at all on Sa (airy is fine)", docsec=wk[1]))

    days.append(day(3, "Your first recording", [
        warmup(),
        blk("T", 12, "Sa attempts 3 x 4 min; aim for 2-s notes.", read=[lesson(4)]),
        blk("READ", 5, "Read L08: recording and self-assessment.", read=[lesson(8)]),
        blk("E", 15, "L06 durations (1 and 2 beats) clapping 10 min. Sargam recitation S R G m P D N S' up and down 3 times.", read=[lesson(6), rhy1]),
        R("Record your first Sa and log the session.", record="Your first Sa (Day 3)", minutes=5),
    ], ["L04", "L06", "L08"], "Recording exists; you can describe one thing to improve", docsec=wk[1]))

    days.append(day(4, "Long tones and your Sa pitch", [
        warmup(),
        blk("READ", 5, "Read L07: long tones, tuner and drone.", read=[lesson(7)]),
        blk("T", 15, "Long tones on Sa, target 4 s, x10, with the tuner. Confirm your Sa pitch and octave (INS-02): record Sa and use check plan 'Day 0: Sa only'.", read=[lesson(7), lesson(0)], bench=check(0)),
        blk("E", 10, "Hum Sa and R with the drone 5 min. Clap at 60 and 80 BPM 5 min.", read=[lesson(5)], bench=drone()),
        R(),
    ], ["L07", "L00"], "Tuner shows C on your Sa", docsec=wk[1]))

    days.append(day(5, "Finding the clearest sound", [
        warmup(),
        blk("T", 10, "Long tones on Sa, 4-6 s, x10, with the drone.", read=[ton2], bench=drone()),
        blk("K", 5, "Rolling the flute in and out to find the clearest sound.", read=[lesson(4, "Step 4")]),
        blk("E", 10, "EX-EAR Level 1: higher / lower / same and pitch matching.", read=[ear1]),
        R(),
    ], ["L04", "L07"], "Sa sounds 3/5 attempts", docsec=wk[1]))

    days.append(day(6, "Saptak, sargam and listening", [
        warmup(),
        blk("T", 15, "Long tones 15 min (mirror check).", read=[ton2], bench=drone()),
        blk("E", 15, "L05 saptak and sargam singing with the drone 10 min. L06 half-beat clapping 5 min.", read=[lesson(5), rhy2], bench=drone()),
        blk("M", 10, "Listening 10 min: any bansuri recording from the listening library.", read=[listen], label="Listening"),
        R("Record a long tone, score it with the rubric (L08) and log.", record="Long tone on Sa (Day 6)", minutes=5),
    ], ["L05", "L06", "L08"], "Rubric 'Tone' score recorded", docsec=wk[1]))

    days.append(day(7, "Week 1 review", [
        blk("T", 10, "Long tones 10 min.", bench=drone()),
        blk("K", 10, "Re-read the L02 and L04 checklists in the mirror.", read=[lesson(2), lesson(4)]),
        blk("R", 10, "Listen to your Day 3 and Day 6 recordings back to back; write what changed. Weekly log reflection.", read=[lesson(8)]),
    ], ["L02", "L04", "L08"], "Week 1 reflection written", kind="review", docsec=wk[1]))

    # ---------------- Week 2 ----------------
    m11, l11, b11, i11 = mel("1.1")
    m12, l12, b12, i12 = mel("1.2")
    m13, l13, b13, i13 = mel("1.3")
    days.append(day(8, "Re", [
        warmup(),
        blk("T", 12, "Sa long tones 6-8 s x8 with the drone.", read=[ton2], bench=drone()),
        blk("READ", 5, "Read L09: fingering Sa Re Ga.", read=[lesson(9)]),
        blk("K", 10, "Re (`XXO OOO`) long tones.", read=[lesson(9)], bench=chart()),
        blk("E", 10, "EX-EAR Level 1, 5 min; clap EX-RHY Levels 1-2, 5 min.", read=[ear1, rhy1]),
        R(),
    ], ["L09"], "Re sounds 3/5", docsec=wk[2]))

    days.append(day(9, "Ga", [
        warmup(),
        blk("T", 12, "Long tones on Sa and Re.", bench=drone()),
        blk("K", 15, "Ga (`XOO OOO`) long tones 10 min; slow S-R and R-G changes 5 min.", read=[lesson(9)], bench=chart()),
        blk("E", 5, "Read L10 part 1 and read 4 lines aloud.", read=[lesson(10)]),
        R(),
    ], ["L09", "L10"], "Ga sounds 3/5", docsec=wk[2]))

    days.append(day(10, "S R G R S and your first melody", [
        warmup(),
        blk("T", 12, "S R G long tones, 6 s each.", bench=drone()),
        blk("K", 10, "`S R G R S` at 50 BPM, 1 note per beat.", read=[lesson(9)], bench=play("S R G R S", 50)),
        blk("M", 10, f"First melody from EX-MEL Level 1: {m11['title']}.", read=[l11], bench=b11),
        blk("E", 5, "L05: movable Sa.", read=[lesson(5)]),
        R(),
    ], ["L05", "L09"], "`S R G R S` 3 clean in a row", items=[i11], docsec=wk[2]))

    days.append(day(11, "Clean transitions", [
        warmup(),
        blk("T", 12, "Long tones S R G.", bench=drone()),
        blk("K", 10, "Transition drill (L09 'finger together' drill).", read=[lesson(9)]),
        blk("M", 10, f"EX-MEL Level 1: {m12['title']}.", read=[l12], bench=b12),
        blk("E", 10, "Write 3 phrases you play (L10 writing) 5 min. EX-EAR Level 1, 5 min.", read=[lesson(10), ear1]),
        R("Record S-R-G slurred and listen for blips; log.", record="S R G slurred (Day 11)"),
    ], ["L09", "L10"], "No blips on S-R-G (recording)", items=[i12], docsec=wk[2]))

    wb = play(WU["W1"], 50)
    days.append(day(12, "First alankars", [
        warmup(),
        blk("T", 15, "Aim for 8 s on S, R and G.", bench=drone()),
        blk("K", 10, "S R G alankar warm-ups from EX-ALK at 50 BPM (W1 to W4). Read L12 sections 1-3 for why alankars matter.",
            read=[rd("EX-ALK warm-ups", EX["ALK"], "Warm-ups before L12"), lesson(12, "3. Simple explanation")], bench=wb),
        blk("M", 10, f"EX-MEL Level 1: {m13['title']}.", read=[l13], bench=b13),
        blk("E", 5, "Clapping (EX-RHY).", read=[rhy2]),
        R(),
    ], ["L12"], "Alankar 1 clean at 50 BPM",
        items=[item("EX-ALK-W", "EX-ALK warm-ups W1-W4", bench=wb, read=rd("EX-ALK warm-ups", EX["ALK"], "Warm-ups before L12")), i13], docsec=wk[2]))

    days.append(day(13, "M1 rehearsal", [
        warmup(),
        blk("T", 15, "Long tones S R G.", bench=drone()),
        blk("TEST", 15, "M1 rehearsal: try the M1 test twice and record it. Then K/M review.", read=[rd("M1 - First Stable Tone", M("M1"))], record="M1 rehearsal (Day 13)"),
        blk("E", 10, "EX-EAR Level 1.", read=[ear1]),
        R(),
    ], ["L07", "L09"], "Know your weakest M1 item", docsec=wk[2]))

    days.append(milestone_day(14, "M1", 1, 2, "Review + M1 - First stable tone. If not passed, continue the Week 2 days 11-13 rotation (max 1 more week), then retest.", P1 + "#" + wk[2]))

    # ---------------- Week 3 ----------------
    m21, l21, b21, i21 = mel("2.1")
    days.append(day(15, "Lower Ni", [
        warmup(),
        blk("T", 12, "Long tones S R G.", bench=drone()),
        blk("READ", 5, "Read L11: lower notes Ni Dha Pa.", read=[lesson(11)]),
        blk("K", 15, "`.N` (`XXX XOO`) long tones 10 min; `S .N S` changes 5 min.", read=[lesson(11)], bench=chart()),
        blk("E", 5, "L10 reading.", read=[lesson(10)]),
        R(),
    ], ["L11", "L10"], "`.N` sounds 4/5", docsec=wk[3]))

    days.append(day(16, "Lower Dha", [
        warmup(),
        blk("T", 12, "Long tones, adding `.N`.", bench=drone()),
        blk("K", 10, "`.D` (`XXX XXO`) long tones with a sealing check.", read=[lesson(11)], bench=chart()),
        blk("M", 5, "EX-MEL Level 1 review.", read=[rd("EX-MEL Level 1", EX["MEL"], "Level 1:")]),
        blk("E", 5, "EX-EAR Level 1.", read=[ear1]),
        R(),
    ], ["L11"], "`.D` sounds 3/5", docsec=wk[3]))

    days.append(day(17, "Evening Lamp", [
        warmup(),
        blk("T", 12, "Long tones.", bench=drone()),
        blk("K", 10, "`G R S .N .D .N S` slowly.", read=[lesson(11)], bench=play("G R S .N .D .N S", 50)),
        blk("M", 10, f"EX-MEL 2.1 {m21['title']} (uses `.N .D`; pieces with `.P` wait until Day 22).", read=[l21], bench=b21),
        blk("E", 5, "L06: counting while playing.", read=[lesson(6)]),
        R(),
    ], ["L06", "L11"], "Phrase clean at 50 BPM", items=[i21], docsec=wk[3]))

    days.append(day(18, "Extending the warm-ups", [
        warmup(),
        blk("T", 12, "Long tones.", bench=drone()),
        blk("K", 10, "Extend the EX-ALK S R G warm-ups downward to `.N` and `.D`. Write the extended pattern yourself first: a notation exercise.", read=[rd("EX-ALK warm-ups", EX["ALK"], "Warm-ups before L12"), lesson(10)]),
        blk("M", 10, f"Repertoire: EX-MEL 2.1 {m21['title']} and Level 1 pieces.", read=[l21], bench=b21),
        blk("E", 5, "EX-EAR Level 1 to Level 2 transition (Sa or Pa?).", read=[rd("EX-EAR Level 2", EX["EAR"], "Level 2:")], bench=ear(2)),
        R(),
    ], ["L11", "L12"], "Alankar at 50 BPM, 3 clean", docsec=wk[3]))

    days.append(day(19, "Five notes, one hand movement", [
        warmup(),
        blk("T", 15, "Long tones S R G .N .D.", bench=drone()),
        blk("K", 10, "'Finger together' drill across all 5 notes.", read=[lesson(9)]),
        blk("M", 10, "Repertoire: EX-MEL 2.1 and Level 1 pieces.", read=[l21], bench=b21),
        blk("E", 5, "Write and play an 8-beat phrase (L10).", read=[lesson(10)]),
        R("Record one melody, score it with the rubric (L08) and log.", record="Melody with rubric (Day 19)", minutes=5),
    ], ["L09", "L10", "L08"], "Rubric scores logged", docsec=wk[3]))

    days.append(day(20, "Free review and listening", [
        warmup(),
        blk("T", 12, "Long tones.", bench=drone()),
        blk("K", 20, "K/M free review: the alankar warm-ups and EX-MEL pieces you know.", label="Technique and music"),
        blk("E", 10, "Listening 10 min: note where the player breathes.", read=[listen]),
        R(),
    ], ["L01"], None, docsec=wk[3]))

    days.append(day(21, "Week 3 review", [
        blk("T", 10, "Long tones.", bench=drone()),
        blk("M", 10, "Your best melody.", read=[l21], bench=b21),
        blk("R", 10, "Recording comparison with Day 13. Optional teacher check this week.", read=[lesson(8)], record="Best melody (Day 21)"),
    ], ["L08"], "Week 3 reflection", kind="review", docsec=wk[3]))

    # ---------------- Week 4 ----------------
    m22, l22, b22, i22 = mel("2.2")
    bA1, iA1 = alk("A", 1)
    bB1, iB1 = alk("B", 1)
    days.append(day(22, "Mandra Pa", [
        warmup(),
        blk("T", 10, "Long tones.", bench=drone()),
        blk("K", 12, "`.P` (`XXX XXX`) long tones: slow, warm air; check every finger seal (TS-03 if it fails).", read=[lesson(11), rd("TS-03 Low notes won't sound", "troubleshooting/TS-03-low-notes-wont-sound.md")], bench=chart()),
        blk("M", 10, f"Repertoire: EX-MEL 2.1 {m21['title']}.", read=[l21], bench=b21),
        blk("E", 5, "L06: 2-per-beat playing.", read=[lesson(6)]),
        R(),
    ], ["L11", "L06"], "`.P` any clean sound 3/5", docsec=wk[4]))

    days.append(day(23, "Down to Pa and back", [
        warmup(),
        blk("T", 12, "Long tones, including `.P`.", bench=drone()),
        blk("K", 10, "`S .N .D .P .D .N S` at 50 BPM.", read=[lesson(11)], bench=play("S .N .D .P .D .N S", 50)),
        blk("M", 10, f"Repertoire: EX-MEL 2.1 {m21['title']}.", read=[l21], bench=b21),
        blk("E", 5, "EX-EAR Level 2.", read=[rd("EX-EAR Level 2", EX["EAR"], "Level 2:")], bench=ear(2)),
        R(),
    ], ["L11"], "Phrase 3 clean", docsec=wk[4]))

    days.append(day(24, "Alankars, Versions A and B", [
        warmup(),
        blk("T", 12, "Long tones.", bench=drone()),
        blk("K", 12, "L12 Version A (`.P .D S R G`), then Version B (`.P .D .N S R G`), alankar 1.", read=[lesson(12, "Version A", "L12 Version A"), lesson(12, "Version B", "L12 Version B")], bench=bA1),
        blk("M", 10, f"New: EX-MEL 2.2 {m22['title']}.", read=[l22], bench=b22),
        blk("E", 5, "EX-RHY Level 2.", read=[rhy2]),
        R(),
    ], ["L12"], None, items=[iA1, iB1, i22], docsec=wk[4]))

    days.append(day(25, "Metronome ladder", [
        warmup(),
        blk("T", 15, "8-s long tones on all 6 notes.", bench=drone()),
        blk("K", 10, "Metronome ladder 50 -> 60 BPM on alankar 1 (L01).", read=[lesson(1, "4. Step-by-step", "L01 deliberate practice")], bench=play(ALK_A[1], 50)),
        blk("M", 10, f"Repertoire: EX-MEL 2.2 {m22['title']}.", read=[l22], bench=b22),
        R(),
    ], ["L01", "L12"], "Alankar 1 at 60 BPM", docsec=wk[4]))

    days.append(day(26, "Two Level 2 melodies", [
        warmup(),
        blk("T", 12, "Long tones.", bench=drone()),
        blk("M", 15, f"EX-MEL Level 2, 2 melodies: 2.1 {m21['title']} and 2.2 {m22['title']}.", read=[l21, l22], bench=b22),
        blk("E", 10, "Write the rhythm of one melody with `-` and `_` (L10) 5 min. EX-EAR Level 2, 5 min.", read=[lesson(10)], bench=ear(2)),
        R(),
    ], ["L10"], None, docsec=wk[4]))

    days.append(day(27, "Theory quiz", [
        warmup(),
        blk("T", 10, "Long tones.", bench=drone()),
        blk("K", 20, "K/M: alankars and melodies.", bench=play(ALK_B[1], 60), label="Technique and music"),
        blk("E", 10, "Theory quiz: EX-THY Quiz 1.", read=[rd("EX-THY Quiz 1", EX["THY"], "Quiz 1")]),
        R(),
    ], ["L05", "L10"], "Quiz 80%+", docsec=wk[4]))

    days.append(day(28, "Week 4 review", [
        blk("T", 10, "Long tones.", bench=drone()),
        blk("R", 20, "Record your full routine (5 min). Score with the rubric (L08). Weekly reflection.", read=[lesson(8)], record="Full routine (Day 28)"),
    ], ["L08"], "Week 4 reflection", kind="review", docsec=wk[4]))

    # ---------------- Weeks 5-6 rotation (days 29-40) ----------------
    m23, l23, b23, i23 = mel("2.3")
    m22b, l22b, b22b, i22b = mel_inline("2.2b")
    new_mel = {29: (m23, l23, b23, i23), 32: (m22b, l22b, b22b, i22b)}
    rot_doc = P1 + "#" + wk56
    ear2 = rd("EX-EAR Level 2", EX["EAR"], "Level 2:")
    for i, n in enumerate(range(29, 41)):
        spaced = (n - 28) % 3 == 0                 # every 3rd day of the rotation
        ver = "A" if i % 2 == 0 else "B"
        if i <= 8:                                 # days 29-37: alankars 2..10, both versions
            num = 2 + i
            bk, ik = alk(ver, num)
            ik2 = alk("B" if ver == "A" else "A", num)[1]
            ktext = f"Alankar {num} (L12), Versions A and B, on a metronome ladder: target 60 -> 72 BPM, 1 note per beat, then 2 notes per beat at 50 BPM."
            kitems = [ik, ik2]
        else:                                      # days 38-40: alankar review
            num = 10
            bk = alk(ver, 1 + 3 * (i - 8))[0]
            ktext = "Alankars 1-10 (L12, Versions A and B) review on the metronome ladder: target 60 -> 72 BPM; then 2 notes per beat at 50 BPM."
            kitems = []
        ktext += " Spaced review: replace 6 minutes of K with the oldest melody or alankar you have not played for a week." if spaced else ""
        if n in new_mel:
            mm, ml, mb, mi = new_mel[n]
            mtext, mread, mbench, mitems = f"New: EX-MEL {mi['label'][7:]}. Keep the old ones in rotation.", [ml], mb, [mi]
        else:
            mtext, mread, mbench, mitems = "EX-MEL Level 2 melodies in rotation (one new melody every 3 days while new ones remain; then keep all of Level 2 in rotation and get two ready from memory for M2).", [rd("EX-MEL Level 2", EX["MEL"], "Level 2:")], b22, []
        if i % 2 == 0:
            e = blk("E", 10, "(a) EX-EAR Level 2 + 5 min singing sargam with the drone.", read=[ear2], bench=ear(2))
        else:
            e = blk("E", 10, "(b) EX-RHY + L10 writing drill.", read=[rhy2, lesson(10)])
        blocks = [
            warmup(5, "Warm-up (L01) and tension scan."),
            blk("T", 12, "Long tones on `.P .D .N S R G`, 8-10 s each, with the drone; one note per day gets a tuner check.", read=[ton2], bench=drone()),
            blk("K", 12, ktext, read=[lesson(12, "Version " + ver, f"L12 Version {ver}")], bench=bk),
            blk("M", 12, mtext, read=mread, bench=mbench),
            e,
            R("Record one item; rubric score; log; listening for the evening.", record=f"Rotation item (Day {n})", minutes=4),
        ]
        items = kitems + mitems
        days.append(day(n, f"Consolidation: alankar {num}" if i <= 8 else "Consolidation: alankar review", blocks, ["L12", "L10"], None, items=items, docsec=wk56))

    days.append(day(41, "Review before M2", [
        blk("T", 10, "Long tones.", bench=drone()),
        blk("M", 10, "Play the two EX-MEL Level 2 melodies you will use for M2, from memory.", read=[rd("EX-MEL Level 2", EX["MEL"], "Level 2:")], bench=b22),
        blk("R", 10, "Rehearse M2 items and record them. Weekly reflection.", read=[rd("M2 - First Melody in Time", M("M2"))], record="M2 rehearsal (Day 41)"),
    ], ["L08"], None, kind="review", docsec=wk56))

    days.append(milestone_day(42, "M2", 1, 6, "M2 - First melody in time. If M2 fails, the M2 file tells you what to practise for the failed criterion; retest after 5-7 more practice days.", rot_doc))
    return days


def milestone_day(n, mid, phase, week, text, doc):
    from .md import h1_title
    import re
    path = M(mid)
    title = re.sub(r"^M\d+\s*-\s*", "", h1_title(path))
    blocks = [
        warmup(5, "Warm up for at most 10 minutes before the test (projects/README)."),
        blk("TEST", 40, f"{text} Record each item in one take (2 attempts allowed). Wait at least a day before scoring with the rubric.",
            read=[rd(f"{mid} - {title}", path), rd("How milestones work", "projects/README.md")], record=f"{mid} test"),
        blk("R", 5, "Write the result in the app; if you did not pass, follow the milestone's 'If you did not pass' table.", read=[rd("Progress tracker", "03-PROGRESS-TRACKER.md")]),
    ]
    return {"n": n, "phase": phase, "week": week, "kind": "milestone", "title": f"{mid}: {title}", "lessons": [],
            "blocks": blocks, "minutes": sum(b["minutes"] for b in blocks), "milestone": mid, "doc": doc}
