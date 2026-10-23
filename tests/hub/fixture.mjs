// Builds throwaway fixtures for the hub mode scenarios. Everything lives under
// one root (default: a fresh temp dir). Each fixture repo gets a local bare repo
// as `origin`, so freshness checks work offline and nothing can reach a real remote.
import { mkdirSync, writeFileSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FORK = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const write = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text.replace(/^\n/, ''));
};

const commitAll = (cwd, msg) => {
  git(cwd, 'add', '-A');
  git(cwd, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.com', 'commit', '-q', '-m', msg);
};

const GATE_PREFS = '{ "tool": null, "gate": "typecheck+verify", "packageManager": "npm" }\n';

const repoAgents = (name, extra) => `
# ${name}

## Stack

- **Language / Runtime**: JavaScript (ES modules), Node 20, no dependencies
- **Package manager**: npm

## Commands

\`\`\`bash
npm run check   # syntax check, the typecheck gate
npm run dev
\`\`\`

## Rules

${extra}

## Git

- integration: on
- branch prefix: feat/
- commit: per-milestone
`;

const API_FILES = {
  'package.json': `{ "name": "fixture-api", "type": "module", "scripts": { "dev": "node src/server.js", "check": "node --check src/server.js && node --check src/trips.js" } }\n`,
  'src/trips.js': `
const TRIPS = [
  { id: 1, status: 'requested' },
  { id: 2, status: 'accepted' },
  { id: 3, status: 'completed' },
];

export function listTrips() {
  return TRIPS.map((trip) => ({ ...trip }));
}
`,
  'src/server.js': `
import { createServer } from 'node:http';
import { listTrips } from './trips.js';

const server = createServer((req, res) => {
  if (req.url === '/health') return res.end('ok');
  if (req.url === '/trips') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify(listTrips()));
  }
  res.statusCode = 404;
  res.end('not found');
});

server.listen(process.env.PORT ?? 4000);
`,
  'AGENTS.md': repoAgents('fixture-api', '- Responses are JSON; never remove or rename a field clients already read.'),
};

const WEB_FILES = {
  'package.json': `{ "name": "fixture-web", "type": "module", "scripts": { "dev": "node src/render.js", "check": "node --check src/render.js" } }\n`,
  'src/render.js': `
// Renders the trip list the API returns. API_URL points at fixture-api.
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export function renderTrips(trips) {
  return trips.map((trip) => \`<li>#\${trip.id} \${trip.status}</li>\`).join('');
}
`,
  'AGENTS.md': repoAgents('fixture-web', '- Rendering is pure functions in src/; no framework.'),
};

function makeRepo(root, name, files) {
  const remote = join(root, 'remotes', `${name}.git`);
  mkdirSync(remote, { recursive: true });
  git(remote, 'init', '-q', '--bare', '-b', 'main');
  const dir = join(root, 'hub', name);
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  for (const [path, text] of Object.entries(files)) write(join(dir, path), text);
  commitAll(dir, 'initial');
  git(dir, 'remote', 'add', 'origin', remote);
  git(dir, 'push', '-q', '-u', 'origin', 'main');
  return dir;
}

const HUB_FILES = {
  'workflow.repos.json': `
{
  "repos": [
    { "name": "api", "path": "api", "role": "JSON API for trips", "base": "main", "deploy": "fixture, no real deploy" },
    { "name": "web", "path": "web", "role": "Web client that renders trips", "base": "main", "deploy": "fixture, no real deploy" }
  ],
  "order": ["api", "web"]
}
`,
  '.gitignore': 'api/\nweb/\nnode_modules/\n.env*\ndocs/.agent-cache/\n',
  'CLAUDE.md': '# CLAUDE.md\n\nThis project\'s context for all AI tools lives in [AGENTS.md](./AGENTS.md).\nClaude Code loads it via the import below:\n\n@AGENTS.md\n',
  'AGENTS.md': `
# Fixture platform

A tiny trips platform used to test hub mode.

## Repos

| Repo | Path | Role | Base | Deploys |
|---|---|---|---|---|
| api | api | JSON API for trips | main | fixture, no real deploy |
| web | web | Web client that renders trips | main | fixture, no real deploy |

Build and ship order for work that spans repos: api, web.

## Workflow

Plans in \`docs/scope/\`, specs in \`docs/specs/\`. Each repo keeps its own AGENTS.md and git history.

## Context files

- [api/AGENTS.md](api/AGENTS.md): JSON API for trips
- [web/AGENTS.md](web/AGENTS.md): web client
`,
  'docs/scope/index.md': `
# Scope: Fixture platform

| Workspace | Scope | Done |
|---|---|---|
| _root | [_root/scope.md](_root/scope.md) | 0 / 1 |
| api | [api/scope.md](api/scope.md) | 1 / 1 |
| web | [web/scope.md](web/scope.md) | 1 / 1 |
`,
  'docs/scope/api/scope.md': `
# Scope: api

**Build approach:** Tracer Bullet (vertical slices, end to end through every layer).
**Workflow:** Alpha (after develop: check verify).

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| A | Trips endpoint | Existing | existing |

### A. Trips endpoint · existing
GET /trips returns the trip list. code in \`api/src/\`
`,
  'docs/scope/web/scope.md': `
# Scope: web

**Build approach:** Tracer Bullet (vertical slices, end to end through every layer).
**Workflow:** Alpha (after develop: check verify).

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| A | Trip list | Existing | existing |

### A. Trip list · existing
Renders trips from the API. code in \`web/src/\`
`,
  'docs/scope/_root/scope.md': `
# Scope: platform (work that spans repos)

**Build approach:** Tracer Bullet (vertical slices, end to end through every layer).
**Workflow:** Alpha (after develop: check verify).

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Trip status label | Slice 1 | in-progress |

## Slice 1

### 1. Trip status label · in-progress
Show riders a friendly status label instead of the raw status code. Touches: api, web
**Done when:** the API returns a label for every trip and the web list shows it, with old clients unaffected.
- [x] Design it (spec): \`/architect trip status label\`
- [ ] Build it: \`/develop trip status label\`
   - [ ] [api] Status label in the trips response (AC-1, AC-2)
   - [ ] [web] Render the label with a fallback (AC-3)
- [ ] Verify it: \`/check verify trip status label\`
Spec [0001](../../specs/_root/0001-trip-status-label.md)
`,
  'docs/specs/_root/0001-trip-status-label.md': `
# 0001. Trip status label

**Date**: 2026-10-23
**Status**: Proposed

## Summary

The API adds a friendly status label to every trip, and the web list shows it. The raw status stays, so older clients keep working.

## Requirements

**Acceptance criteria**:
- **AC-1**: \`GET /trips\` returns \`statusLabel\` on every trip: requested → "Waiting for driver", accepted → "Driver on the way", completed → "Completed".
- **AC-2**: The existing \`status\` field is unchanged (backward compatible).
- **AC-3**: The web list shows \`statusLabel\` when present and falls back to \`status\` when absent.

## Decision

**Chosen option**: the API owns the label mapping.

## Feature design

**API surface**:
| Endpoint | Method | Key outputs | Change |
|---|---|---|---|
| /trips | GET | id, status, statusLabel | changed (backward compatible) |

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| GET /trips | statusLabel | mapping table in \`api/src/trips.js\` keyed by status |
| render list | label text | \`statusLabel\` from the API, else \`status\` |

## Build plan

1. [api] Add the status label mapping to \`listTrips\`, satisfies **AC-1**, **AC-2**
2. [web] Render \`statusLabel\` with a fallback to \`status\`, satisfies **AC-3**

## Consequences

**Neutral**:
- Rollout: api first, then web. Clients that ignore \`statusLabel\` are unaffected.
`,
};

/** state: 'bare' (two repos, no hub) | 'hub' (hub set up with a ready spec) | 'single' (one plain repo) */
export function buildFixture(root, state) {
  mkdirSync(root, { recursive: true });
  const api = makeRepo(root, 'api', API_FILES);
  const web = state === 'single' ? null : makeRepo(root, 'web', WEB_FILES);
  const hub = join(root, 'hub');
  if (state === 'hub') {
    for (const [path, text] of Object.entries(HUB_FILES)) write(join(hub, path), text);
    git(hub, 'init', '-q', '-b', 'main');
    commitAll(hub, 'hub setup');
  }
  const project = state === 'single' ? api : hub;
  installSkills(project);
  return { root, hub, api, web, project };
}

export function installSkills(project) {
  cpSync(join(FORK, 'skills'), join(project, '.claude', 'skills'), { recursive: true });
  const agents = join(FORK, '.claude', 'agents');
  if (existsSync(agents)) cpSync(agents, join(project, '.claude', 'agents'), { recursive: true });
}

export function addGatePrefs(...repos) {
  for (const repo of repos) write(join(repo, 'test-preferences.json'), GATE_PREFS);
}

export function makeUncommittedChanges(api, web) {
  write(join(api, 'src', 'trips.js'), API_FILES['src/trips.js'] + '\nexport function countTrips() {\n  return TRIPS.length;\n}\n');
  if (web) write(join(web, 'src', 'render.js'), WEB_FILES['src/render.js'] + '\nexport function renderCount(n) {\n  return `<p>${n} trips</p>`;\n}\n');
}

export function makeFeatureBranches(api, web) {
  for (const [dir, file, extra] of [
    [api, 'src/trips.js', '\nexport function countTrips() {\n  return TRIPS.length;\n}\n'],
    [web, 'src/render.js', '\nexport function renderCount(n) {\n  return `<p>${n} trips</p>`;\n}\n'],
  ]) {
    git(dir, 'checkout', '-q', '-b', 'feat/trip-count');
    write(join(dir, file), (dir === api ? API_FILES : WEB_FILES)[file] + extra);
    commitAll(dir, 'feat: add trip count');
  }
}
