# Audit: <feature>

Ledger line <n> · audited <date> · model <name> · status **Proposed**

## Feature boundary
Scope rows, branches, PRs, repos left out and why. Confirmed by the owner: yes | corrected.

## Evidence (one table per repo)
| Repo | Commits | Author emails (split) | Files | Lines +/- | Migrations | Routes | Screens | Jobs | Emails | Socket events | Tests added | Test to code ratio |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

Rework: fix commits, commits after review or verify, reverts.
Process: boxes ticked, specs and notes, review findings fixed.
Squash or rebase: none | where, and what was used instead.

## Sessions (author dates)
| # | Start | End | Commits | Length incl. 30 min lead |
|---|---|---|---|---|

Gaps over 3 hours, days with one commit.
**Measured hours:** <n> · **Confidence:** High | Low (reason) · Owner estimate: <n or none, becomes the source>

## Rate used
Rates row dated <date>: feature rate <n>, contract rate <n>, speed factor <n>. Proposed row, if any, printed for comparison only.

## Fees
| Basis | Arithmetic | Fee |
|---|---|---|
| Effort | measured hours x feature rate | |
| Solo | measured hours x speed factor = solo hours; x contract rate | |
| Reference | Appendix A items used, size adjustments (item 5 excluded) | |

**Proposed fee:** <median, nearest 5> · **Low:** <n> · **High:** <n>
Spread over 40%: no | yes, why, and the basis the owner chose.
With an Estimate: fee = SOW Current fee, else the ledger Estimate when there is no SOW, <n>, unchanged by the hours · effective rate = fee / measured hours = <n> (information only) · effort fee vs Ceiling <n>: within | above (a raise needs the client's reply).

## Dates and retainer effect
Deployed: <date and source> | unknown (needed: <what>). Warranty ends: <date>. Increment starts: <1st of month>.
Increment: 15% of fee = <n> a month · months to Term end: <n> · total: <n> | pending a date.

## Open items
Client acknowledgement: outstanding. Anything missing or flagged.

## Legacy variant: in place of Sessions, Rate used, Fees
Basis: legacy, size based · weights row dated <date> · contract rate <n> (rates row <date>) · rate and speed factor: n/a (legacy: contract rate)

## Size signals
| Repo | Signal | Count | Weight | Points | Files |
|---|---|---|---|---|---|

Excluded: <files>. Moved lines (not counted): <files and lines or none>. **Size score:** <n>. Built (commit dates, not effort): <first> to <last>.

## Calibration
Known time anchors (`size-weights.md`): | Ledger line | Owner hours | Score | Hours per point |, then **Rate** <n> (the single anchor, or the median) · lowest <n> · highest <n> · not found: <anchors or none>.
Appendix A items 1 to 4 (fallback when no known time anchor, otherwise a cross check column):
| Item | Valuation | Solo hours (valuation / rate) | Score | Hours per point |
|---|---|---|---|---|

Median <n> · lowest <n> · highest <n> · not found: <items or none>. Cross check fee <n> (score x median x contract rate), differs from the proposed fee by <n>.

## Fee
Solo hours = score x rate = <n>. Fee = solo hours x contract rate = <n>, nearest 5: **<n>**. Low = score x lowest x rate = <n>, nearest 5: **<n>**. High = score x highest x rate = <n>, nearest 5: **<n>**.
Closest anchor: <item>. **Confidence:** Medium | Low (reason, e.g. `single known-time anchor`).

Increment starts: <1st of month after the SOW acknowledgement date> | pending until that date exists (never the registration date). Deployed: information only.
