# Fact check

Read-only. Checks every Civic Atlas record against the series fact register and the lodge rolls, and
checks that each record cites the holder of its original. It never adds or changes a record.

The records are private, so they are never on GitHub. GitHub runs the program's self-test and scans the
public pages for wrong record names on every push. The full check runs where the records are:

    python factcheck.py --data app_data.json --register fact_register.json --people People_Cross_Reference.csv --out report

On Windows, put the three files in Downloads and double-click `run_factcheck.cmd`.
Output: `Fact_Check_Report.md` (summary, holders, findings with citations) and `fact_check_findings.csv`.
Errors stop the check (exit code 1); "to review" items are listed for the author's decision.
