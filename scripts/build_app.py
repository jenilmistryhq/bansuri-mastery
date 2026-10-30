"""Generate app/data/files.json (app assets + course pages with titles) and stamp sw.js with a
content hash, so the service worker re-caches whenever anything changes.

Usage: python scripts/build_app.py [--check]
With --check, exit 1 if files.json or the sw.js version is out of date.
"""
import hashlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app")
DOCS = os.path.join(ROOT, "bansuri-mastery")
FILES_JSON = os.path.join(APP, "data", "files.json")
SW = os.path.join(ROOT, "sw.js")
SKIP_SUFFIX = (".txt", ".md")  # licence texts stay in the repo but need not be cached


def posix(p):
    return p.replace(os.sep, "/")


def collect():
    assets, docs = [], []
    for d, _, files in os.walk(APP):
        for f in files:
            full = os.path.join(d, f)
            rel = posix(os.path.relpath(full, ROOT))
            if rel == "app/data/files.json" or f.endswith(SKIP_SUFFIX):
                continue
            # The pose model (about 19 MB) loads only when the posture check is opened; not part of the offline download.
            if rel.startswith("app/vendor/pose/"):
                continue
            assets.append(rel)
    for d, _, files in os.walk(DOCS):
        for f in files:
            # Course images (diagrams) are saved for offline use like the app's own files.
            if f.endswith((".svg", ".png", ".jpg", ".webp")):
                assets.append(posix(os.path.relpath(os.path.join(d, f), ROOT)))
                continue
            if not f.endswith(".md"):
                continue
            full = os.path.join(d, f)
            rel = posix(os.path.relpath(full, DOCS))
            title = rel
            with open(full, encoding="utf-8") as fh:
                for line in fh:
                    if line.startswith("# "):
                        title = line[2:].strip()
                        break
            docs.append({"path": rel, "title": title})
    assets.sort()
    docs.sort(key=lambda x: x["path"])
    return assets, docs


def version(assets, docs):
    h = hashlib.sha256()
    for rel in assets + ["index.html", "manifest.webmanifest"] + ["bansuri-mastery/" + d["path"] for d in docs]:
        with open(os.path.join(ROOT, rel), "rb") as fh:
            # Line endings are normalised, so a Windows checkout (CRLF) and CI (LF) get the same version.
            h.update(rel.encode() + b"\0" + fh.read().replace(b"\r\n", b"\n"))
    return h.hexdigest()[:12]


def main():
    assets, docs = collect()
    ver = version(assets, docs)
    files_text = json.dumps({"version": ver, "assets": assets, "docs": docs}, indent=1, ensure_ascii=False) + "\n"
    with open(SW, encoding="utf-8") as fh:
        sw = fh.read()
    new_sw = re.sub(r'const VERSION = "[^"]*";', f'const VERSION = "{ver}";', sw, count=1)
    old_files = open(FILES_JSON, encoding="utf-8").read() if os.path.exists(FILES_JSON) else ""
    stale = old_files != files_text or new_sw != sw
    if "--check" in sys.argv:
        if stale:
            print("app/data/files.json or sw.js is out of date: run python scripts/build_app.py")
            sys.exit(1)
        print("app files up to date (version " + ver + ")")
        return
    os.makedirs(os.path.dirname(FILES_JSON), exist_ok=True)
    with open(FILES_JSON, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(files_text)
    with open(SW, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(new_sw)
    print(f"files.json: {len(assets)} assets, {len(docs)} pages; sw.js version {ver}")


if __name__ == "__main__":
    main()
