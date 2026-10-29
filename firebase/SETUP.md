# Lodges Before 1812: paid member site (Firebase + Stripe)

Seller: Market Mojo LLC. Address: lodges.mktmojox.com. Cost at this size: Firebase free (Spark), then pay-as-you-go (Blaze) is required by the Stripe extension, typically under $1/month here; Stripe about 2.9% + 30c per payment.

## 1. Firebase project (Google account)
1. console.firebase.google.com > Add project > name `lodges-before-1812`.
2. Build > Authentication > Get started > enable **Google** and **Email/Password** with **Email link (passwordless sign-in)**.
3. Build > Firestore Database > Create (production mode, region us-east4 or nam5).
4. Build > Storage > Get started.
5. Upgrade to **Blaze** (needed for the Stripe extension). Set a budget alert of $5.

## 2. Stripe (Market Mojo LLC)
1. stripe.com > create the account under **Market Mojo LLC** (EIN and bank account from your SAM.gov registration).
2. Products > Add product "Lodges Before 1812 membership", with a recurring price (e.g. monthly and yearly).
3. On the product, add metadata **firebaseRole = member**. This is what unlocks the data.
4. Copy the price id (`price_...`) into `firebase/public/firebase-init.js` as MEMBER_PRICE.

## 3. Stripe extension in Firebase
Extensions > install **Run Payments with Stripe** (invertase/firestore-stripe-payments):
- Customers collection: `customers`; Products collection: `products`; Sync custom claims: **Yes**.
- Paste the Stripe secret key (restricted key) when asked, and add the webhook it shows in Stripe > Developers > Webhooks.

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
- The free GitHub Pages site is only a landing page; the data set is not public.
