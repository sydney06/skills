# /check: hub mode

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

## How /check changes in hub mode

Route to `verify` or `review` exactly as `SKILL.md` says; then apply the section for that mode.

### verify

- **Step 0a (refactor mode):** the before and after capture runs in the target repo: `git -C <path> worktree add <tmp> <ref>` with `<ref>` from that repo, removed with `git -C <path> worktree remove <tmp>`.
- **Step 0b:** the governing spec and its `verify.md` are under `HUB/docs/specs/<name>/` or `_root/`.
- **Step 1:** changed files per target repo: `git -C <path> diff --name-status origin/<base>...HEAD` (or `<base>...HEAD` without a remote) plus `git -C <path> diff --name-status` for uncommitted work.
- **Step 2:** start every app the behaviors need, each from its own `<path>` with its own command (an API plus the client that calls it). Point the client at the locally running API when its config allows it, and say which environment each one used. Never exercise a deployed production environment.
- **Mobile apps:** drive them only through tooling that is actually available (a web target, an emulator or device automation tool, an MCP). Otherwise write the exact manual steps for the engineer and mark those behaviors `blocked` until they report back, never `met`.
- **Step 5:** tick `Verify it` in `HUB/docs/scope/`; for a `_root` feature only when every touched repo's behaviors passed.

### review

- **Step 2, per repo:** run the scoping in each target repo (every listed repo with changes when none is named): `BASE` = its `base`, `CUR` from `git -C <path> rev-parse --abbrev-ref HEAD`, changed names via `git -C <path> diff --name-only …` and `git -C <path> ls-files --others --exclude-standard`. Repos with an empty change set are skipped and named.
- **Step 3:** test signal per repo from `<path>/test-preferences.json`; context = hub `AGENTS.md` plus `<path>/AGENTS.md`; spec paths from `HUB/docs/specs/`.
- **Step 4:** one reviewer subagent per repo with changes, run one after another, all on the contrasting model chosen once in Step 1. Each gets its repo's diff command written with `git -C <path>` and the output path `HUB/docs/reviews/<YYYY-MM-DD>-<name>-<branch>.md`. For a `_root` feature, also give each reviewer the shared spec so it checks the contract from its side (provider compatibility, consumer handling of old and new shapes).
- **Step 5:** relay one verdict block per repo, then a one line overall verdict (the worst of them). Tick `Review it` once every touched repo was reviewed.
