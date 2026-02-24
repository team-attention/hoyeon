/**
 * cleanup.test.js — Unit tests for dev-cli/src/blocks/cleanup.js
 *
 * Verifies Phase 2 enhanced cleanup behavior:
 *   - summary.md is generated in session dir before artifact removal
 *   - DRAFT.md is deleted from session dir
 *   - findings/ and analysis/ directories are removed from session dir
 *   - state.json is preserved (not deleted)
 *   - summary.md includes spec name, session ID, recipe, decisions count, plan path, final status
 *
 * Uses node:test and node:assert (no external test frameworks).
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createState, loadState, updateState } from '../../../src/core/state.js';
import { cleanup } from '../../../src/blocks/cleanup.js';
import { generateSummary } from '../../../src/core/manifest.js';

// ---------------------------------------------------------------------------
// Temp dir management
// ---------------------------------------------------------------------------

let tmpDir;
const originalCwd = process.cwd;

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-cleanup-test-'));
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
 * Set up a session using legacy path (no session.ref).
 * All artifacts live in .dev/specs/{name}/.
 */
function setupLegacySession(sessionName, opts = {}) {
  createState(sessionName, opts);

  const specDir = join(tmpDir, '.dev', 'specs', sessionName);
  mkdirSync(specDir, { recursive: true });

  // Create DRAFT.md
  const draftPath = join(specDir, 'DRAFT.md');
  writeFileSync(draftPath, '# Draft\n\n## intent\nTest intent.\n', 'utf8');

  // Create findings/ subdirectory with a file
  const findingsDir = join(specDir, 'findings');
  mkdirSync(findingsDir, { recursive: true });
  writeFileSync(join(findingsDir, 'finding-1.md'), '# Finding 1\n', 'utf8');

  // Create analysis/ subdirectory with a file
  const analysisDir = join(specDir, 'analysis');
  mkdirSync(analysisDir, { recursive: true });
  writeFileSync(join(analysisDir, 'analysis-1.md'), '# Analysis 1\n', 'utf8');

  // Create active-spec pointer
  const devDir = join(tmpDir, '.dev');
  const activeSpecPath = join(devDir, 'active-spec');
  writeFileSync(activeSpecPath, sessionName, 'utf8');

  return { specDir, draftPath, findingsDir, analysisDir, activeSpecPath };
}

/**
 * Set up a session using session dir path (with session.ref).
 * Work artifacts live in .dev/.sessions/{sessionId}/, spec dir has session.ref.
 */
function setupSessionDirSession(sessionName, sessionId, opts = {}) {
  const specDir = join(tmpDir, '.dev', 'specs', sessionName);
  mkdirSync(specDir, { recursive: true });

  // Write session.ref to link spec → session dir
  writeFileSync(join(specDir, 'session.ref'), sessionId + '\n', 'utf8');

  const sessDir = join(tmpDir, '.dev', '.sessions', sessionId);
  mkdirSync(sessDir, { recursive: true });

  // createState will resolve via session.ref → sessDir
  createState(sessionName, { sessionId, ...opts });

  // Create DRAFT.md in session dir
  const draftPath = join(sessDir, 'DRAFT.md');
  writeFileSync(draftPath, '# Draft\n\n## intent\nTest intent.\n', 'utf8');

  // Create findings/ in session dir
  const findingsDir = join(sessDir, 'findings');
  mkdirSync(findingsDir, { recursive: true });
  writeFileSync(join(findingsDir, 'finding-1.md'), '# Finding 1\n', 'utf8');

  // Create analysis/ in session dir
  const analysisDir = join(sessDir, 'analysis');
  mkdirSync(analysisDir, { recursive: true });
  writeFileSync(join(analysisDir, 'analysis-1.md'), '# Analysis 1\n', 'utf8');

  // Create active-spec pointer
  const devDir = join(tmpDir, '.dev');
  const activeSpecPath = join(devDir, 'active-spec');
  writeFileSync(activeSpecPath, sessionName, 'utf8');

  return { specDir, sessDir, draftPath, findingsDir, analysisDir, activeSpecPath };
}

// ---------------------------------------------------------------------------
// summary.md generation tests (legacy path)
// ---------------------------------------------------------------------------

describe('cleanup() — summary.md generation (legacy path)', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('creates summary.md in session dir after cleanup', () => {
    const { specDir } = setupLegacySession('summary-create');

    cleanup('summary-create');

    const summaryPath = join(specDir, 'summary.md');
    assert.ok(existsSync(summaryPath), `summary.md should exist at ${summaryPath}`);
  });

  test('summary.md includes spec name', () => {
    setupLegacySession('summary-specname');

    cleanup('summary-specname');

    const specDir = join(tmpDir, '.dev', 'specs', 'summary-specname');
    const content = readFileSync(join(specDir, 'summary.md'), 'utf8');
    assert.ok(content.includes('summary-specname'), `Expected spec name in summary.md:\n${content}`);
  });

  test('summary.md includes session ID field', () => {
    setupLegacySession('summary-sessionid');

    cleanup('summary-sessionid');

    const specDir = join(tmpDir, '.dev', 'specs', 'summary-sessionid');
    const content = readFileSync(join(specDir, 'summary.md'), 'utf8');
    assert.ok(content.includes('Session ID'), `Expected "Session ID" in summary.md:\n${content}`);
  });

  test('summary.md includes recipe field', () => {
    setupLegacySession('summary-recipe', { recipe: 'specify-standard-interactive' });

    cleanup('summary-recipe');

    const specDir = join(tmpDir, '.dev', 'specs', 'summary-recipe');
    const content = readFileSync(join(specDir, 'summary.md'), 'utf8');
    assert.ok(
      content.includes('specify-standard-interactive'),
      `Expected recipe name in summary.md:\n${content}`,
    );
  });

  test('summary.md includes decisions count', () => {
    setupLegacySession('summary-decisions');
    updateState('summary-decisions', {
      decisions: {
        Auth: 'JWT',
        Storage: 'PostgreSQL',
      },
    });

    cleanup('summary-decisions');

    const specDir = join(tmpDir, '.dev', 'specs', 'summary-decisions');
    const content = readFileSync(join(specDir, 'summary.md'), 'utf8');
    assert.ok(content.includes('Decisions'), `Expected "Decisions" section in summary.md:\n${content}`);
    // Should include the count (2 decisions)
    assert.ok(content.includes('2'), `Expected decisions count "2" in summary.md:\n${content}`);
  });

  test('summary.md includes plan path', () => {
    setupLegacySession('summary-planpath');

    cleanup('summary-planpath');

    const specDir = join(tmpDir, '.dev', 'specs', 'summary-planpath');
    const content = readFileSync(join(specDir, 'summary.md'), 'utf8');
    assert.ok(
      content.includes('PLAN.md') || content.includes('Plan location'),
      `Expected plan path info in summary.md:\n${content}`,
    );
  });

  test('summary.md includes final status field', () => {
    setupLegacySession('summary-status');

    cleanup('summary-status');

    const specDir = join(tmpDir, '.dev', 'specs', 'summary-status');
    const content = readFileSync(join(specDir, 'summary.md'), 'utf8');
    assert.ok(
      content.includes('status') || content.includes('Final status') || content.includes('phase'),
      `Expected status info in summary.md:\n${content}`,
    );
  });

  test('summary.md includes step completion info', () => {
    setupLegacySession('summary-steps');
    updateState('summary-steps', {
      steps: {
        init: { status: 'done' },
        interview: { status: 'done' },
        'build-plan': { status: 'done' },
      },
    });

    cleanup('summary-steps');

    const specDir = join(tmpDir, '.dev', 'specs', 'summary-steps');
    const content = readFileSync(join(specDir, 'summary.md'), 'utf8');
    assert.ok(
      content.includes('Step') || content.includes('step') || content.includes('init'),
      `Expected step completion in summary.md:\n${content}`,
    );
  });
});

// ---------------------------------------------------------------------------
// DRAFT.md deletion tests (legacy path)
// ---------------------------------------------------------------------------

describe('cleanup() — DRAFT.md deleted (legacy path)', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('DRAFT.md is deleted after cleanup', () => {
    const { draftPath } = setupLegacySession('draft-delete-legacy');

    assert.ok(existsSync(draftPath), 'DRAFT.md should exist before cleanup');

    cleanup('draft-delete-legacy');

    assert.equal(existsSync(draftPath), false, 'DRAFT.md should be removed after cleanup');
  });

  test('does not fail if DRAFT.md does not exist', () => {
    // Setup session without DRAFT.md
    createState('draft-missing-ok', {});
    const specDir = join(tmpDir, '.dev', 'specs', 'draft-missing-ok');
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(tmpDir, '.dev', 'active-spec'), 'draft-missing-ok', 'utf8');

    assert.doesNotThrow(() => cleanup('draft-missing-ok'));
  });
});

// ---------------------------------------------------------------------------
// findings/ and analysis/ deletion tests (legacy path)
// ---------------------------------------------------------------------------

describe('cleanup() — findings/ and analysis/ removed (legacy path)', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('findings/ directory is removed after cleanup', () => {
    const { findingsDir } = setupLegacySession('findings-delete-legacy');

    assert.ok(existsSync(findingsDir), 'findings/ should exist before cleanup');

    cleanup('findings-delete-legacy');

    assert.equal(existsSync(findingsDir), false, 'findings/ should be removed after cleanup');
  });

  test('analysis/ directory is removed after cleanup', () => {
    const { analysisDir } = setupLegacySession('analysis-delete-legacy');

    assert.ok(existsSync(analysisDir), 'analysis/ should exist before cleanup');

    cleanup('analysis-delete-legacy');

    assert.equal(existsSync(analysisDir), false, 'analysis/ should be removed after cleanup');
  });

  test('does not fail if findings/ does not exist', () => {
    createState('findings-missing-ok', {});
    const specDir = join(tmpDir, '.dev', 'specs', 'findings-missing-ok');
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, 'DRAFT.md'), '# Draft\n', 'utf8');
    writeFileSync(join(tmpDir, '.dev', 'active-spec'), 'findings-missing-ok', 'utf8');
    // No findings/ dir created

    assert.doesNotThrow(() => cleanup('findings-missing-ok'));
  });

  test('does not fail if analysis/ does not exist', () => {
    createState('analysis-missing-ok', {});
    const specDir = join(tmpDir, '.dev', 'specs', 'analysis-missing-ok');
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, 'DRAFT.md'), '# Draft\n', 'utf8');
    writeFileSync(join(tmpDir, '.dev', 'active-spec'), 'analysis-missing-ok', 'utf8');
    // No analysis/ dir created

    assert.doesNotThrow(() => cleanup('analysis-missing-ok'));
  });
});

// ---------------------------------------------------------------------------
// state.json preservation tests (legacy path)
// ---------------------------------------------------------------------------

describe('cleanup() — state.json preserved (legacy path)', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('state.json still exists after cleanup', () => {
    setupLegacySession('state-preserved');

    const specDir = join(tmpDir, '.dev', 'specs', 'state-preserved');
    const statePath = join(specDir, 'state.json');

    assert.ok(existsSync(statePath), 'state.json should exist before cleanup');

    cleanup('state-preserved');

    assert.ok(existsSync(statePath), 'state.json should STILL exist after cleanup');
  });

  test('state.json is still readable after cleanup', () => {
    setupLegacySession('state-readable');

    cleanup('state-readable');

    const state = loadState('state-readable');
    assert.ok(state, 'state should be loadable after cleanup');
    assert.equal(state.phase, 'completed', 'phase should be "completed"');
  });
});

// ---------------------------------------------------------------------------
// Session dir path tests (with session.ref)
// ---------------------------------------------------------------------------

describe('cleanup() — session dir path (via session.ref)', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('creates summary.md in session dir (not spec dir)', () => {
    const sessionId = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff';
    const { sessDir } = setupSessionDirSession('sess-summary', sessionId);

    cleanup('sess-summary');

    const summaryPath = join(sessDir, 'summary.md');
    assert.ok(existsSync(summaryPath), `summary.md should exist in session dir at ${summaryPath}`);

    // Also check that summary.md is NOT duplicated in spec dir
    const specDirSummaryPath = join(tmpDir, '.dev', 'specs', 'sess-summary', 'summary.md');
    assert.equal(
      existsSync(specDirSummaryPath),
      false,
      'summary.md should NOT be in spec dir when session.ref exists',
    );
  });

  test('DRAFT.md is deleted from session dir', () => {
    const sessionId = 'bbbbcccc-dddd-eeee-ffff-000000000001';
    const { draftPath } = setupSessionDirSession('sess-draft-delete', sessionId);

    assert.ok(existsSync(draftPath), 'DRAFT.md should exist before cleanup');

    cleanup('sess-draft-delete');

    assert.equal(existsSync(draftPath), false, 'DRAFT.md should be removed after cleanup');
  });

  test('findings/ is deleted from session dir', () => {
    const sessionId = 'ccccdddd-eeee-ffff-0000-000000000002';
    const { findingsDir } = setupSessionDirSession('sess-findings-delete', sessionId);

    assert.ok(existsSync(findingsDir), 'findings/ should exist before cleanup');

    cleanup('sess-findings-delete');

    assert.equal(existsSync(findingsDir), false, 'findings/ should be removed after cleanup');
  });

  test('analysis/ is deleted from session dir', () => {
    const sessionId = 'ddddeeee-ffff-0000-1111-000000000003';
    const { analysisDir } = setupSessionDirSession('sess-analysis-delete', sessionId);

    assert.ok(existsSync(analysisDir), 'analysis/ should exist before cleanup');

    cleanup('sess-analysis-delete');

    assert.equal(existsSync(analysisDir), false, 'analysis/ should be removed after cleanup');
  });

  test('state.json is preserved in session dir', () => {
    const sessionId = 'eeeeffff-0000-1111-2222-000000000004';
    const { sessDir } = setupSessionDirSession('sess-state-preserved', sessionId);
    const statePath = join(sessDir, 'state.json');

    assert.ok(existsSync(statePath), 'state.json should exist before cleanup');

    cleanup('sess-state-preserved');

    assert.ok(existsSync(statePath), 'state.json should STILL exist after cleanup');
  });

  test('session dir contains only state.json and summary.md after cleanup', () => {
    const sessionId = 'ffff0000-1111-2222-3333-000000000005';
    const { sessDir } = setupSessionDirSession('sess-only-state-summary', sessionId);

    cleanup('sess-only-state-summary');

    const files = readdirSync(sessDir);
    const filesSorted = [...files].sort();

    assert.deepEqual(
      filesSorted,
      ['state.json', 'summary.md'],
      `Expected only state.json and summary.md in session dir, got: ${filesSorted.join(', ')}`,
    );
  });

  test('summary.md includes spec name and recipe from state', () => {
    const sessionId = '00001111-2222-3333-4444-000000000006';
    const { sessDir } = setupSessionDirSession('sess-summary-content', sessionId, {
      recipe: 'specify-quick-autopilot',
    });

    cleanup('sess-summary-content');

    const summaryPath = join(sessDir, 'summary.md');
    const content = readFileSync(summaryPath, 'utf8');

    assert.ok(
      content.includes('sess-summary-content'),
      `Expected spec name in summary.md:\n${content}`,
    );
    assert.ok(
      content.includes('specify-quick-autopilot'),
      `Expected recipe in summary.md:\n${content}`,
    );
    assert.ok(content.includes('Session ID'), `Expected "Session ID" label in summary.md:\n${content}`);
  });
});

// ---------------------------------------------------------------------------
// generateSummary() direct unit tests
// ---------------------------------------------------------------------------

describe('generateSummary() — direct unit tests', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns markdown string starting with # heading', () => {
    createState('gs-basic', { recipe: 'r1' });

    const result = generateSummary('gs-basic');

    assert.equal(typeof result, 'string', 'generateSummary should return a string');
    assert.ok(result.startsWith('#'), `Expected markdown heading, got: ${result.slice(0, 50)}`);
  });

  test('returns graceful message for nonexistent session', () => {
    const result = generateSummary('no-such-session-xyz');

    assert.ok(typeof result === 'string', 'Should return string even for missing session');
    assert.ok(result.includes('no-such-session-xyz'), 'Should include session name');
  });

  test('includes spec name, recipe in output', () => {
    createState('gs-full', { recipe: 'specify-standard-interactive', sessionId: 'test-uuid-1234' });

    const result = generateSummary('gs-full');

    assert.ok(result.includes('gs-full'), `Expected spec name in output:\n${result}`);
    assert.ok(result.includes('specify-standard-interactive'), `Expected recipe in output:\n${result}`);
    assert.ok(result.includes('Session ID'), `Expected "Session ID" field in output:\n${result}`);
  });

  test('includes decisions count when decisions exist', () => {
    createState('gs-decisions', {});
    updateState('gs-decisions', {
      decisions: { auth: 'JWT', db: 'postgres', cache: 'redis' },
    });

    const result = generateSummary('gs-decisions');

    assert.ok(result.includes('3'), `Expected decision count "3" in output:\n${result}`);
    assert.ok(result.includes('Decisions'), `Expected "Decisions" section:\n${result}`);
  });

  test('includes step completion info for multi-step sessions', () => {
    createState('gs-steps', {});
    updateState('gs-steps', {
      steps: {
        init: { status: 'done' },
        interview: { status: 'done' },
        'build-plan': { status: 'done' },
        'review-plan': { status: 'done' },
      },
    });

    const result = generateSummary('gs-steps');

    assert.ok(result.includes('Step'), `Expected "Step" section in output:\n${result}`);
    assert.ok(result.includes('init'), `Expected "init" step in output:\n${result}`);
    assert.ok(result.includes('done'), `Expected "done" status in output:\n${result}`);
  });

  test('plan path references PLAN.md', () => {
    createState('gs-planpath', {});

    const result = generateSummary('gs-planpath');

    assert.ok(
      result.includes('PLAN.md') || result.includes('Plan location'),
      `Expected plan path reference in output:\n${result}`,
    );
  });
});
