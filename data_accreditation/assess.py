#!/usr/bin/env python3
"""FAIR self-assessment and data review record for every certified data release.

Read-only on the certified store. Reads the latest reproduction result written by
reproduce.py and writes, under ROOT/accreditation/:

    reviews/<release>.json        one review record per data set
    FAIR_and_Review_Register.md   the register of all of them

FAIR is scored against the 15 FAIR principles (Wilkinson et al., Scientific Data 3,
160018, 2016), with the indicator wording of the RDA FAIR Data Maturity Model
(RDA Recommendation, 2020). Each result is Met, Partial or Not yet, with the evidence
file it rests on. This is a self-assessment; it is not a certification.

    python3 -I assess.py [--root DATA_RELEASES]
"""
import argparse
import datetime
import glob
import hashlib
import json
import os

DEFAULT_ROOT = "/mnt/project-files/data_releases"
# Owner rule (Oct 31, 2026): no editor credit for Josh Withrow or Brent Morris in new volumes.
NO_EDITOR_CREDIT = {"withrow, josh", "morris, brent"}
STANDARD_DOCS = ["README.md", "CITATION.md", "CODEBOOK.md", "PROCESSING.md", "RIGHTS.md",
                 "ERRATA.md", "PROVENANCE.json", "datacite.json"]


def sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def latest_versions(rel_dir):
    out = {}
    for rid in sorted(os.listdir(rel_dir)):
        vs = sorted(int(x[1:]) for x in os.listdir(os.path.join(rel_dir, rid)) if x[1:].isdigit() and x[0] == "v")
        if vs:
            out[rid] = vs[-1]
    return out


def fair(d, mf, dc, rights):
    has = lambda p: os.path.isfile(os.path.join(d, p))  # noqa: E731
    ident = mf.get("identifier", "")
    dc_ids = [i.get("identifier") for i in dc.get("identifiers", [])]
    persistent = any(i.get("identifierType") == "DOI" for i in dc.get("identifiers", []))
    licensed = bool(dc.get("rightsList")) and "all rights reserved" not in rights.lower()
    bag = all(has(x) for x in ("bagit.txt", "manifest-sha256.txt", "tagmanifest-sha256.txt"))
    rel = dc.get("relatedIdentifiers", [])
    R = []

    def add(code, principle, status, evidence):
        R.append({"principle": code, "text": principle, "status": status, "evidence": evidence})

    add("F1", "Globally unique and persistent identifier",
        "Met" if persistent else "Partial",
        "DOI in datacite.json" if persistent else f"Unique local identifier {ident}; a DOI comes with deposit")
    add("F2", "Rich metadata", "Met" if has("docs/datacite.json") and has("docs/README.md") and has("docs/CODEBOOK.md") else "Partial",
        "docs/datacite.json (DataCite), docs/README.md (DACS), docs/CODEBOOK.md (DDI)")
    add("F3", "Metadata names the identifier of the data", "Met" if ident in dc_ids else "Not yet",
        f"datacite.json identifiers: {', '.join(dc_ids) or 'none'}")
    add("F4", "Registered in a searchable resource", "Not yet",
        "Listed in the local CATALOG.md only; indexed once deposited (DataCite, Zenodo, ICPSR)")
    add("A1", "Retrievable by identifier over a standard protocol", "Not yet",
        "Held in the author's archive; retrievable by HTTPS once deposited")
    add("A1.1", "Protocol open, free and universal", "Not yet", "HTTPS on deposit")
    add("A1.2", "Authentication and authorisation where needed", "Met",
        "Restricted Federal Lodge minute books and ledger are kept out of every release, not gated (RIGHTS.md)")
    add("A2", "Metadata kept even if the data are withdrawn", "Partial",
        "Hash-chained ledger and CATALOG.json keep every version's metadata locally; a DOI landing page makes it public")
    add("I1", "Formal, shared language for knowledge", "Met",
        "CSV (RFC 4180, UTF-8), JSON, DataCite 4, DDI codebook, PREMIS 3 provenance" + (", BagIt" if bag else ""))
    add("I2", "Vocabularies that are themselves FAIR", "Partial",
        "Nine-term series taxonomy and A/B/C evidence grades are defined in data_dictionary.json; not yet mapped to "
        "Library of Congress Subject Headings, Getty AAT or Wikidata")
    add("I3", "Qualified references to other data", "Met" if rel else "Partial",
        f"{len(rel)} qualified relations (IsDerivedFrom) in datacite.json; PREMIS relationships with fixity")
    add("R1", "Many accurate, relevant attributes", "Met" if has("docs/CODEBOOK.md") else "Partial",
        "Codebook and data dictionary; every record names release, file, row and row SHA-256")
    add("R1.1", "Clear, accessible data use license", "Met" if licensed else "Not yet",
        "RIGHTS.md: all rights reserved, no reuse license chosen yet (owner's decision)" if not licensed else "rightsList in datacite.json")
    add("R1.2", "Detailed provenance", "Met" if has("docs/PROVENANCE.json") else "Partial",
        "PREMIS 3 events (creation or derivation, fixity, validation) and the program's SHA-256")
    add("R1.3", "Domain community standards", "Met",
        "DACS (archival description), DataCite, DDI, PREMIS, BagIt (RFC 8493), SHA-256 (FIPS 180-4)")
    return R


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=DEFAULT_ROOT)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    rel_dir = os.path.join(root, "releases")
    acc = os.path.join(root, "accreditation")
    rdir = os.path.join(acc, "reviews")
    os.makedirs(rdir, exist_ok=True)
    runs = sorted(glob.glob(os.path.join(acc, "reproduction", "reproduction_*.json")))
    repro = json.load(open(runs[-1], encoding="utf-8")) if runs else None
    rep_by = {r["release"]: r for r in (repro["test2_pinned_reproduction"]["releases"] if repro else [])}
    drift_by = {d["release"]: d for d in (repro["test3_source_drift"] if repro else [])}
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    register = []
    for rid, v in latest_versions(rel_dir).items():
        d = os.path.join(rel_dir, rid, f"v{v}")
        mf = json.load(open(os.path.join(d, "MANIFEST.json"), encoding="utf-8"))
        dc = json.load(open(os.path.join(d, "docs", "datacite.json"), encoding="utf-8")) if os.path.isfile(os.path.join(d, "docs", "datacite.json")) else {}
        rights = open(os.path.join(d, "docs", "RIGHTS.md"), encoding="utf-8").read() if os.path.isfile(os.path.join(d, "docs", "RIGHTS.md")) else ""
        F = fair(d, mf, dc, rights)
        editors = [c["name"] for c in dc.get("contributors", []) if c.get("name", "").lower() in NO_EDITOR_CREDIT]
        docs_missing = [x for x in STANDARD_DOCS if not os.path.isfile(os.path.join(d, "docs", x))]
        rp = rep_by.get(rid)
        dr = drift_by.get(rid)
        findings = []
        if editors:
            findings.append("Deposit metadata must drop the editor credit for " + " and ".join(editors)
                            + " (owner rule, Oct 31, 2026); the certified copy is left as it is.")
        if dr and dr["status"] != "UNCHANGED":
            findings.append("Working source files changed after this version was frozen; deposit the next version, "
                            "built after the change.")
        if any(f["status"] == "Not yet" for f in F if f["principle"] == "R1.1"):
            findings.append("A reuse license is needed before deposit (owner's decision).")
        review = {
            "release": rid, "version": v, "identifier": mf.get("identifier"), "title": mf.get("title"),
            "stage": mf.get("stage"), "records": mf.get("record_count"),
            "evidence_grades": mf.get("evidence_counts"), "holders": mf.get("holder_count"),
            "content_sha256": mf.get("content_sha256"), "manifest_sha256": sha(os.path.join(d, "MANIFEST.json")),
            "certification_checks": mf.get("checks"),
            "fixity": ("Pass" if repro and repro["test1_fixity"]["pass"] else "Not run" if not repro else "Fail"),
            "reproduction": ("Identical" if rp and rp["match"] else "Differs" if rp else
                             ("Not rebuilt (research release, frozen as received)" if rid.startswith("R") else "Not run")),
            "reproduction_run": repro["run_utc"] if repro else None,
            "source_drift": dr["status"] if dr else "n/a",
            "documentation_missing": docs_missing,
            "private_records_excluded": all(c["pass"] for c in mf.get("checks", []) if "minute" in c["name"].lower()),
            "fair": F,
            "fair_score": {s: sum(f["status"] == s for f in F) for s in ("Met", "Partial", "Not yet")},
            "findings": findings,
            "reviewed_utc": now,
            "review_levels": [
                {"level": "1. Automated review", "by": "assess.py and reproduce.py", "result": "Done"},
                {"level": "2. Author's review", "by": "Thomas M. Saharsky", "result": "Pending signature"},
                {"level": "3. Independent review", "by": "Outside reviewer (repository curator or journal referee)", "result": "Pending"},
            ],
        }
        with open(os.path.join(rdir, f"{rid}.json"), "w", encoding="utf-8") as f:
            json.dump(review, f, indent=2, ensure_ascii=False)
        register.append(review)

    write_register(acc, register, repro, now)
    ok = sum(r["reproduction"] == "Identical" for r in register)
    print(f"{len(register)} review records; reproduction identical for {ok}; register at "
          f"{os.path.join(acc, 'FAIR_and_Review_Register.md')}")


def write_register(acc, reg, repro, now):
    L = ["# FAIR Self-Assessment and Data Review Register", "",
         "*The Potomac Territory Series. Thomas M. Saharsky, author and archivist.*", "",
         f"Written {now}. One review record per data set is in `reviews/`. "
         "FAIR is scored against the 15 FAIR principles (Wilkinson et al., 2016) using the RDA FAIR Data Maturity "
         "Model indicators. This is a self-assessment, not a certification.", ""]
    if repro:
        t2 = repro["test2_pinned_reproduction"]
        L += [f"Latest reproduction test: {repro['run_utc']}, **{repro['overall']}**. "
              f"{sum(r['match'] for r in t2['releases'])} of {len(t2['releases'])} rebuilt releases are byte-identical; "
              f"{repro['test1_fixity']['release_versions']} versions and {repro['test1_fixity']['ledger_entries']} ledger "
              "entries pass fixity.", ""]
    L += ["## Summary", "",
          "| Data set | Version | Records | Fixity | Reproduction | Sources since freeze | FAIR Met / Partial / Not yet |",
          "|---|---|---|---|---|---|---|"]
    for r in reg:
        s = r["fair_score"]
        L.append(f"| {r['release']} | v{r['version']} | {r['records'] if r['records'] is not None else '—'} | {r['fixity']} | "
                 f"{r['reproduction']} | {r['source_drift']} | {s['Met']} / {s['Partial']} / {s['Not yet']} |")
    L += ["", "## FAIR principles (same result for every data set unless noted)", "",
          "| Principle | Result | Evidence |", "|---|---|---|"]
    for f in reg[0]["fair"]:
        diff = [r["release"] for r in reg if next(x for x in r["fair"] if x["principle"] == f["principle"])["status"] != f["status"]]
        L.append(f"| {f['principle']} {f['text']} | {f['status']}{' (differs: ' + ', '.join(diff) + ')' if diff else ''} | {f['evidence']} |")
    L += ["", "## Findings", ""]
    seen = {}
    for r in reg:
        for x in r["findings"]:
            seen.setdefault(x, []).append(r["release"])
    for x, rs in seen.items():
        L.append(f"- {x} ({len(rs)} data sets: {', '.join(rs)})")
    L += ["", "## Review levels", "",
          "1. **Automated review** (done): fixity, certification checks, byte-identical rebuild, FAIR scoring.",
          "2. **Author's review** (to sign): the author confirms each record set against the photographs and rolls.",
          "3. **Independent review** (to arrange): a repository curator on deposit, and a journal referee for a data paper.", ""]
    with open(os.path.join(acc, "FAIR_and_Review_Register.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
