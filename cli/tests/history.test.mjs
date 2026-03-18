/**
 * History entry schema + CLI integration tests.
 *
 * Run: node --test cli/tests/history.test.mjs
 *
 * Covers:
 *  1. All valid history type enum values pass validation
 *  2. scenario_verified entry with scenario/status fields passes
 *  3. Invalid history type is rejected
 *  4. Unknown fields on history entry are rejected (additionalProperties)
 *  5. Missing required fields (ts, type) are rejected
 *  6. CLI `spec task --status done` writes valid task_done history entry
 *  7. CLI `spec scenario verify` writes valid scenario_verified history entry
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTempSpec, runCli } from './helpers.js';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const require = createRequire(import.meta.url);
const v5Schema = require(join(__dirname, '../schemas/dev-spec-v5.schema.json'));

const { default: Ajv2020 } = await import('ajv/dist/2020.js');
const { default: addFormats } = await import('ajv-formats');

function buildValidator(schema) {
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

function makeSpec(overrides = {}) {
  return {
    meta: { name: 'test', goal: 'Test goal', schema_version: 'v5' },
    tasks: [{ id: 'T1', action: 'Do something', type: 'work' }],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: all valid history type enum values pass
// ─────────────────────────────────────────────────────────────────────────────
test('all valid history type enum values pass validation', () => {
  const types = ['spec_created', 'task_start', 'task_done', 'tasks_changed', 'spec_updated', 'scenario_verified'];
  const validate = buildValidator(v5Schema);

  for (const t of types) {
    const spec = makeSpec({
      history: [{ ts: '2026-01-01T00:00:00Z', type: t }],
    });
    const valid = validate(spec);
    assert.equal(valid, true, `type '${t}' should be valid, errors: ${JSON.stringify(validate.errors)}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: scenario_verified with scenario/status fields passes
// ─────────────────────────────────────────────────────────────────────────────
test('scenario_verified entry with scenario and status fields passes', () => {
  const spec = makeSpec({
    history: [
      {
        ts: '2026-01-01T00:00:00Z',
        type: 'scenario_verified',
        scenario: 'R1-S1',
        status: 'pass',
        task: 'T1',
      },
    ],
  });
  const validate = buildValidator(v5Schema);
  const valid = validate(spec);
  assert.equal(valid, true, `Errors: ${JSON.stringify(validate.errors)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: invalid history type is rejected
// ─────────────────────────────────────────────────────────────────────────────
test('invalid history type enum value is rejected', () => {
  const spec = makeSpec({
    history: [{ ts: '2026-01-01T00:00:00Z', type: 'invalid_type' }],
  });
  const validate = buildValidator(v5Schema);
  const valid = validate(spec);
  assert.equal(valid, false, 'Expected invalid type to fail');
  const hasEnumError = validate.errors.some(
    (e) => e.instancePath === '/history/0/type' && e.keyword === 'enum'
  );
  assert.ok(hasEnumError, `Expected enum error, got: ${JSON.stringify(validate.errors)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: unknown fields on history entry are rejected
// ─────────────────────────────────────────────────────────────────────────────
test('unknown fields on history entry are rejected', () => {
  const spec = makeSpec({
    history: [{ ts: '2026-01-01T00:00:00Z', type: 'spec_updated', foo: 'bar' }],
  });
  const validate = buildValidator(v5Schema);
  const valid = validate(spec);
  assert.equal(valid, false, 'Expected unknown field to fail');
  const hasAdditionalPropError = validate.errors.some(
    (e) => e.keyword === 'additionalProperties' && e.params?.additionalProperty === 'foo'
  );
  assert.ok(hasAdditionalPropError, `Expected additionalProperties error, got: ${JSON.stringify(validate.errors)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: missing required fields (ts, type) are rejected
// ─────────────────────────────────────────────────────────────────────────────
test('history entry missing ts or type is rejected', () => {
  const validate = buildValidator(v5Schema);

  // missing ts
  const spec1 = makeSpec({ history: [{ type: 'spec_created' }] });
  assert.equal(validate(spec1), false, 'Missing ts should fail');

  // missing type
  const spec2 = makeSpec({ history: [{ ts: '2026-01-01T00:00:00Z' }] });
  assert.equal(validate(spec2), false, 'Missing type should fail');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: CLI `spec task --status done` writes valid task_done history entry
// ─────────────────────────────────────────────────────────────────────────────
test('CLI spec task --status done writes task_done history entry', () => {
  const spec = makeSpec({
    tasks: [{ id: 'T1', action: 'Do something', type: 'work', status: 'in_progress' }],
    history: [{ ts: '2026-01-01T00:00:00Z', type: 'spec_created' }],
  });
  const { path, cleanup } = createTempSpec(spec);

  try {
    const result = runCli(['spec', 'task', 'T1', '--status', 'done', '--summary', 'Completed task', path]);
    assert.equal(result.status, 0, `CLI failed: ${result.stderr}`);

    const updated = JSON.parse(readFileSync(path, 'utf8'));
    const lastEntry = updated.history[updated.history.length - 1];
    assert.equal(lastEntry.type, 'task_done');
    assert.equal(lastEntry.task, 'T1');
    assert.equal(lastEntry.summary, 'Completed task');
    assert.ok(lastEntry.ts, 'ts should be present');

    // validate the entire spec still passes schema
    const validate = buildValidator(v5Schema);
    assert.equal(validate(updated), true, `Schema invalid after CLI: ${JSON.stringify(validate.errors)}`);
  } finally {
    cleanup();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: CLI `spec requirement <id> --status` writes valid scenario_verified history
// ─────────────────────────────────────────────────────────────────────────────
test('CLI spec requirement --status writes valid scenario_verified history entry', () => {
  const spec = makeSpec({
    requirements: [
      {
        id: 'R1',
        behavior: 'Some behavior',
        priority: 1,
        scenarios: [
          {
            id: 'R1-S1',
            given: 'initial state',
            when: 'action happens',
            then: 'expected result',
            verified_by: 'machine',
            verify: { type: 'command', run: 'echo ok', expect: { exit_code: 0 } },
          },
        ],
      },
    ],
    history: [{ ts: '2026-01-01T00:00:00Z', type: 'spec_created' }],
  });
  const { path, cleanup } = createTempSpec(spec);

  try {
    const result = runCli(['spec', 'requirement', 'R1-S1', '--status', 'pass', '--task', 'T1', path]);
    assert.equal(result.status, 0, `CLI failed: ${result.stderr}`);

    const updated = JSON.parse(readFileSync(path, 'utf8'));
    const lastEntry = updated.history[updated.history.length - 1];
    assert.equal(lastEntry.type, 'scenario_verified');
    assert.equal(lastEntry.scenario, 'R1-S1');
    assert.equal(lastEntry.status, 'pass');
    assert.equal(lastEntry.task, 'T1');
    assert.ok(lastEntry.ts, 'ts should be present');

    // validate entire spec
    const validate = buildValidator(v5Schema);
    assert.equal(validate(updated), true, `Schema invalid after CLI: ${JSON.stringify(validate.errors)}`);
  } finally {
    cleanup();
  }
});
