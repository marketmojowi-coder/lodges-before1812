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
| Prices and payments | Market Mojo LLC only | Stripe dashboard (yours alone). Zelle payee set only with `admin/set_zelle.py`. |
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
| Zelle payee details | Shown to buyers after sign-in | Only in the database (`config/zelle`), set by `set_zelle.py`. |

Turn on two-step sign-in for GitHub, Google (Firebase and Play Console), Stripe, GoDaddy and your bank. Give each a
backup method, such as recovery codes kept offline.

## 3. Everyday jobs

**Confirm Zelle payments (daily).**
1. Open **My account** in the app while signed in as an editor.
2. Under *Zelle payments to confirm*, match each reference (CA…) and amount with the memo in your bank's app.
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

## 4. Checks that run by themselves

- Every push to GitHub runs **Code checks** (`.github/workflows/checks.yml`). It confirms that the code and settings
  files are well formed and that no key or keystore file was committed.
- The **Android app bundle** workflow builds the signed app for Google Play.

## 5. If something goes wrong

- Someone you don't know appears in Firebase *Users and permissions*, or as a GitHub collaborator: remove them, then
  change your passwords and keys.
- A key is exposed: delete it at its source (Google Cloud > Service accounts, Stripe > API keys), make a new one, and
  update where it is used.
- A member reports they paid but can't get in: check the Zelle list or Stripe, then use `set_member.py`.
