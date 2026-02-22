/**
 * plan-to-tasks.js — Convert a plan into TaskCreate-compatible task specs
 *
 * Reads plan-content.json, builds a DAG, and produces an array of TaskSpec
 * objects suitable for Claude Code's TaskCreate/TaskUpdate APIs.
 *
 * Checked TODOs (from PLAN.md) are skipped to support resume.
 */

import { parsePlan } from './plan-parser.js';
import { buildGraph, findRunnable } from './dag.js';
import { loadRecipe } from '../core/recipe-loader.js';

// ---------------------------------------------------------------------------
// Internal: build task specs from recipe substeps
// ---------------------------------------------------------------------------

/**
 * Build TaskSpec objects for a single TODO based on recipe substeps.
 *
 * @param {object} todo - Plan TODO object
 * @param {object[]} substeps - Recipe todo_substeps array
 * @param {object} commitEntry - Commit strategy entry for this TODO (or null)
 * @returns {object[]} Array of TaskSpec objects
 */
function buildTodoTaskSpecs(todo, substeps, commitEntry) {
  const tasks = [];

  for (const step of substeps) {
    // Skip commit substep if no commit entry and conditional
    if (step.conditional === 'commit_strategy' && !commitEntry) {
      continue;
    }

    const taskId = `${todo.id}.${step.suffix.toLowerCase().replace(/\s+/g, '-')}`;
    const subject = `TODO ${todo.id}: ${step.suffix}`;
    const activeForm = `${step.suffix}ing ${todo.id}`;

    tasks.push({
      id: taskId,
      subject,
      description: `${step.suffix} substep for ${todo.id}: ${todo.title}`,
      activeForm,
      metadata: {
        todoId: todo.id,
        substep: step.suffix.toLowerCase().replace(/\s+/g, '-'),
        type: step.type,
        agent: step.agent ?? null,
        promptType: step.prompt_type ?? null,
        readOnly: step.read_only ?? false,
        cmd: step.cmd ?? null,
      },
    });
  }

  return tasks;
}

/**
 * Build TaskSpec objects for finalize phase.
 *
 * @param {object[]} finalizeSteps - Recipe finalize array
 * @param {string} mode - 'standard' | 'quick'
 * @returns {object[]} Array of TaskSpec objects
 */
function buildFinalizeTaskSpecs(finalizeSteps) {
  return finalizeSteps.map((step) => {
    const taskId = `finalize.${step.suffix.toLowerCase().replace(/\s+/g, '-')}`;
    return {
      id: taskId,
      subject: `Finalize: ${step.suffix}`,
      description: `Finalize substep: ${step.suffix}`,
      activeForm: `Running ${step.suffix}`,
      metadata: {
        todoId: 'finalize',
        substep: step.suffix.toLowerCase().replace(/\s+/g, '-'),
        type: step.type,
        agent: step.agent ?? null,
        promptType: step.prompt_type ?? null,
        prOnly: step.pr_only ?? false,
      },
    };
  });
}

/**
 * Build dependency pairs from the DAG structure.
 *
 * @param {object[]} todoTasks - All TODO task specs (flattened)
 * @param {object[]} finalizeTasks - All finalize task specs
 * @param {object[]} todos - Plan TODO objects
 * @param {object[]} substeps - Recipe todo_substeps
 * @param {object[]} dependencyGraph - Plan dependency graph
 * @returns {object[]} Array of { from, to } dependency pairs
 */
function buildDependencies(todoTasks, finalizeTasks, todos, substeps, dependencyGraph) {
  const deps = [];

  // Build artifact → producer lookup
  const producerOf = new Map();
  for (const entry of dependencyGraph) {
    for (const artifact of entry.produces) {
      producerOf.set(artifact, entry.todo);
    }
  }

  // Build consumer → required artifacts lookup
  const requiresOf = new Map();
  for (const entry of dependencyGraph) {
    requiresOf.set(entry.todo, entry.requires ?? []);
  }

  // Within each TODO: sequential chain
  for (const todo of todos) {
    const todoSpecTasks = todoTasks.filter(
      (t) => t.metadata.todoId === todo.id,
    );
    for (let i = 1; i < todoSpecTasks.length; i++) {
      deps.push({ from: todoSpecTasks[i - 1].id, to: todoSpecTasks[i].id });
    }
  }

  // Cross-TODO: if TODO requires artifact, first substep blocked by producer's last substep
  for (const todo of todos) {
    const required = requiresOf.get(todo.id) ?? [];
    const todoSpecTasks = todoTasks.filter(
      (t) => t.metadata.todoId === todo.id,
    );
    if (todoSpecTasks.length === 0) continue;
    const firstTask = todoSpecTasks[0];

    for (const artifact of required) {
      const producerId = producerOf.get(artifact);
      if (!producerId) continue;
      const producerTasks = todoTasks.filter(
        (t) => t.metadata.todoId === producerId,
      );
      if (producerTasks.length === 0) continue;
      const lastProducerTask = producerTasks[producerTasks.length - 1];
      deps.push({ from: lastProducerTask.id, to: firstTask.id });
    }
  }

  // Finalize: sequential chain within finalize
  for (let i = 1; i < finalizeTasks.length; i++) {
    deps.push({ from: finalizeTasks[i - 1].id, to: finalizeTasks[i].id });
  }

  // Finalize first task blocked by all TODO last tasks
  if (finalizeTasks.length > 0) {
    const firstFinalize = finalizeTasks[0];
    for (const todo of todos) {
      const todoSpecTasks = todoTasks.filter(
        (t) => t.metadata.todoId === todo.id,
      );
      if (todoSpecTasks.length > 0) {
        const lastTask = todoSpecTasks[todoSpecTasks.length - 1];
        deps.push({ from: lastTask.id, to: firstFinalize.id });
      }
    }
  }

  return deps;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a plan into TaskCreate-compatible task specs.
 *
 * @param {string} name - Spec name
 * @param {string} [mode='standard'] - 'standard' | 'quick'
 * @returns {{ tasks: object[], dependencies: object[] }}
 */
export function planToTasks(name, mode = 'standard') {
  const plan = parsePlan(name);
  const recipeName = `execute-${mode}`;
  const recipe = loadRecipe(recipeName);

  const substeps = recipe.todo_substeps;
  const finalizeSteps = recipe.finalize;

  if (!substeps || !finalizeSteps) {
    throw new Error(`Recipe '${recipeName}' missing todo_substeps or finalize`);
  }

  // Filter unchecked TODOs (skip already completed ones for resume)
  const uncheckedTodos = plan.todos.filter((t) => !t.checked);

  // Build TODO task specs
  const allTodoTasks = [];
  for (const todo of uncheckedTodos) {
    const commitEntry =
      plan.commitStrategy.find((c) => c.afterTodo === todo.id) ?? null;
    const tasks = buildTodoTaskSpecs(todo, substeps, commitEntry);
    allTodoTasks.push(...tasks);
  }

  // Build finalize task specs
  const allFinalizeTasks = buildFinalizeTaskSpecs(finalizeSteps);

  const allTasks = [...allTodoTasks, ...allFinalizeTasks];
  const dependencies = buildDependencies(
    allTodoTasks,
    allFinalizeTasks,
    uncheckedTodos,
    substeps,
    plan.dependencyGraph,
  );

  return { tasks: allTasks, dependencies };
}
