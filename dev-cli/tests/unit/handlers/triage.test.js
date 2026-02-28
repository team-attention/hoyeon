/**
 * triage handler test — Verifies CLI interface for triage
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Test environment
// ---------------------------------------------------------------------------

let tmpDir;
const CLI_PATH = join(import.meta.dirname, '..', '..', '..', 'bin', 'dev-cli.js');

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-handler-triage-'));
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
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'plan-content.json'), JSON.stringify(validPlanContent(), null, 2));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dev-cli triage handler', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => cleanup());

  test('returns pass for VERIFIED status', () => {
    setupSpec('test-spec');

    const verifyResult = JSON.stringify({ status: 'VERIFIED', criteria: [], mustNotDoViolations: [], sideEffects: [] });
    const result = execFileSync('node', [CLI_PATH, 'triage', 'test-spec', '--todo', 'todo-1'], {
      cwd: tmpDir,
      input: verifyResult,
      encoding: 'utf8',
    });

    const parsed = JSON.parse(result);
    assert.equal(parsed.disposition, 'pass');
  });

  test('returns halt for must-not-do violations', () => {
    setupSpec('test-spec');

    const verifyResult = JSON.stringify({
      status: 'FAILED',
      criteria: [],
      mustNotDoViolations: [{ rule: 'No eval', violated: true, evidence: 'Used eval()' }],
      sideEffects: [],
    });
    const result = execFileSync('node', [CLI_PATH, 'triage', 'test-spec', '--todo', 'todo-1'], {
      cwd: tmpDir,
      input: verifyResult,
      encoding: 'utf8',
    });

    const parsed = JSON.parse(result);
    assert.equal(parsed.disposition, 'halt');
  });

  test('returns retry for failed criteria', () => {
    setupSpec('test-spec');

    const verifyResult = JSON.stringify({
      status: 'FAILED',
      criteria: [{ name: 'Works', pass: false, evidence: 'Error' }],
      mustNotDoViolations: [],
      sideEffects: [],
    });
    const result = execFileSync('node', [CLI_PATH, 'triage', 'test-spec', '--todo', 'todo-1'], {
      cwd: tmpDir,
      input: verifyResult,
      encoding: 'utf8',
    });

    const parsed = JSON.parse(result);
    assert.equal(parsed.disposition, 'retry');
  });

  test('includes auditEntry in output', () => {
    setupSpec('test-spec');

    const verifyResult = JSON.stringify({ status: 'VERIFIED', criteria: [], mustNotDoViolations: [], sideEffects: [] });
    const result = execFileSync('node', [CLI_PATH, 'triage', 'test-spec', '--todo', 'todo-1'], {
      cwd: tmpDir,
      input: verifyResult,
      encoding: 'utf8',
    });

    const parsed = JSON.parse(result);
    assert.ok(parsed.auditEntry);
    assert.ok(parsed.auditEntry.includes('TRIAGE'));
  });
});

// ---------------------------------------------------------------------------
// --phase finalize tests
// ---------------------------------------------------------------------------

describe('dev-cli triage --phase finalize', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => cleanup());

  test('SHIP → pass for code-review', () => {
    setupSpec('test-spec');

    const reviewResult = JSON.stringify({ verdict: 'SHIP', issues: [] });
    const result = execFileSync('node', [
      CLI_PATH, 'triage', 'test-spec',
      '--phase', 'finalize', '--step', 'code-review', '--iteration', '0',
    ], { cwd: tmpDir, input: reviewResult, encoding: 'utf8' });

    const parsed = JSON.parse(result);
    assert.equal(parsed.disposition, 'pass');
  });

  test('NEEDS_FIXES at iteration 0 → fix for code-review', () => {
    setupSpec('test-spec');

    const reviewResult = JSON.stringify({
      verdict: 'NEEDS_FIXES',
      issues: [{ file: 'a.js', line: 1, severity: 'error', description: 'bug' }],
    });
    const result = execFileSync('node', [
      CLI_PATH, 'triage', 'test-spec',
      '--phase', 'finalize', '--step', 'code-review', '--iteration', '0',
    ], { cwd: tmpDir, input: reviewResult, encoding: 'utf8' });

    const parsed = JSON.parse(result);
    assert.equal(parsed.disposition, 'fix');
    assert.ok(parsed.issues.length > 0);
  });

  test('NEEDS_FIXES at iteration 2 → halt for code-review', () => {
    setupSpec('test-spec');

    const reviewResult = JSON.stringify({
      verdict: 'NEEDS_FIXES',
      issues: [{ file: 'a.js', line: 1, severity: 'error', description: 'bug' }],
    });
    const result = execFileSync('node', [
      CLI_PATH, 'triage', 'test-spec',
      '--phase', 'finalize', '--step', 'code-review', '--iteration', '2',
    ], { cwd: tmpDir, input: reviewResult, encoding: 'utf8' });

    const parsed = JSON.parse(result);
    assert.equal(parsed.disposition, 'halt');
  });

  test('PASS → pass for final-verify', () => {
    setupSpec('test-spec');

    const verifyResult = JSON.stringify({ status: 'PASS', results: [] });
    const result = execFileSync('node', [
      CLI_PATH, 'triage', 'test-spec',
      '--phase', 'finalize', '--step', 'final-verify', '--iteration', '0',
    ], { cwd: tmpDir, input: verifyResult, encoding: 'utf8' });

    const parsed = JSON.parse(result);
    assert.equal(parsed.disposition, 'pass');
  });

  test('FAIL at iteration 0 → fix for final-verify', () => {
    setupSpec('test-spec');

    const verifyResult = JSON.stringify({
      status: 'FAIL',
      results: [{ command: 'npm test', exitCode: 1, pass: false }],
    });
    const result = execFileSync('node', [
      CLI_PATH, 'triage', 'test-spec',
      '--phase', 'finalize', '--step', 'final-verify', '--iteration', '0',
    ], { cwd: tmpDir, input: verifyResult, encoding: 'utf8' });

    const parsed = JSON.parse(result);
    assert.equal(parsed.disposition, 'fix');
  });

  test('reads verify-result from persisted file with --result-file', () => {
    setupSpec('test-spec');

    // Write persisted verify result
    const contextDirPath = join(tmpDir, '.dev', 'specs', 'test-spec', 'context');
    mkdirSync(contextDirPath, { recursive: true });
    const envelope = {
      todoId: 'todo-1',
      result: { status: 'VERIFIED', criteria: [], mustNotDoViolations: [], sideEffects: [] },
      persistedAt: new Date().toISOString(),
    };
    writeFileSync(join(contextDirPath, 'verify-result-todo-1.json'), JSON.stringify(envelope, null, 2));

    // Triage with --result-file (no stdin)
    const result = execFileSync('node', [
      CLI_PATH, 'triage', 'test-spec', '--todo', 'todo-1', '--result-file',
    ], {
      cwd: tmpDir,
      encoding: 'utf8',
    });

    const parsed = JSON.parse(result);
    assert.equal(parsed.disposition, 'pass');
  });

  test('includes auditEntry with finalize prefix', () => {
    setupSpec('test-spec');

    const reviewResult = JSON.stringify({ verdict: 'SHIP', issues: [] });
    const result = execFileSync('node', [
      CLI_PATH, 'triage', 'test-spec',
      '--phase', 'finalize', '--step', 'code-review', '--iteration', '0',
    ], { cwd: tmpDir, input: reviewResult, encoding: 'utf8' });

    const parsed = JSON.parse(result);
    assert.ok(parsed.auditEntry);
    assert.ok(parsed.auditEntry.includes('finalize:code-review'));
  });
});
