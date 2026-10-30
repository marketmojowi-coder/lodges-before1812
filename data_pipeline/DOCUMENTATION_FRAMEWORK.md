# Data Set Documentation Framework

*The Potomac Territory Series. Thomas M. Saharsky, author and archivist. October 30, 2026.*

## Purpose

National archives, research libraries and data repositories don't hand over a data set alone. Each one comes with a standard set of documents that say what it is, where the originals are, how it was made, what changed, what is still uncertain and how to cite it. This framework names those documents, the published standard behind each one, and where each one sits in every release of the series. The pipeline writes them automatically, so every release, now and in later versions, carries the full set.

## The documentation set

| No. | Document | File | What a reader learns from it | Standard followed |
|---|---|---|---|---|
| 1 | Data set description | docs/README.md | Title, reference code, dates, extent, creator, scope, arrangement, access, related material | DACS (Society of American Archivists), single-level description |
| 2 | Citation metadata | docs/datacite.json | Machine-readable title, creator, editors, version, subjects, coverage, formats, sizes, derivation | DataCite Metadata Schema 4; Dublin Core equivalents |
| 3 | How to cite | docs/CITATION.md | The citation for the data set and for a single record | DataCite citation form; Chicago Manual of Style 14.257 |
| 4 | Codebook | docs/CODEBOOK.md | Every column of every file: definition, type, how full, how many distinct values, an example | DDI (Data Documentation Initiative), variable level |
| 5 | Processing note | docs/PROCESSING.md | Exactly how the data were made: copying, mapping to the taxonomy, holder rules, grading, name rules, what was held back | DACS 8.1.5 processing information; 5.2 source of acquisition |
| 6 | Rights and restrictions | docs/RIGHTS.md | Copyright, who governs the originals, what is withheld and why | DACS 4.1 and 4.4; PREMIS rights |
| 7 | Discrepancy and errata log | docs/ERRATA.md | Known issues, readings still open, pages not yet photographed or read, names still to settle | Research data practice: known issues stated openly |
| 8 | Provenance and preservation events | docs/PROVENANCE.json | Each file's checksum, what the release was derived from, and the events (creation, fixity check, validation, withholding, new version) with dates and agents | PREMIS 3 (Library of Congress); W3C PROV-O; 36 CFR 1236.54 |
| 9 | Name authority file | docs/NAME_AUTHORITY.csv | One authorized form per person, variant forms, the basis for the form, dates, series, best evidence and holders | Authority control after the LC Name Authority File and EAC-CPF |
| 10 | Name change log | docs/NAME_CHANGES.csv | Every form found in a record that was brought to the authorized form, the kind of change, the basis and example records | Authority control decisions |
| 11 | Settled decisions | docs/SETTLED_DECISIONS.csv | The series' settled forms and facts with their sources | Series fact register |
| 12 | Certificate | CERTIFICATE.md | The checks run and their results, the files, the holders, what was kept out | Validation report (36 CFR 1236.56 asks for validation; this is the author's own, not an outside audit) |
| 13 | Manifest | MANIFEST.json | Everything above in one machine-readable record, with input hashes and the version note | Release manifest |
| 14 | Package | bagit.txt, bag-info.txt, manifest-sha256.txt, tagmanifest-sha256.txt | A standard archival package that any BagIt tool can validate | BagIt, RFC 8493 (Library of Congress) |
| 15 | Fixity list | SHA256SUMS | A checksum for every file in the release | FIPS 180-4 SHA-256; `sha256sum -c` |
| 16 | Change ledger | ledger/release_ledger.jsonl | Every release, version, verification and document, in order, each entry chained to the one before | Append-only, hash-chained audit log |

Documents 9 to 11 come with every release that names people: the combined releases, the four series and the new book.

## How names are controlled

- **Authorized form.** The lodge rolls are authoritative. Where a man is on a roll, the roll form is the authorized form. Otherwise the fullest form in the records is used.
- **Variant forms.** Every other form found in the records is kept as a variant. Nothing is erased.
- **Change log.** Each form brought to the authorized form is listed with the reason: word order or punctuation, or a spelling variant on the roll's spelling list.
- **No guessing.** Two forms are joined only when they match exactly once case, titles, punctuation and word order are set aside. Possible pairs that don't match exactly stay apart until settled, and they are listed in the errata log.
- **Settled decisions.** Decisions already made for the series, such as Sayres and Stevenson, travel with the data in SETTLED_DECISIONS.csv.

## How changes are accounted for

1. A release is never edited. Any change, whether a new reading, a corrected name or a new year of the Proceedings, is made in the working data set and frozen as a new version.
2. The new version names the version it replaces and that version's checksum. The PREMIS events record the change, and the manifest carries a plain-language note.
3. The ledger records the new version. Each ledger entry carries the checksum of the entry before it, so a changed or removed entry breaks the chain.
4. `verify` rechecks every file in every version against its checksums, the manifest, the package files and the ledger. The earlier versions are kept, so any past state can be checked again.

## What this framework does not claim

- It is not certification by the National Archives or any outside body. No such scheme exists for a private researcher's data sets. It follows the same published standards archives use, and the checks are the author's own.
- No DOI is assigned. The identifier `PTS-DS:<release>:v<N>` is local. A DOI can be added when the data are deposited with a repository.
- No reuse license is granted yet. The rights statement reserves all rights until the author chooses one.
