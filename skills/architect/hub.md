# /architect: hub mode

Read this only in hub mode (the trigger line in `SKILL.md`). The contract applies first; the section after it says exactly how this skill's own steps change. Anything not mentioned works as `SKILL.md` says.

<!-- HUB-CONTRACT:START (identical in every skill's hub.md; edit all or none) -->
## Hub contract

A hub is a folder holding several independent git repos plus a `workflow.repos.json` that lists them. The hub folder is its own small git repo: it versions only the workflow files (`docs/`, the hub `AGENTS.md` and `CLAUDE.md`, `workflow.repos.json`, `.gitignore`) and ignores every repo folder. Call the hub folder `HUB`.

1. **Detect.** `workflow.repos.json` at the project root: hub mode, the project root is `HUB`. Found only in the parent folder: the engineer opened one repo directly. Say so once, recommend reopening at the hub, and if they continue, treat the parent as `HUB` and this repo as the only target.
2. **Read the map.** Load `HUB/workflow.repos.json`. Each entry in `repos` has `name`, `path` (relative to `HUB`), `role`, `base` (its default branch), and `deploy`; `order` lists repo names with providers first. Read `HUB/AGENTS.md` (the platform map) and, for each target repo, `<path>/AGENTS.md` (its stack, commands, and `## Git`), plus nested ones as usual.
3. **Workspace = repo.** Apply every monorepo rule of this skill with workspaces = the listed repos, keyed by `name`: `docs/scope/<name>/`, `docs/specs/<name>/`, work that spans repos in `_root`, and the `docs/scope/index.md` rollup. Every `docs/` path is under `HUB`, never inside a repo. Code paths are `<path>/…`.
4. **Resolve the target repos** from the feature's scope folder, its code pointer, a repo name or path in the request, else ask (one panel, the likeliest recommended). A `_root` feature targets every repo its tasks name.
5. **Git runs in the repo.** Every `git` command this skill would run becomes `git -C <path> …` for the target repo, using that repo's `base` wherever the skill says `main`, `master`, or `BASE`. Every `gh` command runs with the repo as its working directory. Plain `git` in `HUB` is only for the hub's own workflow files. Never read a code change set from `HUB`: it holds no code, so an empty hub diff proves nothing.
6. **Change sets are per repo.** Wherever this skill gathers changed files, gather them in every target repo (every listed repo when none is named), prefix each path with its repo `path`, and report per repo. A listed repo that is missing or not a git checkout: say so and skip it.
7. **Deploy safety.** Merging to a repo's `base` deploys it (its `deploy` field). Never build on or commit to a repo's `base` branch; with git integration on, branch first. Name the `deploy` target before any push or PR. A change that spans repos ships in `order`, and every change to a provider stays backward compatible with the consumers already deployed, including mobile app builds already installed on phones.
8. **Commits stay in their repo.** Code, a repo's own `AGENTS.md`, its `CHANGELOG.md`, and its test files commit to that repo; `docs/` and the hub `AGENTS.md` commit to the hub. Offer each commit separately and never mix repos in one commit.
9. **Git settings.** Read `## Git` from the target repo's `AGENTS.md`, else from the hub's.
<!-- HUB-CONTRACT:END -->

## How /architect changes in hub mode

### Pre-flight

- **Freshness:** run the behind check (`git -C <path> fetch --quiet`, then `git -C <path> rev-list --count HEAD..origin/<base>`) for each target repo, and plain `git` for the hub itself (teammates add specs there). Warn per repo.
- **Spec location (`SPEC_DIR`):** a decision for one repo → `HUB/docs/specs/<name>/`; a decision more than one repo must honor (an API or realtime contract, auth tokens, shared enums, pricing rules, a cross repo feature) → `HUB/docs/specs/_root/`. Numbering is per folder. Never write a spec inside a repo.
- **Context:** the hub `AGENTS.md` plus each target repo's `<path>/AGENTS.md` (its stack is the one to build on; repos differ, e.g. an Express API and an Expo app). Count source files under each target `<path>`.
- **Scope row:** look in `docs/scope/<name>/` and `docs/scope/_root/`.
- **Related specs:** scan `_root` too; a repo decision must not contradict a `_root` contract (raise a Premise note if it would).

### Framing

Workspace = repo. Infer the platform per repo from its `AGENTS.md` (API, web, or mobile); a `_root` decision is usually "API plus its clients". For a mobile client always ask how old installed builds are handled if the topic changes anything they call.

### Writing a `_root` (cross repo) spec

- `## Build plan`: prefix every task with its repo in brackets (`1. [backend] Add the payout endpoint, satisfies AC-2`) and order tasks by `order`: providers first, then consumers. Each repo's tasks must leave that repo shippable on its own.
- `## Feature design` API surface: mark each endpoint, event, or field as **new**, **changed (backward compatible)**, or **breaking**. A breaking change needs an explicit transition (version the endpoint, accept both shapes for a window, or gate by minimum app version) recorded as a decision, never left to `/develop`.
- `## Consequences` must state: the rollout order across repos with each repo's `deploy` target, what a consumer still on the previous version sees, and when the old path can be removed.
- Value sourcing: a value one repo displays but another produces names the producing repo and field.
- Commands the build plan depends on (CLI flags, config evaluation, host commands): run each in a read only form (`--help`, `list`) before accepting the plan, and correct flags or preconditions that do not hold. One you could not run goes under the spec's Risks.

### After the spec (scope linking)

Link the spec from the `_root` feature (or the repo feature). For a `_root` feature, build the milestone rollup grouped by repo (`[backend] Payout API and job`, `[admin] Approval screen`, `[driver] Payout history`), still 2 to 5 milestones. Commit offers: the spec and scope edits go to the hub repo.
