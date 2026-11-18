#!/usr/bin/env python3
"""Prepare a deposit package for one certified data release (all rights reserved, restricted access).

Read-only on the certified store. Writes data_releases/deposit/<release>_v<N>/ and a zip of it:
    bag/                     the certified release, byte for byte (BagIt bag)
    zenodo_metadata.json     deposit metadata for Zenodo (access_right "restricted", no license)
    datacite.json            DataCite metadata for any repository that mints a DOI
    REVIEW_RECORD.json       the data review record from assess.py
    REPRODUCTION_REPORT.md   the latest reproduction test
    DEPOSIT_STEPS.md         what the owner does on the repository site
    SHA256SUMS               every file above

Refuses a release that holds a minute book or ledger file, or that credits Withrow or Morris.
    python3 -I make_deposit.py SER2-federal-city [NB1-new-book ...]
"""
import glob, hashlib, json, os, re, shutil, sys, zipfile

ROOT = "/mnt/project-files/data_releases"
REL = os.path.join(ROOT, "releases")
ACC = os.path.join(ROOT, "accreditation")
OUT = os.path.join(ROOT, "deposit")
FORBIDDEN = re.compile(r"(?i)minute|ledger")
NO_CREDIT = re.compile(r"(?i)withrow|morris, brent|brent morris")
ACCESS = ("Restricted. Copyright 2026 Thomas M. Saharsky. All rights reserved. Access to the files is granted "
          "by the author on request for research use. The originals are held by the archives named in each record.")


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def latest(rid):
    vs = sorted(int(x[1:]) for x in os.listdir(os.path.join(REL, rid)) if re.fullmatch(r"v\d+", x))
    return vs[-1]


def package(rid):
    v = latest(rid)
    src = os.path.join(REL, rid, f"v{v}")
    mf = json.load(open(os.path.join(src, "MANIFEST.json"), encoding="utf-8"))
    bad = [f["path"] for f in mf["files"] if FORBIDDEN.search(f["path"]) and not f["path"].startswith("Voucher_Cross")]
    if bad:
        sys.exit(f"{rid} v{v}: refused, private-record file names {bad[:3]}")
    dc = json.load(open(os.path.join(src, "docs", "datacite.json"), encoding="utf-8"))
    if any(NO_CREDIT.search(c.get("name", "")) for c in dc.get("contributors", [])):
        sys.exit(f"{rid} v{v}: refused, editor credit the owner removed")
    for f in mf["files"]:  # the bag must match its manifest before it leaves
        p = os.path.join(src, f["path"] if f["path"].startswith("docs/") else os.path.join("data", f["path"]))
        if sha(p) != f["sha256"]:
            sys.exit(f"{rid} v{v}: fixity failure {f['path']}")

    name = f"{rid}_v{v}"
    dest = os.path.join(OUT, name)
    if os.path.exists(dest):
        shutil.rmtree(dest)
    shutil.copytree(src, os.path.join(dest, "bag"))

    desc = next((d["description"] for d in dc.get("descriptions", []) if d.get("descriptionType") == "Abstract"), mf["title"])
    zen = {"metadata": {
        "upload_type": "dataset",
        "title": mf["title"],
        "creators": [{"name": "Saharsky, Thomas M."}],
        "description": f"<p>{desc}</p><p>The Potomac Territory Series. Release {rid}, version {v}; content SHA-256 "
                       f"{mf['content_sha256']}. Every record names the archive that holds the original. A clean-folder "
                       f"rebuild reproduces the data files byte for byte (REPRODUCTION_REPORT.md).</p>",
        "access_right": "restricted",
        "access_conditions": ACCESS,
        "version": f"v{v}",
        "publication_date": mf["created_utc"][:10],
        "keywords": [s["subject"] for s in dc.get("subjects", [])],
        "language": "eng",
        "notes": "All rights reserved. No reuse license is granted. The Federal Lodge minute books and ledger are "
                 "the lodge's private property and are not in this deposit.",
    }}
    with open(os.path.join(dest, "zenodo_metadata.json"), "w", encoding="utf-8") as f:
        json.dump(zen, f, indent=2, ensure_ascii=False)
    shutil.copyfile(os.path.join(src, "docs", "datacite.json"), os.path.join(dest, "datacite.json"))
    rv = os.path.join(ACC, "reviews", f"{rid}.json")
    if os.path.exists(rv):
        shutil.copyfile(rv, os.path.join(dest, "REVIEW_RECORD.json"))
    reps = sorted(glob.glob(os.path.join(ACC, "reproduction", "Reproduction_Report_*.md")))
    if reps:
        shutil.copyfile(reps[-1], os.path.join(dest, "REPRODUCTION_REPORT.md"))
    steps = f"""# Deposit steps: {mf['title']} (version {v})

All rights reserved (owner, Nov 6, 2026). The files are deposited with restricted access; the description and
the DOI are public, and the author grants access to the files on request.

1. Sign in at zenodo.org (or openICPSR) with your own account. Keys and passwords stay with you.
2. New upload. Upload the files in `bag/` (or the whole `{name}.zip`).
3. Fill the form from `zenodo_metadata.json`: upload type Dataset; access right Restricted; paste the access
   conditions; leave the license empty.
4. Reserve the DOI, publish, and send the DOI back to the thread so the next release records it.

Check before publishing: `SHA256SUMS` in this folder matches the files (`sha256sum -c SHA256SUMS`).
"""
    open(os.path.join(dest, "DEPOSIT_STEPS.md"), "w", encoding="utf-8").write(steps)
    lines = []
    for dp, dn, fn in os.walk(dest):
        dn.sort()
        for n in sorted(fn):
            p = os.path.join(dp, n)
            lines.append(f"{sha(p)}  {os.path.relpath(p, dest)}")
    open(os.path.join(dest, "SHA256SUMS"), "w").write("\n".join(lines) + "\n")
    zp = os.path.join(OUT, f"{name}.zip")
    with zipfile.ZipFile(zp + ".tmp", "w", zipfile.ZIP_DEFLATED) as z:
        for dp, dn, fn in os.walk(dest):
            dn.sort()
            for n in sorted(fn):
                p = os.path.join(dp, n)
                z.write(p, os.path.join(name, os.path.relpath(p, dest)))
    os.replace(zp + ".tmp", zp)
    print(f"{name}: {len(lines)} files, zip {os.path.getsize(zp) // 1024} KB, SHA-256 {sha(zp)[:16]}")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for rid in sys.argv[1:] or ["SER2-federal-city"]:
        package(rid)
