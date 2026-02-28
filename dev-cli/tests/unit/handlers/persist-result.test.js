/**
 * persist-result handler test — Verifies --type flag for worker/verify result persistence
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Test environment
// ---------------------------------------------------------------------------

let tmpDir;
const CLI_PATH = join(import.meta.dirname, '..', '..', '..', 'bin', 'dev-cli.js');

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-handler-persist-'));
}

function cleanup() {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dev-cli persist-result handler', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => cleanup());

  test('default type writes worker-result file', () => {
    const input = JSON.stringify({ status: 'done', files: ['a.js'] });
    const result = execFileSync('node', [CLI_PATH, 'persist-result', 'test-spec', '--todo', 'todo-1'], {
      cwd: tmpDir,
      input,
      encoding: 'utf8',
    });

    const parsed = JSON.parse(result);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.todoId, 'todo-1');
    assert.ok(parsed.path.includes('worker-result-todo-1.json'));

    const filePath = join(tmpDir, '.dev', 'specs', 'test-spec', 'context', 'worker-result-todo-1.json');
    assert.ok(existsSync(filePath));

    const envelope = JSON.parse(readFileSync(filePath, 'utf8'));
    assert.equal(envelope.todoId, 'todo-1');
    assert.deepEqual(envelope.result, { status: 'done', files: ['a.js'] });
    assert.ok(envelope.persistedAt);
  });

  test('--type worker writes worker-result file', () => {
    const input = JSON.stringify({ status: 'done' });
    const result = execFileSync('node', [CLI_PATH, 'persist-result', 'test-spec', '--todo', 'todo-2', '--type', 'worker'], {
      cwd: tmpDir,
      input,
      encoding: 'utf8',
    });

    const parsed = JSON.parse(result);
    assert.ok(parsed.path.includes('worker-result-todo-2.json'));

    const filePath = join(tmpDir, '.dev', 'specs', 'test-spec', 'context', 'worker-result-todo-2.json');
    assert.ok(existsSync(filePath));
  });

  test('--type verify writes verify-result file', () => {
    const input = JSON.stringify({ status: 'VERIFIED', criteria: [] });
    const result = execFileSync('node', [CLI_PATH, 'persist-result', 'test-spec', '--todo', 'todo-1', '--type', 'verify'], {
      cwd: tmpDir,
      input,
      encoding: 'utf8',
    });

    const parsed = JSON.parse(result);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.path.includes('verify-result-todo-1.json'));

    const filePath = join(tmpDir, '.dev', 'specs', 'test-spec', 'context', 'verify-result-todo-1.json');
    assert.ok(existsSync(filePath));

    const envelope = JSON.parse(readFileSync(filePath, 'utf8'));
    assert.equal(envelope.todoId, 'todo-1');
    assert.deepEqual(envelope.result, { status: 'VERIFIED', criteria: [] });
  });
});
