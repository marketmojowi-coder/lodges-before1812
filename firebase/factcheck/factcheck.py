#!/usr/bin/env python3
"""Civic Atlas fact check. Read-only: it opens the records file and the series fact register,
checks every record against them, and writes a report. It never changes or adds records.

  python3 factcheck.py --data app_data.json --register fact_register.json [--people People_Cross_Reference.csv] --out DIR
  python3 factcheck.py --selftest      (used by GitHub; needs no private data)

Checks
  1 Integrity    record count and SHA-256 seal match the file's own meta block
  2 Citation     every record has a citation; every origin code names a holder of the original
  3 Primary      share of records traced to a primary record (archive, library, newspaper, lodge return)
  4 Series rules every rule and wrong record-name in the fact register, run over every record's text
  5 Private      no Federal minute books or ledger, no Royal Arch minutes (only the words "(lodge records)")
  6 Names        each man in the app matches a name or spelling on the lodge rolls cross-reference
  7 Years        every year falls between 1700 and 1870
Exit code 1 when an error-level finding exists.
"""
import argparse, csv, hashlib, json, re, sys, datetime, os

PRIMARY = {"GLMD_RET", "GLMD_PROC", "NARA_RG42", "NARA_RG45", "LOC_MSS", "CHRIST_CH", "NEWS", "DC_DEEDS", "NAVY_LIB"}
SECONDARY = {"BOOK", "PRINTED", "AUTHOR_WB"}
PRIVATE = [  # lodge property: never in the app
    (r"Federal Lodge[^.]{0,60}\b(minute book|minutes|ledger)\b(?![^.]{0,40}lodge records)", "Federal Lodge minute book or ledger quoted"),
    (r"Royal Arch[^.]{0,40}\bminutes?\b(?![^.]{0,40}lodge records)", "Royal Arch minutes quoted"),
]
VERBATIM_KINDS = {"Roll or return", "Roll entry"}  # rolls are transcribed as written
QUOTED = re.compile(r"[\"“][^\"”]{0,400}[\"”]")
PRIVATE_KINDS = {"Lodge minutes", "Minute entry", "Ledger entry"}


def rec_text(r):
    parts = [r.get("t", ""), r.get("c", ""), r.get("od", "")]
    # the Spellings field lists every form on the rolls on purpose, so it is not checked
    parts += [str(v) for kv in r.get("f", []) if kv[0] != "Spellings" for v in kv[1:]]
    return " | ".join(p for p in parts if p)


def norm(n):
    return re.sub(r"[^a-z ]", "", re.sub(r",?\s*(jr|sr|jun|sen)\.?$", "", n.lower().replace(".", " "))).split()


def check(data, register, people, raw_bytes):
    F = []  # findings: (level, check, where, message, cite)
    recs, meta = data["recs"], data.get("meta", {})
    stats = {"records": len(recs)}

    # 1 integrity
    if meta.get("count") != len(recs):
        F.append(("error", "Integrity", "meta", f"meta.count {meta.get('count')} but {len(recs)} records", "app_data.json meta"))
    seal = hashlib.sha256(json.dumps(recs, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    stats["seal_recomputed"] = seal
    stats["seal_matches"] = seal == meta.get("sha256")
    stats["file_sha256"] = hashlib.sha256(raw_bytes).hexdigest()

    # 2 citation + 3 primary
    repos = data.get("repos", {})
    for o in sorted({r.get("o", "") for r in recs}):
        if o not in repos:
            F.append(("error", "Citation", o, "origin code has no entry in the holders list", ""))
        elif o in PRIMARY and not repos[o].get("holder") and o != "NEWS":
            F.append(("error", "Citation", o, "primary origin names no holder of the original", ""))
    nocite = [i for i, r in enumerate(recs) if not r.get("c", "").strip()]
    for i in nocite:
        F.append(("error", "Citation", f"record {i}", "record has no citation", ""))
    prim = sum(1 for r in recs if r.get("o") in PRIMARY)
    stats.update(cited=len(recs) - len(nocite), primary=prim, secondary=len(recs) - prim)
    by_origin = {}
    for r in recs:
        by_origin[r.get("o", "")] = by_origin.get(r.get("o", ""), 0) + 1
    stats["by_origin"] = by_origin

    # 4 series rules
    rules = register.get("rules", [])
    wrong = [(w, n["right"], n.get("source", "")) for n in register.get("names_of_records", []) for w in n.get("wrong", [])
             if not w.startswith("Thomas Saharsky without")]
    texts = [rec_text(r) for r in recs]
    for i, (r, tx) in enumerate(zip(recs, texts)):
        where = f"record {i}: {r.get('t','')[:50]} ({r.get('s','')[:40]})"
        for rule in (rules if r.get("k") != "Settled fact" else []):  # the register's own entries state the rule
            m = re.search(rule["bad"], tx, re.I if rule.get("i") else 0)
            if m:
                if rule.get("unless") and re.search(rule["unless"], tx):
                    continue
                if rule.get("severity") != "error" and (r.get("k") in VERBATIM_KINDS or
                        any(q.start() <= m.start() < q.end() for q in QUOTED.finditer(tx))):
                    stats["verbatim_ok"] = stats.get("verbatim_ok", 0) + 1
                    continue  # spelling inside a roll or a quotation is kept as written
                F.append((rule.get("severity", "review"), "Series rule " + rule["id"], where, rule.get("why", ""), r.get("c", "")))
        for w, right, src in wrong:
            if w in tx:
                F.append(("error", "Record name", where, f'"{w}" should read "{right}"', src))
        # 5 private
        if r.get("k") in PRIVATE_KINDS:
            F.append(("error", "Private records", where, f"record kind '{r.get('k')}' is lodge property", r.get("c", "")))
        for pat, msg in PRIVATE:
            if re.search(pat, tx, re.I) and r.get("o") not in PRIMARY:
                F.append(("review", "Private records", where, msg + " (check it is only cited as lodge records)", r.get("c", "")))
        # 7 years
        for y in r.get("y", []):
            if not (1700 <= int(y) <= 1870):
                F.append(("review", "Years", where, f"year {y} outside 1700-1870", r.get("c", "")))

    # 6 names against the rolls
    if people is not None:
        known = set()
        for p in people:
            for s in [p["Name"]] + p.get("Spellings", "").split(";"):
                if s.strip():
                    known.add(" ".join(norm(s)))
        miss = [m["n"] for m in data.get("men", []) if " ".join(norm(m["n"])) not in known]
        stats["men"] = len(data.get("men", []))
        stats["men_on_rolls"] = stats["men"] - len(miss)
        for n in miss:
            F.append(("review", "Names", n, "not found as a name or spelling on the lodge rolls cross-reference",
                      "Proto Lodges of the Potomac Area, 1787-1811, register of lodge members"))
    return F, stats


def report(F, stats, args):
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%B %d, %Y, %H:%M UTC")
    err = [f for f in F if f[0] == "error"]; rev = [f for f in F if f[0] != "error"]
    pct = lambda a, b: f"{100*a/b:.1f}%" if b else "n/a"
    L = ["# Civic Atlas fact check", "", f"Run {now}. Read-only: no record was added or changed.", "",
         "## Summary", "",
         f"| Check | Result |", "|---|---|",
         f"| Records checked | {stats['records']:,} |",
         f"| Record count matches the file | {'yes' if not any(f[1]=='Integrity' for f in F) else 'NO'} |",
         f"| Seal (SHA-256 of the records) matches | {'yes' if stats['seal_matches'] else 'no (recomputed seal shown below)'} |",
         f"| Records with a citation | {stats['cited']:,} ({pct(stats['cited'], stats['records'])}) |",
         f"| Traced to a primary record | {stats['primary']:,} ({pct(stats['primary'], stats['records'])}) |",
         f"| Taken from the series books and printed works | {stats['secondary']:,} |"]
    if "men" in stats:
        L.append(f"| Men matched to the lodge rolls | {stats['men_on_rolls']} of {stats['men']} |")
    L.append(f"| Old spellings left as written inside rolls or quotations | {stats.get('verbatim_ok', 0)} |")
    L += [f"| Errors | {len(err)} |", f"| Items to review | {len(rev)} |", "",
          "## Records by holder of the original", "", "| Origin | Records | Kind |", "|---|---|---|"]
    for o, n in sorted(stats["by_origin"].items(), key=lambda x: -x[1]):
        L.append(f"| {o} | {n:,} | {'primary' if o in PRIMARY else 'secondary'} |")
    for title, rows in (("Errors", err), ("To review", rev)):
        L += ["", f"## {title}", ""]
        if not rows:
            L.append("None."); continue
        L += ["| Check | Where | Finding | Citation |", "|---|---|---|---|"]
        for lv, ck, wh, msg, c in rows:
            L.append(f"| {ck} | {wh.replace('|','/')} | {msg.replace('|','/')} | {c.replace('|','/')[:160]} |")
    L += ["", "## Sources of the checks", "",
          "- Series fact register (settled facts, rules, record names): lodge-books/series/fact_register.json",
          "- Lodge rolls cross-reference: Thomas M. Saharsky, *Proto Lodges of the Potomac Area, 1787–1811* (2026), register of lodge members (thesis/People_Cross_Reference.csv)",
          "- Holders of the originals: the app's own holders list (National Archives, Library of Congress, Stephen J. Ponzillo Jr. Memorial Library and Museum, Christ Church Washington Parish, and others)",
          "", f"File SHA-256: `{stats['file_sha256']}`  ", f"Recomputed seal: `{stats['seal_recomputed']}`", ""]
    return "\n".join(L)


def selftest():
    data = {"meta": {"count": 2}, "repos": {"NARA_RG42": {"holder": "National Archives"}, "BOOK": {}},
            "recs": [{"t": "Payroll", "c": "RG 42", "o": "NARA_RG42", "y": [1793], "f": [["Note", "Posner Library copy"]]},
                     {"t": "Roll", "c": "", "o": "BOOK", "y": [1999], "f": []}],
            "men": [{"n": "Robert Brown"}, {"n": "Nobody Here"}]}
    reg = {"rules": [{"id": "sayers", "bad": "Sayers", "severity": "error"}],
           "names_of_records": [{"right": "Stephen J. Ponzillo Jr. Memorial Library and Museum", "wrong": ["Posner Library"]}]}
    people = [{"Name": "Robert Brown", "Spellings": "Robert Brown"}]
    F, s = check(data, reg, people, b"x")
    got = {(f[0], f[1]) for f in F}
    need = {("error", "Record name"), ("error", "Citation"), ("review", "Years"), ("review", "Names")}
    assert need <= got, got
    assert s["primary"] == 1 and s["men_on_rolls"] == 1
    print("self-test passed:", len(F), "findings as expected")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data"); ap.add_argument("--register"); ap.add_argument("--people"); ap.add_argument("--out", default=".")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    raw = open(a.data, "rb").read()
    data = json.loads(raw); reg = json.load(open(a.register, encoding="utf-8"))
    people = list(csv.DictReader(open(a.people, encoding="utf-8-sig"))) if a.people else None
    F, stats = check(data, reg, people, raw)
    os.makedirs(a.out, exist_ok=True)
    md = report(F, stats, a)
    open(os.path.join(a.out, "Fact_Check_Report.md"), "w", encoding="utf-8").write(md)
    with open(os.path.join(a.out, "fact_check_findings.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh); w.writerow(["level", "check", "where", "finding", "citation"]); w.writerows(F)
    e = sum(1 for f in F if f[0] == "error")
    print(f"{stats['records']} records; {stats['primary']} primary; {e} errors; {len(F)-e} to review; seal match {stats['seal_matches']}")
    sys.exit(1 if e else 0)


if __name__ == "__main__":
    main()
