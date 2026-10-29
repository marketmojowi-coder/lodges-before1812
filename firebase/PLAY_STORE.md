# Google Play: Lodges Before 1812 (Android app)

The Android app is the member website wrapped as a Trusted Web Activity (TWA). Same sign-in, same data, no second code base.

## Simple checklist (what Google Play asks for)
| Requirement | Where it is |
|---|---|
| App icon 512x512, maskable icon | public/icons/ |
| Web app manifest (name, colors, start page) | public/manifest.webmanifest |
| Opens offline (shows a page, not an error) | public/sw.js + offline.html |
| Privacy policy URL | https://lodges.mktmojox.com/privacy.html |
| Account deletion, in the app and on the web | https://lodges.mktmojox.com/delete-account.html |
| Digital Asset Links (proves you own the site) | public/.well-known/assetlinks.json (paste the SHA-256 from Play) |
| No outside payment inside the app | auth.js hides "Become a member" when opened from the app (?source=twa) |
| Login for Google's reviewers | App access: give a test member account (see below) |

## Payments rule (important)
Google Play does not allow an app to sell digital content through Stripe or to link to an outside checkout. So in the Android app, members only **sign in**; memberships are bought on the website. The app shows no price, no buy button and no link to buy.

## Steps
1. Deploy the member site first (SETUP.md) so https://lodges.mktmojox.com works.
2. Google Play Console (play.google.com/console): developer account for **Market Mojo LLC**, $25 one time. An organization account needs a D-U-N-S number for the LLC (free from Dun & Bradstreet; the SAM.gov UEI is a different number).
3. The Android package is built for you by GitHub Actions from the `android/` folder (workflow "Android app bundle", on every push to `paid-firebase`, or Actions > Android app bundle > Run workflow). It produces `app-release.aab` (for Play) and `app-debug.apk` (to install on a phone for testing) under the run's Artifacts.
   - Package ID `com.marketmojo.lodges1812`; app name Lodges Before 1812; launcher name Lodges 1812; opens `https://lodges.mktmojox.com/?source=twa`; navy #14243A.
   - **Upload key (one time, on your own computer):** `keytool -genkeypair -v -keystore lodges-upload.jks -alias lodges -keyalg RSA -keysize 2048 -validity 10000`. Keep the file and passwords safe and out of the repository.
   - Add four repository secrets (GitHub > Settings > Secrets and variables > Actions): `ANDROID_KEYSTORE_BASE64` (output of `base64 -w0 lodges-upload.jks`), `KEYSTORE_PASSWORD`, `KEY_ALIAS` (`lodges`), `KEY_PASSWORD`. The next run signs the bundle. Without them the bundle is unsigned and Play will not accept it.
   - Raise `versionCode` in `android/app/build.gradle` for each new upload.
4. Play Console > Create app > upload the .aab to **Internal testing** first.
5. Play Console > Setup > App signing: copy the **SHA-256 certificate fingerprint** into public/.well-known/assetlinks.json, then `firebase deploy --only hosting`. (Without this the app shows a browser bar.)
6. Fill in the store listing and the forms below, then move from Internal testing to Production.

## Answers for the Play Console forms
- **Category:** Books & Reference. **Tags:** History, Reference.
- **Contains ads:** No. **In-app purchases:** No.
- **Target audience:** 18 and over.
- **Content rating questionnaire:** Reference/education app; no violence, sexual content, gambling, user-to-user chat or location sharing. Users can submit text (facts) that is reviewed before others see it.
- **Data safety:**
  - Collected: Name, Email address (account management, app functionality); User-generated content: facts added to the bins (app functionality).
  - Not collected: location, contacts, photos, financial info (payments happen on the website through Stripe), device IDs, analytics.
  - Shared with third parties: No. Encrypted in transit: Yes. Users can request deletion: Yes (in-app link and web page).
- **App access:** "All features need a membership. Test account: <email> / sign in with the email link sent to <email>", or give a Google test account. Make it an editor with admin/set_editor.py so reviewers see everything.
- **Government / news / health declarations:** Not applicable.

## Store listing text
**Short description (80):** Search the lodges of George-Town and Washington before 1812, every record cited.

**Full description:**
Lodges Before 1812 is the research data set behind the book series by Thomas M. Saharsky on the Masonic lodges of George-Town and the City of Washington, 1789-1811.

- 4,764 records: lodge rolls and returns, officers, timelines, payrolls, lot sales, parish records and newspaper citations
- Seven lodges, the Royal Arch Chapter and Washington Parish
- Search by man, lodge, year, trade and building
- Every record cites its book and where the original is held: the Grand Lodge of Maryland returns, the National Archives, the Library of Congress, newspapers and parish archives
- Fact bins: new facts are added with their sources and reviewed before they count

For members. Published by Market Mojo LLC.

**Screenshots:** at least 2 phone screenshots (1080x1920): the sign-in page, a search result, a man's card, the fact bins.
