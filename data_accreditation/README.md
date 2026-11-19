# Data Set Accreditation Tools

Proof of data review and reproduction for the Potomac Territory Series data releases
(`/mnt/project-files/data_releases/`). Both tools only read the certified store; neither
writes to `releases/` or to the ledger.

| Tool | What it proves | Output (under `data_releases/accreditation/`) |
|---|---|---|
| `reproduce.py` | 1. Fixity of every certified file, manifest and ledger entry. 2. A fresh copy of the pipeline, run in an empty folder from the frozen sources, rebuilds every combined, series and new-book data file byte for byte (SHA-256). 3. Which working sources changed since the last freeze. | `reproduction/Reproduction_Report_<utc>.md`, `reproduction_<utc>.json`, `SHA256SUMS` |
| `assess.py` | FAIR self-assessment (15 principles, RDA FAIR Data Maturity Model wording) and a review record for each data set, joined to the latest reproduction result. | `FAIR_and_Review_Register.md`, `reviews/<release>.json` |

```
python3 -I reproduce.py   # exit 0 only when fixity and reproduction pass
python3 -I assess.py
```

First run, 2026-11-04: **PASS**. 48 versions and 61 ledger entries pass fixity; 19 of 19
rebuildable releases are byte-identical (R01 is a research release frozen as received).
Three working sources changed after the last freeze (S03, S10, S11); the next pipeline build
writes new versions.

CoreTrustSeal certifies repositories, not data sets. The recognised routes for a data set
are a DOI deposit in a curated repository (Zenodo, or openICPSR, which is CoreTrustSeal
certified) and a peer-reviewed data paper (Journal of Open Humanities Data). The Federal
Lodge minute books and ledger and the Royal Arch minute text are never deposited.
