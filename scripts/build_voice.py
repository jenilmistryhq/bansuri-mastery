"""Natural-voice clips for the app, made with Kokoro-82M (Apache 2.0) at build time.

Everything the app says that is known in advance is turned into short MP3 clips, so the learner
gets a natural human-sounding voice instantly and offline, with no model download:
  - phrases:  scripts/voice/phrases.json   (prompts and feedback, English and Hindi)
  - steps:    scripts/voice/steps.json     (every session step, as spoken English and Hindi)
  - notes:    every note name, and "Hold Sa.", "That is Sa.", "Next: Sa.", "Play Sa."
  - numbers:  "8 seconds." and plain numbers

Output: app/voice/<lang>/<hash>.mp3 and app/voice/<lang>/index.json. File names are a hash of
voice, speed and text, so an unchanged clip is never regenerated and old clips can be cached
forever by the service worker.

Usage:
  python scripts/build_voice.py            generate missing clips (needs kokoro-onnx, lameenc and
                                           the model: KOKORO_DIR with kokoro-v1.0.onnx, voices-v1.0.bin)
  python scripts/build_voice.py --check    CI: every clip the inputs need exists (no model needed)
"""
import hashlib
import re
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "voice"
OUT = ROOT / "app" / "voice"
VOICES = {"en": ("af_heart", 0.92, "en-us"), "hi": ("hf_alpha", 0.9, "hi")}

NOTE_EN = {0: "Sa", 1: "komal Re", 2: "Re", 3: "komal Ga", 4: "Ga", 5: "Ma", 6: "tivra Ma", 7: "Pa", 8: "komal Dha", 9: "Dha", 10: "komal Ni", 11: "Ni"}
NOTE_HI = {0: "सा", 1: "कोमल रे", 2: "रे", 3: "कोमल ग", 4: "ग", 5: "म", 6: "तीव्र म", 7: "प", 8: "कोमल ध", 9: "ध", 10: "कोमल नि", 11: "नि"}
NOTE_RANGE = range(-12, 25)
TEMPLATES = {
    "en": {"name": "{n}.", "hold": "Hold {n}.", "is": "That is {n}.", "next": "Next: {n}.", "play": "Play {n}."},
    "hi": {"name": "{n}।", "hold": "{n} को रोकिए।", "is": "यह {n} है।", "next": "अगला स्वर: {n}।", "play": "{n} बजाइए।"},
}
NUMS = {"en": ("{n}.", "{n} seconds."), "hi": ("{n}।", "{n} सेकंड।")}


def note_name(semi, lang):
    base = (NOTE_EN if lang == "en" else NOTE_HI)[semi % 12]
    octv = semi // 12
    if lang == "en":
        return {-1: "lower ", 0: "", 1: "upper ", 2: "very high "}[octv] + base
    return {-1: "मंद्र ", 0: "", 1: "तार ", 2: "अति तार "}[octv] + base


def items(lang):
    """Every (kind, key, text) the app needs for one language."""
    phrases = json.loads((SRC / "phrases.json").read_text(encoding="utf-8"))
    steps = json.loads((SRC / "steps.json").read_text(encoding="utf-8"))
    out = []
    for k, v in phrases.items():
        if v.get(lang):
            out.append(("phrases", k, v[lang]))
    for k, v in steps.items():
        if v.get(lang):
            out.append(("steps", k, v[lang]))
    for s in NOTE_RANGE:
        for kind, tpl in TEMPLATES[lang].items():
            out.append(("notes", f"{s}:{kind}", tpl.format(n=note_name(s, lang))))
    plain, secs = NUMS[lang]
    for n in range(0, 101):
        out.append(("nums", str(n), plain.format(n=n)))
    for n in range(1, 61):
        out.append(("secs", str(n), secs.format(n=n)))
    # Hindi: each lesson's "simple explanation", spoken (the lesson cards' "In short").
    if lang == "hi":
        lessons = json.loads((ROOT / "app" / "i18n" / "lessons-hi.json").read_text(encoding="utf-8"))
        for path, entry in sorted(lessons.items()):
            for heading, text in entry.get("sections", {}).items():
                if re.search(r"simple explanation", heading, re.I):
                    out.append(("lessons", path, speakable(text)))
    return out


def speakable(md):
    """Markdown to plain text for the voice: no tables, code blocks, links or emphasis marks."""
    lines, fence = [], False
    for line in md.splitlines():
        if line.strip().startswith("```"):
            fence = not fence
            continue
        if fence or line.strip().startswith("|") or line.strip().startswith("<"):
            continue
        line = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", line)
        line = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", line)
        line = re.sub(r"[*_`#>]", "", line).strip()
        line = re.sub(r"\s?\((?:तथ्य|सुझाव)[^)]{0,40}\)", "", line)
        if line.startswith("- "):
            line = line[2:]
        if line:
            lines.append(line if re.search(r"[.!?।:]$", line) else line + "।")
    return " ".join(lines)


def clip_name(lang, text):
    voice, speed, _ = VOICES[lang]
    return hashlib.sha1(f"kokoro-82m-v1.0|{voice}|{speed}|{text}".encode("utf-8")).hexdigest()[:14] + ".mp3"


def index_for(lang):
    idx = {"voice": VOICES[lang][0], "phrases": {}, "steps": {}, "notes": {}, "nums": {}, "secs": {}, "lessons": {}}
    for kind, key, text in items(lang):
        idx[kind][key] = [clip_name(lang, text), text]
    # The total size of the clips, shown in Settings before saving them for offline use.
    files = {v[0] for k in ("phrases", "steps", "notes", "nums", "secs", "lessons") for v in idx[k].values()}
    idx["bytes"] = sum((OUT / lang / f).stat().st_size for f in files if (OUT / lang / f).exists())
    return idx


def encode_mp3(samples, rate):
    import lameenc
    import numpy as np
    pad = np.zeros(int(rate * 0.06), dtype=np.float32)
    x = np.concatenate([pad, samples.astype(np.float32), pad])
    peak = float(np.max(np.abs(x))) or 1.0
    x = np.clip(x / peak * 0.89, -1, 1)  # about -1 dBFS
    enc = lameenc.Encoder()
    enc.set_bit_rate(40)
    enc.set_in_sample_rate(rate)
    enc.set_channels(1)
    enc.set_quality(2)
    return enc.encode((x * 32767).astype(np.int16).tobytes()) + enc.flush()


def plan_steps_missing():
    """Session steps in the plan that have no spoken version in steps.json."""
    plan = json.loads((ROOT / "app" / "data" / "plan.json").read_text(encoding="utf-8"))
    steps = json.loads((SRC / "steps.json").read_text(encoding="utf-8"))
    texts = {b.get("text", "") for src in (plan["days"], list(plan["templates"].values())) for d in src for b in d.get("blocks", [])}
    return sorted(t for t in texts if t and not (steps.get(t) or {}).get("en") or t and not (steps.get(t) or {}).get("hi"))


def main():
    check = "--check" in sys.argv
    problems = []
    missing_steps = plan_steps_missing()
    if missing_steps:
        problems.append(f"{len(missing_steps)} plan steps have no spoken English and Hindi in scripts/voice/steps.json, e.g. {missing_steps[0][:80]!r}")
    for lang in VOICES:
        d = OUT / lang
        idx = index_for(lang)
        need = {f for kind in ("phrases", "steps", "notes", "nums", "secs", "lessons") for f, _ in idx[kind].values()}
        texts = {f: t for kind in ("phrases", "steps", "notes", "nums", "secs", "lessons") for f, t in idx[kind].values()}
        if check:
            missing = [f for f in need if not (d / f).exists()]
            if missing:
                problems.append(f"{lang}: {len(missing)} clips missing (run python scripts/build_voice.py)")
            saved = d / "index.json"
            if not saved.exists() or json.loads(saved.read_text(encoding="utf-8")) != idx:
                problems.append(f"{lang}: index.json out of date (run python scripts/build_voice.py)")
            continue
        d.mkdir(parents=True, exist_ok=True)
        todo = [f for f in need if not (d / f).exists()]
        if todo:
            from kokoro_onnx import Kokoro
            mdir = Path(os.environ.get("KOKORO_DIR", "."))
            k = Kokoro(str(mdir / "kokoro-v1.0.onnx"), str(mdir / "voices-v1.0.bin"))
            voice, speed, code = VOICES[lang]
            for i, f in enumerate(sorted(todo)):
                samples, rate = k.create(texts[f], voice=voice, speed=speed, lang=code)
                (d / f).write_bytes(encode_mp3(samples, rate))
                if i % 25 == 0:
                    print(f"{lang}: {i + 1}/{len(todo)}", flush=True)
        idx = index_for(lang)  # again, now that every clip exists (the size total counts them)
        for old in d.glob("*.mp3"):
            if old.name not in need:
                old.unlink()
        (d / "index.json").write_text(json.dumps(idx, ensure_ascii=False, separators=(",", ":")), encoding="utf-8", newline="\n")
        size = sum(p.stat().st_size for p in d.glob("*.mp3"))
        print(f"{lang}: {len(need)} clips, {size / 1e6:.1f} MB")
    if problems:
        print("VOICE CLIPS:\n  " + "\n  ".join(problems))
        sys.exit(1)
    if check:
        print("voice clips up to date")


if __name__ == "__main__":
    main()
