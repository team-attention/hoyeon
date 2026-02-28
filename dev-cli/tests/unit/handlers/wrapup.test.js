/**
 * wrapup handler test — Verifies CLI interface for wrapup
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Test environment
// ---------------------------------------------------------------------------

let tmpDir;
const CLI_PATH = join(import.meta.dirname, '..', '..', '..', 'bin', 'dev-cli.js');

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-handler-wrapup-'));
}

function cleanup() {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
}

function setupSpec(name) {
  const specDir = join(tmpDir, '.dev', 'specs', name);
  mkdirSync(specDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dev-cli wrapup handler', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => cleanup());

  test('writes outputs to context/outputs.json', () => {
    setupSpec('test-spec');

    const input = JSON.stringify({ outputs: { file: 'a.js' } });
    execFileSync('node', [CLI_PATH, 'wrapup', 'test-spec', '--todo', 'todo-1'], {
      cwd: tmpDir,
      input,
      encoding: 'utf8',
    });

    const outputsPath = join(tmpDir, '.dev', 'specs', 'test-spec', 'context', 'outputs.json');
    const outputs = JSON.parse(readFileSync(outputsPath, 'utf8'));
    assert.deepEqual(outputs['todo-1'], { file: 'a.js' });
  });

  test('appends learnings to context/learnings.md', () => {
    setupSpec('test-spec');

    const input = JSON.stringify({ learnings: 'Learned something useful' });
    execFileSync('node', [CLI_PATH, 'wrapup', 'test-spec', '--todo', 'todo-1'], {
      cwd: tmpDir,
      input,
      encoding: 'utf8',
    });

    const learningsPath = join(tmpDir, '.dev', 'specs', 'test-spec', 'context', 'learnings.md');
    const learnings = readFileSync(learningsPath, 'utf8');
    assert.ok(learnings.includes('Learned something useful'));
    assert.ok(learnings.includes('TODO todo-1'));
  });

  test('returns JSON ok response', () => {
    setupSpec('test-spec');

    const input = JSON.stringify({ outputs: { x: 1 } });
    const result = execFileSync('node', [CLI_PATH, 'wrapup', 'test-spec', '--todo', 'todo-1'], {
      cwd: tmpDir,
      input,
      encoding: 'utf8',
    });

    const parsed = JSON.parse(result);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.todoId, 'todo-1');
  });
});
