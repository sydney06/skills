# /document: hub mode

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

## How /document changes in hub mode

### 1. Type and target repos

Infer the type per repo (a feature branch ahead of its `base` → `pr`). A `_root` feature touching several repos → one document per touched repo for `pr` and `changelog`; ask once which repos when it is unclear.

### 2. Source material, per repo

Run the Step 2 commands in each target repo with `git -C <path>` (`rev-parse`, `log --oneline "<base>..HEAD"`, `diff --name-only "<base>...HEAD"`, `tag --sort=-creatordate`, `remote`). Run every `gh` command (`gh pr view`, `gh pr create`, `gh pr edit`) with `<path>` as the working directory so it targets that repo's remote. Specs for the "why" come from `HUB/docs/specs/`.

### Output per type

- **`pr`**: one PR per touched repo. Each body links the governing spec by its path in the hub (the hub may not be on the same remote, so write the path, not a guessed URL), lists the sibling PRs in the other repos, and in `## Risk & rollout` names this repo's `deploy` target and the merge order from `order` (providers first). Show every body, then confirm before each `gh` action and before any push; never merge.
- **`changelog`**: `<path>/CHANGELOG.md` in the repo the change shipped in.
- **`release-note`**: tags and ranges are per repo; write `HUB/docs/releases/<name>/<version>.md`. A platform release spanning repos: `HUB/docs/releases/<YYYY-MM-DD>-<slug>.md` listing each repo's version.
- **`postmortem`**: `HUB/docs/postmortems/<date>-<slug>.md`; name the affected repos and deploy targets in the table.

Tick `Document it` in `HUB/docs/scope/`.
