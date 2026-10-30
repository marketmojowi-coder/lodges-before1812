#!/usr/bin/env python3
"""Set how buyers pay the $19.99 membership. The details live only in the database (config/zelle), never in the code.
Usage: python3 set_zelle.py "pay@yourbusiness.com" "Market Mojo LLC" 19.99 [WI=0.05 ...] [--godaddy URL] [--paypal URL]
       Each STATE=RATE adds that state's sales tax for buyers there (Wisconsin 5% state rate; add your county rate if it applies).
       --godaddy URL   your GoDaddy Payments "Pay Link" (GoDaddy > Payments > Pay Links); adds a "Pay with GoDaddy checkout" button.
       --paypal URL    your PayPal.Me or PayPal payment link; adds a "Pay with PayPal" button.
       python3 set_zelle.py --off        (hide all these payment buttons)"""
import sys
from common import init
from firebase_admin import firestore
init()
ref = firestore.client().document("config/zelle")
args = sys.argv[1:]
def opt(name):
    if name in args:
        i = args.index(name); v = args[i + 1]; del args[i:i + 2]
        if not v.startswith("https://"): sys.exit(f"{name} must be an https:// link")
        return v
    return None
if "--off" in args:
    ref.delete(); print("Payment buttons off")
else:
    godaddy, paypal = opt("--godaddy"), opt("--paypal")
    to, name, amount = args[0], args[1], float(args[2])
    tax = {a.split("=")[0].upper(): float(a.split("=")[1]) for a in args[3:] if "=" in a} or {"WI": 0.05}
    data = {"to": to, "name": name, "amount": round(amount * 100), "tax": tax}
    if godaddy: data["godaddy"] = godaddy
    if paypal: data["paypal"] = paypal
    ref.set(data); print("Payment set:", name, "tax:", tax, "GoDaddy:", bool(godaddy), "PayPal:", bool(paypal))
