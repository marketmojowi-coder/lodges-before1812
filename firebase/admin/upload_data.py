#!/usr/bin/env python3
"""Upload the data set to Cloud Storage (data/data.json), readable only by members.
Usage: python3 upload_data.py /path/to/app_data.json"""
import sys, json
from common import init
from firebase_admin import storage
init()
src = sys.argv[1]
d = json.load(open(src, encoding="utf-8"))
assert d["meta"]["count"] == len(d["recs"]), "record count mismatch"
blob = storage.bucket().blob("data/data.json")
blob.cache_control = "private, max-age=3600"
blob.upload_from_filename(src, content_type="application/json")
print(f"uploaded {len(d['recs'])} records")
