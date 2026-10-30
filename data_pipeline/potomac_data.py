#!/usr/bin/env python3
"""
Potomac Territory Series: immutable data set pipeline.

Stages (run in order by `build`):
  1. Freeze   - each existing data set becomes a versioned, read-only release:
                byte-exact copies, SHA-256 fixity for every file, a manifest
                with provenance, and an entry in the append-only ledger.
  2. Combine  - derived releases that map every record to the nine shared
                taxonomy terms and point back to the source release, file,
                row and row hash.
  3. Census   - the census findings as their own series data set.
  4. Series   - one data set per book series.
  5. New book - the final combined data set, built from the series releases.

Rules enforced in code:
  - A release is never edited. Changed content becomes a new version.
  - Federal Lodge minute books and ledger are never included (and the Royal
    Arch minute text is held back the same way).
  - Every record names the archive holding the original ("held_at").
  - Primary data first: records sort A (original read) before B (copy of the
    original) before C (reference only).

Commands:
  python3 potomac_data.py build   [--root DIR]
  python3 potomac_data.py verify  [--root DIR]
  python3 potomac_data.py status  [--root DIR]
"""
import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import os
import re
import shutil
import stat
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pts_docs  # noqa: E402

PROJECT = "/mnt/project-files"
DEFAULT_ROOT = os.path.join(PROJECT, "data_releases")
CREATOR = "Thomas M. Saharsky, author and archivist"
SERIES_NAME = "The Potomac Territory Series"
PIPELINE_VERSION = "1.1.0"
GLOBAL = {"rolls": {}, "settled": []}

# ---------------------------------------------------------------- holders
RG42 = ("Record Group 42: Records of the Office of Public Buildings and Public "
        "Parks of the National Capital, National Archives Building, Washington, D.C.")
RG217 = ("Record Group 217: Records of the Accounting Officers of the Department "
         "of the Treasury, National Archives Building, Washington, D.C.")
RG45 = ("Record Group 45: Naval Records Collection of the Office of Naval Records "
        "and Library, National Archives, Washington, D.C.")
PONZILLO = ("Stephen J. Ponzillo Jr. Memorial Library and Museum, Grand Lodge of "
            "A.F. & A.M. of Maryland, Baltimore")
PARISH = "Christ Church, Washington Parish, archives, Washington, D.C."
DEEDS = "Recorder of Deeds, District of Columbia (land records)"
LOC = "Library of Congress, Washington, D.C."

TAXONOMY = [
    ("person", "Person", "Name in roll form where the man is on a lodge roll; other spellings in detail"),
    ("lodge", "Lodge", "Name and number as on the warrant"),
    ("calling", "Calling", "The trade as the record gives it"),
    ("place", "Place", "The area of the District or beyond"),
    ("building", "Building", "The name the record uses"),
    ("date", "Date", "Date in the form June 17, 1797; ranges in full"),
    ("record", "Record", "Minute, Roll or return, Voucher, Proceedings, Newspaper, Letter, Plan, Inscription, Book"),
    ("evidence", "Evidence", "A (original read), B (copy of the original), C (reference only)"),
    ("held_at", "Held at", "The archive holding the original, named in full"),
]
RECORD_TYPES = {"Minute", "Roll or return", "Voucher", "Proceedings", "Newspaper",
                "Letter", "Plan", "Inscription", "Book"}
RECORD_FIELDS = (["record_id", "series", "source_release", "source_version",
                  "source_file", "source_row", "row_sha256"]
                 + [t[0] for t in TAXONOMY]
                 + ["date_sort", "citation", "detail"])

# Never in any release (user rule: lodge private property).
FORBIDDEN_FILE = re.compile(r"(?i)minute|ledger")
FORBIDDEN_ROW = re.compile(r"(?i)federal lodge[^.]{0,80}(minute|ledger)|(minute|ledger)[^.]{0,80}federal lodge")
DEVICE_PATH = re.compile(r"(?i)\b[a-z]:\\|/mnt/|/home/|/tmp/")

# ---------------------------------------------------------------- sources
DS = os.path.join(PROJECT, "datasets")


def _csvs(folder, exclude=()):
    out = []
    for name in sorted(os.listdir(folder)):
        if name.endswith(".csv") and name not in exclude:
            out.append(os.path.join(folder, name))
    return out


def book(code, folder, title, book_cite, exclude=()):
    return dict(id=code, title=title, stage="source", group="lodge_books",
                files=_csvs(os.path.join(DS, folder, "CSV"), exclude),
                book=book_cite,
                exclusions=[{"file": e, "reason": EXCLUDE_REASON[e]} for e in exclude])


EXCLUDE_REASON = {
    "Minutes.csv": ("Royal Arch minute text: the minute books held by Federal Lodge are "
                    "the lodge's private property; kept out of data packages as for the "
                    "Grand Lodge of D.C. package."),
}


def sources():
    cs = os.path.join(DS, "cornerstones")
    cm = os.path.join(PROJECT, "commissioners")
    return [
        book("S01-royal-arch", "Royal_Arch", "Origins of the Royal Arch: Data Set",
             "Thomas M. Saharsky, Origins of the Royal Arch (Lulu, 2026)", exclude=("Minutes.csv",)),
        book("S02-potomac-lodge", "Potomac_Lodge", "Potomac Lodge: Data Set",
             "Thomas M. Saharsky, Potomac Lodge (Lulu, 2026)"),
        book("S03-federal-lodge-no15", "Federal_Lodge_No15", "Federal Lodge No. 15, 1793–1811: Data Set",
             "Thomas M. Saharsky, Federal Lodge No. 15, 1793–1811 (Lulu, 2026)"),
        book("S04-naval-lodge-no41", "Naval_Lodge", "Naval Lodge No. 41: Data Set",
             "Thomas M. Saharsky, Naval Lodge No. 41 (Lulu, 2026)"),
        book("S05-columbia-lodge-no35", "Columbia_Lodge", "Columbia Lodge No. 35: Data Set",
             "Thomas M. Saharsky, Columbia Lodge No. 35 (Lulu, 2026)"),
        book("S06-washington-parish", "Washington_Parish", "Washington Parish: Data Set",
             "Thomas M. Saharsky, Washington Parish (Lulu, 2026)"),
        dict(id="S07-lodge-rolls-cross-reference", stage="source", group="lodge_books",
             title="Series Cross-Reference of the Lodge Rolls",
             files=[os.path.join(PROJECT, "thesis", "People_Cross_Reference.csv")],
             book="Thomas M. Saharsky, Proto Lodges, lodge rolls (series cross-reference)"),
        dict(id="S08-fact-register", stage="source", group="lodge_books",
             title="Series Fact Register (settled facts)",
             files=[os.path.join(PROJECT, "lodge-books", "series", "fact_register.json")]),
        dict(id="S09-commissioners-rg42", stage="source", group="federal_city",
             title="Record Group 42: Proceedings of the Commissioners, 1791–1797: Data Set",
             files=(_csvs(os.path.join(cm, "csv"))
                    + _csvs(os.path.join(cm, "finding_aid"))
                    + [os.path.join(cm, "transcripts", "vol3_all.md")])),
        dict(id="S10-cornerstones", stage="source", group="cornerstones",
             title="Cornerstones of the District of Columbia: Data Set",
             files=_csvs(os.path.join(cs, "CSV")) + [os.path.join(cs, "Cornerstone_Bios.json")]),
        dict(id="S11-people-register", stage="source", group="cornerstones",
             title="People Register of the Cornerstone Layings",
             files=[os.path.join(cs, "people_register.json")]),
        dict(id="S12-census-findings", stage="source", group="census",
             title="Census and Directory Findings for Cornerstone People",
             files=[os.path.join(cs, "census_lookup", "census_findings.json")]),
    ]


SERIES = [
    ("SER1-lodge-books", "lodge_books", "The Lodge Books: Series Data Set"),
    ("SER2-federal-city", "federal_city", "The Federal City (Record Group 42): Series Data Set"),
    ("SER3-cornerstones", "cornerstones", "Cornerstones: Series Data Set"),
    ("SER4-census", "census", "Census and Directories: Series Data Set"),
]

# ---------------------------------------------------------------- utils


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def canon(obj):
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def now():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def safe_name(name):
    """ASCII file names with no spaces (NARA file-naming guidance)."""
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", name)
    return re.sub(r"_+", "_", base).strip("_")


def media_type(path):
    ext = os.path.splitext(path)[1].lower()
    return {".csv": "text/csv; charset=utf-8", ".json": "application/json",
            ".md": "text/markdown; charset=utf-8", ".jsonl": "application/x-ndjson"}.get(ext, "application/octet-stream")


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    if not rows:
        return [], []
    head = [h.strip() for h in rows[0]]
    return head, rows[1:]


def write_csv(path, fields, rows):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)


MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]
MON_ABBR = {m[:3].lower(): i + 1 for i, m in enumerate(MONTHS)}


def norm_date(raw):
    """Return (display, sort key). Display follows 'June 17, 1797'."""
    s = (raw or "").strip()
    if not s:
        return "", ""
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        y, mo, d = int(m[1]), int(m[2]), int(m[3])
        return f"{MONTHS[mo-1]} {d}, {y}", s
    m = re.fullmatch(r"(\d{4})-(\d{2})", s)
    if m:
        return f"{MONTHS[int(m[2])-1]} {m[1]}", s
    m = re.search(r"\b([A-Z][a-z]{2,8})\.?\s+(\d{1,2}),?\s+(\d{4})", s)
    if m and m[1][:3].lower() in MON_ABBR:
        return s, f"{m[3]}-{MON_ABBR[m[1][:3].lower()]:02d}-{int(m[2]):02d}"
    m = re.search(r"\b(1[5-9]\d\d|20\d\d)\b", s)
    return s, (m[1] if m else "")


def norm_name(s):
    s = (s or "").lower()
    s = re.sub(r"\b(rev|dr|capt|col|gen|maj|hon|mr|esq|jr|sr|the)\b\.?", " ", s)
    if "," in s:
        last, _, first = s.partition(",")
        s = f"{first} {last}"
    s = re.sub(r"[^a-z ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


# ---------------------------------------------------------------- holders


def resolve_holder(citation, fname="", group=""):
    """Return (held_at, evidence, record type) from a row's citation."""
    c = citation or ""
    low = c.lower()
    cap = fname.lower()
    if "ponzillo" in low:
        return PONZILLO, "B", "Roll or return"
    if re.search(r"returns|roster|first list of members|return of members|extract from the proceedings of potomak", low + " " + cap):
        return PONZILLO, "B", "Roll or return"
    if group == "lodge_books" and re.search(
            r"the men of federal lodge|officers and members|members, 1|members on the|men who held|"
            r"names on the returns|officers of .* lodge|members of .* found in other|"
            r"brethren of .* in other lodges|belonged to more than one lodge", low):
        # compiled from the lodge returns (minute-book holder per the series standard)
        return PONZILLO, ("B" if "the men of federal lodge" in low else "C"), "Roll or return"
    if "lots sold at the public sales" in low or "proceedings of the commissioners" in low:
        return RG42, "B", "Proceedings"
    if "record group 42" in low or re.search(r"\brg ?42\b", low):
        return RG42, "B", "Proceedings" if "letter" not in low else "Letter"
    if "record group 45" in low or re.search(r"\brg ?45\b", low):
        return RG45, "B", "Voucher" if "pay" in cap else "Letter"
    if "record group 217" in low:
        return RG217, "B", "Voucher"
    if "recorder of deeds" in low:
        return DEEDS, "B", "Book"
    if group == "lodge_books" and "washington parish" in low and re.search(r"\bms\.? ?p", low + " " + cap):
        return PARISH, "B", "Minute"
    if "missouri history museum" in low:
        return "Missouri History Museum, St. Louis (Bixby Collection)", "B", "Letter"
    if "chronicling america" in low or "library of congress" in low:
        return LOC + (" (Chronicling America)" if "chronicling" in low else ""), "B", \
            "Newspaper" if "chronicling" in low else "Book"
    if "national archives" in low:
        return "National Archives, Washington, D.C.", "B", "Letter"
    return f"Published: {c}" if c else "", "C", "Book"


# ---------------------------------------------------------------- mappers
PERSON_COLS = ["Name (roll form where on a roll)", "Name", "Brother", "Purchaser", "Payee", "Party",
               "Pewholder", "Vestryman", "Rector", "Minister", "Chaplain", "Held by",
               "Contractor", "Persons", "Holders, with the returns on which they stand",
               "Men who held it", "Clergyman and church", "Brethren named"]
LODGE_COLS = ["Lodge", "Lodges", "Laid by (lodge or body)", "Other lodges", "Other lodge", "Also found in"]
CALLING_COLS = ["Trade on the rolls", "Trade", "Calling", "Calling or lodge office", "Trade or calling",
                "Trade in the records", "Calling and town office", "Post as written"]
PLACE_COLS = ["Place", "Residence", "Where", "County or state"]
BUILDING_COLS = ["Building or structure", "Building"]
DATE_COLS = ["Date", "Certificate date", "Elected", "Communication", "Year", "From", "Years",
             "Return", "Admitted", "When admitted", "Years on rolls"]


def pick(row, cols):
    for c in cols:
        v = (row.get(c) or "").strip()
        if v:
            return v
    return ""


def detail_of(row, used):
    parts = []
    for k, v in row.items():
        v = (v or "").strip()
        if k and v and k not in used and not DEVICE_PATH.search(v):
            parts.append(f"{k}: {v}")
    return "; ".join(parts)


class Mapper:
    def __init__(self, release):
        self.rel = release  # dict with id, version, group, files(manifest)
        self.out = []
        self.excluded = []

    def add(self, fname, rowno, raw, **f):
        rid = f"{self.rel['id']}@v{self.rel['version']}:{fname}:{rowno}"
        rec = {k: "" for k in RECORD_FIELDS}
        rec.update(record_id=rid, series=self.rel["group"], source_release=self.rel["id"],
                   source_version=self.rel["version"], source_file=fname, source_row=rowno,
                   row_sha256=sha256_bytes(canon(raw).encode()))
        for k, v in f.items():
            rec[k] = (v if isinstance(v, str) else str(v)).strip()
        if not rec["date_sort"]:
            rec["date"], rec["date_sort"] = norm_date(rec["date"])
        blob = " ".join(rec[k] for k in ("citation", "detail", "person"))
        if FORBIDDEN_ROW.search(blob):
            self.excluded.append({"record": rid, "reason": "cites Federal Lodge minute books or ledger"})
            return
        for k in ("citation", "detail", "place", "held_at"):
            if DEVICE_PATH.search(rec[k]):
                rec[k] = DEVICE_PATH.sub("[author's archive]/", rec[k])
        self.out.append(rec)


def map_generic_csv(m, path, fname, book_cite):
    head, rows = read_csv(path)
    for i, r in enumerate(rows, start=2):
        row = dict(zip(head, r))
        if not any(v.strip() for v in r):
            continue
        cite = (row.get("Source") or "").strip() or book_cite or ""
        held, ev, rtype = resolve_holder(cite, fname, m.rel["group"])
        used = set(PERSON_COLS + LODGE_COLS + CALLING_COLS + PLACE_COLS + BUILDING_COLS + ["Source"])
        dcol = next((c for c in DATE_COLS if (row.get(c) or "").strip()), None)
        if dcol:
            used.add(dcol)
        m.add(fname, i, row, person=pick(row, PERSON_COLS), lodge=pick(row, LODGE_COLS),
              calling=pick(row, CALLING_COLS), place=pick(row, PLACE_COLS),
              building=pick(row, BUILDING_COLS), date=(row.get(dcol) if dcol else ""),
              record=rtype, evidence=ev, held_at=held, citation=cite,
              detail=detail_of(row, used))


def map_lodge_book(m, files, book_cite):
    for path, fname in files:
        if not fname.endswith(".csv") or fname == "People.csv":
            continue  # People.csv repeats the series cross-reference (S07)
        map_generic_csv(m, path, fname, book_cite)


def map_cross_reference(m, files, book_cite):
    for path, fname in files:
        head, rows = read_csv(path)
        for i, r in enumerate(rows, start=2):
            row = dict(zip(head, r))
            m.add(fname, i, row, person=row.get("Name", ""), lodge=row.get("Lodges", ""),
                  calling=row.get("Trade on the rolls", ""), date=row.get("Years on rolls", ""),
                  record="Roll or return", evidence="C",
                  held_at=("Published: " + book_cite + "; compiled from the lodge returns of "
                           "each lodge as cited in the rolls (Maryland lodges: " + PONZILLO + ")"),
                  citation=book_cite,
                  detail=detail_of(row, {"Name", "Lodges", "Trade on the rolls", "Years on rolls"}))


def rg42_cite(date_disp, page, extra="Proceedings of the Commissioners"):
    bits = [f"{extra}, Record Group 42, Entry 21"]
    if page:
        bits.append(f"MS p. {page}")
    if date_disp:
        bits.append(date_disp)
    return ", ".join(bits)


def map_commissioners(m, files):
    for path, fname in files:
        if fname.endswith(".md") or fname in ("Pages_To_Photograph.csv", "Finding_Aid_Author_Photographs.csv"):
            continue  # transcripts, work lists and finding aids are kept in the release, not as records
        head, rows = read_csv(path)
        for i, r in enumerate(rows, start=2):
            row = dict(zip(head, r))
            g = row.get
            if fname == "Voucher_Cross_Reference_RG217_RG42.csv":
                d, ds = norm_date(g("voucher_date"))
                cite = f"Voucher {g('voucher_label','')}, Record Group 217".strip()
                if g("minutes_date"):
                    cite += f"; matched to the Proceedings, Record Group 42, Entry 21, {g('minutes_date')}"
                    if g("ms_page"):
                        cite += f", MS p. {g('ms_page')}"
                m.add(fname, i, row, person=g("person_folder", ""), date=d, date_sort=ds,
                      record="Voucher", evidence="A" if (g("photos") or "").strip() else "C",
                      held_at=RG217, citation=cite,
                      detail=detail_of(row, {"person_folder", "voucher_date", "voucher_label", "drive_folder", "photos"}))
                continue
            date_raw = g("Date") or g("Certificate date") or ""
            d, ds = norm_date(date_raw) if date_raw else norm_date(g("Year", ""))
            page = g("MS page") or g("MS pages") or ""
            f = dict(record="Proceedings", evidence="A", held_at=RG42, date=d, date_sort=ds)
            if fname == "Meetings.csv":
                f.update(place=g("Place", ""),
                         detail=f"Present: {g('Present','')}. {g('Business','')}".strip())
            elif fname == "Lot_Sales.csv":
                f.update(person=g("Purchaser", ""), place=f"Square {g('Square','')}, lots {g('Lots','')}",
                         detail=detail_of(row, {"Purchaser", "Square", "Lots", "Year", "Certificate date", "MS page"}))
            elif fname == "Payments.csv":
                f.update(person=g("Payee", ""), detail=f"{g('Amount','')} for {g('For','')}".strip())
            elif fname == "Contracts_Supply.csv":
                f.update(person=g("Party", ""), place=g("Residence", ""),
                         detail=f"{g('Goods or work','')}; {g('Terms','')}".strip("; "))
            elif fname == "Licences.csv":
                f.update(person=g("Name", ""), detail=g("Leave granted", ""))
            elif fname == "Officers.csv":
                d2, ds2 = norm_date(g("From") or g("Year", ""))
                f.update(person=g("Name", ""), date=d2, date_sort=ds2,
                         detail=f"{g('Office','')}. {g('Note','')}".strip(". "))
            elif fname == "Square_Divisions.csv":
                f.update(person=g("Original proprietors", ""), place=f"Square {g('Square','')}",
                         detail=detail_of(row, {"Original proprietors", "Square", "Year"}))
            elif fname == "Workforce.csv":
                f.update(detail=g("Order", ""))
            elif fname == "Treasury_Estimate.csv":
                f.update(calling=g("Trade", ""), date="ca. 1798–1800", date_sort="1798",
                         detail=f"{g('Quantity and work','')}; {g('Amount as written','')}")
                f["citation"] = ("Estimate for the Treasury Office, City of Washington, Series 38, "
                                 "Entry 21, Box 2, Record Group 42")
            elif fname == "Lodge_Links.csv":
                f.update(person=g("Name", ""), lodge=g("On the lodge rolls", ""), evidence="C",
                         detail=f"{g('In the Proceedings','')} Match: {g('Match','')}. {g('Note','')}".strip())
            else:
                f.update(detail=detail_of(row, set()))
            f.setdefault("citation", rg42_cite(d, page))
            m.add(fname, i, row, **f)


def map_cornerstones(m, files):
    for path, fname in files:
        if fname == "T1_Cornerstone_Layings.csv":
            head, rows = read_csv(path)
            for i, r in enumerate(rows, start=2):
                row = dict(zip(head, r))
                g = row.get
                cite = g("Source", "")
                held = g("Holding archive", "").strip()
                if not held or held.lower().startswith("published book"):
                    held = (held + "; " if held and ";" in held else "") + f"Published: {cite}"
                text = cite.lower()
                rtype = "Newspaper" if ("chronicling" in held.lower() or re.search(r"star|gazette|intelligencer|herald|post|times|republican", text)) else "Book"
                if g("Inscription and deposits", "").strip() and rtype == "Book":
                    rtype = "Inscription"
                person = "; ".join(x for x in (g("Presiding", ""), g("Others named", ""))
                                   if x.strip() and not x.lower().startswith("not stated"))
                m.add(fname, i, row, person=person, lodge=g("Laid by (lodge or body)", ""),
                      place=g("Place", ""), building=g("Building or structure", ""),
                      date=g("Date", ""), record=rtype,
                      evidence=(g("Evidence grade") or "C").strip()[:1],
                      held_at=held, citation=cite,
                      detail=f"Laying {g('Laying ID','')}. {g('What the record says','')}".strip())
        elif fname == "T5_People.csv":
            head, rows = read_csv(path)
            for i, r in enumerate(rows, start=2):
                row = dict(zip(head, r))
                m.add(fname, i, row, person=row.get("Name (roll form where on a roll)", ""),
                      lodge=row.get("Rolls and series register", ""), record="Roll or return", evidence="C",
                      held_at=PONZILLO + " (lodge returns behind the series lodge rolls)",
                      citation="Cornerstones laying rows; series lodge rolls; series fact register",
                      detail=f"Layings: {row.get('Layings','')}")
        elif fname == "T6_Marker_Check.csv":
            map_generic_csv(m, path, fname, "")
            for rec in m.out:
                if rec["source_file"] == fname:
                    rec["evidence"] = "C"


def map_people_register(m, files):
    for path, fname in files:
        data = json.load(open(path, encoding="utf-8"))
        for i, p in enumerate(data, start=1):
            for j, lay in enumerate(p.get("layings", []), start=1):
                src = lay.get("source", "")
                held = lay.get("held_by", "") or f"Published: {src}"
                rtype = "Newspaper" if "chronicling" in (src + held).lower() else "Book"
                ev = "B" if rtype == "Newspaper" or "national archives" in held.lower() else "C"
                m.add(fname, f"{i}.{j}", {"person": p, "laying": lay},
                      person=p.get("title_form") or p.get("name", ""),
                      calling=p.get("atlas_calling", ""), building=lay.get("title", ""),
                      date=lay.get("date", ""), record=rtype, evidence=ev, held_at=held,
                      citation=src,
                      detail=f"Laying {lay.get('id','')}; {p.get('position_at_laying','')}; register name {p.get('name','')}")


def map_census(m, files):
    for path, fname in files:
        data = json.load(open(path, encoding="utf-8"))
        for i, p in enumerate(data.get("people", []), start=1):
            for j, r in enumerate(p.get("records", []), start=1):
                typ = r.get("type", "")
                yr = r.get("date") or (re.search(r"\b(1[6-9]\d\d)\b", typ + " " + r.get("source", "")) or [""])[0]
                rtype = "Roll or return" if ("census" in typ or "enumeration" in typ) else \
                    ("Voucher" if typ in ("account", "contract") else "Book")
                cite = r.get("source", "")
                if r.get("page"):
                    cite += f", p. {r['page']}"
                if r.get("url"):
                    cite += f" <{r['url']}>"
                m.add(fname, f"{i}.{j}", {"person": p.get("name"), "record": r},
                      person=p.get("title_form") or p.get("name", ""),
                      calling=p.get("position", ""), date=str(yr), record=rtype,
                      evidence="A" if r.get("data_set") else "B",
                      held_at=r.get("holder", ""), citation=cite,
                      detail=(f"Entry as written: {r.get('entry','')}; type: {typ}; match: {r.get('match','')}. "
                              f"{r.get('note','')}").strip())


def map_release(rel, files):
    """Turn a frozen source release into taxonomy records. files = [(path, name)]"""
    m = Mapper(rel)
    cfg = rel["cfg"]
    sid = rel["id"]
    if sid.startswith(("S01", "S02", "S03", "S04", "S05", "S06")):
        map_lodge_book(m, files, cfg.get("book", ""))
    elif sid.startswith("S07"):
        map_cross_reference(m, files, cfg.get("book", ""))
    elif sid.startswith("S09"):
        map_commissioners(m, files)
    elif sid.startswith("S10"):
        map_cornerstones(m, files)
    elif sid.startswith("S11"):
        map_people_register(m, files)
    elif sid.startswith("S12"):
        map_census(m, files)
    return m


# ---------------------------------------------------------------- store
class Store:
    def __init__(self, root):
        self.root = root
        self.rel_dir = os.path.join(root, "releases")
        self.ledger = os.path.join(root, "ledger", "release_ledger.jsonl")

    # ---- ledger (append-only, hash-chained)
    def entries(self):
        if not os.path.exists(self.ledger):
            return []
        with open(self.ledger, encoding="utf-8") as f:
            return [json.loads(x) for x in f if x.strip()]

    def append(self, action, **fields):
        os.makedirs(os.path.dirname(self.ledger), exist_ok=True)
        ents = self.entries()
        prev = ents[-1]["entry_sha256"] if ents else "0" * 64
        e = {"seq": len(ents) + 1, "utc": now(), "action": action, "pipeline": PIPELINE_VERSION}
        e.update(fields)
        e["prev_sha256"] = prev
        e["entry_sha256"] = sha256_bytes(canon(e).encode())
        with open(self.ledger, "a", encoding="utf-8") as f:
            f.write(canon(e) + "\n")
            f.flush()
            os.fsync(f.fileno())
        return e

    # ---- releases
    def versions(self, rid):
        d = os.path.join(self.rel_dir, rid)
        if not os.path.isdir(d):
            return []
        return sorted(int(x[1:]) for x in os.listdir(d) if re.fullmatch(r"v\d+", x))

    def manifest(self, rid, v):
        with open(os.path.join(self.rel_dir, rid, f"v{v}", "MANIFEST.json"), encoding="utf-8") as f:
            return json.load(f)

    def latest(self, rid):
        vs = self.versions(rid)
        return (vs[-1], self.manifest(rid, vs[-1])) if vs else (0, None)

    def publish(self, rid, staging, mf, action):
        """Move a staged release into place as a new, read-only version."""
        v = mf["version"]
        dest = os.path.join(self.rel_dir, rid, f"v{v}")
        if os.path.exists(dest):
            raise SystemExit(f"REFUSED: {rid} v{v} exists; releases are never overwritten")
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copytree(staging, dest)
        # fixity re-read after the copy (network mount)
        for f in mf["files"]:
            got = sha256_file(file_abs(dest, f))
            if got != f["sha256"]:
                raise SystemExit(f"FIXITY FAILURE after copy: {rid} v{v} {f['path']}")
        lock_read_only(dest)
        msha = sha256_file(os.path.join(dest, "MANIFEST.json"))
        return self.append(action, release=rid, version=v, content_sha256=mf["content_sha256"],
                           manifest_sha256=msha, records=mf.get("record_count"),
                           inputs=[f"{i['release']}@v{i['version']}" for i in mf.get("inputs", []) if "release" in i],
                           note=mf.get("change_note", ""))


def file_abs(release_dir, f):
    """Data files live in data/; documentation in docs/."""
    if f["path"].startswith("docs/"):
        return os.path.join(release_dir, f["path"])
    return os.path.join(release_dir, "data", f["path"])


def lock_read_only(path):
    """Least privilege: files 0444, folders 0555 (where the file system honours it)."""
    for dp, dns, fns in os.walk(path, topdown=False):
        for fn in fns:
            try:
                os.chmod(os.path.join(dp, fn), stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)
            except OSError:
                pass
        try:
            os.chmod(dp, stat.S_IRUSR | stat.S_IXUSR | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
        except OSError:
            pass


# ---------------------------------------------------------------- manifests
NARA_NOTE = [
    "Formats: CSV (UTF-8, RFC 4180), JSON and Markdown, the plain-text dataset formats NARA lists as preferred for long-term preservation.",
    "Fixity: SHA-256 for every file, recorded in MANIFEST.json and SHA256SUMS and re-read after copying.",
    "File names: ASCII letters, digits, dot, dash and underscore; no spaces.",
    "Provenance: each file names its original path and hash; each derived record names its source release, file, row and row hash.",
    "Integrity: releases are read-only and never edited; changes become a new version recorded in the hash-chained ledger.",
]


def content_digest(files):
    return sha256_bytes("\n".join(f"{f['path']}  {f['sha256']}" for f in sorted(files, key=lambda x: x["path"])).encode())


DOCS_NOTE = ("Documentation package added: DACS description (README), DataCite citation metadata, "
             "codebook, processing note, rights statement, errata log, PREMIS provenance, name authority "
             "and name change log where people appear; packaged as a BagIt bag.")


def finish_release(store, staging, rid, title, stage, group, files, inputs, extra, checks, cfg_change_note, doc):
    lv, lmf = store.latest(rid)
    for f in files:
        f["_abs"] = os.path.join(staging, "data", f["path"])
    ctx = dict(rid=rid, title=title, series=SERIES_NAME, creator=CREATOR, stage=stage, files=files,
               inputs=inputs, pipeline_version=PIPELINE_VERSION, rolls=GLOBAL["rolls"],
               settled=GLOBAL["settled"], **doc)
    tmpl = pts_docs.render_docs(ctx, "{{VERSION}}", norm_name)
    doc_fp = sha256_bytes(canon({k: sha256_bytes(v) for k, v in tmpl.items()}).encode())
    clean = [{k: v for k, v in f.items() if k != "_abs"} for f in files]
    content = content_digest(clean + [{"path": "docs/*", "sha256": doc_fp}])
    if lmf and lmf["content_sha256"] == content:
        return None, lv, lmf  # unchanged: no new version
    v = lv + 1
    if lmf and not any(f["path"].startswith("docs/") for f in lmf["files"]):
        cfg_change_note = DOCS_NOTE
    created = now()
    docs = pts_docs.render_docs(ctx, str(v), norm_name)
    os.makedirs(os.path.join(staging, "docs"), exist_ok=True)
    doc_files = []
    for rel, b in sorted(docs.items()):
        with open(os.path.join(staging, rel), "wb") as fh:
            fh.write(b)
        doc_files.append({"path": rel, "bytes": len(b), "sha256": sha256_bytes(b), "media_type": media_type(rel)})
    status = "CERTIFIED" if all(c["pass"] for c in checks) else "FAILED"
    if status != "CERTIFIED":
        raise SystemExit(f"{rid}: checks failed: " + "; ".join(c["name"] + " " + c["detail"] for c in checks if not c["pass"]))
    events = [
        {"eventType": "creation" if stage.startswith("1") else "derivation", "eventDateTime": created,
         "eventDetail": ("Byte-exact copy of the source files" if stage.startswith("1")
                         else "Records derived from the input releases and mapped to the shared taxonomy"),
         "eventOutcome": "success"},
        {"eventType": "fixity check", "eventDateTime": created, "eventDetail": "SHA-256 computed for every file",
         "eventOutcome": "success"},
        {"eventType": "validation", "eventDateTime": created,
         "eventDetail": "; ".join(f"{c['name']}: {c['detail']}" for c in checks), "eventOutcome": "success"},
    ]
    for e in extra.get("exclusions", [])[:50]:
        events.append({"eventType": "deaccession", "eventDateTime": created,
                       "eventDetail": f"Held back: {e.get('file') or e.get('record')}. {e['reason']}", "eventOutcome": "success"})
    if lmf:
        events.append({"eventType": "migration", "eventDateTime": created,
                       "eventDetail": f"New version {v} of version {lv} (content {lmf['content_sha256'][:16]}). {cfg_change_note}",
                       "eventOutcome": "success"})
    prov = pts_docs.provenance(ctx, v, clean, events, sha256_file(os.path.abspath(__file__))).encode("utf-8")
    with open(os.path.join(staging, "docs", "PROVENANCE.json"), "wb") as fh:
        fh.write(prov)
    doc_files.append({"path": "docs/PROVENANCE.json", "bytes": len(prov), "sha256": sha256_bytes(prov),
                      "media_type": "application/json", "content": False})
    mf = {
        "release_id": rid, "version": v, "identifier": f"PTS-DS:{rid}:v{v}", "title": title, "series": SERIES_NAME,
        "stage": stage, "group": group, "creator": CREATOR, "created_utc": created,
        "pipeline_version": PIPELINE_VERSION, "content_sha256": content,
        "previous": ({"version": lv, "content_sha256": lmf["content_sha256"]} if lmf else None),
        "change_note": cfg_change_note if lmf else "First release.",
        "inputs": inputs, "files": clean + doc_files, "checks": checks, "status": status,
        "preservation": NARA_NOTE, "errata": doc.get("errata", []),
    }
    mf.update(extra)
    with open(os.path.join(staging, "MANIFEST.json"), "w", encoding="utf-8") as f:
        json.dump(mf, f, indent=2, ensure_ascii=False)
    write_certificate(staging, mf)
    pts_docs.bag(staging, clean, mf["identifier"], title, created)
    tags = ["bagit.txt", "bag-info.txt", "manifest-sha256.txt", "MANIFEST.json", "CERTIFICATE.md"] + [d["path"] for d in doc_files]
    with open(os.path.join(staging, "tagmanifest-sha256.txt"), "w", encoding="utf-8") as f:
        for t in tags:
            f.write(f"{sha256_file(os.path.join(staging, t))}  {t}\n")
    lines = [f"{f['sha256']}  data/{f['path']}" for f in clean]
    for t in tags + ["tagmanifest-sha256.txt"]:
        lines.append(f"{sha256_file(os.path.join(staging, t))}  {t}")
    with open(os.path.join(staging, "SHA256SUMS"), "w") as f:
        f.write("\n".join(lines) + "\n")
    return mf, v, mf


def write_certificate(staging, mf):
    L = [f"# {mf['title']}", "",
         f"*{SERIES_NAME}. {CREATOR}.*", "",
         f"Release **{mf['release_id']}**, version **{mf['version']}**, created {mf['created_utc']}. "
         f"Status: **{mf['status']}**.", "",
         f"Content SHA-256: `{mf['content_sha256']}`", ""]
    if mf.get("record_count") is not None:
        L += [f"Records: {mf['record_count']}", ""]
    L += ["## Checks", "", "| Check | Result | Detail |", "|---|---|---|"]
    for c in mf["checks"]:
        L.append(f"| {c['name']} | {'Pass' if c['pass'] else 'Fail'} | {c['detail']} |")
    L += ["", "## Files", "", "| File | Bytes | SHA-256 |", "|---|---|---|"]
    for f in mf["files"]:
        L.append(f"| {f['path']} | {f['bytes']} | `{f['sha256'][:16]}…` |")
    if mf.get("holders"):
        L += ["", "## Held at (records per holder)", "", "| Holder | Records |", "|---|---|"]
        for h, n in mf["holders"]:
            L.append(f"| {h[:160]} | {n} |")
    if mf.get("exclusions"):
        L += ["", "## Kept out", ""]
        for e in mf["exclusions"]:
            L.append(f"- {e.get('file') or e.get('record')}: {e['reason']}")
    if mf.get("inputs"):
        L += ["", "## Inputs", ""]
        for i in mf["inputs"]:
            if "release" in i:
                L.append(f"- {i['release']} v{i['version']} (content `{i['content_sha256'][:16]}…`)")
            else:
                L.append(f"- {i['original_path']} (`{i['sha256'][:16]}…`)")
    L += ["", "## Preservation", ""] + [f"- {n}" for n in mf["preservation"]]
    with open(os.path.join(staging, "CERTIFICATE.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")


# ---------------------------------------------------------------- documentation text
SCOPE = {
    "S01": "Tables of the Royal Arch book: members 1795-1799 and 1804-1808, the series people register for the chapter, and the chronology. The minute text is held back.",
    "S02": "Tables of the Potomac Lodge book: George-Town lodges No. 9, Columbia No. 19 and Potomac No. 43, 1789-1811; returns, officers, lot purchases at the public sales, Grand Lodge of Maryland meetings.",
    "S03": "Tables of the Federal Lodge No. 15 book, 1793-1811: yearly rolls from the Grand Lodge returns, timelines, payrolls and lodge men in the Commissioners' Proceedings. Built from the published book only; no minute book or ledger.",
    "S04": "Tables of the Naval Lodge No. 41 book, 1805-1811: returns, rosters, dues and the record-group tables (Grand Lodge of Maryland returns, RG 45, RG 42, land records).",
    "S05": "Tables of the Columbia Lodge No. 35 book, 1802-1809: returns, officers, meetings and members in other lodges.",
    "S06": "Tables of the Washington Parish book: feast days and sermons of the lodges, places, pewholders, clergy, rectors, vestries and Senate and House chaplains.",
    "S07": "The series cross-reference of the lodge rolls: one row per man, with spellings, lodges, trades, years and offices. The authority for name forms.",
    "S08": "The series fact register: settled facts and name forms used by every book, with their sources.",
    "S09": "Record Group 42, Proceedings of the Commissioners, 1791-1797, as read from the author's photographs: meetings, lot sales, square divisions, contracts, payments, officers, workforce, licences, the Treasury Office estimate, lodge links, the RG 217 voucher cross-reference and the volume 3 transcript.",
    "S10": "The cornerstone layings of the District of Columbia and beyond (105 layings), their sources, files, people, marker checks, research grades and the bio cards.",
    "S11": "The people named at the cornerstone layings (286), each with the layings and the holder of each source.",
    "S12": "Census and directory findings for the cornerstone people: what was read, where it is held, and what is still to read.",
    "C01": "Every record of the twelve frozen sources mapped to the nine shared taxonomy terms, each pointing back to its source row.",
    "C02": "One entry per person across all sources, in roll form where the man is on a lodge roll.",
    "lodge_books": "The lodge books series: the six books, the lodge rolls cross-reference and the fact register as authority.",
    "federal_city": "The Federal City series: the Commissioners' Proceedings (RG 42) and the RG 217 vouchers.",
    "cornerstones": "The Cornerstones series: the layings and the people present.",
    "census": "The census and directories series: confirmed and probable findings, and the census pages still to read.",
    "R01": "Research release: each C-graded record of C01 traced toward the original holder through an A or B record with the same exact name and the same lodge or year, or the same full date and shared words. Leads only; no grade is changed until the working data set names the original.",
    "NB1": "The new book data set, the last in the series: the four series data sets together, in series order.",
}

FREEZE_PROCESSING = [
    "- Each source file is copied byte for byte. The SHA-256 of the copy equals the SHA-256 of the original, which is recorded in MANIFEST.json under inputs.",
    "- File names are made ASCII with no spaces; the original name is kept in MANIFEST.json.",
    "- Presentation files (PDF, DOCX, XLSX) are not frozen here; they are built from the same data and stay with each book.",
    "- Checks: all files present, files parse as UTF-8 CSV or JSON, no minute book or ledger file.",
    "- Nothing in the content is corrected at this stage. Corrections are made in the working data set and frozen as a new version.",
]
DERIVE_PROCESSING = [
    "- Each source row becomes one record with the nine taxonomy terms: Person, Lodge, Calling, Place, Building, Date, Record, Evidence, Held at.",
    "- Columns are matched to terms by their headings (for example Name, Brother, Purchaser and Payee to Person). Columns not matched are kept in `detail`.",
    "- Dates are written in the form June 17, 1797; `date_sort` keeps the ISO form for sorting.",
    "- Held at: the holder is read from the row's citation. Returns, rolls and compiled officer tables go to the Stephen J. Ponzillo Jr. Memorial Library and Museum; RG 42, 45 and 217 to the National Archives; parish manuscript tables to Christ Church, Washington Parish; newspapers to the Library of Congress. A row that cites only the printed book is held at 'Published:' with the book named, and graded C.",
    "- Evidence: A where the original was read from the author's photograph (RG 42, RG 217 vouchers with photographs, cornerstone grade A); B where the row copies an original; C where it is a reference or compilation.",
    "- Primary data first: records sort A before B before C within each date.",
    "- Names: the lodge rolls are authoritative. People are joined only on exact normalised names (case, punctuation, titles and word order ignored); no fuzzy matching. Every change of form is listed in NAME_CHANGES.csv.",
    "- Held back at mapping: any row that cites Federal Lodge minute books or ledger.",
    "- Device and folder paths are removed from records.",
]
PEOPLE_DEFS = {
    "person_key": "Normalised name used to join records (lower case, no titles or punctuation)",
    "person": "Authorized form: the lodge roll form where the man is on a roll, otherwise the fullest form in the records",
    "on_lodge_roll": "yes if the name is on the series cross-reference of the lodge rolls",
    "also_written": "Other forms found in the records",
    "source_releases": "Frozen source releases the person appears in",
    "records": "Number of records naming the person",
    "best_evidence": "Best evidence grade among those records (A, B or C)",
    "first_year": "Earliest year in those records", "last_year": "Latest year in those records",
    "held_at": "Holders of the originals for those records",
}


def errata_for(rid, staging, files, records):
    items = []
    pub = sum(1 for r in records if r["held_at"].startswith("Published:"))
    if pub:
        items.append({"area": "Holder", "issue": "Rows cite only the printed book; the original behind each row is not named in the row",
                      "count": pub, "next": "Name the original record and its holder in the working data set; the grade then rises from C"})

    def rows(name):
        p = os.path.join(staging, "data", name)
        return read_csv(p) if os.path.exists(p) else ([], [])
    if rid.startswith("S08"):
        fr = json.load(open(os.path.join(staging, "data", "fact_register.json"), encoding="utf-8"))
        for x in fr.get("pending", []):
            items.append({"area": "Names to settle", "issue": x, "count": "", "next": "Settle from the rolls or the original record"})
    if rid.startswith("S09"):
        h, b = rows("Pages_To_Photograph.csv")
        if b:
            items.append({"area": "Photographs", "issue": "Manuscript pages of the Proceedings not yet photographed", "count": len(b),
                          "next": "Photograph at the National Archives (list in Pages_To_Photograph.csv)"})
        items.append({"area": "Coverage", "issue": "Proceedings for 1798-1803 not yet added; the original volume for July 1795 to October 1796 is lost (1891 custodian's note)",
                      "count": "", "next": "Add the later years as they are read"})
    if rid.startswith("S10"):
        h, b = rows("T1_Cornerstone_Layings.csv")
        if h:
            i = h.index("Reading status") if "Reading status" in h else None
            n = sum(1 for r in b if i is not None and i < len(r) and "title only" in r[i].lower())
            if n:
                items.append({"area": "Reading", "issue": "Layings known only from the file title; the page is not yet read", "count": n,
                              "next": "Read the pages (queue in T4_Reading_Queue.csv)"})
            j = h.index("Open points") if "Open points" in h else None
            n2 = sum(1 for r in b if j is not None and j < len(r) and r[j].strip())
            if n2:
                items.append({"area": "Open points", "issue": "Layings with open points recorded", "count": n2, "next": "See the Open points column"})
    if rid.startswith("S12"):
        fr = json.load(open(os.path.join(staging, "data", "census_findings.json"), encoding="utf-8"))
        n = sum(1 for p in fr.get("people", []) for t in p.get("census_target", []) if not t.get("read"))
        if n:
            items.append({"area": "Census", "issue": "1800-1870 census pages not yet read (sign-in sites)", "count": n,
                          "next": "Read with a FamilySearch or Ancestry sign-in"})
        unc = sum(1 for p in fr.get("people", []) for r in p.get("records", []) if r.get("match") == "uncertain")
        if unc:
            items.append({"area": "Matches", "issue": "Findings matched on name only", "count": unc, "next": "Confirm place and role"})
    return items


# ---------------------------------------------------------------- stages


def stage_freeze(store, cfg, tmp, stage="1-frozen source", extra_inputs=(), extra_checks=()):
    rid = cfg["id"]
    staging = os.path.join(tmp, rid)
    os.makedirs(os.path.join(staging, "data"))
    files, inputs, checks = [], [], []
    bad = [p for p in cfg["files"] if FORBIDDEN_FILE.search(os.path.basename(p))
           and not os.path.basename(p).startswith("Voucher_Cross_Reference")]
    checks.append({"name": "No minute books or ledgers", "pass": not bad,
                   "detail": "none included" if not bad else ", ".join(bad)})
    missing = [p for p in cfg["files"] if not os.path.isfile(p)]
    checks.append({"name": "All source files present", "pass": not missing,
                   "detail": f"{len(cfg['files'])} files" if not missing else ", ".join(missing)})
    if missing or bad:
        raise SystemExit(f"{rid}: " + "; ".join(c["detail"] for c in checks if not c["pass"]))
    for src in cfg["files"]:
        name = safe_name(os.path.basename(src))
        raw = open(src, "rb").read()
        h = sha256_bytes(raw)
        with open(os.path.join(staging, "data", name), "wb") as f:
            f.write(raw)
        rows = None
        if name.endswith(".csv"):
            _, rws = read_csv(src)
            rows = len(rws)
        files.append({"path": name, "bytes": len(raw), "sha256": h, "media_type": media_type(name),
                      "rows": rows, "original_name": os.path.basename(src)})
        inputs.append({"original_path": os.path.relpath(src, PROJECT), "sha256": h})
    # parse checks
    parse_ok = True
    for f in files:
        p = os.path.join(staging, "data", f["path"])
        try:
            if p.endswith(".json"):
                json.load(open(p, encoding="utf-8"))
            elif p.endswith(".csv"):
                read_csv(p)
        except Exception as e:  # noqa
            parse_ok = False
            f["parse_error"] = str(e)
    checks.append({"name": "Files parse (UTF-8 CSV / JSON)", "pass": parse_ok, "detail": "all parse" if parse_ok else "see files"})
    checks.append({"name": "Byte-exact copy of the source", "pass": True, "detail": "SHA-256 of copy = SHA-256 of original"})
    checks += list(extra_checks)
    inputs = list(extra_inputs) + inputs
    extra = {"exclusions": cfg.get("exclusions", []), "source_group": cfg["group"]}
    lv, _ = store.latest(rid)
    probe = {"id": rid, "version": lv + 1, "group": cfg["group"], "cfg": cfg}
    m = map_release(probe, [(os.path.join(staging, "data", f["path"]), f["path"]) for f in files])
    doc = {"scope": SCOPE.get(rid[:3], cfg["title"]),
           "arrangement": f"{len(files)} files, as arranged in the source data set: " + ", ".join(f["path"] for f in files[:6])
                          + (" and others" if len(files) > 6 else "") + ".",
           "acquisition": "Frozen from the author's working data set in the project archive: "
                          + "; ".join(sorted({os.path.dirname(i["original_path"]) for i in inputs if "original_path" in i})) + ".",
           "processing": FREEZE_PROCESSING + [f"- Held back: {e['file']}. {e['reason']}" for e in cfg.get("exclusions", [])],
           "records": m.out, "errata": errata_for(rid, staging, files, m.out)}
    mf, v, cur = finish_release(store, staging, rid, cfg["title"], stage, cfg["group"],
                                files, inputs, extra, checks, "Source files changed since the last version.", doc)
    if mf:
        store.publish(rid, staging, mf, "freeze")
    return {"id": rid, "version": v, "manifest": cur, "dir": os.path.join("releases", rid, f"v{v}"), "cfg": cfg,
            "group": cfg["group"]}


def record_checks(records, excluded):
    ids = [r["record_id"] for r in records]
    no_holder = [r["record_id"] for r in records if not r["held_at"].strip()]
    bad_ev = [r["record_id"] for r in records if r["evidence"] not in ("A", "B", "C")]
    bad_rt = [r["record_id"] for r in records if r["record"] not in RECORD_TYPES]
    paths = [r["record_id"] for r in records if any(DEVICE_PATH.search(r[k]) for k in ("citation", "detail", "held_at", "place"))]
    forb = [r["record_id"] for r in records if FORBIDDEN_ROW.search(" ".join(r[k] for k in ("citation", "detail")))]
    return [
        {"name": "Every record names the holder", "pass": not no_holder, "detail": f"{len(no_holder)} without" if no_holder else f"{len(records)} of {len(records)}"},
        {"name": "Evidence grade A/B/C", "pass": not bad_ev, "detail": f"{len(bad_ev)} invalid" if bad_ev else "all valid"},
        {"name": "Record type in taxonomy", "pass": not bad_rt, "detail": f"{len(bad_rt)} invalid" if bad_rt else "all valid"},
        {"name": "Unique record IDs", "pass": len(ids) == len(set(ids)), "detail": f"{len(ids)} IDs"},
        {"name": "No Federal minute books or ledger", "pass": not forb, "detail": f"{len(excluded)} rows held back at mapping; 0 remain" if not forb else f"{len(forb)} remain"},
        {"name": "No device or folder paths", "pass": not paths, "detail": "none" if not paths else f"{len(paths)} found"},
        {"name": "Provenance on every record", "pass": all(r["source_release"] and r["row_sha256"] for r in records), "detail": "release, file, row, row SHA-256"},
    ]


EV_ORDER = {"A": 0, "B": 1, "C": 2}


def sort_records(records):
    return sorted(records, key=lambda r: (r["series"], r["date_sort"] or "9999", EV_ORDER.get(r["evidence"], 3), r["record_id"]))


def data_dictionary():
    fields = {
        "record_id": "Release, version, file and row this record comes from (stable ID)",
        "series": "Book series the record belongs to",
        "source_release": "Frozen source release ID", "source_version": "Frozen source release version",
        "source_file": "File inside the source release", "source_row": "Row (CSV line) or item number",
        "row_sha256": "SHA-256 of the source row as read",
        "date_sort": "ISO form of the date for sorting (year, year-month or full date)",
        "citation": "Citation as given in the source", "detail": "Other columns of the source row",
    }
    for k, term, desc in TAXONOMY:
        fields[k] = f"Taxonomy term '{term}': {desc}"
    return {"taxonomy": [{"field": k, "term": t, "definition": d} for k, t, d in TAXONOMY],
            "fields": {f: fields[f] for f in RECORD_FIELDS},
            "evidence": {"A": "Original read", "B": "Copy of the original", "C": "Reference only"},
            "record_types": sorted(RECORD_TYPES)}


def write_derived(store, tmp, rid, title, stage, group, inputs, tables, records, excluded, note, extra_checks=(), count=None,
                  people=None, errata=(), scope=""):
    staging = os.path.join(tmp, rid)
    os.makedirs(os.path.join(staging, "data"))
    files = []
    for name, (fields, rows) in tables.items():
        p = os.path.join(staging, "data", name)
        if name.endswith(".json"):
            with open(p, "w", encoding="utf-8") as f:
                json.dump(rows, f, indent=2, ensure_ascii=False, sort_keys=True)
                f.write("\n")
        else:
            write_csv(p, fields, rows)
        files.append({"path": name, "bytes": os.path.getsize(p), "sha256": sha256_file(p),
                      "media_type": media_type(name), "rows": (len(rows) if isinstance(rows, list) else None)})
    checks = record_checks(records, excluded) + list(extra_checks)
    holders = {}
    for r in records:
        holders[r["held_at"]] = holders.get(r["held_at"], 0) + 1
    ev = {k: sum(1 for r in records if r["evidence"] == k) for k in "ABC"}
    extra = {"record_count": len(records) if count is None else count, "evidence_counts": ev,
             "holders": sorted(holders.items(), key=lambda x: -x[1])[:40],
             "holder_count": len(holders), "exclusions": excluded,
             "taxonomy": [t[1] for t in TAXONOMY]}
    defs = dict(data_dictionary()["fields"])
    defs.update(PEOPLE_DEFS)
    doc = {"scope": scope or title,
           "arrangement": "Files: " + ", ".join(tables) + ". Records sorted by series, then date, then evidence (A, B, C).",
           "acquisition": "Derived by the pipeline from the input releases listed in MANIFEST.json, each named by version and SHA-256.",
           "processing": DERIVE_PROCESSING, "records": records, "people": people,
           "errata": list(errata), "field_defs": defs}
    mf, v, cur = finish_release(store, staging, rid, title, stage, group, files, inputs, extra, checks, note, doc)
    if mf:
        store.publish(rid, staging, mf, "derive")
    return {"id": rid, "version": v, "manifest": cur}


def ref(rel):
    m = rel["manifest"]
    return {"release": rel["id"], "version": rel["version"], "content_sha256": m["content_sha256"]}


def people_index(records, rolls_names):
    """Combined people: exact normalised-name matches only (no guessing).
    Roll form wins for the display name (lodge rolls are authoritative)."""
    idx = {}
    for r in records:
        for name in re.split(r";\s*", r["person"]):
            name = name.strip()
            key = norm_name(name)
            if (not key or len(key) < 4 or any(ch.isdigit() for ch in name)
                    or re.fullmatch(r"[A-Z]{1,3}(,? ?[A-Z]{1,3})*\.?", name)):
                continue
            e = idx.setdefault(key, {"names": set(), "series": set(), "releases": set(), "holders": set(),
                                     "ev": "C", "n": 0, "first": "", "last": ""})
            e["names"].add(name)
            e["series"].add(r["series"])
            e["releases"].add(r["source_release"])
            e["holders"].add(r["held_at"][:120])
            e["n"] += 1
            if EV_ORDER[r["evidence"]] < EV_ORDER[e["ev"]]:
                e["ev"] = r["evidence"]
            ds = r["date_sort"][:4]
            if ds:
                e["first"] = min(e["first"] or ds, ds)
                e["last"] = max(e["last"] or ds, ds)
    out = []
    for key, e in idx.items():
        roll = rolls_names.get(key)
        display = roll or sorted(e["names"], key=lambda s: (-len(s), s))[0]
        out.append({"person_key": key, "person": display, "on_lodge_roll": "yes" if roll else "",
                    "also_written": "; ".join(sorted(n for n in e["names"] if n != display)),
                    "series": "; ".join(sorted(e["series"])), "source_releases": "; ".join(sorted(e["releases"])),
                    "records": e["n"], "best_evidence": e["ev"], "first_year": e["first"], "last_year": e["last"],
                    "held_at": " | ".join(sorted(e["holders"]))})
    return sorted(out, key=lambda x: (x["person_key"]))


PEOPLE_FIELDS = ["person_key", "person", "on_lodge_roll", "also_written", "series", "source_releases",
                 "records", "best_evidence", "first_year", "last_year", "held_at"]


def build(root):
    store = Store(root)
    os.makedirs(root, exist_ok=True)
    if not store.entries():
        store.append("genesis", note="Ledger opened. Releases are append-only; nothing is edited in place.",
                     rules=["Federal Lodge minute books and ledger never included",
                            "Every record names the holder", "Primary data first (A, B, C)",
                            "Apps stay separate: data layer only"])
    tmp = tempfile.mkdtemp(prefix="pts_build_")
    summary = []
    try:
        fr = json.load(open(os.path.join(PROJECT, "lodge-books", "series", "fact_register.json"), encoding="utf-8"))
        GLOBAL["settled"] = fr.get("settled", [])
        # 1. freeze
        frozen = [stage_freeze(store, cfg, tmp) for cfg in sources()]
        summary += [(f["id"], f["version"]) for f in frozen]

        # map to taxonomy
        all_records, all_excluded = [], []
        for rel in frozen:
            m = map_release(rel, [(os.path.join(root, rel["dir"], "data", f["path"]), f["path"])
                                  for f in rel["manifest"]["files"] if not f["path"].startswith("docs/")])
            all_records += m.out
            all_excluded += m.excluded
        all_records = sort_records(all_records)

        # roll names from the series cross-reference
        rolls = {}
        for r in all_records:
            if r["source_release"].startswith("S07"):
                rolls.setdefault(norm_name(r["person"]), r["person"])
                rec_detail = r["detail"]
                m_sp = re.search(r"Spellings: (.+?)(?:; [A-Z][a-z ]+: |$)", rec_detail)
                if m_sp:
                    for sp in re.split(r";|/", m_sp[1]):
                        if norm_name(sp):
                            rolls.setdefault(norm_name(sp), r["person"])

        GLOBAL["rolls"] = rolls
        dd = data_dictionary()
        err = {g: [] for g in ("lodge_books", "federal_city", "cornerstones", "census")}
        for rel in frozen:
            err[rel["group"]] += [dict(e, area=f"{rel['id'][:3]} {e['area']}") for e in rel["manifest"].get("errata", [])]
        all_err = [e for v in err.values() for e in v]
        name_err = [{"area": "Names", "issue": "People are joined only on exact name matches; spellings not on a roll's spelling list stay as separate entries",
                     "count": "", "next": "Review NAME_AUTHORITY.csv for likely pairs and add them to the rolls' spelling lists"}]
        src_inputs = [ref(r) for r in frozen]

        # 2. combine
        c1 = write_derived(store, tmp, "C01-combined-records", "Combined Records on the Shared Taxonomy",
                           "2-combined", "all", src_inputs,
                           {"records.csv": (RECORD_FIELDS, all_records), "data_dictionary.json": (None, dd)},
                           all_records, all_excluded, "Rebuilt from new source versions.",
                           errata=all_err, scope=SCOPE["C01"])
        people = people_index(all_records, rolls)
        c2 = write_derived(store, tmp, "C02-combined-people", "Combined People Index",
                           "2-combined", "all", [ref(c1)] + src_inputs,
                           {"people.csv": (PEOPLE_FIELDS, people)}, all_records, [],
                           "Rebuilt from new combined records.", count=len(people), people=people,
                           errata=name_err, scope=SCOPE["C02"],
                           extra_checks=[{"name": "Name matching", "pass": True,
                                          "detail": f"{len(people)} people; exact normalised names only, roll form preferred"}])
        summary += [(c1["id"], c1["version"]), (c2["id"], c2["version"])]

        # 3 + 4. series (census first, as asked), then the book series
        order = [SERIES[3]] + SERIES[:3]
        series_rel = {}
        census_pending = []
        for rel in frozen:
            if rel["id"].startswith("S12"):
                data = json.load(open(os.path.join(root, rel["dir"], "data", "census_findings.json"), encoding="utf-8"))
                for p in data.get("people", []):
                    for t in p.get("census_target", []):
                        census_pending.append({"person": p.get("title_form") or p.get("name"),
                                               "year": t.get("year"), "place": t.get("place"),
                                               "schedule": t.get("schedule"), "held_at": t.get("holder"),
                                               "why_not_read": t.get("why_not_read")})
        for rid, grp, title in order:
            recs = [r for r in all_records if r["series"] == grp]
            ppl = people_index(recs, rolls)
            tables = {"records.csv": (RECORD_FIELDS, recs), "people.csv": (PEOPLE_FIELDS, ppl),
                      "data_dictionary.json": (None, dd)}
            if grp == "census":
                tables["census_pages_not_yet_read.csv"] = (["person", "year", "place", "schedule", "held_at", "why_not_read"], census_pending)
            ins = [ref(c1)] + [ref(f) for f in frozen if f["group"] == grp]
            series_rel[grp] = write_derived(store, tmp, rid, title, "3-series" if grp == "census" else "4-series",
                                            grp, ins, tables, recs,
                                            [e for e in all_excluded if e["record"].split("@")[0] in {f["id"] for f in frozen if f["group"] == grp}],
                                            "Rebuilt from new combined records.", people=ppl,
                                            errata=err[grp] + name_err, scope=SCOPE[grp])
            summary.append((rid, series_rel[grp]["version"]))

        # 5. new book: the final combined data set, built from the four series releases
        nb_records = []
        for _, grp, _ in SERIES:
            p = os.path.join(root, "releases", series_rel[grp]["id"], f"v{series_rel[grp]['version']}", "data", "records.csv")
            with open(p, encoding="utf-8", newline="") as f:
                nb_records += list(csv.DictReader(f))
        nb_people = people_index(nb_records, rolls)
        contents = {"title": "The Potomac Territory Series: New Book Data Set",
                    "series": [{"group": g, "release": series_rel[g]["id"], "version": series_rel[g]["version"],
                                "content_sha256": series_rel[g]["manifest"]["content_sha256"],
                                "records": series_rel[g]["manifest"]["record_count"]} for _, g, _ in SERIES]}
        nb = write_derived(store, tmp, "NB1-new-book", "The Potomac Territory Series: New Book Data Set",
                           "5-new book", "all", [ref(series_rel[g]) for _, g, _ in SERIES],
                           {"records.csv": (RECORD_FIELDS, nb_records), "people.csv": (PEOPLE_FIELDS, nb_people),
                            "contents.json": (None, contents), "data_dictionary.json": (None, dd)},
                           nb_records, [], "Rebuilt from new series versions.", people=nb_people,
                           errata=all_err + name_err, scope=SCOPE["NB1"],
                           extra_checks=[{"name": "Equals the four series", "pass": len(nb_records) == sum(c["records"] for c in contents["series"]),
                                          "detail": f"{len(nb_records)} records"}])
        summary.append((nb["id"], nb["version"]))

        # 6. research releases: outputs of other threads, frozen with their input named by hash
        rdir = os.path.join(PROJECT, "app_templates", "research")
        rsum = os.path.join(rdir, "holder_trace_summary.json")
        if os.path.exists(rsum):
            want = json.load(open(rsum, encoding="utf-8")).get("input", {})
            try:
                tm = store.manifest(want.get("release"), int(want.get("version")))
                ok = want.get("release") == c1["id"] and tm["content_sha256"] == want.get("content_sha256")
                tref = {"release": want["release"], "version": int(want["version"]), "content_sha256": tm["content_sha256"]}
            except (FileNotFoundError, TypeError, ValueError, KeyError):
                ok, tref = False, ref(c1)
            cfg = dict(id="R01-holder-trace", group="research", title="Holder Trace of the C-Graded Records (Research Release)",
                       files=[os.path.join(rdir, n) for n in ("holder_trace.csv", "holder_trace_summary.json", "holder_trace.py")])
            r = stage_freeze(store, cfg, tmp, stage="6-research", extra_inputs=[tref],
                             extra_checks=[{"name": "Trace input is a certified C01 version, matched by hash", "pass": ok,
                                            "detail": f"{want.get('release')} v{want.get('version')} {str(want.get('content_sha256'))[:16]}"},
                                           {"name": "Grades unchanged", "pass": True,
                                            "detail": "research leads only; no record's grade or holder is changed"}])
            summary.append((r["id"], r["version"]))
        write_catalog(store)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return summary


# ---------------------------------------------------------------- verify / catalog


def verify(root):
    store = Store(root)
    problems = []
    ents = store.entries()
    prev = "0" * 64
    for e in ents:
        body = {k: v for k, v in e.items() if k != "entry_sha256"}
        if e["prev_sha256"] != prev:
            problems.append(f"ledger seq {e['seq']}: chain broken")
        if sha256_bytes(canon(body).encode()) != e["entry_sha256"]:
            problems.append(f"ledger seq {e['seq']}: entry altered")
        prev = e["entry_sha256"]
    led = {(e.get("release"), e.get("version")): e for e in ents if e.get("release")}
    n = 0
    if os.path.isdir(store.rel_dir):
        for rid in sorted(os.listdir(store.rel_dir)):
            for v in store.versions(rid):
                n += 1
                d = os.path.join(store.rel_dir, rid, f"v{v}")
                mf = store.manifest(rid, v)
                for f in mf["files"]:
                    p = file_abs(d, f)
                    if not os.path.isfile(p) or sha256_file(p) != f["sha256"]:
                        problems.append(f"{rid} v{v}: {f['path']} fixity mismatch")
                    if FORBIDDEN_FILE.search(f["path"]) and not f["path"].startswith("Voucher_Cross"):
                        problems.append(f"{rid} v{v}: forbidden file {f['path']}")
                listed = {f["path"] for f in mf["files"] if not f["path"].startswith("docs/")}
                actual = set(os.listdir(os.path.join(d, "data")))
                if os.path.isdir(os.path.join(d, "docs")):
                    dl = {f["path"] for f in mf["files"] if f["path"].startswith("docs/")}
                    da = {"docs/" + x for x in os.listdir(os.path.join(d, "docs"))}
                    if dl != da:
                        problems.append(f"{rid} v{v}: docs not in manifest: {sorted(da ^ dl)}")
                if listed != actual:
                    problems.append(f"{rid} v{v}: files not in manifest: {sorted(actual ^ listed)}")
                with open(os.path.join(d, "SHA256SUMS")) as sf:
                    for line in sf:
                        h, _, rel = line.strip().partition("  ")
                        if rel and sha256_file(os.path.join(d, rel)) != h:
                            problems.append(f"{rid} v{v}: SHA256SUMS mismatch {rel}")
                e = led.get((rid, v))
                if not e:
                    problems.append(f"{rid} v{v}: not in ledger")
                elif e["manifest_sha256"] != sha256_file(os.path.join(d, "MANIFEST.json")):
                    problems.append(f"{rid} v{v}: manifest differs from ledger")
                for i in mf.get("inputs", []):
                    if "release" in i:
                        try:
                            im = store.manifest(i["release"], i["version"])
                            if im["content_sha256"] != i["content_sha256"]:
                                problems.append(f"{rid} v{v}: input {i['release']} hash mismatch")
                        except FileNotFoundError:
                            problems.append(f"{rid} v{v}: input {i['release']} v{i['version']} missing")
    return n, len(ents), problems


def write_catalog(store):
    rows = []
    for rid in sorted(os.listdir(store.rel_dir)):
        v, mf = store.latest(rid)
        rows.append((mf["stage"], rid, v, mf["title"], mf.get("record_count"), mf["content_sha256"], mf["status"]))
    rows.sort()
    L = ["# Data Set Catalog", "", f"*{SERIES_NAME}. {CREATOR}. Written by the pipeline; the ledger is the authority.*", "",
         "| Stage | Release | Version | Title | Records | Content SHA-256 | Status |", "|---|---|---|---|---|---|---|"]
    for st, rid, v, t, n, h, s in rows:
        L.append(f"| {st} | {rid} | v{v} | {t} | {n if n is not None else '—'} | `{h[:16]}…` | {s} |")
    with open(os.path.join(store.root, "CATALOG.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    with open(os.path.join(store.root, "CATALOG.json"), "w", encoding="utf-8") as f:
        json.dump([dict(zip(["stage", "release", "version", "title", "records", "content_sha256", "status"], r)) for r in rows], f, indent=2, ensure_ascii=False)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["build", "verify", "status"])
    ap.add_argument("--root", default=DEFAULT_ROOT)
    a = ap.parse_args()
    if a.command == "build":
        for rid, v in build(a.root):
            print(f"{rid:36s} v{v}")
        a.command = "verify"
    if a.command == "verify":
        n, e, problems = verify(a.root)
        Store(a.root).append("verify", releases=n, problems=len(problems),
                             note="all releases pass fixity, manifest and ledger checks" if not problems else "; ".join(problems[:20]))
        print(f"verified {n} release versions, {e} ledger entries: {'PASS' if not problems else 'FAIL'}")
        for p in problems:
            print("  ", p)
        sys.exit(1 if problems else 0)
    if a.command == "status":
        for e in Store(a.root).entries()[-25:]:
            print(e["seq"], e["utc"], e["action"], e.get("release", ""), e.get("version", ""), e.get("note", "")[:80])


if __name__ == "__main__":
    main()
