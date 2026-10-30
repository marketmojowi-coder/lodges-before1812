"""
Documentation package written into every release (docs/ folder) plus BagIt tag files.

Each document follows a published standard used by archives and research data
repositories. The framework is described in DOCUMENTATION_FRAMEWORK.md.

Everything here is deterministic (no clock) except PROVENANCE.json and
bag-info.txt, which carry event times and are kept out of the content hash.
"""
import collections
import csv
import hashlib
import io
import json
import os
import re

NONCONTENT = {"docs/PROVENANCE.json"}

DOC_STANDARDS = [
    ("README.md", "Data set description",
     "DACS (Describing Archives: A Content Standard, Society of American Archivists), single-level description; DataCite descriptive fields"),
    ("datacite.json", "Citation metadata",
     "DataCite Metadata Schema 4 (mandatory and recommended properties); Dublin Core equivalents"),
    ("CITATION.md", "How to cite", "DataCite recommended data citation form; Chicago Manual of Style 17th ed., 14.257 (data sets)"),
    ("CODEBOOK.md", "Codebook and data dictionary", "DDI (Data Documentation Initiative) variable-level description"),
    ("PROCESSING.md", "Processing and methodology note", "DACS 8.1.5 (processing information) and 5.2 (immediate source of acquisition)"),
    ("RIGHTS.md", "Rights, access and restrictions", "DACS 4.1 (conditions governing access) and 4.4 (conditions governing reproduction); PREMIS rights entity"),
    ("ERRATA.md", "Discrepancy and errata log", "Research data practice: known issues, unresolved readings and work still to do, stated openly"),
    ("PROVENANCE.json", "Provenance and preservation events", "PREMIS 3 (Library of Congress) objects, events and agents; W3C PROV-O derivation terms; 36 CFR 1236.54 metadata"),
    ("NAME_AUTHORITY.csv", "Name authority file", "Authority control after the LC Name Authority File and EAC-CPF: one authorized form, variant forms, sources"),
    ("NAME_CHANGES.csv", "Name change log", "Authority control decisions: each form changed to the authorized form, the basis and the records"),
    ("SETTLED_DECISIONS.csv", "Settled decisions", "Series fact register: settled forms and facts with their sources"),
]

RIGHTS_TEXT = """# Rights, Access and Restrictions

**Compilation.** Copyright 2026 Thomas M. Saharsky. All rights reserved. The selection, arrangement, transcription and description of these records are the author's work. No license to reuse has been granted yet; the author may choose one later.

**Originals.** The originals are held by the archives named in the `held_at` field of each record. Their own terms govern access to the originals and reproduction of images of them. Records of the National Archives (Record Groups 42, 45 and 217) are federal records in the public domain; the author's photographs of them and the transcriptions here are the author's.

**Restricted and withheld.** The minute books and ledger held by Federal Lodge are the lodge's private property. They are not in this release, in whole or in part. The Royal Arch minute text is held back in the same way. Publication of the minute books waits on the lodge's approval.

**Personal information.** Every person in these records died before 1931. No living person's private information is included.

**Access.** This release is kept in the author's project archive. It has not been published or uploaded anywhere.
"""


def _sha(b):
    return hashlib.sha256(b).hexdigest()


def _csv_bytes(fields, rows):
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=fields, extrasaction="ignore", lineterminator="\r\n")
    w.writeheader()
    for r in rows:
        w.writerow(r)
    return out.getvalue().encode("utf-8")


def _infer(values):
    vals = [v for v in values if v]
    if not vals:
        return "empty"
    if all(re.fullmatch(r"-?\d+", v) for v in vals):
        return "integer"
    if all(re.fullmatch(r"\d{4}(-\d{2}(-\d{2})?)?", v) for v in vals):
        return "date (ISO 8601)"
    if all(re.fullmatch(r"[0-9a-f]{64}", v) for v in vals):
        return "SHA-256 hash"
    return "text"


def coverage(records):
    ds = sorted(r["date_sort"][:4] for r in records if re.match(r"\d{4}", r.get("date_sort") or ""))
    return (ds[0], ds[-1]) if ds else ("", "")


# ------------------------------------------------------------ codebook
def codebook(ctx):
    L = [f"# Codebook: {ctx['title']}", "",
         "One section per data file: what each column holds, how full it is and its type. "
         "Counts are of rows; 'Filled' counts non-empty cells.", ""]
    defs = ctx.get("field_defs", {})
    for f in ctx["files"]:
        p = f["_abs"]
        L += [f"## {f['path']}", ""]
        if p.endswith(".csv"):
            with open(p, encoding="utf-8-sig", newline="") as fh:
                rows = list(csv.reader(fh))
            head, body = (rows[0], rows[1:]) if rows else ([], [])
            L += [f"Rows: {len(body)}. Columns: {len(head)}. Encoding: UTF-8. Format: CSV (RFC 4180).", "",
                  "| Column | Definition | Type | Filled | Distinct | Example |", "|---|---|---|---|---|---|"]
            for i, h in enumerate(head):
                col = [(r[i].strip() if i < len(r) else "") for r in body]
                filled = [c for c in col if c]
                ex = (filled[0] if filled else "").replace("|", "/").replace("\n", " ")
                if len(ex) > 60:
                    ex = ex[:57] + "..."
                d = defs.get(h.strip(), "As headed in the source table")
                L.append(f"| {h.strip() or '(blank)'} | {d} | {_infer(col)} | {len(filled)} | {len(set(filled))} | {ex} |")
        elif p.endswith(".json"):
            data = json.load(open(p, encoding="utf-8"))
            L.append("Format: JSON (UTF-8).")
            L.append("")
            if isinstance(data, dict):
                L += ["| Key | Type | Items |", "|---|---|---|"]
                for k, v in data.items():
                    L.append(f"| {k} | {type(v).__name__} | {len(v) if hasattr(v, '__len__') and not isinstance(v, str) else ''} |")
                lists = [(k, v) for k, v in data.items() if isinstance(v, list) and v and isinstance(v[0], dict)]
                for k, v in lists[:3]:
                    L += ["", f"Fields of each item in `{k}`: " + ", ".join(sorted(v[0].keys()))]
            elif isinstance(data, list) and data and isinstance(data[0], dict):
                L.append(f"A list of {len(data)} items. Fields of each item: " + ", ".join(sorted(data[0].keys())))
        else:
            L.append("Format: Markdown text (UTF-8). A transcript, kept as written.")
        L.append("")
    return "\n".join(L) + "\n"


# ------------------------------------------------------------ names
def name_authority(ctx, norm_name):
    people = ctx.get("people") or []
    rolls = ctx.get("rolls", {})
    records = ctx.get("records") or []
    forms = collections.defaultdict(lambda: collections.defaultdict(list))
    for r in records:
        for name in re.split(r";\s*", r["person"]):
            name = name.strip()
            k = norm_name(name)
            if k and not any(ch.isdigit() for ch in name):
                forms[k][name].append(r["record_id"])
    auth, changes = [], []
    for i, p in enumerate(sorted(people, key=lambda x: x["person_key"]), start=1):
        aid = f"PTS-P-{i:05d}"
        auth.append({"authority_id": aid, "authorized_form": p["person"],
                     "form_basis": "Lodge roll (series cross-reference)" if p["on_lodge_roll"] else "Form in the record (not on a lodge roll)",
                     "variant_forms": p["also_written"], "series": p["series"],
                     "first_year": p["first_year"], "last_year": p["last_year"], "records": p["records"],
                     "best_evidence": p["best_evidence"], "held_at": p["held_at"]})
        for form, ids in sorted(forms.get(p["person_key"], {}).items()):
            if form == p["person"]:
                continue
            same = norm_name(form) == norm_name(p["person"])
            changes.append({"authority_id": aid, "form_in_record": form, "authorized_form": p["person"],
                            "change": "Word order or punctuation" if same else "Spelling variant",
                            "basis": ("Lodge rolls are authoritative for names (series rule)" if p["on_lodge_roll"]
                                      else "Longest full form in the records chosen; other forms kept as variants"),
                            "records": len(ids), "example_records": "; ".join(ids[:3])})
    A = ["authority_id", "authorized_form", "form_basis", "variant_forms", "series", "first_year", "last_year",
         "records", "best_evidence", "held_at"]
    C = ["authority_id", "form_in_record", "authorized_form", "change", "basis", "records", "example_records"]
    return _csv_bytes(A, auth), _csv_bytes(C, changes), len(auth), len(changes)


# ------------------------------------------------------------ main
def render_docs(ctx, version, norm_name):
    """Return {relative path: bytes} for the docs folder (deterministic)."""
    out = {}
    recs = ctx.get("records") or []
    c0, c1 = coverage(recs)
    cov = f"{c0}–{c1}" if c0 and c1 and c0 != c1 else (c0 or "not dated")
    ev = collections.Counter(r["evidence"] for r in recs)
    holders = collections.Counter(r["held_at"] for r in recs)
    rid = ctx["rid"]
    ident = f"PTS-DS:{rid}:v{version}"

    # README (DACS single-level description)
    R = [f"# {ctx['title']}", "",
         f"*{ctx['series']}. {ctx['creator']}.*", "",
         "| DACS element | Value |", "|---|---|",
         f"| 2.1 Reference code | {ident} |",
         f"| 2.2 Name and location of repository | The author's project archive (Thomas M. Saharsky) |",
         f"| 2.3 Title | {ctx['title']} |",
         f"| 2.4 Date | Records {cov}; release compiled 2026 |",
         f"| 2.5 Extent | {len(ctx['files'])} data files; {len(recs) if recs else 'n/a'} taxonomy records |",
         f"| 2.6 Name of creator | {ctx['creator']} |",
         f"| 3.1 Scope and content | {ctx['scope']} |",
         f"| 3.2 System of arrangement | {ctx['arrangement']} |",
         "| 4.1 Conditions governing access | See RIGHTS.md. Federal Lodge minute books and ledger withheld. |",
         "| 4.4 Conditions governing reproduction | See RIGHTS.md. |",
         "| 4.5 Languages and scripts | English; Latin script. Quotations keep the writer's own spelling and capitals. |",
         "| 5.2 Immediate source of acquisition | " + ctx["acquisition"] + " |",
         "| 6.3 Related materials | " + ("; ".join(f"{i['release']} v{i['version']}" for i in ctx["inputs"] if "release" in i) or "The printed books and the author's photographs") + " |",
         "| 7.1 Notes | See ERRATA.md for known issues and work still to do. |",
         "| 8.1.5 Processing information | See PROCESSING.md. |", ""]
    if recs:
        R += ["## Evidence", "", "| Grade | Meaning | Records |", "|---|---|---|",
              f"| A | Original read | {ev.get('A', 0)} |", f"| B | Copy of the original | {ev.get('B', 0)} |",
              f"| C | Reference only | {ev.get('C', 0)} |", "",
              "## Holders of the originals", "", "| Held at | Records |", "|---|---|"]
        for h, n in holders.most_common(15):
            R.append(f"| {h[:150]} | {n} |")
        R.append("")
    R += ["## The documents in this folder", "", "| File | What it is | Standard followed |", "|---|---|---|"]
    for f, what, std in DOC_STANDARDS:
        if f.startswith(("NAME_", "SETTLED")) and not ctx.get("people"):
            continue
        R.append(f"| {f} | {what} | {std} |")
    R += ["", "Package files at the top of the release: `bagit.txt`, `bag-info.txt`, `manifest-sha256.txt` and "
          "`tagmanifest-sha256.txt` (BagIt, RFC 8493); `MANIFEST.json`, `SHA256SUMS`, `CERTIFICATE.md`."]
    out["README.md"] = "\n".join(R) + "\n"

    # DataCite
    dc = {
        "identifiers": [{"identifier": ident, "identifierType": "Local"}],
        "creators": [{"name": "Saharsky, Thomas M.", "nameType": "Personal", "givenName": "Thomas M.",
                      "familyName": "Saharsky", "affiliation": []}],
        "titles": [{"title": ctx["title"]}, {"title": ctx["series"], "titleType": "Other"}],
        "publisher": "Thomas M. Saharsky (author's archive)",
        "publicationYear": "2026",
        "resourceType": {"resourceTypeGeneral": "Dataset", "resourceType": ctx["stage"]},
        "subjects": [{"subject": s} for s in ("Freemasonry -- Washington (D.C.) -- History -- 18th century",
                                              "Washington (D.C.) -- History -- 1791-1815",
                                              "Building trades -- Washington (D.C.)", "Archival records")],
        "contributors": [{"name": "Withrow, Josh", "contributorType": "Editor"},
                         {"name": "Morris, Brent", "contributorType": "Editor"}],
        "dates": ([{"date": cov.replace("–", "/"), "dateType": "Other", "dateInformation": "Dates of the records"}] if c0 else []),
        "language": "en",
        "version": str(version),
        "rightsList": [{"rights": "Copyright 2026 Thomas M. Saharsky. All rights reserved."}],
        "descriptions": [{"description": ctx["scope"], "descriptionType": "Abstract"},
                         {"description": ctx["arrangement"], "descriptionType": "TechnicalInfo"}],
        "geoLocations": [{"geoLocationPlace": "District of Columbia; George-Town; Alexandria; Maryland"}],
        "formats": sorted({f["media_type"] for f in ctx["files"]}),
        "sizes": [f"{len(ctx['files'])} files", f"{sum(f['bytes'] for f in ctx['files'])} bytes"]
                 + ([f"{len(recs)} records"] if recs else []),
        "relatedIdentifiers": [{"relatedIdentifier": f"PTS-DS:{i['release']}:v{i['version']}",
                                "relatedIdentifierType": "Local", "relationType": "IsDerivedFrom"}
                               for i in ctx["inputs"] if "release" in i],
    }
    out["datacite.json"] = json.dumps(dc, indent=2, ensure_ascii=False, sort_keys=True) + "\n"

    out["CITATION.md"] = (
        "# How to Cite\n\n"
        f"Saharsky, Thomas M. *{ctx['title']}*. {ctx['series']}. Version {version}. 2026. "
        f"Data set {ident}, author's archive.\n\n"
        "To cite one record, add its `record_id`. Cite the original as well, at the archive named in "
        "`held_at` for that record.\n")

    out["CODEBOOK.md"] = codebook(ctx)
    out["PROCESSING.md"] = "\n".join([f"# Processing and Methodology: {ctx['title']}", ""] + ctx["processing"]) + "\n"
    out["RIGHTS.md"] = RIGHTS_TEXT

    E = [f"# Discrepancy and Errata Log: {ctx['title']}", "",
         "Known issues, readings still open and work still to do. An item leaves this log only when a new "
         "version settles it, and the version note says how.", ""]
    items = ctx.get("errata") or []
    if items:
        E += ["| No. | Area | Issue | Count | Next step |", "|---|---|---|---|---|"]
        for n, it in enumerate(items, start=1):
            E.append(f"| {n} | {it['area']} | {it['issue']} | {it.get('count', '')} | {it['next']} |")
    else:
        E.append("No known issues are recorded for this release.")
    out["ERRATA.md"] = "\n".join(E) + "\n"

    if ctx.get("people"):
        a, c, na, nc = name_authority(ctx, norm_name)
        out["NAME_AUTHORITY.csv"] = a
        out["NAME_CHANGES.csv"] = c
        out["SETTLED_DECISIONS.csv"] = _csv_bytes(["decision", "source"],
                                                  [{"decision": s["fact"], "source": s.get("source", "")}
                                                   for s in ctx.get("settled", [])])
    return {f"docs/{k}": (v.encode("utf-8") if isinstance(v, str) else v) for k, v in out.items()}


def provenance(ctx, version, mf_files, events, agent_sha):
    """PREMIS 3 style provenance (objects, events, agents)."""
    return json.dumps({
        "premis_version": "3.0",
        "object": {"objectIdentifier": f"PTS-DS:{ctx['rid']}:v{version}", "objectCategory": "intellectual entity",
                   "files": [{"name": f["path"], "size": f["bytes"],
                              "fixity": {"messageDigestAlgorithm": "SHA-256", "messageDigest": f["sha256"]},
                              "format": f["media_type"]} for f in mf_files],
                   "relationships": [{"relationshipType": "derivation", "relationshipSubType": "is derived from",
                                      "relatedObject": (f"PTS-DS:{i['release']}:v{i['version']}" if "release" in i
                                                        else i["original_path"]),
                                      "relatedObjectFixity": i.get("content_sha256") or i.get("sha256")}
                                     for i in ctx["inputs"]]},
        "events": events,
        "agents": [{"agentIdentifier": "Thomas M. Saharsky", "agentType": "person", "role": "creator; archivist"},
                   {"agentIdentifier": "potomac_data.py", "agentType": "software",
                    "agentVersion": ctx["pipeline_version"], "agentNote": f"SHA-256 of the program: {agent_sha}"}],
        "rights": {"rightsBasis": "copyright", "note": "See RIGHTS.md"},
    }, indent=2, ensure_ascii=False) + "\n"


def bag(staging, data_files, ident, title, when):
    """Write BagIt (RFC 8493) tag files. Payload = data/."""
    total = sum(f["bytes"] for f in data_files)
    with open(os.path.join(staging, "bagit.txt"), "w", encoding="utf-8") as f:
        f.write("BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n")
    with open(os.path.join(staging, "manifest-sha256.txt"), "w", encoding="utf-8") as f:
        for d in data_files:
            f.write(f"{d['sha256']}  data/{d['path']}\n")
    with open(os.path.join(staging, "bag-info.txt"), "w", encoding="utf-8") as f:
        f.write(f"Source-Organization: Thomas M. Saharsky, author's archive\n"
                f"Contact-Name: Thomas M. Saharsky\n"
                f"External-Identifier: {ident}\n"
                f"External-Description: {title}\n"
                f"Bag-Group-Identifier: The Potomac Territory Series\n"
                f"Bagging-Date: {when[:10]}\n"
                f"Payload-Oxum: {total}.{len(data_files)}\n")
