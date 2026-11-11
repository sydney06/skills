# Estimate: <feature>

Ledger line <n> · quoted <date> · model <name> · status **Estimated** (an estimate from the plan; the fee is set later by the owner)

## Plan read
Scope row <row>, spec <path>. Done when: <lines>.

## Size signals from the plan
| Repo | Signal | Count | Weight | Points | Plan line |
|---|---|---|---|---|---|

Estimated counts: <signals or none>. **Size score:** <n> · weights row dated <date>.

## Calibration
Known time anchors (`size-weights.md`): | Ledger line | Owner hours | Score | Hours per point |, then **Rate** <n> (the single anchor, or the median) · lowest <n> · highest <n> · not found: <anchors or none>.
Appendix A items 1 to 4 (fallback when no known time anchor, otherwise a cross check):
| Item | Valuation | Solo hours (valuation / rate) | Score | Hours per point |
|---|---|---|---|---|

Median <n> · lowest <n> · highest <n> · not found: <items or none>.

## Estimate (arithmetic shown)
Solo hours = score x rate = <n>. Estimate = solo hours x contract rate <n> = <n>, nearest 5: **<n>**. Low: **<n>**. High: **<n>**.
Ceiling = Estimate x (1 + <percent>, rates row <date>) = <n>, nearest 5: **<n>**.
Closest anchor: <item>. **Confidence:** Medium | Low (reason, e.g. `single known-time anchor`, with the Appendix A cross check fee and its difference).

## Retainer effect (15% a month, Agreement 2.4b)
At the Estimate: <n> a month · at the Ceiling: <n> a month · first month: pending the deployment date.
