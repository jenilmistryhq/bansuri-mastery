"""Raga grammar checker: every notation on a raga card (and in the Bhupali and Yaman lessons) must
use only the raga's notes. Ascent and descent rules are reported as warnings, since real phrases
bend them (vakra movement), but a note the raga leaves out is an error.

The raga's notes come from the card itself: the Aroh and Avroh rows (all notations in each cell, so
"often taught as ..." variants count) and the Notes row.
Usage: python scripts/raga_lint.py [--strict]   (--strict also fails on ascent/descent warnings)
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAGAS = os.path.join(ROOT, "bansuri-mastery", "ragas")
LESSONS = {"bhupali.md": "lessons/L20-raga-bhupali.md", "yaman.md": "lessons/L21-raga-yaman.md"}
SEMI = {"S": 0, "r": 1, "R": 2, "g": 3, "G": 4, "m": 5, "M": 6, "P": 7, "d": 8, "D": 9, "n": 10, "N": 11}
NAMES = {v: k for k, v in SEMI.items()}
NOTE = re.compile(r"(\.*)([SrRgGmMPdDnN])('*)")


def notes(text):
    """Semitones of every note in a notation string (octave marks applied)."""
    out = []
    for tok in text.split():
        if not re.fullmatch(r"[.SrRgGmMPdDnN'\-_{}~()^,|]+", tok):
            return None  # not notation
        for m in NOTE.finditer(tok):
            out.append(SEMI[m.group(2)] + 12 * (len(m.group(3)) - len(m.group(1))))
    return out


def row(md, label):
    m = re.search(r"^\|\s*" + label + r"[^|]*\|\s*(.+?)\s*\|\s*$", md, re.M)
    return m.group(1) if m else ""


def pcs(semis):
    return {s % 12 for s in semis}


def raga_rules(md):
    aroh, avroh = set(), set()
    for cell, target in ((row(md, "Aroh"), aroh), (row(md, "Avroh"), avroh)):
        for code in re.findall(r"`([^`]+)`", cell):
            n = notes(code)
            if n:
                target |= pcs(n)
    notes_row = row(md, "Notes") or row(md, "Core notes")  # Pahadi's card says "Core notes"
    listed = {SEMI[l] for l in re.findall(r"\b([SrRgGmMPdDnN])\b", notes_row.split("(")[0].replace("`", " "))}
    for code in re.findall(r"`([^`]+)`", notes_row + " " + row(md, "Typical movement")):
        n = notes(code)
        if n:
            listed |= pcs(n)
    allowed = aroh | avroh | listed
    return allowed, aroh or allowed, avroh or allowed


def notations(md):
    """(line, text) of every notation: code blocks and inline code."""
    out, in_block, block, start = [], False, [], 0
    for i, line in enumerate(md.splitlines(), 1):
        if line.startswith("```"):
            if in_block:
                out.append((start, " ".join(block)))
                block = []
            else:
                start = i + 1
            in_block = not in_block
            continue
        if in_block:
            block.append(line)
        elif "raga-lint: other raga" not in line:  # a line about a different raga (marked in the file)
            for code in re.findall(r"`([^`]+)`", line):
                out.append((i, code))
    return out


def check(path, rules, name):
    allowed, aroh, avroh = rules
    errors, warnings = [], []
    md = open(path, encoding="utf-8").read()
    for line, text in notations(md):
        n = notes(text)
        if not n or len(n) < 2:
            continue
        foreign = sorted(pcs(n) - allowed)
        if foreign:
            errors.append((line, text, "uses " + " ".join(NAMES[p] for p in foreign) + ", which " + name + " leaves out"))
            continue
        for a, b in zip(n, n[1:]):
            if b > a and b % 12 not in aroh:
                warnings.append((line, text, "ascends to " + NAMES[b % 12] + ", which is not in the aroh"))
                break
            if b < a and b % 12 not in avroh:
                warnings.append((line, text, "descends to " + NAMES[b % 12] + ", which is not in the avroh"))
                break
    return errors, warnings


def main():
    strict = "--strict" in sys.argv
    total_e = total_w = 0
    for f in sorted(os.listdir(RAGAS)):
        if not f.endswith(".md") or f == "README.md":
            continue
        md = open(os.path.join(RAGAS, f), encoding="utf-8").read()
        name = (re.search(r"^# (?:Raga )?(.+)$", md, re.M) or [None, f])[1].strip()
        rules = raga_rules(md)
        if not rules[0]:
            print(f"{f}: no notes found on the card (Aroh/Avroh/Notes rows)")
            continue
        for rel in [os.path.join("ragas", f)] + ([LESSONS[f]] if f in LESSONS else []):
            errs, warns = check(os.path.join(ROOT, "bansuri-mastery", rel), rules, name)
            for line, text, why in errs:
                print(f"ERROR {rel}:{line} `{text[:60]}` {why}")
            for line, text, why in warns:
                print(f"warn  {rel}:{line} `{text[:60]}` {why}")
            total_e += len(errs); total_w += len(warns)
    print(f"RAGA GRAMMAR: {total_e} errors, {total_w} warnings")
    sys.exit(1 if total_e or (strict and total_w) else 0)


if __name__ == "__main__":
    main()
