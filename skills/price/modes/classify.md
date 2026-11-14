# /price classify

`/price classify <scope row or "request">`. A scope row is read in `docs/scope/` with its Done when lines and any spec it links; a request in quotes is taken as written.

1. **Read the request.** → the row (or the request) is quoted in the output.
2. **Apply the contract's tests** from `terms.md` (a missing key → stop and name it). Print each test with Yes or No and the line of the request that supports it (no line → No):
   - Maintenance (`clause_maintenance`): each part of `maintenance_test`.
   - New Feature (`clause_sow`): each part of `new_feature_test`.
   → every test printed with its line.
3. **Recommend one answer** with its reasons: only Maintenance tests hold → Maintenance; only New Feature tests hold → New Feature; both → Needs discussion, and say how to split the row into a Maintenance part and a New Feature part. → one recommendation.
4. **Ask the owner:** New Feature, Maintenance, Needs discussion, the recommended one first with its one line why. Decided by is `Owner` only if the owner answered in this conversation; otherwise, even when you record the recommended answer, it is `pending owner confirmation`, and the report says the answer is the owner's to confirm. → answered, or pending owner confirmation.
5. **Record** a line in `docs/billing/classification.md` (create it with this header if missing; never rewrite earlier lines): `| Date | Row or request | Answer | Reasons | Decided by |`. Maintenance → the Answer reads `Maintenance, no fee`. → the line exists.
6. **Then.** A ledger line for this row or request exists → reuse it, never a second; an answer other than New Feature → report the conflict and ask. Otherwise New Feature → add a ledger line (next free #, the row or request as Feature, its repos, Basis `measured`, State `Planned`) and recommend `/price quote <n>`. Maintenance or Needs discussion → no ledger line; Needs discussion recommends splitting the row in `/scope`. Never edit the scope row. → the report names the ledger line, or says there is none.

The owner later answers a pending classification → append a new line with Decided by `Owner` that supersedes the pending one; never rewrite earlier lines.
