# Civic Atlas back-end API reference

Checked October 29, 2026. Owner: Market Mojo LLC.

## What counts as an API here

This document uses the NIST definition of an application programming interface (API):

> "A system access point or library function that has a well-defined syntax and is accessible from application programs
> or user code to provide well-defined functionality."
> NIST Computer Security Resource Center Glossary, "application programming interface (API)",
> https://csrc.nist.gov/glossary/term/api

Every access point the app uses is listed below with who may call it and what it accepts. That list is the API inventory
that NIST SP 800-228, *Guidelines for API Protection for Cloud-Native Systems*, asks for. Each control is noted beside
the access point it protects. The wider security checklist is in [SECURITY.md](SECURITY.md).

Civic Atlas has no custom server. Its back end is Google Firebase (Authentication, Cloud Firestore, Cloud Storage and
Hosting) plus the Stripe extension. So the API is:

- the Firebase client SDK calls the pages make, and
- the security rules that decide each call.

The rules are the authorization layer. Nothing reaches the data without passing them.

## How every call is authenticated

- **Identity.** Firebase Authentication signs a person in by one of three methods: Google (OAuth 2.0 pop-up), an email
  link, or an email and password. Passwords are stored by Firebase as salted scrypt hashes and meet NIST SP 800-63B
  (at least 15 characters).
- **Token.** Every Firestore, Storage and Functions call carries a short-lived Firebase ID token (a signed JWT). The
  rules read two custom claims from it:
  - `member == true`, set once by the `grantMembership` function (`functions/index.js`) when Stripe reports the
    one-time membership payment as succeeded, or by hand with `admin/set_member.py` (payment taken another way, or
    `--remove` after a refund);
  - `editor == true`, set only by `admin/set_editor.py`.
- **Transport.** All calls use HTTPS. The site sends HSTS, a Content-Security-Policy and the other headers set in
  `firebase.json`, and the Android app allows no cleartext traffic.
- **App Check (owner step).** Once Firebase App Check is turned on, each call must also come from the real app:
  Play Integrity on Android, reCAPTCHA Enterprise on the web.

## 1. Hosting configuration

| Access point | Method | Who | Returns |
|---|---|---|---|
| `/__/firebase/init.json` | GET | Anyone | The project's public web configuration (project id, API key for identifying the project, auth domain). It holds no secrets; access is decided by the rules below. |

## 2. Authentication (Firebase Auth SDK)

| Call | Page | Purpose |
|---|---|---|
| `signInWithPopup(GoogleAuthProvider)` | index.html | Google sign-in |
| `sendSignInLinkToEmail`, `signInWithEmailLink` | index.html | Email-link sign-in |
| `signInWithEmailAndPassword` | index.html | Password sign-in |
| `updatePassword`, `linkWithCredential(EmailAuthProvider)` | account.html | Set or change a password. Needs a recent sign-in. |
| `getIdTokenResult(true)` | all | Fresh token with the `member` and `editor` claims |
| `deleteUser` | delete-account.html | Close the account |
| `signOut` | all | Sign out. Also deletes the offline copy kept on the device. |

## 3. Cloud Firestore collections

Every write is checked for allowed keys (`hasOnly`), types and sizes, and for a server timestamp (`request.time`). Values
are written as plain text and shown escaped, so there is no injection path.

| Collection | Read | Create | Update / delete | Fields accepted |
|---|---|---|---|---|
| `members/{uid}` | owner, editors | owner, if a member; once only | update: never; delete: owner, editors | `no` (format `CA-XXXXX-XXXXX-XXXXX-XXXXX`, Crockford base32, 100 random bits), `created` |
| `facts/{id}` | editors; members see accepted facts and their own | members | editors; the author may change only `by_name`, or delete while pending | `bin, man, lodge, year, claim, citation, held_at, source, volume, page, status ("pending"), by (own uid), by_name, agent (false), created`. Size limits: claim 3,000; citation 1,500; held_at 400. |
| `bins/{bin}`, `sources/{id}` | members | editors | editors | Editor-managed lists |
| `messages/{id}` | editors; the sender | anyone signed in | delete: sender, editors; update: editors | `topic` (3–60), `message` (10–4,000), `by` (own uid), `email` (own token email), `created`, `expires` (under 400 days). Deleted by a Firestore TTL policy on `expires`. |
| `customers/{uid}` and its `subscriptions`, `payments` | owner | Stripe extension | Stripe extension | Written by the extension from Stripe webhooks |
| `customers/{uid}/checkout_sessions/{id}` | owner | owner | Stripe extension | `price, success_url, cancel_url, mode, allow_promotion_codes` |
| `products/{id}`, `prices`, `tax_rates` | anyone | Stripe extension | Stripe extension | The live price list, so prices change in Stripe without a code change |

The full source is in `firestore.rules`.

## 4. Cloud Storage

| Object | Read | Write |
|---|---|---|
| `data/data.json` (the data set) | members and editors | nobody from the app; only `admin/upload_data.py` with a service account |

The full source is in `storage.rules`. After download, the app keeps the data set in the member's own browser storage
(IndexedDB) for offline use. That copy is deleted at sign-out or account deletion, and replaced on the next download.

## 5. Cloud Functions (Stripe extension)

| Function | Type | Who | Purpose |
|---|---|---|---|
| `ext-firestore-stripe-payments-createPortalLink` (us-central1) | callable | signed-in owner | Returns a link to the Stripe customer portal (cancel, change card, receipts) |
| Stripe webhook handler | HTTPS, signed by Stripe | Stripe only | Keeps `customers` and `payments` in step with Stripe |
| `grantMembership` (Firestore trigger) | runs on `customers/{uid}/payments/{id}` | server only | Sets the `member` claim when the membership payment has succeeded |

The extension keeps the Stripe restricted key in its own secret configuration (Google Secret Manager). No Stripe key is
in this repository or in the pages. Card details go only to Stripe Checkout.

## 6. Admin scripts (server side, service account)

| Script | Purpose |
|---|---|
| `admin/set_editor.py` | Grant or remove the `editor` claim |
| `admin/upload_data.py` | Upload `data/data.json` |
| `admin/seed_bins.py`, `admin/seed_sources.py` | Set up fact bins and citable printed sources |
| `admin/export_accepted.py` | Export accepted facts for the next build |

These scripts run only on the owner's machine with a service-account key. The key is kept out of git
(`.gitignore`). Each run is recorded in Google Cloud audit logs.

## 7. Outbound links (not APIs)

The app calls no outside API. It shows only direct links:

- the Google Maps place for a building, and
- a Chronicling America page when a record carries that page's address.

Search-only links were removed on October 29, 2026.

## Owner checklist for the API

- [ ] Turn on App Check and enforce it for Firestore, Storage and Functions.
- [ ] Create a Firestore TTL policy on `messages.expires`:
  `gcloud firestore fields ttls update expires --collection-group=messages --enable-ttl`
- [ ] Deploy the rules: `firebase deploy --only firestore:rules,storage`
- [ ] Turn on email enumeration protection and the password policy in Firebase Auth.
- [ ] Keep Cloud audit logs on and set a budget alert.
