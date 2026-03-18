/**
 * Integration tests for hoyeon-cli spec subcommands.
 *
 * Run: node --test cli/tests/commands.test.mjs
 *
 * Tests:
 *  1. spec check passes on valid spec with correct cross-references
 *  2. spec check detects orphaned task IDs (reference non-existent requirement)
 *  3. spec drift calculates derived/planned ratio correctly
 *  4. spec drift handles zero tasks without division-by-zero
 *  5. spec plan outputs correct format (text mode)
 *  6. spec derive produces correct ID convention ({parent}.{trigger}-{seq})
 *  7. spec status shows correct planned/derived/done counts
 *  8. spec requirement --status aggregates scenario status
 *  9. v4 spec processed through v5 pipeline (validate works on v4 input)
 * 10. validation failure produces guide hint messages
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTempSpec, runCli } from './helpers.js';

// ============================================================
// Test 1: spec check passes on valid spec with correct cross-references
// ============================================================
test('spec check passes on valid spec with correct cross-references', () => {
  const { path, cleanup } = createTempSpec({
    meta: { name: 'test', goal: 'test goal', created_at: new Date().toISOString() },
    requirements: [
      {
        id: 'R1',
        behavior: 'CLI validates spec',
        priority: 1,
        scenarios: [
          {
            id: 'R1-S1',
            given: 'a valid spec',
            when: 'check is run',
            then: 'no errors',
            verified_by: 'machine',
            verify: { type: 'command', run: 'test', expect: { exit_code: 0 } },
          },
        ],
      },
    ],
    tasks: [
      {
        id: 'T1',
        action: 'Implement feature',
        type: 'work',
        status: 'pending',
        acceptance_criteria: {
          scenarios: ['R1-S1'],
          checks: [{ type: 'build', run: 'make build' }],
        },
      },
    ],
  });

  try {
    const { stdout, status } = runCli(['spec', 'check', path]);
    assert.equal(status, 0, 'exit code should be 0');
    assert.ok(stdout.includes('check passed'), 'stdout should include "check passed"');
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 2: spec check detects orphaned task IDs (reference non-existent requirement)
// ============================================================
test('spec check detects orphaned scenario reference in AC', () => {
  const { path, cleanup } = createTempSpec({
    meta: { name: 'test', goal: 'test goal', created_at: new Date().toISOString() },
    requirements: [
      {
        id: 'R1',
        behavior: 'some behavior',
        priority: 1,
        scenarios: [
          {
            id: 'R1-S1',
            given: 'a',
            when: 'b',
            then: 'c',
            verified_by: 'machine',
            verify: { type: 'command', run: 'test', expect: { exit_code: 0 } },
          },
        ],
      },
    ],
    tasks: [
      {
        id: 'T1',
        action: 'task',
        type: 'work',
        status: 'pending',
        acceptance_criteria: {
          scenarios: ['R1-S1', 'R1-NONEXISTENT'],
          checks: [],
        },
      },
    ],
  });

  try {
    const { stderr, status } = runCli(['spec', 'check', path], { expectFail: true });
    assert.notEqual(status, 0, 'exit code should be non-zero');
    assert.ok(
      stderr.includes("unknown scenario 'R1-NONEXISTENT'"),
      `stderr should mention the broken scenario ID, got: ${stderr}`,
    );
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 3: spec drift calculates derived/planned ratio correctly
// ============================================================
test('spec drift calculates derived/planned ratio correctly', () => {
  const { path, cleanup } = createTempSpec({
    meta: { name: 'test', goal: 'test goal', created_at: new Date().toISOString() },
    tasks: [
      { id: 'T1', action: 'planned task 1', type: 'work', status: 'pending' },
      { id: 'T2', action: 'planned task 2', type: 'work', status: 'pending' },
      {
        id: 'T1.retry-1',
        action: 'derived retry task',
        type: 'work',
        status: 'pending',
        origin: 'derived',
        depends_on: ['T1'],
        derived_from: {
          parent: 'T1',
          trigger: 'retry',
          source: 'final_verify',
          reason: 'test failed',
        },
      },
    ],
  });

  try {
    const { stdout, status } = runCli(['spec', 'drift', path]);
    assert.equal(status, 0, 'exit code should be 0');
    const result = JSON.parse(stdout);
    assert.equal(result.planned, 2, 'planned count should be 2');
    assert.equal(result.derived, 1, 'derived count should be 1');
    // drift_ratio = 1 / 2 = 0.5
    assert.equal(result.drift_ratio, 0.5, 'drift_ratio should be 0.5');
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 4: spec drift handles zero tasks without division-by-zero
// ============================================================
test('spec drift handles zero tasks without division-by-zero', () => {
  const { path, cleanup } = createTempSpec({
    meta: { name: 'test', goal: 'test goal', created_at: new Date().toISOString() },
    tasks: [],
  });

  try {
    const { stdout, status } = runCli(['spec', 'drift', path]);
    assert.equal(status, 0, 'exit code should be 0');
    const result = JSON.parse(stdout);
    assert.equal(result.planned, 0, 'planned count should be 0');
    assert.equal(result.derived, 0, 'derived count should be 0');
    assert.equal(result.drift_ratio, 0, 'drift_ratio should be 0 (not NaN/Infinity)');
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 5: spec plan outputs correct format (text mode)
// ============================================================
test('spec plan outputs correct text format', () => {
  const { path, cleanup } = createTempSpec({
    meta: { name: 'my-project', goal: 'Build the thing', created_at: new Date().toISOString() },
    tasks: [
      { id: 'T1', action: 'Setup infra', type: 'work', status: 'pending' },
      { id: 'T2', action: 'Implement feature', type: 'work', status: 'pending', depends_on: ['T1'] },
    ],
  });

  try {
    const { stdout, status } = runCli(['spec', 'plan', path]);
    assert.equal(status, 0, 'exit code should be 0');
    assert.ok(stdout.includes('Plan: my-project'), 'output should include spec name');
    assert.ok(stdout.includes('Goal: Build the thing'), 'output should include goal');
    assert.ok(stdout.includes('T1'), 'output should include T1');
    assert.ok(stdout.includes('T2'), 'output should include T2');
    assert.ok(stdout.includes('Critical path:'), 'output should include critical path');
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 6: spec derive produces correct ID convention ({parent}.{trigger}-{seq})
// ============================================================
test('spec derive produces correct ID convention', () => {
  const { path, cleanup } = createTempSpec({
    meta: { name: 'test', goal: 'test goal', created_at: new Date().toISOString() },
    tasks: [
      { id: 'T2', action: 'some planned task', type: 'work', status: 'pending' },
    ],
  });

  try {
    const { stdout, status } = runCli([
      'spec', 'derive',
      '--parent', 'T2',
      '--source', 'final_verify',
      '--trigger', 'retry',
      '--action', 'Re-run failed steps',
      '--reason', 'Test suite failed',
      path,
    ]);
    assert.equal(status, 0, 'exit code should be 0');
    const result = JSON.parse(stdout);
    // Expected ID: T2.retry-1
    assert.equal(result.created, 'T2.retry-1', `derived ID should be T2.retry-1, got: ${result.created}`);
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 7: spec status shows correct planned/derived/done counts
// ============================================================
test('spec status shows correct planned/derived/done counts', () => {
  const { path, cleanup } = createTempSpec({
    meta: { name: 'test', goal: 'test goal', created_at: new Date().toISOString() },
    tasks: [
      { id: 'T1', action: 'planned done', type: 'work', status: 'done', completed_at: new Date().toISOString() },
      { id: 'T2', action: 'planned pending', type: 'work', status: 'pending' },
      {
        id: 'T1.retry-1',
        action: 'derived task',
        type: 'work',
        status: 'pending',
        origin: 'derived',
        depends_on: ['T1'],
        derived_from: {
          parent: 'T1',
          trigger: 'retry',
          source: 'test_runner',
          reason: 'tests failed',
        },
      },
    ],
  });

  try {
    const { stdout } = runCli(['spec', 'status', path], { expectFail: true });
    const result = JSON.parse(stdout);
    assert.equal(result.done, 1, 'done count should be 1');
    assert.equal(result.pending, 2, 'pending count should be 2 (T2 + derived)');
    assert.equal(result.planned.total, 2, 'planned total should be 2');
    assert.equal(result.planned.done, 1, 'planned done should be 1');
    assert.equal(result.derived.total, 1, 'derived total should be 1');
    assert.equal(result.derived.done, 0, 'derived done should be 0');
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 8: spec requirement --status aggregates scenario status
// ============================================================
test('spec requirement --status aggregates scenario status correctly', () => {
  const { path, cleanup } = createTempSpec({
    meta: { name: 'test', goal: 'test goal', created_at: new Date().toISOString() },
    tasks: [{ id: 'T1', action: 'task', type: 'work', status: 'pending' }],
    requirements: [
      {
        id: 'R1',
        behavior: 'auth handling',
        priority: 1,
        scenarios: [
          {
            id: 'R1-S1',
            given: 'user is logged in',
            when: 'auth check runs',
            then: 'passes',
            verified_by: 'machine',
            status: 'pass',
            verified_by_task: 'T1',
            verify: { type: 'command', run: 'test', expect: { exit_code: 0 } },
          },
          {
            id: 'R1-S2',
            given: 'user is not logged in',
            when: 'auth check runs',
            then: 'fails',
            verified_by: 'agent',
            verify: { type: 'assertion', checks: ['returns 401'] },
          },
          {
            id: 'R1-S3',
            given: 'token is expired',
            when: 'auth check runs',
            then: 'fails with expiry message',
            verified_by: 'human',
            verify: { type: 'instruction', ask: 'Check the UI shows expiry message' },
          },
        ],
      },
    ],
  });

  try {
    const { stdout, status } = runCli(['spec', 'requirement', '--status', path, '--json']);
    assert.equal(status, 0, 'exit code should be 0');
    const result = JSON.parse(stdout);
    assert.ok(Array.isArray(result.requirements), 'result should have requirements array');
    assert.ok(result.summary !== undefined, 'result should have summary');
    assert.equal(result.summary.pass, 1, 'summary.pass should be 1');
    assert.equal(result.summary.pending, 2, 'summary.pending should be 2');
    assert.equal(result.summary.fail, 0, 'summary.fail should be 0');
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 9: v4 spec processed through v5 pipeline (validate works on v4 input)
// ============================================================
test('v4 spec validates successfully using v4 schema path', () => {
  const { path, cleanup } = createTempSpec({
    meta: {
      name: 'legacy-project',
      goal: 'Test v4 backward compat',
      schema_version: 'v4',
      created_at: '2025-01-01T00:00:00.000Z',
    },
    tasks: [
      {
        id: 'T1',
        action: 'some legacy task',
        type: 'work',
        status: 'pending',
      },
    ],
  });

  try {
    const { stdout, status } = runCli(['spec', 'validate', path]);
    assert.equal(status, 0, 'v4 spec should validate successfully (exit 0)');
    const result = JSON.parse(stdout);
    assert.equal(result.valid, true, 'result.valid should be true');
    assert.deepEqual(result.errors, [], 'result.errors should be empty');
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 10: validation failure produces guide hint messages
// ============================================================
test('validation failure produces guide hint messages on stderr', () => {
  // Use a spec with an invalid task status enum to trigger validation failure
  const { path, cleanup } = createTempSpec({
    meta: { name: 'test', goal: 'test goal' },
    tasks: [
      {
        id: 'T1',
        action: 'some task',
        type: 'work',
        status: 'INVALID_STATUS_NOT_VALID',
      },
    ],
  });

  try {
    const { stderr, status } = runCli(['spec', 'validate', path], { expectFail: true });
    assert.notEqual(status, 0, 'exit code should be non-zero on validation failure');
    assert.ok(
      stderr.includes('Validation failed'),
      `stderr should include "Validation failed", got: ${stderr}`,
    );
    assert.ok(
      stderr.includes('hoyeon-cli spec guide'),
      `stderr should include guide hint, got: ${stderr}`,
    );
  } finally {
    cleanup();
  }
});
