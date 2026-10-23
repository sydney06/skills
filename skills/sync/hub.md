# /sync: hub mode

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

## How /sync changes in hub mode

### 1. Scope the change set, per repo

For each listed repo: freshness (`git -C <path> fetch --quiet`, behind count against `origin/<base>`), then its mode and changes exactly as Step 1 describes, every command with `git -C <path>` and that repo's `base`: on `base` → `git -C <path> diff --name-status HEAD`; on a branch → `git -C <path> merge-base <base> HEAD`, then `git -C <path> diff --name-status <merge-base>`; plus `git -C <path> ls-files --others --exclude-standard` as `A`. Prefix paths with `<path>/`. Apply the source, deleted, and manifest filters per repo. Changes in `HUB` itself are docs, never a change source. Stop only when no repo has source or manifest changes.

### 2. Locate context, specs, scope

- Context files: each changed repo's `<path>/AGENTS.md` is that repo's **root** (all root rules apply to it); nested ones inside it as usual. The hub `AGENTS.md` is the platform map: edit it only for a platform fact the diff proves (a repo's role, commands, or deploy changed, or a new shared rule), never for one repo's detail.
- Specs: everything under `HUB/docs/specs/`.
- Scope: `HUB/docs/scope/<name>/` for each changed repo, plus `HUB/docs/scope/_root/` when a `_root` feature's tasks name a changed repo.

### 3. Maintenance

Apply `agent-prompt.md` per repo with its own `CHANGED_FILES`, `DIFF_COMMAND` (written with `git -C <path>`), and context map. "Net new area" and "create or restructure root" are judged within the repo: a repo with no `AGENTS.md` → flag `/audit <name>`. A `_root` feature is `done` only when every repo's part is evidenced. A repo added on disk but missing from `workflow.repos.json` (or listed but gone) → flag `/audit` (hub gap fill); never edit the map yourself.

### 4. Report and commits

One block per repo, then the hub. Commit offers (when git integration is on): each repo's `AGENTS.md` changes in that repo (on its current branch; warn when it is `base`, since that deploys), and the scope and spec reconciliation in the hub (`chore(sync): reconcile docs`). Never push.
