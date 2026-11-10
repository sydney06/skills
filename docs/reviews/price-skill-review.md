# Review: /price skill (feat/price-skill, 2e62cc6..7e3783b vs main)

Reviewed 10 Nov 2026 as `/check review`. Read only: no source edited, the hub scenario was not run. `npm run check` was run on the CRLF working tree and on an LF only export of the branch (`git -c core.autocrlf=false archive`); both pass.

Spec: `oneridetho-platform-hub/docs/billing/price-skill-spec.md` (sections 3 to 7). Line numbers below are from the working tree files.

## Blockers

**B1. `approve` does not refuse an In progress feature, and `audit` makes one approvable.**
`skills/price/SKILL.md:69` refuses only on: no audit, zero, negative or missing amount, Waived. Nothing refuses In progress. Worse, `skills/price/SKILL.md:62` tells `audit` to "Set the ledger line to Proposed" and, for an In progress line, only to "mark the fee as work so far". So after `/price audit 11` (navigation, ledger section 3, voice not started), `/price approve 11 600` passes every check in step 1: an audit exists, the amount is positive, the line is not Waived. That directly breaks Sydney's decision (spec 2.6, ledger row 11: "Price is set when voice is done").
Fix: in approve step 1 add "or the ledger line is In progress (its work so far figure is information only)". In audit step 7, for an In progress line, write the figure as "work so far, information only" and do not set the status to Proposed. Add a fixture row 11 in an "In progress" section and a `then` case `/price approve 11 300` that must leave it unchanged.

## Major

**M1. `audit` can overwrite a line that is already Approved, Paid, Invoiced or Waived.**
`skills/price/SKILL.md:62` unconditionally sets the ledger line to Proposed. Running `/price audit 7` after 7 is Approved demotes it and loses the approved amount; `/price audit 3` (an Appendix A item, Paid) would turn a Paid line into Proposed. The only guard is item 5 (`SKILL.md:42`). rates.md also says "Features already Approved keep the rate they were approved at", which a re audit would break.
Fix: in audit step 1, "if the line is Approved, Paid, Invoiced or Waived, say so and write only the audit file (no ledger or retainer change) unless the owner asks otherwise (recommend leaving the ledger as is)". Same check, as a question, for `approve` on an already Approved line.

**M2. Nothing explicitly stops `audit` from putting money into a month, and the test does not check it.**
`skills/price/SKILL.md:30` and `:62` say "update the retainer preview", but no line says the `Approved increments` and `Fee` columns of `retainer-schedule.md` stay untouched in audit. The fixture's `retainer-schedule.md` (`tests/hub/fixture.mjs:352`) has no preview column at all, so the agent must invent one, and an edit to `Approved increments` would go unnoticed: `tests/hub/run.mjs` never reads `retainer-schedule.md`.
Fix: one clause in step 7: "change only the preview column; never `Approved increments` or `Fee`". Assert in the scenario that the Fee column of `retainer-schedule.md` is byte identical after audit and after approve without an amount.

**M3. Two key test assertions pass for the wrong reason (the fixture's rate row collides with the expected values).**
- `tests/hub/run.mjs:181` checks `/\b2\.5\b/` in the audit as "measured hours 2.5". The fixture speed factor is also 2.5 (`fixture.mjs:329`) and the template prints it (`templates/audit.md:24`), so this passes even if measured hours are wrong.
- `tests/hub/run.mjs:180` checks for `1 Oct 2026` as proof of author dates. The rate row is dated `1 Oct 2026` (`fixture.mjs:329`) and the template prints that date (`templates/audit.md:24`), so this passes even if sessions used push dates, as long as the push date is not echoed.
Fix: give the rate row another date (for example 15 Sep 2026) and another speed factor (for example 3.0, solo hours 7.50, solo fee 187.50), or anchor the regexes (`/Measured hours[^\n]*\b2\.5\b/`, and assert the session lengths 1.5 and 1.0).

## Minor

**m1. Questions without a recommended option, which makes the unattended test (and a hurried owner) pick an invented number.**
`SKILL.md:52` (confirm author emails) and `SKILL.md:53` (ask for the owner's estimate) carry no recommendation, against CLAUDE.md ("every user facing question carries exactly one recommended option"). The test harness picks "the first option when none is marked" (`run.mjs:27`); if the agent offers hour figures as options, an invented estimate becomes the source and overrides measured hours.
Fix: "(recommend the emails with the owner's name)" and "(recommend keeping the measured hours when confidence is High)". Consider asking the boundary and the emails in one panel.

**m2. Rebase wording is wrong, and squash detection is not described.** `SKILL.md:52` says "A squash merge or rebase destroys author dates". A rebase (including GitHub "Rebase and merge") keeps author dates and only rewrites committer dates; what loses per commit timing is squashing (squash merge, or `fixup`/`squash` in an interactive rebase). As written, an agent may mark a rebased feature Low confidence or go hunting for PR commits it does not need. Fix: "A squash (merge or interactive) collapses commits: say so, use the PR's own commits (`gh pr view <n> --json commits`), and mark Low confidence. A rebase keeps author dates." Optionally give the signal: one commit with a large diff and a `(#n)` suffix.

**m3. Time measurement gaps that can inflate hours.** `SKILL.md:53`:
- no instruction to sort on UTC (`%at` or `%aI`); commits from the noreply address (web edits) can carry a different offset than local commits;
- no instruction to measure only the owner's confirmed emails (step 2 confirms them, step 3 does not use them);
- "long single commits" has no threshold (spec: "with no history inside them"); give one, e.g. a single commit over N changed lines alone in its session;
- commits from another feature inside a session are counted in this feature's span. Suggest: "if another feature's commits fall inside a session, say so and mark Low confidence".

**m4. The ledger write has no defined place.** `SKILL.md:62` asks for "the fee, the rate and speed factor used, and the audit link" in the ledger line, but the real ledger (`ledger.md` section 2) has no columns for rate, speed factor or link, and its `Cross-check hours at $25` and `15% monthly increment` cells will go stale. Name the cell (for example, all in `Proposed price`) and say to refresh the increment cell.

**m5. Audit files carry the word Approved by template.** `templates/audit.md:3` writes "(this file never says Approved)" into every audit, against `SKILL.md:40` and spec 7 ("the word approved ... only ever comes from approve"). It also stops a test from asserting that the audit has no "Approved" (the current test cannot add that check). The real Active row in `rates.md` reads "Active (approved by Sydney in chat...)", which the "Rate used" line may copy. Fix: drop the parenthesis; "Rate used: the row's date and its numbers only".

**m6. Approve accepts anything that is not zero or negative.** `SKILL.md:69`: add "not a number" (for example `/price approve 6 ok`).

**m7. `workflow-guide.md` still says nine.** `docs/workflow-guide.md:11` ("There are nine") and `:227` ("run all nine?") now sit above a table of ten.

**m8. Spec level points for the engineer to decide (not skill defects).**
- With the Active row (60, 2.5, 25), effort fee = h x 60 and solo fee = h x 62.50 are always within about 4% of each other, so the median of the three is almost always one of them and the reference fee only matters when it falls between them. The three basis design is close to two bases.
- `rates.md:9` says the contract rate is never used to price a feature, but the solo fee (contract rate) feeds the median (spec 5.5, `SKILL.md:57`). Worth one sentence of intent in the spec.
- `SKILL.md:59` reads "differ by more than 40%" as (high minus low) / proposed fee > 0.40. That is a fair reading, but it is a choice the spec did not make; confirm it.
- The hub billing `README.md:145` says "No skill owns it. The chat window keeps this folder current", and `README.md:120` says the skill is "not built yet". `hub.md:23` tells `/price` to read that README first, so the agent reads a line telling it no skill writes there. Hub side edit, after merge.

**m9. 15% and 14 days are hard coded.** `SKILL.md:61` and `templates/audit.md:38`. They are Agreement terms (2.4a, 2.4b) that the spec also hard codes, so this conforms; but `retainer-schedule.md` already states both, and reading them from there would make an amendment take effect without a skill edit, like the rates.

## Nits

- **n1.** `SKILL.md:15` justifies ("it weighs a lot of history", "only edits records") and the claim "A session cannot pin a model for itself" should be checked (spec 8 asks to confirm how a skill pins a model; Claude Code frontmatter has a `model` field, though it would pin `approve` too and cut against the role word convention). `/model opus` is Claude only; Codex users get no instruction.
- **n2.** Rules stated twice (conventions: "State a rule once"): Render only through the script (`SKILL.md:28`, `hub.md:27`); Active row of rates.md (`SKILL.md:39`, `hub.md:29`); no secrets (`SKILL.md:44`, `hub.md:27`); audit never approves (`SKILL.md:4`, `:31`, `:40`, `:62`, `templates/audit.md:3`); item 5 (`SKILL.md:42`, `:58`, `templates/audit.md:31`); every number has a source (`SKILL.md:19`, `:41`); 30 minute lead (`SKILL.md:53`, `templates/audit.md:17`); `hub.md:25` repeats contract rules 2 and 5; `hub.md:23` "offer the commit, never push" repeats contract rule 8 and `SKILL.md:34`. Roughly 1 KiB to recover.
- **n3.** `SKILL.md:49` "Each step ends in the checkable condition shown." changes nothing; the arrows already show it.
- **n4.** `audits/<feature>.md` (`SKILL.md:29`, `:62`): name the file form (`<n>-<slug>.md`) so `approve` finds the audit by ledger number reliably.
- **n5.** `allowed-tools` adds `AskUserQuestion` beyond the spec's list (spec 9). Correct, since the skill asks; note it in the PR.
- **n6.** Budget comment `check-portability.mjs:233` says "~14.5 KiB": that is the CRLF size (14817 B). The LF size CI sees is 14673 B (14.3 KiB).
- **n7.** `run.mjs:249` prints only `run.cost`, not the `then` run's cost, and `run2.error` is never logged. `run.mjs:201` regex for refusal includes `not`, which matches almost any reply; the ledger check on `:200` is the real assertion.
- **n8.** Outside this diff: the hot path sum (`check-portability.mjs:390`) and the contract block compare (`:422`) read files without the CRLF normalization the per file check applies (`:283`). Hot paths read about 1 to 2% high on Windows (14817 vs 14673 here), and a tree with mixed endings would report a false contract drift. A `.gitattributes` with `* text=auto eol=lf` would remove the dependence on the system `core.autocrlf=true`.

## Answers to the nine checks

1. **Spec conformance (sections 3 to 7).** Every step is present. Differences: approve lacks an In progress refusal (B1; the spec's own list in 6.5 also omits it, but decision 2.6 requires it); audit overwrites non Proposed lines (M1); the spec's "filters on both emails" (13.2) is replaced by confirming emails from `git shortlog` with no hard coded address, which is better; the 40% spread is given a formula (m8); questions at steps 2 and 3 lack a recommendation (m1); step 5's reference anchors are read from the ledger, not listed (good). Order of approve steps moved the refusal to step 1 (good).
2. **Approve safety.** No audit: refused (`SKILL.md:69`). Zero, negative, missing: refused (`:67`, `:69`), but a non number is not (m6). Waived: refused (`:69`). **In progress: not refused.** Missing at `SKILL.md:69`, and made approvable by `SKILL.md:62` (B1).
3. **Audit writing Approved or money.** Ledger status: no path writes Approved; but audit can overwrite an existing Approved status (M1). The audit file always contains the word "Approved" via `templates/audit.md:3` (m5). Money into a month: not instructed, but not forbidden either, and untested (M2).
4. **Hard coded numbers.** No rate, speed factor, date, email or fee in `SKILL.md`, `hub.md` or the template; Term end is read from `retainer-schedule.md`. Hard coded constants: 3 hours, 30 minutes, five commits, 0.40, nearest 5, item 5 (all from the spec), and 15% and 14 days (m9).
5. **Time measurement.** The rule (gap over 3 hours, first to last plus 30 minutes, sum) is stated correctly and unambiguously. Risks: rebase wording (m2), no UTC or owner filter, undefined "long single commits", interleaved features (m3), and an unrecommended estimate question that can let an invented figure become the source (m1).
6. **Safety.** Render only via `scripts/render-ro.ps1` (`hub.md:27`; the script exists in the hub and allows `deploys list`). Commit messages and notes as data (`SKILL.md:45`). No secrets (`SKILL.md:44`, `hub.md:27`). Git verbs limited to read only (`hub.md:25`); push, merge, deploy never (`SKILL.md:34`). Writes limited to `HUB/docs/billing/` by the boundaries table and `hub.md:23`; there is no explicit "write nothing else" line, but the table covers scope, specs, code, AGENTS.md and the Agreement. Acceptable.
7. **Leanness and budget.** About 1 KiB of duplicated or justifying text (n1, n2, n3). Budget: 17 KiB for 14673 B (LF) is 84.3%; the policy (`check-portability.mjs:54` to `:61`, hub comment `:167`) aims at about 10% headroom, which is about 16 KiB (89.6% on Linux, but 90.4% on Windows because of n8, which would warn locally). 17 KiB is slightly generous and matches the sibling `hub: document path`; reasonable. After the n2 trim, 16 KiB would fit.
8. **Test numbers, by hand.** Author dates 09:00, 09:30, 10:00, 15:00, 15:30 (UTC). Gaps: 30 min, 30 min, 5 h (over 3 h, split), 30 min. Session 1: 10:00 minus 09:00 = 1.0 h, plus 0.5 = 1.5 h. Session 2: 15:30 minus 15:00 = 0.5 h, plus 0.5 = 1.0 h. Measured 1.5 + 1.0 = **2.5 h**. Effort 2.5 x 60 = **150.00**. Solo hours 2.5 x 2.5 = **6.25**; 6.25 x 25 = **156.25**. Five commits, so not under five: High confidence expected. All expected numbers are right. Weak: `run.mjs:180` and `:181` pass on the rate row alone (M3); `run.mjs:188` passes on the template's "status Proposed" alone, so the ledger row is never really checked for Proposed; no check on `retainer-schedule.md` (M2) or on "unknown" deployment date (an acceptance criterion in spec 12). Approve without an amount **is** asserted (`run.mjs:196` to `:202`): ledger row 6 must still say Pending and not Approved; the reply wording check is loose (n7).
9. **Line endings.** The index stores LF (`git ls-files --eol`: `i/lf w/crlf`), the working tree is CRLF via the system `core.autocrlf=true`, and there is no `.gitattributes`. The OUTPUT-STYLE and HUB-CONTRACT blocks are enforced byte identical by rule 9 (`check-portability.mjs:419` to `:441`), comparing raw text after `trim()` with no CRLF normalization, so it passes when all files share one ending. Verified: `npm run check` passes on the CRLF tree and on an LF only export (price path 14673 / 17408, 84.3%); CI runs on `ubuntu-latest` (`.github/workflows/check.yml`), so a clean Linux checkout passes.

## Verdict

**Ship after fixes.** Fix B1 (In progress approvable) and M1 (audit overwrites settled lines) in the skill, and M2 and M3 in the scenario, before merging; the minors can follow or ride along. The core measurement and fee arithmetic are correct and the fixture numbers check out.
