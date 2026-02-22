/**
 * dag.js — DAG scheduler for dev-cli execute pipeline
 *
 * Builds a directed acyclic graph of substep nodes from a plan's TODOs,
 * dependency graph, and commit strategy. Provides helpers to find runnable
 * nodes, mark nodes complete, and insert dynamic TODOs at runtime.
 *
 * All functions are pure and take graph as first argument (except buildGraph).
 * Uses ESM exports only.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_DYNAMIC_PER_PARENT = 3;

/** Substep chains for each mode */
const SUBSTEPS = {
  standard: ['worker', 'verify', 'wrapup', 'commit'],
  quick: ['worker', 'wrapup', 'commit'],
};

/** Finalize chains for each mode */
const FINALIZE_SUBSTEPS = {
  standard: ['residual-commit', 'code-review', 'final-verify', 'state-complete', 'report'],
  quick: ['residual-commit', 'state-complete', 'report'],
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the substep node ID list for a given todoId and mode.
 * @param {string} todoId
 * @param {string} mode - 'standard' | 'quick'
 * @returns {string[]} ordered list of node IDs
 */
function substepIds(todoId, mode) {
  return SUBSTEPS[mode].map((step) => `${todoId}.${step}`);
}

/**
 * Build and add a linear chain of nodes into the graph.
 * Each node in the chain is blocked by the previous node in the chain.
 * The first node in the chain is blocked by the provided initialBlockers set.
 *
 * @param {object} graph - The graph object (mutated)
 * @param {string} todoId - The parent TODO id
 * @param {string[]} steps - Ordered substep names
 * @param {Set<string>} initialBlockers - Nodes that must complete before the first step
 * @returns {string[]} The node IDs created
 */
function addChain(graph, todoId, steps, initialBlockers) {
  const nodeIds = [];

  for (let i = 0; i < steps.length; i++) {
    const substep = steps[i];
    const id = `${todoId}.${substep}`;

    const blockedBy =
      i === 0
        ? new Set(initialBlockers)
        : new Set([`${todoId}.${steps[i - 1]}`]);

    graph.nodes.set(id, {
      id,
      todoId,
      substep,
      status: 'pending',
      blockedBy,
    });

    nodeIds.push(id);
  }

  return nodeIds;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a DAG from plan data.
 *
 * @param {object[]} todos - Array of TODO objects with { id } at minimum
 * @param {object[]} dependencyGraph - Array of { todo, requires, produces }
 * @param {object[]} commitStrategy - Unused in graph construction but kept for API completeness
 * @param {string} mode - 'standard' | 'quick'
 * @returns {{ nodes: Map<string, object>, dynamicCounts: Map<string, number> }}
 */
export function buildGraph(todos, dependencyGraph, commitStrategy, mode) {
  if (mode !== 'standard' && mode !== 'quick') {
    throw new Error(`Unknown mode: '${mode}'. Must be 'standard' or 'quick'.`);
  }

  const graph = {
    nodes: new Map(),
    dynamicCounts: new Map(),
  };

  // Build a lookup: artifact name → todoId that produces it
  // e.g. 'parser' → 'todo-1'
  const producerOf = new Map();
  for (const entry of dependencyGraph) {
    for (const artifact of entry.produces) {
      producerOf.set(artifact, entry.todo);
    }
  }

  // Build a lookup: todoId → set of artifact names it requires
  const requiresOf = new Map();
  for (const entry of dependencyGraph) {
    requiresOf.set(entry.todo, entry.requires ?? []);
  }

  // Build chains for each TODO, tracking cross-TODO dependencies
  const steps = SUBSTEPS[mode];

  for (const todo of todos) {
    const todoId = todo.id;

    // Determine blockers for this TODO's first substep (worker)
    // Any artifact this TODO requires → blocked by producer's .commit
    const initialBlockers = new Set();
    const required = requiresOf.get(todoId) ?? [];
    for (const artifact of required) {
      const producerId = producerOf.get(artifact);
      if (producerId) {
        // The last substep of the producer chain
        const lastStep = steps[steps.length - 1];
        initialBlockers.add(`${producerId}.${lastStep}`);
      }
    }

    addChain(graph, todoId, steps, initialBlockers);
  }

  // Build finalize chain — blocked by the .commit of ALL TODOs
  const finalizeSteps = FINALIZE_SUBSTEPS[mode];
  const lastStep = steps[steps.length - 1];
  const allTodoCommits = new Set(todos.map((t) => `${t.id}.${lastStep}`));

  addChain(graph, 'finalize', finalizeSteps, allTodoCommits);

  return graph;
}

/**
 * Return all node IDs that are currently runnable.
 * A node is runnable when:
 *   - status is 'pending'
 *   - every node in blockedBy has status 'complete'
 *
 * @param {{ nodes: Map<string, object> }} graph
 * @returns {string[]} Array of runnable node IDs
 */
export function findRunnable(graph) {
  const runnable = [];

  for (const [id, node] of graph.nodes) {
    if (node.status !== 'pending') continue;

    let allComplete = true;
    for (const blockerId of node.blockedBy) {
      const blocker = graph.nodes.get(blockerId);
      if (!blocker || blocker.status !== 'complete') {
        allComplete = false;
        break;
      }
    }

    if (allComplete) {
      runnable.push(id);
    }
  }

  return runnable;
}

/**
 * Mark a node as complete (mutates graph in place).
 *
 * @param {{ nodes: Map<string, object> }} graph
 * @param {string} nodeId
 */
export function markComplete(graph, nodeId) {
  const node = graph.nodes.get(nodeId);
  if (!node) {
    throw new Error(`Node '${nodeId}' not found in graph.`);
  }
  node.status = 'complete';
}

/**
 * Insert a dynamic TODO chain into the graph.
 * The new chain's first step (.worker) is blocked by the parent TODO's .commit.
 * Throws if the parent already has 3 or more dynamic children.
 *
 * @param {{ nodes: Map<string, object>, dynamicCounts: Map<string, number> }} graph
 * @param {string} parentId - The parent TODO id (e.g. 'todo-1')
 * @param {{ id: string }} newTodo - The new TODO object (must have an id)
 * @param {string} mode - 'standard' | 'quick'
 * @returns {string[]} The new node IDs created
 */
export function insertDynamicTodo(graph, parentId, newTodo, mode) {
  if (mode !== 'standard' && mode !== 'quick') {
    throw new Error(`Unknown mode: '${mode}'. Must be 'standard' or 'quick'.`);
  }

  const count = graph.dynamicCounts.get(parentId) ?? 0;
  if (count >= MAX_DYNAMIC_PER_PARENT) {
    throw new Error(
      `Maximum dynamic TODOs (${MAX_DYNAMIC_PER_PARENT}) exceeded for parent '${parentId}'.`,
    );
  }

  const steps = SUBSTEPS[mode];
  const lastStep = steps[steps.length - 1];
  const parentCommitId = `${parentId}.${lastStep}`;

  const newIds = addChain(graph, newTodo.id, steps, new Set([parentCommitId]));

  graph.dynamicCounts.set(parentId, count + 1);

  return newIds;
}
