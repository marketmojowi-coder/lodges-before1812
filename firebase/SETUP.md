# Civic Vault: paid member site (Firebase + Stripe)

Seller: Market Mojo LLC. Address: lodges.mktmojox.com. Cost at this size: Firebase free (Spark), then pay-as-you-go (Blaze) is required by the Stripe extension, typically under $1/month here; Stripe about 2.9% + 30c per payment.

## 1. Firebase project (Google account)
1. console.firebase.google.com > Add project > name `lodges-before-1812`.
2. Build > Authentication > Get started > enable **Google** and **Email/Password** with **Email link (passwordless sign-in)**.
3. Build > Firestore Database > Create (production mode, region us-east4 or nam5).
4. Build > Storage > Get started.
5. Upgrade to **Blaze** (needed for the Stripe extension). Set a budget alert of $5.

## 2. Stripe (Market Mojo LLC)
1. stripe.com > create the account under **Market Mojo LLC** (EIN and bank account from your SAM.gov registration).
2. Products > Add product "Civic Vault membership", with a recurring price (e.g. monthly and yearly).
3. On the product, add metadata **firebaseRole = member**. This is what unlocks the data.
4. On the membership product in Stripe, add the metadata `firebaseRole` = `member`. The app reads the active price from the Stripe extension's copy in Firestore (`products`), so prices changed in Stripe reach the app with no code change. (MEMBER_PRICE in `firebase-init.js` is only a fallback.)

## 3. Stripe extension in Firebase
Extensions > install **Run Payments with Stripe** (invertase/firestore-stripe-payments):
- Customers collection: `customers`; Products collection: `products`; Sync custom claims: **Yes**.
- Paste the Stripe secret key (restricted key) when asked, and add the webhook it shows in Stripe > Developers > Webhooks.
- Leave the extension's Cloud Functions location at **us-central1** (the account page calls its `createPortalLink` function there). In Stripe > Settings > Billing > Customer portal, turn on: update payment method, invoice history, cancel subscription (at period end).

## 4. Deploy (from this repository)
```
npm install -g firebase-tools
firebase login
firebase use --add            # pick lodges-before-1812
firebase deploy --only hosting,firestore,storage
```

## 5. Load the data and the bins (admin, one time)
Project settings > Service accounts > Generate new private key (keep it OUT of the repository).
```
pip install -r firebase/admin/requirements.txt
export GOOGLE_APPLICATION_CREDENTIALS=~/keys/lodges-service-account.json
export FIREBASE_BUCKET=lodges-before-1812.appspot.com     # as shown on the Storage page
cd firebase/admin
python3 upload_data.py /path/to/app_data.json              # from grand-lodge-app/ in the project
python3 seed_bins.py
python3 set_editor.py you@yourmail.com                     # you review the facts
```

## 6. Your domain
Hosting > Add custom domain > `lodges.mktmojox.com`. Firebase shows two DNS records; add them at your domain registrar. HTTPS is automatic.

## How it works
- Sign-in page (Google or email link). Signed-in non-members see "Become a member" (Stripe Checkout).
- Members download the data set from Storage once per visit (rules: members and editors only) and search it.
- Fact bins (bins.html): members and agents add facts with a source; they wait as **pending** until an editor accepts or rejects them; counts per bin are live. Agents submit with `firebase/agents/submit_facts.py` (see AGENT_INSTRUCTIONS.md).
- My account (account.html): membership status, plan and renewal date; **Manage billing and invoices** opens the Stripe customer portal (website only, never inside the Android app); a member's own facts with their review status (pending ones can be withdrawn); Download my data (JSON); Sign out; Delete my account.
- The free GitHub Pages site is only a landing page; the data set is not public.

## Members' contributions: Schultz, Harper, Dove and other printed sources

1. Seed the printed sources once (and after editing `admin/sources.json`): `python3 admin/seed_sources.py`.
   Sources: Schultz, *History of Freemasonry in Maryland* (4 vols., 1884–1888); Harper, *History of the Grand Lodge and of Freemasonry in the District of Columbia* (1911); Dove, *Proceedings of the Grand Lodge of Virginia* (1874), George Washington Masonic National Memorial copy. All three are in the public domain.
2. Members open **Fact bins**, choose the source, volume and page (the Oxford citation and "held at" fill in), and add one fact, or upload a CSV (`bin, source, volume, page, man, lodge, year, claim`) to add many. Every line arrives as **pending**.
3. You (editor) review in the same page: Accept, Reject with a note, or select many and **Accept selected**. Only accepted facts leave the bins.
4. Publish: `python3 admin/export_accepted.py <grand-lodge-app>/contributions/accepted_facts.csv`, rebuild (`python3 build_app.py`), then `python3 admin/upload_data.py <grand-lodge-app>/app_data.json`.
   Accepted facts count in the statistics as printed sources: one document per volume, the page as its locator, each linked to the man named. Facts citing the lodge's minute books or ledger are never ingested.

## Sign-in and security (October 29, 2026)
- Firebase Auth: turn on Google and Email/Password (with Email link). Turn on email enumeration protection and a password policy of at least 15 characters.
- Members get a member number on first sign-in after paying (Firestore `members/{uid}`); only the member and editors can read it.
- Turn on App Check (Play Integrity for Android, reCAPTCHA Enterprise for the web) and enforce it for Firestore and Storage.
- Security checklist against the NIST Cybersecurity Framework: `firebase/SECURITY.md`.
