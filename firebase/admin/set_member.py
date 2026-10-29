#!/usr/bin/env python3
"""Switch a membership on or off by hand: for a payment taken outside Stripe, a gift, or a refund.
Usage: python3 set_member.py someone@example.com [--remove]
The member sees the change the next time the app checks (sign out and in again to see it at once)."""
import sys
from common import init
from firebase_admin import auth
init()
u = auth.get_user_by_email(sys.argv[1])
claims = dict(u.custom_claims or {})
if "--remove" in sys.argv: claims.pop("member", None)
else: claims["member"] = True
auth.set_custom_user_claims(u.uid, claims)
print(u.email, "member" if claims.get("member") else "not a member")
