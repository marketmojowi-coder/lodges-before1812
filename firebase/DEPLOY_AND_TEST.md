# Deploy Civic Atlas and test it with an account

Written October 29, 2026. Use branch `paid-firebase`.

The full settings are in [SETUP.md](SETUP.md). This page is the order to do them in, and the test to run before going
live. Do everything first with Stripe in **test mode**, so no real card is charged.

## A. Deploy (about an hour)

1. **Firebase project.** Follow SETUP.md section 1:
   - turn on Google and Email/Password sign-in, with email link;
   - create Firestore and Storage;
   - move to the Blaze plan, with a $5 budget alert.
2. **Stripe in test mode.** Follow SETUP.md section 2, with the Stripe dashboard switched to *Test mode*:
   - create the product "Civic Atlas membership" with a **one-time** price (not recurring);
   - add the product metadata `firebaseRole` = `member`.
3. **Stripe extension.** Follow SETUP.md section 3, using a *test* restricted key. Add the webhook it shows.
4. **Deploy the site and the rules** from this repository:
   ```
   firebase login
   firebase use --add
   firebase deploy --only hosting,firestore,storage,functions
   ```
5. **Message clean-up.** Delete contact messages after about a year, as the privacy policy says:
   ```
   gcloud firestore fields ttls update expires --collection-group=messages --enable-ttl
   ```
6. **Load the data and make yourself an editor.** Follow SETUP.md section 5:
   - `upload_data.py` with `grand-lodge-app/app_data.json`;
   - `seed_bins.py`;
   - `set_editor.py` with your own Google address.
7. Open `https://<your-project>.web.app`.

## B. Test with two accounts

Use your own Google account (the editor) and a second account (a test member). Stripe's test card is
`4242 4242 4242 4242`, with any future date and any security code.

| # | Account | Do this | You should see |
|---|---|---|---|
| 1 | Editor | Sign in with Google | The full app opens. Check Index, Atlas (map and numbered building tiles), Census tables, Compare lodges, All records, Sources (archive register) and About. |
| 2 | Editor | Open a man, then a record, then **Cite this record** | Full and short citations, each with a copy button |
| 3 | Editor | **Suggest a correction** on an Atlas placement | It appears in the fact bins as *pending* |
| 4 | Test member | Sign in with an email link | The gate shows **Become a member** with the price from Stripe |
| 5 | Test member | Pay with the test card | Back in the app with the records loaded. **My account** shows *Active*, a member number `CA-…` and the renewal date. |
| 6 | Test member | **My account** > Set a password, sign out, sign in with the password | The password sign-in works |
| 7 | Test member | Open the app once, turn on airplane mode, reopen it | "Offline: showing the copy saved on this device", with search working |
| 8 | Test member | **Contact** > send a message | The message appears in Firestore `messages` |
| 9 | Test member | **My account** > Manage billing > cancel | The Stripe portal opens. Access stays until the period ends. |
| 10 | Test member | **Delete my account** | Signed out; the account, member number, messages and offline copy are gone |
| 11 | Anyone | Open `/privacy.html`, `/terms.html`, `/disclaimer.html`, `/copyright.html`, `/sources.html`, `/contact.html` | Each page, with the Market Mojo logo and contact address |

## C. Android test

The Android app opens `lodges.mktmojox.com`, so it needs step D2 first.

1. In GitHub, run **Actions > Android app bundle**. Download the `civic-atlas-android` artifact (test APK and bundle).
2. Install the APK on a phone. Sign in as the test member. The app opens with no buy button, and it works offline after
   the first load.

## D. Go live

1. **Stripe live mode.** Re-create the product and price, with the same `firebaseRole` metadata. Put a *live*
   restricted key in the extension settings and add the live webhook.
2. **Domain.** In Hosting, add the custom domain `lodges.mktmojox.com`, then add its two DNS records at your registrar.
3. **App Check.** Turn it on (Play Integrity and reCAPTCHA Enterprise) and enforce it.
4. **Firebase Auth.** Turn on email enumeration protection and the 15-character password policy.
5. **Google Play.** Do these in this order:
   1. Create the organization account (D-U-N-S number for Market Mojo LLC).
   2. Add the four signing secrets to GitHub.
   3. Upload the bundle to internal testing, using the listing in [PLAY_STORE.md](PLAY_STORE.md).
   4. Give reviewers a test login (an editor account).
