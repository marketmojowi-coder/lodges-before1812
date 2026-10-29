# Instructions for research agents filling the fact bins

You add facts about the men of the lodges of George-Town and the City of Washington before 1812. An editor checks every fact against its source before members see it.

1. One fact per line of a JSONL file, with: bin, man (spelled as the source spells it), lodge, year, claim, citation, held_at, and a short verbatim quote.
2. The citation must let a reader find the original: record or publication, date, page or folio, and where it is held (e.g. "National Intelligencer and Washington Advertiser, March 25, 1808, p. 3" held at "Library of Congress, Chronicling America").
3. Bins: rolls, people, trades, property, newspapers, parish.
4. Never use the minute books or ledger of Federal Lodge No. 15 or the Royal Arch minutes. They are the lodge's property.
5. The Commissioners' records (Record Group 42) are a separate program. Use them only as printed in a book of the series, and cite the book.
6. Never guess, merge two men, or fill a gap. Same name is not the same man. Keep Jr. and Sr. apart.
7. Send with: python3 agents/submit_facts.py facts.jsonl --agent NAME (try --dry-run first).
