"""Check every external link in the course for link rot.

YouTube links are checked through YouTube's oEmbed service (which returns 404 for removed or
private videos). Other links get a GET request. Exit code 1 if any link is broken
(404/410, 5xx after a retry, or unreachable). Sites that block automated checks (401/403/406/429)
are reported as warnings, not failures.

Usage: python scripts/check_links.py [--quiet]
"""
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "bansuri-mastery")
URL_RE = re.compile(r"https?://[^\s)\]>\"'`|]+")
SKIP = ("https://jenilmistryhq.github.io", "http://localhost", "http://127.0.0.1", "https://github.com/jenilmistryhq/bansuri-mastery")
UA = "Mozilla/5.0 (compatible; bansuri-mastery-link-check/1.0)"


def collect():
    urls = {}
    for d, _, files in os.walk(DOCS):
        for f in files:
            if not f.endswith(".md"):
                continue
            path = os.path.join(d, f)
            with open(path, encoding="utf-8") as fh:
                for n, line in enumerate(fh, 1):
                    for u in URL_RE.findall(line):
                        u = u.rstrip(".,;:")
                        if u.startswith(SKIP):
                            continue
                        urls.setdefault(u, []).append(f"{os.path.relpath(path, ROOT)}:{n}")
    return urls


def fetch(url):
    target = url
    if re.match(r"https?://(www\.)?youtube\.com/(watch|playlist)", url):
        target = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(url, safe="")
    req = urllib.request.Request(target, headers={"User-Agent": UA, "Accept": "*/*"})
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.status
        except urllib.error.HTTPError as e:
            if e.code >= 500 and attempt == 0:
                time.sleep(3)
                continue
            return e.code
        except Exception as e:  # DNS, TLS, timeout
            if attempt == 0:
                time.sleep(3)
                continue
            return "error: " + type(e).__name__
    return "error"


def main():
    urls = collect()
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = dict(zip(urls, pool.map(fetch, urls)))
    broken, blocked = [], []
    for u, st in sorted(results.items()):
        if isinstance(st, int) and st < 400:
            continue
        where = ", ".join(urls[u][:3])
        if st in (401, 403, 406, 429):
            blocked.append(f"  {st}  {u}  ({where})")
        else:
            broken.append(f"  {st}  {u}  ({where})")
    print(f"Checked {len(results)} links: {len(broken)} broken, {len(blocked)} blocked automated checks.")
    if blocked and "--quiet" not in sys.argv:
        print("Blocked (check by hand if they keep appearing):\n" + "\n".join(blocked))
    if broken:
        print("BROKEN:\n" + "\n".join(broken))
        sys.exit(1)


if __name__ == "__main__":
    main()
