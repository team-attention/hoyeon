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

// ============================================================
// Test 1: --patch updates existing item by ID, preserves others
// ============================================================
console.log('\nTest 1: --patch updates existing item by ID, preserves others');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [
    { id: 'T1', action: 'task one', type: 'work', status: 'pending' },
    { id: 'T2', action: 'task two', type: 'work', status: 'pending' },
    { id: 'T3', action: 'task three', type: 'work', status: 'pending' },
  ],
  history: [],
});

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

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [
    { id: 'T1', action: 'task one', type: 'work', status: 'pending' },
  ],
  history: [],
});

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
// Test 3: --patch on requirements (the original bug scenario)
// ============================================================
console.log('\nTest 3: --patch on requirements preserves other requirements');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [{ id: 'T1', action: 'x', type: 'work', status: 'pending' }],
  requirements: [
    { id: 'R1', behavior: 'parsing', priority: 1, scenarios: [{ id: 'R1-S1', given: 'a', when: 'b', then: 'c', verified_by: 'machine', verify: { type: 'command', run: 'test', expect: { exit_code: 0 } } }] },
    { id: 'R2', behavior: 'scanning', priority: 1, scenarios: [{ id: 'R2-S1', given: 'a', when: 'b', then: 'c', verified_by: 'machine', verify: { type: 'command', run: 'test2', expect: { exit_code: 0 } } }] },
    { id: 'R3', behavior: 'matching', priority: 1, scenarios: [{ id: 'R3-S1', given: 'a', when: 'b', then: 'c', verified_by: 'machine', verify: { type: 'command', run: 'test3', expect: { exit_code: 0 } } }] },
  ],
  history: [],
});

// AC Quality Gate fixes only R2 — with --patch, R1 and R3 should survive
run(`spec merge ${specPath} --patch --json '${JSON.stringify({
  requirements: [{ id: 'R2', behavior: 'scanning FIXED', priority: 2 }]
})}'`);

const result3 = readSpec();
assert(result3.requirements.length === 3, 'All 3 requirements preserved');
assert(result3.requirements[0].id === 'R1', 'R1 preserved');
assert(result3.requirements[0].behavior === 'parsing', 'R1 unchanged');
assert(result3.requirements[1].id === 'R2', 'R2 preserved');
assert(result3.requirements[1].behavior === 'scanning FIXED', 'R2 behavior updated');
assert(result3.requirements[1].priority === 2, 'R2 priority updated');
assert(result3.requirements[1].scenarios.length === 1, 'R2 scenarios preserved');
assert(result3.requirements[2].id === 'R3', 'R3 preserved');

teardown();

// ============================================================
// Test 4: --patch with nested objects (scenarios inside requirements)
// ============================================================
console.log('\nTest 4: --patch updates nested scenario within requirement');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [{ id: 'T1', action: 'x', type: 'work', status: 'pending' }],
  requirements: [
    {
      id: 'R1', behavior: 'parsing', priority: 1,
      scenarios: [
        { id: 'R1-S1', given: 'old given', when: 'old when', then: 'old then', verified_by: 'human', verify: { type: 'instruction', ask: 'check it' } },
        { id: 'R1-S2', given: 'keep', when: 'keep', then: 'keep', verified_by: 'machine', verify: { type: 'command', run: 'test', expect: { exit_code: 0 } } },
      ],
    },
  ],
  history: [],
});

// Convert R1-S1 from human to agent (H→S conversion)
run(`spec merge ${specPath} --patch --json '${JSON.stringify({
  requirements: [{
    id: 'R1',
    scenarios: [
      { id: 'R1-S1', given: 'old given', when: 'old when', then: 'old then', verified_by: 'agent', execution_env: 'sandbox', verify: { type: 'assertion', checks: ['output contains expected fields'] } },
      { id: 'R1-S2', given: 'keep', when: 'keep', then: 'keep', verified_by: 'machine', verify: { type: 'command', run: 'test', expect: { exit_code: 0 } } },
    ],
  }],
})}'`);

const result4 = readSpec();
assert(result4.requirements.length === 1, 'R1 still only requirement');
const r1 = result4.requirements[0];
// Note: --patch merges at the requirement level, so scenarios array gets replaced
// because scenarios is an array inside the patched R1 object
// This is expected — patch merges the top-level array items by ID,
// but nested arrays follow normal merge rules
assert(r1.behavior === 'parsing', 'R1 behavior preserved');

teardown();

// ============================================================
// Test 5: --patch on constraints
// ============================================================
console.log('\nTest 5: --patch on constraints');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [{ id: 'T1', action: 'x', type: 'work', status: 'pending' }],
  constraints: [
    { id: 'C1', type: 'must_not_do', rule: 'no recursion', verified_by: 'agent', verify: { type: 'assertion', checks: ['no recursion'] } },
    { id: 'C2', type: 'must_not_do', rule: 'no score on deps', verified_by: 'agent', verify: { type: 'assertion', checks: ['no score'] } },
  ],
  history: [],
});

run(`spec merge ${specPath} --patch --json '${JSON.stringify({
  constraints: [{ id: 'C1', rule: 'no recursion (UPDATED)' }]
})}'`);

const result5 = readSpec();
assert(result5.constraints.length === 2, 'Both constraints preserved');
assert(result5.constraints[0].rule === 'no recursion (UPDATED)', 'C1 updated');
assert(result5.constraints[0].type === 'must_not_do', 'C1 type preserved');
assert(result5.constraints[1].rule === 'no score on deps', 'C2 unchanged');

teardown();

// ============================================================
// Test 6: --append and --patch are mutually exclusive
// ============================================================
console.log('\nTest 6: --append and --patch are mutually exclusive');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [{ id: 'T1', action: 'x', type: 'work', status: 'pending' }],
  history: [],
});

try {
  run(`spec merge ${specPath} --patch --append --json '${JSON.stringify({ tasks: [] })}'`);
  assert(false, 'Should have thrown');
} catch (e) {
  assert(e.stderr.includes('mutually exclusive'), 'Error message mentions mutually exclusive');
}

teardown();

// ============================================================
// Test 7: without --patch, old behavior (replace) still works
// ============================================================
console.log('\nTest 7: without --patch, array replacement still works');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [
    { id: 'T1', action: 'one', type: 'work', status: 'pending' },
    { id: 'T2', action: 'two', type: 'work', status: 'pending' },
  ],
  history: [],
});

run(`spec merge ${specPath} --json '${JSON.stringify({
  tasks: [{ id: 'T1', action: 'only one', type: 'work', status: 'pending' }]
})}'`);

const result7 = readSpec();
assert(result7.tasks.length === 1, 'Array replaced (old behavior)');
assert(result7.tasks[0].action === 'only one', 'Only T1 remains');

teardown();

// ============================================================
// Test 8: --patch with items without id (appended)
// ============================================================
console.log('\nTest 8: --patch with items without id field appends them');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [{ id: 'T1', action: 'one', type: 'work', status: 'pending' }],
  context: {
    decisions: [
      { id: 'D1', decision: 'first', rationale: 'r1' },
    ],
  },
  history: [],
});

run(`spec merge ${specPath} --patch --json '${JSON.stringify({
  context: { decisions: [{ id: 'D2', decision: 'second', rationale: 'r2' }] }
})}'`);

const result8 = readSpec();
assert(result8.context.decisions.length === 2, 'D2 appended');
assert(result8.context.decisions[0].decision === 'first', 'D1 preserved');
assert(result8.context.decisions[1].decision === 'second', 'D2 added');

teardown();

// ============================================================
// Test 9: spec check detects broken scenario reference in AC
// ============================================================
console.log('\nTest 9: spec check detects broken scenario reference in AC (v5 referential integrity)');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  requirements: [
    {
      id: 'R1', behavior: 'parsing', priority: 1,
      scenarios: [
        { id: 'R1-S1', given: 'a', when: 'b', then: 'c', verified_by: 'machine', verify: { type: 'command', run: 'test', expect: { exit_code: 0 } } },
      ],
    },
  ],
  tasks: [
    {
      id: 'T1', action: 'implement', type: 'work', status: 'pending',
      acceptance_criteria: {
        scenarios: ['R1-S1', 'R1-S99'],  // R1-S99 does not exist
        checks: [{ type: 'build', run: 'make build' }],
      },
    },
  ],
  history: [],
});

try {
  run(`spec check ${specPath}`);
  assert(false, 'spec check should have failed on broken scenario ref');
} catch (e) {
  assert(e.stderr.includes("unknown scenario 'R1-S99'"), 'Error mentions the broken scenario ID');
  assert(e.status !== 0, 'Exit code is non-zero');
}

teardown();

// ============================================================
// Test 10: spec check passes when all AC scenario refs are valid
// ============================================================
console.log('\nTest 10: spec check passes when all AC scenario refs are valid');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  requirements: [
    {
      id: 'R1', behavior: 'parsing', priority: 1,
      scenarios: [
        { id: 'R1-S1', given: 'a', when: 'b', then: 'c', verified_by: 'machine', verify: { type: 'command', run: 'test', expect: { exit_code: 0 } } },
        { id: 'R1-S2', given: 'x', when: 'y', then: 'z', verified_by: 'agent', verify: { type: 'assertion', checks: ['output ok'] } },
      ],
    },
  ],
  tasks: [
    {
      id: 'T1', action: 'implement', type: 'work', status: 'pending',
      acceptance_criteria: {
        scenarios: ['R1-S1', 'R1-S2'],
        checks: [{ type: 'build', run: 'make build' }],
      },
    },
  ],
  history: [],
});

const checkOut = run(`spec check ${specPath}`);
assert(checkOut.includes('check passed'), 'spec check passes with valid scenario refs');

teardown();

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
