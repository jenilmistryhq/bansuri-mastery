"""Phases 2-5, expanded from the module schedules in phases/phase-2..5*.md into practice days.

Global week w has practice days 7*(w-1)+1 .. 7*w. Every 7th day is a lighter review day unless a
milestone falls on it. Days reference shared block templates (deduplicated) to keep plan.json small.
"""
import json
import re

from .blocks import EX, L, M, blk, chart, check, drone, ear, item, lesson, play, rd, tala, warmup
from .md import alankars, anchor, raga_notation
from .phase01 import mel, milestone_day

P2, P3, P4, P5 = (f"phases/{f}" for f in (
    "phase-2-core-technique.md", "phase-3-musicianship.md",
    "phase-4-intermediate-artistry.md", "phase-5-advanced-independence.md"))

ALK = EX["ALK"]
ALK_C = alankars(ALK, "Version C:")
ALK_CP = alankars(ALK, "Version C-penta")
ALK_D = alankars(ALK, "Version D")
ALK_E = alankars(ALK, "Version E")


def n_of(week, d):
    return 7 * (week - 1) + d


class Templates:
    def __init__(self):
        self.by_id, self.by_key = {}, {}

    def add(self, prefix, blocks):
        key = json.dumps(blocks, sort_keys=True)
        if key in self.by_key:
            return self.by_key[key]
        i, tid = 1, prefix
        while tid in self.by_id:
            i += 1
            tid = f"{prefix}-{i}"
        self.by_id[tid] = {"blocks": blocks}
        self.by_key[key] = tid
        return tid


def R(minutes=4, text="Record one item, score it with the rubric (L08) and log.", record=None):
    return blk("R", minutes, text, read=[lesson(8, label="L08 rubric")], record=record)


def alk_item(version, table, n, bpm=60):
    bench = play(table[n], bpm)
    head = {"C": "Version C:", "C-penta": "Version C-penta", "D": "Version D", "E": "Version E"}[version]
    return item(f"EX-ALK-{version}-{n}", f"Alankar {n}, Version {version}", bench=bench,
                read=rd(f"EX-ALK Version {version}", ALK, head))


def raga_item(name, title):
    nota = raga_notation(name)
    return item(f"RAGA-{name}", f"Raga {title}", bench=play(nota, 60) if nota else drone(),
                read=rd(f"Raga card: {title}", f"ragas/{name}.md"))


def raga_read(name, title):
    return [rd(f"Raga card: {title}", f"ragas/{name}.md"), rd(f"Listening: {title}", "08-LISTENING-LIBRARY.md", title)]


def mel_item(num):
    return mel(num)[3]


def mel_bench(num, bpm=70):
    return mel(num, bpm)[2]


# ----- day titles: named after what each day's own blocks work on -----
_STOP = {"and", "with", "the", "a", "an", "of", "in", "to", "for", "on", "at", "then", "or", "by", "from", "your"}


def parts(text):
    """The sentences of a block's text as short focus phrases (module prefixes and backticks removed)."""
    out = []
    for s in re.split(r"(?<=[a-z0-9)\]])\.\s+", text.replace("`", "")):  # sentence ends
        s = s.strip().rstrip(".")
        s = re.sub(r"^Module \d[A-H](?: \(L\d+\))?(?: \(optional\))?[:,]\s*", "", s)
        s = re.sub(r"^(Daily constant|Module \d[A-H]):\s*", "", s)
        s = s.split("; ")[0].strip()
        if len(s) >= 10:
            out.append(s[0].upper() + s[1:])
    return out


def clip(text, limit=60):
    """Shorten to `limit` characters at a clause boundary, never leaving a bracket open."""
    t = re.sub(r"\s+", " ", text).strip()
    if len(t) > limit:
        for sep in (" (", ", ", " with ", " and ", " - ", ": "):
            i = t.rfind(sep, 0, limit + 1)
            if i >= max(18, int(limit * 0.55)):
                t = t[:i]
                break
        else:
            words = t[:limit + 1].split(" ")[:-1]
            while words and words[-1].lower() in _STOP:
                words.pop()
            t = " ".join(words)
    if t.count("(") > t.count(")"):
        t = t[:t.rfind("(")]
    return t.rstrip(" ,:;-")


def pick_title(cands, used, start):
    """The first candidate (rotating from `start`) not yet used this week."""
    cands = [clip(c) for c in cands if c]
    if not cands:
        return None
    for i in range(len(cands)):
        c = cands[(start + i) % len(cands)]
        if c not in used:
            used.add(c)
            return c
    return cands[start % len(cands)]


_LABEL = {"E": "Ear and rhythm: ", "T": "Tone: "}


def block_parts(*blocks):
    out = []
    for b in blocks:
        out += [_LABEL.get(b["id"], "") + p for p in parts(b["text"])]
    return out


def runs(weeks, text_of):
    """week -> (position, length) within runs of consecutive weeks that share the same text."""
    out, ws = {}, list(weeks)
    i = 0
    while i < len(ws):
        j = i
        while j + 1 < len(ws) and text_of(ws[j + 1]) == text_of(ws[i]):
            j += 1
        for k in range(i, j + 1):
            out[ws[k]] = (k - i + 1, j - i + 1)
        i = j + 1
    return out


def staged(title, pos):
    """Add ' - week i of n' when the same work runs for several weeks."""
    i, n = pos
    if n <= 1:
        return clip(title)
    suffix = f" - wk {i} of {n}"
    return clip(title, 60 - len(suffix)) + suffix


def day(n, phase, week, kind, title, tid, items=None, doc=None, milestone=None):
    d = {"n": n, "phase": phase, "week": week, "kind": kind, "title": title, "template": tid, "lessons": []}
    if items:
        d["newItems"] = items
    if doc:
        d["doc"] = doc
    if milestone:
        d["milestone"] = milestone
    return d


# ----------------------------------------------------------------------------- Phase 2
def phase2(T):
    days = []
    mod = {k: anchor(P2, f"Module {k}") for k in ("2A", "2B", "2C", "2D", "2E", "2F")}
    ear2 = rd("EX-EAR Level 2", EX["EAR"], "Level 2:")
    ear3 = rd("EX-EAR Level 3", EX["EAR"], "Level 3:")
    ear4 = rd("EX-EAR Level 4", EX["EAR"], "Level 4:")
    ton3 = rd("EX-TON Part 3: registers", EX["TON"], "Part 3:")
    ton4 = rd("EX-TON Part 4: dynamics and pitch", EX["TON"], "Part 4:")
    rhy5 = rd("EX-RHY Level 5: tala recitation", EX["RHY"], "Level 5:")
    t_slur = blk("T", 12, "Long tones with the drone; octave slurs `.P` <-> `P` (same fingers, faster, narrower air).", read=[ton3], bench=drone())
    m_rep = blk("M", 12, "Phase 1 melodies and alankars (Versions A and B) with the metronome; keep EX-MEL Levels 1-2 in rotation.", read=[rd("EX-MEL Level 2", EX["MEL"], "Level 2:")])
    tala_e = "Module 2C (L15): recite and clap keherwa, then dadra, then teentaal, with waves on khali (5 min)."
    W = {
        7: ("Tivra Ma and octave slurs", ["2A", "2B"], [
            t_slur,
            blk("K", 15, "Module 2B: tivra `M` (`OOO OOO`) long tones; `G M G R S`. Module 2A (5 min): repeated notes with breath attacks, then light tonguing, on S, R, G and `.N`; compare with slurred versions.",
                read=[lesson(14, "4.1"), lesson(13)], bench=play("G M G R S", 50)),
            m_rep,
            blk("E", 10, "EX-EAR Level 2 (Sa or Pa against the drone); EX-NOT rhythmic sargam.", read=[ear2, rd("EX-NOT Level 3", EX["NOT"], "Level 3:")], bench=ear(2)),
        ], {}),
        8: ("Madhya Pa, Dha and Ni", ["2A", "2B", "2C"], [
            t_slur,
            blk("K", 15, "Module 2B: madhya `P`, then `D` (`XXX XXO`, register 2), then `N`. Module 2A: 5 min of tonguing.", read=[lesson(14, "4.2")], bench=chart()),
            m_rep,
            blk("E", 10, tala_e + " EX-EAR Level 2 (5 min).", read=[lesson(15), rhy5], bench=tala("keherwa", 60)),
        ], {}),
        9: ("Taar Sa and the Kalyan scale", ["2B", "2C"], [
            blk("T", 12, "Long tones and octave slurs. Tuner check: record `S R G M P D N S'` and check it (plan: middle octave, Kalyan).", read=[ton3], bench=check(2)),
            blk("K", 15, "Module 2B: `S'` (register 2). Full Kalyan scale `S R G M P D N S'` slowly at 50 BPM.", read=[lesson(14, "4.3")], bench=play("S R G M P D N S'", 50)),
            blk("M", 12, "From this week, play all melodies over a keherwa or teentaal loop. New: EX-MEL 3.1 and 3.2.", read=[rd("EX-MEL Level 3", EX["MEL"], "Level 3:")], bench=mel_bench("3.1")),
            blk("E", 10, tala_e + " EX-EAR Level 3 (S R G P).", read=[rhy5, ear3], bench=ear(3)),
        ], {1: [mel_item("3.1")], 3: [mel_item("3.2")]}),
        10: ("Kalyan alankars; half-holing begins", ["2B", "2C", "2D"], [
            blk("T", 12, "Long tones with the drone.", bench=drone()),
            blk("K", 15, "Module 2B: alankars over the full middle octave, EX-ALK Version C at 60 BPM. Module 2D starts: read L16; half-hole slide drill 5 min with a tuner.",
                read=[rd("EX-ALK Version C", ALK, "Version C:"), lesson(16)], bench=play(ALK_C[1], 60)),
            blk("M", 12, "Melodies with a tabla loop. New: EX-MEL 3.3 and 3.4.", read=[rd("EX-MEL Level 3", EX["MEL"], "Level 3:")], bench=mel_bench("3.3")),
            blk("E", 10, tala_e + " EX-EAR Level 3; EX-THY Quiz 2 (rhythm and tala) once this week.", read=[ear3, rd("EX-THY Quiz 2", EX["THY"], "Quiz 2")], bench=ear(3)),
        ], {1: [alk_item("C", ALK_C, 1)], 2: [mel_item("3.3")], 3: [alk_item("C", ALK_C, 2)], 4: [mel_item("3.4")], 5: [alk_item("C", ALK_C, 3)]}),
        11: ("Shuddha Ma", ["2C", "2D"], [
            blk("T", 12, "Long tones. Tuner check: record the Bilawal scale (plan: middle octave, Bilawal).", bench=check(3)),
            blk("K", 15, "Module 2D: half-hole slide drill 5 min with a tuner; `G m G`, `m P m G`; `m` <-> `M` switching. Then the Bilawal (major) scale.", read=[lesson(16)], bench=chart()),
            blk("M", 12, "Reward melodies. New: EX-MEL 4.1 and 4.2.", read=[rd("EX-MEL Level 4", EX["MEL"], "Level 4:")], bench=mel_bench("4.1")),
            blk("E", 10, "Pass EX-EAR Level 3; start Level 4 (all shuddha swaras).", read=[ear3, ear4], bench=ear(3)),
        ], {1: [mel_item("4.1")], 3: [mel_item("4.2")]}),
        12: ("Bilawal alankars", ["2D"], [
            blk("T", 12, "Long tones with the drone; `m` with the tuner.", bench=drone()),
            blk("K", 15, "Module 2D: Bilawal alankars, EX-ALK Version D at 60 BPM; keep `m` within +/-20 cents.", read=[rd("EX-ALK Version D", ALK, "Version D")], bench=play(ALK_D[1], 60)),
            blk("M", 12, "New: EX-MEL 4.3 and 4.4.", read=[rd("EX-MEL Level 4", EX["MEL"], "Level 4:")], bench=mel_bench("4.4")),
            blk("E", 10, "EX-EAR Level 4; 12 notes and intervals in semitones.", read=[ear4], bench=ear(4)),
        ], {1: [alk_item("D", ALK_D, 1)], 2: [mel_item("4.3")], 3: [alk_item("D", ALK_D, 2)], 4: [mel_item("4.4")]}),
        13: ("Half-hole gate; intonation begins", ["2D", "2E"], [
            blk("T", 12, "Long tones with the drone.", bench=drone()),
            blk("K", 15, "Module 2D gate: `G m P m G` with `m` within +/-20 cents, 5 clean repetitions. Module 2E starts: read L17.", read=[lesson(16), lesson(17)], bench=play("G m P m G", 50)),
            blk("M", 12, "New: EX-MEL 4.5. Rehearse the M3 items: alankars over a teentaal loop, melodies over keherwa.", read=[rd("M3 - Full Middle Octave", M("M3"))], bench=tala("teentaal", 60)),
            blk("E", 10, "Recite teentaal with claps and waves; count 2 cycles silently and land on sam. EX-EAR Level 4.", read=[rhy5, ear4], bench=ear(4)),
        ], {1: [mel_item("4.5")]}),
        14: ("Intonation with the drone", ["2E"], [
            blk("T", 12, "Drone-tuning: hold each note until it locks with the drone.", read=[ton4], bench=drone()),
            blk("K", 15, "Module 2E: bend Sa 20 cents flat and sharp and return to centre; swells (soft-loud-soft) with steady pitch.", read=[lesson(17)], bench=drone()),
            blk("M", 12, "Repertoire over a tabla loop (spaced-review items first).", bench=tala("teentaal", 70)),
            blk("E", 10, "EX-EAR Level 4; EX-THY Quiz 3 (semitones and intervals).", read=[ear4, rd("EX-THY Quiz 3", EX["THY"], "Quiz 3")], bench=ear(4)),
        ], {}),
        15: ("Song-learning method: song 1", ["2E", "2F"], [
            blk("T", 12, "Drone-tuning and swells.", read=[ton4], bench=drone()),
            blk("K", 15, "Module 2E gate: an 8-s swell on Sa within +/-15 cents.", read=[lesson(17)], bench=drone()),
            blk("M", 12, "Module 2F starts: read L18. Apply the 12 steps to song 1: a traditional bhajan or nursery melody you already know by voice. Use slow-down tools.",
                read=[lesson(18), rd("Song suggestions: Stage 1", "09-SONG-SUGGESTIONS.md", "Stage 1")]),
            blk("E", 10, "EX-EAR Level 4; phrase memory (EAR-09) with your old recordings.", read=[ear4], bench=ear(4)),
        ], {}),
        16: ("Song 1 and your repertoire list", ["2F"], [
            blk("T", 12, "Long tones with the drone.", bench=drone()),
            blk("K", 15, "Kalyan and Bilawal alankars (EX-ALK Versions C and D), keeping `m` in tune.", read=[rd("EX-ALK Version D", ALK, "Version D")], bench=play(ALK_D[2], 60)),
            blk("M", 12, "Song 1: write out its notation and structure (THY-14). Start the repertoire list in the progress tracker (SNG-08).",
                read=[lesson(18, "Step 11"), rd("Progress tracker", "03-PROGRESS-TRACKER.md")]),
            blk("E", 10, "EX-EAR Level 4; phrase memory.", read=[ear4], bench=ear(4)),
        ], {}),
        17: ("Song 2: a melody never seen notated", ["2F"], [
            blk("T", 12, "Long tones with the drone.", bench=drone()),
            blk("K", 15, "Kalyan and Bilawal alankars at 2 notes per beat.", read=[rd("EX-ALK Version C", ALK, "Version C:")], bench=play(ALK_C[2], 60)),
            blk("M", 12, "Module 2F, song 2: a melody you have never seen notated, with the 12 steps; slow-down tools (R-A14, R-A17).",
                read=[lesson(18), rd("Slow-down tools", "02-RESOURCE-LIBRARY.md", "7.2")]),
            blk("E", 10, "EX-EAR Level 4; prepare M4 dictation material at least 2 days ahead (Method A).", read=[rd("EX-EAR Method A", EX["EAR"], "Method A")], bench=ear(4)),
        ], {}),
        18: ("Song 2 notation and M4", ["2F"], [
            blk("T", 12, "Long tones with the drone.", bench=drone()),
            blk("K", 15, "Alankars and scales in tala (warm-up for M4).", bench=tala("teentaal", 60)),
            blk("M", 12, "Song 2: write and verify the notation. Rehearse M4 (ear and notation check).", read=[lesson(18, "Step 11"), rd("M4 - Ear and Notation Check", M("M4"))]),
            blk("E", 10, "EX-EAR Level 4 and rhythm dictation (EX-RHY Level 6).", read=[ear4, rd("EX-RHY Level 6", EX["RHY"], "Level 6:")], bench=ear(4)),
        ], {}),
    }
    review = T.add("p2-review", [
        blk("T", 10, "Long tones.", bench=drone()),
        blk("M", 10, "One item from each earlier module (spaced review first).", label="Review"),
        blk("E", 10, "Listening 10 min.", read=[rd("Listening library", "08-LISTENING-LIBRARY.md", "How to listen")], label="Listening"),
        blk("R", 5, "Weekly reflection. Every 4th week: a cumulative review (L01).", read=[lesson(1, label="L01 lighter days")]),
    ])
    ms = {13: "M3", 18: "M4"}
    for w in range(7, 19):
        title, mods, blocks, items = W[w]
        tid = T.add(f"p2-w{w}", [warmup()] + blocks + [R()])
        doc = P2 + "#" + mod[mods[-1]]
        by_id = {b["id"]: b for b in blocks}
        cands = block_parts(*[by_id[k] for k in ("K", "M", "E", "T") if k in by_id])
        used = {title}
        for d in range(1, 8):
            n = n_of(w, d)
            if d == 7 and w in ms:
                days.append(milestone_day(n, ms[w], 2, w, f"{ms[w]} test.", doc))
            elif d == 7:
                days.append(day(n, 2, w, "review", clip(f"Review: {title}"), review, doc=doc))
            else:
                dt = title if d == 1 else (pick_title(cands, used, d - 2) or title)
                days.append(day(n, 2, w, "practice", dt, tid, items.get(d), doc))
    return days


# ----------------------------------------------------------------------------- Phase 3
def phase3(T):
    days = []
    sec = {k: anchor(P3, k + " -") for k in ("3A", "3B", "3C", "3D", "3E", "3F", "3G", "3H")}
    bh, ya, du = raga_notation("bhupali"), raga_notation("yaman"), raga_notation("durga")
    ear4 = rd("EX-EAR Level 4", EX["EAR"], "Level 4:")
    ear5 = rd("EX-EAR Level 5", EX["EAR"], "Level 5:")
    ear7 = rd("EX-EAR Level 7", EX["EAR"], "Level 7:")

    def T_block(w):
        if w < 21:
            return blk("T", 10, "Long tones with the drone, mandra and madhya; swells twice a week.", bench=drone())
        if w == 23:
            return blk("T", 10, "Long tones in three octaves; tuner check of the upper octave (plan: upper octave).", bench=check(6))
        return blk("T", 10, "Long tones with the drone, rotating mandra, madhya and taar; swells twice a week.", bench=drone())

    def K_block(w):
        if w <= 20:
            return blk("K", 15, "Middle-octave consolidation: EX-ALK Versions C-penta and D at 60-72 BPM.", read=[rd("EX-ALK Version C-penta", ALK, "Version C-penta")], bench=play(ALK_CP[1], 60))
        if w <= 26:
            f = {21: 1, 22: 2, 23: 3, 24: 5}.get(w, 1)
            return blk("K", 15, f"Module 3B, taar saptak (L22): build your own verified upper-octave chart; octave leaps; two-octave alankars (EX-ALK Version E, formula {f}) at 60 BPM.",
                       read=[lesson(22), rd("EX-ALK Version E", ALK, "Version E")], bench=play(ALK_E[f], 60))
        if w <= 28:
            return blk("K", 15, "Module 3B (octave pairs within +/-15 cents) and Module 3D starts: meend (L23).", read=[lesson(22, "4.2"), lesson(23)], bench=drone())
        if w <= 30:
            return blk("K", 15, "Module 3D: meend (L23): descending, ascending, over two notes; add meend to your bhajans.", read=[lesson(23)], bench=drone())
        if w <= 36:
            return blk("K", 15, "Module 3D: kan, khatka and murki (L24). An ornament goes into a piece only after it passes its isolated drill.", read=[lesson(24)], bench=drone())
        return blk("K", 15, "Ornaments in context: meend, kan and murki in Yaman and Bhupali phrases and in your songs; upper-octave intonation.", read=[lesson(23), lesson(24), lesson(22)], bench=drone())

    def E_block(w):
        if w <= 26:
            return blk("E", 10, "EX-EAR Level 4 to pass, then Level 5 (intervals). Dadra and keherwa songs; identify the tala by ear (EX-RHY Level 7).",
                       read=[ear4, ear5, rd("EX-RHY Level 7", EX["RHY"], "Level 7:")], bench=ear(4))
        if w <= 34:
            extra = " Module 3F (L27): transcribe a printed bandish into ASCII; fix 3 errors in an online song notation." if 28 <= w <= 31 else ""
            return blk("E", 10, "EX-EAR Level 5, then Level 7 with 8-note melodies; Rupak and Jhaptaal recitation (EX-RHY Level 5)." + extra,
                       read=[ear5, ear7, rd("EX-RHY Level 5", EX["RHY"], "Level 5:")] + ([lesson(27)] if extra else []), bench=tala("rupak", 70))
        return blk("E", 10, "EX-EAR Level 7 up to 16-note melodies; phrase memory with raga phrases; Western meters and syncopation (EX-RHY Level 4).",
                   read=[ear7, rd("EX-RHY Level 4", EX["RHY"], "Level 4:")])

    def raga_M(w, d):
        if d == 5 and w >= 38:
            return blk("M", 15, "Module 3H (optional): Raga Durga, if 3A-3E are on track: aroh, avroh, pakad, short composition.", read=raga_read("durga", "Durga"), bench=play(du, 60))
        if w <= 20:
            return blk("M", 15, "Module 3A: what a raga is (L19). Listening: Bhupali recordings, short ones first.", read=[lesson(19)] + raga_read("bhupali", "Bhupali"))
        if w <= 22:
            return blk("M", 15, "Raga Bhupali (L20): aroh, avroh and pakad; swar vistar phrases slowly with the drone.", read=[lesson(20, "5. Swar vistar")] + raga_read("bhupali", "Bhupali"), bench=play(bh, 60))
        if w <= 25:
            return blk("M", 15, "Bhupali: the L20 practice composition in teentaal with a tabla loop.", read=[lesson(20, "6. Practice composition")], bench=tala("teentaal", 70))
        if w == 26:
            return blk("M", 15, "M5 rehearsal: explain Bhupali, aroh/avroh, pakad, 3 min swar vistar, composition with the loop.", read=[rd("M5 - First Raga: Bhupali", M("M5"))], bench=play(bh, 60))
        if w <= 28:
            return blk("M", 15, "Bhupali: swar vistar and the composition, adding meend where L23 allows.", read=[lesson(20)], bench=play(bh, 60))
        if w <= 30:
            return blk("M", 15, "Module 3E, Raga Yaman (L21): characteristic movements `.N R G` and `M D N`; listening.", read=[lesson(21, "4. How Yaman moves")] + raga_read("yaman", "Yaman"), bench=play(ya, 60))
        if w <= 34:
            return blk("M", 15, "Yaman: swar vistar phrases (L21 section 5).", read=[lesson(21, "5. Swar vistar")], bench=play(ya, 60))
        if w <= 37:
            return blk("M", 15, "Yaman: the L21 practice composition with a tabla loop.", read=[lesson(21, "6. Practice composition")], bench=tala("teentaal", 70))
        if w <= 40:
            return blk("M", 15, "Yaman: 2-3 minutes of slow exploration with meend and kan in the right places.", read=[lesson(21)], bench=drone())
        return blk("M", 15, "Recital programme (M7): Yaman (alap-style opening and composition) and the Bhupali composition; mock performances (L35).",
                   read=[rd("M7 - First Recital", M("M7")), lesson(35)], bench=tala("teentaal", 70))

    def song_M(w):
        stage1 = rd("Song suggestions: Stage 1", "09-SONG-SUGGESTIONS.md", "Stage 1")
        stage2 = rd("Song suggestions: Stage 2", "09-SONG-SUGGESTIONS.md", "Stage 2")
        if w <= 20:
            return blk("M", 15, "Repertoire review: Phase 2 songs and EX-MEL Levels 3-4 from memory.", read=[rd("EX-MEL Level 4", EX["MEL"], "Level 4:")])
        if w <= 22:
            return blk("M", 15, "EX-MEL 5.1 (taar saptak) and repertoire review.", read=[rd("EX-MEL Level 5", EX["MEL"], "Level 5:")], bench=mel_bench("5.1"))
        if w <= 25:
            return blk("M", 15, "Module 3C: song A, a bhajan, learned by ear with the 12 steps; check its range first.", read=[lesson(18), stage1])
        if w <= 28:
            return blk("M", 15, "Module 3C: song B, a film song, by ear; write and verify the notation; play along with the recording (pitch-shift it if needed).", read=[lesson(18), stage1, lesson(26)])
        if w <= 32:
            return blk("M", 15, "M6 song: a song you have never seen notated, learned by ear end to end, with the worksheet.", read=[rd("M6 - A Song Learned Entirely by Ear", M("M6")), lesson(18)])
        if w <= 40:
            return blk("M", 15, "Next songs from Stage 2: one every 2-3 weeks, alternating bhajan and film song; add meend and kan.", read=[stage2, lesson(18)])
        return blk("M", 15, "Recital pieces: the bhajan with meend and the film song learned by ear, from memory.", read=[rd("M7 - First Recital", M("M7"))])

    def creative_M(w):
        if w <= 30:
            return blk("M", 15, "Improvisation: EX-IMP Level 1 (call and response) and Level 2 (few notes over a drone).",
                       read=[rd("EX-IMP Level 1", EX["IMP"], "Level 1:"), rd("EX-IMP Level 2", EX["IMP"], "Level 2:")], bench=drone(), label="Creative")
        return blk("M", 15, "Improvisation (L29) and composition (L30): improvise over the drone; write one 16-beat original melody every 2 weeks (EX-IMP C1, C2).",
                   read=[lesson(29), lesson(30), rd("EX-IMP C1", EX["IMP"], "C1:")], bench=drone(), label="Creative")

    review = T.add("p3-review", [
        blk("T", 10, "Long tones.", bench=drone()),
        blk("M", 10, "Repertoire rotation: spaced-review items first.", label="Review"),
        blk("E", 15, "Listening 15 min.", read=[rd("Listening library", "08-LISTENING-LIBRARY.md", "How to listen")], label="Listening"),
        blk("R", 5, "Weekly reflection.", read=[lesson(1, label="L01 lighter days")]),
    ])
    ms = {26: "M5", 32: "M6", 44: "M7"}

    def module_of(w):
        if w <= 26:
            return "3A"
        if w <= 28:
            return "3B"
        if w <= 40:
            return "3E"
        return "3G"

    wk3 = range(19, 45)
    run_raga = runs(wk3, lambda w: raga_M(w, 1)["text"])
    run_song = runs(wk3, lambda w: song_M(w)["text"])
    run_crea = runs(wk3, lambda w: creative_M(w)["text"] + K_block(w)["text"])
    for w in range(19, 45):
        doc = P3 + "#" + sec[module_of(w)]
        used = set()
        slot = {"Raga day": 0, "Song day": 0, "Creative day": 0}
        for d in range(1, 8):
            n = n_of(w, d)
            if d == 7:
                if w in ms:
                    days.append(milestone_day(n, ms[w], 3, w, f"{ms[w]} test.", doc))
                else:
                    days.append(day(n, 3, w, "review", clip("Review: " + parts(raga_M(w, 1)["text"])[0]), review, doc=doc))
                continue
            if d in (1, 3, 5):
                M_ = raga_M(w, d)
                kind = "Raga day"
            elif d in (2, 4):
                M_ = song_M(w)
                kind = "Song day"
            else:
                M_ = creative_M(w)
                kind = "Creative day"
            tid = T.add(f"p3-w{w}", [warmup(), T_block(w), K_block(w), M_, E_block(w), R()])
            items = []
            if w == 21 and d == 1:
                items.append(raga_item("bhupali", "Bhupali"))
            if w == 21 and d == 2:
                items.append(mel_item("5.1"))
            if w == 21 and d == 3:
                items.append(alk_item("E", ALK_E, 1))
            if w == 29 and d == 1:
                items.append(raga_item("yaman", "Yaman"))
            if w == 38 and d == 5:
                items.append(raga_item("durga", "Durga"))
            cands = block_parts(M_) + block_parts(K_block(w), E_block(w), T_block(w))
            dt = pick_title(cands, used, slot[kind]) or kind
            slot[kind] += 1
            dt = staged(dt, {"Raga day": run_raga, "Song day": run_song}.get(kind, run_crea)[w])
            days.append(day(n, 3, w, "practice", dt, tid, items or None, doc))
    return days


# ----------------------------------------------------------------------------- Phase 4
RAGAS4 = [("khamaj", "Khamaj", 1, 6), ("kafi", "Kafi", 7, 12), ("bhimpalasi", "Bhimpalasi", 13, 18),
          ("bageshri", "Bageshri", 19, 24), ("shivranjani", "Shivranjani", 25, 30), ("pahadi", "Pahadi", 31, 36),
          ("hamsadhwani", "Hamsadhwani", 37, 42)]


def month4(k):
    """Phase 4 week k (1..44) -> approximate month 10..19 (the phase spans months 10-20)."""
    return 10 + (k - 1) * 10 // 44


def phase4(T):
    days = []
    sec = {k: anchor(P4, k + " -") for k in ("4A", "4B", "4C", "4D", "4E", "4F", "4G", "4H")}
    chrom = "S r R g G m M P d D n N S'"

    def raga_at(k):
        for name, title, a, b in RAGAS4:
            if a <= k <= b:
                return name, title, k == a
        return None, None, False

    def K_block(m):
        if m <= 12:
            return blk("K", 15, f"Module 4A, komal swaras (L25): build your verified komal chart; chromatic scale `{chrom}` and back down, 1 note per beat at 50 BPM, with the tuner.",
                       read=[lesson(25)], bench=play(chrom, 50))
        if m <= 15:
            return blk("K", 15, "Speed and articulation: double tonguing for fast passages (L13, FNG-12); alankars at 2 and 4 notes per beat (layakari).",
                       read=[lesson(13), lesson(32, "Step 4"), rd("EX-RHY Level 8", EX["RHY"], "Level 8:")], bench=tala("teentaal", 70))
        return blk("K", 15, "Module 4G: gamak, andolan and advanced ornaments (L33).", read=[lesson(33)], bench=drone())

    def T_block(m):
        if m <= 12:
            return blk("T", 8, "Long tones and swells in all three octaves; komal notes against the drone. Tuner check of the half-holes (plan: half-holes).", bench=check(5))
        return blk("T", 8, "Long tones and swells in all three octaves; komal notes against the drone.", bench=drone())

    def E_block(m):
        if m <= 11:
            return blk("E", 8, "EX-EAR Level 6 (komal and tivra).", read=[rd("EX-EAR Level 6", EX["EAR"], "Level 6:")], bench=ear(6))
        if m <= 15:
            return blk("E", 8, "Module 4D: Western notation and theory (L28); EX-NOT Levels 6-7; EX-THY Quiz 6.",
                       read=[lesson(28), rd("EX-NOT Level 6", EX["NOT"], "Level 6:"), rd("EX-THY Quiz 6", EX["THY"], "Quiz 6")])
        return blk("E", 8, "EX-EAR Levels 8-9 (major or minor; raga recognition); EX-RHY Levels 8-9 (layakari, tihai).",
                   read=[rd("EX-EAR Level 9", EX["EAR"], "Level 9:"), rd("EX-RHY Level 9", EX["RHY"], "Level 9:")])

    def raga_M(k, m, d):
        name, title, _ = raga_at(k)
        if name is None:
            return blk("M", 20, "M9 preparation: 15-minute raga presentation (alap, bandish with 5 taans and 2 tihais, ending); mock performances.",
                       read=[rd("M9 - Intermediate Recital and Accompaniment", M("M9")), lesson(35)], bench=tala("teentaal", 80))
        nota = raga_notation(name)
        if d == 1:
            return blk("M", 20, f"Module 4B, Raga {title}: aroh, avroh and pakad; listening; swar vistar; one composition.",
                       read=raga_read(name, title), bench=play(nota, 60) if nota else drone())
        if d == 2:
            if m >= 13:
                return blk("M", 20, f"Module 4E, alap (L31): Yaman first, then Bhupali, then {title}; build it in stages and check it against the raga rules checklist.",
                           read=[lesson(31, "Step 3"), lesson(31, "Raga rules checklist")], bench=drone())
            return blk("M", 20, f"{title}: listening and swar vistar.", read=raga_read(name, title), bench=drone())
        if m >= 14:
            return blk("M", 20, "Module 4F (L32): a published bandish, taans and tihais landing on sam with a teentaal loop; compose one bandish of your own (EX-IMP C3).",
                       read=[lesson(32), rd("EX-IMP C3", EX["IMP"], "C3:")], bench=tala("teentaal", 80))
        return blk("M", 20, f"{title}: a composition from the raga card's practice steps, with a tabla loop.", read=[rd(f"Raga card: {title}", f"ragas/{name}.md", "Practice steps")], bench=tala("teentaal", 70))

    def song_M(m, d):
        if d == 4:
            if m >= 15:
                return blk("M", 20, "Module 4H, accompaniment (L34): accompany a singer (live or a recorded vocal) in a bhajan or film song; match their Sa; play only where nobody sings.",
                           read=[lesson(34)])
            return blk("M", 20, "Song by ear (song suggestions, Stage 2 then Stage 3), with the 12 steps.",
                       read=[rd("Song suggestions: Stage 3", "09-SONG-SUGGESTIONS.md", "Stage 3"), lesson(18)])
        if 12 <= m <= 14:
            return blk("M", 20, "Module 4C, keys and transposition (L26): play known melodies with Pa as Sa and with Ma as Sa; transpose a notation.", read=[lesson(26)])
        if m >= 15:
            return blk("M", 20, "Module 4H, style (L36) and performance (L35): a folk tune and a dhun in folk style; 3 mock performances before M9.", read=[lesson(36), lesson(35)])
        return blk("M", 20, "Song by ear: continue the current song; play along with the recording.", read=[lesson(18)])

    def creative_M(m):
        txt = "Composition and improvisation: EX-IMP Level 4 (raga-based) and composition prompts C2-C3 (L30)."
        if m >= 15:
            txt += " From month 15, EX-IMP Levels 5-6."
        return blk("M", 20, txt, read=[rd("EX-IMP Level 4", EX["IMP"], "Level 4:"), lesson(30)], bench=drone(), label="Creative")

    review = T.add("p4-review", [
        blk("T", 10, "Long tones in three octaves.", bench=drone()),
        blk("M", 15, "Spaced repertoire review: oldest items first.", label="Review"),
        blk("E", 10, "Listening.", read=[rd("Listening library", "08-LISTENING-LIBRARY.md", "How to listen")], label="Listening"),
        blk("R", 5, "Weekly reflection; a full rubric recording once a week.", read=[lesson(8, label="L08 rubric")]),
    ])
    ms = {18: "M8", 44: "M9"}
    run4 = {d: runs(range(1, 45), (lambda d: lambda k: (song_M(month4(k), d) if d <= 5 else creative_M(month4(k)))["text"] + K_block(month4(k))["text"])(d)) for d in (4, 5, 6)}
    for k in range(1, 45):
        w, m = 44 + k, month4(k)
        name, title, first = raga_at(k)
        mod = "4A" if m <= 12 else ("4F" if m >= 14 else "4E")
        doc = P4 + "#" + sec[mod]
        used = set()
        stage = f"{title}, week {k - next(a for nm, tt, a, b in RAGAS4 if nm == name) + 1} of 6" if name else "M9 preparation"
        for d in range(1, 8):
            n = n_of(w, d)
            if d == 7:
                if k in ms:
                    days.append(milestone_day(n, ms[k], 4, w, f"{ms[k]} test.", doc))
                else:
                    days.append(day(n, 4, w, "review", f"Review: {stage}", review, doc=doc))
                continue
            if d <= 3:
                M_, kind = raga_M(k, m, d), f"Raga day ({title})" if title else "Raga day (M9 preparation)"
            elif d <= 5:
                M_, kind = song_M(m, d), "Song and accompaniment day"
            else:
                M_, kind = creative_M(m), "Creative day"
            tid = T.add(f"p4-w{w}", [warmup(), T_block(m), K_block(m), M_, E_block(m), R(2, "Record and log.")])
            items = [raga_item(name, title)] if (first and d == 1) else None
            cands = block_parts(M_) + block_parts(K_block(m), E_block(m), T_block(m))
            dt = pick_title(cands, used, (d - 1) // 3 + (k % 2)) or kind
            if d <= 3 and name:
                wk = k - next(a for nm, tt, a, b in RAGAS4 if nm == name) + 1
                dt = staged(dt if title in dt else f"{title} - {dt}", (wk, 6))
            elif d >= 4:
                dt = staged(dt, run4[d][k])
            days.append(day(n, 4, w, "practice", dt, tid, items, doc))
    return days


# ----------------------------------------------------------------------------- Phase 5
def phase5(T):
    days = []
    mods = anchor(P5, "Modules")
    struct = anchor(P5, "Practice structure")
    month_raga = [("yaman", "Yaman"), ("bhairav", "Bhairav"), ("malkauns", "Malkauns")]
    themes = ["Raga depth", "Rhythm and speed", "Repertoire and collaboration", "Creation and review"]
    for j in range(1, 13):
        w = 88 + j
        mi, ti = (j - 1) // 4, (j - 1) % 4
        name, title = month_raga[mi]
        nota = raga_notation(name)
        if ti == 0:
            main = blk("M", 35, f"Module 5A: full raga presentation in {title}: alap and vilambit, building toward 20-30 minutes (L37)."
                       + (" Module 5B: an intonation-critical komal raga; teacher guidance strongly recommended." if mi > 0 else "")
                       + " Module 5C: contrast similar ragas (D12 pairs).",
                       read=[lesson(37)] + raga_read(name, title), bench=play(nota, 60), label="Raga depth")
        elif ti == 1:
            main = blk("M", 35, "Taans, layakari, tihais and gamak taans (L32, L33). Module 5D: vilambit laya with a slow ektaal or teentaal loop. Module 5E: map your 3rd-register fingerings (L22 4.4).",
                       read=[lesson(32), lesson(33), lesson(22, "4.4")], bench=tala("ektaal", 40), label="Rhythm and speed")
        elif ti == 2:
            main = blk("M", 35, "Songs and accompaniment. Module 5F: rehearse with a live tabla player or a duet partner; microphone work (L34, L35).",
                       read=[lesson(34), lesson(35)], bench=tala("teentaal", 80), label="Repertoire and collaboration")
        else:
            main = blk("M", 35, "Module 5G: original work (EX-IMP C5). Module 5H: design and run your own 4-week plan (L37). Recording project and monthly self-assessment: one full recording scored with the rubric, compared with last month's.",
                       read=[rd("EX-IMP C5", EX["IMP"], "C5:"), lesson(37)], record="Monthly full recording", label="Creation and review")
        tid = T.add(f"p5-w{w}", [
            warmup(),
            blk("T", 10, "Daily constant: long tones in three octaves.", bench=drone()),
            main,
            blk("E", 5, "Daily constant: one ear-training item (EX-EAR Levels 7-10).", read=[rd("EX-EAR Level map", EX["EAR"], "Level map")], bench=ear(6)),
            R(5),
        ])
        review = T.add("p5-review", [
            blk("T", 10, "Long tones in three octaves.", bench=drone()),
            blk("M", 15, "Spaced repertoire review.", label="Review"),
            blk("R", 10, "Weekly reflection. Quarterly: a performance. Yearly: re-read the knowledge tree and mark weak domains.", read=[rd("Phase 5 ongoing assessment", P5, "Ongoing assessment")]),
        ])
        doc = P5 + "#" + (struct if ti else mods)
        used = set()
        cands = parts(main["text"]) + ["Long tones in three octaves", "One ear-training item, EX-EAR Levels 7-10"]
        for d in range(1, 8):
            n = n_of(w, d)
            if d == 7 and j == 12:
                days.append(milestone_day(n, "M10", 5, w, "M10 portfolio check (can be retaken).", P5 + "#" + mods))
            elif d == 7:
                days.append(day(n, 5, w, "review", f"Review: {themes[ti].lower()} ({title} month)", review, doc=doc))
            else:
                items = [raga_item(name, title)] if (ti == 0 and d == 1 and name != "yaman") else None
                dt = pick_title(cands[:-2] if d <= len(cands) - 2 else cands, used, d - 1) or themes[ti]
                if title not in dt:
                    dt = clip(f"{title} - {dt}")
                days.append(day(n, 5, w, "practice", dt, tid, items, doc))
    return days
