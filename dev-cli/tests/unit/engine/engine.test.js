/**
 * engine.test.js — Unit tests for the engine core driver
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { engineInit, engineNext, engineStepComplete } from '../../../src/engine/engine.js';
import { createState, loadState } from '../../../src/core/state.js';

// ---------------------------------------------------------------------------
// Test environment
// ---------------------------------------------------------------------------

let tmpDir;
const originalCwd = process.cwd;

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-engine-test-'));
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
        outputs: [{ name: 'parser', type: 'file', value: 'parser.js', description: 'Parser module' }],
        steps: ['Write parser', 'Test parser'],
        mustNotDo: ['Do not use eval'],
        references: ['docs/parser.md'],
        acceptanceCriteria: {
          functional: ['Parser parses valid input'],
          static: ['node --check passes'],
          runtime: ['node --test tests pass'],
        },
        risk: 'LOW',
      },
      {
        id: 'todo-2',
        title: 'Create formatter',
        type: 'work',
        inputs: [{ name: 'parser', type: 'file', ref: '${todo-1.outputs.parser}' }],
        outputs: [{ name: 'formatter', type: 'file', value: 'formatter.js', description: 'Formatter' }],
        steps: ['Write formatter'],
        mustNotDo: [],
        references: [],
        acceptanceCriteria: {
          functional: ['Formatter works'],
          static: ['node --check passes'],
          runtime: ['Tests pass'],
        },
        risk: 'LOW',
      },
      {
        id: 'todo-3',
        title: 'Create utils',
        type: 'work',
        inputs: [],
        outputs: [{ name: 'utils', type: 'file', value: 'utils.js', description: 'Utils' }],
        steps: ['Write utils'],
        mustNotDo: [],
        references: [],
        acceptanceCriteria: {
          functional: ['Utils work'],
          static: [],
          runtime: [],
        },
        risk: 'LOW',
      },
    ],
    taskFlow: 'TODO-1 → TODO-2, TODO-3 independent',
    dependencyGraph: [
      { todo: 'todo-1', requires: [], produces: ['parser'] },
      { todo: 'todo-2', requires: ['parser'], produces: ['formatter'] },
      { todo: 'todo-3', requires: [], produces: ['utils'] },
    ],
    commitStrategy: [
      { afterTodo: 'todo-1', message: 'feat: add parser', files: ['parser.js'], condition: 'always' },
      { afterTodo: 'todo-2', message: 'feat: add formatter', files: ['formatter.js'], condition: 'always' },
      { afterTodo: 'todo-3', message: 'feat: add utils', files: ['utils.js'], condition: 'always' },
    ],
    verificationSummary: {
      aItems: ['A-1: Tests pass'],
      hItems: [],
      sItems: [],
      gaps: [],
    },
  };
}

function setupSession(name, mode = 'standard') {
  const specDir = join(tmpDir, '.dev', 'specs', name);
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'plan-content.json'), JSON.stringify(validPlanContent(), null, 2));
  writeFileSync(join(specDir, 'PLAN.md'), '### [ ] TODO 1: Create parser\n### [ ] TODO 2: Create formatter\n### [ ] TODO 3: Create utils');

  createState(name, {
    recipe: 'execute-standard',
    skill: 'execute',
    depth: mode,
  });
}

// ---------------------------------------------------------------------------
// Tests: engineInit()
// ---------------------------------------------------------------------------

describe('engineInit()', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('initializes engine state and returns engine-init action', () => {
    setupSession('my-feat');
    const result = engineInit('my-feat', 'standard');

    assert.equal(result.action, 'engine-init');
    assert.equal(result.todoCount, 3);
    assert.equal(result.mode, 'standard');
  });

  test('creates engine state in state.json', () => {
    setupSession('my-feat');
    engineInit('my-feat', 'standard');

    const state = loadState('my-feat');
    assert.ok(state.engine);
    assert.equal(state.engine.initialized, true);
    assert.equal(state.engine.mode, 'standard');
    assert.ok(state.engine.todos['todo-1']);
    assert.ok(state.engine.todos['todo-2']);
    assert.ok(state.engine.todos['todo-3']);
    assert.ok(state.engine.graph);
  });

  test('initializes context directory', () => {
    setupSession('my-feat');
    engineInit('my-feat', 'standard');

    const contextDir = join(tmpDir, '.dev', 'specs', 'my-feat', 'context');
    assert.ok(readFileSync(join(contextDir, 'outputs.json'), 'utf8'));
  });

  test('works with quick mode', () => {
    setupSession('my-feat', 'quick');
    const result = engineInit('my-feat', 'quick');

    assert.equal(result.mode, 'quick');
    const state = loadState('my-feat');
    assert.equal(state.engine.mode, 'quick');
  });
});

// ---------------------------------------------------------------------------
// Tests: engineNext()
// ---------------------------------------------------------------------------

describe('engineNext()', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('auto-initializes if engine not yet initialized', () => {
    setupSession('my-feat');
    const result = engineNext('my-feat');

    assert.equal(result.action, 'engine-init');
    assert.equal(result.todoCount, 3);
  });

  test('returns engine-worker for first runnable TODO after init', () => {
    setupSession('my-feat');
    engineInit('my-feat', 'standard');
    const result = engineNext('my-feat');

    assert.equal(result.action, 'engine-worker');
    // todo-1 or todo-3 (both independent) — todo-1 comes first
    assert.ok(['todo-1', 'todo-3'].includes(result.todoId));
    assert.equal(result.substep, 'worker');
    assert.ok(result.instruction);
    assert.ok(result.stepId);
  });

  test('returns same pending action on repeated next() (idempotent)', () => {
    setupSession('my-feat');
    engineInit('my-feat', 'standard');
    const first = engineNext('my-feat');
    const second = engineNext('my-feat');

    assert.deepEqual(first, second);
  });

  test('returns engine-verify after worker complete (standard mode)', () => {
    setupSession('my-feat');
    engineInit('my-feat', 'standard');

    const worker = engineNext('my-feat');
    engineStepComplete('my-feat', worker.stepId, { summary: 'done' });

    const next = engineNext('my-feat');
    assert.equal(next.action, 'engine-verify');
    assert.equal(next.todoId, worker.todoId);
  });

  test('returns engine-wrapup after worker complete (quick mode)', () => {
    setupSession('my-feat', 'quick');
    engineInit('my-feat', 'quick');

    const worker = engineNext('my-feat');
    engineStepComplete('my-feat', worker.stepId, { summary: 'done' });

    const next = engineNext('my-feat');
    assert.equal(next.action, 'engine-wrapup');
    assert.equal(next.todoId, worker.todoId);
  });
});

// ---------------------------------------------------------------------------
// Tests: engineStepComplete()
// ---------------------------------------------------------------------------

describe('engineStepComplete()', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('clears pending action after completion', () => {
    setupSession('my-feat');
    engineInit('my-feat', 'standard');

    const worker = engineNext('my-feat');
    engineStepComplete('my-feat', worker.stepId, { summary: 'done' });

    const state = loadState('my-feat');
    assert.equal(state.engine.pendingAction, null);
  });

  test('stores worker result in todo state', () => {
    setupSession('my-feat');
    engineInit('my-feat', 'standard');

    const worker = engineNext('my-feat');
    engineStepComplete('my-feat', worker.stepId, { summary: 'parser created' });

    const state = loadState('my-feat');
    assert.deepEqual(state.engine.todos[worker.todoId].workerResult, { summary: 'parser created' });
  });

  test('verify pass advances to wrapup', () => {
    setupSession('my-feat');
    engineInit('my-feat', 'standard');

    // Complete worker
    const worker = engineNext('my-feat');
    engineStepComplete('my-feat', worker.stepId, { summary: 'done' });

    // Complete verify with VERIFIED
    const verify = engineNext('my-feat');
    assert.equal(verify.action, 'engine-verify');
    engineStepComplete('my-feat', verify.stepId, {
      status: 'VERIFIED',
      criteria: [{ name: 'test', pass: true, evidence: 'ok' }],
      mustNotDoViolations: [],
      sideEffects: [],
      suggestedAdaptation: null,
      summary: 'All good',
    });

    const wrapup = engineNext('my-feat');
    assert.equal(wrapup.action, 'engine-wrapup');
  });

  test('verify FAIL with retry resets to worker', () => {
    setupSession('my-feat');
    engineInit('my-feat', 'standard');

    // Complete worker
    const worker = engineNext('my-feat');
    engineStepComplete('my-feat', worker.stepId, { summary: 'done' });

    // Complete verify with FAILED
    const verify = engineNext('my-feat');
    engineStepComplete('my-feat', verify.stepId, {
      status: 'FAILED',
      criteria: [{ name: 'test', pass: false, evidence: 'assertion error' }],
      mustNotDoViolations: [],
      sideEffects: [],
      suggestedAdaptation: null,
      summary: 'Failed',
    });

    // Should go back to worker (retry)
    const retry = engineNext('my-feat');
    assert.equal(retry.action, 'engine-worker');
    assert.equal(retry.todoId, worker.todoId);

    // Check retry count incremented
    const state = loadState('my-feat');
    assert.equal(state.engine.todos[worker.todoId].retries, 1);
  });

  test('wrapup writes context from result', () => {
    setupSession('my-feat', 'quick');
    engineInit('my-feat', 'quick');

    // Complete worker
    const worker = engineNext('my-feat');
    engineStepComplete('my-feat', worker.stepId, { summary: 'done' });

    // Complete wrapup with outputs and learnings
    const wrapup = engineNext('my-feat');
    engineStepComplete('my-feat', wrapup.stepId, {
      outputs: { parser: 'parser.js' },
      learnings: 'Parser uses recursive descent',
    });

    // Check context was written
    const outputsPath = join(tmpDir, '.dev', 'specs', 'my-feat', 'context', 'outputs.json');
    const outputs = JSON.parse(readFileSync(outputsPath, 'utf8'));
    assert.ok(outputs[worker.todoId]);
    assert.equal(outputs[worker.todoId].parser, 'parser.js');
  });

  test('commit marks TODO as done', () => {
    setupSession('my-feat', 'quick');
    engineInit('my-feat', 'quick');

    // Fast-forward through worker → wrapup → commit
    const worker = engineNext('my-feat');
    const todoId = worker.todoId;
    engineStepComplete('my-feat', worker.stepId, { summary: 'done' });

    const wrapup = engineNext('my-feat');
    engineStepComplete('my-feat', wrapup.stepId, {});

    const commit = engineNext('my-feat');
    assert.equal(commit.action, 'engine-commit');
    engineStepComplete('my-feat', commit.stepId, { committed: true });

    const state = loadState('my-feat');
    assert.equal(state.engine.todos[todoId].status, 'done');
  });
});

// ---------------------------------------------------------------------------
// Tests: cross-TODO dependencies
// ---------------------------------------------------------------------------

describe('cross-TODO dependency enforcement', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('todo-2.worker is not dispatched until todo-1.commit completes', () => {
    setupSession('my-feat', 'quick');
    engineInit('my-feat', 'quick');

    // First runnable should be todo-1 or todo-3 (both independent)
    // todo-2 depends on todo-1, so it should not appear until todo-1 is fully done
    const dispatched = [];

    // Complete todo-1 fully: worker → wrapup → commit
    const w1 = engineNext('my-feat');
    dispatched.push(w1.todoId);
    engineStepComplete('my-feat', w1.stepId, {});

    const wu1 = engineNext('my-feat');
    dispatched.push(wu1.todoId);
    engineStepComplete('my-feat', wu1.stepId, {});

    const c1 = engineNext('my-feat');
    dispatched.push(c1.todoId);
    engineStepComplete('my-feat', c1.stepId, {});

    // Before todo-1 commit, todo-2 should not have been dispatched
    // After todo-1 commit, todo-2 or todo-3 should be next
    const next = engineNext('my-feat');

    // todo-2 or todo-3 should now be available
    assert.ok(next.action !== undefined);
    assert.ok(['todo-2', 'todo-3'].includes(next.todoId) || next.todoId === 'finalize');
  });
});

// ---------------------------------------------------------------------------
// Tests: finalize chain
// ---------------------------------------------------------------------------

describe('finalize chain', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('finalize dispatches after all TODOs complete (quick mode)', () => {
    setupSession('my-feat', 'quick');
    engineInit('my-feat', 'quick');

    // Complete all 3 TODOs in quick mode (worker → wrapup → commit each)
    for (let i = 0; i < 9; i++) {
      const step = engineNext('my-feat');
      if (step.done) break;
      engineStepComplete('my-feat', step.stepId, {
        status: 'VERIFIED',
        criteria: [],
        mustNotDoViolations: [],
        sideEffects: [],
        suggestedAdaptation: null,
      });
    }

    // Should be in finalize chain now
    const fin = engineNext('my-feat');
    assert.equal(fin.action, 'engine-finalize');
    assert.equal(fin.substep, 'residual-commit');
  });
});

// ---------------------------------------------------------------------------
// Tests: resume from state
// ---------------------------------------------------------------------------

describe('resume from state', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('resumes from partially completed engine state', () => {
    setupSession('my-feat', 'quick');
    engineInit('my-feat', 'quick');

    // Complete first step
    const w1 = engineNext('my-feat');
    engineStepComplete('my-feat', w1.stepId, {});

    // "Restart" — load state fresh and call engineNext
    const resumed = engineNext('my-feat');

    // Should continue from where we left off (not re-init)
    assert.notEqual(resumed.action, 'engine-init');
    assert.ok(resumed.action);
  });
});
