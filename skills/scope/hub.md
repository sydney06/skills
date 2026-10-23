# /scope: hub mode

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

## How /scope changes in hub mode

### Step 0 and Step 1 (infer the behavior, pick the route)

- A scope exists when `HUB/docs/scope/` holds any scope file. Bare `/scope` in a hub is **replan across all repos** (the platform readout), not a workspace picker. `/scope <name> <idea>` plans or adds inside that repo; `/scope <idea>` that names no repo: infer the repos from the idea and say which you chose.
- Plan behavior always reads `modes/plan-monorepo.md` with workspaces = repos. Each repo is then greenfield or brownfield on its own evidence (source files and history under `<path>`, `git -C <path> log --oneline`), so a hub can mix shipped repos and a brand new one.
- A repo with no `<path>/AGENTS.md`: note in the report that `/audit <name>` should run first.

### Planning across repos

- Per repo features go in `docs/scope/<name>/scope.md`; their code pointers read `code in <path>/…`.
- A feature that needs changes in more than one repo is ONE feature in `docs/scope/_root/scope.md`, never split silently into unrelated rows. Its intent line ends with `Touches: <name>, <name>` (in `order`). Its milestones (filled later by `/architect`) are grouped by repo. When the per repo parts are big enough to stand alone, plan them as coordinated per repo features that each name the shared `_root` spec, and say so.
- Foundations are per repo, except genuinely shared ones (the API contract, auth token shape, shared enums, a design language used by several clients), which live in `_root` as foundations before any repo builds on them.
- Brownfield enrollment scans each repo separately (one `scout` per large repo, read only, cheapest model), enrolling `existing` and `in-progress` rows into that repo's scope file.
- `docs/scope/index.md` maps the platform: one line per repo (name, role, done / total) plus `_root`, each linking its scope file.

### The replan readout (bare `/scope`)

Open with one line per repo, then one for the hub: current branch, `git -C <path> rev-list --left-right --count origin/<base>...HEAD` as behind / ahead (skip silently when there is no remote), uncommitted files (`git -C <path> status --short` count), then feature counts by status and each in progress feature's resume point. Flag a repo sitting on its `base` branch with uncommitted changes (one commit away from a deploy).
