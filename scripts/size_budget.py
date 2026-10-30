"""Size budget for the published site, checked in CI.

GitHub Pages serves the site from the repository's files (Git LFS files are not served), so large
assets live in the repository. To keep clones, deploys and history manageable:
  - no single file over 25 MB,
  - voice clips (app/voice) under 60 MB in all,
  - the whole published site (app, bansuri-mastery, root files) under 150 MB.
Voice clips are named by a hash of their text, so unchanged clips never change in the history.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MB = 1e6
LIMITS = {"file": 25 * MB, "voice": 60 * MB, "site": 150 * MB}


def size(p):
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file()) if p.is_dir() else p.stat().st_size


def main():
    problems = []
    site = [ROOT / "app", ROOT / "bansuri-mastery", ROOT / "index.html", ROOT / "sw.js", ROOT / "manifest.webmanifest"]
    for base in site:
        for f in (base.rglob("*") if base.is_dir() else [base]):
            if f.is_file() and f.stat().st_size > LIMITS["file"]:
                problems.append(f"{f.relative_to(ROOT)} is {f.stat().st_size / MB:.1f} MB (limit 25 MB)")
    voice, total = size(ROOT / "app" / "voice"), sum(size(p) for p in site)
    if voice > LIMITS["voice"]:
        problems.append(f"voice clips are {voice / MB:.1f} MB (limit 60 MB)")
    if total > LIMITS["site"]:
        problems.append(f"the site is {total / MB:.1f} MB (limit 150 MB)")
    biggest = sorted(((size(p), p.name) for p in (ROOT / "app").iterdir() if p.is_dir()), reverse=True)[:4]
    print("site " + f"{total / MB:.1f} MB; voice {voice / MB:.1f} MB; largest app folders: " + ", ".join(f"{n} {s / MB:.1f} MB" for s, n in biggest))
    if problems:
        print("SIZE BUDGET:\n  " + "\n  ".join(problems))
        sys.exit(1)


if __name__ == "__main__":
    main()
