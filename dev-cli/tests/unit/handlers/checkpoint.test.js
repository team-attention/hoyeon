/**
 * checkpoint handler test — Verifies CLI interface for checkpoint
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Test environment
// ---------------------------------------------------------------------------

let tmpDir;
const CLI_PATH = join(import.meta.dirname, '..', '..', '..', 'bin', 'dev-cli.js');

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-handler-checkpoint-'));
}

function cleanup() {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
}

function setupSpec(name, planMd) {
  const specDir = join(tmpDir, '.dev', 'specs', name);
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'PLAN.md'), planMd);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dev-cli checkpoint handler', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => cleanup());

  test('marks TODO checkbox as checked', () => {
    const planMd = `# Plan\n\n### [ ] TODO 1: Create parser\n\nContent\n\n### [ ] TODO 2: Create formatter\n`;
    setupSpec('test-spec', planMd);

    const result = execFileSync('node', [CLI_PATH, 'checkpoint', 'test-spec', '--todo', 'todo-1'], {
      cwd: tmpDir,
      encoding: 'utf8',
    });

    const parsed = JSON.parse(result);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.marked, true);

    const updated = readFileSync(join(tmpDir, '.dev', 'specs', 'test-spec', 'PLAN.md'), 'utf8');
    assert.ok(updated.includes('### [x] TODO 1:'));
    assert.ok(updated.includes('### [ ] TODO 2:'));
  });

  test('reports already checked', () => {
    const planMd = `### [x] TODO 1: Create parser\n`;
    setupSpec('test-spec', planMd);

    const result = execFileSync('node', [CLI_PATH, 'checkpoint', 'test-spec', '--todo', 'todo-1'], {
      cwd: tmpDir,
      encoding: 'utf8',
    });

    const parsed = JSON.parse(result);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.marked, false);
  });

  test('works with quick mode flag', () => {
    const planMd = `### [ ] TODO 1: First\n`;
    setupSpec('test-spec', planMd);

    const result = execFileSync('node', [CLI_PATH, 'checkpoint', 'test-spec', '--todo', 'todo-1', '--mode', 'quick'], {
      cwd: tmpDir,
      encoding: 'utf8',
    });

    const parsed = JSON.parse(result);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.marked, true);
  });
});
