/**
 * plan-to-tasks.test.js — Unit tests for plan-to-tasks module
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { planToTasks } from '../../../src/engine/plan-to-tasks.js';

// ---------------------------------------------------------------------------
// Test environment
// ---------------------------------------------------------------------------

let tmpDir;
const originalCwd = process.cwd;

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-plan-to-tasks-test-'));
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
        steps: ['Write parser'],
        mustNotDo: ['Do not use eval'],
        references: [],
        acceptanceCriteria: { functional: ['Parser works'], static: [], runtime: [] },
        risk: 'LOW',
      },
      {
        id: 'todo-2',
        title: 'Create formatter',
        type: 'work',
        inputs: [{ name: 'parser', type: 'file', ref: '${todo-1.outputs.parser}' }],
        outputs: [{ name: 'formatter', type: 'file', value: 'formatter.js', description: 'The formatter' }],
        steps: ['Write formatter'],
        mustNotDo: [],
        references: [],
        acceptanceCriteria: { functional: ['Formatter works'], static: [], runtime: [] },
        risk: 'LOW',
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
    verificationSummary: { aItems: [], hItems: [], sItems: [], gaps: [] },
  };
}

function setupSpec(name, planData, planMd) {
  const specDir = join(tmpDir, '.dev', 'specs', name);
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'plan-content.json'), JSON.stringify(planData, null, 2));
  if (planMd) {
    writeFileSync(join(specDir, 'PLAN.md'), planMd);
  }
}

// ---------------------------------------------------------------------------
// Tests: planToTasks() — standard mode
// ---------------------------------------------------------------------------

describe('planToTasks() — standard mode', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('returns 4 substeps per unchecked TODO + 5 finalize tasks', () => {
    setupSpec('test', validPlanContent());

    const { tasks, dependencies } = planToTasks('test', 'standard');

    // 2 TODOs × 4 substeps + 5 finalize = 13 tasks
    const todoTasks = tasks.filter((t) => t.metadata.todoId !== 'finalize');
    const finalizeTasks = tasks.filter((t) => t.metadata.todoId === 'finalize');

    assert.equal(todoTasks.length, 8); // 2 TODOs × 4 substeps
    assert.equal(finalizeTasks.length, 5);
    assert.ok(dependencies.length > 0);
  });

  test('each task has required fields', () => {
    setupSpec('test', validPlanContent());

    const { tasks } = planToTasks('test', 'standard');

    for (const task of tasks) {
      assert.ok(task.id, 'task should have id');
      assert.ok(task.subject, 'task should have subject');
      assert.ok(task.description, 'task should have description');
      assert.ok(task.activeForm, 'task should have activeForm');
      assert.ok(task.metadata, 'task should have metadata');
      assert.ok(task.metadata.todoId, 'task metadata should have todoId');
      assert.ok(task.metadata.substep, 'task metadata should have substep');
      assert.ok(task.metadata.type, 'task metadata should have type');
    }
  });

  test('standard substeps include worker, verify, wrap-up, commit', () => {
    setupSpec('test', validPlanContent());

    const { tasks } = planToTasks('test', 'standard');
    const todo1Tasks = tasks.filter((t) => t.metadata.todoId === 'todo-1');
    const substeps = todo1Tasks.map((t) => t.metadata.substep);

    assert.deepEqual(substeps, ['worker', 'verify', 'wrap-up', 'commit']);
  });

  test('finalize includes all 5 steps', () => {
    setupSpec('test', validPlanContent());

    const { tasks } = planToTasks('test', 'standard');
    const finalizeTasks = tasks.filter((t) => t.metadata.todoId === 'finalize');
    const substeps = finalizeTasks.map((t) => t.metadata.substep);

    assert.deepEqual(substeps, [
      'residual-commit',
      'code-review',
      'final-verify',
      'state-complete',
      'report',
    ]);
  });

  test('dependencies form sequential chain within TODO', () => {
    setupSpec('test', validPlanContent());

    const { tasks, dependencies } = planToTasks('test', 'standard');
    const todo1Tasks = tasks.filter((t) => t.metadata.todoId === 'todo-1');

    // worker → verify → wrap-up → commit
    for (let i = 1; i < todo1Tasks.length; i++) {
      const dep = dependencies.find(
        (d) => d.from === todo1Tasks[i - 1].id && d.to === todo1Tasks[i].id,
      );
      assert.ok(dep, `Expected dependency from ${todo1Tasks[i - 1].id} to ${todo1Tasks[i].id}`);
    }
  });

  test('cross-TODO dependencies link last to first', () => {
    setupSpec('test', validPlanContent());

    const { tasks, dependencies } = planToTasks('test', 'standard');
    const todo1Tasks = tasks.filter((t) => t.metadata.todoId === 'todo-1');
    const todo2Tasks = tasks.filter((t) => t.metadata.todoId === 'todo-2');

    const lastTodo1 = todo1Tasks[todo1Tasks.length - 1];
    const firstTodo2 = todo2Tasks[0];

    const crossDep = dependencies.find(
      (d) => d.from === lastTodo1.id && d.to === firstTodo2.id,
    );
    assert.ok(crossDep, 'Expected cross-TODO dependency');
  });

  test('finalize blocked by all TODO last tasks', () => {
    setupSpec('test', validPlanContent());

    const { tasks, dependencies } = planToTasks('test', 'standard');
    const finalizeTasks = tasks.filter((t) => t.metadata.todoId === 'finalize');
    const firstFinalize = finalizeTasks[0];

    const todo1Tasks = tasks.filter((t) => t.metadata.todoId === 'todo-1');
    const todo2Tasks = tasks.filter((t) => t.metadata.todoId === 'todo-2');

    const dep1 = dependencies.find(
      (d) => d.from === todo1Tasks[todo1Tasks.length - 1].id && d.to === firstFinalize.id,
    );
    const dep2 = dependencies.find(
      (d) => d.from === todo2Tasks[todo2Tasks.length - 1].id && d.to === firstFinalize.id,
    );

    assert.ok(dep1, 'First finalize should be blocked by todo-1 last task');
    assert.ok(dep2, 'First finalize should be blocked by todo-2 last task');
  });
});

// ---------------------------------------------------------------------------
// Tests: planToTasks() — quick mode
// ---------------------------------------------------------------------------

describe('planToTasks() — quick mode', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('returns 3 substeps per TODO (no Verify) + 3 finalize (no Code Review, Final Verify)', () => {
    setupSpec('test', validPlanContent());

    const { tasks } = planToTasks('test', 'quick');

    const todoTasks = tasks.filter((t) => t.metadata.todoId !== 'finalize');
    const finalizeTasks = tasks.filter((t) => t.metadata.todoId === 'finalize');

    assert.equal(todoTasks.length, 6); // 2 TODOs × 3 substeps
    assert.equal(finalizeTasks.length, 3);
  });

  test('quick substeps skip verify', () => {
    setupSpec('test', validPlanContent());

    const { tasks } = planToTasks('test', 'quick');
    const todo1Tasks = tasks.filter((t) => t.metadata.todoId === 'todo-1');
    const substeps = todo1Tasks.map((t) => t.metadata.substep);

    assert.deepEqual(substeps, ['worker', 'wrap-up', 'commit']);
  });

  test('quick finalize skips code-review and final-verify', () => {
    setupSpec('test', validPlanContent());

    const { tasks } = planToTasks('test', 'quick');
    const finalizeTasks = tasks.filter((t) => t.metadata.todoId === 'finalize');
    const substeps = finalizeTasks.map((t) => t.metadata.substep);

    assert.deepEqual(substeps, ['residual-commit', 'state-complete', 'report']);
  });
});

// ---------------------------------------------------------------------------
// Tests: planToTasks() — resume (checked TODOs)
// ---------------------------------------------------------------------------

describe('planToTasks() — resume', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('skips checked TODOs', () => {
    const planMd = `### [x] TODO 1: Create parser\n### [ ] TODO 2: Create formatter`;
    setupSpec('test', validPlanContent(), planMd);

    const { tasks } = planToTasks('test', 'standard');

    const todoTasks = tasks.filter((t) => t.metadata.todoId !== 'finalize');
    // Only todo-2 should be present (todo-1 is checked)
    assert.equal(todoTasks.length, 4); // 1 TODO × 4 substeps
    assert.ok(todoTasks.every((t) => t.metadata.todoId === 'todo-2'));
  });
});
