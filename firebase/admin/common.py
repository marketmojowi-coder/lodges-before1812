"""Admin connection. Needs a service-account key file for the Firebase project (never commit it):
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
   export FIREBASE_BUCKET=<project-id>.appspot.com   (or <project-id>.firebasestorage.app)"""
import os, firebase_admin
from firebase_admin import credentials
def init():
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.ApplicationDefault(), {"storageBucket": os.environ["FIREBASE_BUCKET"]})
