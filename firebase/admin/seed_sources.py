#!/usr/bin/env python3
"""Create the printed sources members may cite in the bins (safe to rerun). Edit sources.json, then run this."""
import json, os
from common import init
from firebase_admin import firestore
init(); db = firestore.client()
for i, s in enumerate(json.load(open(os.path.join(os.path.dirname(__file__), "sources.json"), encoding="utf-8"))):
    db.collection("sources").document(s["id"]).set(dict(s, order=i), merge=True)
print("sources seeded")
