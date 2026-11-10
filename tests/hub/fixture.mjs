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

// /price fixture: five api commits with known AUTHOR dates and later COMMITTER dates
// (the push dates), plus a docs/billing folder in the hub.
// Sessions by author date (gap over 3 hours splits): 2026-10-01 09:00, 09:30, 10:00
// is one session (60 min + 30 = 1.5 h); 15:00, 15:30 is another (30 + 30 = 1.0 h).
// Measured hours 2.5. At feature rate 60: effort fee 150.00. Speed factor 2.0 (not
// equal to the hours, on purpose) gives solo hours 5.0, at contract rate 25: solo fee 125.00.
const PRICE_COMMITS = [
  ['2026-10-01T09:00:00', 'feat: trip count query (ledger 6)'],
  ['2026-10-01T09:30:00', 'feat: trip count route (ledger 6)'],
  ['2026-10-01T10:00:00', 'test: trip count (ledger 6)'],
  ['2026-10-01T15:00:00', 'fix: trip count excludes cancelled (ledger 6)'],
  ['2026-10-01T15:30:00', 'docs: trip count notes (ledger 6)'],
];

// Row 11 (Navigation, In progress) evidence: two commits on 2026-10-05, a different day
// and different files from row 6's five, so row 6 stays 2.5 measured hours.
const NAV_COMMITS = [
  ['2026-10-05T09:00:00', 'feat: navigation route model'],
  ['2026-10-05T09:20:00', 'feat: navigation turn list'],
];

// Legacy fixture (spec section 14). Weights as in size-weights.md below: route 1.0,
// migration 1.5, email 0.5, 0.5 per 100 lines of source and template files (each HTML email is one line;
// a migration's SQL counts as the migration, not as lines, so a reading that counts it moves no fee past
// rounding). Every file's line count is fixed, so each score is exact:
//   anchor 1 (120): 1 route + 1 email + 100 lines = 1.0 + 0.5 + 0.5 = 2.0; 120 / 25 = 4.8 h; 4.8 / 2.0 = 2.4 h/pt
//   anchor 2 (200): 2 routes + 1 migration + 1 email + 200 lines = 2.0 + 1.5 + 0.5 + 1.0 = 5.0; 200 / 25 = 8 h; 1.6 h/pt
//   ledger 7: 3 routes + 1 migration + 2 emails + 300 lines = 3.0 + 1.5 + 1.0 + 1.5 = 7.0
// Median (2.4 + 1.6) / 2 = 2.0 h/pt. Solo hours 7.0 x 2.0 = 14.0; fee 14.0 x 25 = 350.00.
// Low 7.0 x 1.6 x 25 = 280.00; high 7.0 x 2.4 x 25 = 420.00 (both already multiples of 5, so nearest 5 keeps them). Spread (420 - 280) / 350 = 0.4, but only
// two anchors (items 3 and 4 have no commits), so confidence Low. Closest anchor by score: item 2.
// Excluded, and they would move the fee if counted: package-lock.json (400 lines, +2.0 points) and the
// generated Prisma client (500 lines, +2.5). Ledger 7's five commits sit in 10:00 to 12:00 on 12 Oct 2026:
// measured, that is 2.5 h (effort fee 150.00 at 60), so either figure in the audit means commit hours leaked.
const lines = (n, head = []) =>
  [...head, ...Array.from({ length: n - head.length }, (_, i) => `// note ${i + 1}`)].join('\n') + '\n';
const route = (path) => `router.post('${path}', (req, res) => res.end());`;
const LEGACY_COMMITS = [
  ['2026-07-10T09:00:00', 'feat: find another driver option (appendix A 1)', {
    'src/reassign/routes.js': lines(99, [route('/rides/:id/reassign')]),
    'emails/driver-reassigned.html': lines(1, ['<p>Your ride has a new driver.</p>']) }],
  ['2026-08-14T09:00:00', 'feat: wait fee schema (appendix A 2)', {
    'prisma/migrations/20260814_wait_fee/migration.sql': lines(1, ['CREATE TABLE "WaitFee" (id SERIAL PRIMARY KEY, ride_id INT, cents INT);']) }],
  ['2026-08-14T10:00:00', 'feat: wait fee routes and timer (appendix A 2)', {
    'src/waitfee/routes.js': lines(40, [route('/rides/:id/wait/start'), route('/rides/:id/wait/stop')]),
    'src/waitfee/timer.js': lines(159) }],
  ['2026-08-14T11:00:00', 'feat: wait fee receipt email (appendix A 2)', {
    'emails/wait-fee-receipt.html': lines(1, ['<p>A wait fee was added to your ride.</p>']) }],
  ['2026-10-12T10:00:00', 'feat: ticket escalation schema (ledger 7)', {
    'prisma/migrations/20261012_ticket_escalation/migration.sql': lines(1, ['CREATE TABLE "TicketEscalation" (id SERIAL PRIMARY KEY, ticket_id INT, tier TEXT, reason TEXT);']),
    'src/generated/prisma/index.js': lines(500, ['// Code generated by Prisma. DO NOT EDIT.']) }],
  ['2026-10-12T10:30:00', 'feat: ticket escalation routes (ledger 7)', {
    'src/tickets/routes.js': lines(30, [route('/tickets/:id/escalate'), route('/tickets/:id/resolve'), route('/tickets/export')]) }],
  ['2026-10-12T11:00:00', 'feat: escalation emails (ledger 7)', {
    'emails/ticket-escalated.html': lines(1, ['<p>A ticket was escalated to your tier.</p>']),
    'emails/ticket-resolved.html': lines(1, ['<p>Your ticket was resolved.</p>']) }],
  ['2026-10-12T11:30:00', 'feat: escalation service (ledger 7)', {
    'src/tickets/escalation.js': lines(268) }],
  ['2026-10-12T12:00:00', 'chore: lockfile (ledger 7)', {
    'package-lock.json': lines(400, ['{ "lockfileVersion": 3 }']) }],
];

export function makePriceFixture(hub, api) {
  const push = '2027-01-20T12:00:00';
  const commit = ([author, msg], file, text) => {
    write(join(api, file), text);
    git(api, 'add', '-A');
    execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=owner@example.com', 'commit', '-q', '-m', msg],
      { cwd: api, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_DATE: author + '+00:00', GIT_COMMITTER_DATE: push + '+00:00' } });
  };
  PRICE_COMMITS.forEach((c, i) => commit(c, join('src', `count${i}.js`), `export const step${i} = ${i};\n`));
  NAV_COMMITS.forEach((c, i) => commit(c, join('src', 'navigation.ts'), `export const navStep = ${i};\n`));
  for (const [author, msg, files] of LEGACY_COMMITS) {
    const [first, ...rest] = Object.entries(files);
    for (const [file, text] of rest) write(join(api, file), text);
    commit([author, msg], ...first);
  }
  write(join(hub, 'docs/billing/README.md'), `
# Billing

Fixture billing records. Amounts in USD. Nothing is Approved unless the owner writes "approved" with an amount.
`);
  write(join(hub, 'docs/billing/rates.md'), `
# Rates

| From | Contract rate | Feature rate | Speed factor | Status | Note |
|---|---|---|---|---|---|
| 15 Sep 2026 | 25.00 | 60.00 | 2.0 | **Active** | Fixture rate. |
`);
  write(join(hub, 'docs/billing/ledger.md'), `
# Feature ledger

Status key: Proposed (suggested, waiting) · Approved (the owner wrote "approved" with an amount) · Waived

## 1. Appendix A baseline

| # | Feature | Valuation | State |
|---|---|---|---|
| 1 | Find another driver option | 120.00 | Paid |
| 2 | Wait fee and multi stop timer | 200.00 | Paid |
| 3 | Taxi driver flow | 500.00 | Paid |
| 4 | Forward dispatch and ride queuing | 650.00 | Paid |
| 5 | Driver shift scheduling | 700.00 | Waived, not built |

## 2. Completed features, not yet paid

| # | Feature | Repos | Basis | Proposed price | Approved | Deployed | Warranty ends | SOW signed | Increment starts |
|---|---|---|---|---|---|---|---|---|---|
| 6 | Trip count | api | measured | **100.00** | Pending | to confirm | | | |
| 7 | Support ticket escalation | api | legacy (size based) | **300.00** | Pending | to confirm | | | |

## 3. In progress

| # | Feature | Repos | Basis | Proposed price | Approved | Deployed | Warranty ends | SOW signed | Increment starts |
|---|---|---|---|---|---|---|---|---|---|
| 11 | Navigation | api | measured | In progress | Pending | | | | |
`);
  write(join(hub, 'docs/billing/size-weights.md'), `
# Size weights

Used by /price audit for a feature with Basis legacy.

## Weights (Active from 10 Nov 2026)

| Signal | Weight (points per unit) | Unit |
|---|---|---|
| Route added or changed | 1.0 | each endpoint |
| Migration | 1.5 | each table created or column group added |
| Email template or notification type | 0.5 | each |
| Screen, modal or page | 1.0 | each |
| Component (not a screen) | 0.25 | each |
| Background job or cron | 1.5 | each |
| Socket event | 0.5 | each |
| Test file added | 0.25 | each |
| Hand written source lines | 0.5 | per 100 lines, counted proportionally (lines / 100 x 0.5), added or changed lines in source and template files, after excluding generated and vendored files. A migration's SQL counts as the migration, not as lines |

## Excluded from the count

Lockfiles, the generated Prisma client, snapshots, build output, vendored code, formatting only changes and renamed files with no change in content.
`);
  write(join(hub, 'docs/billing/retainer-schedule.md'), `
# Retainer schedule

The increment is 15% of the approved fee and starts on the 1st of the month after the 14 day warranty ends. Term ends 31 Mar 2027.

| Month | Baseline | Approved increments | Fee | Preview if approved |
|---|---|---|---|---|
| Dec 2026 | 1,300.00 | 0.00 | 1,300.00 | |
| Jan 2027 | 1,300.00 | 0.00 | 1,300.00 | |
| Feb 2027 | 1,300.00 | 0.00 | 1,300.00 | |
| Mar 2027 | 1,300.00 | 0.00 | 1,300.00 | |
`);
  commitAll(hub, 'billing fixture');
}
