/**
 * dag.test.js — Unit tests for dev-cli/src/engine/dag.js
 * Uses node:test and node:assert/strict (no external test frameworks).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGraph,
  findRunnable,
  markComplete,
  insertDynamicTodo,
} from '../../../src/engine/dag.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal todos for a 2-todo plan */
function twoTodos() {
  return [{ id: 'todo-1' }, { id: 'todo-2' }];
}

/** Dependency graph where todo-2 requires output of todo-1 */
function serialDeps() {
  return [
    { todo: 'todo-1', requires: [], produces: ['parser'] },
    { todo: 'todo-2', requires: ['parser'], produces: ['formatter'] },
  ];
}

/** Dependency graph where both todos are independent */
function parallelDeps() {
  return [
    { todo: 'todo-1', requires: [], produces: ['parser'] },
    { todo: 'todo-2', requires: [], produces: ['formatter'] },
  ];
}

// ---------------------------------------------------------------------------
// buildGraph — standard mode chain construction
// ---------------------------------------------------------------------------

describe('buildGraph() — standard mode chain', () => {
  test('creates 4 substep nodes per TODO plus 5-node finalize chain', () => {
    const graph = buildGraph(twoTodos(), serialDeps(), [], 'standard');
    // 2 TODOs × 4 steps + 5 finalize = 13
    assert.equal(graph.nodes.size, 13);
  });

  test('each TODO has worker, verify, wrapup, commit nodes', () => {
    const graph = buildGraph(twoTodos(), serialDeps(), [], 'standard');
    const expected = ['todo-1.worker', 'todo-1.verify', 'todo-1.wrapup', 'todo-1.commit'];
    for (const id of expected) {
      assert.ok(graph.nodes.has(id), `Missing node: ${id}`);
    }
  });

  test('node has correct shape (id, todoId, substep, status, blockedBy)', () => {
    const graph = buildGraph(twoTodos(), serialDeps(), [], 'standard');
    const node = graph.nodes.get('todo-1.worker');
    assert.equal(node.id, 'todo-1.worker');
    assert.equal(node.todoId, 'todo-1');
    assert.equal(node.substep, 'worker');
    assert.equal(node.status, 'pending');
    assert.ok(node.blockedBy instanceof Set);
  });

  test('within-TODO chain is linear (each step blocked by previous)', () => {
    const graph = buildGraph(twoTodos(), serialDeps(), [], 'standard');
    assert.equal(graph.nodes.get('todo-1.worker').blockedBy.size, 0);
    assert.deepEqual(
      [...graph.nodes.get('todo-1.verify').blockedBy],
      ['todo-1.worker'],
    );
    assert.deepEqual(
      [...graph.nodes.get('todo-1.wrapup').blockedBy],
      ['todo-1.verify'],
    );
    assert.deepEqual(
      [...graph.nodes.get('todo-1.commit').blockedBy],
      ['todo-1.wrapup'],
    );
  });

  test('finalize chain has 5 nodes in standard mode', () => {
    const graph = buildGraph(twoTodos(), serialDeps(), [], 'standard');
    const expected = [
      'finalize.residual-commit',
      'finalize.code-review',
      'finalize.final-verify',
      'finalize.state-complete',
      'finalize.report',
    ];
    for (const id of expected) {
      assert.ok(graph.nodes.has(id), `Missing finalize node: ${id}`);
    }
  });

  test('finalize.residual-commit is blocked by all TODO .commit nodes', () => {
    const graph = buildGraph(twoTodos(), serialDeps(), [], 'standard');
    const finalizeFirst = graph.nodes.get('finalize.residual-commit');
    assert.ok(finalizeFirst.blockedBy.has('todo-1.commit'));
    assert.ok(finalizeFirst.blockedBy.has('todo-2.commit'));
  });

  test('finalize chain is linear internally', () => {
    const graph = buildGraph(twoTodos(), parallelDeps(), [], 'standard');
    assert.deepEqual(
      [...graph.nodes.get('finalize.code-review').blockedBy],
      ['finalize.residual-commit'],
    );
    assert.deepEqual(
      [...graph.nodes.get('finalize.final-verify').blockedBy],
      ['finalize.code-review'],
    );
    assert.deepEqual(
      [...graph.nodes.get('finalize.state-complete').blockedBy],
      ['finalize.final-verify'],
    );
    assert.deepEqual(
      [...graph.nodes.get('finalize.report').blockedBy],
      ['finalize.state-complete'],
    );
  });
});

// ---------------------------------------------------------------------------
// buildGraph — quick mode chain construction
// ---------------------------------------------------------------------------

describe('buildGraph() — quick mode chain', () => {
  test('creates 3 substep nodes per TODO plus 3-node finalize chain', () => {
    const graph = buildGraph(twoTodos(), serialDeps(), [], 'quick');
    // 2 TODOs × 3 steps + 3 finalize = 9
    assert.equal(graph.nodes.size, 9);
  });

  test('each TODO has worker, wrapup, commit nodes (no verify)', () => {
    const graph = buildGraph(twoTodos(), serialDeps(), [], 'quick');
    assert.ok(graph.nodes.has('todo-1.worker'));
    assert.ok(graph.nodes.has('todo-1.wrapup'));
    assert.ok(graph.nodes.has('todo-1.commit'));
    assert.ok(!graph.nodes.has('todo-1.verify'), 'verify should not exist in quick mode');
  });

  test('within-TODO chain is linear in quick mode', () => {
    const graph = buildGraph(twoTodos(), serialDeps(), [], 'quick');
    assert.equal(graph.nodes.get('todo-1.worker').blockedBy.size, 0);
    assert.deepEqual(
      [...graph.nodes.get('todo-1.wrapup').blockedBy],
      ['todo-1.worker'],
    );
    assert.deepEqual(
      [...graph.nodes.get('todo-1.commit').blockedBy],
      ['todo-1.wrapup'],
    );
  });

  test('finalize chain has 3 nodes in quick mode', () => {
    const graph = buildGraph(twoTodos(), serialDeps(), [], 'quick');
    assert.ok(graph.nodes.has('finalize.residual-commit'));
    assert.ok(graph.nodes.has('finalize.state-complete'));
    assert.ok(graph.nodes.has('finalize.report'));
    assert.ok(!graph.nodes.has('finalize.code-review'), 'code-review not in quick mode');
    assert.ok(!graph.nodes.has('finalize.final-verify'), 'final-verify not in quick mode');
  });

  test('finalize.residual-commit is blocked by all TODO .commit in quick mode', () => {
    const graph = buildGraph(twoTodos(), serialDeps(), [], 'quick');
    const finalizeFirst = graph.nodes.get('finalize.residual-commit');
    assert.ok(finalizeFirst.blockedBy.has('todo-1.commit'));
    assert.ok(finalizeFirst.blockedBy.has('todo-2.commit'));
  });
});

// ---------------------------------------------------------------------------
// buildGraph — cross-TODO dependencies
// ---------------------------------------------------------------------------

describe('buildGraph() — cross-TODO dependencies', () => {
  test('todo-2.worker is blocked by todo-1.commit when todo-2 requires todo-1 output', () => {
    const graph = buildGraph(twoTodos(), serialDeps(), [], 'standard');
    const todo2Worker = graph.nodes.get('todo-2.worker');
    assert.ok(
      todo2Worker.blockedBy.has('todo-1.commit'),
      'todo-2.worker should be blocked by todo-1.commit',
    );
  });

  test('independent TODOs have no cross-dependencies', () => {
    const graph = buildGraph(twoTodos(), parallelDeps(), [], 'standard');
    const todo2Worker = graph.nodes.get('todo-2.worker');
    assert.equal(todo2Worker.blockedBy.size, 0, 'Independent todo-2.worker should have no blockers');
  });

  test('three-todo serial chain: each worker blocked by previous commit', () => {
    const todos = [{ id: 'todo-1' }, { id: 'todo-2' }, { id: 'todo-3' }];
    const deps = [
      { todo: 'todo-1', requires: [], produces: ['a'] },
      { todo: 'todo-2', requires: ['a'], produces: ['b'] },
      { todo: 'todo-3', requires: ['b'], produces: [] },
    ];
    const graph = buildGraph(todos, deps, [], 'standard');

    assert.ok(graph.nodes.get('todo-2.worker').blockedBy.has('todo-1.commit'));
    assert.ok(graph.nodes.get('todo-3.worker').blockedBy.has('todo-2.commit'));
    assert.equal(graph.nodes.get('todo-1.worker').blockedBy.size, 0);
  });

  test('todo requiring multiple artifacts is blocked by all producers\' commits', () => {
    const todos = [{ id: 'todo-1' }, { id: 'todo-2' }, { id: 'todo-3' }];
    const deps = [
      { todo: 'todo-1', requires: [], produces: ['a'] },
      { todo: 'todo-2', requires: [], produces: ['b'] },
      { todo: 'todo-3', requires: ['a', 'b'], produces: [] },
    ];
    const graph = buildGraph(todos, deps, [], 'standard');

    const todo3Worker = graph.nodes.get('todo-3.worker');
    assert.ok(todo3Worker.blockedBy.has('todo-1.commit'));
    assert.ok(todo3Worker.blockedBy.has('todo-2.commit'));
  });

  test('cross-todo dependency uses commit (last step) in quick mode', () => {
    const graph = buildGraph(twoTodos(), serialDeps(), [], 'quick');
    const todo2Worker = graph.nodes.get('todo-2.worker');
    // In quick mode last step is also 'commit'
    assert.ok(todo2Worker.blockedBy.has('todo-1.commit'));
  });
});

// ---------------------------------------------------------------------------
// findRunnable
// ---------------------------------------------------------------------------

describe('findRunnable()', () => {
  test('initially only first steps of independent TODOs are runnable', () => {
    const graph = buildGraph(twoTodos(), parallelDeps(), [], 'standard');
    const runnable = findRunnable(graph);
    assert.ok(runnable.includes('todo-1.worker'), 'todo-1.worker should be runnable');
    assert.ok(runnable.includes('todo-2.worker'), 'todo-2.worker should be runnable');
    // verify/wrapup/commit/finalize should not be runnable yet
    assert.ok(!runnable.includes('todo-1.verify'));
    assert.ok(!runnable.includes('finalize.residual-commit'));
  });

  test('in serial dependency, only first TODO\'s worker is initially runnable', () => {
    const graph = buildGraph(twoTodos(), serialDeps(), [], 'standard');
    const runnable = findRunnable(graph);
    assert.ok(runnable.includes('todo-1.worker'));
    assert.ok(!runnable.includes('todo-2.worker'), 'todo-2.worker should not be runnable yet');
  });

  test('next substep becomes runnable after previous is marked complete', () => {
    const graph = buildGraph(twoTodos(), parallelDeps(), [], 'standard');
    markComplete(graph, 'todo-1.worker');
    const runnable = findRunnable(graph);
    assert.ok(runnable.includes('todo-1.verify'), 'todo-1.verify should be runnable');
    assert.ok(runnable.includes('todo-2.worker'), 'todo-2.worker still runnable');
    assert.ok(!runnable.includes('todo-1.wrapup'), 'todo-1.wrapup not yet runnable');
  });

  test('finalize becomes runnable only after all TODOs commit', () => {
    const graph = buildGraph(twoTodos(), parallelDeps(), [], 'quick');
    // Complete entire todo-1 and todo-2 chains
    for (const id of ['todo-1.worker', 'todo-1.wrapup', 'todo-1.commit',
                       'todo-2.worker', 'todo-2.wrapup', 'todo-2.commit']) {
      markComplete(graph, id);
    }
    const runnable = findRunnable(graph);
    assert.ok(runnable.includes('finalize.residual-commit'), 'finalize should now be runnable');
  });

  test('finalize does not start if only one TODO is done (quick mode)', () => {
    const graph = buildGraph(twoTodos(), parallelDeps(), [], 'quick');
    for (const id of ['todo-1.worker', 'todo-1.wrapup', 'todo-1.commit']) {
      markComplete(graph, id);
    }
    const runnable = findRunnable(graph);
    assert.ok(!runnable.includes('finalize.residual-commit'));
  });

  test('returns empty array when all nodes are complete', () => {
    const graph = buildGraph([{ id: 'todo-1' }], parallelDeps().slice(0, 1), [], 'quick');
    for (const id of graph.nodes.keys()) {
      graph.nodes.get(id).status = 'complete';
    }
    const runnable = findRunnable(graph);
    assert.equal(runnable.length, 0);
  });

  test('completed nodes are not included in runnable', () => {
    const graph = buildGraph(twoTodos(), parallelDeps(), [], 'standard');
    markComplete(graph, 'todo-1.worker');
    const runnable = findRunnable(graph);
    assert.ok(!runnable.includes('todo-1.worker'), 'completed node must not appear in runnable');
  });
});

// ---------------------------------------------------------------------------
// markComplete
// ---------------------------------------------------------------------------

describe('markComplete()', () => {
  test('sets node status to complete', () => {
    const graph = buildGraph(twoTodos(), parallelDeps(), [], 'standard');
    markComplete(graph, 'todo-1.worker');
    assert.equal(graph.nodes.get('todo-1.worker').status, 'complete');
  });

  test('throws for unknown nodeId', () => {
    const graph = buildGraph(twoTodos(), parallelDeps(), [], 'standard');
    assert.throws(
      () => markComplete(graph, 'nonexistent.worker'),
      /not found/,
    );
  });

  test('does not affect other nodes', () => {
    const graph = buildGraph(twoTodos(), parallelDeps(), [], 'standard');
    markComplete(graph, 'todo-1.worker');
    assert.equal(graph.nodes.get('todo-2.worker').status, 'pending');
    assert.equal(graph.nodes.get('todo-1.verify').status, 'pending');
  });
});

// ---------------------------------------------------------------------------
// insertDynamicTodo
// ---------------------------------------------------------------------------

describe('insertDynamicTodo()', () => {
  test('inserts substep chain blocked by parent commit (standard)', () => {
    const graph = buildGraph(twoTodos(), parallelDeps(), [], 'standard');
    const newIds = insertDynamicTodo(graph, 'todo-1', { id: 'todo-dyn-1' }, 'standard');

    assert.ok(graph.nodes.has('todo-dyn-1.worker'));
    assert.ok(graph.nodes.has('todo-dyn-1.verify'));
    assert.ok(graph.nodes.has('todo-dyn-1.wrapup'));
    assert.ok(graph.nodes.has('todo-dyn-1.commit'));
    assert.equal(newIds.length, 4);
  });

  test('inserts substep chain blocked by parent commit (quick)', () => {
    const graph = buildGraph(twoTodos(), parallelDeps(), [], 'quick');
    const newIds = insertDynamicTodo(graph, 'todo-1', { id: 'todo-dyn-1' }, 'quick');

    assert.ok(graph.nodes.has('todo-dyn-1.worker'));
    assert.ok(graph.nodes.has('todo-dyn-1.wrapup'));
    assert.ok(graph.nodes.has('todo-dyn-1.commit'));
    assert.ok(!graph.nodes.has('todo-dyn-1.verify'), 'verify not in quick mode');
    assert.equal(newIds.length, 3);
  });

  test('dynamic todo worker is blocked by parent.commit', () => {
    const graph = buildGraph(twoTodos(), parallelDeps(), [], 'standard');
    insertDynamicTodo(graph, 'todo-1', { id: 'todo-dyn-1' }, 'standard');

    const dynWorker = graph.nodes.get('todo-dyn-1.worker');
    assert.ok(dynWorker.blockedBy.has('todo-1.commit'));
  });

  test('increments dynamicCounts for parent', () => {
    const graph = buildGraph(twoTodos(), parallelDeps(), [], 'standard');
    assert.equal(graph.dynamicCounts.get('todo-1'), undefined);

    insertDynamicTodo(graph, 'todo-1', { id: 'todo-dyn-1' }, 'standard');
    assert.equal(graph.dynamicCounts.get('todo-1'), 1);

    insertDynamicTodo(graph, 'todo-1', { id: 'todo-dyn-2' }, 'standard');
    assert.equal(graph.dynamicCounts.get('todo-1'), 2);
  });

  test('allows up to 3 dynamic TODOs per parent', () => {
    const graph = buildGraph(twoTodos(), parallelDeps(), [], 'standard');
    insertDynamicTodo(graph, 'todo-1', { id: 'dyn-a' }, 'standard');
    insertDynamicTodo(graph, 'todo-1', { id: 'dyn-b' }, 'standard');
    insertDynamicTodo(graph, 'todo-1', { id: 'dyn-c' }, 'standard');
    assert.equal(graph.dynamicCounts.get('todo-1'), 3);
  });

  test('throws when exceeding max dynamic TODOs per parent', () => {
    const graph = buildGraph(twoTodos(), parallelDeps(), [], 'standard');
    insertDynamicTodo(graph, 'todo-1', { id: 'dyn-a' }, 'standard');
    insertDynamicTodo(graph, 'todo-1', { id: 'dyn-b' }, 'standard');
    insertDynamicTodo(graph, 'todo-1', { id: 'dyn-c' }, 'standard');

    assert.throws(
      () => insertDynamicTodo(graph, 'todo-1', { id: 'dyn-d' }, 'standard'),
      /Maximum dynamic TODOs.*exceeded/,
    );
  });

  test('max limit is per-parent (different parents track independently)', () => {
    const graph = buildGraph(twoTodos(), parallelDeps(), [], 'standard');
    insertDynamicTodo(graph, 'todo-1', { id: 'dyn-a' }, 'standard');
    insertDynamicTodo(graph, 'todo-1', { id: 'dyn-b' }, 'standard');
    insertDynamicTodo(graph, 'todo-1', { id: 'dyn-c' }, 'standard');

    // todo-2 can still accept dynamic TODOs
    assert.doesNotThrow(() => {
      insertDynamicTodo(graph, 'todo-2', { id: 'dyn-todo2-a' }, 'standard');
    });
  });

  test('dynamic chain is internally linear (verify blocked by worker)', () => {
    const graph = buildGraph(twoTodos(), parallelDeps(), [], 'standard');
    insertDynamicTodo(graph, 'todo-1', { id: 'todo-dyn-1' }, 'standard');

    assert.deepEqual(
      [...graph.nodes.get('todo-dyn-1.verify').blockedBy],
      ['todo-dyn-1.worker'],
    );
    assert.deepEqual(
      [...graph.nodes.get('todo-dyn-1.wrapup').blockedBy],
      ['todo-dyn-1.verify'],
    );
    assert.deepEqual(
      [...graph.nodes.get('todo-dyn-1.commit').blockedBy],
      ['todo-dyn-1.wrapup'],
    );
  });

  test('dynamic todo becomes runnable after parent commit is complete', () => {
    const graph = buildGraph([{ id: 'todo-1' }], [{ todo: 'todo-1', requires: [], produces: [] }], [], 'quick');
    insertDynamicTodo(graph, 'todo-1', { id: 'todo-dyn-1' }, 'quick');

    // Before parent commits, dynamic worker not runnable
    let runnable = findRunnable(graph);
    assert.ok(!runnable.includes('todo-dyn-1.worker'));

    // After parent commits, dynamic worker becomes runnable
    markComplete(graph, 'todo-1.worker');
    markComplete(graph, 'todo-1.wrapup');
    markComplete(graph, 'todo-1.commit');
    runnable = findRunnable(graph);
    assert.ok(runnable.includes('todo-dyn-1.worker'));
  });
});

// ---------------------------------------------------------------------------
// buildGraph — edge cases
// ---------------------------------------------------------------------------

describe('buildGraph() — edge cases', () => {
  test('single todo with no dependencies', () => {
    const todos = [{ id: 'todo-1' }];
    const deps = [{ todo: 'todo-1', requires: [], produces: [] }];
    const graph = buildGraph(todos, deps, [], 'standard');
    // 4 substeps + 5 finalize = 9
    assert.equal(graph.nodes.size, 9);
    assert.equal(graph.nodes.get('todo-1.worker').blockedBy.size, 0);
  });

  test('empty todos list creates only finalize chain', () => {
    const graph = buildGraph([], [], [], 'standard');
    // 0 todo nodes + 5 finalize = 5
    assert.equal(graph.nodes.size, 5);
    // finalize.residual-commit has no blockers (no TODOs to wait for)
    assert.equal(graph.nodes.get('finalize.residual-commit').blockedBy.size, 0);
  });

  test('throws on invalid mode', () => {
    assert.throws(
      () => buildGraph(twoTodos(), serialDeps(), [], 'invalid'),
      /Unknown mode/,
    );
  });

  test('graph.dynamicCounts starts empty', () => {
    const graph = buildGraph(twoTodos(), serialDeps(), [], 'standard');
    assert.equal(graph.dynamicCounts.size, 0);
  });

  test('artifact produced by unknown TODO is silently ignored (no blocker added)', () => {
    // dep graph references a producer not in todos list — should not crash
    const todos = [{ id: 'todo-2' }];
    const deps = [
      { todo: 'todo-2', requires: ['mystery'], produces: [] },
      // 'mystery' is produced by 'todo-x' which is not in todos
    ];
    // No producer for 'mystery', so no cross-dependency added
    assert.doesNotThrow(() => {
      const graph = buildGraph(todos, deps, [], 'standard');
      assert.equal(graph.nodes.get('todo-2.worker').blockedBy.size, 0);
    });
  });
});
