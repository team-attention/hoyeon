/**
 * variable-sub.test.js — Unit tests for variable-sub module
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { substituteVariables, resolveInputs } from '../../../src/engine/variable-sub.js';

// ---------------------------------------------------------------------------
// substituteVariables()
// ---------------------------------------------------------------------------

describe('substituteVariables()', () => {
  test('replaces known references', () => {
    const outputs = { 'todo-1': { file: 'parser.js' } };
    const result = substituteVariables('${todo-1.outputs.file}', outputs);
    assert.equal(result, 'parser.js');
  });

  test('preserves unknown references as-is', () => {
    const outputs = {};
    const result = substituteVariables('${todo-1.outputs.file}', outputs);
    assert.equal(result, '${todo-1.outputs.file}');
  });

  test('preserves unknown field on known todoId', () => {
    const outputs = { 'todo-1': { otherField: 'something' } };
    const result = substituteVariables('${todo-1.outputs.file}', outputs);
    assert.equal(result, '${todo-1.outputs.file}');
  });

  test('handles multiple replacements in one string', () => {
    const outputs = {
      'todo-1': { file: 'parser.js' },
      'todo-2': { file: 'formatter.js' },
    };
    const text = 'Input: ${todo-1.outputs.file} and ${todo-2.outputs.file}';
    const result = substituteVariables(text, outputs);
    assert.equal(result, 'Input: parser.js and formatter.js');
  });

  test('returns unchanged text when no variables are present', () => {
    const outputs = { 'todo-1': { file: 'parser.js' } };
    const text = 'No variables here';
    const result = substituteVariables(text, outputs);
    assert.equal(result, 'No variables here');
  });

  test('handles mix of known and unknown references', () => {
    const outputs = { 'todo-1': { file: 'parser.js' } };
    const text = '${todo-1.outputs.file} and ${todo-2.outputs.file}';
    const result = substituteVariables(text, outputs);
    assert.equal(result, 'parser.js and ${todo-2.outputs.file}');
  });
});

// ---------------------------------------------------------------------------
// resolveInputs()
// ---------------------------------------------------------------------------

describe('resolveInputs()', () => {
  test('resolves input refs', () => {
    const outputs = { 'todo-1': { file: 'parser.js' } };
    const todo = {
      inputs: [{ name: 'parser', type: 'file', ref: '${todo-1.outputs.file}' }],
    };

    const resolved = resolveInputs(todo, outputs);
    assert.equal(resolved[0].ref, 'parser.js');
  });

  test('preserves other input fields unchanged', () => {
    const outputs = { 'todo-1': { file: 'parser.js' } };
    const todo = {
      inputs: [{ name: 'parser', type: 'file', ref: '${todo-1.outputs.file}' }],
    };

    const resolved = resolveInputs(todo, outputs);
    assert.equal(resolved[0].name, 'parser');
    assert.equal(resolved[0].type, 'file');
  });

  test('does not mutate the original inputs array', () => {
    const outputs = { 'todo-1': { file: 'parser.js' } };
    const originalRef = '${todo-1.outputs.file}';
    const todo = {
      inputs: [{ name: 'parser', type: 'file', ref: originalRef }],
    };

    resolveInputs(todo, outputs);
    // Original must be unchanged
    assert.equal(todo.inputs[0].ref, originalRef);
  });

  test('returns empty array for todo with no inputs', () => {
    const outputs = {};
    const todo = { inputs: [] };
    const resolved = resolveInputs(todo, outputs);
    assert.deepEqual(resolved, []);
  });

  test('resolves multiple inputs independently', () => {
    const outputs = {
      'todo-1': { file: 'parser.js' },
      'todo-2': { file: 'formatter.js' },
    };
    const todo = {
      inputs: [
        { name: 'parser', type: 'file', ref: '${todo-1.outputs.file}' },
        { name: 'formatter', type: 'file', ref: '${todo-2.outputs.file}' },
      ],
    };

    const resolved = resolveInputs(todo, outputs);
    assert.equal(resolved[0].ref, 'parser.js');
    assert.equal(resolved[1].ref, 'formatter.js');
  });
});
