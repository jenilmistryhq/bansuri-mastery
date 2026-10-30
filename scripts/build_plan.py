"""Generate app/data/plan.json: the day-by-day practice plan used by the app.

The plan is transcribed from bansuri-mastery/phases/*.md (Phase 0-1 day by day, Phases 2-5
expanded from their module schedules). Source data lives in scripts/plan/. Notation strings are
read from the curriculum files, never retyped. The build fails on any broken link or anchor,
duplicate block id, unknown bench option, or notation that uses a note before the lesson that
unlocks it.

Usage: python scripts/build_plan.py [--check]
With --check, exit 1 if app/data/plan.json is out of date instead of rewriting it.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from plan import later, phase01  # noqa: E402
from plan.blocks import L, M  # noqa: E402
from plan.md import DOCS, ROOT, exists, h1_title, headings  # noqa: E402

OUT = os.path.join(ROOT, "app", "data", "plan.json")
BLOCK_IDS = {"W", "T", "K", "M", "E", "R", "READ", "TEST"}
BENCH_KEYS = {"tab", "notation", "bpm", "preset", "tala", "talaBpm", "earLevel", "checkPlan", "compact"}
TABS = {"chart", "play", "rhythm", "check", "ear", "about"}
TALAS = {"teentaal", "keherwa", "dadra", "rupak", "jhaptaal", "ektaal"}

# Earliest practice day on which each note may appear in notation (unlock order of the lessons).
SEMI = {"S": 0, "r": 1, "R": 2, "g": 3, "G": 4, "m": 5, "M": 6, "P": 7, "d": 8, "D": 9, "n": 10, "N": 11}


def unlock_day(semi):
    if semi < -5:
        return None                      # below the flute
    pc = semi % 12
    komal = pc in (1, 3, 8, 10)
    if komal:
        return 309                       # L25 (Phase 4, module 4A)
    if semi >= 13:
        return 141                       # L22 taar saptak (Phase 3, week 21)
    if semi == 5:
        return 64                        # L16 shuddha Ma (Phase 2, week 10)
    if semi >= 6:
        return 43                        # L14 tivra Ma, madhya P D N, S' (Phase 2, week 7)
    if semi == -5:
        return 22                        # mandra Pa (Phase 1 day 22)
    if semi < 0:
        return 15                        # .N .D (L11)
    return 8                             # S R G (L09)


def notes_in(notation):
    """Semitones used by a notation string, with the same token rules as the bench parser."""
    out = []
    for raw in notation.split():
        if not re.fullmatch(r"[.SrRgGmMPdDnN'\-_{}~()^,|]+", raw):
            continue                     # words such as 'Line' or '1:' are ignored by the bench
        i = 0
        while i < len(raw):
            low = 0
            while i < len(raw) and raw[i] == ".":
                low += 1
                i += 1
            if i < len(raw) and raw[i] in SEMI:
                letter = raw[i]
                i += 1
                high = 0
                while i < len(raw) and raw[i] == "'":
                    high += 1
                    i += 1
                out.append(SEMI[letter] + 12 * (high - low))
            else:
                i += 1
    return out


def lesson_ids_from(blocks):
    ids = set()
    for b in blocks:
        for r in b.get("read", []):
            m = re.match(r"lessons/(L\d\d)-", r["path"])
            if m:
                ids.add(m.group(1))
    return ids


def build():
    T = later.Templates()
    days = phase01.build() + later.phase2(T) + later.phase3(T) + later.phase4(T) + later.phase5(T)
    for d in days:
        blocks = d.get("blocks") or T.by_id[d["template"]]["blocks"]
        d["minutes"] = sum(b["minutes"] for b in blocks)
        d["lessons"] = sorted(set(d.get("lessons", [])) | lesson_ids_from(blocks))
    lessons = {}
    for f in sorted(os.listdir(os.path.join(DOCS, "lessons"))):
        m = re.match(r"(L\d\d)-.*\.md$", f)
        if m:
            path = "lessons/" + f
            lessons[m.group(1)] = {"title": h1_title(path, r"^L\d\d\s*-\s*"), "path": path}
    milestones = []
    for d in days:
        if d.get("milestone"):
            path = M(d["milestone"])
            milestones.append({"id": d["milestone"], "title": h1_title(path, r"^M\d+\s*-\s*"), "path": path, "day": d["n"]})
    phases = []
    for p in range(6):
        doc = next(f for f in sorted(os.listdir(os.path.join(DOCS, "phases"))) if f.startswith(f"phase-{p}-"))
        title = h1_title("phases/" + doc, r"^Phase \d+\s*-\s*")
        title = re.sub(r"\s*\(.*\)\s*$", "", title)
        title = re.sub(r"^Day 0:\s*", "", title)
        first = min(d["n"] for d in days if d["phase"] == p)
        phases.append({"id": p, "title": title, "doc": "phases/" + doc, "firstDay": first})
    p5 = [d["n"] for d in days if d["phase"] == 5 and d.get("kind") != "milestone"]
    plan = {
        "version": 1,
        "phases": phases,
        "lessons": lessons,
        "milestones": milestones,
        "templates": T.by_id,
        "days": days,
        "cycle": {"from": min(p5), "to": max(p5)},
    }
    return plan


def validate(plan):
    errs = []
    slugs = {}

    def check_link(path, anchor, where):
        if not exists(path):
            errs.append(f"{where}: missing file {path}")
            return
        if anchor:
            if path not in slugs:
                slugs[path] = {s for _, _, s in headings(path)}
            if anchor not in slugs[path]:
                errs.append(f"{where}: no anchor #{anchor} in {path}")

    def check_bench(b, where, day_n):
        bad = set(b) - BENCH_KEYS
        if bad:
            errs.append(f"{where}: unknown bench keys {bad}")
        if b.get("tab") not in TABS:
            errs.append(f"{where}: bad tab {b.get('tab')}")
        if "tala" in b and b["tala"] not in TALAS:
            errs.append(f"{where}: bad tala {b['tala']}")
        if "notation" in b:
            for s in notes_in(b["notation"]):
                u = unlock_day(s)
                if u is None or u > day_n:
                    errs.append(f"{where}: note {s} used on day {day_n} but unlocked on day {u}")

    def check_blocks(blocks, where, day_n):
        ids = [b["id"] for b in blocks]
        if len(ids) != len(set(ids)):
            errs.append(f"{where}: duplicate block ids {ids}")
        for b in blocks:
            w = f"{where} block {b['id']}"
            if b["id"] not in BLOCK_IDS:
                errs.append(f"{w}: bad id")
            for k in ("label", "minutes", "text"):
                if k not in b:
                    errs.append(f"{w}: missing {k}")
            for r in b.get("read", []):
                check_link(r["path"], r.get("anchor"), w)
            if "bench" in b:
                check_bench(b["bench"], w, day_n)

    for i, d in enumerate(plan["days"]):
        where = f"day {d['n']}"
        if d["n"] != i:
            errs.append(f"{where}: days not contiguous (index {i})")
        if d["kind"] not in ("setup", "practice", "review", "milestone"):
            errs.append(f"{where}: bad kind")
        blocks = d.get("blocks")
        if blocks is None:
            if d.get("template") not in plan["templates"]:
                errs.append(f"{where}: missing template {d.get('template')}")
                continue
            blocks = plan["templates"][d["template"]]["blocks"]
        check_blocks(blocks, where, d["n"])
        for it in d.get("newItems", []):
            if "bench" in it:
                check_bench(it["bench"], f"{where} item {it['id']}", d["n"])
            if "read" in it:
                check_link(it["read"]["path"], it["read"].get("anchor"), f"{where} item {it['id']}")
        if "doc" in d:
            p, _, a = d["doc"].partition("#")
            check_link(p, a or None, f"{where} doc")
        if d["kind"] == "practice" and not 25 <= d["minutes"] <= 75:
            errs.append(f"{where}: {d['minutes']} minutes")
        for text in [d.get("title", ""), d.get("pass", "")] + [b["text"] for b in blocks]:
            if re.search("[\u2013\u2014\u2018\u2019\u201c\u201d\u2026]", text):
                errs.append(f"{where}: non-ASCII punctuation in {text[:40]!r}")
    ids = [m["id"] for m in plan["milestones"]]
    if ids != [f"M{i}" for i in range(11)]:
        errs.append(f"milestones are {ids}")
    ids_seen = {}
    for d in plan["days"]:
        for it in d.get("newItems", []):
            if it["id"] in ids_seen:
                errs.append(f"item {it['id']} introduced twice (days {ids_seen[it['id']]} and {d['n']})")
            ids_seen[it["id"]] = d["n"]
    if len(plan["lessons"]) != 38:
        errs.append(f"{len(plan['lessons'])} lessons")
    c = plan["cycle"]
    if not (0 < c["from"] < c["to"] < len(plan["days"])):
        errs.append(f"bad cycle {c}")
    return errs


def main():
    plan = build()
    errs = validate(plan)
    if errs:
        print("PLAN INVALID:")
        for e in errs[:60]:
            print("  " + e)
        if len(errs) > 60:
            print(f"  ... and {len(errs) - 60} more")
        sys.exit(1)
    text = json.dumps(plan, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n"
    per_phase = {}
    for d in plan["days"]:
        per_phase[d["phase"]] = per_phase.get(d["phase"], 0) + 1
    summary = (f"days per phase {per_phase}, total {len(plan['days'])}, "
               f"milestones {[(m['id'], m['day']) for m in plan['milestones']]}, "
               f"templates {len(plan['templates'])}, size {len(text.encode('utf-8')) // 1024} KB")
    old = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
    if "--check" in sys.argv:
        if old != text:
            print("app/data/plan.json is out of date: run python scripts/build_plan.py")
            sys.exit(1)
        print("plan up to date: " + summary)
        return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    print("wrote app/data/plan.json: " + summary)


if __name__ == "__main__":
    main()
