# Civic Vault (1700s–1812)

A searchable index of the lodges of George-Town and the City of Washington, 1789-1811, from the book series by Thomas M. Saharsky. Search by man, lodge, year, trade or building; every record names its book citation and where the original is held.

The site is static (no server, no database): `docs/index.html`, `app.js`, `styles.css` and `data.json`.

Not included: the Commissioners' records (a separate program), and the minute books and ledger of Federal Lodge No. 15 and the Royal Arch minutes, which are the property of the lodge.

## Hosting
- GitHub Pages (free): Settings > Pages > Source: GitHub Actions. The workflow in `.github/workflows/pages.yml` publishes `docs/` on every push to `main`.
- Firebase Hosting (free Spark plan): `firebase deploy --only hosting` (uses `firebase.json`).

## Updating the data
Rebuilt from the project's build_app.py; replace `docs/data.json` and push.
