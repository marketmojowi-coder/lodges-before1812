#!/usr/bin/env python3
"""Create the fact bins (safe to rerun; existing bins are updated, never emptied)."""
from common import init
from firebase_admin import firestore
init(); db = firestore.client()
BINS = [
 ("rolls", "Lodge rolls and returns", "Names, degrees, offices and dates from the Grand Lodge of Maryland returns"),
 ("people", "Lives and offices", "Births, deaths, family, civic offices and military service"),
 ("trades", "Buildings and trades", "Who worked on which building, at what trade and wage"),
 ("property", "Lots and property", "Lots, houses, deeds and leases"),
 ("newspapers", "Newspapers", "Notices, advertisements and reports naming the brethren"),
 ("parish", "Church and parish", "Vestries, pews, sermons, funerals and burials"),
]
for i, (k, name, about) in enumerate(BINS):
    db.collection("bins").document(k).set({"name": name, "about": about, "order": i}, merge=True)
print("bins:", [b[0] for b in BINS])
