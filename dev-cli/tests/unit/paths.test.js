/**
 * paths.test.js — Unit tests for dual-path resolution in dev-cli/src/core/paths.js
 * Uses node:test and node:assert (no external test frameworks).
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { statePath, draftPath, findingsDir, analysisDir, sessionDir, sessionBaseDir, specDir } from '../../src/core/paths.js';

// ---------------------------------------------------------------------------
// Temp dir management
// ---------------------------------------------------------------------------

let tmpDir;
const originalCwd = process.cwd;

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-paths-test-'));
  process.cwd = () => tmpDir;
}

function restoreCwd() {
  process.cwd = originalCwd;
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Write a session.ref file in the spec dir pointing to sessionId.
 */
function writeSessionRef(name, sessionId) {
  const specDirPath = join(tmpDir, '.dev', 'specs', name);
  mkdirSync(specDirPath, { recursive: true });
  writeFileSync(join(specDirPath, 'session.ref'), sessionId + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// sessionBaseDir() tests
// ---------------------------------------------------------------------------

describe('sessionBaseDir()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns .dev/.sessions/ under cwd', () => {
    const result = sessionBaseDir();
    assert.equal(result, join(tmpDir, '.dev', '.sessions'));
  });
});

// ---------------------------------------------------------------------------
// sessionDir() tests
// ---------------------------------------------------------------------------

describe('sessionDir()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns path under .dev/.sessions/{sessionId}', () => {
    const id = 'abc-def-123';
    const result = sessionDir(id);
    assert.equal(result, join(tmpDir, '.dev', '.sessions', id));
  });
});

// ---------------------------------------------------------------------------
// statePath() dual-path resolution tests
// ---------------------------------------------------------------------------

describe('statePath() — dual-path resolution', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns legacy spec dir path when session.ref is absent', () => {
    const result = statePath('no-ref-spec');
    assert.equal(result, join(tmpDir, '.dev', 'specs', 'no-ref-spec', 'state.json'));
  });

  test('returns session dir path when session.ref exists', () => {
    const sessionId = 'aabbccdd-1122-3344-5566-778899aabbcc';
    writeSessionRef('has-ref-spec', sessionId);

    const result = statePath('has-ref-spec');
    assert.equal(result, join(tmpDir, '.dev', '.sessions', sessionId, 'state.json'));
  });

  test('falls back to legacy path when session.ref is empty/broken', () => {
    // Write an empty session.ref
    const specDirPath = join(tmpDir, '.dev', 'specs', 'broken-ref-spec');
    mkdirSync(specDirPath, { recursive: true });
    writeFileSync(join(specDirPath, 'session.ref'), '   \n', 'utf8');

    // Empty sessionId → falls back to spec dir
    const result = statePath('broken-ref-spec');
    assert.equal(result, join(tmpDir, '.dev', 'specs', 'broken-ref-spec', 'state.json'));
  });
});

// ---------------------------------------------------------------------------
// draftPath() dual-path resolution tests
// ---------------------------------------------------------------------------

describe('draftPath() — dual-path resolution', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns legacy spec dir path when session.ref is absent', () => {
    const result = draftPath('no-ref-draft');
    assert.equal(result, join(tmpDir, '.dev', 'specs', 'no-ref-draft', 'DRAFT.md'));
  });

  test('returns session dir path when session.ref exists', () => {
    const sessionId = '11223344-5566-7788-99aa-bbccddeeff00';
    writeSessionRef('has-ref-draft', sessionId);

    const result = draftPath('has-ref-draft');
    assert.equal(result, join(tmpDir, '.dev', '.sessions', sessionId, 'DRAFT.md'));
  });
});

// ---------------------------------------------------------------------------
// findingsDir() dual-path resolution tests
// ---------------------------------------------------------------------------

describe('findingsDir() — dual-path resolution', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns legacy spec dir path when session.ref is absent', () => {
    const result = findingsDir('no-ref-findings');
    assert.equal(result, join(tmpDir, '.dev', 'specs', 'no-ref-findings', 'findings'));
  });

  test('returns session dir path when session.ref exists', () => {
    const sessionId = 'ffeeddcc-bbaa-9988-7766-554433221100';
    writeSessionRef('has-ref-findings', sessionId);

    const result = findingsDir('has-ref-findings');
    assert.equal(result, join(tmpDir, '.dev', '.sessions', sessionId, 'findings'));
  });
});

// ---------------------------------------------------------------------------
// analysisDir() dual-path resolution tests
// ---------------------------------------------------------------------------

describe('analysisDir() — dual-path resolution', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns legacy spec dir path when session.ref is absent', () => {
    const result = analysisDir('no-ref-analysis');
    assert.equal(result, join(tmpDir, '.dev', 'specs', 'no-ref-analysis', 'analysis'));
  });

  test('returns session dir path when session.ref exists', () => {
    const sessionId = '00112233-4455-6677-8899-aabbccddeeff';
    writeSessionRef('has-ref-analysis', sessionId);

    const result = analysisDir('has-ref-analysis');
    assert.equal(result, join(tmpDir, '.dev', '.sessions', sessionId, 'analysis'));
  });
});

// ---------------------------------------------------------------------------
// specDir() always returns spec dir (not session dir)
// ---------------------------------------------------------------------------

describe('specDir() — always spec dir', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns spec dir even when session.ref exists', () => {
    const sessionId = '99887766-5544-3322-1100-aabbccddeeff';
    writeSessionRef('always-spec-spec', sessionId);

    const result = specDir('always-spec-spec');
    assert.equal(result, join(tmpDir, '.dev', 'specs', 'always-spec-spec'));
  });
});
