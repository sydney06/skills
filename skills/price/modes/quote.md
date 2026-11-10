# /price quote

`/price quote <feature>`. Refuse when the ledger line is not in State Planned or Estimated (no line → recommend `/price classify`; a SOW already Sent or Acknowledged → the SOW holds the estimate, recommend `sow raise`). Read `templates/estimate.md` before step 4.

1. **Read the plan:** the scope row, its Done when lines and its spec (build plan, API surface, data changes, screens). Never read commits for this feature. → the sources listed.
2. **Size signals from the plan:** the signals of `size-weights.md`, each with the plan line it came from. Hand written lines: the plan's own figure, else your estimate from the files the plan names, marked estimated. → each signal with its source.
3. **Score and calibrate** as the legacy basis steps 1 and 2 in `SKILL.md` (Appendix A items 1 to 4, item 5 excluded). → the score and the calibration table.
4. **Estimate**, each with its arithmetic:
   - Solo hours = score x median. **Estimate** = solo hours x contract rate, nearest 5. Low and high as the legacy basis, nearest 5. Confidence as the legacy basis.
   - **Ceiling** = Estimate x (1 + the Active row's Ceiling percentage), nearest 5.
   - **Retainer effect:** 15% of the Estimate and 15% of the Ceiling a month, the first month pending the deployment date.
   → all printed.
5. **Write** `docs/billing/audits/<feature>-estimate.md` from the template. Ledger line: State `Estimated`, Estimate, Ceiling, and no other cell. → the file exists and the line says Estimated.
6. **Report.** Headline: feature, estimate, ceiling, confidence. Next: `/price sow <feature> register`. Heads up: Low confidence, estimated counts.
