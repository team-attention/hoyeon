/**
 * context-manager.test.js — Unit tests for context-manager module
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  initContext,
  readOutputs,
  writeOutput,
  appendLearning,
  appendIssue,
  appendAudit,
} from '../../../src/engine/context-manager.js';

// ---------------------------------------------------------------------------
// Temp dir management
// ---------------------------------------------------------------------------

let tmpDir;
const originalCwd = process.cwd;

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-ctx-mgr-test-'));
  process.cwd = () => tmpDir;
}

function restoreCwd() {
  process.cwd = originalCwd;
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function contextPath(name, file) {
  return join(tmpDir, '.dev', 'specs', name, 'context', file);
}

// ---------------------------------------------------------------------------
// initContext()
// ---------------------------------------------------------------------------

describe('initContext()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('creates all 4 context files', () => {
    initContext('my-spec');

    assert.ok(existsSync(contextPath('my-spec', 'outputs.json')));
    assert.ok(existsSync(contextPath('my-spec', 'learnings.md')));
    assert.ok(existsSync(contextPath('my-spec', 'issues.md')));
    assert.ok(existsSync(contextPath('my-spec', 'audit.md')));
  });

  test('outputs.json is initialized with empty object', () => {
    initContext('my-spec');
    const content = readFileSync(contextPath('my-spec', 'outputs.json'), 'utf8');
    assert.deepEqual(JSON.parse(content), {});
  });

  test('markdown files are initialized as empty strings', () => {
    initContext('my-spec');
    assert.equal(readFileSync(contextPath('my-spec', 'learnings.md'), 'utf8'), '');
    assert.equal(readFileSync(contextPath('my-spec', 'issues.md'), 'utf8'), '');
    assert.equal(readFileSync(contextPath('my-spec', 'audit.md'), 'utf8'), '');
  });
});

// ---------------------------------------------------------------------------
// readOutputs()
// ---------------------------------------------------------------------------

describe('readOutputs()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns {} when outputs.json does not exist', () => {
    const result = readOutputs('nonexistent-spec');
    assert.deepEqual(result, {});
  });

  test('returns parsed object when outputs.json exists', () => {
    initContext('my-spec');
    writeOutput('my-spec', 'todo-1', { file: 'parser.js' });
    const result = readOutputs('my-spec');
    assert.deepEqual(result['todo-1'], { file: 'parser.js' });
  });
});

// ---------------------------------------------------------------------------
// writeOutput()
// ---------------------------------------------------------------------------

describe('writeOutput()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('creates entry for new todoId', () => {
    initContext('my-spec');
    writeOutput('my-spec', 'todo-1', { file: 'parser.js' });

    const result = readOutputs('my-spec');
    assert.deepEqual(result['todo-1'], { file: 'parser.js' });
  });

  test('merges without overwriting other TODOs', () => {
    initContext('my-spec');
    writeOutput('my-spec', 'todo-1', { file: 'parser.js' });
    writeOutput('my-spec', 'todo-2', { file: 'formatter.js' });

    const result = readOutputs('my-spec');
    assert.deepEqual(result['todo-1'], { file: 'parser.js' });
    assert.deepEqual(result['todo-2'], { file: 'formatter.js' });
  });

  test('multiple writeOutput calls accumulate correctly', () => {
    initContext('my-spec');
    writeOutput('my-spec', 'todo-1', { file: 'parser.js' });
    writeOutput('my-spec', 'todo-1', { exportedName: 'parseDoc' });

    const result = readOutputs('my-spec');
    assert.deepEqual(result['todo-1'], { file: 'parser.js', exportedName: 'parseDoc' });
  });
});

// ---------------------------------------------------------------------------
// appendLearning()
// ---------------------------------------------------------------------------

describe('appendLearning()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('adds content to learnings.md', () => {
    initContext('my-spec');
    appendLearning('my-spec', 'todo-1', 'ESM only, no CJS.');

    const content = readFileSync(contextPath('my-spec', 'learnings.md'), 'utf8');
    assert.ok(content.includes('## TODO todo-1'));
    assert.ok(content.includes('ESM only, no CJS.'));
  });

  test('appends multiple entries without losing earlier ones', () => {
    initContext('my-spec');
    appendLearning('my-spec', 'todo-1', 'First learning.');
    appendLearning('my-spec', 'todo-2', 'Second learning.');

    const content = readFileSync(contextPath('my-spec', 'learnings.md'), 'utf8');
    assert.ok(content.includes('## TODO todo-1'));
    assert.ok(content.includes('First learning.'));
    assert.ok(content.includes('## TODO todo-2'));
    assert.ok(content.includes('Second learning.'));
  });
});

// ---------------------------------------------------------------------------
// appendIssue()
// ---------------------------------------------------------------------------

describe('appendIssue()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('adds checkbox item to issues.md', () => {
    initContext('my-spec');
    appendIssue('my-spec', 'todo-1', 'Race condition in writer.');

    const content = readFileSync(contextPath('my-spec', 'issues.md'), 'utf8');
    assert.ok(content.includes('## TODO todo-1'));
    assert.ok(content.includes('- [ ] Race condition in writer.'));
  });

  test('appends multiple issues without losing earlier ones', () => {
    initContext('my-spec');
    appendIssue('my-spec', 'todo-1', 'First issue.');
    appendIssue('my-spec', 'todo-2', 'Second issue.');

    const content = readFileSync(contextPath('my-spec', 'issues.md'), 'utf8');
    assert.ok(content.includes('- [ ] First issue.'));
    assert.ok(content.includes('- [ ] Second issue.'));
  });
});

// ---------------------------------------------------------------------------
// appendAudit()
// ---------------------------------------------------------------------------

describe('appendAudit()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('adds entry with separator to audit.md', () => {
    initContext('my-spec');
    appendAudit('my-spec', 'todo-1 completed at 2026-02-22T00:00:00Z');

    const content = readFileSync(contextPath('my-spec', 'audit.md'), 'utf8');
    assert.ok(content.includes('---'));
    assert.ok(content.includes('todo-1 completed at 2026-02-22T00:00:00Z'));
  });

  test('appends multiple audit entries', () => {
    initContext('my-spec');
    appendAudit('my-spec', 'Entry A');
    appendAudit('my-spec', 'Entry B');

    const content = readFileSync(contextPath('my-spec', 'audit.md'), 'utf8');
    assert.ok(content.includes('Entry A'));
    assert.ok(content.includes('Entry B'));
  });
});
