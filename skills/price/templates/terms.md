# Billing terms

The `/price` skill reads this file every run. It holds what the contract fixes, so the skill never carries a contract term of its own. Fill every value from the signed contract. Leave an optional key out rather than guess. Change a value by editing it here and noting the date and why under the table.

| Key | Value | What it is |
|---|---|---|
| contract_label | | The contract's short name as the client knows it, for example `the Agreement`. Optional |
| term_start | | First day of the term. Optional |
| term_end | | Last day of the term, `YYYY-MM-DD`. Required when `increment_rate` is a number |
| increment_rate | | The share of a feature's fee added to the retainer, as a number like `0.20`, or `none` when the contract adds nothing. Required |
| increment_divisor | | How many parts the rate is paid in: `12` for a yearly rate paid monthly, `1` for a monthly rate. Required when `increment_rate` is a number |
| increment_text | | The increment in the client's words, for example `20% a year of the fee, paid in twelve equal monthly parts`. Required when `increment_rate` is a number |
| increment_short | | A short label for table headers, for example `20% a year, in twelfths`. Required when `increment_rate` is a number |
| warranty_days | | Days of free fixes after a feature is deployed. Required |
| clause_increment | | The clause that sets the increment. Optional |
| clause_sow | | The clause that allows a statement of work. Optional |
| clause_maintenance | | The clause that defines maintenance. Optional |
| clause_payment | | The clause with the invoicing and payment terms. Optional |
| payment_terms | | The invoicing rule in one sentence, for the SOW. Optional |
| maintenance_test | | What makes a request maintenance under the contract, in the contract's words. Needed by `classify` |
| new_feature_test | | What makes a request a new feature under the contract. Needed by `classify` |
| measured_from | | Date from which feature work is priced by measured hours (`measured` basis); earlier work is `legacy`. Optional |
| deploy_date_sources | | Read only commands or sources for a deployment date, in order, for example `the PR merge date`. Optional; empty means ask the owner |
| session_gap_hours | | A gap longer than this starts a new work session. Default 3 |
| session_padding_minutes | | Time added to each session for work before the first commit. Default 30 |

## Reference items

Priced features the contract already lists, used to calibrate size. Keep them in `size-weights.md`, under the heading `Reference items`, one row each: item, feature, valuation, and `Counts` (`yes`, or `Waived` for an item that stays out of every sum). A project with no such list has no table, and calibration uses known time anchors only.
