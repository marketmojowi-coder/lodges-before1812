#!/usr/bin/env python3
"""Public-site guard: stops the GitHub Pages deploy when docs/ holds anything beyond the free landing page.

The owner's rule (Oct 29, 2026): the data set is proprietary. The public site is a landing page with the
legal and sources pages only. Records, data files and pictures of the members' app stay behind sign-in.

    python3 .github/scripts/public_guard.py docs        exit 0 = safe to publish, exit 1 = blocked

Every file must be on the allowlist below. A new file fails until the owner agrees and it is added here.
"""
import hashlib, os, re, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "docs"
ALLOWED = {  # path under docs/ -> what it is
    "index.html": "landing page",
    "get-the-app.html": "how to get the members' app",
    "sources.html": "list of archives and books cited (no records)",
    "contact.html": "legal", "copyright.html": "legal", "disclaimer.html": "legal",
    "privacy.html": "legal", "terms.html": "legal",
    "styles.css": "style", "legal.css": "style",
    "market-mojo-64.png": "company logo", "market-mojo-128.png": "company logo", "market-mojo-256.png": "company logo",
    "img/emblem.svg": "app emblem",
}
MAX_BYTES = 60_000          # a page or picture larger than this needs a look
RECORD_MARKERS = [          # text that only appears in member records or app data
    r"window\.CTI_DATA", r'"ph"\s*:', r'"records"\s*:\s*\[', r"\bOriginal: National Archives", r"\bHeld at:",
]

problems = []
for d, _, files in os.walk(ROOT):
    for f in files:
        p = os.path.join(d, f)
        rel = os.path.relpath(p, ROOT).replace(os.sep, "/")
        size = os.path.getsize(p)
        if rel not in ALLOWED:
            problems.append(f"{rel}: not on the public allowlist ({size:,} bytes). Data, records and app screenshots stay behind sign-in.")
            continue
        if size > MAX_BYTES and not rel.endswith(".html"):
            problems.append(f"{rel}: {size:,} bytes, larger than a logo or style file should be.")
        if rel.endswith((".html", ".css", ".svg")):
            text = open(p, encoding="utf-8", errors="replace").read()
            body = re.sub(r"data:[^\"')]{200,}", "", text)  # embedded images are checked by size, not text
            if len(body) > MAX_BYTES:
                problems.append(f"{rel}: {len(body):,} characters of text, more than a landing or legal page holds.")
            for m in RECORD_MARKERS:
                if re.search(m, body):
                    problems.append(f"{rel}: contains '{m}', which belongs to the members' app.")
            for m in re.finditer(r"<script\b[^>]*>(.*?)</script>", body, re.S | re.I):
                if len(m.group(1)) > 5_000:
                    problems.append(f"{rel}: an inline script of {len(m.group(1)):,} characters (data or app code).")

if problems:
    print("PUBLIC GUARD: BLOCKED. Nothing was published.")
    for x in problems:
        print(" -", x)
    sys.exit(1)
print(f"PUBLIC GUARD: PASS. {sum(len(f) for _, _, f in os.walk(ROOT))} files, all on the allowlist.")
