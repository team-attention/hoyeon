/**
 * plan.test.js — Unit tests for plan-phase block implementations
 * Uses node:test and node:assert (no external test frameworks).
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// State management
import { createState, loadState, updateState } from '../../../src/core/state.js';

// Blocks under test
import { planGenerate } from '../../../src/blocks/plan-generate.js';
import { planSummary } from '../../../src/blocks/plan-summary.js';
import { stepComplete } from '../../../src/blocks/step-complete.js';
import { stepInvalidate } from '../../../src/blocks/step-invalidate.js';
import { cleanup } from '../../../src/blocks/cleanup.js';

// ---------------------------------------------------------------------------
// Temp dir management (same pattern as other tests)
// ---------------------------------------------------------------------------

let tmpDir;
const originalCwd = process.cwd;

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-plan-test-'));
  process.cwd = () => tmpDir;
}

function restoreCwd() {
  process.cwd = originalCwd;
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Valid plan-content fixture
// ---------------------------------------------------------------------------

function makeValidPlanContent() {
  return {
    context: {
      originalRequest: 'Add authentication to the API',
      interviewSummary: 'User wants JWT-based auth with refresh tokens',
      researchFindings: 'Existing codebase uses Express; passport.js is available',
      assumptions: 'Node.js 22+ environment assumed',
    },
    objectives: {
      core: 'Implement JWT authentication middleware',
      deliverables: ['auth middleware', 'login endpoint', 'refresh endpoint'],
      dod: ['All tests pass', 'No security vulnerabilities'],
      mustNotDo: ['Do not modify user schema', 'Do not use session cookies'],
    },
    todos: [
      {
        id: 'todo-1',
        title: 'Implement JWT middleware',
        type: 'work',
        inputs: [
          { name: 'express-app', type: 'file', ref: 'src/app.js' },
        ],
        outputs: [
          {
            name: 'middleware',
            type: 'file',
            value: 'src/auth/middleware.js',
            description: 'JWT middleware',
          },
        ],
        steps: ['Create middleware file', 'Add token validation', 'Write tests'],
        mustNotDo: ['Do not log tokens'],
        references: ['https://jwt.io/'],
        acceptanceCriteria: {
          functional: ['Middleware validates JWT tokens'],
          static: ['tsc --noEmit passes'],
          runtime: ['npm test passes'],
          cleanup: ['Remove debug logs'],
        },
        risk: 'MEDIUM',
      },
      {
        id: 'todo-2',
        title: 'Write integration tests',
        type: 'verification',
        inputs: [{ name: 'middleware', type: 'file', ref: 'src/auth/middleware.js' }],
        outputs: [
          { name: 'test-file', type: 'file', value: 'tests/auth.test.js', description: 'Auth integration tests' },
        ],
        steps: ['Write test fixtures', 'Write tests', 'Run tests'],
        mustNotDo: ['Do not test implementation details'],
        references: [],
        acceptanceCriteria: {
          functional: ['All auth tests pass'],
          static: ['eslint passes'],
          runtime: ['npm test passes'],
        },
        risk: 'LOW',
      },
    ],
    taskFlow: 'todo-1 → todo-2',
    dependencyGraph: [
      { todo: 'todo-1', requires: [], produces: ['middleware'] },
      { todo: 'todo-2', requires: ['middleware'], produces: ['test-file'] },
    ],
    commitStrategy: [
      {
        afterTodo: 'todo-1',
        message: 'feat(auth): add JWT middleware',
        files: ['src/auth/middleware.js'],
        condition: 'all tests pass',
      },
    ],
    verificationSummary: {
      aItems: ['JWT tokens are validated correctly', 'Auth endpoints return correct status codes'],
      hItems: ['Security review of token expiry logic'],
      sItems: ['E2E auth flow sandbox test'],
      gaps: ['Rate limiting not verified'],
    },
  };
}

/**
 * Write a plan-content.json fixture to temp dir and return path.
 */
function writePlanContentFixture(data) {
  const fixturePath = join(tmpDir, 'plan-content.json');
  writeFileSync(fixturePath, JSON.stringify(data, null, 2), 'utf8');
  return fixturePath;
}

/**
 * Initialize a session with recipe blocks stored in state.
 */
function createSessionWithBlocks(sessionName, blocks) {
  createState(sessionName, { recipe: null });
  updateState(sessionName, { recipeBlocks: blocks });
  return loadState(sessionName);
}

// ---------------------------------------------------------------------------
// planGenerate tests
// ---------------------------------------------------------------------------

describe('planGenerate()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('produces PLAN.md with valid fixture', () => {
    const data = makeValidPlanContent();
    const fixturePath = writePlanContentFixture(data);

    const { planPath } = planGenerate('my-session', fixturePath);

    assert.ok(existsSync(planPath), `PLAN.md should exist at ${planPath}`);
    const content = readFileSync(planPath, 'utf8');
    assert.ok(content.length > 0, 'PLAN.md should not be empty');
  });

  test('PLAN.md contains plan name in title', () => {
    const data = makeValidPlanContent();
    const fixturePath = writePlanContentFixture(data);

    const { planPath } = planGenerate('auth-feature', fixturePath);

    const content = readFileSync(planPath, 'utf8');
    assert.ok(content.includes('auth-feature'), 'PLAN.md should include the session name');
  });

  test('PLAN.md contains Verification Summary section', () => {
    const data = makeValidPlanContent();
    const fixturePath = writePlanContentFixture(data);

    const { planPath } = planGenerate('auth-feature', fixturePath);

    const content = readFileSync(planPath, 'utf8');
    assert.ok(content.includes('## Verification Summary'), 'Should include Verification Summary');
    assert.ok(content.includes('### Agent-Verifiable (A-items)'), 'Should include A-items section');
    assert.ok(content.includes('### Human-Required (H-items)'), 'Should include H-items section');
    assert.ok(content.includes('### Sandbox Agent Testing (S-items)'), 'Should include S-items section');
  });

  test('PLAN.md contains TODO sections', () => {
    const data = makeValidPlanContent();
    const fixturePath = writePlanContentFixture(data);

    const { planPath } = planGenerate('auth-feature', fixturePath);

    const content = readFileSync(planPath, 'utf8');
    assert.ok(content.includes('### [ ] TODO 1:'), 'Should include TODO 1');
    assert.ok(content.includes('### [ ] TODO 2:'), 'Should include TODO 2');
    assert.ok(content.includes('Implement JWT middleware'), 'Should include first TODO title');
    assert.ok(content.includes('Write integration tests'), 'Should include second TODO title');
  });

  test('PLAN.md is written to correct path', () => {
    const data = makeValidPlanContent();
    const fixturePath = writePlanContentFixture(data);

    const { planPath } = planGenerate('correct-path', fixturePath);

    const expectedPath = join(tmpDir, '.dev', 'specs', 'correct-path', 'PLAN.md');
    assert.equal(planPath, expectedPath);
    assert.ok(existsSync(planPath));
  });

  test('halts with error on invalid fixture', () => {
    const invalidData = { context: { originalRequest: 'test' } }; // missing required fields
    const fixturePath = writePlanContentFixture(invalidData);

    assert.throws(
      () => planGenerate('fail-session', fixturePath),
      (err) => {
        assert.ok(err instanceof Error, 'Should throw Error');
        assert.ok(err.message.includes('validation failed'), `Error message should mention validation: ${err.message}`);
        return true;
      },
    );
  });

  test('halts with actionable error listing field errors', () => {
    const invalidData = { taskFlow: 123, objectives: 'wrong' }; // type errors
    const fixturePath = writePlanContentFixture(invalidData);

    assert.throws(
      () => planGenerate('error-session', fixturePath),
      (err) => {
        assert.ok(err.message.includes('error'), 'Error should mention errors');
        // Should list specific paths
        assert.ok(err.message.length > 50, 'Error should be descriptive');
        return true;
      },
    );
  });

  test('halts with error if data file does not exist', () => {
    assert.throws(
      () => planGenerate('no-file-session', '/nonexistent/path/plan-content.json'),
      /Cannot read plan-content file/,
    );
  });

  test('halts with error if data file contains invalid JSON', () => {
    const badJsonPath = join(tmpDir, 'bad.json');
    writeFileSync(badJsonPath, '{ not: valid json }', 'utf8');

    assert.throws(
      () => planGenerate('bad-json-session', badJsonPath),
      /Invalid JSON/,
    );
  });

  test('PLAN.md contains Core Objective text', () => {
    const data = makeValidPlanContent();
    const fixturePath = writePlanContentFixture(data);

    const { planPath } = planGenerate('obj-test', fixturePath);
    const content = readFileSync(planPath, 'utf8');
    assert.ok(
      content.includes('Implement JWT authentication middleware'),
      'PLAN.md should contain the core objective',
    );
  });

  test('PLAN.md contains dependency graph', () => {
    const data = makeValidPlanContent();
    const fixturePath = writePlanContentFixture(data);

    const { planPath } = planGenerate('dep-test', fixturePath);
    const content = readFileSync(planPath, 'utf8');
    assert.ok(content.includes('## Dependency Graph'), 'Should include Dependency Graph section');
    assert.ok(content.includes('todo-1'), 'Should mention todo-1 in dependency graph');
  });
});

// ---------------------------------------------------------------------------
// planSummary tests
// ---------------------------------------------------------------------------

describe('planSummary()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  function createPlanForSummary(sessionName) {
    const data = makeValidPlanContent();
    const fixturePath = writePlanContentFixture(data);
    return planGenerate(sessionName, fixturePath);
  }

  test('returns summary and data', () => {
    createPlanForSummary('summary-test');
    const result = planSummary('summary-test');

    assert.ok(Object.prototype.hasOwnProperty.call(result, 'summary'), 'Should have summary');
    assert.ok(Object.prototype.hasOwnProperty.call(result, 'data'), 'Should have data');
    assert.ok(typeof result.summary === 'string', 'summary must be string');
    assert.ok(typeof result.data === 'object', 'data must be object');
  });

  test('extracts correct TODO count', () => {
    createPlanForSummary('todo-count-test');
    const { data } = planSummary('todo-count-test');

    assert.equal(data.todoCount, 2, `Expected 2 TODOs, got ${data.todoCount}`);
  });

  test('extracts correct A-item count', () => {
    createPlanForSummary('a-items-test');
    const { data } = planSummary('a-items-test');

    assert.equal(data.aItemCount, 2, `Expected 2 A-items, got ${data.aItemCount}`);
  });

  test('extracts correct H-item count', () => {
    createPlanForSummary('h-items-test');
    const { data } = planSummary('h-items-test');

    assert.equal(data.hItemCount, 1, `Expected 1 H-item, got ${data.hItemCount}`);
  });

  test('extracts correct S-item count', () => {
    createPlanForSummary('s-items-test');
    const { data } = planSummary('s-items-test');

    assert.equal(data.sItemCount, 1, `Expected 1 S-item, got ${data.sItemCount}`);
  });

  test('extracts verification gap count', () => {
    createPlanForSummary('gaps-test');
    const { data } = planSummary('gaps-test');

    assert.equal(data.gapCount, 1, `Expected 1 gap, got ${data.gapCount}`);
  });

  test('summary text includes session name', () => {
    createPlanForSummary('named-session');
    const { summary } = planSummary('named-session');

    assert.ok(summary.includes('named-session'), 'Summary should include session name');
  });

  test('summary text includes TODO count', () => {
    createPlanForSummary('count-in-summary');
    const { summary } = planSummary('count-in-summary');

    assert.ok(summary.includes('2'), 'Summary should include TODO count "2"');
  });

  test('summary text includes A/H/S counts', () => {
    createPlanForSummary('ahs-summary');
    const { summary } = planSummary('ahs-summary');

    assert.ok(summary.includes('A='), 'Summary should include A= count');
    assert.ok(summary.includes('H='), 'Summary should include H= count');
    assert.ok(summary.includes('S='), 'Summary should include S= count');
  });

  test('throws if PLAN.md does not exist', () => {
    assert.throws(
      () => planSummary('nonexistent-session'),
      /No PLAN\.md found/,
    );
  });
});

// ---------------------------------------------------------------------------
// stepComplete tests
// ---------------------------------------------------------------------------

describe('stepComplete()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  const LLM_BLOCKS = [
    { id: 'block-1', type: 'llm', instruction: 'Do block 1' },
    { id: 'block-2', type: 'llm', instruction: 'Do block 2' },
  ];

  test('acknowledges pendingAction after next() call', async () => {
    // Import next here to avoid circular issues
    const { next } = await import('../../../src/core/sequencer.js');

    createSessionWithBlocks('sc-test', LLM_BLOCKS);
    await next('sc-test');

    const before = loadState('sc-test');
    assert.equal(before.pendingAction.acknowledged, false);

    stepComplete('sc-test', 'block-1', 'ok');

    const after = loadState('sc-test');
    assert.equal(after.pendingAction.acknowledged, true);
  });

  test('advances blockIndex by 1', async () => {
    const { next } = await import('../../../src/core/sequencer.js');

    createSessionWithBlocks('sc-advance', LLM_BLOCKS);
    await next('sc-advance');

    const before = loadState('sc-advance');
    const prevIndex = before.blockIndex;

    stepComplete('sc-advance', 'block-1', null);

    const after = loadState('sc-advance');
    assert.equal(after.blockIndex, prevIndex + 1);
  });

  test('stores step result in state.steps', async () => {
    const { next } = await import('../../../src/core/sequencer.js');

    createSessionWithBlocks('sc-result', LLM_BLOCKS);
    await next('sc-result');
    stepComplete('sc-result', 'block-1', 'ok');

    const state = loadState('sc-result');
    assert.ok(state.steps['block-1'], 'steps entry should exist');
    assert.equal(state.steps['block-1'].status, 'done');
    assert.equal(state.steps['block-1'].result, 'ok');
  });

  test('returns updated state object', async () => {
    const { next } = await import('../../../src/core/sequencer.js');

    createSessionWithBlocks('sc-return', LLM_BLOCKS);
    await next('sc-return');
    const result = stepComplete('sc-return', 'block-1', null);

    assert.ok(result && typeof result === 'object', 'Should return state object');
    assert.ok(Object.prototype.hasOwnProperty.call(result, 'blockIndex'));
  });
});

// ---------------------------------------------------------------------------
// stepInvalidate tests
// ---------------------------------------------------------------------------

describe('stepInvalidate()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('marks target step as stale', () => {
    const blocks = [
      { id: 'step-a', type: 'llm', instruction: 'A' },
      { id: 'step-b', type: 'llm', instruction: 'B' },
    ];
    createSessionWithBlocks('si-test', blocks);
    updateState('si-test', {
      steps: {
        'step-a': { status: 'done' },
        'step-b': { status: 'done' },
      },
    });

    stepInvalidate('si-test', 'step-a');

    const state = loadState('si-test');
    assert.equal(state.steps['step-a'].status, 'stale', 'step-a should be stale');
  });

  test('marks downstream steps as stale', () => {
    const blocks = [
      { id: 'step-a', type: 'llm', instruction: 'A' },
      { id: 'step-b', type: 'llm', instruction: 'B' },
      { id: 'step-c', type: 'llm', instruction: 'C' },
    ];
    createSessionWithBlocks('si-downstream', blocks);
    updateState('si-downstream', {
      steps: {
        'step-a': { status: 'done' },
        'step-b': { status: 'done' },
        'step-c': { status: 'done' },
      },
    });

    stepInvalidate('si-downstream', 'step-b');

    const state = loadState('si-downstream');
    assert.equal(state.steps['step-a'].status, 'done', 'step-a should remain done');
    assert.equal(state.steps['step-b'].status, 'stale', 'step-b should be stale');
    assert.equal(state.steps['step-c'].status, 'stale', 'step-c should be stale');
  });

  test('creates stale entry for unrecorded step', () => {
    const blocks = [{ id: 'new-step', type: 'llm', instruction: 'New' }];
    createSessionWithBlocks('si-new', blocks);

    stepInvalidate('si-new', 'new-step');

    const state = loadState('si-new');
    assert.ok(state.steps['new-step']);
    assert.equal(state.steps['new-step'].status, 'stale');
  });

  test('returns updated state object', () => {
    const blocks = [{ id: 'x', type: 'llm', instruction: 'X' }];
    createSessionWithBlocks('si-return', blocks);

    const result = stepInvalidate('si-return', 'x');

    assert.ok(result && typeof result === 'object', 'Should return state object');
  });
});

// ---------------------------------------------------------------------------
// cleanup tests
// ---------------------------------------------------------------------------

describe('cleanup()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  function setupSession(sessionName) {
    createState(sessionName, {});

    const specDir = join(tmpDir, '.dev', 'specs', sessionName);
    mkdirSync(specDir, { recursive: true });

    // Create DRAFT.md
    const draftPath = join(specDir, 'DRAFT.md');
    writeFileSync(draftPath, '# Draft\n', 'utf8');

    // Create active-spec pointer
    const devDir = join(tmpDir, '.dev');
    mkdirSync(devDir, { recursive: true });
    const activeSpecPath = join(devDir, 'active-spec');
    writeFileSync(activeSpecPath, sessionName, 'utf8');

    return { specDir, draftPath, activeSpecPath };
  }

  test('removes DRAFT.md', () => {
    const { draftPath } = setupSession('cleanup-draft');

    assert.ok(existsSync(draftPath), 'DRAFT.md should exist before cleanup');

    cleanup('cleanup-draft');

    assert.equal(existsSync(draftPath), false, 'DRAFT.md should be removed after cleanup');
  });

  test('removes active-spec pointer', () => {
    const { activeSpecPath } = setupSession('cleanup-active');

    assert.ok(existsSync(activeSpecPath), 'active-spec should exist before cleanup');

    cleanup('cleanup-active');

    assert.equal(existsSync(activeSpecPath), false, 'active-spec should be removed after cleanup');
  });

  test('updates state phase to completed', () => {
    setupSession('cleanup-state');

    cleanup('cleanup-state');

    const state = loadState('cleanup-state');
    assert.equal(state.phase, 'completed', 'phase should be "completed"');
  });

  test('clears pendingAction in state', () => {
    const { } = setupSession('cleanup-pending');
    // Set a pending action first
    updateState('cleanup-pending', {
      pendingAction: {
        block: 'some-block',
        action: 'llm',
        instruction: 'do stuff',
        issuedAt: new Date().toISOString(),
        acknowledged: false,
      },
    });

    cleanup('cleanup-pending');

    const state = loadState('cleanup-pending');
    assert.equal(state.pendingAction, null, 'pendingAction should be null after cleanup');
  });

  test('returns removed paths and stateUpdated:true', () => {
    setupSession('cleanup-result');

    const result = cleanup('cleanup-result');

    assert.ok(Array.isArray(result.removed), 'removed should be array');
    assert.ok(result.removed.length >= 2, 'Should report at least 2 removed paths');
    assert.equal(result.stateUpdated, true);
  });

  test('does not fail if DRAFT.md is already missing', () => {
    createState('cleanup-no-draft', {});
    // Do NOT create DRAFT.md — only create active-spec

    const devDir = join(tmpDir, '.dev');
    const specDir = join(devDir, 'specs', 'cleanup-no-draft');
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(devDir, 'active-spec'), 'cleanup-no-draft', 'utf8');

    assert.doesNotThrow(() => cleanup('cleanup-no-draft'));
  });

  test('does not fail if active-spec is already missing', () => {
    createState('cleanup-no-active', {});
    const specDir = join(tmpDir, '.dev', 'specs', 'cleanup-no-active');
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, 'DRAFT.md'), '# Draft\n', 'utf8');
    // Do NOT create active-spec

    assert.doesNotThrow(() => cleanup('cleanup-no-active'));
  });

  test('throws if session state does not exist', () => {
    assert.throws(
      () => cleanup('nonexistent-session'),
      /No state found/,
    );
  });
});
