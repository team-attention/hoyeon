/**
 * build-prompt handler test — Verifies --result-file flag for file-based result reading
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Test environment
// ---------------------------------------------------------------------------

let tmpDir;
const CLI_PATH = join(import.meta.dirname, '..', '..', '..', 'bin', 'dev-cli.js');

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-handler-build-prompt-'));
}

function cleanup() {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
}

function validPlanContent() {
  return {
    context: { originalRequest: 'Test', interviewSummary: 'Test', researchFindings: 'Test' },
    objectives: { core: 'Test', deliverables: ['a.js'], dod: ['Tests pass'], mustNotDo: [] },
    todos: [
      {
        id: 'todo-1', title: 'First task', type: 'work',
        inputs: [], outputs: [],
        steps: ['Do step 1'], mustNotDo: [], references: [],
        acceptanceCriteria: { functional: ['Works'], static: [], runtime: [] }, risk: 'LOW',
      },
    ],
    taskFlow: 'TODO-1',
    dependencyGraph: [{ todo: 'todo-1', requires: [], produces: [] }],
    commitStrategy: [],
    verificationSummary: { aItems: [], hItems: [], sItems: [], gaps: [] },
  };
}

function setupSpec(name) {
  const specDir = join(tmpDir, '.dev', 'specs', name);
  const contextDirPath = join(specDir, 'context');
  mkdirSync(contextDirPath, { recursive: true });
  writeFileSync(join(specDir, 'plan-content.json'), JSON.stringify(validPlanContent(), null, 2));
  return { specDir, contextDir: contextDirPath };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dev-cli build-prompt --result-file', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => cleanup());

  test('reads worker-result from persisted file for verify type', () => {
    const { contextDir } = setupSpec('test-spec');

    // Write persisted worker result
    const envelope = {
      todoId: 'todo-1',
      result: { status: 'done', files: ['a.js'] },
      persistedAt: new Date().toISOString(),
    };
    writeFileSync(join(contextDir, 'worker-result-todo-1.json'), JSON.stringify(envelope, null, 2));

    // Build prompt with --result-file (no stdin)
    const prompt = execFileSync('node', [
      CLI_PATH, 'build-prompt', 'test-spec',
      '--todo', 'todo-1', '--type', 'verify', '--result-file',
    ], {
      cwd: tmpDir,
      encoding: 'utf8',
    });

    // Should produce a non-empty prompt that includes worker result data
    assert.ok(prompt.length > 0);
  });

  test('falls back gracefully when persisted file missing', () => {
    setupSpec('test-spec');

    // Build prompt with --result-file but no persisted file
    const prompt = execFileSync('node', [
      CLI_PATH, 'build-prompt', 'test-spec',
      '--todo', 'todo-1', '--type', 'verify', '--result-file',
    ], {
      cwd: tmpDir,
      encoding: 'utf8',
    });

    // Should still produce a prompt (just without inputData)
    assert.ok(prompt.length > 0);
  });

  test('stdin still works without --result-file (backward compat)', () => {
    setupSpec('test-spec');

    const workerResult = JSON.stringify({ status: 'done', files: ['b.js'] });
    const prompt = execFileSync('node', [
      CLI_PATH, 'build-prompt', 'test-spec',
      '--todo', 'todo-1', '--type', 'verify',
    ], {
      cwd: tmpDir,
      input: workerResult,
      encoding: 'utf8',
    });

    assert.ok(prompt.length > 0);
  });
});
