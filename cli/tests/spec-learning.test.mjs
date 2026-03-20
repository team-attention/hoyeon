/**
 * Tests for `hoyeon-cli spec learning` (--json and --stdin modes)
 *
 * Run: node tests/spec-learning.test.mjs
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
  tmpDir = mkdtempSync(join(tmpdir(), 'spec-learning-test-'));
  specPath = join(tmpDir, 'spec.json');
}

function teardown() {
  rmSync(tmpDir, { recursive: true, force: true });
}

function writeSpec(data) {
  writeFileSync(specPath, JSON.stringify(data, null, 2));
}

function readLearnings() {
  const p = join(tmpDir, 'context', 'learnings.json');
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
// Test 1: --json adds a learning
// ============================================================
console.log('\nTest 1: --json adds a learning');
setup();
writeSpec(BASE_SPEC);

const json1 = JSON.stringify({ problem: 'p1', cause: 'c1', rule: 'r1', tags: ['a'] });
run(`spec learning --task T1 --json '${json1}' ${specPath}`);

const l1 = readLearnings();
assert(l1.length === 1, 'one learning added');
assert(l1[0].id === 'L1', 'id is L1');
assert(l1[0].task === 'T1', 'task is T1');
assert(l1[0].problem === 'p1', 'problem preserved');
assert(l1[0].cause === 'c1', 'cause preserved');
assert(l1[0].rule === 'r1', 'rule preserved');
assert(JSON.stringify(l1[0].tags) === '["a"]', 'tags preserved');
assert(JSON.stringify(l1[0].requirements) === '["REQ-1"]', 'requirements auto-mapped from scenarios');
assert(l1[0].created_at, 'created_at exists');

teardown();

// ============================================================
// Test 2: --stdin reads JSON from heredoc
// ============================================================
console.log('\nTest 2: --stdin reads JSON from heredoc');
setup();
writeSpec(BASE_SPEC);

const json2 = JSON.stringify({ problem: 'stdin-p', cause: 'stdin-c', rule: 'stdin-r', tags: ['stdin'] });
run(`spec learning --task T2 --stdin ${specPath}`, { input: json2 });

const l2 = readLearnings();
assert(l2.length === 1, 'one learning added via stdin');
assert(l2[0].id === 'L1', 'id is L1');
assert(l2[0].task === 'T2', 'task is T2');
assert(l2[0].problem === 'stdin-p', 'problem from stdin');
assert(JSON.stringify(l2[0].requirements) === '["REQ-2"]', 'requirements auto-mapped for T2');

teardown();

// ============================================================
// Test 3: multiple learnings get sequential IDs
// ============================================================
console.log('\nTest 3: multiple learnings get sequential IDs');
setup();
writeSpec(BASE_SPEC);

const j3a = JSON.stringify({ problem: 'first', cause: 'c', rule: 'r', tags: [] });
const j3b = JSON.stringify({ problem: 'second', cause: 'c', rule: 'r', tags: [] });
const j3c = JSON.stringify({ problem: 'third', cause: 'c', rule: 'r', tags: [] });
run(`spec learning --task T1 --json '${j3a}' ${specPath}`);
run(`spec learning --task T2 --json '${j3b}' ${specPath}`);
run(`spec learning --task T1 --stdin ${specPath}`, { input: j3c });

const l3 = readLearnings();
assert(l3.length === 3, 'three learnings total');
assert(l3[0].id === 'L1' && l3[1].id === 'L2' && l3[2].id === 'L3', 'sequential IDs L1-L3');
assert(l3[2].problem === 'third', 'third learning from stdin');

teardown();

// ============================================================
// Test 4: missing --task errors
// ============================================================
console.log('\nTest 4: missing --task errors');
setup();
writeSpec(BASE_SPEC);

try {
  run(`spec learning --json '${json1}' ${specPath}`);
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
  run(`spec learning --task T99 --json '${json1}' ${specPath}`);
  assert(false, 'should have thrown');
} catch (e) {
  assert(e.stderr.includes('not found') || e.status !== 0, 'errors on invalid task ID');
}

teardown();

// ============================================================
// Test 6: --stdin with no input errors
// ============================================================
console.log('\nTest 6: --stdin with empty input errors');
setup();
writeSpec(BASE_SPEC);

try {
  run(`spec learning --task T1 --stdin ${specPath}`, { input: '' });
  assert(false, 'should have thrown');
} catch (e) {
  assert(e.status !== 0, 'errors on empty stdin');
}

teardown();

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
