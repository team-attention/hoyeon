/**
 * plan-validate.js — dev-cli plan <name> validate [--data <path>]
 *
 * Schema validation + semantic consistency checks for plan-content.json.
 * Unlike plan-generate (which validates then renders), this validates only
 * for fail-fast feedback.
 */

import { readFileSync } from 'node:fs';
import { validatePlanContent } from '../schemas/plan-content.schema.js';
import { planContentPath as _planContentPath } from '../core/paths.js';

// ---------------------------------------------------------------------------
// Semantic checks (beyond schema)
// ---------------------------------------------------------------------------

/**
 * Collect todo IDs from todos array.
 * @param {Array} todos
 * @returns {Set<string>}
 */
function collectTodoIds(todos) {
  return new Set(todos.map((t) => t.id).filter(Boolean));
}

/**
 * Check for duplicate todo IDs.
 */
function checkDuplicateTodoIds(todos, warnings) {
  const seen = new Set();
  for (const todo of todos) {
    if (!todo.id) continue;
    if (seen.has(todo.id)) {
      warnings.push({
        type: 'duplicate-todo-id',
        message: `Duplicate todo ID: '${todo.id}'`,
      });
    }
    seen.add(todo.id);
  }
}

/**
 * Check that dependencyGraph.todo references valid todo IDs.
 */
function checkDependencyGraphRefs(dependencyGraph, todoIds, warnings) {
  if (!dependencyGraph) return;
  for (const entry of dependencyGraph) {
    if (entry.todo && !todoIds.has(entry.todo)) {
      warnings.push({
        type: 'invalid-dependency-ref',
        message: `dependencyGraph references unknown todo ID: '${entry.todo}'`,
      });
    }
  }
}

/**
 * Check that commitStrategy.afterTodo references valid todo IDs.
 */
function checkCommitStrategyRefs(commitStrategy, todoIds, warnings) {
  if (!commitStrategy) return;
  for (const entry of commitStrategy) {
    if (entry.afterTodo && !todoIds.has(entry.afterTodo)) {
      warnings.push({
        type: 'invalid-commit-ref',
        message: `commitStrategy references unknown todo ID: '${entry.afterTodo}'`,
      });
    }
  }
}

/**
 * Detect cycles in the dependency graph using DFS.
 */
function checkDependencyCycles(dependencyGraph, warnings) {
  if (!dependencyGraph || dependencyGraph.length === 0) return;

  // Build adjacency: todo -> requires (which are produces of other todos)
  // Actually dependencyGraph entries are: { todo, requires, produces }
  // An edge means: entry.todo depends on whatever produces entries in entry.requires.
  // We need to build: for each todo, what other todos must come before it.
  // produces -> todo mapping
  const producerOf = new Map(); // resource -> todo
  for (const entry of dependencyGraph) {
    if (!entry.produces) continue;
    for (const resource of entry.produces) {
      producerOf.set(resource, entry.todo);
    }
  }

  // Build adjacency: todo -> [todos it depends on]
  const adj = new Map();
  for (const entry of dependencyGraph) {
    if (!entry.todo) continue;
    const deps = [];
    if (entry.requires) {
      for (const req of entry.requires) {
        const producer = producerOf.get(req);
        if (producer && producer !== entry.todo) {
          deps.push(producer);
        }
      }
    }
    adj.set(entry.todo, deps);
  }

  // DFS cycle detection
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const node of adj.keys()) color.set(node, WHITE);

  function dfs(node) {
    color.set(node, GRAY);
    for (const neighbor of (adj.get(node) || [])) {
      if (color.get(neighbor) === GRAY) {
        return true; // cycle found
      }
      if (color.get(neighbor) === WHITE) {
        if (dfs(neighbor)) return true;
      }
    }
    color.set(node, BLACK);
    return false;
  }

  for (const node of adj.keys()) {
    if (color.get(node) === WHITE) {
      if (dfs(node)) {
        warnings.push({
          type: 'dependency-cycle',
          message: 'Cycle detected in dependencyGraph',
        });
        return;
      }
    }
  }
}

/**
 * Warn about empty arrays that might indicate incomplete planning.
 */
function checkEmptyArrays(data, warnings) {
  if (data.verificationSummary) {
    if (data.verificationSummary.sItems && data.verificationSummary.sItems.length === 0) {
      warnings.push({
        type: 'empty-sItems',
        message: 'verificationSummary.sItems is empty',
      });
    }
    if (data.verificationSummary.gaps && data.verificationSummary.gaps.length === 0) {
      warnings.push({
        type: 'empty-gaps',
        message: 'verificationSummary.gaps is empty',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Stats computation
// ---------------------------------------------------------------------------

function computeStats(data) {
  const todos = data.todos || [];
  const dependencyGraph = data.dependencyGraph || [];
  const commitStrategy = data.commitStrategy || [];
  const vs = data.verificationSummary || {};

  return {
    todos: todos.length,
    dependencies: dependencyGraph.length,
    commits: commitStrategy.length,
    verification: {
      aItems: (vs.aItems || []).length,
      hItems: (vs.hItems || []).length,
      sItems: (vs.sItems || []).length,
      gaps: (vs.gaps || []).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate plan-content.json without generating PLAN.md.
 *
 * @param {string} name - Session name
 * @param {string} [dataPath] - Path to plan-content.json (defaults to session path)
 * @returns {{ valid: boolean, schemaErrors: Array, semanticWarnings: Array, stats: object }}
 */
export function planValidate(name, dataPath) {
  const resolvedPath = dataPath || _planContentPath(name);

  let raw;
  try {
    raw = readFileSync(resolvedPath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read plan-content file at '${resolvedPath}': ${err.message}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in '${resolvedPath}': ${err.message}`);
  }

  // Schema validation
  const { valid: schemaValid, errors: schemaErrors } = validatePlanContent(data);

  // Semantic checks (run even if schema has errors, for maximum feedback)
  const semanticWarnings = [];

  if (data.todos && Array.isArray(data.todos)) {
    const todoIds = collectTodoIds(data.todos);
    checkDuplicateTodoIds(data.todos, semanticWarnings);
    checkDependencyGraphRefs(data.dependencyGraph, todoIds, semanticWarnings);
    checkCommitStrategyRefs(data.commitStrategy, todoIds, semanticWarnings);
  }

  if (data.dependencyGraph && Array.isArray(data.dependencyGraph)) {
    checkDependencyCycles(data.dependencyGraph, semanticWarnings);
  }

  checkEmptyArrays(data, semanticWarnings);

  // Hard semantic errors (not just advisory warnings)
  const HARD_ERROR_TYPES = ['duplicate-todo-id', 'invalid-dependency-ref', 'invalid-commit-ref', 'dependency-cycle'];
  const hasHardErrors = semanticWarnings.some(w => HARD_ERROR_TYPES.includes(w.type));

  return {
    valid: schemaValid && !hasHardErrors,
    schemaErrors,
    semanticWarnings,
    stats: computeStats(data),
  };
}
