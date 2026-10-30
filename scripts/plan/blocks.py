"""Small builders for plan blocks, read links and bench options (see ARCHITECTURE.md)."""
import os

from .md import DOCS, anchor, h1_title, exists

LABELS = {
    "W": "Warm-up",
    "T": "Tone and breath",
    "K": "Technique",
    "M": "Music",
    "E": "Ear, rhythm and theory",
    "R": "Record and log",
    "READ": "Read",
    "TEST": "Milestone test",
}

_LESSONS = sorted(f for f in os.listdir(os.path.join(DOCS, "lessons")) if f.startswith("L") and f.endswith(".md"))


def L(n):
    """Path of lesson n, e.g. L(4) -> 'lessons/L04-first-sound.md'."""
    pre = f"L{n:02d}-"
    for f in _LESSONS:
        if f.startswith(pre):
            return "lessons/" + f
    raise KeyError(pre)


def M(mid):
    """Path of a milestone file, e.g. M('M3')."""
    for f in os.listdir(os.path.join(DOCS, "projects")):
        if f.startswith(mid + "-") and f.endswith(".md"):
            return "projects/" + f
    raise KeyError(mid)


EX = {
    "ALK": "exercises/EX-ALK-alankar-book.md",
    "EAR": "exercises/EX-EAR-ear-training-system.md",
    "IMP": "exercises/EX-IMP-improv-and-composition-prompts.md",
    "MEL": "exercises/EX-MEL-practice-melodies.md",
    "NOT": "exercises/EX-NOT-notation-drills.md",
    "RHY": "exercises/EX-RHY-rhythm-drills.md",
    "THY": "exercises/EX-THY-theory-quizzes.md",
    "TON": "exercises/EX-TON-tone-and-breath-drills.md",
}


def rd(label, path, heading=None):
    """A read link. `heading` is the start of a heading's text; its slug becomes the anchor."""
    assert exists(path), path
    link = {"label": label, "path": path}
    if heading:
        link["anchor"] = anchor(path, heading)
    return link


def lesson(n, heading=None, label=None):
    path = L(n)
    title = h1_title(path)
    return rd(label or title, path, heading)


def blk(bid, minutes, text, read=None, bench=None, record=None, label=None):
    b = {"id": bid, "label": label or LABELS[bid], "minutes": minutes, "text": text}
    if read:
        b["read"] = read
    if bench:
        b["bench"] = bench
    # An R block that asks the learner to record gets a recorder (PRF-01: record at least 3 times a week).
    if not record and bid == "R" and "record" in text.lower():
        record = "Today's recording"
    if record:
        b["record"] = record
    return b


# ----- bench options (subset of mountBench options) -----

def drone():
    return {"tab": "rhythm"}


def tala(name, bpm):
    return {"tab": "rhythm", "tala": name, "talaBpm": bpm}


def chart():
    return {"tab": "chart"}


def play(notation, bpm):
    assert notation, "empty notation"
    return {"tab": "play", "notation": notation, "bpm": bpm}


def check(plan):
    assert 0 <= plan <= 7
    return {"tab": "check", "checkPlan": plan}


def ear(level):
    assert str(level) in ("2", "3", "4", "6")
    return {"tab": "ear", "earLevel": str(level)}


def item(iid, label, bench=None, read=None):
    it = {"id": iid, "label": label}
    if bench:
        it["bench"] = bench
    if read:
        it["read"] = read
    return it


W_BLOCK = None


def warmup(minutes=5, text="Warm-up and tension scan (L01: shoulder rolls, wrist and finger stretches, low breathing)."):
    return blk("W", minutes, text, read=[lesson(1, label="L01 How to Practise")])
