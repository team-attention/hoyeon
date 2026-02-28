/**
 * plan-parser.test.js — Unit tests for plan-parser module
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parsePlan, loadCheckedStatus } from '../../../src/engine/plan-parser.js';

// ---------------------------------------------------------------------------
// Test environment: override process.cwd() to isolate file system access
// ---------------------------------------------------------------------------

let tmpDir;
const originalCwd = process.cwd;

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-plan-parser-test-'));
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
        inputs: [{ name: 'config', type: 'file', ref: 'config.json' }],
        outputs: [{ name: 'parser', type: 'file', value: 'parser.js', description: 'The parser' }],
        steps: ['Write parser', 'Test parser'],
        mustNotDo: ['Do not use eval'],
        references: ['docs/parser.md'],
        acceptanceCriteria: {
          functional: ['Parser parses valid input'],
          static: ['node --check passes'],
          runtime: ['Tests pass'],
        },
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
        acceptanceCriteria: {
          functional: ['Formatter works'],
          static: ['node --check passes'],
          runtime: ['Tests pass'],
        },
        risk: 'MEDIUM',
      },
      {
        id: 'todo-final',
        title: 'Verification',
        type: 'verification',
        inputs: [],
        outputs: [],
        steps: ['Run all tests'],
        mustNotDo: [],
        references: [],
        acceptanceCriteria: {
          functional: ['All pass'],
          static: [],
          runtime: ['Full suite passes'],
        },
        risk: 'LOW',
      },
    ],
    taskFlow: 'TODO-1 → TODO-2 → TODO-Final',
    dependencyGraph: [
      { todo: 'todo-1', requires: [], produces: ['parser'] },
      { todo: 'todo-2', requires: ['parser'], produces: ['formatter'] },
      { todo: 'todo-final', requires: ['parser', 'formatter'], produces: [] },
    ],
    commitStrategy: [
      { afterTodo: 'todo-1', message: 'feat: add parser', files: ['parser.js'], condition: 'always' },
      { afterTodo: 'todo-2', message: 'feat: add formatter', files: ['formatter.js'], condition: 'always' },
    ],
    verificationSummary: {
      aItems: ['A-1: Tests pass'],
      hItems: ['H-1: Manual check'],
      sItems: [],
      gaps: [],
    },
  };
}

function writePlanContent(name, data) {
  const specDir = join(tmpDir, '.dev', 'specs', name);
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'plan-content.json'), JSON.stringify(data, null, 2));
}

function writePlanMd(name, content) {
  const specDir = join(tmpDir, '.dev', 'specs', name);
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'PLAN.md'), content);
}

// ---------------------------------------------------------------------------
// Tests: loadCheckedStatus()
// ---------------------------------------------------------------------------

describe('loadCheckedStatus()', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('returns empty map when PLAN.md does not exist', () => {
    const result = loadCheckedStatus('no-plan');
    assert.equal(result.size, 0);
  });

  test('parses checked and unchecked TODOs', () => {
    writePlanMd('my-feat', `# Plan

### [x] TODO 1: Create parser

Some content

### [ ] TODO 2: Create formatter

More content

### [x] TODO 3: Verification
`);

    const result = loadCheckedStatus('my-feat');
    assert.equal(result.size, 3);
    assert.equal(result.get(1), true);
    assert.equal(result.get(2), false);
    assert.equal(result.get(3), true);
  });

  test('handles uppercase X', () => {
    writePlanMd('my-feat', `### [X] TODO 1: Done\n### [ ] TODO 2: Pending`);
    const result = loadCheckedStatus('my-feat');
    assert.equal(result.get(1), true);
    assert.equal(result.get(2), false);
  });
});

// ---------------------------------------------------------------------------
// Tests: parsePlan()
// ---------------------------------------------------------------------------

describe('parsePlan()', () => {
  beforeEach(() => useTmpDir());
  afterEach(() => restoreCwd());

  test('parses valid plan-content.json and returns normalized object', () => {
    const data = validPlanContent();
    writePlanContent('my-feat', data);

    const plan = parsePlan('my-feat');

    assert.equal(plan.todos.length, 3);
    assert.equal(plan.dependencyGraph.length, 3);
    assert.equal(plan.commitStrategy.length, 2);
    assert.ok(plan.verificationSummary);
    assert.ok(plan.objectives);
    assert.ok(plan.context);
    assert.equal(plan.taskFlow, 'TODO-1 → TODO-2 → TODO-Final');
  });

  test('each todo has required fields', () => {
    writePlanContent('my-feat', validPlanContent());

    const plan = parsePlan('my-feat');
    const todo = plan.todos[0];

    assert.equal(todo.id, 'todo-1');
    assert.equal(todo.title, 'Create parser');
    assert.equal(todo.type, 'work');
    assert.ok(Array.isArray(todo.inputs));
    assert.ok(Array.isArray(todo.outputs));
    assert.ok(Array.isArray(todo.steps));
    assert.ok(todo.acceptanceCriteria);
    assert.ok(Array.isArray(todo.mustNotDo));
    assert.ok(Array.isArray(todo.references));
    assert.equal(todo.risk, 'LOW');
    assert.equal(todo.checked, false);
  });

  test('merges checked status from PLAN.md', () => {
    writePlanContent('my-feat', validPlanContent());
    writePlanMd('my-feat', `### [x] TODO 1: Create parser\n### [ ] TODO 2: Create formatter\n### [ ] TODO 3: Verification`);

    const plan = parsePlan('my-feat');

    assert.equal(plan.todos[0].checked, true);
    assert.equal(plan.todos[1].checked, false);
    assert.equal(plan.todos[2].checked, false);
  });

  test('defaults checked to false when PLAN.md is missing', () => {
    writePlanContent('my-feat', validPlanContent());

    const plan = parsePlan('my-feat');

    for (const todo of plan.todos) {
      assert.equal(todo.checked, false);
    }
  });

  test('throws on missing plan-content.json', () => {
    assert.throws(() => parsePlan('nonexistent'), /Cannot read plan-content\.json/);
  });

  test('throws on invalid JSON', () => {
    const specDir = join(tmpDir, '.dev', 'specs', 'bad-json');
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, 'plan-content.json'), '{ broken json }');

    assert.throws(() => parsePlan('bad-json'), /Invalid JSON/);
  });

  test('throws on schema validation failure', () => {
    writePlanContent('invalid', { someField: true });

    assert.throws(() => parsePlan('invalid'), /validation failed/);
  });
});
