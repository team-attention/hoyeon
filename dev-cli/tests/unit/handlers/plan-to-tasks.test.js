/**
 * plan-to-tasks handler test — Verifies CLI interface for plan-to-tasks
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
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-handler-plan-to-tasks-'));
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
        inputs: [], outputs: [{ name: 'out', type: 'file', value: 'a.js', description: 'Output' }],
        steps: ['Do step 1'], mustNotDo: [], references: [],
        acceptanceCriteria: { functional: ['Works'], static: [], runtime: [] }, risk: 'LOW',
      },
    ],
    taskFlow: 'TODO-1',
    dependencyGraph: [{ todo: 'todo-1', requires: [], produces: ['out'] }],
    commitStrategy: [{ afterTodo: 'todo-1', message: 'feat: first', files: ['a.js'], condition: 'always' }],
    verificationSummary: { aItems: [], hItems: [], sItems: [], gaps: [] },
  };
}

function setupSpec(name) {
  const specDir = join(tmpDir, '.dev', 'specs', name);
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'plan-content.json'), JSON.stringify(validPlanContent(), null, 2));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dev-cli plan-to-tasks handler', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => cleanup());

  test('outputs valid JSON with tasks array (standard)', () => {
    setupSpec('test-spec');

    const result = execFileSync('node', [CLI_PATH, 'plan-to-tasks', 'test-spec', '--mode', 'standard'], {
      cwd: tmpDir,
      encoding: 'utf8',
    });

    const parsed = JSON.parse(result);
    assert.ok(Array.isArray(parsed.tasks));
    assert.ok(Array.isArray(parsed.dependencies));
    // 1 TODO × 4 substeps + 5 finalize = 9
    assert.equal(parsed.tasks.length, 9);
  });

  test('outputs valid JSON with tasks array (quick)', () => {
    setupSpec('test-spec');

    const result = execFileSync('node', [CLI_PATH, 'plan-to-tasks', 'test-spec', '--mode', 'quick'], {
      cwd: tmpDir,
      encoding: 'utf8',
    });

    const parsed = JSON.parse(result);
    // 1 TODO × 3 substeps + 3 finalize = 6
    assert.equal(parsed.tasks.length, 6);
  });

  test('defaults to standard mode', () => {
    setupSpec('test-spec');

    const result = execFileSync('node', [CLI_PATH, 'plan-to-tasks', 'test-spec'], {
      cwd: tmpDir,
      encoding: 'utf8',
    });

    const parsed = JSON.parse(result);
    assert.equal(parsed.tasks.length, 9);
  });
});
