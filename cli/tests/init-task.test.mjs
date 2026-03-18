/**
 * Integration tests for hoyeon-cli spec init and spec task subcommands.
 *
 * Run: node --test cli/tests/init-task.test.mjs
 *
 * Tests:
 *  1. spec init creates a valid spec.json with correct defaults
 *  2. spec init sets name and goal correctly in the output file
 *  3. spec init with --depth quick sets depth in meta.mode
 *  4. spec task --get retrieves task by ID as JSON
 *  5. spec task --status updates task status and persists to file
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTempSpec, runCli } from './helpers.js';

// ============================================================
// Test 1: spec init creates a valid spec.json with correct defaults
// ============================================================
test('spec init creates a valid spec.json with correct defaults', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hoyeon-cli-init-test-'));
  const specPath = join(tmpDir, 'spec.json');

  try {
    const { stdout, status } = runCli([
      'spec', 'init', 'test-project',
      '--goal', 'Test goal for init',
      '--type', 'dev',
      specPath,
    ]);

    assert.equal(status, 0, `exit code should be 0, got: ${status}`);
    assert.ok(stdout.includes('Spec created:'), 'stdout should confirm spec created');

    const specData = JSON.parse(readFileSync(specPath, 'utf8'));
    assert.ok(specData.meta, 'spec should have meta field');
    assert.equal(specData.meta.name, 'test-project', 'meta.name should match');
    assert.equal(specData.meta.goal, 'Test goal for init', 'meta.goal should match');
    assert.equal(specData.meta.type, 'dev', 'meta.type should be dev');
    assert.ok(specData.meta.created_at, 'meta.created_at should be set');
    assert.ok(Array.isArray(specData.tasks), 'spec should have tasks array');
    assert.ok(specData.tasks.length > 0, 'spec should have at least one task');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ============================================================
// Test 2: spec init sets name and goal correctly in the output file
// ============================================================
test('spec init sets name and goal correctly in the output file', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hoyeon-cli-init-test-'));
  const specPath = join(tmpDir, 'spec.json');

  try {
    const { status } = runCli([
      'spec', 'init', 'my-api-project',
      '--goal', 'Add REST API endpoints',
      specPath,
    ]);

    assert.equal(status, 0, 'exit code should be 0');

    const specData = JSON.parse(readFileSync(specPath, 'utf8'));
    assert.equal(specData.meta.name, 'my-api-project', 'name should be my-api-project');
    assert.equal(specData.meta.goal, 'Add REST API endpoints', 'goal should match');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ============================================================
// Test 3: spec init with --depth quick sets depth in meta.mode
// ============================================================
test('spec init with --depth quick sets depth in meta.mode', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hoyeon-cli-init-test-'));
  const specPath = join(tmpDir, 'spec.json');

  try {
    const { status } = runCli([
      'spec', 'init', 'quick-project',
      '--goal', 'Quick spec test',
      '--depth', 'quick',
      specPath,
    ]);

    assert.equal(status, 0, 'exit code should be 0');

    const specData = JSON.parse(readFileSync(specPath, 'utf8'));
    assert.ok(specData.meta.mode, 'meta.mode should be set when --depth is given');
    assert.equal(specData.meta.mode.depth, 'quick', 'meta.mode.depth should be "quick"');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ============================================================
// Test 4: spec task --get retrieves task by ID as JSON
// ============================================================
test('spec task --get retrieves task by ID as JSON', () => {
  const { path, cleanup } = createTempSpec({
    meta: { name: 'test', goal: 'test goal', created_at: new Date().toISOString() },
    tasks: [
      {
        id: 'T1',
        action: 'Write unit tests',
        type: 'work',
        status: 'pending',
      },
      {
        id: 'T2',
        action: 'Deploy to staging',
        type: 'work',
        status: 'pending',
        depends_on: ['T1'],
      },
    ],
  });

  try {
    const { stdout, status } = runCli(['spec', 'task', 'T1', '--get', path]);
    assert.equal(status, 0, `exit code should be 0, got: ${status}`);

    const task = JSON.parse(stdout);
    assert.equal(task.id, 'T1', 'retrieved task id should be T1');
    assert.equal(task.action, 'Write unit tests', 'retrieved task action should match');
    assert.equal(task.status, 'pending', 'retrieved task status should be pending');
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 5: spec task --status updates task status and persists to file
// ============================================================
test('spec task --status updates task status and persists to file', () => {
  const { path, cleanup } = createTempSpec({
    meta: { name: 'test', goal: 'test goal', created_at: new Date().toISOString() },
    tasks: [
      {
        id: 'T1',
        action: 'Implement feature',
        type: 'work',
        status: 'pending',
      },
    ],
  });

  try {
    const { stdout, status } = runCli(['spec', 'task', 'T1', '--status', 'done', path]);
    assert.equal(status, 0, `exit code should be 0 after status update, got: ${status}`);
    assert.ok(
      stdout.includes("Updated task 'T1' status to 'done'"),
      `stdout should confirm update, got: ${stdout}`,
    );

    // Read file back and verify persisted status
    const updatedSpec = JSON.parse(readFileSync(path, 'utf8'));
    const updatedTask = updatedSpec.tasks.find(t => t.id === 'T1');
    assert.ok(updatedTask, 'task T1 should still exist in spec');
    assert.equal(updatedTask.status, 'done', 'task status should be "done" after update');
    assert.ok(updatedTask.completed_at, 'completed_at should be set when status is done');
  } finally {
    cleanup();
  }
});
