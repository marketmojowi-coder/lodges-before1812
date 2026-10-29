# Civic Atlas: checkpoints

Each checkpoint is a safe place to stop and come back to. Every one is saved on GitHub (branch `paid-firebase`), so any
of them can be restored. Work through the open ones in order, one at a time.

## Done (saved)

| # | Checkpoint | Date |
|---|---|---|
| 1 | Records, men, lodges, census tables, Atlas, Data Standards, citations with short links | Oct 29, 2026 |
| 2 | Name CIVIC ATLAS everywhere; places: Georgetown, City of Washington, Alexandria, Virginia | Oct 29 |
| 3 | George Washington and the Alexandria uploads added as cited records | Oct 29 |
| 4 | Comfortable reading colors; trade group links to its job description | Oct 29 |
| 5 | Green signed-in badge, two-step sign-in, opening screen, install button, offline copy | Oct 29 |
| 6 | Logo: bareheaded colonial profile in outline under thirteen stars (app, icons, Android, Play graphics) | Oct 29 |
| 7 | Buyer path: create account (username, email, password) → confirm email → pay $9.99 once (card, Zelle, GoDaddy checkout, PayPal if set) with state sales tax → payment confirmed → open | Oct 29 |
| 8 | Sales ledger (each sale a product row, WI tax export), administrator's guide, automatic code checks | Oct 29 |

## Open (do in this order)

| # | Step | Who | Notes |
|---|---|---|---|
| 9 | Make the GoDaddy Pay Link for $9.99 | Owner | GoDaddy > Payments > Pay Links. Send nothing private in chat. |
| 10 | Run `set_zelle.py` with your Zelle address and the GoDaddy link | Owner | See ADMIN_GUIDE.md section 3. |
| 11 | Deploy Firebase (hosting, rules, storage, functions) | Owner | DEPLOY_AND_TEST.md. |
| 12 | Turn on email confirmation template and two-step sign-in (TOTP) in Firebase | Owner | SETUP.md. |
| 13 | Stripe live mode, one-time $9.99 price, Stripe Tax (optional if GoDaddy/Zelle only) | Owner | LAUNCH.md. |
| 14 | GoDaddy DNS: point lodges.mktmojox.com at Firebase Hosting | Owner | Firebase shows the two records to add. |
| 15 | Test purchase end to end with a second email | Owner + Claude | Create account, confirm, pay, confirm payment, green badge. |
| 16 | Market Mojo intro video (intro.mp4) | Owner | Optional; the emblem shows until it is added. |
| 17 | Google Play developer account, upload the app bundle | Owner | PLAY_STORE.md. |

To go back to a checkpoint: open the commit list for `paid-firebase` on GitHub; each commit message names its checkpoint.
