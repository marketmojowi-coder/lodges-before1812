#!/usr/bin/env python3
"""Write every ACCEPTED fact to a CSV that the app build reads (grand-lodge-app/contributions/accepted_facts.csv).
Usage: python3 export_accepted.py /path/to/grand-lodge-app/contributions/accepted_facts.csv
Then rebuild (build_app.py) and upload (upload_data.py). Pending and rejected facts never leave the bins."""
import csv, sys
from common import init
from firebase_admin import firestore
init(); db = firestore.client()
COLS = ["id", "bin", "source", "volume", "page", "man", "lodge", "year", "claim", "citation", "held_at", "by_name", "reviewed_by"]
rows = [dict(d.to_dict(), id=d.id) for d in db.collection("facts").where("status", "==", "accepted").stream()]
with open(sys.argv[1], "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, COLS, extrasaction="ignore"); w.writeheader()
    for r in sorted(rows, key=lambda r: (r.get("source", ""), str(r.get("volume", "")), str(r.get("page", "")))): w.writerow(r)
print(len(rows), "accepted facts written")
