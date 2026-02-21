/**
 * schemas.test.js — Unit tests for dev-cli/src/schemas/plan-content.schema.js
 * Uses node:test and node:assert (no external test frameworks).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validatePlanContent } from '../../src/schemas/plan-content.schema.js';

// ---------------------------------------------------------------------------
// Valid fixture
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
          { name: 'middleware', type: 'file', value: 'src/auth/middleware.js', description: 'JWT middleware' },
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
    ],
    taskFlow: 'TODO 1 → TODO 2',
    dependencyGraph: [
      { todo: 'todo-1', requires: [], produces: ['middleware'] },
    ],
    commitStrategy: [
      { afterTodo: 'todo-1', message: 'feat(auth): add JWT middleware', files: ['src/auth/middleware.js'], condition: 'all tests pass' },
    ],
    verificationSummary: {
      aItems: ['JWT tokens are validated correctly'],
      hItems: ['Security review of token expiry logic'],
      sItems: ['E2E auth flow sandbox test'],
      gaps: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests: valid fixture
// ---------------------------------------------------------------------------

describe('validatePlanContent() — valid fixture', () => {
  test('accepts well-formed plan-content', () => {
    const data = makeValidPlanContent();
    const result = validatePlanContent(data);
    assert.equal(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
    assert.deepEqual(result.errors, []);
  });

  test('returns { valid, errors } shape', () => {
    const data = makeValidPlanContent();
    const result = validatePlanContent(data);
    assert.ok(Object.prototype.hasOwnProperty.call(result, 'valid'), 'result must have valid');
    assert.ok(Object.prototype.hasOwnProperty.call(result, 'errors'), 'result must have errors');
    assert.ok(Array.isArray(result.errors), 'errors must be array');
  });
});

// ---------------------------------------------------------------------------
// Tests: missing required top-level fields
// ---------------------------------------------------------------------------

describe('validatePlanContent() — missing required fields', () => {
  test('reports error for missing context', () => {
    const data = makeValidPlanContent();
    delete data.context;
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'context');
    assert.ok(err, `Expected error for 'context', got: ${JSON.stringify(result.errors)}`);
    assert.ok(err.message.includes('context'));
  });

  test('reports error for missing objectives', () => {
    const data = makeValidPlanContent();
    delete data.objectives;
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'objectives');
    assert.ok(err, `Expected error for 'objectives'`);
  });

  test('reports error for missing todos', () => {
    const data = makeValidPlanContent();
    delete data.todos;
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'todos');
    assert.ok(err, `Expected error for 'todos'`);
  });

  test('reports error for missing taskFlow', () => {
    const data = makeValidPlanContent();
    delete data.taskFlow;
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'taskFlow');
    assert.ok(err, `Expected error for 'taskFlow'`);
  });

  test('reports error for missing dependencyGraph', () => {
    const data = makeValidPlanContent();
    delete data.dependencyGraph;
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'dependencyGraph');
    assert.ok(err, `Expected error for 'dependencyGraph'`);
  });

  test('reports error for missing commitStrategy', () => {
    const data = makeValidPlanContent();
    delete data.commitStrategy;
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'commitStrategy');
    assert.ok(err, `Expected error for 'commitStrategy'`);
  });

  test('reports error for missing verificationSummary', () => {
    const data = makeValidPlanContent();
    delete data.verificationSummary;
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'verificationSummary');
    assert.ok(err, `Expected error for 'verificationSummary'`);
  });

  test('reports multiple errors for multiple missing fields', () => {
    const data = makeValidPlanContent();
    delete data.context;
    delete data.objectives;
    delete data.taskFlow;
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 3, `Expected at least 3 errors, got ${result.errors.length}`);
  });
});

// ---------------------------------------------------------------------------
// Tests: missing required nested fields (context)
// ---------------------------------------------------------------------------

describe('validatePlanContent() — missing nested context fields', () => {
  test('reports error for missing context.originalRequest', () => {
    const data = makeValidPlanContent();
    delete data.context.originalRequest;
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'context.originalRequest');
    assert.ok(err, `Expected error for 'context.originalRequest'`);
  });

  test('reports error for missing context.interviewSummary', () => {
    const data = makeValidPlanContent();
    delete data.context.interviewSummary;
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'context.interviewSummary');
    assert.ok(err, `Expected error for 'context.interviewSummary'`);
  });

  test('reports error for missing context.researchFindings', () => {
    const data = makeValidPlanContent();
    delete data.context.researchFindings;
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'context.researchFindings');
    assert.ok(err, `Expected error for 'context.researchFindings'`);
  });
});

// ---------------------------------------------------------------------------
// Tests: wrong types
// ---------------------------------------------------------------------------

describe('validatePlanContent() — wrong types', () => {
  test('reports error when taskFlow is not a string', () => {
    const data = makeValidPlanContent();
    data.taskFlow = 42;
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'taskFlow');
    assert.ok(err, `Expected type error for 'taskFlow'`);
    assert.ok(err.message.includes('string'));
  });

  test('reports error when todos is not an array', () => {
    const data = makeValidPlanContent();
    data.todos = 'not-an-array';
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'todos');
    assert.ok(err, `Expected type error for 'todos'`);
    assert.ok(err.message.includes('array'));
  });

  test('reports error when objectives.deliverables is not an array', () => {
    const data = makeValidPlanContent();
    data.objectives.deliverables = 'string-not-array';
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'objectives.deliverables');
    assert.ok(err, `Expected type error for 'objectives.deliverables'`);
  });

  test('reports error when context is not an object', () => {
    const data = makeValidPlanContent();
    data.context = 'not-an-object';
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'context');
    assert.ok(err, `Expected type error for 'context'`);
  });

  test('reports error when todo.risk is not a valid value', () => {
    const data = makeValidPlanContent();
    data.todos[0].risk = 'UNKNOWN';
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'todos[0].risk');
    assert.ok(err, `Expected error for invalid 'todos[0].risk'`);
  });

  test('reports error when todo.type is invalid', () => {
    const data = makeValidPlanContent();
    data.todos[0].type = 'invalid-type';
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'todos[0].type');
    assert.ok(err, `Expected error for invalid 'todos[0].type'`);
  });
});

// ---------------------------------------------------------------------------
// Tests: optional fields do not error when absent
// ---------------------------------------------------------------------------

describe('validatePlanContent() — optional fields', () => {
  test('context.assumptions is optional — no error when absent', () => {
    const data = makeValidPlanContent();
    delete data.context.assumptions;
    const result = validatePlanContent(data);
    assert.equal(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
  });

  test('acceptanceCriteria.cleanup is optional — no error when absent', () => {
    const data = makeValidPlanContent();
    delete data.todos[0].acceptanceCriteria.cleanup;
    const result = validatePlanContent(data);
    assert.equal(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
  });

  test('plan with no assumptions and no cleanup still validates', () => {
    const data = makeValidPlanContent();
    delete data.context.assumptions;
    delete data.todos[0].acceptanceCriteria.cleanup;
    const result = validatePlanContent(data);
    assert.equal(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
  });
});

// ---------------------------------------------------------------------------
// Tests: nested validation (todos[0].acceptanceCriteria)
// ---------------------------------------------------------------------------

describe('validatePlanContent() — nested todo validation', () => {
  test('reports error when todos[0].acceptanceCriteria is missing', () => {
    const data = makeValidPlanContent();
    delete data.todos[0].acceptanceCriteria;
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'todos[0].acceptanceCriteria');
    assert.ok(err, `Expected error for missing 'todos[0].acceptanceCriteria'`);
  });

  test('reports error when todos[0].acceptanceCriteria.functional is missing', () => {
    const data = makeValidPlanContent();
    delete data.todos[0].acceptanceCriteria.functional;
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'todos[0].acceptanceCriteria.functional');
    assert.ok(err, `Expected error for missing 'todos[0].acceptanceCriteria.functional'`);
  });

  test('reports error when todos[0].acceptanceCriteria.static is missing', () => {
    const data = makeValidPlanContent();
    delete data.todos[0].acceptanceCriteria.static;
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'todos[0].acceptanceCriteria.static');
    assert.ok(err, `Expected error for missing 'todos[0].acceptanceCriteria.static'`);
  });

  test('reports error when todos[0] is not an object', () => {
    const data = makeValidPlanContent();
    data.todos[0] = 'not-an-object';
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'todos[0]');
    assert.ok(err, `Expected error for non-object todos[0]`);
  });

  test('validates multiple todos independently', () => {
    const data = makeValidPlanContent();
    // Add second todo with missing id
    data.todos.push({
      title: 'Second TODO',
      type: 'verification',
      inputs: [],
      outputs: [],
      steps: ['Check something'],
      mustNotDo: [],
      references: [],
      acceptanceCriteria: { functional: [], static: [], runtime: [] },
      risk: 'LOW',
    });
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    const err = result.errors.find((e) => e.path === 'todos[1].id');
    assert.ok(err, `Expected error for missing 'todos[1].id'`);
  });
});

// ---------------------------------------------------------------------------
// Tests: error structure
// ---------------------------------------------------------------------------

describe('validatePlanContent() — error structure', () => {
  test('each error has path, message, expected fields', () => {
    const data = makeValidPlanContent();
    delete data.context;
    delete data.taskFlow;
    const result = validatePlanContent(data);
    assert.equal(result.valid, false);
    for (const err of result.errors) {
      assert.ok(Object.prototype.hasOwnProperty.call(err, 'path'), 'error must have path');
      assert.ok(Object.prototype.hasOwnProperty.call(err, 'message'), 'error must have message');
      assert.ok(Object.prototype.hasOwnProperty.call(err, 'expected'), 'error must have expected');
      assert.ok(typeof err.message === 'string', 'error.message must be string');
    }
  });

  test('returns empty errors array for valid input', () => {
    const data = makeValidPlanContent();
    const result = validatePlanContent(data);
    assert.equal(result.errors.length, 0);
  });

  test('returns valid=false for null input', () => {
    const result = validatePlanContent(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  test('returns valid=false for non-object input', () => {
    const result = validatePlanContent('not an object');
    assert.equal(result.valid, false);
  });
});
