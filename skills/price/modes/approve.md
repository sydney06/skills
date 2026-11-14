# /price approve

Runs only when the command carries a feature and an amount. Quote the owner's words from the command in the report; never infer approval from earlier chat.

1. **Refuse** when the feature has no audit, the amount is missing or not a positive number with at most two decimals ("ok", "600 usd", zero and negative are all refused), the feature is Waived, its ledger line is In progress, its SOW status is Declined, or the amount is above the line's Ceiling (when it is a number) and the SOW has no Acknowledged raise at or above the amount. → say which, and stop.
2. An amount outside the audit's low to high is accepted and flagged in the report.
3. Set the ledger status to Approved with the amount, the rate row used, the date, and who gave the word and where; on every approval, also rewrite the audit's status line (line 3) to `status **Approved** at <amount> on <date>`. → all recorded.
4. The schedule's `Increment detail` table (missing → create it under that heading with header `| Feature | Approved fee | Increment (<increment_short>) | Deployed | Warranty ends | Increment starts |`) holds one row per feature, its increment the monthly increment of the approved fee; replace this one's (never a second) and recompute each month's Approved increments and Fee from those rows. Legacy: the increment starts on the 1st of the month after the `SOW acknowledged` date (deployment is information only); empty → **pending the SOW acknowledgement**. Not legacy: SOW status not Acknowledged → **pending the acknowledgement**; else unknown deployment date → **pending a date**; else set warranty end and increment start. Pending → record Approved, retainer effect pending, nothing added to any month; else rebuild `retainer-schedule.md`.
5. List the client's acknowledgement as outstanding unless the SOW status is Acknowledged; never mark it.
6. **Report** with Headline, Next (the pending date or acknowledgement), and Heads up for an out of range amount.
