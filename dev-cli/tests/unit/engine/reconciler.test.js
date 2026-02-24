/**
 * reconciler.test.js — Unit tests for reconciler module
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { triage, scopeCheck, canRetry, canAdapt, buildAuditEntry } from '../../../src/engine/reconciler.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

function failedResult(overrides = {}) {
  return {
    status: 'FAILED',
    criteria: [
      { name: 'func-1', pass: true, evidence: 'ok' },
      { name: 'func-2', pass: false, evidence: 'failed assertion' },
    ],
    mustNotDoViolations: [],
    sideEffects: [],
    suggestedAdaptation: null,
    summary: 'Some criteria failed',
    ...overrides,
  };
}

function freshTodoState() {
  return { retries: 0, dynamicTodos: 0 };
}

// ---------------------------------------------------------------------------
// Tests: scopeCheck()
// ---------------------------------------------------------------------------

describe('scopeCheck()', () => {
  test('returns safe for null adaptation', () => {
    assert.equal(scopeCheck(null), 'safe');
  });

  test('returns safe for benign adaptation', () => {
    const adaptation = {
      reason: 'Add helper function',
      newTodo: { title: 'Add utils', steps: ['Create helper'] },
    };
    assert.equal(scopeCheck(adaptation), 'safe');
  });

  test('returns destructive for DB schema changes', () => {
    const adaptation = {
      reason: 'Need to alter db schema',
      newTodo: { title: 'Migrate DB', steps: ['Run migration'] },
    };
    assert.equal(scopeCheck(adaptation), 'destructive_out_of_scope');
  });

  test('returns destructive for API breaking changes', () => {
    const adaptation = {
      reason: 'This is an API breaking change',
      newTodo: { title: 'Update API', steps: ['Change endpoint'] },
    };
    assert.equal(scopeCheck(adaptation), 'destructive_out_of_scope');
  });

  test('returns destructive for auth changes', () => {
    const adaptation = {
      reason: 'Modify auth settings',
      newTodo: { title: 'Authentication change', steps: ['Update tokens'] },
    };
    assert.equal(scopeCheck(adaptation), 'destructive_out_of_scope');
  });

  test('returns destructive for security config in steps', () => {
    const adaptation = {
      reason: 'Fix issue',
      newTodo: { title: 'Fix', steps: ['Update security config'] },
    };
    assert.equal(scopeCheck(adaptation), 'destructive_out_of_scope');
  });
});

// ---------------------------------------------------------------------------
// Tests: canRetry()
// ---------------------------------------------------------------------------

describe('canRetry()', () => {
  test('returns true when retries < 3', () => {
    assert.equal(canRetry({ retries: 0 }), true);
    assert.equal(canRetry({ retries: 1 }), true);
    assert.equal(canRetry({ retries: 2 }), true);
  });

  test('returns false when retries >= 3', () => {
    assert.equal(canRetry({ retries: 3 }), false);
    assert.equal(canRetry({ retries: 5 }), false);
  });

  test('defaults to 0 retries when missing', () => {
    assert.equal(canRetry({}), true);
  });
});

// ---------------------------------------------------------------------------
// Tests: canAdapt()
// ---------------------------------------------------------------------------

describe('canAdapt()', () => {
  test('returns true at depth 0 with low dynamic count', () => {
    assert.equal(canAdapt({ dynamicTodos: 0 }, 0), true);
    assert.equal(canAdapt({ dynamicTodos: 2 }, 0), true);
  });

  test('returns false at depth >= 1', () => {
    assert.equal(canAdapt({ dynamicTodos: 0 }, 1), false);
    assert.equal(canAdapt({ dynamicTodos: 0 }, 2), false);
  });

  test('returns false when dynamicTodos >= 3', () => {
    assert.equal(canAdapt({ dynamicTodos: 3 }, 0), false);
    assert.equal(canAdapt({ dynamicTodos: 5 }, 0), false);
  });
});

// ---------------------------------------------------------------------------
// Tests: triage()
// ---------------------------------------------------------------------------

describe('triage()', () => {
  test('VERIFIED → pass', () => {
    const result = triage(verifiedResult(), 'work', freshTodoState());
    assert.equal(result.disposition, 'pass');
  });

  test('critical must-not-do violation → halt', () => {
    const vr = failedResult({
      mustNotDoViolations: [{ rule: 'No eval', violated: true, evidence: 'found eval()' }],
      sideEffects: [{ description: 'Injected eval', severity: 'critical' }],
    });
    const result = triage(vr, 'work', freshTodoState());
    assert.equal(result.disposition, 'halt');
    assert.match(result.reason, /must-not-do/i);
  });

  test('env_error in side effects → halt', () => {
    const vr = failedResult({
      mustNotDoViolations: [],
      sideEffects: [{ description: 'env_error: node not found', severity: 'critical' }],
    });
    const result = triage(vr, 'work', freshTodoState());
    assert.equal(result.disposition, 'halt');
  });

  test('suggested adaptation + safe scope → adapt', () => {
    const vr = failedResult({
      suggestedAdaptation: {
        reason: 'Need helper function',
        newTodo: { title: 'Add helper', steps: ['Write helper'], outputs: [] },
      },
    });
    const result = triage(vr, 'work', freshTodoState());
    assert.equal(result.disposition, 'adapt');
  });

  test('suggested adaptation + destructive scope → halt', () => {
    const vr = failedResult({
      suggestedAdaptation: {
        reason: 'Need to change DB schema migration',
        newTodo: { title: 'Migrate DB', steps: ['Alter table'], outputs: [] },
      },
    });
    const result = triage(vr, 'work', freshTodoState());
    assert.equal(result.disposition, 'halt');
    assert.match(result.reason, /destructive/i);
  });

  test('suggested adaptation + depth limit → halt', () => {
    const vr = failedResult({
      suggestedAdaptation: {
        reason: 'Need helper',
        newTodo: { title: 'Add helper', steps: ['Write it'], outputs: [] },
      },
    });
    const result = triage(vr, 'work', freshTodoState(), 1);
    assert.equal(result.disposition, 'halt');
    assert.match(result.reason, /limit/i);
  });

  test('suggested adaptation + max dynamic TODOs → halt', () => {
    const vr = failedResult({
      suggestedAdaptation: {
        reason: 'Need helper',
        newTodo: { title: 'Add helper', steps: ['Write it'], outputs: [] },
      },
    });
    const result = triage(vr, 'work', { retries: 0, dynamicTodos: 3 }, 0);
    assert.equal(result.disposition, 'halt');
  });

  test('acceptance criteria fail (work TODO) → retry', () => {
    const result = triage(failedResult(), 'work', freshTodoState());
    assert.equal(result.disposition, 'retry');
    assert.match(result.reason, /criteria/i);
  });

  test('retry count >= 3 → halt (retry exhausted)', () => {
    const result = triage(failedResult(), 'work', { retries: 3 });
    assert.equal(result.disposition, 'halt');
    assert.match(result.reason, /retry exhausted/i);
  });

  test('verification TODO with failures → adapt', () => {
    const vr = failedResult();
    const result = triage(vr, 'verification', freshTodoState());
    assert.equal(result.disposition, 'adapt');
  });

  test('verification TODO with failures + adapt limit → halt', () => {
    const vr = failedResult();
    const result = triage(vr, 'verification', { retries: 0, dynamicTodos: 3 }, 0);
    assert.equal(result.disposition, 'halt');
  });
});

// ---------------------------------------------------------------------------
// Tests: buildAuditEntry()
// ---------------------------------------------------------------------------

describe('buildAuditEntry()', () => {
  test('includes type, todoId, and JSON details', () => {
    const entry = buildAuditEntry('triage', 'todo-1', { disposition: 'pass' });
    assert.match(entry, /TRIAGE/);
    assert.match(entry, /todo-1/);
    assert.match(entry, /"disposition":\s*"pass"/);
  });

  test('includes timestamp', () => {
    const entry = buildAuditEntry('retry', 'todo-2', { attempt: 2 });
    assert.match(entry, /Timestamp.*\d{4}-\d{2}-\d{2}/);
  });

  test('formats as markdown with code block', () => {
    const entry = buildAuditEntry('halt', 'todo-3', { reason: 'critical' });
    assert.match(entry, /```json/);
    assert.match(entry, /```$/m);
  });
});
