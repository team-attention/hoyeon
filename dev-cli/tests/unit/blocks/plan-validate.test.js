/**
 * plan-validate.test.js — Unit tests for plan-validate block
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { planValidate } from '../../../src/blocks/plan-validate.js';
import { planContentPath } from '../../../src/core/paths.js';

// ---------------------------------------------------------------------------
// Temp dir management
// ---------------------------------------------------------------------------

let tmpDir;
const originalCwd = process.cwd;

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-plan-validate-test-'));
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
 * Build a minimal valid plan-content.json object.
 */
function buildValidPlan(overrides = {}) {
  return {
    context: {
      originalRequest: 'Add JWT auth',
      interviewSummary: 'User wants JWT-based authentication.',
      researchFindings: 'Express.js codebase with no auth.',
    },
    objectives: {
      core: 'Add JWT authentication',
      deliverables: ['Auth middleware', 'Login endpoint'],
      dod: ['All tests pass', 'JWT tokens issued'],
      mustNotDo: ['Do not modify database schema'],
    },
    todos: [
      {
        id: 'todo-1',
        title: 'Add auth middleware',
        type: 'work',
        inputs: [{ name: 'codebase', type: 'file', ref: 'src/' }],
        outputs: [{ name: 'middleware', type: 'file', value: 'src/middleware/auth.js', description: 'Auth middleware' }],
        steps: ['Create middleware file', 'Add JWT verification'],
        mustNotDo: ['Do not hardcode secrets'],
        references: ['src/app.js'],
        acceptanceCriteria: {
          functional: ['JWT tokens are validated'],
          static: ['No lint errors'],
          runtime: ['Tests pass'],
        },
        risk: 'LOW',
      },
      {
        id: 'todo-2',
        title: 'Add login endpoint',
        type: 'work',
        inputs: [{ name: 'middleware', type: 'file', ref: 'src/middleware/auth.js' }],
        outputs: [{ name: 'endpoint', type: 'file', value: 'src/routes/auth.js', description: 'Login route' }],
        steps: ['Create route handler'],
        mustNotDo: [],
        references: [],
        acceptanceCriteria: {
          functional: ['Returns JWT on valid credentials'],
          static: [],
          runtime: ['Integration test passes'],
        },
        risk: 'MEDIUM',
      },
    ],
    taskFlow: 'todo-1 → todo-2',
    dependencyGraph: [
      { todo: 'todo-1', requires: [], produces: ['auth-middleware'] },
      { todo: 'todo-2', requires: ['auth-middleware'], produces: ['login-endpoint'] },
    ],
    commitStrategy: [
      { afterTodo: 'todo-1', message: 'feat: add auth middleware', files: ['src/middleware/auth.js'], condition: 'tests pass' },
      { afterTodo: 'todo-2', message: 'feat: add login endpoint', files: ['src/routes/auth.js'], condition: 'tests pass' },
    ],
    verificationSummary: {
      aItems: ['Lint passes', 'Tests pass'],
      hItems: ['Manual login test'],
      sItems: ['JWT token expiry test'],
      gaps: [],
    },
    ...overrides,
  };
}

function writePlan(name, data) {
  const path = planContentPath(name);
  mkdirSync(join(tmpDir, '.dev', 'specs', name), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('planValidate()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('valid plan returns valid:true with no errors', () => {
    const plan = buildValidPlan();
    writePlan('valid-plan', plan);

    const result = planValidate('valid-plan');

    assert.equal(result.valid, true);
    assert.deepEqual(result.schemaErrors, []);
    // empty-gaps warning is expected for the test data
    const nonGapWarnings = result.semanticWarnings.filter(w => w.type !== 'empty-gaps');
    assert.deepEqual(nonGapWarnings, []);
  });

  test('reports schema errors for missing fields', () => {
    writePlan('invalid-plan', { context: {} });

    const result = planValidate('invalid-plan');

    assert.equal(result.valid, false);
    assert.ok(result.schemaErrors.length > 0);
  });

  test('detects duplicate todo IDs', () => {
    const plan = buildValidPlan();
    plan.todos[1].id = 'todo-1'; // duplicate
    writePlan('dup-ids', plan);

    const result = planValidate('dup-ids');

    assert.equal(result.valid, false);
    const dup = result.semanticWarnings.find(w => w.type === 'duplicate-todo-id');
    assert.ok(dup, 'Expected duplicate-todo-id warning');
    assert.ok(dup.message.includes('todo-1'));
  });

  test('detects invalid dependencyGraph references', () => {
    const plan = buildValidPlan();
    plan.dependencyGraph.push({ todo: 'todo-999', requires: [], produces: [] });
    writePlan('bad-dep-ref', plan);

    const result = planValidate('bad-dep-ref');

    assert.equal(result.valid, false);
    const warning = result.semanticWarnings.find(w => w.type === 'invalid-dependency-ref');
    assert.ok(warning, 'Expected invalid-dependency-ref warning');
    assert.ok(warning.message.includes('todo-999'));
  });

  test('detects invalid commitStrategy references', () => {
    const plan = buildValidPlan();
    plan.commitStrategy.push({
      afterTodo: 'todo-nonexistent',
      message: 'bad commit',
      files: [],
      condition: 'never',
    });
    writePlan('bad-commit-ref', plan);

    const result = planValidate('bad-commit-ref');

    assert.equal(result.valid, false);
    const warning = result.semanticWarnings.find(w => w.type === 'invalid-commit-ref');
    assert.ok(warning, 'Expected invalid-commit-ref warning');
  });

  test('detects dependency cycles', () => {
    const plan = buildValidPlan();
    // Create a cycle: todo-1 requires what todo-2 produces, todo-2 requires what todo-1 produces
    plan.dependencyGraph = [
      { todo: 'todo-1', requires: ['login-endpoint'], produces: ['auth-middleware'] },
      { todo: 'todo-2', requires: ['auth-middleware'], produces: ['login-endpoint'] },
    ];
    writePlan('cycle-plan', plan);

    const result = planValidate('cycle-plan');

    assert.equal(result.valid, false);
    const cycle = result.semanticWarnings.find(w => w.type === 'dependency-cycle');
    assert.ok(cycle, 'Expected dependency-cycle warning');
  });

  test('warns about empty sItems', () => {
    const plan = buildValidPlan();
    plan.verificationSummary.sItems = [];
    writePlan('empty-sitems', plan);

    const result = planValidate('empty-sitems');

    const warning = result.semanticWarnings.find(w => w.type === 'empty-sItems');
    assert.ok(warning, 'Expected empty-sItems warning');
  });

  test('warns about empty gaps', () => {
    const plan = buildValidPlan();
    plan.verificationSummary.gaps = [];
    writePlan('empty-gaps', plan);

    const result = planValidate('empty-gaps');

    const warning = result.semanticWarnings.find(w => w.type === 'empty-gaps');
    assert.ok(warning, 'Expected empty-gaps warning');
  });

  test('computes correct stats', () => {
    const plan = buildValidPlan();
    writePlan('stats-plan', plan);

    const result = planValidate('stats-plan');

    assert.equal(result.stats.todos, 2);
    assert.equal(result.stats.dependencies, 2);
    assert.equal(result.stats.commits, 2);
    assert.equal(result.stats.verification.aItems, 2);
    assert.equal(result.stats.verification.hItems, 1);
    assert.equal(result.stats.verification.sItems, 1);
    assert.equal(result.stats.verification.gaps, 0);
  });

  test('accepts --data custom path', () => {
    const plan = buildValidPlan();
    const customPath = join(tmpDir, 'custom-plan.json');
    writeFileSync(customPath, JSON.stringify(plan, null, 2), 'utf8');

    // name doesn't matter when --data is provided
    const result = planValidate('irrelevant', customPath);

    assert.equal(result.valid, true);
  });

  test('throws for missing file', () => {
    mkdirSync(join(tmpDir, '.dev', 'specs', 'missing-plan'), { recursive: true });

    assert.throws(
      () => planValidate('missing-plan'),
      /Cannot read plan-content file/,
    );
  });

  test('throws for invalid JSON', () => {
    const path = planContentPath('bad-json');
    mkdirSync(join(tmpDir, '.dev', 'specs', 'bad-json'), { recursive: true });
    writeFileSync(path, '{ invalid json }', 'utf8');

    assert.throws(
      () => planValidate('bad-json'),
      /Invalid JSON/,
    );
  });
});
