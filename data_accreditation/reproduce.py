#!/usr/bin/env python3
"""Independent reproduction test for the Potomac Territory Series data releases.

Read-only on the certified store. It never writes to releases/ or the ledger.

Test 1, fixity: every certified file, manifest and ledger entry is re-checked
(the pipeline's own verify, called without its ledger write).

Test 2, pinned reproduction: the certified source releases (S01-S12, latest
versions) are copied into an empty folder, a fresh copy of the pipeline is
run there, and every data file it rebuilds (C01, C02, SER1-SER4, NB1) must
match the certified SHA-256 byte for byte.

Test 3, source drift: today's working files are hashed and compared with the
frozen copies. A change is not a failure; it means the next build writes a
new version.

    python3 -I reproduce.py [--root DATA_RELEASES] [--out REPORT_DIR]

Exit code 0 only when tests 1 and 2 pass.
"""
import argparse
import contextlib
import datetime
import hashlib
import importlib.util
import io
import json
import os
import platform
import shutil
import sys
import tempfile

DEFAULT_ROOT = "/mnt/project-files/data_releases"


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def load_tool(tool_src, clean):
    """Copy the pipeline into the clean folder and import that copy."""
    tdir = os.path.join(clean, "tool")
    os.makedirs(tdir)
    hashes = {}
    for name in ("potomac_data.py", "pts_docs.py"):
        shutil.copyfile(os.path.join(tool_src, name), os.path.join(tdir, name))
        hashes[name] = sha(os.path.join(tdir, name))
    sys.path.insert(0, tdir)
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location("potomac_data", os.path.join(tdir, "potomac_data.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod, hashes


def data_files(mf):
    return [f for f in mf["files"] if not f["path"].startswith("docs/")]


def certified_tool_sha(store, rid, v):
    p = os.path.join(store.rel_dir, rid, f"v{v}", "docs", "PROVENANCE.json")
    try:
        for a in json.load(open(p, encoding="utf-8"))["agents"]:
            if a.get("agentType") == "software":
                return a.get("agentNote", "").rsplit(" ", 1)[-1]
    except (OSError, KeyError, ValueError):
        pass
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=DEFAULT_ROOT)
    ap.add_argument("--tool", default=None, help="pipeline folder (default ROOT/_tool)")
    ap.add_argument("--out", default=None, help="report folder (default ROOT/accreditation/reproduction)")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    tool_src = a.tool or os.path.join(root, "_tool")
    out = a.out or os.path.join(root, "accreditation", "reproduction")
    started = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    clean = tempfile.mkdtemp(prefix="pts_repro_")
    try:
        pd, tool_hashes = load_tool(tool_src, clean)
        store = pd.Store(root)

        # ---- Test 1: fixity of the certified store (no ledger write)
        n_rel, n_led, problems = pd.verify(root)
        t1 = {"release_versions": n_rel, "ledger_entries": n_led, "problems": problems, "pass": not problems}

        # ---- certified latest versions
        latest = {}
        for rid in sorted(os.listdir(store.rel_dir)):
            v, mf = store.latest(rid)
            if mf:
                latest[rid] = (v, mf)

        # ---- Test 3: source drift (live working files vs frozen copies)
        live_cfgs = pd.sources()
        drift = []
        for cfg in live_cfgs:
            v, mf = latest[cfg["id"]]
            frozen = {f["path"]: f["sha256"] for f in data_files(mf)}
            live = {}
            for p in cfg["files"]:
                if os.path.isfile(p):
                    live[pd.safe_name(os.path.basename(p))] = sha(p)
            changed = sorted(k for k in frozen if k in live and live[k] != frozen[k])
            added = sorted(set(live) - set(frozen))
            removed = sorted(set(frozen) - set(live))
            drift.append({"release": cfg["id"], "certified_version": v,
                          "changed": changed, "added": added, "removed": removed,
                          "status": "UNCHANGED" if not (changed or added or removed) else "SOURCE CHANGED"})

        # ---- Test 2: pinned reproduction in a clean folder
        proj = os.path.join(clean, "project")
        src_root = os.path.join(proj, "frozen_sources")
        pinned = []
        copy_ok = True
        for cfg in live_cfgs:
            rid = cfg["id"]
            v, mf = latest[rid]
            dest = os.path.join(src_root, rid)
            os.makedirs(dest)
            files = []
            for f in data_files(mf):
                src = os.path.join(store.rel_dir, rid, f"v{v}", "data", f["path"])
                dp = os.path.join(dest, f["path"])
                shutil.copyfile(src, dp)
                if sha(dp) != f["sha256"]:
                    copy_ok = False
                files.append(dp)
            pinned.append(dict(cfg, files=files))
        # the fact register the pipeline reads for its settled decisions: the frozen S08 copy
        fr_dir = os.path.join(proj, "lodge-books", "series")
        os.makedirs(fr_dir)
        shutil.copyfile(os.path.join(src_root, "S08-fact-register", "fact_register.json"),
                        os.path.join(fr_dir, "fact_register.json"))
        pd.PROJECT = proj
        pd.sources = lambda: pinned
        new_root = os.path.join(clean, "rebuild")
        # Records carry their source release's version number, so the empty store is told to
        # number each release as the certified one. Nothing else about the build is changed.
        seed = {rid: v for rid, (v, _) in latest.items()}
        real_latest = pd.Store.latest

        def seeded_latest(self, rid):
            got = real_latest(self, rid)
            if self.root == new_root and got[1] is None and rid in seed:
                return seed[rid] - 1, None
            return got

        pd.Store.latest = seeded_latest
        with contextlib.redirect_stdout(io.StringIO()):
            pd.build(new_root)
        new_store = pd.Store(new_root)
        rows = []
        for rid, (v, mf) in latest.items():
            if rid.startswith("R"):
                continue  # research releases are frozen outputs of another thread, not rebuilt here
            nv, nmf = new_store.latest(rid)
            cert = {f["path"]: f["sha256"] for f in data_files(mf)}
            got = {f["path"]: f["sha256"] for f in data_files(nmf)} if nmf else {}
            files = []
            for p in sorted(set(cert) | set(got)):
                files.append({"file": p, "certified": cert.get(p), "rebuilt": got.get(p),
                              "match": cert.get(p) is not None and cert.get(p) == got.get(p)})
            rows.append({"release": rid, "certified_version": v, "stage": mf["stage"],
                         "records_certified": mf.get("record_count"), "records_rebuilt": nmf.get("record_count") if nmf else None,
                         "files": files, "match": bool(files) and all(x["match"] for x in files)})
        n2, _, p2 = pd.verify(new_root)
        t2 = {"source_copies_fixity": copy_ok, "rebuild_self_verify": not p2, "releases": rows,
              "pass": copy_ok and not p2 and all(r["match"] for r in rows)}

        cert_tool = {rid: certified_tool_sha(store, rid, v) for rid, (v, _) in latest.items()}
        result = {
            "test": "Independent reproduction test, Potomac Territory Series data releases",
            "run_utc": started,
            "environment": {"python": platform.python_version(), "platform": platform.platform(),
                            "isolated_mode": bool(sys.flags.isolated)},
            "pipeline_used": {"version": pd.PIPELINE_VERSION, "sha256": tool_hashes},
            "pipeline_recorded_in_certified_releases": sorted({h for h in cert_tool.values() if h}),
            "test1_fixity": t1, "test2_pinned_reproduction": t2, "test3_source_drift": drift,
            "overall": "PASS" if t1["pass"] and t2["pass"] else "FAIL",
        }
    finally:
        shutil.rmtree(clean, ignore_errors=True)

    os.makedirs(out, exist_ok=True)
    stamp = started.replace(":", "").replace("-", "")
    jpath = os.path.join(out, f"reproduction_{stamp}.json")
    with open(jpath, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    mpath = os.path.join(out, f"Reproduction_Report_{stamp}.md")
    with open(mpath, "w", encoding="utf-8") as f:
        f.write(report_md(result))
    for p in (jpath, mpath):  # record the report's own fixity
        with open(os.path.join(out, "SHA256SUMS"), "a", encoding="utf-8") as f:
            f.write(f"{sha(p)}  {os.path.basename(p)}\n")
    print(f"{result['overall']}: fixity {'pass' if t1['pass'] else 'FAIL'} ({t1['release_versions']} versions, "
          f"{t1['ledger_entries']} ledger entries); reproduction {'pass' if t2['pass'] else 'FAIL'} "
          f"({sum(r['match'] for r in t2['releases'])}/{len(t2['releases'])} releases byte-identical); "
          f"sources changed since freeze: {sum(d['status'] != 'UNCHANGED' for d in drift)}")
    print(mpath)
    sys.exit(0 if result["overall"] == "PASS" else 1)


def report_md(r):
    t1, t2 = r["test1_fixity"], r["test2_pinned_reproduction"]
    L = ["# Independent Reproduction Test", "",
         "*The Potomac Territory Series. Thomas M. Saharsky, author and archivist.*", "",
         f"Run {r['run_utc']}. Result: **{r['overall']}**.", "",
         f"Python {r['environment']['python']} on {r['environment']['platform']}; isolated mode: "
         f"{'yes' if r['environment']['isolated_mode'] else 'no'}. "
         f"Pipeline {r['pipeline_used']['version']}, `potomac_data.py` SHA-256 `{r['pipeline_used']['sha256']['potomac_data.py']}`.", "",
         "## Method", "",
         "1. **Fixity.** Every certified file, manifest, checksum list and ledger entry was read again and checked.",
         "2. **Pinned reproduction.** The certified source releases were copied into an empty temporary folder. "
         "A fresh copy of the pipeline rebuilt every combined, series and new-book release there, numbering each "
         "release as the certified one (records carry their source's version number). "
         "Each rebuilt data file was compared with the certified file by SHA-256 (FIPS 180-4). "
         "Documentation files carry dates and version numbers, so only data files are compared.",
         "3. **Source drift.** Today's working files were compared with the frozen copies. A change here is not a "
         "failure; it means the next build will write a new version.", "",
         "## 1. Fixity", "",
         f"{t1['release_versions']} release versions and {t1['ledger_entries']} ledger entries checked: "
         f"**{'PASS' if t1['pass'] else 'FAIL'}**.", ""]
    L += [f"- {p}" for p in t1["problems"]]
    L += ["## 2. Pinned reproduction", "",
          f"Source copies matched their certified hashes: {'yes' if t2['source_copies_fixity'] else 'NO'}. "
          f"Rebuilt store passed its own verify: {'yes' if t2['rebuild_self_verify'] else 'NO'}.", "",
          "| Release | Certified version | Records (certified / rebuilt) | Data files matched | Result |",
          "|---|---|---|---|---|"]
    for x in t2["releases"]:
        nm = sum(f["match"] for f in x["files"])
        rc = x["records_certified"]
        L.append(f"| {x['release']} | v{x['certified_version']} | "
                 f"{'—' if rc is None else rc} / {'—' if x['records_rebuilt'] is None else x['records_rebuilt']} | "
                 f"{nm} of {len(x['files'])} | {'Identical' if x['match'] else 'DIFFERS'} |")
    bad = [(x["release"], f) for x in t2["releases"] for f in x["files"] if not f["match"]]
    if bad:
        L += ["", "Files that differ:", ""]
        L += [f"- {rid} `{f['file']}`: certified `{(f['certified'] or 'none')[:16]}`, rebuilt `{(f['rebuilt'] or 'none')[:16]}`"
              for rid, f in bad]
    L += ["", "## 3. Source drift since the last freeze", "",
          "| Release | Certified version | Status | Detail |", "|---|---|---|---|"]
    for d in r["test3_source_drift"]:
        det = "; ".join(x for x in [
            ("changed: " + ", ".join(d["changed"])) if d["changed"] else "",
            ("new: " + ", ".join(d["added"])) if d["added"] else "",
            ("gone: " + ", ".join(d["removed"])) if d["removed"] else ""] if x) or "—"
        L.append(f"| {d['release']} | v{d['certified_version']} | {d['status']} | {det} |")
    L += ["", "## Reading this report", "",
          "A PASS shows that the certified data can be rebuilt byte for byte from the frozen sources by anyone "
          "holding the same files and program. It is a self-run test; an outside reviewer repeats it with "
          "`python3 -I reproduce.py` and compares the hashes above.", ""]
    return "\n".join(L)


if __name__ == "__main__":
    main()
