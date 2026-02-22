/**
 * execute-flow.test.js — E2E integration tests for the execute engine flow
 *
 * Tests full lifecycle: init → worker → verify → wrapup → commit → finalize → done
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { next, stepComplete } from '../../src/core/sequencer.js';
import { createState, loadState, updateState } from '../../src/core/state.js';

// ---------------------------------------------------------------------------
// Test environment
// ---------------------------------------------------------------------------

let tmpDir;
const originalCwd = process.cwd;

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-execute-flow-'));
  process.cwd = () => tmpDir;
}

function restoreCwd() {
  process.cwd = originalCwd;
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Fixtures: 3 TODOs (1 independent, 2 depends on 1, 3 independent)
// ---------------------------------------------------------------------------

function threeTodoPlan() {
  return {
    context: {
      originalRequest: 'Build parser and formatter',
      interviewSummary: 'Need parser first, formatter depends on it, utils independent',
      researchFindings: 'Standard pattern',
    },
    objectives: {
      core: 'Implement parser + formatter + utils',
      deliverables: ['parser.js', 'formatter.js', 'utils.js'],
      dod: ['All tests pass'],
      mustNotDo: ['Do not break existing code'],
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
        references: [],
        acceptanceCriteria: {
          functional: ['Parser works'],
          static: ['node --check passes'],
          runtime: ['node --test tests/parser.test.js'],
        },
        risk: 'LOW',
      },
      {
        id: 'todo-2',
        title: 'Create formatter',
        type: 'work',
        inputs: [{ name: 'parser', type: 'file', ref: '${todo-1.outputs.parser}' }],
        outputs: [{ name: 'formatter', type: 'file', value: 'formatter.js', description: 'Formatter' }],
        steps: ['Write formatter using parser'],
        mustNotDo: [],
        references: [],
        acceptanceCriteria: {
          functional: ['Formatter works'],
          static: [],
          runtime: [],
        },
        risk: 'LOW',
      },
      {
        id: 'todo-3',
        title: 'Create utils',
        type: 'work',
        inputs: [],
        outputs: [{ name: 'utils', type: 'file', value: 'utils.js', description: 'Utilities' }],
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
    taskFlow: 'TODO-1 → TODO-2 (depends), TODO-3 (independent)',
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
      aItems: ['A-1: All tests pass'],
      hItems: [],
      sItems: [],
      gaps: [],
    },
  };
}

function setupSession(name, mode = 'standard') {
  const specDir = join(tmpDir, '.dev', 'specs', name);
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'plan-content.json'), JSON.stringify(threeTodoPlan(), null, 2));
  writeFileSync(join(specDir, 'PLAN.md'), [
    '### [ ] TODO 1: Create parser',
    '### [ ] TODO 2: Create formatter',
    '### [ ] TODO 3: Create utils',
  ].join('\n'));

  createState(name, {
    recipe: `execute-${mode}`,
    skill: 'execute',
    depth: mode,
  });

  updateState(name, {
    recipeBlocks: [{ id: 'execute-engine', type: 'engine', mode }],
  });
}

function verifiedResult() {
  return {
    status: 'VERIFIED',
    criteria: [{ name: 'test', pass: true, evidence: 'ok' }],
    mustNotDoViolations: [],
    sideEffects: [],
    suggestedAdaptation: null,
    summary: 'All good',
  };
}

// Helper to complete one full TODO cycle in standard mode
async function completeTodoStandard(name) {
  // Worker
  const worker = await next(name);
  assert.equal(worker.action, 'engine-worker');
  stepComplete(name, worker.stepId, { summary: 'done' });

  // Verify
  const verify = await next(name);
  assert.equal(verify.action, 'engine-verify');
  stepComplete(name, verify.stepId, verifiedResult());

  // Wrapup
  const wrapup = await next(name);
  assert.equal(wrapup.action, 'engine-wrapup');
  stepComplete(name, wrapup.stepId, { outputs: { result: 'ok' } });

  // Commit
  const commit = await next(name);
  assert.equal(commit.action, 'engine-commit');
  stepComplete(name, commit.stepId, { committed: true });

  return worker.todoId;
}

// Helper to complete one full TODO cycle in quick mode
async function completeTodoQuick(name) {
  const worker = await next(name);
  assert.equal(worker.action, 'engine-worker');
  stepComplete(name, worker.stepId, { summary: 'done' });

  const wrapup = await next(name);
  assert.equal(wrapup.action, 'engine-wrapup');
  stepComplete(name, wrapup.stepId, {});

  const commit = await next(name);
  assert.equal(commit.action, 'engine-commit');
  stepComplete(name, commit.stepId, { committed: true });

  return worker.todoId;
}

// ---------------------------------------------------------------------------
// Tests: Full standard mode lifecycle
// ---------------------------------------------------------------------------

describe('E2E: standard mode full lifecycle', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('init → all substeps → finalize → done', async () => {
    setupSession('e2e-std');

    // Init
    const init = await next('e2e-std');
    assert.equal(init.action, 'engine-init');
    assert.equal(init.todoCount, 3);

    // Complete all 3 TODOs (todo-1, todo-3 first since independent, then todo-2)
    const completed = [];

    // First two should be todo-1 and todo-3 (order may vary)
    const id1 = await completeTodoStandard('e2e-std');
    completed.push(id1);

    const id2 = await completeTodoStandard('e2e-std');
    completed.push(id2);

    const id3 = await completeTodoStandard('e2e-std');
    completed.push(id3);

    // All 3 TODOs should be completed
    assert.equal(completed.length, 3);
    assert.ok(completed.includes('todo-1'));
    assert.ok(completed.includes('todo-2'));
    assert.ok(completed.includes('todo-3'));

    // Finalize chain: residual-commit → code-review → final-verify → state-complete → report
    const fin1 = await next('e2e-std');
    assert.equal(fin1.action, 'engine-finalize');
    assert.equal(fin1.substep, 'residual-commit');
    stepComplete('e2e-std', fin1.stepId, {});

    const fin2 = await next('e2e-std');
    assert.equal(fin2.substep, 'code-review');
    stepComplete('e2e-std', fin2.stepId, { verdict: 'SHIP' });

    const fin3 = await next('e2e-std');
    assert.equal(fin3.substep, 'final-verify');
    stepComplete('e2e-std', fin3.stepId, { status: 'PASS' });

    const fin4 = await next('e2e-std');
    assert.equal(fin4.substep, 'state-complete');
    stepComplete('e2e-std', fin4.stepId, {});

    const fin5 = await next('e2e-std');
    assert.equal(fin5.substep, 'report');
    stepComplete('e2e-std', fin5.stepId, {});

    // Done
    const done = await next('e2e-std');
    assert.equal(done.done, true);
  });
});

// ---------------------------------------------------------------------------
// Tests: Quick mode (no verify, code-review, final-verify)
// ---------------------------------------------------------------------------

describe('E2E: quick mode skips verify steps', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('quick mode: worker → wrapup → commit (no verify)', async () => {
    setupSession('e2e-quick', 'quick');

    const init = await next('e2e-quick');
    assert.equal(init.action, 'engine-init');

    // Complete all TODOs in quick mode (3 steps each instead of 4)
    await completeTodoQuick('e2e-quick');
    await completeTodoQuick('e2e-quick');
    await completeTodoQuick('e2e-quick');

    // Finalize: quick mode has residual-commit → state-complete → report (no code-review, final-verify)
    const fin1 = await next('e2e-quick');
    assert.equal(fin1.substep, 'residual-commit');
    stepComplete('e2e-quick', fin1.stepId, {});

    const fin2 = await next('e2e-quick');
    assert.equal(fin2.substep, 'state-complete');
    stepComplete('e2e-quick', fin2.stepId, {});

    const fin3 = await next('e2e-quick');
    assert.equal(fin3.substep, 'report');
    stepComplete('e2e-quick', fin3.stepId, {});

    const done = await next('e2e-quick');
    assert.equal(done.done, true);
  });
});

// ---------------------------------------------------------------------------
// Tests: Parallel TODO dispatch
// ---------------------------------------------------------------------------

describe('E2E: parallel TODO dispatch', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('todo-1 dispatched first (independent), todo-3 also independent', async () => {
    setupSession('e2e-par', 'quick');

    await next('e2e-par'); // init

    // First worker should be todo-1 or todo-3 (both independent, graph order picks todo-1)
    const w1 = await next('e2e-par');
    assert.equal(w1.action, 'engine-worker');
    assert.ok(
      ['todo-1', 'todo-3'].includes(w1.todoId),
      `First dispatch should be independent TODO, got ${w1.todoId}`,
    );
  });

  test('todo-2 blocked until todo-1 commit completes', async () => {
    setupSession('e2e-dep', 'quick');

    await next('e2e-dep'); // init

    // Track dispatched TODOs
    const dispatched = [];

    // Complete all until we see todo-2
    for (let i = 0; i < 30; i++) {
      const step = await next('e2e-dep');
      if (step.done) break;
      if (step.action === 'engine-worker') dispatched.push(step.todoId);
      stepComplete('e2e-dep', step.stepId, verifiedResult());
    }

    // todo-2 should come after todo-1 (cross-TODO dependency)
    const idx1 = dispatched.indexOf('todo-1');
    const idx2 = dispatched.indexOf('todo-2');
    assert.ok(idx1 < idx2, `todo-1 (idx=${idx1}) should dispatch before todo-2 (idx=${idx2})`);
  });
});

// ---------------------------------------------------------------------------
// Tests: Resume from mid-execution
// ---------------------------------------------------------------------------

describe('E2E: resume from state', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('engine resumes from partially completed state', async () => {
    setupSession('e2e-resume', 'quick');

    // Init + complete first worker
    await next('e2e-resume');
    const w1 = await next('e2e-resume');
    stepComplete('e2e-resume', w1.stepId, {});

    // Verify state was saved
    const stateBefore = loadState('e2e-resume');
    assert.ok(stateBefore.engine);
    assert.ok(stateBefore.engine.initialized);

    // "Resume" — just call next() again (simulates new session loading state)
    const resumed = await next('e2e-resume');
    assert.notEqual(resumed.action, 'engine-init');
    assert.ok(resumed.action);
  });
});

// ---------------------------------------------------------------------------
// Tests: Context propagation
// ---------------------------------------------------------------------------

describe('E2E: context propagation', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('outputs from wrapup are persisted to context/outputs.json', async () => {
    setupSession('e2e-ctx', 'quick');

    await next('e2e-ctx'); // init

    // Complete first todo worker
    const w = await next('e2e-ctx');
    stepComplete('e2e-ctx', w.stepId, {});

    // Wrapup with outputs
    const wu = await next('e2e-ctx');
    stepComplete('e2e-ctx', wu.stepId, {
      outputs: { parser: 'src/parser.js' },
      learnings: 'Used recursive descent',
    });

    // Verify context files
    const outputsPath = join(tmpDir, '.dev', 'specs', 'e2e-ctx', 'context', 'outputs.json');
    const outputs = JSON.parse(readFileSync(outputsPath, 'utf8'));
    assert.ok(outputs[w.todoId]);
    assert.equal(outputs[w.todoId].parser, 'src/parser.js');

    const learningsPath = join(tmpDir, '.dev', 'specs', 'e2e-ctx', 'context', 'learnings.md');
    const learnings = readFileSync(learningsPath, 'utf8');
    assert.ok(learnings.includes('recursive descent'));
  });
});
