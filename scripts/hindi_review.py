"""Hindi review sheet for a native speaker.

  python scripts/hindi_review.py                    writes hindi-review.csv (opens in Excel or Google Sheets)
  python scripts/hindi_review.py --apply file.csv   writes the "Corrected Hindi" column back

Columns: area, key, English, Hindi, Corrected Hindi, Comment. Only rows with a correction change
anything. Areas: ui (app/i18n/hi.json), phrase and step (scripts/voice/*.json, spoken; re-run
build_voice.py afterwards), lesson (app/i18n/lessons-hi.json).
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UI = ROOT / "app" / "i18n" / "hi.json"
PHRASES = ROOT / "scripts" / "voice" / "phrases.json"
STEPS = ROOT / "scripts" / "voice" / "steps.json"
LESSONS = ROOT / "app" / "i18n" / "lessons-hi.json"
OUT = ROOT / "hindi-review.csv"
HEAD = ["area", "key", "English", "Hindi", "Corrected Hindi", "Comment"]


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def save(p, data, indent):
    p.write_text(json.dumps(data, ensure_ascii=False, indent=indent), encoding="utf-8", newline="\n")


def rows():
    for en, hi in load(UI).items():
        if hi:
            yield ["ui", en, en, hi]
    for k, v in load(PHRASES).items():
        yield ["phrase", k, v["en"], v["hi"]]
    for k, v in load(STEPS).items():
        yield ["step", k, v["en"], v["hi"]]
    for path, entry in load(LESSONS).items():
        yield ["lesson-title", path, "", entry.get("title", "")]
        for heading, text in entry.get("sections", {}).items():
            yield ["lesson", path + " :: " + heading, "(see the English lesson)", text]


def write():
    with OUT.open("w", encoding="utf-8-sig", newline="") as f:  # the BOM lets Excel read Devanagari
        w = csv.writer(f)
        w.writerow(HEAD)
        n = 0
        for r in rows():
            w.writerow(r + ["", ""])
            n += 1
    print(f"wrote {OUT.name}: {n} rows. Fill in 'Corrected Hindi' only where a change is needed.")


def apply(path):
    ui, phrases, steps, lessons = load(UI), load(PHRASES), load(STEPS), load(LESSONS)
    changed = 0
    with open(path, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            new = (r.get("Corrected Hindi") or "").strip()
            if not new:
                continue
            area, key = r["area"], r["key"]
            if area == "ui" and key in ui:
                ui[key] = new
            elif area == "phrase" and key in phrases:
                phrases[key]["hi"] = new
            elif area == "step" and key in steps:
                steps[key]["hi"] = new
            elif area == "lesson-title" and key in lessons:
                lessons[key]["title"] = new
            elif area == "lesson" and " :: " in key:
                p, heading = key.split(" :: ", 1)
                if p in lessons and heading in lessons[p].get("sections", {}):
                    lessons[p]["sections"][heading] = new
                else:
                    continue
            else:
                continue
            changed += 1
    save(UI, ui, 0)
    save(PHRASES, phrases, 1)
    save(STEPS, steps, 1)
    save(LESSONS, lessons, 1)
    print(f"applied {changed} corrections. If phrases, steps or lessons changed, run python scripts/build_voice.py to remake their clips.")


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--apply":
        apply(sys.argv[2])
    else:
        write()
