/**
 * engine.js — Core execute engine driver
 *
 * Orchestrates plan execution via DAG scheduling, prompt building,
 * context management, and reconciliation. All LLM interaction happens
 * externally — this module only produces instruction JSON.
 */

import { loadState, updateState, appendEvent } from '../core/state.js';
import { parsePlan } from './plan-parser.js';
import { buildGraph, findRunnable, markComplete, insertDynamicTodo } from './dag.js';
import { initContext, readOutputs, writeOutput, appendLearning, appendIssue, appendAudit } from './context-manager.js';
import { resolveInputs } from './variable-sub.js';
import { triage, buildAuditEntry } from './reconciler.js';
import {
  buildWorkerPrompt,
  buildVerifyPrompt,
  buildFixPrompt,
  buildWrapupPrompt,
  buildCommitPrompt,
  buildCodeReviewPrompt,
  buildFinalVerifyPrompt,
  buildReportPrompt,
} from './prompt-builder.js';

// ---------------------------------------------------------------------------
// Internal: graph serialization (Map → plain object for JSON storage)
// ---------------------------------------------------------------------------

function serializeGraph(graph) {
  const nodes = {};
  for (const [id, node] of graph.nodes) {
    nodes[id] = {
      ...node,
      blockedBy: [...node.blockedBy],
    };
  }
  const dynamicCounts = {};
  for (const [id, count] of graph.dynamicCounts) {
    dynamicCounts[id] = count;
  }
  return { nodes, dynamicCounts };
}

function deserializeGraph(raw) {
  const nodes = new Map();
  for (const [id, node] of Object.entries(raw.nodes)) {
    nodes.set(id, {
      ...node,
      blockedBy: new Set(node.blockedBy),
    });
  }
  const dynamicCounts = new Map();
  for (const [id, count] of Object.entries(raw.dynamicCounts ?? {})) {
    dynamicCounts.set(id, count);
  }
  return { nodes, dynamicCounts };
}

// ---------------------------------------------------------------------------
// Internal: find commit strategy entry for a TODO
// ---------------------------------------------------------------------------

function findCommitEntry(commitStrategy, todoId) {
  return commitStrategy.find((c) => c.afterTodo === todoId) ?? null;
}

// ---------------------------------------------------------------------------
// Internal: extract verification commands from plan
// ---------------------------------------------------------------------------

function extractVerificationCommands(plan) {
  const commands = [];
  for (const todo of plan.todos) {
    for (const cmd of todo.acceptanceCriteria.runtime ?? []) {
      if (cmd.includes('node --test') || cmd.includes('npm test')) {
        commands.push({ run: cmd, expect: 'exit 0' });
      }
    }
  }
  return commands;
}

// ---------------------------------------------------------------------------
// Internal: build context for worker prompt
// ---------------------------------------------------------------------------

import { readFileSync as _readFileSync, existsSync as _existsSync } from 'node:fs';
import { contextDir as _contextDir } from '../core/paths.js';

function buildWorkerContextSync(name) {
  const dir = _contextDir(name);
  let learnings = '';
  let issues = '';
  try {
    const lPath = `${dir}/learnings.md`;
    if (_existsSync(lPath)) learnings = _readFileSync(lPath, 'utf8');
  } catch { /* empty */ }
  try {
    const iPath = `${dir}/issues.md`;
    if (_existsSync(iPath)) issues = _readFileSync(iPath, 'utf8');
  } catch { /* empty */ }
  return { learnings, issues };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the engine for an execute session.
 *
 * @param {string} name - Spec/session name
 * @param {string} mode - 'standard' | 'quick'
 * @returns {{ action: string, todoCount: number, mode: string }}
 */
export function engineInit(name, mode) {
  const plan = parsePlan(name);
  const graph = buildGraph(plan.todos, plan.dependencyGraph, plan.commitStrategy, mode);

  initContext(name);

  // Build initial engine state for each TODO
  const todos = {};
  for (const todo of plan.todos) {
    todos[todo.id] = {
      status: 'pending',
      retries: 0,
      dynamicTodos: 0,
      workerResult: null,
      verifyResult: null,
    };
  }

  const engineState = {
    mode,
    initialized: true,
    todos,
    finalize: {
      status: 'pending',
      step: null,
      codeReviewResult: null,
    },
    graph: serializeGraph(graph),
    dynamicTodos: [],
    plan: {
      commitStrategy: plan.commitStrategy,
      verificationSummary: plan.verificationSummary,
      objectives: plan.objectives,
    },
  };

  updateState(name, { engine: engineState });
  appendEvent(name, 'engine.init', { mode, todoCount: plan.todos.length });

  return {
    action: 'engine-init',
    todoCount: plan.todos.length,
    mode,
  };
}

/**
 * Get the next action for the engine to dispatch.
 *
 * @param {string} name - Spec/session name
 * @returns {object} Action JSON or { done: true }
 */
export function engineNext(name) {
  const state = loadState(name);

  // Not initialized → init
  if (!state.engine?.initialized) {
    const mode = state.mode?.depth ?? 'standard';
    return engineInit(name, mode);
  }

  const engine = state.engine;

  // Idempotent: if there's a pending engine action, return it again
  if (engine.pendingAction) {
    return engine.pendingAction;
  }

  const graph = deserializeGraph(engine.graph);
  const plan = parsePlan(name);
  const mode = engine.mode;

  // Restore completed status from engine state
  for (const [todoId, todoState] of Object.entries(engine.todos)) {
    if (todoState.status === 'done' || todoState.status === 'failed') {
      // Mark all substeps of this TODO as complete in graph
      for (const [nodeId, node] of graph.nodes) {
        if (node.todoId === todoId) {
          node.status = 'complete';
        }
      }
    }
  }

  // Also restore finalize steps that are complete
  if (engine.finalize.status === 'done') {
    for (const [nodeId, node] of graph.nodes) {
      if (node.todoId === 'finalize') {
        node.status = 'complete';
      }
    }
  }

  // Find runnable nodes
  const runnable = findRunnable(graph);

  if (runnable.length === 0) {
    // Check if everything is done
    const allDone = [...graph.nodes.values()].every(
      (n) => n.status === 'complete',
    );
    if (allDone) {
      return { done: true };
    }
    // Check for any failed TODOs blocking progress
    const failedTodos = Object.entries(engine.todos)
      .filter(([, s]) => s.status === 'failed')
      .map(([id]) => id);
    if (failedTodos.length > 0) {
      return { done: true, halted: true, failedTodos };
    }
    return { done: true, halted: true, reason: 'No runnable nodes and not all complete' };
  }

  // Pick the first runnable node (deterministic ordering)
  const nodeId = runnable[0];
  const node = graph.nodes.get(nodeId);
  const { todoId, substep } = node;

  // Build the appropriate response
  let response;

  if (todoId === 'finalize') {
    response = buildFinalizeResponse(substep, engine, plan, mode);
  } else {
    const todo = plan.todos.find((t) => t.id === todoId);
    if (!todo) {
      return { done: true, halted: true, reason: `TODO '${todoId}' not found in plan` };
    }
    response = buildTodoSubstepResponse(substep, todo, engine, name, plan);
  }

  // Store pending action for idempotency
  response.stepId = nodeId;
  const updatedEngine = {
    ...engine,
    pendingAction: response,
  };
  updateState(name, { engine: updatedEngine });

  return response;
}

/**
 * Complete a step and advance the engine.
 *
 * @param {string} name - Spec/session name
 * @param {string} stepId - Substep ID (e.g., 'todo-1.worker', 'finalize.code-review')
 * @param {object} result - Step result data
 * @returns {object} Updated engine state summary
 */
export function engineStepComplete(name, stepId, result) {
  const state = loadState(name);
  const engine = { ...state.engine };
  const graph = deserializeGraph(engine.graph);

  // Clear pending action
  engine.pendingAction = null;

  // Mark node complete in graph
  markComplete(graph, stepId);

  // Parse stepId
  const dotIdx = stepId.indexOf('.');
  const todoId = stepId.substring(0, dotIdx);
  const substep = stepId.substring(dotIdx + 1);

  if (todoId === 'finalize') {
    handleFinalizeStepComplete(engine, graph, substep, result, name);
  } else {
    handleTodoStepComplete(engine, graph, todoId, substep, result, name);
  }

  // Save updated graph and state
  engine.graph = serializeGraph(graph);
  updateState(name, { engine });
  appendEvent(name, 'engine.step.complete', { stepId, substep });

  return { completed: stepId, todoId, substep };
}

// ---------------------------------------------------------------------------
// Internal: response builders
// ---------------------------------------------------------------------------

function buildTodoSubstepResponse(substep, todo, engine, name, plan) {
  const mode = engine.mode;
  const todoState = engine.todos[todo.id] ?? {};

  switch (substep) {
    case 'worker': {
      const outputs = readOutputs(name);
      const resolved = resolveInputs(todo, outputs);
      const context = buildWorkerContextSync(name);
      const instruction = buildWorkerPrompt(todo, resolved, context);
      return {
        action: 'engine-worker',
        todoId: todo.id,
        substep: 'worker',
        instruction,
      };
    }

    case 'verify': {
      const workerResult = todoState.workerResult;
      const instruction = buildVerifyPrompt(todo, workerResult);
      return {
        action: 'engine-verify',
        todoId: todo.id,
        substep: 'verify',
        instruction,
      };
    }

    case 'wrapup': {
      const instruction = buildWrapupPrompt(todo);
      return {
        action: 'engine-wrapup',
        todoId: todo.id,
        substep: 'wrapup',
        instruction,
      };
    }

    case 'commit': {
      const commitEntry = findCommitEntry(plan.commitStrategy, todo.id);
      const instruction = buildCommitPrompt(todo, commitEntry);
      return {
        action: 'engine-commit',
        todoId: todo.id,
        substep: 'commit',
        instruction,
      };
    }

    default:
      throw new Error(`Unknown substep '${substep}' for TODO '${todo.id}'`);
  }
}

function buildFinalizeResponse(substep, engine, plan, mode) {
  switch (substep) {
    case 'residual-commit':
      return {
        action: 'engine-finalize',
        substep: 'residual-commit',
        instruction: 'Check `git status --porcelain`. If there are uncommitted changes, create a residual commit. Otherwise skip.',
      };

    case 'code-review': {
      const instruction = buildCodeReviewPrompt();
      return {
        action: 'engine-finalize',
        substep: 'code-review',
        instruction,
      };
    }

    case 'final-verify': {
      const commands = extractVerificationCommands(plan);
      const instruction = buildFinalVerifyPrompt(commands);
      return {
        action: 'engine-finalize',
        substep: 'final-verify',
        instruction,
      };
    }

    case 'state-complete':
      return {
        action: 'engine-finalize',
        substep: 'state-complete',
        instruction: 'Mark the execution state as complete.',
      };

    case 'report': {
      const todoCount = plan.todos.length;
      const instruction = buildReportPrompt(mode, todoCount);
      return {
        action: 'engine-finalize',
        substep: 'report',
        instruction,
      };
    }

    default:
      throw new Error(`Unknown finalize substep '${substep}'`);
  }
}

// ---------------------------------------------------------------------------
// Internal: step complete handlers
// ---------------------------------------------------------------------------

function handleTodoStepComplete(engine, graph, todoId, substep, result, name) {
  const todoState = engine.todos[todoId] ?? {
    status: 'pending',
    retries: 0,
    dynamicTodos: 0,
    workerResult: null,
    verifyResult: null,
  };

  switch (substep) {
    case 'worker': {
      todoState.workerResult = result;
      todoState.status = 'worker';
      break;
    }

    case 'verify': {
      todoState.verifyResult = result;
      const plan = parsePlan(name);
      const todo = plan.todos.find((t) => t.id === todoId);
      const todoType = todo?.type ?? 'work';

      const triageResult = triage(result, todoType, todoState);

      // Log audit
      const auditEntry = buildAuditEntry('triage', todoId, {
        disposition: triageResult.disposition,
        reason: triageResult.reason,
      });
      appendAudit(name, auditEntry);

      switch (triageResult.disposition) {
        case 'pass':
          todoState.status = 'verify';
          break;

        case 'retry': {
          // Reset to worker, increment retries
          todoState.retries += 1;
          todoState.status = 'pending';
          todoState.workerResult = null;
          todoState.verifyResult = null;

          // Reset worker and verify nodes to pending
          const workerNode = graph.nodes.get(`${todoId}.worker`);
          const verifyNode = graph.nodes.get(`${todoId}.verify`);
          if (workerNode) workerNode.status = 'pending';
          if (verifyNode) verifyNode.status = 'pending';

          // Build fix prompt — store as workerResult context for next worker dispatch
          const fixInstruction = buildFixPrompt(todo, result);
          todoState.fixContext = fixInstruction;

          appendIssue(name, todoId, `Retry #${todoState.retries}: ${triageResult.reason}`);
          break;
        }

        case 'adapt': {
          todoState.status = 'verify';
          const adaptation = triageResult.details.adaptation ?? {
            reason: triageResult.reason,
            newTodo: {
              title: `Fix: ${todoId}`,
              steps: ['Apply fix based on verify results'],
              outputs: [],
            },
          };

          const dynamicId = `${todoId}-fix-${(todoState.dynamicTodos ?? 0) + 1}`;
          try {
            insertDynamicTodo(graph, todoId, { id: dynamicId }, engine.mode);
            todoState.dynamicTodos = (todoState.dynamicTodos ?? 0) + 1;
            engine.dynamicTodos = [
              ...(engine.dynamicTodos ?? []),
              {
                id: dynamicId,
                parentId: todoId,
                adaptation,
              },
            ];
            // Add dynamic TODO state
            engine.todos[dynamicId] = {
              status: 'pending',
              retries: 0,
              dynamicTodos: 0,
              workerResult: null,
              verifyResult: null,
              isDynamic: true,
              parentId: todoId,
              adaptation,
            };
          } catch {
            // Max dynamic TODOs reached — halt instead
            todoState.status = 'failed';
            appendIssue(name, todoId, `HALT: Max dynamic TODOs reached during adapt`);
          }
          break;
        }

        case 'halt': {
          todoState.status = 'failed';
          appendIssue(name, todoId, `HALT: ${triageResult.reason}`);
          // Mark remaining substeps as complete to unblock finalize
          for (const [nId, node] of graph.nodes) {
            if (node.todoId === todoId && node.status === 'pending') {
              node.status = 'complete';
            }
          }
          break;
        }
      }
      break;
    }

    case 'wrapup': {
      // Write outputs and context from result
      if (result?.outputs) {
        writeOutput(name, todoId, result.outputs);
      }
      if (result?.learnings) {
        appendLearning(name, todoId, result.learnings);
      }
      if (result?.issues) {
        appendIssue(name, todoId, result.issues);
      }
      todoState.status = 'wrapup';
      break;
    }

    case 'commit': {
      todoState.status = 'done';
      break;
    }

    default:
      throw new Error(`Unknown substep '${substep}' for TODO '${todoId}'`);
  }

  engine.todos[todoId] = todoState;
}

function handleFinalizeStepComplete(engine, graph, substep, result, name) {
  switch (substep) {
    case 'residual-commit':
      engine.finalize.step = 'residual-commit';
      break;

    case 'code-review': {
      engine.finalize.codeReviewResult = result;
      engine.finalize.step = 'code-review';

      // If NEEDS_FIXES, we could create a fix chain — for now, just log
      if (result?.verdict === 'NEEDS_FIXES') {
        appendIssue(name, 'finalize', `Code review: NEEDS_FIXES — ${result.summary ?? 'See review'}`);
      }
      break;
    }

    case 'final-verify':
      engine.finalize.step = 'final-verify';
      if (result?.status === 'FAIL') {
        appendIssue(name, 'finalize', `Final verify FAIL: ${result.summary ?? 'See results'}`);
      }
      break;

    case 'state-complete':
      engine.finalize.step = 'state-complete';
      break;

    case 'report':
      engine.finalize.status = 'done';
      engine.finalize.step = 'report';
      break;

    default:
      throw new Error(`Unknown finalize substep '${substep}'`);
  }
}
