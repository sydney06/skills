# /audit: hub mode

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

## How /audit changes in hub mode

/audit owns the hub itself: it creates `workflow.repos.json`, the hub `AGENTS.md`, and each repo's own root `AGENTS.md`.

### A. No hub yet: offer to set one up

Signal (checked in pre-flight, before picking a phase): no `workflow.repos.json`, no manifest at the project root, and two or more child folders that are git repos (`git -C <dir> rev-parse --is-inside-work-tree` succeeds). Ask (one recommended, the picker adds Other):

- **question**: "This folder holds <N> separate git repos (<names>). Set it up as a workflow hub, so every skill can plan and build across them while each repo keeps its own git and deploys?"
- **header**: "Hub"
- **options**: `Set up the hub (recommended)`: "One plan and one set of specs for all repos; git stays per repo." · `Treat it as a plain folder`: "Skip the hub; run /audit inside each repo instead."

On `Set up the hub`:

1. **Map each repo.** Per child repo: `name` (short, from the folder or manifest name, e.g. `backend`), `path`, `role` (one line from its manifest and README), `base` (`git -C <path> symbolic-ref --short refs/remotes/origin/HEAD` minus the `origin/` prefix, else its current branch), `deploy` (hints: `render.yaml`, `vercel.json`, `.vercel/`, `eas.json`, `app.json`, `Procfile`, `fly.toml`, `Dockerfile`, CI workflows; else `unknown`). Propose `order` providers first (an API or backend before the web and mobile clients).
2. **Confirm the map** in one panel showing the table: `Looks right (recommended)` · `Change a name, role, base, or deploy` · `Change the order`. Loop until confirmed; the engineer knows the deploy setup better than the hints.
3. **Write** `workflow.repos.json` (shape below), a `.gitignore` listing every repo `path/` plus `node_modules/`, `.env*`, and `docs/.agent-cache/`, the hub `AGENTS.md` (template below), and its `CLAUDE.md` pointer.
4. **Make the hub a repo.** Not yet a git repo: `git init` in `HUB` and offer an initial commit of exactly those files. Never stage a repo folder (they are ignored).
5. **Next**, recommend `/audit <name>` for each repo with no `AGENTS.md`, in `order`, as separate runs (each scan is large; `/clear` between them).

```json
{
  "repos": [
    { "name": "backend", "path": "<folder>", "role": "<one line>", "base": "main", "deploy": "<where and how it deploys>" }
  ],
  "order": ["backend"]
}
```

### B. Hub exists: route by argument

- `/audit` with no argument → **hub gap fill**: check `workflow.repos.json` against the folders (a listed repo missing, or a git repo on disk that is not listed: propose the edit, apply on confirmation), then gap fill the hub `AGENTS.md` per Phase 4 rules. Then list the repos whose own `AGENTS.md` is missing and recommend `/audit <name>`.
- `/audit <name>` (or a path inside one repo) → treat `<path>` as an independent project root and run the normal routing on it: Phase 2 (whole repo) when `<path>/AGENTS.md` is missing, Phase 4 (gap fill) when present, Phase 3 for a deeper path. Every signal comes from that repo (`git -C <path> log --oneline` for history, its manifest, its source count). Write `<path>/AGENTS.md`, `<path>/CLAUDE.md`, and nested docs inside the repo. Seed its `## Build approach` from `HUB/docs/scope/<name>/` (else `_root`). Never write a workspace stub for a repo: each repo is a full project.
- Greenfield repo inside the hub (a new app folder just scaffolded, listed in the map): Phase 1 on that repo, reading its stack from `HUB/docs/specs/<name>/` (or `_root`).

The repo's `AGENTS.md` commits to that repo, on a branch when its `## Git` integration is on (a commit to `base` deploys; say so).

### Hub `AGENTS.md` template (the platform map, under about 60 lines)

```markdown
# <Platform name>

<One or two sentences: what the platform is and who uses it.>

## Repos

| Repo | Path | Role | Base | Deploys |
|---|---|---|---|---|
| backend | <path> | <role> | main | <deploy> |

Build and ship order for work that spans repos: <order>. Providers stay backward compatible with deployed consumers, including installed mobile builds.

## Shared contracts

Decisions every repo follows live in `docs/specs/_root/` (API shape, realtime events, auth tokens, shared enums).

## Platform rules

<Conventions that hold across repos, discovered from the code: API versioning, error shape, auth token handling, naming of shared concepts. 3 to 8 bullets.>

## Workflow

Plans in `docs/scope/` (one folder per repo plus `_root`), specs in `docs/specs/`. Open the agent at this folder for all work. Each repo keeps its own `AGENTS.md`, git history, and deploys.

## Context files

- [<path>/AGENTS.md](<path>/AGENTS.md): <role>

_Drafted by /audit from the repos, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
```
