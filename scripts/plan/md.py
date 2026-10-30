"""Read facts out of the curriculum Markdown so the plan copies them exactly.

Everything here reads files under bansuri-mastery/ and never invents content:
- heading slugs (GitHub style) for link validation,
- melody notation from EX-MEL code blocks,
- alankar notation from the L12 and EX-ALK tables,
- raga aroh / avroh / pakad from the raga cards,
- titles from each file's H1.
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOCS = os.path.join(ROOT, "bansuri-mastery")

_cache = {}


def read(path):
    if path not in _cache:
        with open(os.path.join(DOCS, path), encoding="utf-8") as fh:
            _cache[path] = fh.read()
    return _cache[path]


def exists(path):
    return os.path.isfile(os.path.join(DOCS, path))


def slug(text):
    """GitHub-style heading slug (matches pymdownx.slugs.slugify(case='lower'))."""
    text = re.sub(r"<[^>]+>", "", text.strip().lower())
    text = text.replace("`", "")
    out = [ch for ch in text if ch.isalnum() or ch in "-_ "]
    return "".join(out).replace(" ", "-")


def headings(path):
    """[(level, text, slug)] for a Markdown file, skipping fenced code."""
    key = ("h", path)
    if key in _cache:
        return _cache[key]
    res, counts, incode = [], {}, False
    for line in read(path).split("\n"):
        if line.startswith("```"):
            incode = not incode
            continue
        if incode:
            continue
        m = re.match(r"^(#{1,6})\s+(.*?)\s*#*\s*$", line)
        if m:
            base = slug(m.group(2))
            n = counts.get(base, 0)
            counts[base] = n + 1
            res.append((len(m.group(1)), m.group(2), base if n == 0 else f"{base}-{n}"))
    _cache[key] = res
    return res


def anchor(path, prefix):
    """Slug of the first heading whose text starts with `prefix` (case-insensitive)."""
    for _, text, s in headings(path):
        if text.lower().startswith(prefix.lower()):
            return s
    raise KeyError(f"no heading starting with {prefix!r} in {path}")


def h1_title(path, strip=None):
    for line in read(path).split("\n"):
        if line.startswith("# "):
            t = line[2:].strip()
            if strip:
                t = re.sub(strip, "", t).strip()
            return t
    raise KeyError(f"no H1 in {path}")


def _cell_code(cell):
    """Notation inside a table cell: `...` or <code>...</code>, with &#124; restored to |."""
    m = re.search(r"<code>(.*?)</code>", cell) or re.search(r"`([^`]*)`", cell)
    if not m:
        return None
    return m.group(1).replace("&#124;", "|").replace("&lt;", "<").replace("&gt;", ">").strip()


def _section(path, prefix):
    """Lines of the section that starts with a heading beginning with `prefix`."""
    lines = read(path).split("\n")
    start, level = None, None
    for i, line in enumerate(lines):
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if not m:
            continue
        if start is None and m.group(2).lower().startswith(prefix.lower()):
            start, level = i, len(m.group(1))
        elif start is not None and len(m.group(1)) <= level:
            return lines[start + 1:i]
    if start is None:
        raise KeyError(f"no section {prefix!r} in {path}")
    return lines[start + 1:]


def alankars(path, prefix):
    """{number: 'aroh || avroh'} from an alankar table (last two cells are aroh and avroh)."""
    out = {}
    for line in _section(path, prefix):
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if not cells or not cells[0].isdigit():
            continue
        aroh, avroh = _cell_code(cells[-2]), _cell_code(cells[-1])
        if aroh and avroh:
            out[int(cells[0])] = f"{aroh} || {avroh} ||"
    if not out:
        raise KeyError(f"no alankar rows under {prefix!r} in {path}")
    return out


def warmups(path="exercises/EX-ALK-alankar-book.md"):
    out = {}
    for line in _section(path, "Warm-ups before L12"):
        m = re.match(r"^\|\s*(W\d)\s*\|(.*)\|\s*$", line)
        if m:
            out[m.group(1)] = _cell_code(m.group(2)) + " ||"
    return out


def melodies(path="exercises/EX-MEL-practice-melodies.md"):
    """{'1.1': {'title', 'anchor', 'notation' or None}} from EX-MEL ### headings + first code block."""
    out, lines = {}, read(path).split("\n")
    heads = {s: t for _, t, s in headings(path)}
    i = 0
    while i < len(lines):
        m = re.match(r"^###\s+(\d+\.\d+b?)\s+(.*)$", lines[i])
        if not m:
            i += 1
            continue
        num, rest = m.group(1), m.group(2)
        title = re.split(r"\s*\(", rest)[0].strip().rstrip(",")
        notation, j = None, i + 1
        while j < len(lines) and not re.match(r"^#{1,3}\s", lines[j]):
            if lines[j].startswith("```"):
                k = j + 1
                block = []
                while k < len(lines) and not lines[k].startswith("```"):
                    block.append(lines[k])
                    k += 1
                notation = "\n".join(l.rstrip() for l in block).strip()
                break
            j += 1
        out[num] = {"title": title, "anchor": slug(lines[i].lstrip("#").strip()), "notation": notation}
        assert out[num]["anchor"] in heads, out[num]
        i += 1
    return out


def raga(name):
    """{'aroh','avroh','pakad'} (first code span of each row) from ragas/<name>.md; missing keys omitted."""
    out = {}
    for line in read(f"ragas/{name}.md").split("\n"):
        m = re.match(r"^\|\s*(Aroh|Avroh|Pakad[^|]*)\|(.*)\|\s*$", line)
        if m:
            key = m.group(1).strip().split()[0].lower()
            code = _cell_code(m.group(2))
            if code and key not in out:
                out[key] = code
    return out


def raga_notation(name):
    r = raga(name)
    parts = [r[k] for k in ("aroh", "avroh", "pakad") if k in r]
    return " || ".join(parts) + " ||" if parts else None
