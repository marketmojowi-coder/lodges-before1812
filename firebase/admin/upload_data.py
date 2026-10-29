#!/usr/bin/env python3
"""Upload the data set, readable only by members.
Usage: python3 upload_data.py /path/to/app_data.json            (database, in parts: works on the free Spark plan)
       python3 upload_data.py /path/to/app_data.json --storage  (also Cloud Storage data/data.json, Blaze plan)"""
import sys, json
from common import init
init()
src = sys.argv[1]
text = open(src, encoding="utf-8").read()
d = json.loads(text)
assert d["meta"]["count"] == len(d["recs"]), "record count mismatch"
from firebase_admin import firestore
db = firestore.client()
SIZE = 700_000  # characters per part; a database document must stay under 1 MB
parts = [text[i:i + SIZE] for i in range(0, len(text), SIZE)]
old = {doc.id for doc in db.collection("data").stream()}
for i, t in enumerate(parts):
    db.document(f"data/part{i:03d}").set({"i": i, "n": len(parts), "t": t})
for gone in old - {f"part{i:03d}" for i in range(len(parts))}:
    db.document(f"data/{gone}").delete()
print(f"database: {len(d['recs'])} records in {len(parts)} parts")
if "--storage" in sys.argv:
    from firebase_admin import storage
    blob = storage.bucket().blob("data/data.json")
    blob.cache_control = "private, max-age=3600"
    blob.upload_from_filename(src, content_type="application/json")
    print("storage: data/data.json uploaded")
