/**
 * utility-flow.test.js — Integration test for dev-cli utility lifecycle
 *
 * Tests the full flow: plan-to-tasks → build-prompt → wrapup → checkpoint
 * Uses a 2-TODO fixture in both standard and quick modes.
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
const CLI_PATH = join(import.meta.dirname, '..', '..', 'bin', 'dev-cli.js');

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-utility-flow-'));
}

function cleanup() {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 2-TODO fixture
// ---------------------------------------------------------------------------

function twodoTodoPlanContent() {
  return {
    context: {
      originalRequest: 'Build parser and formatter',
      interviewSummary: 'User wants a parser and formatter',
      researchFindings: 'Pattern Y found',
    },
    objectives: {
      core: 'Implement parser + formatter',
      deliverables: ['parser.js', 'formatter.js'],
      dod: ['All tests pass'],
      mustNotDo: ['Do not break existing code'],
    },
    todos: [
      {
        id: 'todo-1',
        title: 'Create parser',
        type: 'work',
        inputs: [],
        outputs: [{ name: 'parser', type: 'file', value: 'parser.js', description: 'The parser module' }],
        steps: ['Write parser module', 'Add tests'],
        mustNotDo: ['Do not use eval'],
        references: ['docs/parser.md'],
        acceptanceCriteria: {
          functional: ['Parser parses valid input'],
          static: ['node --check parser.js'],
          runtime: ['node --test tests/parser.test.js'],
        },
        risk: 'LOW',
      },
      {
        id: 'todo-2',
        title: 'Create formatter',
        type: 'work',
        inputs: [{ name: 'parser', type: 'file', ref: '${todo-1.outputs.parser}' }],
        outputs: [{ name: 'formatter', type: 'file', value: 'formatter.js', description: 'The formatter module' }],
        steps: ['Write formatter using parser output'],
        mustNotDo: [],
        references: [],
        acceptanceCriteria: {
          functional: ['Formatter formats correctly'],
          static: [],
          runtime: ['node --test tests/formatter.test.js'],
        },
        risk: 'MEDIUM',
      },
    ],
    taskFlow: 'TODO-1 → TODO-2',
    dependencyGraph: [
      { todo: 'todo-1', requires: [], produces: ['parser'] },
      { todo: 'todo-2', requires: ['parser'], produces: ['formatter'] },
    ],
    commitStrategy: [
      { afterTodo: 'todo-1', message: 'feat: add parser', files: ['parser.js'], condition: 'always' },
      { afterTodo: 'todo-2', message: 'feat: add formatter', files: ['formatter.js'], condition: 'always' },
    ],
    verificationSummary: {
      aItems: ['A-1: Tests pass'],
      hItems: [],
      sItems: [],
      gaps: [],
    },
  };
}

function setupFixture(name) {
  const specDir = join(tmpDir, '.dev', 'specs', name);
  mkdirSync(specDir, { recursive: true });
  writeFileSync(
    join(specDir, 'plan-content.json'),
    JSON.stringify(twodoTodoPlanContent(), null, 2),
  );
  writeFileSync(
    join(specDir, 'PLAN.md'),
    `# Plan\n\n### [ ] TODO 1: Create parser\n\nContent\n\n### [ ] TODO 2: Create formatter\n\nContent\n`,
  );
}

function run(args, options = {}) {
  return execFileSync('node', [CLI_PATH, ...args], {
    cwd: tmpDir,
    encoding: 'utf8',
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Tests: Standard mode full lifecycle
// ---------------------------------------------------------------------------

describe('Utility flow — standard mode', () => {
  beforeEach(() => { useTmpDir(); setupFixture('test-feat'); });
  afterEach(() => cleanup());

  test('plan-to-tasks generates TaskCreate-compatible JSON', () => {
    const result = JSON.parse(run(['plan-to-tasks', 'test-feat', '--mode', 'standard']));

    assert.ok(Array.isArray(result.tasks));
    assert.ok(Array.isArray(result.dependencies));

    // 2 TODOs × 4 substeps + 5 finalize = 13
    assert.equal(result.tasks.length, 13);

    // Each task has required fields for TaskCreate
    for (const task of result.tasks) {
      assert.ok(task.subject, 'task should have subject');
      assert.ok(task.description, 'task should have description');
      assert.ok(task.activeForm, 'task should have activeForm');
      assert.ok(task.metadata, 'task should have metadata');
    }
  });

  test('build-prompt returns worker prompt with TASK section', () => {
    const prompt = run(['build-prompt', 'test-feat', '--todo', 'todo-1', '--type', 'worker']);

    assert.ok(prompt.includes('# TASK'));
    assert.ok(prompt.includes('Create parser'));
    assert.ok(prompt.includes('# STEPS'));
  });

  test('build-prompt returns verify prompt with criteria', () => {
    const prompt = run(['build-prompt', 'test-feat', '--todo', 'todo-1', '--type', 'verify'], {
      input: JSON.stringify({ summary: 'Worker completed' }),
    });

    assert.ok(prompt.includes('Verify'));
    assert.ok(prompt.includes('Acceptance Criteria'));
  });

  test('wrapup writes to context files', () => {
    const input = JSON.stringify({
      outputs: { parser: 'parser.js' },
      learnings: 'Parser pattern works well',
      issues: 'Need to handle edge case',
    });

    run(['wrapup', 'test-feat', '--todo', 'todo-1'], { input });

    // Verify outputs.json
    const outputsPath = join(tmpDir, '.dev', 'specs', 'test-feat', 'context', 'outputs.json');
    const outputs = JSON.parse(readFileSync(outputsPath, 'utf8'));
    assert.deepEqual(outputs['todo-1'], { parser: 'parser.js' });

    // Verify learnings.md
    const learningsPath = join(tmpDir, '.dev', 'specs', 'test-feat', 'context', 'learnings.md');
    const learnings = readFileSync(learningsPath, 'utf8');
    assert.ok(learnings.includes('Parser pattern works well'));

    // Verify issues.md
    const issuesPath = join(tmpDir, '.dev', 'specs', 'test-feat', 'context', 'issues.md');
    const issues = readFileSync(issuesPath, 'utf8');
    assert.ok(issues.includes('Need to handle edge case'));
  });

  test('checkpoint marks PLAN.md checkbox', () => {
    run(['checkpoint', 'test-feat', '--todo', 'todo-1']);

    const planMd = readFileSync(join(tmpDir, '.dev', 'specs', 'test-feat', 'PLAN.md'), 'utf8');
    assert.ok(planMd.includes('### [x] TODO 1:'));
    assert.ok(planMd.includes('### [ ] TODO 2:'));
  });

  test('full lifecycle: plan-to-tasks → build-prompt → wrapup → checkpoint', () => {
    // 1. Generate tasks
    const tasks = JSON.parse(run(['plan-to-tasks', 'test-feat', '--mode', 'standard']));
    assert.equal(tasks.tasks.length, 13);

    // 2. Build worker prompt for todo-1
    const workerPrompt = run(['build-prompt', 'test-feat', '--todo', 'todo-1', '--type', 'worker']);
    assert.ok(workerPrompt.includes('# TASK'));

    // 3. Wrapup todo-1
    run(['wrapup', 'test-feat', '--todo', 'todo-1'], {
      input: JSON.stringify({ outputs: { parser: 'parser.js' }, learnings: 'Works' }),
    });

    // 4. Checkpoint todo-1
    run(['checkpoint', 'test-feat', '--todo', 'todo-1']);

    // 5. Verify outputs available for todo-2 (variable substitution)
    const todo2Prompt = run(['build-prompt', 'test-feat', '--todo', 'todo-2', '--type', 'worker']);
    // Variable ${todo-1.outputs.parser} should be resolved to 'parser.js'
    assert.ok(todo2Prompt.includes('parser.js'));

    // 6. Verify PLAN.md is updated
    const planMd = readFileSync(join(tmpDir, '.dev', 'specs', 'test-feat', 'PLAN.md'), 'utf8');
    assert.ok(planMd.includes('### [x] TODO 1:'));
  });
});

// ---------------------------------------------------------------------------
// Tests: Quick mode
// ---------------------------------------------------------------------------

describe('Utility flow — quick mode', () => {
  beforeEach(() => { useTmpDir(); setupFixture('test-feat'); });
  afterEach(() => cleanup());

  test('plan-to-tasks generates fewer tasks in quick mode', () => {
    const result = JSON.parse(run(['plan-to-tasks', 'test-feat', '--mode', 'quick']));

    // 2 TODOs × 3 substeps + 3 finalize = 9
    assert.equal(result.tasks.length, 9);

    // No verify substeps
    const verifyTasks = result.tasks.filter((t) => t.metadata.substep === 'verify');
    assert.equal(verifyTasks.length, 0);

    // No code-review or final-verify in finalize
    const codeReview = result.tasks.filter((t) => t.metadata.substep === 'code-review');
    const finalVerify = result.tasks.filter((t) => t.metadata.substep === 'final-verify');
    assert.equal(codeReview.length, 0);
    assert.equal(finalVerify.length, 0);
  });

  test('checkpoint works in quick mode', () => {
    run(['checkpoint', 'test-feat', '--todo', 'todo-1', '--mode', 'quick']);

    const planMd = readFileSync(join(tmpDir, '.dev', 'specs', 'test-feat', 'PLAN.md'), 'utf8');
    assert.ok(planMd.includes('### [x] TODO 1:'));
  });
});

// ---------------------------------------------------------------------------
// Tests: Triage integration
// ---------------------------------------------------------------------------

describe('Utility flow — triage', () => {
  beforeEach(() => { useTmpDir(); setupFixture('test-feat'); });
  afterEach(() => cleanup());

  test('triage VERIFIED returns pass disposition', () => {
    const input = JSON.stringify({
      status: 'VERIFIED',
      criteria: [{ name: 'Parser works', pass: true, evidence: 'Tests pass' }],
      mustNotDoViolations: [],
      sideEffects: [],
    });

    const result = JSON.parse(run(['triage', 'test-feat', '--todo', 'todo-1'], { input }));
    assert.equal(result.disposition, 'pass');
  });

  test('triage FAILED returns retry disposition', () => {
    const input = JSON.stringify({
      status: 'FAILED',
      criteria: [{ name: 'Parser works', pass: false, evidence: 'Syntax error' }],
      mustNotDoViolations: [],
      sideEffects: [],
    });

    const result = JSON.parse(run(['triage', 'test-feat', '--todo', 'todo-1'], { input }));
    assert.equal(result.disposition, 'retry');
  });
});
