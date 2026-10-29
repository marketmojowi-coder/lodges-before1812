# Civic Atlas on the free Spark plan

Civic Atlas runs on Firebase's free **Spark** plan. Nothing to upgrade, no card on file.

| Part | Spark (free) | Blaze (pay as you go) |
|---|---|---|
| Website, sign-in, two-step sign-in, email confirmation | Yes | Yes |
| Database: fact bins, payment notices, sales ledger, the data set | Yes | Yes |
| Pay by Zelle, GoDaddy checkout, PayPal (you confirm each payment) | Yes | Yes |
| Pay by card through Stripe (automatic) | No: the card button stays hidden | Yes |
| Cloud Storage, Cloud Functions | Not used | Optional |

On Spark, when you tap **Confirm paid** in My account, the app lets the member in and writes the sale to the ledger at
once. No functions are needed.

## Deploy (Spark)

In a terminal on your computer:

```
npm install -g firebase-tools
git clone -b paid-firebase https://github.com/marketmojowi-coder/lodges-before1812
cd lodges-before1812
firebase login
firebase use --add                      (pick your project, for example "atlas")
firebase deploy --only hosting,firestore
```

That sends the website and the database rules. Leave out functions and storage on Spark.

## One-time setup with your private key

1. Firebase console > Project settings > Service accounts > **Generate new private key**. Keep the file private (password
   manager or encrypted drive). Never put it in GitHub or a chat.
2. In the same terminal:
```
cd firebase/admin
pip install -r requirements.txt
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-key.json
python3 set_editor.py you@yourmail.com                 (you can confirm payments)
python3 upload_data.py /path/to/app_data.json          (the records file I attach in the chat; never put it in GitHub)
python3 set_zelle.py "your-zelle@email" "Market Mojo LLC" 9.99 WI=0.05 --godaddy https://your-godaddy-pay-link
```
3. Sign out and in again; your account now shows **Payments to confirm**.

## Later, if you upgrade to Blaze

Run `firebase deploy` (everything), then `python3 upload_data.py /path/to/app_data.json --storage` and set up Stripe
(LAUNCH.md) to add automatic card payments.
