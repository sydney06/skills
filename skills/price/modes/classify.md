# /price classify

`/price classify <scope row or "request">`. A scope row is read in `docs/scope/` with its Done when lines and any spec it links; a request in quotes is taken as written.

1. **Read the request.** → the row (or the request) is quoted in the output.
2. **Apply the Agreement's tests.** Print each test with Yes or No and the line of the request that supports it (no line → No):
   - Maintenance (1.2): existing deployed code fails its documented or reasonably expected function (a Bug); a security fix; a third party's change broke the Platform.
   - New Feature (1.3): it changes behavior, adds business logic, changes a user flow, or adds a capability.
   → every test printed with its line.
3. **Recommend one answer** with its reasons: only Maintenance tests hold → Maintenance; only New Feature tests hold → New Feature; both → Needs discussion, and say how to split the row into a Maintenance part and a New Feature part. → one recommendation.
4. **Ask the owner:** New Feature, Maintenance, Needs discussion, the recommended one first with its one line why. The owner answers → Decided by `Owner`. Nobody answers (an unattended run) → record the recommended answer with Decided by `pending owner confirmation`, never `Owner`, and say in the report the answer is the owner's to confirm. → answered, or pending owner confirmation.
5. **Record** a line in `docs/billing/classification.md` (create it with this header if missing; never rewrite earlier lines): `| Date | Row or request | Answer | Reasons | Decided by |`. Maintenance → the Answer reads `Maintenance, no fee`. → the line exists.
6. **Then.** New Feature → add a ledger line (next free #, the row or request as Feature, its repos, Basis `measured`, State `Planned`) and recommend `/price quote <n>`. Maintenance or Needs discussion → no ledger line; Needs discussion recommends splitting the row in `/scope`. Never edit the scope row. → the report names the ledger line, or says there is none.
