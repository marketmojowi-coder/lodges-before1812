#!/usr/bin/env python3
"""Make a signed-in user an editor (can review facts and read everything).
Usage: python3 set_editor.py someone@example.com [--remove]
The user must sign out and in again for the change to take effect."""
import sys
from common import init
from firebase_admin import auth
init()
u = auth.get_user_by_email(sys.argv[1])
claims = dict(u.custom_claims or {})
if "--remove" in sys.argv: claims.pop("editor", None)
else: claims["editor"] = True
auth.set_custom_user_claims(u.uid, claims)
print(u.email, "editor" if claims.get("editor") else "not editor")
