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
});

// Update R1-S1: change verified_by and add execution_env (keep verify type compatible)
run(`spec merge ${specPath} --patch --json '${JSON.stringify({
  requirements: [{
    id: 'R1',
    scenarios: [
      { id: 'R1-S1', verified_by: 'human', execution_env: 'host', verify: { type: 'instruction', ask: 'check it in browser' } },
    ],
  }],
})}'`);

const result4 = readSpec();
assert(result4.requirements.length === 1, 'R1 still only requirement');
const r1 = result4.requirements[0];
// --patch now recursively merges nested arrays by ID too
assert(r1.behavior === 'parsing', 'R1 behavior preserved');
assert(r1.scenarios.length === 2, 'Both scenarios preserved after recursive patch');
assert(r1.scenarios[0].id === 'R1-S1', 'R1-S1 still present');
assert(r1.scenarios[0].verified_by === 'human', 'R1-S1 verified_by updated');
assert(r1.scenarios[0].execution_env === 'host', 'R1-S1 execution_env added');
assert(r1.scenarios[0].given === 'old given', 'R1-S1 given preserved');
assert(r1.scenarios[0].when === 'old when', 'R1-S1 when preserved');
assert(r1.scenarios[1].id === 'R1-S2', 'R1-S2 still present');
assert(r1.scenarios[1].verified_by === 'machine', 'R1-S2 unchanged');

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
});

const checkOut = run(`spec check ${specPath}`);
assert(checkOut.includes('check passed'), 'spec check passes with valid scenario refs');

teardown();

// ============================================================
// Test 11: spec scenario <id> --get returns correct scenario JSON
// ============================================================
console.log('\nTest 11: spec scenario <id> --get returns correct scenario JSON');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [{ id: 'T1', action: 'x', type: 'work', status: 'pending' }],
  requirements: [
    {
      id: 'R1', behavior: 'parsing', priority: 1,
      scenarios: [
        { id: 'R1-S1', given: 'input provided', when: 'parse called', then: 'output returned', verified_by: 'machine', verify: { type: 'command', run: 'test', expect: { exit_code: 0 } } },
        { id: 'R1-S2', given: 'empty input', when: 'parse called', then: 'error thrown', verified_by: 'machine', verify: { type: 'command', run: 'test2', expect: { exit_code: 1 } } },
      ],
    },
  ],
});

const out11 = run(`spec scenario R1-S1 --get ${specPath}`);
const parsed11 = JSON.parse(out11);
assert(parsed11.id === 'R1-S1', 'Returned scenario has correct id');
assert(parsed11.given === 'input provided', 'Returned scenario has correct given field');
assert(parsed11.when === 'parse called', 'Returned scenario has correct when field');
assert(parsed11.then === 'output returned', 'Returned scenario has correct then field');

teardown();

// ============================================================
// Test 12: spec scenario <id> --get with non-existent ID exits 1
// ============================================================
console.log('\nTest 12: spec scenario <id> --get with non-existent ID exits 1');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [{ id: 'T1', action: 'x', type: 'work', status: 'pending' }],
  requirements: [
    {
      id: 'R1', behavior: 'parsing', priority: 1,
      scenarios: [
        { id: 'R1-S1', given: 'a', when: 'b', then: 'c', verified_by: 'machine', verify: { type: 'command', run: 'test', expect: { exit_code: 0 } } },
      ],
    },
  ],
});

try {
  run(`spec scenario NONEXISTENT --get ${specPath}`);
  assert(false, 'Should have thrown for non-existent scenario ID');
} catch (e) {
  assert(e.status !== 0, 'Exit code is non-zero for missing scenario');
  assert(e.stderr.includes("scenario 'NONEXISTENT' not found"), 'Error message contains missing scenario ID');
}

teardown();

// ============================================================
// Test 13: spec scenario <id> --get can find scenario in second requirement
// ============================================================
console.log('\nTest 13: spec scenario <id> --get finds scenario in second requirement');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [{ id: 'T1', action: 'x', type: 'work', status: 'pending' }],
  requirements: [
    {
      id: 'R1', behavior: 'parsing', priority: 1,
      scenarios: [
        { id: 'R1-S1', given: 'a', when: 'b', then: 'c', verified_by: 'machine', verify: { type: 'command', run: 'test', expect: { exit_code: 0 } } },
      ],
    },
    {
      id: 'R2', behavior: 'scanning', priority: 2,
      scenarios: [
        { id: 'R2-S1', given: 'file exists', when: 'scan invoked', then: 'results emitted', verified_by: 'agent', verify: { type: 'assertion', checks: ['results not empty'] } },
      ],
    },
  ],
});

const out13 = run(`spec scenario R2-S1 --get ${specPath}`);
const parsed13 = JSON.parse(out13);
assert(parsed13.id === 'R2-S1', 'Found scenario from second requirement has correct id');
assert(parsed13.given === 'file exists', 'Found scenario from second requirement has correct given field');

teardown();

// ============================================================
// Test 14: spec requirement --status returns correct text output
// ============================================================
console.log('\nTest 14: spec requirement --status shows all scenarios with status');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [{ id: 'T1', action: 'x', type: 'work', status: 'pending' }],
  requirements: [
    {
      id: 'R1', behavior: 'Login error handling', priority: 1,
      scenarios: [
        { id: 'R1-S1', given: 'a', when: 'b', then: 'c', verified_by: 'machine', execution_env: 'host', status: 'pass', verified_by_task: 'T1', verify: { type: 'command', run: 'test', expect: { exit_code: 0 } } },
        { id: 'R1-S2', given: 'a', when: 'b', then: 'c', verified_by: 'agent', execution_env: 'sandbox', subject: 'web', verify: { type: 'assertion', checks: ['ok'] } },
        { id: 'R1-S3', given: 'a', when: 'b', then: 'c', verified_by: 'human', verify: { type: 'instruction', ask: 'check' } },
      ],
    },
  ],
});

const out14 = run(`spec requirement --status ${specPath}`);
assert(out14.includes('R1'), 'output contains R1');
assert(out14.includes('R1-S1'), 'output contains R1-S1');
assert(out14.includes('pass'), 'output contains pass status');
assert(out14.includes('pending'), 'output contains pending status');
assert(out14.includes('Summary:'), 'output contains Summary line');
assert(out14.includes('1 pass'), 'summary shows 1 pass');

teardown();

// ============================================================
// Test 15: spec requirement --status --json returns valid JSON with summary
// ============================================================
console.log('\nTest 15: spec requirement --status --json returns valid JSON with summary');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [{ id: 'T1', action: 'x', type: 'work', status: 'pending' }],
  requirements: [
    {
      id: 'R1', behavior: 'parsing', priority: 1,
      scenarios: [
        { id: 'R1-S1', given: 'a', when: 'b', then: 'c', verified_by: 'machine', status: 'pass', verified_by_task: 'T1', verify: { type: 'command', run: 'test', expect: { exit_code: 0 } } },
        { id: 'R1-S2', given: 'a', when: 'b', then: 'c', verified_by: 'agent', verify: { type: 'assertion', checks: ['ok'] } },
      ],
    },
  ],
});

const out15 = run(`spec requirement --status ${specPath} --json`);
const parsed15 = JSON.parse(out15);
assert(Array.isArray(parsed15.requirements), 'JSON has requirements array');
assert(parsed15.summary !== undefined, 'JSON has summary object');
assert(parsed15.summary.pass === 1, 'summary.pass = 1');
assert(parsed15.summary.pending === 1, 'summary.pending = 1');
assert(parsed15.requirements[0].id === 'R1', 'first requirement id = R1');
assert(parsed15.requirements[0].scenarios.length === 2, 'R1 has 2 scenarios');
assert(parsed15.requirements[0].scenarios[0].status === 'pass', 'R1-S1 status = pass');
assert(parsed15.requirements[0].scenarios[0].verified_by_task === 'T1', 'R1-S1 verified_by_task = T1');

teardown();

// ============================================================
// Test 16: spec requirement R1-S1 --status pass --task T1 updates scenario
// ============================================================
console.log('\nTest 16: spec requirement <id> --status pass --task T1 updates scenario');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [{ id: 'T1', action: 'x', type: 'work', status: 'pending' }],
  requirements: [
    {
      id: 'R1', behavior: 'parsing', priority: 1,
      scenarios: [
        { id: 'R1-S1', given: 'a', when: 'b', then: 'c', verified_by: 'machine', verify: { type: 'command', run: 'test', expect: { exit_code: 0 } } },
        { id: 'R1-S2', given: 'a', when: 'b', then: 'c', verified_by: 'agent', verify: { type: 'assertion', checks: ['ok'] } },
      ],
    },
  ],
});

const out16 = run(`spec requirement R1-S1 --status pass --task T1 ${specPath}`);
assert(out16.includes("R1-S1"), 'confirmation output mentions R1-S1');
assert(out16.includes('pass'), 'confirmation output mentions pass');

const result16 = readSpec();
const sc16 = result16.requirements[0].scenarios[0];
assert(sc16.status === 'pass', 'scenario status updated to pass');
assert(sc16.verified_by_task === 'T1', 'verified_by_task set to T1');
const sc16other = result16.requirements[0].scenarios[1];
assert(!sc16other.status || sc16other.status !== 'pass', 'R1-S2 not affected');

teardown();

// ============================================================
// Test 17: spec sandbox-tasks creates T_SANDBOX + T_SV tasks
// ============================================================
console.log('\nTest 17: spec sandbox-tasks creates T_SANDBOX + T_SV tasks');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [
    { id: 'T1', action: 'implement feature', type: 'work', status: 'pending', acceptance_criteria: { scenarios: ['R1-S2'], checks: [] } },
  ],
  requirements: [
    {
      id: 'R1', behavior: 'feature', priority: 1,
      scenarios: [
        { id: 'R1-S1', given: 'a', when: 'b', then: 'host output', verified_by: 'machine', execution_env: 'host', verify: { type: 'command', run: 'test', expect: { exit_code: 0 } } },
        { id: 'R1-S2', given: 'a', when: 'b', then: 'sandbox output', verified_by: 'agent', execution_env: 'sandbox', subject: 'web', verify: { type: 'assertion', checks: ['ok'] } },
      ],
    },
  ],
});

const out17 = run(`spec sandbox-tasks ${specPath}`);
assert(out17.includes('T_SANDBOX'), 'output mentions T_SANDBOX');
assert(out17.includes('T_SV'), 'output mentions T_SV task');

const result17 = readSpec();
const taskIds17 = result17.tasks.map(t => t.id);
assert(taskIds17.includes('T_SANDBOX'), 'T_SANDBOX task created in spec');
assert(taskIds17.some(id => id.startsWith('T_SV')), 'T_SV task created in spec');

const sandboxInfra = result17.tasks.find(t => t.id === 'T_SANDBOX');
assert(sandboxInfra !== undefined, 'T_SANDBOX task found');
assert(Array.isArray(sandboxInfra.depends_on), 'T_SANDBOX has depends_on');
assert(sandboxInfra.depends_on.includes('T1'), 'T_SANDBOX depends on T1 (work task referencing sandbox scenario)');

const svTask = result17.tasks.find(t => t.id.startsWith('T_SV'));
assert(svTask !== undefined, 'T_SV task found');
assert(svTask.depends_on.includes('T_SANDBOX'), 'T_SV depends on T_SANDBOX');
assert(svTask.action.includes('R1-S2'), 'T_SV action mentions sandbox scenario id');

teardown();

// ============================================================
// Test 18: spec sandbox-tasks skips if no sandbox scenarios
// ============================================================
console.log('\nTest 18: spec sandbox-tasks skips if no sandbox scenarios');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [{ id: 'T1', action: 'x', type: 'work', status: 'pending' }],
  requirements: [
    {
      id: 'R1', behavior: 'parsing', priority: 1,
      scenarios: [
        { id: 'R1-S1', given: 'a', when: 'b', then: 'c', verified_by: 'machine', execution_env: 'host', verify: { type: 'command', run: 'test', expect: { exit_code: 0 } } },
      ],
    },
  ],
});

const out18 = run(`spec sandbox-tasks ${specPath}`);
assert(out18.includes('No sandbox scenarios'), 'output says no sandbox scenarios');

const result18 = readSpec();
assert(result18.tasks.length === 1, 'no new tasks added (still 1 task)');

teardown();

// ============================================================
// Test 19: --patch adds new scenarios without losing existing ones (regression: scenario overwrite bug)
// ============================================================
console.log('\nTest 19: --patch adds new scenarios without losing existing ones');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [{ id: 'T1', action: 'x', type: 'work', status: 'pending' }],
  requirements: [
    {
      id: 'R1', behavior: 'upload photo', priority: 1,
      scenarios: [
        { id: 'R1-S1', given: 'user logged in', when: 'upload valid photo', then: 'photo saved', category: 'HP', verified_by: 'machine', verify: { type: 'command', run: 'test', expect: { exit_code: 0 } } },
        { id: 'R1-S2', given: 'user logged in', when: 'upload 10MB photo', then: 'resize and save', category: 'EP', verified_by: 'machine', verify: { type: 'command', run: 'test2', expect: { exit_code: 0 } } },
        { id: 'R1-S3', given: 'user offline', when: 'upload attempt', then: 'error shown', category: 'BC', verified_by: 'agent', verify: { type: 'assertion', checks: ['error visible'] } },
      ],
    },
    {
      id: 'R2', behavior: 'view feed', priority: 1,
      scenarios: [
        { id: 'R2-S1', given: 'posts exist', when: 'open feed', then: 'posts shown', category: 'HP', verified_by: 'machine', verify: { type: 'command', run: 'test3', expect: { exit_code: 0 } } },
      ],
    },
  ],
});

// Add EP scenario to R1 — this was the exact bug: --patch replaced R1.scenarios with just [R1-S4]
run(`spec merge ${specPath} --patch --json '${JSON.stringify({
  requirements: [{
    id: 'R1',
    scenarios: [
      { id: 'R1-S4', given: 'user banned', when: 'upload attempt', then: 'rejected', category: 'EP', verified_by: 'machine', verify: { type: 'command', run: 'test4', expect: { exit_code: 0 } } },
    ],
  }],
})}'`);

const result19 = readSpec();
const r1_19 = result19.requirements.find(r => r.id === 'R1');
const r2_19 = result19.requirements.find(r => r.id === 'R2');

assert(result19.requirements.length === 2, 'Both requirements preserved');
assert(r1_19.scenarios.length === 4, 'R1 now has 4 scenarios (3 original + 1 new)');
assert(r1_19.scenarios.map(s => s.id).includes('R1-S1'), 'R1-S1 preserved');
assert(r1_19.scenarios.map(s => s.id).includes('R1-S2'), 'R1-S2 preserved');
assert(r1_19.scenarios.map(s => s.id).includes('R1-S3'), 'R1-S3 preserved');
assert(r1_19.scenarios.map(s => s.id).includes('R1-S4'), 'R1-S4 added');
assert(r1_19.behavior === 'upload photo', 'R1 behavior unchanged');
assert(r2_19.scenarios.length === 1, 'R2 scenarios untouched');

teardown();

// ============================================================
// Test 20: --patch updates existing scenario fields without losing siblings
// ============================================================
console.log('\nTest 20: --patch updates existing scenario fields without losing siblings');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [{ id: 'T1', action: 'x', type: 'work', status: 'pending' }],
  requirements: [
    {
      id: 'R1', behavior: 'login', priority: 1,
      scenarios: [
        { id: 'R1-S1', given: 'valid creds', when: 'submit', then: 'logged in', category: 'HP', verified_by: 'human', verify: { type: 'instruction', ask: 'check login' } },
        { id: 'R1-S2', given: 'invalid creds', when: 'submit', then: 'error shown', category: 'EP', verified_by: 'machine', verify: { type: 'command', run: 'test', expect: { exit_code: 0 } } },
      ],
    },
  ],
});

// Convert R1-S1 from human to agent (H→S conversion) — change verified_by, verify, add env
run(`spec merge ${specPath} --patch --json '${JSON.stringify({
  requirements: [{
    id: 'R1',
    scenarios: [{
      id: 'R1-S1',
      verified_by: 'agent',
      execution_env: 'sandbox',
      subject: 'web',
      verify: { type: 'assertion', checks: ['login redirect observed'] },
    }],
  }],
})}'`);

const result20 = readSpec();
const r1_20 = result20.requirements[0];
assert(r1_20.scenarios.length === 2, 'Both scenarios preserved');

const s1_20 = r1_20.scenarios.find(s => s.id === 'R1-S1');
assert(s1_20.verified_by === 'agent', 'R1-S1 verified_by updated to agent');
assert(s1_20.execution_env === 'sandbox', 'R1-S1 execution_env added');
assert(s1_20.subject === 'web', 'R1-S1 subject added');
assert(s1_20.given === 'valid creds', 'R1-S1 given preserved (not in patch)');
assert(s1_20.when === 'submit', 'R1-S1 when preserved');
assert(s1_20.then === 'logged in', 'R1-S1 then preserved');
assert(s1_20.category === 'HP', 'R1-S1 category preserved');
assert(s1_20.verify.type === 'assertion', 'R1-S1 verify type updated');

const s2_20 = r1_20.scenarios.find(s => s.id === 'R1-S2');
assert(s2_20.verified_by === 'machine', 'R1-S2 completely untouched');
assert(s2_20.category === 'EP', 'R1-S2 category untouched');

teardown();

// ============================================================
// Test 21: --patch deep merge on task acceptance_criteria.scenarios preserves existing refs
// ============================================================
console.log('\nTest 21: --patch on task AC scenarios appends new refs');
setup();

writeSpec({
  meta: { name: 'test', goal: 'test', created_at: new Date().toISOString(), type: 'dev' },
  tasks: [
    {
      id: 'T1', action: 'implement', type: 'work', status: 'pending',
      acceptance_criteria: {
        scenarios: ['R1-S1', 'R1-S2'],
        checks: [{ type: 'build', run: 'make build' }],
      },
    },
  ],
  requirements: [
    {
      id: 'R1', behavior: 'test', priority: 1,
      scenarios: [
        { id: 'R1-S1', given: 'a', when: 'b', then: 'c', verified_by: 'machine', verify: { type: 'command', run: 'test', expect: { exit_code: 0 } } },
        { id: 'R1-S2', given: 'a', when: 'b', then: 'c', verified_by: 'machine', verify: { type: 'command', run: 'test', expect: { exit_code: 0 } } },
        { id: 'R1-S3', given: 'a', when: 'b', then: 'c', verified_by: 'machine', verify: { type: 'command', run: 'test', expect: { exit_code: 0 } } },
      ],
    },
  ],
});

// Add R1-S3 to T1's AC scenarios — AC.scenarios is a string[] (no id), so patch appends
run(`spec merge ${specPath} --patch --json '${JSON.stringify({
  tasks: [{
    id: 'T1',
    acceptance_criteria: {
      scenarios: ['R1-S3'],
    },
  }],
})}'`);

const result21 = readSpec();
const t1_21 = result21.tasks[0];
assert(t1_21.acceptance_criteria.scenarios.length === 3, 'AC scenarios has 3 refs (2 original + 1 appended)');
assert(t1_21.acceptance_criteria.scenarios.includes('R1-S1'), 'R1-S1 still in AC');
assert(t1_21.acceptance_criteria.scenarios.includes('R1-S2'), 'R1-S2 still in AC');
assert(t1_21.acceptance_criteria.scenarios.includes('R1-S3'), 'R1-S3 added to AC');
assert(t1_21.acceptance_criteria.checks.length === 1, 'AC checks preserved');

teardown();

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
