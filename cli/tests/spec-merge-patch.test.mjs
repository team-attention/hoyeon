/**
 * Tests for `hoyeon-cli spec merge --patch` (ID-based merge)
 *
 * Run: node tests/spec-merge-patch.test.mjs
 */

import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');
let tmpDir;
let specPath;
let passed = 0;
let failed = 0;

function setup() {
  tmpDir = mkdtempSync(join(tmpdir(), 'spec-patch-test-'));
  specPath = join(tmpDir, 'spec.json');
}

function teardown() {
  rmSync(tmpDir, { recursive: true, force: true });
}

function writeSpec(data) {
  writeFileSync(specPath, JSON.stringify(data, null, 2));
}

function readSpec() {
  return JSON.parse(readFileSync(specPath, 'utf8'));
}

function run(args) {
  return execSync(`node ${CLI} ${args}`, { encoding: 'utf8', cwd: tmpDir });
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

function makeSpec(overrides = {}) {
  return {
    meta: { name: 'test', goal: 'test', type: 'dev' },
    tasks: [{ id: 'T1', action: 'task one', type: 'work', status: 'pending' }],
    ...overrides,
  };
}

// ============================================================
// Test 1: --patch updates existing item by ID, preserves others
// ============================================================
console.log('\nTest 1: --patch updates existing item by ID, preserves others');
setup();

writeSpec(makeSpec({
  tasks: [
    { id: 'T1', action: 'task one', type: 'work', status: 'pending' },
    { id: 'T2', action: 'task two', type: 'work', status: 'pending' },
    { id: 'T3', action: 'task three', type: 'work', status: 'pending' },
  ],
}));

run(`spec merge ${specPath} --patch --json '${JSON.stringify({
  tasks: [{ id: 'T2', action: 'task two UPDATED', status: 'done' }]
})}'`);

const result1 = readSpec();
assert(result1.tasks.length === 3, 'Array length preserved (3 tasks)');
assert(result1.tasks[0].action === 'task one', 'T1 unchanged');
assert(result1.tasks[1].action === 'task two UPDATED', 'T2 action updated');
assert(result1.tasks[1].status === 'done', 'T2 status updated');
assert(result1.tasks[1].type === 'work', 'T2 type preserved (not in patch)');
assert(result1.tasks[2].action === 'task three', 'T3 unchanged');

teardown();

// ============================================================
// Test 2: --patch adds new item when ID not found
// ============================================================
console.log('\nTest 2: --patch adds new item when ID not found');
setup();

writeSpec(makeSpec());

run(`spec merge ${specPath} --patch --json '${JSON.stringify({
  tasks: [{ id: 'T2', action: 'new task', type: 'work', status: 'pending' }]
})}'`);

const result2 = readSpec();
assert(result2.tasks.length === 2, 'New task appended (2 tasks)');
assert(result2.tasks[0].id === 'T1', 'T1 still at index 0');
assert(result2.tasks[1].id === 'T2', 'T2 added at end');
assert(result2.tasks[1].action === 'new task', 'T2 has correct action');

teardown();

// ============================================================
// Test 3: --patch on requirements preserves other requirements
// ============================================================
console.log('\nTest 3: --patch on requirements preserves other requirements');
setup();

writeSpec(makeSpec({
  requirements: [
    { id: 'R1', behavior: 'parsing', sub: [{ id: 'R1.1', behavior: 'sub one' }] },
    { id: 'R2', behavior: 'scanning', sub: [{ id: 'R2.1', behavior: 'sub two' }] },
    { id: 'R3', behavior: 'matching', sub: [{ id: 'R3.1', behavior: 'sub three' }] },
  ],
}));

run(`spec merge ${specPath} --patch --json '${JSON.stringify({
  requirements: [{ id: 'R2', behavior: 'scanning FIXED' }]
})}'`);

const result3 = readSpec();
assert(result3.requirements.length === 3, 'All 3 requirements preserved');
assert(result3.requirements[0].behavior === 'parsing', 'R1 unchanged');
assert(result3.requirements[1].behavior === 'scanning FIXED', 'R2 behavior updated');
assert(result3.requirements[2].behavior === 'matching', 'R3 unchanged');

teardown();

// ============================================================
// Test 4: --patch on constraints
// ============================================================
console.log('\nTest 4: --patch on constraints');
setup();

writeSpec(makeSpec({
  constraints: [
    { id: 'C1', rule: 'no recursion' },
    { id: 'C2', rule: 'no score on deps' },
  ],
}));

run(`spec merge ${specPath} --patch --json '${JSON.stringify({
  constraints: [{ id: 'C1', rule: 'no recursion (UPDATED)' }]
})}'`);

const result4 = readSpec();
assert(result4.constraints.length === 2, 'Both constraints preserved');
assert(result4.constraints[0].rule === 'no recursion (UPDATED)', 'C1 updated');
assert(result4.constraints[1].rule === 'no score on deps', 'C2 unchanged');

teardown();

// ============================================================
// Test 5: --append and --patch are mutually exclusive
// ============================================================
console.log('\nTest 5: --append and --patch are mutually exclusive');
setup();

writeSpec(makeSpec());

try {
  run(`spec merge ${specPath} --patch --append --json '${JSON.stringify({ tasks: [] })}'`);
  assert(false, 'Should have thrown');
} catch (e) {
  assert(e.stderr.includes('mutually exclusive'), 'Error message mentions mutually exclusive');
}

teardown();

// ============================================================
// Test 6: without --patch, old behavior (replace) still works
// ============================================================
console.log('\nTest 6: without --patch, array replacement still works');
setup();

writeSpec(makeSpec({
  tasks: [
    { id: 'T1', action: 'one', type: 'work', status: 'pending' },
    { id: 'T2', action: 'two', type: 'work', status: 'pending' },
  ],
}));

run(`spec merge ${specPath} --json '${JSON.stringify({
  tasks: [{ id: 'T1', action: 'only one', type: 'work', status: 'pending' }]
})}'`);

const result6 = readSpec();
assert(result6.tasks.length === 1, 'Array replaced (old behavior)');
assert(result6.tasks[0].action === 'only one', 'Only T1 remains');

teardown();

// ============================================================
// Test 7: --patch with context.decisions appends new items
// ============================================================
console.log('\nTest 7: --patch with context.decisions appends new items');
setup();

writeSpec(makeSpec({
  context: {
    decisions: [{ id: 'D1', decision: 'first', rationale: 'r1' }],
  },
}));

run(`spec merge ${specPath} --patch --json '${JSON.stringify({
  context: { decisions: [{ id: 'D2', decision: 'second', rationale: 'r2' }] }
})}'`);

const result7 = readSpec();
assert(result7.context.decisions.length === 2, 'D2 appended');
assert(result7.context.decisions[0].decision === 'first', 'D1 preserved');
assert(result7.context.decisions[1].decision === 'second', 'D2 added');

teardown();

// ============================================================
// Test 8: --patch adds new sub-requirements without losing existing ones
// ============================================================
console.log('\nTest 8: --patch adds new sub-requirements without losing existing ones');
setup();

writeSpec(makeSpec({
  requirements: [
    {
      id: 'R1', behavior: 'upload photo',
      sub: [
        { id: 'R1.1', behavior: 'valid photo saved' },
        { id: 'R1.2', behavior: 'large photo resized' },
      ],
    },
    {
      id: 'R2', behavior: 'view feed',
      sub: [{ id: 'R2.1', behavior: 'posts shown' }],
    },
  ],
}));

run(`spec merge ${specPath} --patch --json '${JSON.stringify({
  requirements: [{
    id: 'R1',
    sub: [{ id: 'R1.3', behavior: 'banned user rejected' }],
  }],
})}'`);

const result8 = readSpec();
const r1_8 = result8.requirements.find(r => r.id === 'R1');
const r2_8 = result8.requirements.find(r => r.id === 'R2');

assert(result8.requirements.length === 2, 'Both requirements preserved');
assert(r1_8.sub.length === 3, 'R1 now has 3 subs (2 original + 1 new)');
assert(r1_8.sub.map(s => s.id).includes('R1.1'), 'R1.1 preserved');
assert(r1_8.sub.map(s => s.id).includes('R1.2'), 'R1.2 preserved');
assert(r1_8.sub.map(s => s.id).includes('R1.3'), 'R1.3 added');
assert(r2_8.sub.length === 1, 'R2 subs untouched');

teardown();

// ============================================================
// Test 9: spec sub <id> --get returns correct sub-requirement JSON
// ============================================================
console.log('\nTest 9: spec sub <id> --get returns correct sub-requirement JSON');
setup();

writeSpec(makeSpec({
  requirements: [
    {
      id: 'R1', behavior: 'parsing',
      sub: [
        { id: 'R1.1', behavior: 'input parsed correctly' },
        { id: 'R1.2', behavior: 'empty input returns error' },
      ],
    },
  ],
}));

const out9 = run(`spec sub R1.1 --get ${specPath}`);
const parsed9 = JSON.parse(out9);
assert(parsed9.id === 'R1.1', 'Returned sub has correct id');
assert(parsed9.behavior === 'input parsed correctly', 'Returned sub has correct behavior');

teardown();

// ============================================================
// Test 10: --patch merge with GWT sub-requirements preserves given/when/then
// ============================================================
console.log('\nTest 10: --patch merge with GWT sub-requirements preserves given/when/then');
setup();

writeSpec(makeSpec({
  requirements: [
    {
      id: 'R1', behavior: 'user authentication',
      sub: [
        { id: 'R1.1', behavior: 'login with valid credentials' },
      ],
    },
  ],
}));

run(`spec merge ${specPath} --patch --json '${JSON.stringify({
  requirements: [{
    id: 'R1',
    sub: [{
      id: 'R1.2',
      behavior: 'login with invalid credentials rejected',
      given: 'a user on the login page',
      when: 'the user submits invalid credentials',
      then: 'an error message is displayed',
    }],
  }],
})}'`);

const result10 = readSpec();
const r1_10 = result10.requirements.find(r => r.id === 'R1');
assert(r1_10.sub.length === 2, 'R1 has 2 subs after patch');
assert(r1_10.sub[0].id === 'R1.1', 'R1.1 preserved');
assert(r1_10.sub[0].given === undefined, 'R1.1 has no given (behavior-only)');
const gwt = r1_10.sub.find(s => s.id === 'R1.2');
assert(gwt !== undefined, 'R1.2 added via patch');
assert(gwt.behavior === 'login with invalid credentials rejected', 'R1.2 behavior preserved');
assert(gwt.given === 'a user on the login page', 'R1.2 given preserved after merge');
assert(gwt.when === 'the user submits invalid credentials', 'R1.2 when preserved after merge');
assert(gwt.then === 'an error message is displayed', 'R1.2 then preserved after merge');

teardown();

// ============================================================
// Test 11: --patch updates existing GWT sub-requirement fields
// ============================================================
console.log('\nTest 11: --patch updates existing GWT sub-requirement fields');
setup();

writeSpec(makeSpec({
  requirements: [
    {
      id: 'R1', behavior: 'data export',
      sub: [
        {
          id: 'R1.1', behavior: 'export CSV',
          given: 'user has data',
          when: 'user clicks export',
          then: 'CSV file is downloaded',
        },
      ],
    },
  ],
}));

run(`spec merge ${specPath} --patch --json '${JSON.stringify({
  requirements: [{
    id: 'R1',
    sub: [{ id: 'R1.1', behavior: 'export CSV with headers', then: 'CSV file with headers is downloaded' }],
  }],
})}'`);

const result11 = readSpec();
const r1_11 = result11.requirements.find(r => r.id === 'R1');
assert(r1_11.sub.length === 1, 'Still 1 sub after update');
assert(r1_11.sub[0].behavior === 'export CSV with headers', 'behavior updated');
assert(r1_11.sub[0].then === 'CSV file with headers is downloaded', 'then field updated');

teardown();

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
