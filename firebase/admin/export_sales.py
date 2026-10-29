#!/usr/bin/env python3
"""Sales ledger to CSV: one row per membership sold, with the sales tax by state, for the books and the Wisconsin
sales tax return. Usage: python3 export_sales.py [2026-11]   (a month, or every sale)"""
import csv, sys, datetime
from common import init
from firebase_admin import firestore
init()
month = sys.argv[1] if len(sys.argv) > 1 else ""
rows = []
for d in firestore.client().collection("sales").stream():
    s = d.to_dict(); on = datetime.datetime.fromtimestamp(s.get("paid_on") or 0, datetime.timezone.utc).strftime("%Y-%m-%d")
    if month and not on.startswith(month): continue
    rows.append([on, d.id, s.get("sku"), s.get("product"), s.get("method"), s.get("state", ""), s.get("price", 0) / 100, s.get("tax", 0) / 100, s.get("total", 0) / 100, s.get("email", ""), s.get("ref", "")])
rows.sort()
out = f"sales_{month or 'all'}.csv"
with open(out, "w", newline="") as fh:
    w = csv.writer(fh); w.writerow(["Date", "Sale", "SKU", "Product", "Method", "State", "Price", "Sales tax", "Total", "Email", "Reference"]); w.writerows(rows)
wi = sum(r[7] for r in rows if r[5] == "WI")
print(f"{out}: {len(rows)} sales, ${sum(r[8] for r in rows):,.2f} taken, Wisconsin sales tax ${wi:,.2f}")
