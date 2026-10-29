# Civic Atlas: administrator's guide

Market Mojo LLC is the only administrator of Civic Atlas. Members can read the records, add facts for review and manage
their own account. Nobody else can change the app, the data, the prices or the payments. This guide explains how that
is kept true, and the jobs only the administrator does.

## 1. Who can change what

| Part | Who can change it | How it is locked |
|---|---|---|
| App code (GitHub) | Market Mojo LLC only | Only the account owner can push. Add no collaborators. Turn on branch protection for `main` and `paid-firebase` (Settings > Branches): require a pull request, and do not allow bypass. |
| Live website and database (Firebase) | Market Mojo LLC only | One Owner in Firebase (Project settings > Users and permissions). Add nobody else. Database rules let members write only their own facts, their own Zelle notice and their own account. |
| The data set | Market Mojo LLC only | Uploaded only with `admin/upload_data.py` and your private key. Members can read it but never write it. |
| Prices and payments | Market Mojo LLC only | Stripe dashboard (yours alone). Zelle payee, GoDaddy Pay Link and PayPal link set only with `admin/set_zelle.py`. |
| Memberships | Market Mojo LLC only | Switched on by a confirmed payment, or by you with `admin/set_member.py`. |
| Editors (fact reviewers) | Market Mojo LLC only | Only `admin/set_editor.py` makes an editor. Editors can review facts and confirm Zelle payments. They cannot change code, prices or data. |

**The repository is public today.** People can read the app's code (no data and no keys are in it), but they cannot
change it. To hide the code too, choose one of these:

- Make the repository private, and upgrade to GitHub Pro (about $4 a month) so the public pages stay online.
- Or move the `paid-firebase` branch into a new private repository and keep the public one for the landing pages only.

## 2. Your private keys: keep them off GitHub and out of chats

| Key | What it is for | Where to keep it |
|---|---|---|
| Firebase service-account key (JSON) | The admin scripts | Your password manager or an encrypted drive. Never in the repository (it is git-ignored). |
| Android upload key (`.jks`) and its passwords | Signing the Google Play app | Password manager, plus the four GitHub Actions secrets. Back it up: if lost, Play support must reset it. |
| Stripe secret key | Only inside the Firebase Stripe extension | Stripe dashboard. Use a *restricted* key. |
| Zelle payee, GoDaddy and PayPal links | Shown to buyers after they confirm their email | Only in the database (`config/zelle`), set by `set_zelle.py`. |

Turn on two-step sign-in for GitHub, Google (Firebase and Play Console), Stripe, GoDaddy and your bank. Give each a
backup method, such as recovery codes kept offline.

## 3. How a buyer gets in

1. **Account:** username, email and password (or Google). Only the username and email are kept.
2. **Confirm email:** the app sends a link; payment stays locked until the email is confirmed (the database checks this too).
3. **Pay $9.99 once** (plus sales tax for their state): by card (Stripe), Zelle, your GoDaddy checkout, or PayPal if you set a link.
   Each buyer gets a reference (CA…) to put in the memo or note.
4. **Open:** after the payment is confirmed the member is let in and sees the green *Signed in* badge.

**Set up the payment buttons (once):**
`python3 admin/set_zelle.py "you@yourbank-zelle.com" "Market Mojo LLC" 9.99 WI=0.05 --godaddy https://your-godaddy-pay-link`
Make the GoDaddy link in GoDaddy > Payments > Pay Links, for $9.99 (let the buyer enter the amount, or turn on tax there, so
the tax can be added). Add `--paypal https://paypal.me/yourname` for PayPal. Leave a link out to hide that button.

## 4. Everyday jobs

**Confirm Zelle, GoDaddy and PayPal payments (daily).**
1. Open **My account** in the app while signed in as an editor.
2. Under *Payments to confirm*, match each reference (CA…), method and amount with your bank, GoDaddy or PayPal account.
3. Tap **Confirm paid**. The member is let in at once and sees the green *Signed in* badge, and the sale is written to the
   sales ledger. If no payment came, tap **Not found**.

**Card payments** need nothing from you. Stripe takes the payment, the app lets the member in, and the sale goes into
the ledger.

**Sales and Wisconsin sales tax (monthly).**
- `python3 admin/export_sales.py 2026-11` writes `sales_2026-11.csv`. It has one row per membership sold, with the
  price, the tax, the state and the method, and it prints the Wisconsin tax collected.
- File that figure on your Wisconsin sales and use tax return (My Tax Account, Wisconsin Department of Revenue).
- The tax rate comes from `set_zelle.py` (for example, `WI=0.05`; add your county's 0.5% if it applies) and from
  Stripe Tax for card payments.

**Refunds.**
1. Refund the payment in Stripe, or send the money back by Zelle.
2. Then run `python3 admin/set_member.py buyer@example.com --remove`.

**Gift or press copy:** `python3 admin/set_member.py person@example.com`.

**New data set:** rebuild, then `python3 admin/upload_data.py`. Members get it the next time they sign in.

## 5. Checks that run by themselves

- Every push to GitHub runs **Code checks** (`.github/workflows/checks.yml`). It confirms that the code and settings
  files are well formed and that no key or keystore file was committed.
- The **Android app bundle** workflow builds the signed app for Google Play.

## 6. If something goes wrong

- Someone you don't know appears in Firebase *Users and permissions*, or as a GitHub collaborator: remove them, then
  change your passwords and keys.
- A key is exposed: delete it at its source (Google Cloud > Service accounts, Stripe > API keys), make a new one, and
  update where it is used.
- A member reports they paid but can't get in: check the payments list, GoDaddy or Stripe, then use `set_member.py`.
