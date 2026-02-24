/**
 * session.test.js — Unit tests for dev-cli/src/core/session.js
 * Uses node:test and node:assert (no external test frameworks).
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSession, resolveSessionId, linkToSpec } from '../../src/core/session.js';

// ---------------------------------------------------------------------------
// Temp dir management
// ---------------------------------------------------------------------------

let tmpDir;
const originalCwd = process.cwd;

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-session-test-'));
  process.cwd = () => tmpDir;
}

function restoreCwd() {
  process.cwd = originalCwd;
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// createSession() tests
// ---------------------------------------------------------------------------

describe('createSession()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns a UUID-formatted sessionId', () => {
    const sessionId = createSession('my-spec');
    // UUID format: 8-4-4-4-12 hex chars
    assert.match(sessionId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('creates .dev/.sessions/{sessionId}/ directory', () => {
    const sessionId = createSession('my-spec');
    const sessionDir = join(tmpDir, '.dev', '.sessions', sessionId);
    assert.ok(existsSync(sessionDir), `Expected session dir at ${sessionDir}`);
  });

  test('creates findings/ subdirectory in session dir', () => {
    const sessionId = createSession('my-spec');
    const findingsDir = join(tmpDir, '.dev', '.sessions', sessionId, 'findings');
    assert.ok(existsSync(findingsDir), `Expected findings/ at ${findingsDir}`);
  });

  test('creates analysis/ subdirectory in session dir', () => {
    const sessionId = createSession('my-spec');
    const analysisDir = join(tmpDir, '.dev', '.sessions', sessionId, 'analysis');
    assert.ok(existsSync(analysisDir), `Expected analysis/ at ${analysisDir}`);
  });

  test('generates a unique sessionId on each call', () => {
    const id1 = createSession('spec-a');
    const id2 = createSession('spec-b');
    assert.notEqual(id1, id2, 'Each call should produce a unique sessionId');
  });
});

// ---------------------------------------------------------------------------
// resolveSessionId() tests
// ---------------------------------------------------------------------------

describe('resolveSessionId()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns null when session.ref does not exist', () => {
    // Create spec dir without session.ref
    mkdirSync(join(tmpDir, '.dev', 'specs', 'no-ref-spec'), { recursive: true });
    const result = resolveSessionId('no-ref-spec');
    assert.equal(result, null);
  });

  test('returns the sessionId written in session.ref', () => {
    const specDirPath = join(tmpDir, '.dev', 'specs', 'has-ref-spec');
    mkdirSync(specDirPath, { recursive: true });
    const expectedId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    // Write session.ref with trailing newline (as linkToSpec does)
    writeFileSync(join(specDirPath, 'session.ref'), expectedId + '\n', 'utf8');

    const result = resolveSessionId('has-ref-spec');
    assert.equal(result, expectedId);
  });

  test('returns null when session.ref is empty', () => {
    const specDirPath = join(tmpDir, '.dev', 'specs', 'empty-ref-spec');
    mkdirSync(specDirPath, { recursive: true });
    writeFileSync(join(specDirPath, 'session.ref'), '', 'utf8');

    const result = resolveSessionId('empty-ref-spec');
    assert.equal(result, null);
  });

  test('reads session.ref written by linkToSpec', () => {
    // Create spec dir first so linkToSpec can write to it
    mkdirSync(join(tmpDir, '.dev', 'specs', 'linked-spec'), { recursive: true });
    const sessionId = createSession('linked-spec');
    linkToSpec('linked-spec', sessionId);

    const result = resolveSessionId('linked-spec');
    assert.equal(result, sessionId);
  });
});

// ---------------------------------------------------------------------------
// linkToSpec() tests
// ---------------------------------------------------------------------------

describe('linkToSpec()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('writes session.ref to spec dir', () => {
    mkdirSync(join(tmpDir, '.dev', 'specs', 'link-spec'), { recursive: true });
    const sessionId = 'test-session-id-1234-5678-abcdef012345';
    linkToSpec('link-spec', sessionId);

    const refPath = join(tmpDir, '.dev', 'specs', 'link-spec', 'session.ref');
    assert.ok(existsSync(refPath), `Expected session.ref at ${refPath}`);
  });

  test('session.ref contains only the sessionId (trimmed)', () => {
    mkdirSync(join(tmpDir, '.dev', 'specs', 'link-content-spec'), { recursive: true });
    const sessionId = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff';
    linkToSpec('link-content-spec', sessionId);

    const refPath = join(tmpDir, '.dev', 'specs', 'link-content-spec', 'session.ref');
    const content = readFileSync(refPath, 'utf8').trim();
    assert.equal(content, sessionId);
  });

  test('session.ref does not contain absolute paths', () => {
    mkdirSync(join(tmpDir, '.dev', 'specs', 'no-abspath-spec'), { recursive: true });
    const sessionId = 'f0e1d2c3-b4a5-6789-0123-456789abcdef';
    linkToSpec('no-abspath-spec', sessionId);

    const refPath = join(tmpDir, '.dev', 'specs', 'no-abspath-spec', 'session.ref');
    const content = readFileSync(refPath, 'utf8').trim();
    // Should not contain path separators
    assert.ok(!content.includes('/'), 'session.ref must not contain path separators');
    assert.ok(!content.includes('\\'), 'session.ref must not contain backslashes');
  });

  test('creates spec dir if it does not exist', () => {
    // Do NOT pre-create the spec dir
    const sessionId = 'newdir-uuid-1111-2222-333333333333';
    linkToSpec('autocreate-spec', sessionId);

    const specDirPath = join(tmpDir, '.dev', 'specs', 'autocreate-spec');
    assert.ok(existsSync(specDirPath), 'linkToSpec should create spec dir if absent');

    const refPath = join(specDirPath, 'session.ref');
    assert.ok(existsSync(refPath), 'session.ref should exist after linkToSpec');
  });
});
