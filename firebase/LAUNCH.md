# Launch Civic Vault: payments, GoDaddy domain, Google Play

Written October 29, 2026. Do these steps after the account test in [DEPLOY_AND_TEST.md](DEPLOY_AND_TEST.md) passes.

## 1. How money is collected

- Members pay on the website, **lodges.mktmojox.com**, through Stripe Checkout. The money goes to Market Mojo LLC's
  bank account through Stripe.
- Stripe takes about 2.9% + 30¢ per payment. Card details never touch our site.
- The Android app only signs members in. It shows no price, no buy button and no link to buy.
  - This is the "sign in to content bought elsewhere" model, which Google Play allows.
  - It avoids Google's 15% fee and its billing rules.
- To go live:
  1. In Stripe, finish the business profile (EIN, bank account, statement name **MARKET MOJO**).
  2. Turn on live mode.
  3. Create the membership product with metadata `firebaseRole` = `member`.
  4. Put a live restricted key into the Firebase Stripe extension.

## 2. The GoDaddy domain (mktmojox.com)

The member site stays on Firebase Hosting, which gives free HTTPS and security headers. GoDaddy only points the address
at it.

1. In Firebase: Hosting > **Add custom domain** > `lodges.mktmojox.com`. Firebase shows the DNS records to add: a
   TXT record to prove ownership, and A records for the site.
2. In GoDaddy: My Products > mktmojox.com > **DNS** > Add record. Enter exactly what Firebase shows:
   - Type **TXT**, Name `lodges`, Value (from Firebase).
   - Type **A**, Name `lodges`, Value (each IP address from Firebase).
   - Leave the existing records for `@` and `www` alone, so www.mktmojox.com keeps working.
3. Wait for Firebase to say **Connected** (minutes to a few hours). The certificate is issued automatically.
4. In GoDaddy's website editor, add a menu link **Civic Vault** → `https://lodges.mktmojox.com`.
5. Optional, for email from your own domain: turn on GoDaddy email (or Google Workspace) for an address such as
   `info@mktmojox.com`. Then switch the contact address in `grand-lodge-app/legal/build_legal.py` (EMAIL) and rebuild.

## 3. Google Play requirements

| Requirement | Status |
|---|---|
| Developer account for **Market Mojo LLC**, organization type, $25 one time, D-U-N-S number, verified phone, email and website | Owner |
| App bundle (.aab), signed with your upload key | Built by GitHub Actions ("Android app bundle") once the 4 signing secrets are added |
| Target API level 36 | Done (`android/app/build.gradle`) |
| Play App Signing SHA-256 pasted into `firebase/public/.well-known/assetlinks.json`, then `firebase deploy --only hosting` | After the first upload (Play Console > Setup > App signing) |
| App icon 512 × 512 | `grand-lodge-app/play-store/app_icon_512.png` |
| Feature graphic 1024 × 500 | `grand-lodge-app/play-store/feature_graphic_1024x500.png` |
| Phone screenshots (2 to 8, 9:16) | `grand-lodge-app/play-store/phone_1…7.png` (1080 × 1920) |
| App name, short and full description | [PLAY_STORE.md](PLAY_STORE.md), "Store listing text" |
| Privacy policy URL | `https://lodges.mktmojox.com/privacy.html` |
| Account deletion URL (required for apps with accounts) | `https://lodges.mktmojox.com/delete-account.html` (also in the app under My account) |
| Data safety form | Answers in PLAY_STORE.md |
| App access: a login for reviewers | Make a test Google account an editor (`admin/set_editor.py`) and give it in App content > App access |
| Content rating (IARC questionnaire), target audience 18+, ads: none | Answers in PLAY_STORE.md |
| Contact email on the listing | marketmojowi@gmail.com |
| Testing | Organization accounts may go straight to production. Internal testing first is still recommended (up to 100 testers, live in minutes). Personal accounts would need 12 testers for 14 days. |

## 4. Order of work on launch day

1. Stripe live (section 1) and the domain connected (section 2).
2. `firebase deploy --only hosting,firestore,storage` and upload the latest `app_data.json`.
3. Play Console:
   1. Create app.
   2. Internal testing > upload `app-release.aab`.
   3. Paste the SHA-256 into assetlinks.json and deploy hosting.
   4. Install from the internal test link and check that sign-in works with no browser bar.
4. Fill the store listing and App content forms, then send to review. Review usually takes a few days for a new
   account.
5. When approved, roll out to production.

## 5. Security on go-live

- Turn on Firebase App Check (Play Integrity and reCAPTCHA Enterprise) and enforce it.
- In Firebase Auth, turn on email enumeration protection and the password policy.
- Turn on Stripe Radar and two-step sign-in on Stripe, Firebase, GoDaddy and Play Console. Give each a backup owner.
- Set a Google Cloud budget alert. Keep audit logs on.
- See [SECURITY.md](SECURITY.md) and [API.md](API.md).
