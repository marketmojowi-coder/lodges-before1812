"""Admin connection. Needs a service-account key file for the Firebase project (never commit it):
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
   export FIREBASE_BUCKET=<project-id>.firebasestorage.app   (Blaze plan only; not needed on the free Spark plan)"""
import os, firebase_admin
from firebase_admin import credentials
def init():
    if not firebase_admin._apps:
        opts = {"storageBucket": os.environ["FIREBASE_BUCKET"]} if os.environ.get("FIREBASE_BUCKET") else {}
        firebase_admin.initialize_app(credentials.ApplicationDefault(), opts)
