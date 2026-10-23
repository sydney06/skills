# /develop: hub mode

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

## How /develop changes in hub mode

### Before you build

- **Project exists:** check the target repo's `<path>` for a manifest, not `HUB` (the hub has none by design).
- **Scaffolding a new repo** (the feature creates a new app in the hub): create it at a new `<path>` with the framework's initializer, keep or `git init` its own repo, never inside another repo. Then propose its `workflow.repos.json` entry (name, path, role, base, deploy, place in `order`) and add it on confirmation, plus its line in the hub `AGENTS.md` repo table.
- **Freshness and collaboration**, per target repo: `git -C <path> fetch --quiet`; behind count `git -C <path> rev-list --count HEAD..origin/<base>`; uncommitted work `git -C <path> status --short`; another author on the code area `git -C <path> log --format='%an' -- <area relative to path>`. Same warnings, naming the repo.
- **Git integration** (the repo's `## Git`, else the hub's): read `flow/git.md` and apply it inside each target repo with `git -C <path>`. Never build on `base`. For a `_root` feature use the **same branch name in every repo it touches** (`<prefix><feature-slug>`), created in each repo when its first task starts; reuse it when it exists.

### Step 0, the spec gate

The scope file is `HUB/docs/scope/<name>/` or `HUB/docs/scope/_root/`; the spec is under `HUB/docs/specs/`. The nearest `AGENTS.md` is the target repo's (plus nested). An `Assumed` spec goes in `HUB/docs/specs/<name>/`, or `_root` when the owed decision spans repos.

### The build

- Work inside `<path>`: its stack, its `design.md` (UI lives per repo), its commands run from `<path>`. A `scout` map, when used, is briefed with the one repo.
- A `_root` spec's `## Build plan` tasks are tagged `[name]`. Build them in `order`, one repo at a time: finish and typecheck the provider repo's tasks before starting a consumer, so the consumer binds to a real interface. Keep every provider change backward compatible as the spec states; a needed breaking change that the spec does not cover is a spec gap (route to `/architect`).
- Mobile clients: never assume a provider change reaches installed builds at the same time. If the spec relies on a minimum app version or a feature flag, build that gate.

### Step 4, update and report

- Tick spec tasks and scope milestones in `HUB/docs/`; the code pointer reads `code in <path>/…` (one per repo for a `_root` feature).
- Commits (when on): code commits per repo with `git -C <path>`, one subject per milestone, never mixing repos; then offer one hub commit for the scope and spec updates (`chore(scope): <feature> progress`).
- Report one line per repo: branch, commits, and its `deploy` target ("merging `feat/x` to `main` in backend deploys to Render"). For a `_root` feature, state the merge order.
- `verify.md` lives beside the spec in `HUB/docs/specs/`.
