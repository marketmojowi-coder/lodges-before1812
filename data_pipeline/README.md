# Potomac Territory Series: Immutable Data Sets

Thomas M. Saharsky, author and archivist.

This is the data layer only. No app or page reads it or is changed by it.

## What it builds

Releases are written to `/mnt/project-files/data_releases/releases/<release>/v<N>/`.

| Stage | Releases | What they are |
|---|---|---|
| 1. Frozen sources | S01–S12 | Exact copies of each existing data set: the six lodge books, the lodge rolls cross-reference, the fact register, RG 42 Commissioners, Cornerstones, the people register and the census findings |
| 2. Combined | C01, C02 | Every record mapped to the nine shared taxonomy terms (C01), and a people index across all sources (C02) |
| 3. Census series | SER4 | Census and directory findings as their own series, plus the census pages still to read |
| 4. Book series | SER1–SER3 | Lodge books, the Federal City (RG 42 and RG 217), Cornerstones |
| 5. New book | NB1 | The final combined data set, built from the four series releases |

Each release folder holds:

- `data/`: the data files (CSV in UTF-8, JSON, Markdown)
- `MANIFEST.json`: title, creator, version, inputs with their hashes, files with SHA-256, checks, holders and anything held back
- `SHA256SUMS`: checksums in the standard `sha256sum -c` format
- `CERTIFICATE.md`: the checks and their results, in plain language

## Safety rules

- **Never edited.** If the content changes, a new version is written. An existing version is never overwritten.
- **Read-only.** Files are set to 0444 and folders to 0555 where the disk allows it. The shared project folder ignores file permissions, so there the checksums and the ledger enforce it: any change shows up in `verify`.
- **Fixity.** Every file gets a SHA-256 checksum, and the checksum is read again after copying.
- **Ledger.** `ledger/release_ledger.jsonl` is append-only. Each entry carries the hash of the entry before it, so any edit or deletion breaks the chain and `verify` reports it.
- **Provenance.** Every combined record names its source release, version, file, row and row hash.
- **Holder.** Every record names the archive holding the original. A release fails certification if any record has no holder.
- **Private records.** The Federal Lodge minute books and ledger are never included. The Royal Arch minute text is held back too, as in the Grand Lodge of D.C. package. This is enforced by file name at freezing and by row text at mapping.
- **Primary data first.** Records sort A (original read), then B (copy of the original), then C (reference only). Lodge rolls supply the name form.
- **No guessing on names.** People are joined only when their normalised names match exactly. Same-name traps stay separate.

## Commands

```
python3 -I potomac_data.py build    # builds only what changed, then verifies
python3 -I potomac_data.py verify   # rechecks every file, manifest and the ledger chain
python3 -I potomac_data.py status   # last ledger entries
```

`verify` exits with a non-zero code if any check fails.
