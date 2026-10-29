# Civic Vault security (checked October 29, 2026)

Checked against the NIST Cybersecurity Framework 2.0 (its six functions) and NIST SP 800-63B for sign-in.
"Done" items are in this branch; "Owner" items are settings only the account owner can switch on.

## Govern
- Done: one owner (Market Mojo LLC); editors are named by `admin/set_editor.py` (custom claim `editor`), nobody else can change data.
- Done: the data set is proprietary; the public GitHub Pages site carries only the landing, privacy and terms pages.
- Done: Federal Lodge minute books and ledger and the Royal Arch minutes are never in the data (lodge property); the build refuses them.
- Owner: keep the Stripe, Firebase and Play Console accounts on two-step sign-in, with at least one backup owner.

## Identify
- Done: API inventory with who may call each access point and what it accepts: [API.md](API.md) (NIST definition of an API; NIST SP 800-228).
- Done: what is stored and where: Firebase Auth (sign-in), Firestore (`members`, `facts`, `bins`, `sources`, Stripe `customers`), Cloud Storage (`data/data.json`). Listed on the privacy page.
- Done: no keys or passwords in the code or the repository; keystore and service keys are git-ignored; Firebase reads its web config from Hosting.

## Protect
- Done (sign-in, SP 800-63B): Google, email link, or email and password. Passwords are kept only by Firebase Authentication as salted scrypt hashes; nobody, editors included, can read them. Suggested passwords are 100-bit random (browser cryptographic generator), at least 15 characters; changing a password needs a recent sign-in.
- Done: each member gets a member number (`CV-XXXXX-XXXXX-XXXXX-XXXXX`, 100 random bits from the browser's cryptographic generator). Rules: written once by the member, readable only by the member and editors, never changed, deleted with the account. Contributions carry the number, not the email, and other members see "a member".
- Done (database rules): members read only their own Stripe records; checkout sessions accept only price and return URLs; facts must be pending, signed by their author, use a fixed set of fields with size limits, and carry the server's time; only editors accept or reject. The data file opens only to members and editors; nobody can upload it from the app.
- Done (web headers, `firebase.json`): Content-Security-Policy (only this site, Google sign-in and Firebase; no framing; no plugins), HSTS one year, nosniff, X-Frame-Options DENY, strict referrer, Permissions-Policy (camera, microphone, location, payment off), Cross-Origin-Opener-Policy for the Google sign-in pop-up.
- Done (Android): HTTPS only (Trusted Web Activity bound to the site by Digital Asset Links), no cleartext traffic, app backup off, release build shrunk and obfuscated (R8), signing key only in GitHub secrets, target API 36.
- Done (offline copy): the data set is kept in the member's own browser storage for offline reading, deleted at sign-out and account deletion.
- Done (messages): contact-page messages need sign-in, carry the sender's own uid and email, are read only by editors and expire after about twelve months (TTL).
- Done (payments): card details go to Stripe Checkout, never to Civic Vault; the price is read from Stripe's own product list; the Android app shows no purchase (Play rules).
- Owner: turn on Firebase App Check (Play Integrity for Android, reCAPTCHA Enterprise for the web) and enforce it for Firestore and Storage.
- Owner: in Firebase Auth, turn on email enumeration protection and the password policy (at least 15 characters).

## Detect
- Owner: Firebase and Google Cloud audit logs on; budget alert on the project; Stripe Radar on.
- Done: every contribution is held as pending until an editor checks it against its source.

## Respond
- Owner: if a key or account is exposed: revoke the editor claim, rotate the Stripe restricted key in the extension, revoke sessions in Firebase Auth, and post a notice on the privacy page within 72 hours.

## Recover
- Done: the data set is rebuilt from the book data sets by `build_app.py`; the app is rebuilt from this repository.
- Owner: weekly Firestore export to a Cloud Storage bucket (`gcloud firestore export`).
