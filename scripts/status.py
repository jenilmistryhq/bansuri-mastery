"""Project status at a glance: python scripts/status.py writes STATUS.md (and prints it)."""
import json
import re
import subprocess
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def j(p):
    return json.loads((ROOT / p).read_text(encoding="utf-8"))


def mb(p):
    return sum(f.stat().st_size for f in (ROOT / p).rglob("*") if f.is_file()) / 1e6


def main():
    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    version = (re.search(r'VERSION = "([^"]+)"', sw) or [None, "?"])[1]
    plan = j("app/data/plan.json")
    ui = j("app/i18n/hi.json")
    lessons_hi = j("app/i18n/lessons-hi.json")
    lesson_files = sorted((ROOT / "bansuri-mastery" / "lessons").glob("L??-*.md"))
    claims = (ROOT / "TEACHER-REVIEW-CLAIMS.md").read_text(encoding="utf-8")
    n_claims = (re.search(r"marks \*\*(\d+)\*\*", claims) or [None, "?"])[1]
    launch = (ROOT / "LAUNCH.md").read_text(encoding="utf-8")
    open_items = re.findall(r"^- \[ \] (.+)$", launch, re.M)
    done_items = len(re.findall(r"^- \[x\] ", launch, re.M | re.I))
    try:
        commit = subprocess.run(["git", "log", "-1", "--format=%h %s"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    except OSError:
        commit = "?"
    lines = [
        f"# Status ({date.today().isoformat()})", "",
        f"- App version `{version}`; last commit: {commit}",
        f"- Course: {len(plan['days'])} days, {len(plan['milestones'])} milestones, {len(lesson_files)} lessons",
        f"- Hindi interface: {sum(1 for v in ui.values() if v)} of {len(ui)} strings translated",
        f"- Hindi lessons: {len(lessons_hi)} of {len(lesson_files)} lessons, {sum(len(v.get('sections', {})) for v in lessons_hi.values())} sections",
        f"- Voice clips: English {mb('app/voice/en'):.1f} MB, Hindi {mb('app/voice/hi'):.1f} MB; whole app {mb('app'):.1f} MB",
        f"- Claims for a teacher to review: {n_claims} (TEACHER-REVIEW-CLAIMS.md)",
        f"- Launch checklist: {done_items} done, {len(open_items)} open (LAUNCH.md)", "",
        "## Still open before launch", "",
    ] + [f"- {x}" for x in open_items] + ["", "Checks: run `npm test`, `node tests/webkit.mjs`, `python scripts/validate.py` and the other checks in TESTING.md."]
    text = "\n".join(lines) + "\n"
    (ROOT / "STATUS.md").write_text(text, encoding="utf-8", newline="\n")
    print(text)


if __name__ == "__main__":
    main()
