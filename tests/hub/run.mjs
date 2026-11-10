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
import { buildFixture, installSkills, addGatePrefs, makeUncommittedChanges, makeFeatureBranches, makePriceFixture, makeLifecycleFixture, makeLegacySowFixture, git } from './fixture.mjs';

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
  // Every assistant text block, so a question the agent asked (and answered itself, unattended) is visible.
  const said = events.filter((e) => e.type === 'assistant').flatMap((e) => e.message?.content ?? [])
    .filter((c) => c.type === 'text').map((c) => c.text).concat(result.result ?? '').join('\n');
  return { tools, said, text: result.result ?? '', cost: result.total_cost_usd ?? 0, error: res.error ?? (res.status ? res.stderr : null) };
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
// Month, Baseline, Approved increments and Fee cells of retainer-schedule.md (audit may not change them).
const approvedCols = (hub) => readFileSync(join(hub, 'docs/billing/retainer-schedule.md'), 'utf8').split('\n')
  .filter((l) => /^\|\s*(Month|[A-Z][a-z]{2} \d{4})\s*\|/.test(l))
  .map((l) => l.split('|').slice(1, 5).map((c) => c.trim()).join('|')).join('\n');
// Numbers in `s` with "N min" read as hours, skipping times like 12:00, so 2.5 = 2.50 and 150 = 150.00.
const nums = (s) => [...s.matchAll(/(?<![\d.:])(\d+(?:\.\d+)?)(?![\d:])(\s*min\b)?/gi)].map((m) => (m[2] ? m[1] / 60 : +m[1]));
const near = (v) => (n) => Math.abs(n - v) < 0.01;
// Numbers after `label` on every line that has it.
const numsAfter = (text, label) => text.split('\n').flatMap((l) => { const i = l.search(label); return i < 0 ? [] : nums(l.slice(i)); });
// Cell `col` of the first table line matching `rowRe`, read against the header of the table it sits in.
const tableCell = (text, rowRe, col) => {
  const ls = text.split('\n');
  const i = ls.findIndex((l) => l.startsWith('|') && rowRe.test(l));
  if (i < 0) return undefined;
  let h = i;
  while (h > 0 && ls[h - 1].startsWith('|')) h--;
  const j = ls[h].split('|').map((c) => c.trim()).findIndex((c) => c === col);
  return j < 0 ? undefined : ls[i].split('|')[j]?.trim();
};
// True when the agent read modes/<mode>.md, by the Read tool or a shell command.
const readMode = (run, mode) => run.tools.some((t) =>
  (t.name === 'Read' && new RegExp(`modes[\\\\/]${mode}\\.md$`).test(t.input?.file_path ?? '')) ||
  (['Bash', 'PowerShell'].includes(t.name) && new RegExp(`modes[\\\\/]${mode}\\.md`).test(t.input?.command ?? '')));
const section = (text, re) => text.split(/^## /m).find((s) => re.test(s)) ?? '';
const readIf = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');
const LINE12 = /^\|\s*12\s*\|/;
const LINE7 = /^\|\s*7\s*\|/;
const LINE8 = /^\|\s*8\s*\|/;
// Every date in `s` as YYYY-MM-DD: 2026-11-20, 20 Nov 2026, 20 November 2026, Nov 20, 2026, 1st Dec 2026.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dates = (s) => [
  ...[...s.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)].map(([, y, m, d]) => iso(y, +m, +d)),
  ...[...s.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})\b/g)]
    .filter(([, , mo]) => MONTHS.includes(mo.toLowerCase())).map(([, d, mo, y]) => iso(y, MONTHS.indexOf(mo.toLowerCase()) + 1, +d)),
  ...[...s.matchAll(/\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g)]
    .filter(([, mo]) => MONTHS.includes(mo.toLowerCase())).map(([, mo, d, y]) => iso(y, MONTHS.indexOf(mo.toLowerCase()) + 1, +d)),
];
// The 1st of the month after an ISO date: the legacy increment start.
const firstOfNextMonth = (d) => { const [y, m] = d.split('-').map(Number); return m === 12 ? iso(y + 1, 1, 1) : iso(y, m + 1, 1); };
const sowFile = (f, re) => { const n = sowFiles(f).find((x) => re.test(x)); return n ? readFileSync(join(f.hub, 'docs/billing/sows', n), 'utf8') : ''; };
const ledgerOf = (f) => readFileSync(join(f.hub, 'docs/billing/ledger.md'), 'utf8');
const scopeUntouched = (f) => git(f.hub, 'status', '--porcelain', 'docs/scope', 'docs/specs') === '';
const noPush = (run) => !bashCmds(run).some((c) => /git\s+(-C\s+\S+\s+)?push\b|gh\s+pr\s+(create|edit|merge)\b/.test(c));
const sowFiles = (f) => { const d = join(f.hub, 'docs/billing/sows'); return existsSync(d) ? readdirSync(d) : []; };
const sowText = (f) => { const [n] = sowFiles(f); return n ? readFileSync(join(f.hub, 'docs/billing/sows', n), 'utf8') : ''; };
const sowStatus = (sow) => sow.match(/^Status:([^\n·]*)/m)?.[1] ?? '';
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
  price: {
    about: '/price audit builds sessions from author dates and proposes, never approves; approve with no amount, and approve on an In progress line, are refused; a legacy line is priced by size, calibrated on Appendix A (six sessions)',
    state: 'hub',
    prepare(f) { makePriceFixture(f.hub, f.api); f.retainerBefore = approvedCols(f.hub); },
    prompt: '/price audit 6',
    check(f, run, ok) {
      ok(readHub(run), 'read price/hub.md');
      ok(ranGitIn(run, 'api'), 'ran git inside api');
      const dir = join(f.hub, 'docs/billing/audits');
      const files = existsSync(dir) ? readdirSync(dir) : [];
      ok(files.length === 1, `one audit file written (${files.join(', ') || 'none'})`);
      const audit = files.length ? readFileSync(join(dir, files[0]), 'utf8') : '';
      // Only author dates give two sessions of 1.5 h and 1.0 h ending 15:30; the push time is 12:00.
      // Scoped to the Sessions section: ledger 7's lockfile commit is authored at 12:00 and may be listed elsewhere.
      const sessionsPart = audit.split(/^## /m).find((s) => /^Sessions\b/.test(s)) ?? '';
      const sessions = sessionsPart.split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l));
      // Length cell: the first number followed by h, else the first number followed by min, / 60.
      const lenHead = sessionsPart.split('\n').find((l) => /^\|[^\n]*Length/i.test(l)) ?? '';
      const lenCol = lenHead.split('|').findIndex((c) => /Length/i.test(c));
      const lengthHours = (l) => {
        const cells = l.split('|');
        const cell = cells[lenCol > 0 ? lenCol : cells.length - 2] ?? '';
        const h = cell.match(/(?<![\d.])(\d+(?:\.\d+)?)\s*(h|hrs?|hours?)\b/i);
        const m = cell.match(/(?<![\d.])(\d+(?:\.\d+)?)\s*min\b/i);
        return h ? +h[1] : m ? m[1] / 60 : NaN;
      };
      const lengths = sessions.map(lengthHours);
      ok(sessions.length === 2 && lengths.some(near(1.5)) && lengths.some(near(1.0)), `two sessions of 1.5 h (90 min) and 1.0 h (60 min) from author dates (${sessions.length} found: ${lengths.join(', ')} h)`);
      ok(sessions.some((l) => /15:30/.test(l)) && !sessions.some((l) => /12:00/.test(l)), 'session ends use author times (15:30), not the push time (12:00)');
      ok(numsAfter(audit, /Measured hours/i).some(near(2.5)), 'measured hours 2.5 (or 150 min) on the Measured hours line');
      const seen = audit + '\n' + run.text;
      // Fee cell (last cell) of the Effort or Solo row in the Fees table.
      const feeCell = (name) => nums(audit.split('\n').find((l) => new RegExp(`^\\|\\s*${name}\\b`, 'i').test(l))?.split('|').filter((c) => c.trim()).at(-1) ?? '');
      ok(feeCell('Effort').some(near(150)), 'effort fee 150.00 printed (2.5 h x 60)');
      ok(feeCell('Solo').some(near(125)), 'solo fee 125.00 printed (2.5 h x 2.0 = 5.0 h; 5.0 x 25)');
      ok(/reference/i.test(seen), 'reference fee printed');
      const ledger = readFileSync(join(f.hub, 'docs/billing/ledger.md'), 'utf8');
      const row = ledger.split('\n').find((l) => /^\|\s*6\s*\|/.test(l)) ?? '';
      ok(!/\bApproved\b/.test(audit), 'audit file never contains the word Approved');
      ok(/Proposed/i.test(row), 'ledger row 6 says Proposed');
      ok(!/\bApproved\b/.test(row.replace(/Approved \(/g, '')), 'ledger row 6 never says Approved');
      ok(/\bPending\b/.test(row), 'Approved column stays Pending');
      ok(approvedCols(f.hub) === f.retainerBefore, 'retainer-schedule.md Month, Baseline, Approved increments and Fee unchanged after audit');
      ok(git(f.hub, 'status', '--porcelain', 'docs/billing/rates.md') === '' && git(f.hub, 'log', '--oneline', '--', 'docs/billing/rates.md').split('\n').length === 1, 'rates.md untouched');
      ok(!/\b(5|five)\b[^\n]*shift scheduling[^\n]*\b(700|included)/i.test(audit), 'item 5 not counted');
      ok(!bashCmds(run).some((c) => /git\s+(-C\s+\S+\s+)?push\b|gh\s+pr\s+(create|edit|merge)\b/.test(c)), 'no git push, no gh pr create/edit/merge');
    },
    then: [
      {
        prompt: '/price approve 6',
        check(f, run, ok) {
          const ledger = readFileSync(join(f.hub, 'docs/billing/ledger.md'), 'utf8');
          const row = ledger.split('\n').find((l) => /^\|\s*6\s*\|/.test(l)) ?? '';
          ok(/\bPending\b/.test(row) && !/\bApproved\b/.test(row), 'ledger row 6 still Pending after approve with no amount');
          ok(/\b(amount|number)\b/i.test(run.text) && /\b(refus\w*|need\w*|requires?|missing|without|cannot|can't|won't)\b/i.test(run.text), 'approve names the missing amount and refuses');
          ok(approvedCols(f.hub) === f.retainerBefore, 'retainer-schedule.md approved columns unchanged after approve with no amount');
        },
      },
      {
        prompt: '/price approve 6 ok',
        check(f, run, ok) {
          const ledger = readFileSync(join(f.hub, 'docs/billing/ledger.md'), 'utf8');
          const row = ledger.split('\n').find((l) => /^\|\s*6\s*\|/.test(l)) ?? '';
          ok(/\bPending\b/.test(row) && !/\bApproved\b/.test(row), 'ledger row 6 unchanged (Pending, not Approved) after approve with "ok"');
          ok(/\b(amount|number)\b/i.test(run.text) && /\b(refus\w*|cannot|can't|won't|not a)\b/i.test(run.text), 'approve with "ok" names the bad amount and refuses');
          ok(approvedCols(f.hub) === f.retainerBefore, 'retainer-schedule.md approved columns unchanged after approve with "ok"');
        },
      },
      {
        prompt: '/price audit 11',
        check(f, run, ok) {
          const ledger = readFileSync(join(f.hub, 'docs/billing/ledger.md'), 'utf8');
          const row = ledger.split('\n').find((l) => /^\|\s*11\s*\|/.test(l)) ?? '';
          ok(/In progress/i.test(row) && !/\bProposed\b/.test(row) && !/\bApproved\b/.test(row.replace(/Approved \(/g, '')), 'ledger row 11 stays In progress after audit (not Proposed, not Approved)');
          ok(/work so far[^|]*not approvable/i.test(row), 'ledger row 11 says "work so far, not approvable"');
          ok(approvedCols(f.hub) === f.retainerBefore, 'retainer-schedule.md approved columns unchanged after auditing row 11');
        },
      },
      {
        // The row 11 audit now exists, so only the In progress rule can refuse this.
        prompt: '/price approve 11 300',
        check(f, run, ok) {
          const ledger = readFileSync(join(f.hub, 'docs/billing/ledger.md'), 'utf8');
          const row = ledger.split('\n').find((l) => /^\|\s*11\s*\|/.test(l)) ?? '';
          ok(/In progress/i.test(row) && !/\bApproved\b/.test(row.replace(/Approved \(/g, '')) && /\bPending\b/.test(row), 'ledger row 11 still In progress and Pending after approve with an amount');
          ok(/in progress/i.test(run.text) && /\b(refus\w*|cannot|can't|won't|not approvable)\b/i.test(run.text), 'approve refuses and names In progress');
          ok(approvedCols(f.hub) === f.retainerBefore, 'retainer-schedule.md approved columns unchanged after the refused approve');
        },
      },
      {
        // Legacy basis: arithmetic in fixture.mjs above LEGACY_COMMITS.
        prompt: '/price audit 7',
        prepare(f) { const d = join(f.hub, 'docs/billing/audits'); f.auditsBefore = existsSync(d) ? readdirSync(d) : []; },
        check(f, run, ok) {
          const dir = join(f.hub, 'docs/billing/audits');
          const added = (existsSync(dir) ? readdirSync(dir) : []).filter((n) => !f.auditsBefore.includes(n));
          ok(added.length === 1, `one new audit file for row 7 (${added.join(', ') || 'none'})`);
          const audit = added.length ? readFileSync(join(dir, added[0]), 'utf8') : '';
          const seen = audit + '\n' + run.text;
          const rows = audit.split('\n').filter((l) => l.startsWith('|'));
          ok(/Basis[^\n]*legacy/i.test(audit), 'audit states Basis legacy');
          ok(!/Measured hours/i.test(audit) && !/(^|[^\d.])2\.50*\s*(h|hrs?|hours?)\b|(^|[^\d.])150\s*min/i.test(audit) && !/\b150\.00\b/.test(audit),
            'no commit hours: no Measured hours, no 2.5 h, no effort fee 150.00');
          ok(/package-lock\.json/.test(audit) && /generated[\\/]prisma/.test(audit), 'excluded lockfile and generated Prisma client named');
          ok(numsAfter(audit, /Size score/i).some(near(7)), 'size score 7.0 (3 routes 3.0 + migration 1.5 + 2 emails 1.0 + 300 lines 1.5)');
          ok(rows.some((l) => nums(l).some(near(4.8)) && nums(l).some(near(2.4))), 'calibration row for item 1: 120 / 25 = 4.8 h, 4.8 / 2.0 = 2.4 h per point');
          ok(rows.some((l) => nums(l).some(near(8)) && nums(l).some(near(1.6))), 'calibration row for item 2: 200 / 25 = 8 h, 8 / 5.0 = 1.6 h per point');
          ok(numsAfter(audit, /median/i).some(near(2)), 'median 2.0 h per point ((2.4 + 1.6) / 2)');
          ok(numsAfter(audit, /Solo hours/i).some(near(14)), 'solo hours 14.0 (7.0 x 2.0)');
          ok(numsAfter(audit, /\bFee\b/).some(near(350)), 'fee 350.00 (14.0 x 25)');
          ok(numsAfter(audit, /\bLow\b/).some(near(280)) && numsAfter(audit, /\bHigh\b/).some(near(420)), 'low 280.00 (7.0 x 1.6 x 25) and high 420.00 (7.0 x 2.4 x 25), already multiples of 5 so nearest 5 keeps them');
          ok(/Confidence[^\n]*\bLow\b/i.test(audit), 'confidence Low (two anchors, under three)');
          ok(/\bSOW\b/.test(run.text) && /\bSOW\b[^\n]*pending|pending[^\n]*\bSOW\b/i.test(audit), 'asks for the SOW date and leaves the increment pending');
          ok(!/\bApproved\b/.test(audit), 'legacy audit never contains the word Approved');
          const ledger = readFileSync(join(f.hub, 'docs/billing/ledger.md'), 'utf8');
          const row = ledger.split('\n').find((l) => /^\|\s*7\s*\|/.test(l)) ?? '';
          ok(/Proposed/i.test(row) && nums(row).some(near(350)) &&/\bPending\b/.test(row) && !/\bApproved\b/.test(row.replace(/Approved \(/g, '')), 'ledger row 7 Proposed at 350.00, Approved still Pending');
          ok(/n\/a \(legacy: contract rate\)/.test(row), 'ledger row 7 rate and speed factor cell says "n/a (legacy: contract rate)"');
          const head = ledger.split('\n').find((l) => /\|\s*SOW signed\s*\|/.test(l)) ?? '';
          const col = head.split('|').findIndex((c) => c.trim() === 'SOW signed');
          ok(col > 0 && row.split('|')[col]?.trim() === '', 'ledger row 7 SOW signed cell stays empty (no SOW date given)');
          ok(approvedCols(f.hub) === f.retainerBefore, 'retainer-schedule.md approved columns unchanged after the legacy audit');
          ok(!/^\d/.test(seen.match(/Increment starts:?\s*([^\n|]*)/i)?.[1]?.trim() ?? ''), 'increment start not dated without a SOW date');
        },
      },
    ],
  },
  // Lifecycle scenarios (spec section 15). Fixture and arithmetic: makeLifecycleFixture in fixture.mjs.
  classify: {
    about: '/price classify: a plain bug is Maintenance with no ledger line, a new capability is a New Feature with a Planned line; it asks, records classification.md, edits no scope row',
    state: 'hub',
    prepare(f) { makeLifecycleFixture(f.hub, f.api, 'classify'); },
    prompt: '/price classify row 2',
    check(f, run, ok) {
      ok(readHub(run), 'read price/hub.md');
      ok(readMode(run, 'classify'), 'read modes/classify.md');
      ok(/New Feature/.test(run.said) && /Maintenance/.test(run.said) && /Needs discussion/.test(run.said) && /recommend/i.test(run.said),
        'asked with the three options and a recommendation');
      const cls = readIf(join(f.hub, 'docs/billing/classification.md'));
      const answer = tableCell(cls, /Duplicate trips|row 2\b/i, 'Answer') ?? '';
      ok(/Maintenance/.test(answer) && !/New Feature/.test(answer), `classification.md records row 2 as Maintenance (${answer || 'no line'})`);
      ok(/1\.2|Bug/i.test(tableCell(cls, /Duplicate trips|row 2\b/i, 'Reasons') ?? ''), 'reasons cite the Bug test (1.2)');
      ok(!ledgerOf(f).split('\n').some((l) => LINE12.test(l)), 'no ledger line for a Maintenance row');
      ok(scopeUntouched(f), 'no scope row or spec changed');
      ok(noPush(run), 'no git push, no gh pr');
    },
    then: [
      {
        prompt: '/price classify row 3',
        check(f, run, ok) {
          ok(/New Feature/.test(run.said) && /Maintenance/.test(run.said) && /Needs discussion/.test(run.said), 'asked with the three options');
          const cls = readIf(join(f.hub, 'docs/billing/classification.md'));
          const answer = tableCell(cls, /Trip history export|row 3\b/i, 'Answer') ?? '';
          ok(/New Feature/.test(answer), `classification.md records row 3 as New Feature (${answer || 'no line'})`);
          ok(/Maintenance/.test(tableCell(cls, /Duplicate trips|row 2\b/i, 'Answer') ?? ''), 'row 2 line kept');
          const ledger = ledgerOf(f);
          ok(/measured/i.test(tableCell(ledger, LINE12, 'Basis') ?? '') && /Planned/.test(tableCell(ledger, LINE12, 'State') ?? ''),
            'ledger line 12 (next free number after 11) with Basis measured and State Planned');
          ok(!/\bApproved\b/.test(ledger.split('\n').find((l) => LINE12.test(l)) ?? ''), 'line 12 never says Approved');
          ok(/quote/i.test(run.text), 'recommends /price quote');
          ok(scopeUntouched(f), 'no scope row or spec changed');
        },
      },
    ],
  },
  quote: {
    about: '/price quote: estimate 410.00, ceiling 490.00 and retainer 61.50 / 73.50 from the plan, calibrated on Appendix A; line 12 Estimated, never Approved',
    state: 'hub',
    prepare(f) { makeLifecycleFixture(f.hub, f.api, 'quote'); f.retainerBefore = approvedCols(f.hub); },
    prompt: '/price quote 12',
    check(f, run, ok) {
      ok(readHub(run), 'read price/hub.md');
      ok(readMode(run, 'quote'), 'read modes/quote.md');
      const dir = join(f.hub, 'docs/billing/audits');
      const files = (existsSync(dir) ? readdirSync(dir) : []).filter((n) => /-estimate\.md$/.test(n));
      ok(files.length === 1, `one estimate file (${files.join(', ') || 'none'})`);
      const est = files.length ? readFileSync(join(dir, files[0]), 'utf8') : '';
      ok(numsAfter(est, /Size score/i).some(near(8.17)), 'size score 8.17 (2 routes 2.0 + migration 1.5 + job 1.5 + email 0.5 + screen 1.0 + 2 tests 0.5 + 234 lines 1.17)');
      ok(est.split('\n').some((l) => nums(l).some(near(4.8)) && nums(l).some(near(2.4))) && numsAfter(est, /median/i).some(near(2)),
        'calibration on Appendix A: item 1 4.8 h, 2.4 h per point; median 2.0');
      ok(numsAfter(est, /Solo hours/i).some(near(16.34)), 'solo hours 16.34 (8.17 x 2.0)');
      ok(numsAfter(est, /Estimate\b/).some(near(410)), 'estimate 410.00 (16.34 x 25 = 408.50, nearest 5)');
      ok(numsAfter(est, /Ceiling/).some(near(490)) && numsAfter(est, /Ceiling/).some(near(20)), 'ceiling 490.00 (410.00 x 1.20 = 492.00, nearest 5), 20% read from rates.md');
      const ret = nums(section(est, /^Retainer/i));
      ok(ret.some(near(61.5)) && ret.some(near(73.5)), 'retainer 61.50 a month (15% of 410.00) and 73.50 (15% of 490.00)');
      ok(/pending/i.test(section(est, /^Retainer/i)), 'first month pending the deployment date');
      ok(!/\bApproved\b/.test(est), 'estimate never says Approved');
      const ledger = ledgerOf(f);
      const row = ledger.split('\n').find((l) => LINE12.test(l)) ?? '';
      ok(/Estimated/.test(tableCell(ledger, LINE12, 'State') ?? ''), 'ledger line 12 State Estimated');
      ok(nums(tableCell(ledger, LINE12, 'Estimate') ?? '').some(near(410)) && nums(tableCell(ledger, LINE12, 'Ceiling') ?? '').some(near(490)), 'ledger Estimate 410.00 and Ceiling 490.00');
      ok(!/\bApproved\b/.test(row) && /Pending/.test(tableCell(ledger, LINE12, 'Approved') ?? ''), 'line 12 never Approved, Approved cell still Pending');
      ok(!/Proposed/.test(tableCell(ledger, LINE12, 'Proposed price') ?? ''), 'quote writes no Proposed price');
      ok(approvedCols(f.hub) === f.retainerBefore, 'retainer-schedule.md approved columns unchanged');
      ok(/\bsow\b/i.test(run.text), 'offers /price sow');
      ok(scopeUntouched(f), 'no scope row or spec changed');
      ok(noPush(run), 'no git push, no gh pr');
    },
  },
  sow: {
    about: '/price sow: register makes SOW-001 as Draft; ack without a quote and a raise above the ceiling are refused; ack with date, channel and quote acknowledges; nothing marked signed; a legacy Retroactive SOW ack fills SOW signed with the ack date, other lines keep it empty',
    state: 'hub',
    prepare(f) { makeLifecycleFixture(f.hub, f.api, 'sow'); f.retainerBefore = approvedCols(f.hub); },
    prompt: '/price sow 12 register',
    check(f, run, ok) {
      ok(readHub(run), 'read price/hub.md');
      ok(readMode(run, 'sow'), 'read modes/sow.md');
      const files = sowFiles(f);
      ok(files.length === 1 && /^SOW-001-[a-z0-9-]+\.md$/.test(files[0]), `one file SOW-001-<slug>.md (${files.join(', ') || 'none'})`);
      const sow = sowText(f);
      ok(/Draft/.test(sowStatus(sow)) && !/Sent|Acknowledged|Declined/.test(sowStatus(sow)), `SOW status Draft (${sowStatus(sow).trim() || 'none'})`);
      ok(numsAfter(sow, /Estimated fee/i).some(near(410)) && numsAfter(sow, /Ceiling/).some(near(490)), 'estimate 410.00 and ceiling 490.00 from the ledger');
      ok(numsAfter(sow, /Monthly increase/i).some(near(61.5)), 'monthly increase 61.50 (15% of 410.00)');
      ok(/not reduced because the work was done faster/i.test(sow) && /Client's written reply/i.test(sow), 'change rule printed');
      ok(/Done when:[^\n]*email/i.test(sow), 'Done when line from scope row 3');
      ok(/SOW-001/.test(tableCell(ledgerOf(f), LINE12, 'SOW no.') ?? '') && /Draft/.test(tableCell(ledgerOf(f), LINE12, 'SOW status') ?? ''), 'ledger SOW no. SOW-001, SOW status Draft');
      ok(!/\bsigned\b/i.test(sowStatus(sow)), 'not marked signed');
      ok(scopeUntouched(f), 'no scope row or spec changed');
    },
    then: [
      {
        prompt: '/price sow 12 ack 2026-11-12 whatsapp',
        check(f, run, ok) {
          ok(/Draft/.test(sowStatus(sowText(f))) && /Draft/.test(tableCell(ledgerOf(f), LINE12, 'SOW status') ?? ''), 'still Draft in the SOW and the ledger');
          ok(/\b(quote|screenshot)\b/i.test(run.text) && /\b(refus\w*|need\w*|requires?|missing|without|cannot|can't|won't)\b/i.test(run.text), 'ack without a quote is refused and names the missing quote or screenshot');
        },
      },
      {
        prompt: '/price sow 12 raise 600 "the export also needs a PDF format" 2026-11-12 whatsapp',
        check(f, run, ok) {
          const sow = sowText(f);
          ok(numsAfter(sow, /Current fee/i).some(near(410)) && !numsAfter(sow, /Current fee/i).some(near(600)), 'Current fee still 410.00, not 600.00');
          ok(nums(tableCell(ledgerOf(f), LINE12, 'Estimate') ?? '').some(near(410)), 'ledger Estimate still 410.00');
          ok(/ceiling/i.test(run.text) && nums(run.text).some(near(490)) && /\b(refus\w*|cannot|can't|won't|not appl\w*|pending)\b/i.test(run.text), 'raise to 600 above the 490.00 ceiling is refused until the client replies');
        },
      },
      {
        // The SOW is still Draft, so this ack acknowledges the SOW, not the pending raise.
        prompt: '/price sow 12 ack 2026-11-13 whatsapp "Yes, go ahead with the export at 410"',
        check(f, run, ok) {
          const sow = sowText(f);
          const ledger = ledgerOf(f);
          ok(/Acknowledged/.test(sowStatus(sow)), `SOW status Acknowledged (${sowStatus(sow).trim() || 'none'})`);
          ok(/Acknowledged/.test(tableCell(ledger, LINE12, 'SOW status') ?? '') && /SOW Acknowledged/.test(tableCell(ledger, LINE12, 'State') ?? ''), 'ledger SOW status Acknowledged, State SOW Acknowledged');
          ok(/go ahead with the export/i.test(section(sow, /^History/)) && /2026-11-13|13 Nov/i.test(section(sow, /^History/)), 'History records the date and the client quote');
          ok(numsAfter(sow, /Current fee/i).some(near(410)), 'Current fee still 410.00 (the raise stays pending)');
          ok(!/\bsigned\b/i.test(sowStatus(sow)) && !/\bsigned\b/i.test(ledger.split('\n').find((l) => LINE12.test(l)) ?? ''), 'nothing marked signed');
          ok(!/\bApproved\b/.test(ledger.split('\n').find((l) => LINE12.test(l)) ?? ''), 'line 12 never Approved');
          ok(!(tableCell(ledger, LINE12, 'SOW signed') ?? ''), 'line 12 (measured) gets no SOW signed date');
          ok(scopeUntouched(f), 'no scope row or spec changed');
        },
      },
      {
        // Legacy: arithmetic in fixture.mjs above makeLegacySowFixture.
        prompt: '/price sow 7 register',
        prepare(f) { makeLegacySowFixture(f.hub); },
        check(f, run, ok) {
          const sow = sowFile(f, /^SOW-002-/);
          ok(sowFiles(f).length === 2 && !!sow, `SOW-002 registered next to SOW-001 (${sowFiles(f).join(', ')})`);
          ok(/Retroactive SOW[^\n]*\byes\b/i.test(sow) && !/yes\s*\|\s*no/i.test(sow), 'SOW-002 is a Retroactive SOW (yes, not the template choice)');
          ok(/Draft/.test(sowStatus(sow)) && numsAfter(sow, /Estimated fee/i).some(near(300)), 'SOW-002 Draft with the audited fee 300.00 as its estimate');
          const ledger = ledgerOf(f);
          ok(/SOW-002/.test(tableCell(ledger, LINE7, 'SOW no.') ?? ''), 'ledger line 7 SOW no. SOW-002');
          ok(dates(tableCell(ledger, LINE7, 'SOW signed') ?? '').length === 0, 'line 7 SOW signed still empty before the ack');
        },
      },
      {
        prompt: '/price sow 7 ack 2026-11-20 email "Confirmed, please bill the ticket escalation work"',
        check(f, run, ok) {
          const ledger = ledgerOf(f);
          const signed = dates(tableCell(ledger, LINE7, 'SOW signed') ?? '');
          ok(signed.length === 1 && signed[0] === '2026-11-20', `line 7 SOW signed holds the ack date 2026-11-20 (${signed.join(', ') || 'empty'})`);
          ok(/Acknowledged/.test(sowStatus(sowFile(f, /^SOW-002-/))) && /Acknowledged/.test(tableCell(ledger, LINE7, 'SOW status') ?? ''), 'SOW-002 and ledger line 7 Acknowledged');
          // 2026-11-20 → month 11 + 1 = 12 → 2026-12-01.
          const start = firstOfNextMonth('2026-11-20');
          ok(start === '2026-12-01' && dates(run.text).includes(start), `report gives the increment start ${start} (1st of the month after 2026-11-20)`);
          ok(dates(tableCell(ledger, LINE8, 'SOW signed') ?? '').length === 0, 'line 8 (legacy, never acknowledged) SOW signed still empty');
          ok(!(tableCell(ledger, LINE12, 'SOW signed') ?? ''), 'line 12 (measured) SOW signed untouched');
          ok(/Acknowledged/.test(sowStatus(sowFile(f, /^SOW-001-/))) && numsAfter(sowFile(f, /^SOW-001-/), /Current fee/i).some(near(410)), 'SOW-001 unchanged (Acknowledged, 410.00)');
          ok(!/\bApproved\b/.test((ledger.split('\n').find((l) => LINE7.test(l)) ?? '').replace(/Approved \(/g, '')) && /Pending/.test(tableCell(ledger, LINE7, 'Approved') ?? ''), 'line 7 never Approved, Approved cell still Pending');
          ok(approvedCols(f.hub) === f.retainerBefore, 'retainer-schedule.md approved columns unchanged (approve applies the increment)');
          ok(noPush(run), 'no git push, no gh pr');
        },
      },
    ],
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
  for (const [i, t] of [].concat(s.then ?? []).entries()) {
    t.prepare?.(f);
    const run2 = runAgent(s.cwd ? s.cwd(f) : f.project, t.prompt, join(runsDir, `${name}-then${i + 1}.jsonl`));
    total += run2.cost;
    console.log(`  then: ${t.prompt}`);
    try { t.check(f, run2, ok); } catch (e) { ok(false, `then check threw: ${e.message}`); }
  }
  console.log(`  ${pass ? 'PASS' : 'FAIL'} · $${run.cost.toFixed(2)} · fixture ${flag('--keep') || !pass ? root : '(removed)'}`);
  if (!pass) failed++;
  else if (!flag('--keep')) rmSync(root, { recursive: true, force: true });
}

console.log(`\n${names.length - failed}/${names.length} scenarios passed · total $${total.toFixed(2)} · transcripts in ${relative(process.cwd(), runsDir)}`);
process.exit(failed ? 1 : 0);
