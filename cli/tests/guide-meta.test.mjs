/**
 * Integration tests for hoyeon-cli spec guide and spec meta subcommands.
 *
 * Run: node --test cli/tests/guide-meta.test.mjs
 *
 * Tests:
 *  1. spec guide requirements shows field documentation with required fields
 *  2. spec guide merge shows merge mode documentation
 *  3. spec meta shows spec metadata as JSON
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTempSpec, runCli } from './helpers.js';

// ============================================================
// Test 1: spec guide requirements shows field documentation with required fields
// ============================================================
test('spec guide requirements shows field documentation', () => {
  const { stdout, status } = runCli(['spec', 'guide', 'requirements']);

  assert.equal(status, 0, `exit code should be 0, got: ${status}`);
  assert.ok(
    stdout.includes('requirements'),
    `stdout should mention "requirements", got: ${stdout}`,
  );
  assert.ok(
    stdout.includes('id'),
    `stdout should show "id" field, got: ${stdout}`,
  );
  assert.ok(
    stdout.includes('behavior'),
    `stdout should show "behavior" field, got: ${stdout}`,
  );
  assert.ok(
    stdout.includes('priority'),
    `stdout should show "priority" field, got: ${stdout}`,
  );
  assert.ok(
    stdout.includes('scenarios'),
    `stdout should show "scenarios" field, got: ${stdout}`,
  );
});

// ============================================================
// Test 2: spec guide merge shows merge mode documentation
// ============================================================
test('spec guide merge shows merge mode documentation', () => {
  const { stdout, status } = runCli(['spec', 'guide', 'merge']);

  assert.equal(status, 0, `exit code should be 0, got: ${status}`);
  assert.ok(
    stdout.includes('--append'),
    `stdout should mention "--append" mode, got: ${stdout}`,
  );
  assert.ok(
    stdout.includes('--patch'),
    `stdout should mention "--patch" mode, got: ${stdout}`,
  );
  assert.ok(
    stdout.includes('replace'),
    `stdout should mention "replace" (default) mode, got: ${stdout}`,
  );
});

// ============================================================
// Test 3: spec meta shows spec metadata as JSON
// ============================================================
test('spec meta shows spec metadata', () => {
  const { path, cleanup } = createTempSpec({
    meta: {
      name: 'my-test-spec',
      goal: 'Verify meta command output',
      type: 'dev',
      schema_version: 'v5',
      created_at: '2026-01-01T00:00:00.000Z',
    },
    tasks: [
      { id: 'T1', action: 'placeholder task', type: 'work', status: 'pending' },
    ],
  });

  try {
    const { stdout, status } = runCli(['spec', 'meta', path]);
    assert.equal(status, 0, `exit code should be 0, got: ${status}`);

    const meta = JSON.parse(stdout);
    assert.equal(meta.name, 'my-test-spec', 'meta.name should match');
    assert.equal(meta.goal, 'Verify meta command output', 'meta.goal should match');
    assert.equal(meta.type, 'dev', 'meta.type should be dev');
    assert.equal(meta.schema_version, 'v5', 'meta.schema_version should be v5');
  } finally {
    cleanup();
  }
});
