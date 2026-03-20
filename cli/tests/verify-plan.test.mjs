/**
 * Tests for buildVerifyPlan functionality via formatSlim output.
 *
 * Run: node --test cli/tests/verify-plan.test.mjs
 *
 * Tests:
 *  1. Machine-verified scenario → verify_plan entry has method="machine", env="host", run/expect fields
 *  2. Agent-verified scenario → verify_plan entry has method="agent", checks field
 *  3. Sandbox scenario → verify_plan entry has env="sandbox", subject and recipe fields
 *  4. Human-verified scenario → verify_plan entry has method="human", action="skip"
 *  5. Task with no scenarios → verify_plan is empty array
 *  6. Task with mixed scenarios → verify_plan has entries of different methods
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTempSpec, runCli } from './helpers.js';

/**
 * Build a minimal valid spec with given requirements and tasks.
 */
function makeSpec({ requirements = [], tasks = [] } = {}) {
  return {
    meta: {
      name: 'verify-plan-test',
      goal: 'Test buildVerifyPlan via formatSlim',
      schema_version: 'v5',
    },
    requirements,
    tasks,
  };
}

// ============================================================
// Test 1: Machine-verified scenario → method="machine", env="host", run/expect fields
// ============================================================
test('machine-verified scenario produces verify_plan entry with method, env, run, expect', () => {
  const { path, cleanup } = createTempSpec(
    makeSpec({
      requirements: [
        {
          id: 'R1',
          behavior: 'System runs tests',
          priority: 1,
          scenarios: [
            {
              id: 'R1-S1',
              given: 'the code is built',
              when: 'tests are run',
              then: 'all tests pass',
              verified_by: 'machine',
              execution_env: 'host',
              verify: {
                type: 'command',
                run: 'npm test',
                expect: { exit_code: 0 },
              },
            },
          ],
        },
      ],
      tasks: [
        {
          id: 'T1',
          action: 'Implement tests',
          type: 'work',
          status: 'pending',
          acceptance_criteria: {
            scenarios: ['R1-S1'],
            checks: [],
          },
        },
      ],
    }),
  );

  try {
    const { stdout, status } = runCli(['spec', 'plan', path, '--format', 'slim']);
    assert.equal(status, 0, 'exit code should be 0');
    const result = JSON.parse(stdout);

    const t1 = result.rounds[0].tasks.find((t) => t.id === 'T1');
    assert.ok(t1, 'T1 should be present in output');
    assert.ok(Array.isArray(t1.verify_plan), 'verify_plan should be an array');
    assert.equal(t1.verify_plan.length, 1, 'verify_plan should have 1 entry');

    const entry = t1.verify_plan[0];
    assert.equal(entry.scenario, 'R1-S1', 'entry.scenario should be R1-S1');
    assert.equal(entry.method, 'machine', 'entry.method should be machine');
    assert.equal(entry.env, 'host', 'entry.env should be host');
    assert.equal(entry.run, 'npm test', 'entry.run should be the verify.run command');
    assert.deepEqual(entry.expect, { exit_code: 0 }, 'entry.expect should match verify.expect');
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 2: Agent-verified scenario → method="agent", checks field
// ============================================================
test('agent-verified scenario produces verify_plan entry with method="agent" and checks', () => {
  const { path, cleanup } = createTempSpec(
    makeSpec({
      requirements: [
        {
          id: 'R1',
          behavior: 'Agent checks output',
          priority: 1,
          scenarios: [
            {
              id: 'R1-S1',
              given: 'a request is processed',
              when: 'agent verifies output',
              then: 'output contains expected values',
              verified_by: 'agent',
              execution_env: 'host',
              verify: {
                type: 'assertion',
                checks: ['output includes success message', 'no errors in stderr'],
              },
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
            checks: [],
          },
        },
      ],
    }),
  );

  try {
    const { stdout, status } = runCli(['spec', 'plan', path, '--format', 'slim']);
    assert.equal(status, 0, 'exit code should be 0');
    const result = JSON.parse(stdout);

    const t1 = result.rounds[0].tasks.find((t) => t.id === 'T1');
    assert.ok(t1, 'T1 should be present in output');
    assert.equal(t1.verify_plan.length, 1, 'verify_plan should have 1 entry');

    const entry = t1.verify_plan[0];
    assert.equal(entry.method, 'agent', 'entry.method should be agent');
    assert.equal(entry.env, 'host', 'entry.env should be host');
    assert.deepEqual(
      entry.checks,
      ['output includes success message', 'no errors in stderr'],
      'entry.checks should match verify.checks',
    );
    assert.equal(entry.run, undefined, 'entry.run should be undefined for agent scenarios');
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 3: Sandbox scenario → env="sandbox", subject and recipe fields
// ============================================================
test('sandbox scenario produces verify_plan entry with env="sandbox", subject and recipe', () => {
  const { path, cleanup } = createTempSpec(
    makeSpec({
      requirements: [
        {
          id: 'R1',
          behavior: 'System works in sandbox',
          priority: 1,
          scenarios: [
            {
              id: 'R1-S1',
              given: 'a sandbox is running',
              when: 'the feature is exercised',
              then: 'it behaves correctly',
              verified_by: 'agent',
              execution_env: 'sandbox',
              subject: 'docker-compose',
              verify: {
                type: 'sandbox',
                checks: ['container starts', 'health endpoint returns 200'],
              },
            },
          ],
        },
      ],
      tasks: [
        {
          id: 'T1',
          action: 'Configure sandbox',
          type: 'work',
          status: 'pending',
          acceptance_criteria: {
            scenarios: ['R1-S1'],
            checks: [],
          },
        },
      ],
    }),
  );

  try {
    const { stdout, status } = runCli(['spec', 'plan', path, '--format', 'slim']);
    assert.equal(status, 0, 'exit code should be 0');
    const result = JSON.parse(stdout);

    const t1 = result.rounds[0].tasks.find((t) => t.id === 'T1');
    assert.ok(t1, 'T1 should be present in output');
    assert.equal(t1.verify_plan.length, 1, 'verify_plan should have 1 entry');

    const entry = t1.verify_plan[0];
    assert.equal(entry.env, 'sandbox', 'entry.env should be sandbox');
    assert.equal(entry.subject, 'docker-compose', 'entry.subject should match scenario.subject');
    assert.equal(entry.recipe, 'docker-compose.md', 'entry.recipe should be subject + .md');
    // checks field should NOT be present for sandbox (env === 'sandbox' skips checks assignment)
    assert.equal(entry.checks, undefined, 'entry.checks should be undefined for sandbox env');
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 4: Human-verified scenario → method="human", action="skip"
// ============================================================
test('human-verified scenario produces verify_plan entry with method="human" and action="skip"', () => {
  const { path, cleanup } = createTempSpec(
    makeSpec({
      requirements: [
        {
          id: 'R1',
          behavior: 'Human reviews UI',
          priority: 1,
          scenarios: [
            {
              id: 'R1-S1',
              given: 'the UI is rendered',
              when: 'a human reviews it',
              then: 'the design looks correct',
              verified_by: 'human',
              execution_env: 'host',
              verify: {
                type: 'instruction',
                ask: 'Check that the button colors match the design spec',
              },
            },
          ],
        },
      ],
      tasks: [
        {
          id: 'T1',
          action: 'Implement UI component',
          type: 'work',
          status: 'pending',
          acceptance_criteria: {
            scenarios: ['R1-S1'],
            checks: [],
          },
        },
      ],
    }),
  );

  try {
    const { stdout, status } = runCli(['spec', 'plan', path, '--format', 'slim']);
    assert.equal(status, 0, 'exit code should be 0');
    const result = JSON.parse(stdout);

    const t1 = result.rounds[0].tasks.find((t) => t.id === 'T1');
    assert.ok(t1, 'T1 should be present in output');
    assert.equal(t1.verify_plan.length, 1, 'verify_plan should have 1 entry');

    const entry = t1.verify_plan[0];
    assert.equal(entry.method, 'human', 'entry.method should be human');
    assert.equal(entry.action, 'skip', 'entry.action should be skip for human scenarios');
    assert.equal(entry.run, undefined, 'entry.run should be undefined for human scenarios');
    assert.equal(entry.checks, undefined, 'entry.checks should be undefined for human scenarios');
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 5: Task with no scenarios → verify_plan is empty array
// ============================================================
test('task with no scenarios produces empty verify_plan array', () => {
  const { path, cleanup } = createTempSpec(
    makeSpec({
      requirements: [],
      tasks: [
        {
          id: 'T1',
          action: 'Task with no AC scenarios',
          type: 'work',
          status: 'pending',
          acceptance_criteria: {
            scenarios: [],
            checks: [{ type: 'build', run: 'make build' }],
          },
        },
      ],
    }),
  );

  try {
    const { stdout, status } = runCli(['spec', 'plan', path, '--format', 'slim']);
    assert.equal(status, 0, 'exit code should be 0');
    const result = JSON.parse(stdout);

    const t1 = result.rounds[0].tasks.find((t) => t.id === 'T1');
    assert.ok(t1, 'T1 should be present in output');
    assert.ok(Array.isArray(t1.verify_plan), 'verify_plan should be an array');
    assert.equal(t1.verify_plan.length, 0, 'verify_plan should be empty for task with no scenarios');
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 6: Task with mixed scenarios → verify_plan has entries of different methods
// ============================================================
test('task with mixed scenarios produces verify_plan with correct per-method entries', () => {
  const { path, cleanup } = createTempSpec(
    makeSpec({
      requirements: [
        {
          id: 'R1',
          behavior: 'Mixed verification coverage',
          priority: 1,
          scenarios: [
            {
              id: 'R1-S1',
              given: 'the system is running',
              when: 'a machine check runs',
              then: 'exit code is 0',
              verified_by: 'machine',
              execution_env: 'host',
              verify: {
                type: 'command',
                run: 'npm run lint',
                expect: { exit_code: 0 },
              },
            },
            {
              id: 'R1-S2',
              given: 'output is produced',
              when: 'agent inspects it',
              then: 'it has expected structure',
              verified_by: 'agent',
              execution_env: 'host',
              verify: {
                type: 'assertion',
                checks: ['output is JSON', 'contains required fields'],
              },
            },
            {
              id: 'R1-S3',
              given: 'the app is deployed',
              when: 'user inspects visually',
              then: 'looks correct',
              verified_by: 'human',
              execution_env: 'host',
              verify: {
                type: 'instruction',
                ask: 'Review the deployed app visually',
              },
            },
            {
              id: 'R1-S4',
              given: 'sandbox is available',
              when: 'integration test runs',
              then: 'service responds correctly',
              verified_by: 'machine',
              execution_env: 'sandbox',
              subject: 'integration-service',
              verify: {
                type: 'command',
                run: 'curl http://localhost:3000/health',
                expect: { exit_code: 0 },
              },
            },
          ],
        },
      ],
      tasks: [
        {
          id: 'T1',
          action: 'Implement full-stack feature',
          type: 'work',
          status: 'pending',
          acceptance_criteria: {
            scenarios: ['R1-S1', 'R1-S2', 'R1-S3', 'R1-S4'],
            checks: [],
          },
        },
      ],
    }),
  );

  try {
    const { stdout, status } = runCli(['spec', 'plan', path, '--format', 'slim']);
    assert.equal(status, 0, 'exit code should be 0');
    const result = JSON.parse(stdout);

    const t1 = result.rounds[0].tasks.find((t) => t.id === 'T1');
    assert.ok(t1, 'T1 should be present in output');
    assert.ok(Array.isArray(t1.verify_plan), 'verify_plan should be an array');
    assert.equal(t1.verify_plan.length, 4, 'verify_plan should have 4 entries');

    // Check machine/host entry (R1-S1)
    const machineEntry = t1.verify_plan.find((e) => e.scenario === 'R1-S1');
    assert.ok(machineEntry, 'R1-S1 entry should exist');
    assert.equal(machineEntry.method, 'machine', 'R1-S1 method should be machine');
    assert.equal(machineEntry.env, 'host', 'R1-S1 env should be host');
    assert.equal(machineEntry.run, 'npm run lint', 'R1-S1 run should be set');
    assert.deepEqual(machineEntry.expect, { exit_code: 0 }, 'R1-S1 expect should match');

    // Check agent/host entry (R1-S2)
    const agentEntry = t1.verify_plan.find((e) => e.scenario === 'R1-S2');
    assert.ok(agentEntry, 'R1-S2 entry should exist');
    assert.equal(agentEntry.method, 'agent', 'R1-S2 method should be agent');
    assert.equal(agentEntry.env, 'host', 'R1-S2 env should be host');
    assert.deepEqual(
      agentEntry.checks,
      ['output is JSON', 'contains required fields'],
      'R1-S2 checks should match',
    );

    // Check human entry (R1-S3)
    const humanEntry = t1.verify_plan.find((e) => e.scenario === 'R1-S3');
    assert.ok(humanEntry, 'R1-S3 entry should exist');
    assert.equal(humanEntry.method, 'human', 'R1-S3 method should be human');
    assert.equal(humanEntry.action, 'skip', 'R1-S3 action should be skip');

    // Check sandbox entry (R1-S4)
    const sandboxEntry = t1.verify_plan.find((e) => e.scenario === 'R1-S4');
    assert.ok(sandboxEntry, 'R1-S4 entry should exist');
    assert.equal(sandboxEntry.env, 'sandbox', 'R1-S4 env should be sandbox');
    assert.equal(sandboxEntry.subject, 'integration-service', 'R1-S4 subject should be set');
    assert.equal(sandboxEntry.recipe, 'integration-service.md', 'R1-S4 recipe should be subject.md');
  } finally {
    cleanup();
  }
});
