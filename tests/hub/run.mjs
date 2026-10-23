#!/usr/bin/env node
// Hub mode scenarios: real headless agent sessions against throwaway fixtures.
//
//   npm run test:hub                    run every scenario
//   npm run test:hub -- setup develop   run only the named scenarios
//   npm run test:hub -- --model sonnet  pass a model to the agent
//   npm run test:hub -- --keep          keep fixtures for inspection
//
// Each scenario costs real tokens (roughly $0.5 to $5). Transcripts are written to
// tests/hub/.runs/<timestamp>/<scenario>.jsonl. Fixtures use local bare repos as
// `origin`, so no scenario can push anywhere real.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildFixture, installSkills, addGatePrefs, makeUncommittedChanges, makeFeatureBranches, git } from './fixture.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const only = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--model');

const UNATTENDED = [
  'You are running inside an automated test with nobody at the keyboard.',
  'Never call AskUserQuestion. Whenever a skill tells you to ask the engineer, pick the option the skill marks recommended',
  '(or the first option when none is marked), state the pick in one line, and continue as if the engineer chose it.',
  'When a skill offers to commit, accept. Never push to any remote and never run gh pr create or gh pr edit.',
].join(' ');

function runAgent(cwd, prompt, transcriptPath) {
  const cli = ['-p', prompt, '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'bypassPermissions', '--max-turns', '80', '--append-system-prompt', UNATTENDED];
  const model = opt('--model');
  if (model) cli.push('--model', model);
  const res = spawnSync('claude', cli, { cwd, encoding: 'utf8', input: '', maxBuffer: 256 * 1024 * 1024, timeout: 30 * 60 * 1000 });
  writeFileSync(transcriptPath, res.stdout ?? '');
  const events = (res.stdout ?? '').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
  const tools = events.filter((e) => e.type === 'assistant')
    .flatMap((e) => e.message?.content ?? []).filter((c) => c.type === 'tool_use');
  const result = events.find((e) => e.type === 'result') ?? {};
  return { tools, text: result.result ?? '', cost: result.total_cost_usd ?? 0, error: res.error ?? (res.status ? res.stderr : null) };
}

// ---- helpers for assertions ------------------------------------------------
const readHub = (run) => run.tools.some((t) =>
  (t.name === 'Read' && /[\\/]hub\.md$/.test(t.input?.file_path ?? '')) ||
  (t.name === 'Bash' && /hub\.md/.test(t.input?.command ?? '')));
const bashCmds = (run) => run.tools.filter((t) => ['Bash', 'PowerShell'].includes(t.name)).map((t) => t.input?.command ?? '');
// True when a git command ran inside `repo`: `git -C api …`, `cd api && git …`,
// or a loop over the repos (`for r in api web; do git -C $r …`).
const ranGitIn = (run, repo) => bashCmds(run).some((c) => {
  if (new RegExp(`git\\s+-C\\s+["']?[^\\s"']*${repo}["']?\\s`).test(c)) return true;
  if (new RegExp(`cd\\s+["']?[^\\s"';&]*${repo}["']?\\s*(&&|;)[^]*git\\s`).test(c)) return true;
  return [...c.matchAll(/for\s+(\w+)\s+in\s+([^;]*);/g)].some(([, v, list]) =>
    new RegExp(`(^|\\s)["']?${repo}["']?(\\s|$)`).test(list) &&
    new RegExp(`(git\\s+-C\\s+["']?\\$\\{?${v}\\b|cd\\s+["']?\\$\\{?${v}\\b[^]*git\\s)`).test(c));
});
const branch = (dir) => git(dir, 'rev-parse', '--abbrev-ref', 'HEAD');
const sha = (dir, ref) => git(dir, 'rev-parse', ref);
const listFiles = (dir, skip = []) => readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile()).map((d) => relative(dir, join(d.parentPath ?? d.path, d.name)).replace(/\\/g, '/'))
  .filter((p) => !skip.some((s) => p === s || p.startsWith(s + '/')));
const HUB_OWNED = ['.git', '.claude', 'docs', 'api', 'web', 'AGENTS.md', 'CLAUDE.md', 'workflow.repos.json', '.gitignore'];

// ---- scenarios -------------------------------------------------------------
const SCENARIOS = {
  setup: {
    about: '/audit in a folder of repos offers and builds the hub',
    state: 'bare',
    prompt: '/audit',
    check(f, run, ok) {
      const map = join(f.hub, 'workflow.repos.json');
      ok(existsSync(map), 'workflow.repos.json written');
      if (existsSync(map)) {
        const j = JSON.parse(readFileSync(map, 'utf8'));
        const paths = (j.repos ?? []).map((r) => r.path?.replace(/\/$/, ''));
        ok(paths.includes('api') && paths.includes('web'), 'map lists api and web');
        ok((j.repos ?? []).every((r) => r.name && r.base && r.role && r.deploy), 'every repo has name, base, role, deploy');
        ok(Array.isArray(j.order) && j.order.length === 2, 'order lists both repos');
      }
      const gi = existsSync(join(f.hub, '.gitignore')) ? readFileSync(join(f.hub, '.gitignore'), 'utf8') : '';
      ok(/^api\/?$/m.test(gi) && /^web\/?$/m.test(gi), '.gitignore ignores both repo folders');
      ok(existsSync(join(f.hub, '.git')), 'hub is its own git repo');
      ok(existsSync(join(f.hub, 'AGENTS.md')), 'hub AGENTS.md written');
      ok(sha(f.api, 'main') === f.before.api && sha(f.web, 'main') === f.before.web, 'repo main branches untouched');
    },
  },
  develop: {
    about: '/develop builds a cross repo feature on matching branches, never on main',
    state: 'hub',
    prompt: '/develop trip status label',
    check(f, run, ok) {
      ok(readHub(run), 'read develop/hub.md');
      const [a, w] = [branch(f.api), branch(f.web)];
      ok(a !== 'main' && w !== 'main', `both repos off main (api: ${a}, web: ${w})`);
      ok(a === w, 'same branch name in both repos');
      ok(sha(f.api, 'main') === f.before.api && sha(f.web, 'main') === f.before.web, 'main untouched in both repos');
      ok(/statusLabel/.test(readFileSync(join(f.api, 'src/trips.js'), 'utf8')), 'api implements statusLabel');
      ok(/statusLabel/.test(readFileSync(join(f.web, 'src/render.js'), 'utf8')), 'web renders statusLabel');
      const strays = listFiles(f.hub, HUB_OWNED);
      ok(strays.length === 0, `no code written in the hub${strays.length ? ': ' + strays.join(', ') : ''}`);
      const scope = readFileSync(join(f.hub, 'docs/scope/_root/scope.md'), 'utf8');
      ok((scope.match(/\[x\]/g) ?? []).length > 1, 'scope milestones ticked in the hub');
      ok(!existsSync(join(f.api, 'docs')) && !existsSync(join(f.web, 'docs')), 'no docs/ written inside a repo');
    },
  },
  test: {
    about: '/test finds uncommitted changes in every repo, never in the hub',
    state: 'hub',
    prepare(f) { addGatePrefs(f.api, f.web); makeUncommittedChanges(f.api, f.web); },
    prompt: '/test',
    check(f, run, ok) {
      ok(readHub(run), 'read test/hub.md');
      ok(ranGitIn(run, 'api') && ranGitIn(run, 'web'), 'ran git inside both repos');
      ok(!existsSync(join(f.hub, 'test-preferences.json')), 'no test-preferences.json in the hub');
      ok(/api/.test(run.text) && /web/.test(run.text), 'report names both repos');
    },
  },
  sync: {
    about: '/sync reconciles per repo and keeps code commits out of the hub',
    state: 'hub',
    prepare(f) { makeUncommittedChanges(f.api, f.web); },
    prompt: '/sync',
    check(f, run, ok) {
      ok(readHub(run), 'read sync/hub.md');
      ok(ranGitIn(run, 'api') && ranGitIn(run, 'web'), 'ran git inside both repos');
      ok(sha(f.api, 'main') === f.before.api && sha(f.web, 'main') === f.before.web, 'nothing committed to main');
      const hubTracked = git(f.hub, 'ls-files').split('\n');
      ok(!hubTracked.some((p) => /^(api|web)\//.test(p)), 'hub repo tracks no repo files');
    },
  },
  document: {
    about: '/document pr writes one PR body per repo and never runs gh',
    state: 'hub',
    prepare(f) { makeFeatureBranches(f.api, f.web); },
    prompt: '/document pr',
    check(f, run, ok) {
      ok(readHub(run), 'read document/hub.md');
      ok(ranGitIn(run, 'api') && ranGitIn(run, 'web'), 'ran git inside both repos');
      ok(!bashCmds(run).some((c) => /gh\s+pr\s+(create|edit)/.test(c)), 'no gh pr create or edit');
      ok(/api/.test(run.text) && /web/.test(run.text), 'output covers both repos');
    },
  },
  inside: {
    about: 'opening one repo directly detects the parent hub',
    state: 'hub',
    prepare(f) { installSkills(f.api); },
    cwd: (f) => f.api,
    prompt: '/scope',
    check(f, run, ok) {
      ok(readHub(run), 'read scope/hub.md');
      ok(/hub|workflow\.repos\.json/i.test(run.text), 'tells the engineer about the parent hub');
      ok(!existsSync(join(f.api, 'docs')), 'no docs/ created inside the repo');
    },
  },
  single: {
    about: 'regression: a plain repo never loads hub mode',
    state: 'single',
    prepare(f) { addGatePrefs(f.api); makeUncommittedChanges(f.api, null); },
    prompt: '/test',
    check(f, run, ok) {
      ok(!readHub(run), 'did not read hub.md');
      ok(!existsSync(join(f.api, 'workflow.repos.json')), 'no hub created');
    },
  },
  review: {
    about: '/check review writes one findings file per repo into the hub (spawns reviewers, costly)',
    state: 'hub',
    prepare(f) { makeFeatureBranches(f.api, f.web); },
    prompt: '/check review',
    check(f, run, ok) {
      ok(readHub(run), 'read check/hub.md');
      const dir = join(f.hub, 'docs/reviews');
      const files = existsSync(dir) ? readdirSync(dir) : [];
      ok(files.some((n) => /api/.test(n)) && files.some((n) => /web/.test(n)), `one findings file per repo (${files.join(', ') || 'none'})`);
      ok(!existsSync(join(f.api, 'docs')) && !existsSync(join(f.web, 'docs')), 'no findings written inside a repo');
    },
  },
};

// ---- main ------------------------------------------------------------------
const names = only.length ? only : Object.keys(SCENARIOS);
const unknown = names.filter((n) => !SCENARIOS[n]);
if (unknown.length) { console.error(`Unknown scenario(s): ${unknown.join(', ')}. Known: ${Object.keys(SCENARIOS).join(', ')}`); process.exit(2); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runsDir = join(HERE, '.runs', stamp);
mkdirSync(runsDir, { recursive: true });
let failed = 0, total = 0;

for (const name of names) {
  const s = SCENARIOS[name];
  const root = mkdtempSync(join(tmpdir(), `hubtest-${name}-`));
  const f = buildFixture(root, s.state);
  s.prepare?.(f);
  f.before = { api: sha(f.api, 'main'), web: f.web ? sha(f.web, 'main') : null };
  console.log(`\n▶ ${name}: ${s.about}`);
  const run = runAgent(s.cwd ? s.cwd(f) : f.project, s.prompt, join(runsDir, `${name}.jsonl`));
  total += run.cost;
  if (run.error) console.log(`  agent error: ${String(run.error).slice(0, 300)}`);
  let pass = true;
  const ok = (cond, label) => { console.log(`  ${cond ? '✔' : '✘'} ${label}`); if (!cond) pass = false; };
  try { s.check(f, run, ok); } catch (e) { ok(false, `check threw: ${e.message}`); }
  console.log(`  ${pass ? 'PASS' : 'FAIL'} · $${run.cost.toFixed(2)} · fixture ${flag('--keep') || !pass ? root : '(removed)'}`);
  if (!pass) failed++;
  else if (!flag('--keep')) rmSync(root, { recursive: true, force: true });
}

console.log(`\n${names.length - failed}/${names.length} scenarios passed · total $${total.toFixed(2)} · transcripts in ${relative(process.cwd(), runsDir)}`);
process.exit(failed ? 1 : 0);
