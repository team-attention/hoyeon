/**
 * prompt-factory.test.js — Unit tests for prompt-factory module
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildPromptForTodo } from '../../../src/engine/prompt-factory.js';

// ---------------------------------------------------------------------------
// Test environment
// ---------------------------------------------------------------------------

let tmpDir;
const originalCwd = process.cwd;

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-prompt-factory-test-'));
  process.cwd = () => tmpDir;
}

function restoreCwd() {
  process.cwd = originalCwd;
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function validPlanContent() {
  return {
    context: {
      originalRequest: 'Build feature X',
      interviewSummary: 'User wants X',
      researchFindings: 'Found pattern Y',
    },
    objectives: {
      core: 'Implement X',
      deliverables: ['feature-x.js'],
      dod: ['Tests pass'],
      mustNotDo: ['Do not break Y'],
    },
    todos: [
      {
        id: 'todo-1',
        title: 'Create parser',
        type: 'work',
        inputs: [],
        outputs: [{ name: 'parser', type: 'file', value: 'parser.js', description: 'The parser' }],
        steps: ['Write parser', 'Test parser'],
        mustNotDo: ['Do not use eval'],
        references: ['docs/parser.md'],
        acceptanceCriteria: {
          functional: ['Parser parses valid input'],
          static: ['node --check passes'],
          runtime: ['node --test parser.test.js'],
        },
        risk: 'LOW',
      },
    ],
    taskFlow: 'TODO-1',
    dependencyGraph: [{ todo: 'todo-1', requires: [], produces: ['parser'] }],
    commitStrategy: [
      { afterTodo: 'todo-1', message: 'feat: add parser', files: ['parser.js'], condition: 'always' },
    ],
    verificationSummary: { aItems: [], hItems: [], sItems: [], gaps: [] },
  };
}

function setupSpec(name, planData) {
  const specDir = join(tmpDir, '.dev', 'specs', name);
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'plan-content.json'), JSON.stringify(planData, null, 2));
  // Create context dir for outputs
  const ctxDir = join(specDir, 'context');
  mkdirSync(ctxDir, { recursive: true });
  writeFileSync(join(ctxDir, 'outputs.json'), '{}');
  writeFileSync(join(ctxDir, 'learnings.md'), '');
  writeFileSync(join(ctxDir, 'issues.md'), '');
}

// ---------------------------------------------------------------------------
// Tests: buildPromptForTodo()
// ---------------------------------------------------------------------------

describe('buildPromptForTodo() — worker', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('returns string containing TASK section', () => {
    setupSpec('test', validPlanContent());

    const prompt = buildPromptForTodo('test', 'todo-1', 'worker');

    assert.ok(typeof prompt === 'string');
    assert.ok(prompt.includes('# TASK'), 'Should contain TASK section');
    assert.ok(prompt.includes('todo-1'), 'Should reference todo-1');
    assert.ok(prompt.includes('Create parser'), 'Should include title');
  });

  test('includes STEPS and EXPECTED OUTCOME sections', () => {
    setupSpec('test', validPlanContent());

    const prompt = buildPromptForTodo('test', 'todo-1', 'worker');

    assert.ok(prompt.includes('# STEPS'));
    assert.ok(prompt.includes('# EXPECTED OUTCOME'));
    assert.ok(prompt.includes('Write parser'));
  });
});

describe('buildPromptForTodo() — verify', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('returns string containing verification instructions', () => {
    setupSpec('test', validPlanContent());

    const prompt = buildPromptForTodo('test', 'todo-1', 'verify', { summary: 'done' });

    assert.ok(typeof prompt === 'string');
    assert.ok(prompt.includes('Verify'), 'Should contain verify heading');
    assert.ok(prompt.includes('Acceptance Criteria'), 'Should contain AC check');
    assert.ok(prompt.includes('Required Output Format'), 'Should specify output format');
  });
});

describe('buildPromptForTodo() — fix', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('returns fix prompt with failed criteria', () => {
    setupSpec('test', validPlanContent());

    const verifyResult = {
      criteria: [{ name: 'Parser works', pass: false, evidence: 'Syntax error' }],
      mustNotDoViolations: [],
    };
    const prompt = buildPromptForTodo('test', 'todo-1', 'fix', verifyResult);

    assert.ok(prompt.includes('Fix'));
    assert.ok(prompt.includes('Failed Criteria'));
  });
});

describe('buildPromptForTodo() — commit', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('returns commit prompt with message', () => {
    setupSpec('test', validPlanContent());

    const prompt = buildPromptForTodo('test', 'todo-1', 'commit');

    assert.ok(prompt.includes('Commit'));
    assert.ok(prompt.includes('feat: add parser'));
  });
});

describe('buildPromptForTodo() — code-review', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('returns code review prompt', () => {
    setupSpec('test', validPlanContent());

    const prompt = buildPromptForTodo('test', 'todo-1', 'code-review');

    assert.ok(prompt.includes('Code Review'));
    assert.ok(prompt.includes('SHIP'));
  });
});

describe('buildPromptForTodo() — final-verify', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('returns final verify prompt with commands', () => {
    setupSpec('test', validPlanContent());

    const prompt = buildPromptForTodo('test', 'todo-1', 'final-verify');

    assert.ok(prompt.includes('Final Verification'));
    assert.ok(prompt.includes('node --test parser.test.js'));
  });
});

describe('buildPromptForTodo() — report', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('returns report prompt', () => {
    setupSpec('test', validPlanContent());

    const prompt = buildPromptForTodo('test', 'todo-1', 'report', { mode: 'standard' });

    assert.ok(prompt.includes('Execution Report'));
    assert.ok(prompt.includes('standard'));
  });
});

describe('buildPromptForTodo() — finalize-fix', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('returns finalize fix prompt with issues', () => {
    setupSpec('test', validPlanContent());

    const inputData = {
      stepName: 'code-review',
      stepResult: { verdict: 'NEEDS_FIXES', issues: [] },
      issues: ['[error] a.js:10 — bug'],
    };
    const prompt = buildPromptForTodo('test', 'finalize', 'finalize-fix', inputData);

    assert.ok(prompt.includes('Fix: Code Review Issues'));
    assert.ok(prompt.includes('bug'));
  });

  test('returns finalize fix prompt for final-verify', () => {
    setupSpec('test', validPlanContent());

    const inputData = {
      stepName: 'final-verify',
      stepResult: { status: 'FAIL', results: [] },
      issues: ['npm test exited 1'],
    };
    const prompt = buildPromptForTodo('test', 'finalize', 'finalize-fix', inputData);

    assert.ok(prompt.includes('Fix: Final Verification Issues'));
  });
});

describe('buildPromptForTodo() — error handling', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('throws on unknown TODO', () => {
    setupSpec('test', validPlanContent());

    assert.throws(
      () => buildPromptForTodo('test', 'todo-999', 'worker'),
      /not found in plan/,
    );
  });

  test('throws on unknown prompt type', () => {
    setupSpec('test', validPlanContent());

    assert.throws(
      () => buildPromptForTodo('test', 'todo-1', 'unknown'),
      /Unknown prompt type/,
    );
  });
});
