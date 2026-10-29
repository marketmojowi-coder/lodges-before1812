#!/usr/bin/env python3
"""Set the Zelle payee shown to signed-in buyers. The details live only in the database (config/zelle), never in the code.
Usage: python3 set_zelle.py "pay@yourbusiness.com" "Market Mojo LLC" 9.99 [WI=0.05 ...]
       Each STATE=RATE adds that state's sales tax for buyers there (Wisconsin 5% state rate; add your county rate if it applies).
       python3 set_zelle.py --off        (hide the Zelle button)"""
import sys
from common import init
from firebase_admin import firestore
init()
ref = firestore.client().document("config/zelle")
if "--off" in sys.argv:
    ref.delete(); print("Zelle button off")
else:
    to, name, amount = sys.argv[1], sys.argv[2], float(sys.argv[3])
    tax = {a.split("=")[0].upper(): float(a.split("=")[1]) for a in sys.argv[4:] if "=" in a} or {"WI": 0.05}
    ref.set({"to": to, "name": name, "amount": round(amount * 100), "tax": tax}); print("Zelle payee set:", name, "tax:", tax)
