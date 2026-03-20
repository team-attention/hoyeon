/**
 * History entry schema + CLI integration tests.
 *
 * Run: node --test cli/tests/history.test.mjs
 *
 * Since v1.3.0, history is written to context/history.json (not spec.json).
 * These tests verify:
 *  1. historyEntry schema definition validates correct entries
 *  2. scenario_verified entry with scenario/status fields passes
 *  3. Invalid history type is rejected by historyEntry schema
 *  4. Unknown fields on history entry are rejected (additionalProperties)
 *  5. Missing required fields (ts, type) are rejected
 *  6. CLI `spec task --status done` writes history to context/history.json
 *  7. CLI `spec requirement <id> --status` writes history to context/history.json
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTempSpec, runCli } from './helpers.js';
import { readFileSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const require = createRequire(import.meta.url);
const v5Schema = require(join(__dirname, '../schemas/dev-spec-v5.schema.json'));

const { default: Ajv2020 } = await import('ajv/dist/2020.js');
const { default: addFormats } = await import('ajv-formats');

// Build a validator for just the historyEntry definition
function buildHistoryEntryValidator() {
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  // Extract historyEntry from $defs and compile as standalone schema
  const entrySchema = {
    ...v5Schema.$defs.historyEntry,
    $defs: v5Schema.$defs,
  };
  return ajv.compile(entrySchema);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: all valid history type enum values pass
// ─────────────────────────────────────────────────────────────────────────────
test('all valid history type enum values pass historyEntry validation', () => {
  const types = ['spec_created', 'task_start', 'task_done', 'tasks_changed', 'spec_updated', 'scenario_verified'];
  const validate = buildHistoryEntryValidator();

  for (const t of types) {
    const entry = { ts: '2026-01-01T00:00:00Z', type: t };
    const valid = validate(entry);
    assert.equal(valid, true, `type '${t}' should be valid, errors: ${JSON.stringify(validate.errors)}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: scenario_verified with scenario/status fields passes
// ─────────────────────────────────────────────────────────────────────────────
test('scenario_verified entry with scenario and status fields passes', () => {
  const entry = {
    ts: '2026-01-01T00:00:00Z',
    type: 'scenario_verified',
    scenario: 'R1-S1',
    status: 'pass',
    task: 'T1',
  };
  const validate = buildHistoryEntryValidator();
  const valid = validate(entry);
  assert.equal(valid, true, `Errors: ${JSON.stringify(validate.errors)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: invalid history type is rejected
// ─────────────────────────────────────────────────────────────────────────────
test('invalid history type enum value is rejected', () => {
  const entry = { ts: '2026-01-01T00:00:00Z', type: 'invalid_type' };
  const validate = buildHistoryEntryValidator();
  const valid = validate(entry);
  assert.equal(valid, false, 'Expected invalid type to fail');
  const hasEnumError = validate.errors.some(
    (e) => e.instancePath === '/type' && e.keyword === 'enum'
  );
  assert.ok(hasEnumError, `Expected enum error, got: ${JSON.stringify(validate.errors)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: unknown fields on history entry are rejected
// ─────────────────────────────────────────────────────────────────────────────
test('unknown fields on history entry are rejected', () => {
  const entry = { ts: '2026-01-01T00:00:00Z', type: 'spec_updated', foo: 'bar' };
  const validate = buildHistoryEntryValidator();
  const valid = validate(entry);
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
  const validate = buildHistoryEntryValidator();

  // missing ts
  assert.equal(validate({ type: 'spec_created' }), false, 'Missing ts should fail');

  // missing type
  assert.equal(validate({ ts: '2026-01-01T00:00:00Z' }), false, 'Missing type should fail');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: CLI `spec task --status done` writes history to context/history.json
// ─────────────────────────────────────────────────────────────────────────────
test('CLI spec task --status done writes task_done to context/history.json', () => {
  const spec = {
    meta: { name: 'test', goal: 'Test goal', schema_version: 'v5' },
    tasks: [{ id: 'T1', action: 'Do something', type: 'work', status: 'in_progress' }],
  };
  const { path, cleanup, dir } = createTempSpec(spec);

  try {
    const result = runCli(['spec', 'task', 'T1', '--status', 'done', '--summary', 'Completed task', path]);
    assert.equal(result.status, 0, `CLI failed: ${result.stderr}`);

    // History should be in context/history.json, not in spec.json
    const historyPath = join(dir, 'context', 'history.json');
    assert.ok(existsSync(historyPath), 'context/history.json should exist');

    const history = JSON.parse(readFileSync(historyPath, 'utf8'));
    const lastEntry = history[history.length - 1];
    assert.equal(lastEntry.type, 'task_done');
    assert.equal(lastEntry.task, 'T1');
    assert.equal(lastEntry.summary, 'Completed task');
    assert.ok(lastEntry.ts, 'ts should be present');

    // spec.json should NOT have history field
    const updated = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(updated.history, undefined, 'spec.json should not have history field');
  } finally {
    cleanup();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: CLI `spec requirement <id> --status` writes history to context/history.json
// ─────────────────────────────────────────────────────────────────────────────
test('CLI spec requirement --status writes scenario_verified to context/history.json', () => {
  const spec = {
    meta: { name: 'test', goal: 'Test goal', schema_version: 'v5' },
    tasks: [{ id: 'T1', action: 'Do something', type: 'work' }],
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
  };
  const { path, cleanup, dir } = createTempSpec(spec);

  try {
    const result = runCli(['spec', 'requirement', 'R1-S1', '--status', 'pass', '--task', 'T1', path]);
    assert.equal(result.status, 0, `CLI failed: ${result.stderr}`);

    const historyPath = join(dir, 'context', 'history.json');
    assert.ok(existsSync(historyPath), 'context/history.json should exist');

    const history = JSON.parse(readFileSync(historyPath, 'utf8'));
    const lastEntry = history[history.length - 1];
    assert.equal(lastEntry.type, 'scenario_verified');
    assert.equal(lastEntry.scenario, 'R1-S1');
    assert.equal(lastEntry.status, 'pass');
    assert.equal(lastEntry.task, 'T1');
    assert.ok(lastEntry.ts, 'ts should be present');
  } finally {
    cleanup();
  }
});
