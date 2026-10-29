#!/usr/bin/env python3
"""Switch a membership on or off by hand: for a payment taken outside Stripe, a gift, or a refund.
Usage: python3 set_member.py someone@example.com [--remove]
The member sees the change the next time the app checks (sign out and in again to see it at once)."""
import sys
from common import init
from firebase_admin import auth, firestore
init()
u = auth.get_user_by_email(sys.argv[1])
claims = dict(u.custom_claims or {})
if "--remove" in sys.argv: claims.pop("member", None)
else: claims["member"] = True
auth.set_custom_user_claims(u.uid, claims)
paid = firestore.client().document(f"paid/{u.uid}")  # the free-plan membership record
if "--remove" in sys.argv: paid.delete()
else: paid.set({"at": firestore.SERVER_TIMESTAMP, "method": "Given by the owner", "ref": "", "total": 0})
print(u.email, "member" if claims.get("member") else "not a member")
