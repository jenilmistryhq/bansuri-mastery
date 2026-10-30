"""Validate the curriculum: internal links and anchors, banned typography, objective IDs,
and that every lesson appears in a phase roadmap. Exits 1 if anything fails.

Usage: python scripts/validate.py [path-to-bansuri-mastery]
"""
import os, re, sys
from collections import defaultdict

root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bansuri-mastery"))
md_files = []
for d, _, fs in os.walk(root):
    for f in fs:
        if f.endswith(".md"):
            md_files.append(os.path.join(d, f))

def slug(h):
    h = h.strip().lower()
    h = re.sub(r"<[^>]+>", "", h)
    h = re.sub(r"[`*_\[\]()]", lambda m: "" if m.group(0) != "_" else "_", h)
    out = []
    for ch in h:
        if ch.isalnum() or ch in "-_ ":
            out.append(ch)
    return "".join(out).replace(" ", "-")

anchors = {}
texts = {}
for p in md_files:
    t = open(p, encoding="utf-8").read()
    texts[p] = t
    s = set()
    counts = defaultdict(int)
    in_code = False
    for line in t.splitlines():
        if line.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            base = slug(m.group(2))
            n = counts[base]
            s.add(base if n == 0 else f"{base}-{n}")
            counts[base] += 1
    anchors[p] = s

bad_links, bad_anchor = [], []
link_re = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
for p, t in texts.items():
    # strip code fences
    body = re.sub(r"```.*?```", "", t, flags=re.S)
    for m in link_re.finditer(body):
        target = m.group(1)
        if target.startswith(("http://", "https://", "mailto:")):
            continue
        path, _, frag = target.partition("#")
        if path == "":
            tp = p
        else:
            tp = os.path.normpath(os.path.join(os.path.dirname(p), path))
        rel = os.path.relpath(p, root)
        if not os.path.exists(tp):
            bad_links.append((rel, target))
            continue
        if frag and tp.endswith(".md") and frag not in anchors.get(tp, set()):
            bad_anchor.append((rel, target))

# banned characters
banned = {"\u2014": "em dash", "\u2013": "en dash", "\u2018": "curly quote", "\u2019": "curly quote",
          "\u201c": "curly quote", "\u201d": "curly quote", "\u2026": "ellipsis"}
char_hits = defaultdict(int)
for p, t in texts.items():
    for ch, name in banned.items():
        c = t.count(ch)
        if c:
            char_hits[(os.path.relpath(p, root), name)] += c

# objective IDs
kt_ids = {}
for p, t in texts.items():
    if os.sep + "knowledge-tree" + os.sep in p:
        for m in re.finditer(r"^\| ([A-Z]{3}-\d{2}) \|", t, flags=re.M):
            kt_ids[m.group(1)] = os.path.relpath(p, root)
prefixes = set(i[:3] for i in kt_ids)

def expand(t):
    ids = set(re.findall(r"\b([A-Z]{3}-\d{2})\b", t))
    for m in re.finditer(r"\b([A-Z]{3})-(\d{2})\s*(?:\.\.|to)\s*(?:[A-Z]{3}-)?(\d{2})\b", t):
        a, b = int(m.group(2)), int(m.group(3))
        for i in range(a, b + 1):
            ids.add(f"{m.group(1)}-{i:02d}")
    return ids

unknown = defaultdict(set)
lesson_ids = defaultdict(set)
for p, t in texts.items():
    rel = os.path.relpath(p, root)
    for i in expand(t):
        if i[:3] in prefixes and i not in kt_ids:
            unknown[i].add(rel)
        if rel.startswith("lessons") or rel.startswith("ragas") or rel.startswith("exercises") or rel.startswith("projects"):
            lesson_ids[i].add(rel)

untaught = sorted(i for i in kt_ids if i not in lesson_ids)

# lesson coverage in phases
lesson_files = sorted(f[:-3] for f in os.listdir(os.path.join(root, "lessons")) if f.endswith(".md") and f != "README.md")
phase_text = "".join(texts[p] for p in texts if os.sep + "phases" + os.sep in p)
not_in_phases = [l for l in lesson_files if l not in phase_text]

print("FILES:", len(md_files))
print("BROKEN FILE LINKS:", len(bad_links))
for x in bad_links: print("  ", x)
print("BROKEN ANCHORS:", len(bad_anchor))
for x in bad_anchor: print("  ", x)
print("BANNED CHARS:", sum(char_hits.values()))
for k, v in sorted(char_hits.items()): print("  ", k, v)
print("UNKNOWN IDS:", len(unknown))
for k, v in sorted(unknown.items()): print("  ", k, sorted(v)[:4])
print("OBJECTIVES:", len(kt_ids), "NOT REFERENCED IN lessons/ragas/exercises/projects:", untaught)
print("LESSONS:", len(lesson_files), "NOT IN PHASE ROADMAPS:", not_in_phases)

# Objectives taught only in troubleshooting guides count as covered.
ts_text = "".join(texts[p] for p in texts if os.sep + "troubleshooting" + os.sep in p)
untaught_anywhere = [i for i in untaught if i not in expand(ts_text) and i not in ts_text]
failed = bad_links or bad_anchor or char_hits or unknown or not_in_phases or untaught_anywhere
print("RESULT:", "FAIL" if failed else "OK")
sys.exit(1 if failed else 0)
