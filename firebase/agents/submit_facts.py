#!/usr/bin/env python3
"""Agent intake: put facts found by research agents into the bins as PENDING. An editor reviews each one before it counts.
Usage: python3 submit_facts.py facts.jsonl --agent "newspaper-reader" [--dry-run]
Each line: {"bin": "newspapers", "man": "...", "lodge": "...", "year": "1806", "claim": "...", "citation": "...", "held_at": "...", "quote": "..."}
Rules (a fact that breaks one is refused and listed, never sent):
 - citation, held_at and claim are required; year, if given, is 1750-1830
 - bin must exist
 - nothing from the minute books or ledger of Federal Lodge No. 15 or the Royal Arch minutes (lodge property)
 - nothing taken from the Commissioners' records program unless the citation is a book of the series
 - exact duplicates (same man, claim and citation) are skipped"""
import sys, json, re, argparse, hashlib, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "admin"))
ap = argparse.ArgumentParser(); ap.add_argument("file"); ap.add_argument("--agent", required=True); ap.add_argument("--dry-run", action="store_true")
a = ap.parse_args()
PRIVATE = re.compile(r"minute book|minutes of federal|ledger of federal|federal lodge (no\. )?(15|1)\b.*(minute|ledger)|royal arch.*minute", re.I)
COMMISSIONERS = re.compile(r"record group 42|rg ?42|commissioners for the district|proceedings of the commissioners|voucher", re.I)
SERIES_BOOK = re.compile(r"Saharsky", re.I)
ok, bad = [], []
for n, line in enumerate(open(a.file, encoding="utf-8"), 1):
    if not line.strip(): continue
    try: f = json.loads(line)
    except Exception as e: bad.append((n, f"not JSON: {e}")); continue
    why = [k for k in ("bin", "man", "claim", "citation", "held_at") if not str(f.get(k, "")).strip()]
    if why: bad.append((n, "missing " + ", ".join(why))); continue
    if f.get("year") and not re.fullmatch(r"1(7[5-9]\d|8[0-2]\d|830)", str(f["year"])): bad.append((n, "year out of range")); continue
    text = " ".join(str(f.get(k, "")) for k in ("claim", "citation", "held_at", "quote"))
    if PRIVATE.search(text): bad.append((n, "lodge-held minutes or ledger: not allowed")); continue
    if COMMISSIONERS.search(f["citation"] + " " + f["held_at"]) and not SERIES_BOOK.search(f["citation"]):
        bad.append((n, "Commissioners' records are a separate program: cite the series book page instead, or leave it out")); continue
    ok.append(f)
print(f"{len(ok)} facts ready, {len(bad)} refused")
for n, why in bad: print(f"  line {n}: {why}")
if a.dry_run or not ok: sys.exit(0)
from common import init
from firebase_admin import firestore
init(); db = firestore.client()
bins = {d.id for d in db.collection("bins").stream()}
sent = 0
for f in ok:
    if f["bin"] not in bins: print("  unknown bin:", f["bin"]); continue
    key = hashlib.sha1(f"{f['man']}|{f['claim']}|{f['citation']}".lower().encode()).hexdigest()[:20]
    ref = db.collection("facts").document(key)
    if ref.get().exists: continue
    ref.set({"bin": f["bin"], "man": f["man"], "lodge": f.get("lodge", ""), "year": str(f.get("year", "")), "claim": f["claim"],
             "citation": f["citation"], "held_at": f["held_at"], "quote": f.get("quote", ""), "status": "pending",
             "by": "agent:" + a.agent, "by_name": a.agent, "agent": True, "created": firestore.SERVER_TIMESTAMP})
    sent += 1
print(f"{sent} new facts in the bins, waiting for review")
