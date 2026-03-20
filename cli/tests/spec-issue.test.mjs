/**
 * Tests for `hoyeon-cli spec issue` (--json and --stdin modes)
 *
 * Run: node tests/spec-issue.test.mjs
 */

import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');
let tmpDir;
let specPath;
let passed = 0;
let failed = 0;

function setup() {
  tmpDir = mkdtempSync(join(tmpdir(), 'spec-issue-test-'));
  specPath = join(tmpDir, 'spec.json');
}

function teardown() {
  rmSync(tmpDir, { recursive: true, force: true });
}

function writeSpec(data) {
  writeFileSync(specPath, JSON.stringify(data, null, 2));
}

function readIssues() {
  const p = join(tmpDir, 'context', 'issues.json');
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, 'utf8'));
}

function run(args, opts = {}) {
  return execSync(`node ${CLI} ${args}`, { encoding: 'utf8', cwd: tmpDir, ...opts });
}

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${msg}`);
  } else {
    failed++;
    console.log(`  FAIL: ${msg}`);
  }
}

const BASE_SPEC = {
  meta: { goal: 'test', mode: 'quick', schema_version: 'v5' },
  context: {},
  constraints: [],
  requirements: [],
  tasks: [
    { id: 'T1', action: 'task one', type: 'dev', status: 'pending',
      acceptance_criteria: { scenarios: ['REQ-1-S1', 'REQ-1-S2'], checks: [] } },
    { id: 'T2', action: 'task two', type: 'dev', status: 'pending',
      acceptance_criteria: { scenarios: ['REQ-2-S1'], checks: [] } },
  ],
  acceptance_criteria: { scenarios: [], checks: [] },
  external_dependencies: { pre_work: [], post_work: [] },
};

// ============================================================
// Test 1: --json adds an issue
// ============================================================
console.log('\nTest 1: --json adds an issue');
setup();
writeSpec(BASE_SPEC);

const json1 = JSON.stringify({ type: 'blocker', description: 'Cannot proceed due to missing dep' });
run(`spec issue --task T1 --json '${json1}' ${specPath}`);

const i1 = readIssues();
assert(i1.length === 1, 'one issue added');
assert(i1[0].id === 'I1', 'id is I1');
assert(i1[0].task === 'T1', 'task is T1');
assert(i1[0].type === 'blocker', 'type preserved');
assert(i1[0].description === 'Cannot proceed due to missing dep', 'description preserved');
assert(i1[0].created_at, 'created_at exists');

teardown();

// ============================================================
// Test 2: --stdin reads JSON from heredoc
// ============================================================
console.log('\nTest 2: --stdin reads JSON from heredoc');
setup();
writeSpec(BASE_SPEC);

const json2 = JSON.stringify({ type: 'failed_approach', description: 'Tried X but it failed' });
run(`spec issue --task T2 --stdin ${specPath}`, { input: json2 });

const i2 = readIssues();
assert(i2.length === 1, 'one issue added via stdin');
assert(i2[0].id === 'I1', 'id is I1');
assert(i2[0].task === 'T2', 'task is T2');
assert(i2[0].type === 'failed_approach', 'type from stdin');
assert(i2[0].description === 'Tried X but it failed', 'description from stdin');

teardown();

// ============================================================
// Test 3: multiple issues get sequential IDs
// ============================================================
console.log('\nTest 3: multiple issues get sequential IDs');
setup();
writeSpec(BASE_SPEC);

const j3a = JSON.stringify({ type: 'blocker', description: 'first issue' });
const j3b = JSON.stringify({ type: 'out_of_scope', description: 'second issue' });
const j3c = JSON.stringify({ type: 'failed_approach', description: 'third issue' });
run(`spec issue --task T1 --json '${j3a}' ${specPath}`);
run(`spec issue --task T2 --json '${j3b}' ${specPath}`);
run(`spec issue --task T1 --stdin ${specPath}`, { input: j3c });

const i3 = readIssues();
assert(i3.length === 3, 'three issues total');
assert(i3[0].id === 'I1' && i3[1].id === 'I2' && i3[2].id === 'I3', 'sequential IDs I1-I3');
assert(i3[2].description === 'third issue', 'third issue from stdin');

teardown();

// ============================================================
// Test 4: missing --task errors
// ============================================================
console.log('\nTest 4: missing --task errors');
setup();
writeSpec(BASE_SPEC);

try {
  run(`spec issue --json '${json1}' ${specPath}`);
  assert(false, 'should have thrown');
} catch (e) {
  assert(e.stderr.includes('--task') || e.status !== 0, 'errors on missing --task');
}

teardown();

// ============================================================
// Test 5: invalid task ID errors
// ============================================================
console.log('\nTest 5: invalid task ID errors');
setup();
writeSpec(BASE_SPEC);

try {
  run(`spec issue --task T99 --json '${json1}' ${specPath}`);
  assert(false, 'should have thrown');
} catch (e) {
  assert(e.stderr.includes('not found') || e.status !== 0, 'errors on invalid task ID');
}

teardown();

// ============================================================
// Test 6: --stdin with empty input errors
// ============================================================
console.log('\nTest 6: --stdin with empty input errors');
setup();
writeSpec(BASE_SPEC);

try {
  run(`spec issue --task T1 --stdin ${specPath}`, { input: '' });
  assert(false, 'should have thrown');
} catch (e) {
  assert(e.status !== 0, 'errors on empty stdin');
}

teardown();

// ============================================================
// Test 7: all valid type values are accepted
// ============================================================
console.log('\nTest 7: all valid type values are accepted');
setup();
writeSpec(BASE_SPEC);

const types = ['failed_approach', 'out_of_scope', 'blocker'];
for (const t of types) {
  const j = JSON.stringify({ type: t, description: `issue of type ${t}` });
  run(`spec issue --task T1 --json '${j}' ${specPath}`);
}

const i7 = readIssues();
assert(i7.length === 3, 'three issues for three types');
assert(i7.map(i => i.type).join(',') === types.join(','), 'all types stored correctly');

teardown();

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
