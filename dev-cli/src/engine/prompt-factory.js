/**
 * prompt-factory.js — Build prompts for individual TODO substeps
 *
 * Wires together plan-parser, variable-sub, context-manager, and prompt-builder
 * to produce complete prompt strings for each dispatch type.
 *
 * All functions are deterministic: same inputs → same outputs.
 */

import { parsePlan } from './plan-parser.js';
import { resolveInputs } from './variable-sub.js';
import { readOutputs } from './context-manager.js';
import {
  buildWorkerPrompt,
  buildVerifyPrompt,
  buildFixPrompt,
  buildCommitPrompt,
  buildCodeReviewPrompt,
  buildFinalVerifyPrompt,
  buildFinalizeFixPrompt,
  buildReportPrompt,
} from './prompt-builder.js';
import { readFileSync, existsSync } from 'node:fs';
import { contextDir } from '../core/paths.js';

// ---------------------------------------------------------------------------
// Internal: read context files for worker prompt
// ---------------------------------------------------------------------------

function readWorkerContext(name) {
  const dir = contextDir(name);
  let learnings = '';
  let issues = '';
  try {
    const lPath = `${dir}/learnings.md`;
    if (existsSync(lPath)) learnings = readFileSync(lPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  try {
    const iPath = `${dir}/issues.md`;
    if (existsSync(iPath)) issues = readFileSync(iPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return { learnings, issues };
}

// ---------------------------------------------------------------------------
// Internal: find commit entry for a TODO
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
      commands.push({ run: cmd, expect: 'exit 0' });
    }
  }
  return commands;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a prompt for a specific TODO and dispatch type.
 *
 * @param {string} name - Spec name
 * @param {string} todoId - TODO identifier (e.g. 'todo-1') or 'finalize'
 * @param {string} type - Prompt type: 'worker' | 'verify' | 'fix' | 'commit' | 'code-review' | 'final-verify' | 'report'
 * @param {object} [inputData] - Optional input data (e.g. workerResult for verify, verifyResult for fix)
 * @returns {string} The built prompt string
 */
export function buildPromptForTodo(name, todoId, type, inputData) {
  const plan = parsePlan(name);

  switch (type) {
    case 'worker': {
      const todo = plan.todos.find((t) => t.id === todoId);
      if (!todo) throw new Error(`TODO '${todoId}' not found in plan`);
      const outputs = readOutputs(name);
      const resolved = resolveInputs(todo, outputs);
      const context = readWorkerContext(name);
      return buildWorkerPrompt(todo, resolved, context);
    }

    case 'verify': {
      const todo = plan.todos.find((t) => t.id === todoId);
      if (!todo) throw new Error(`TODO '${todoId}' not found in plan`);
      const workerResult = inputData ?? null;
      return buildVerifyPrompt(todo, workerResult);
    }

    case 'fix': {
      const todo = plan.todos.find((t) => t.id === todoId);
      if (!todo) throw new Error(`TODO '${todoId}' not found in plan`);
      const verifyResult = inputData ?? {};
      return buildFixPrompt(todo, verifyResult);
    }

    case 'commit': {
      const todo = plan.todos.find((t) => t.id === todoId);
      if (!todo) throw new Error(`TODO '${todoId}' not found in plan`);
      const commitEntry = findCommitEntry(plan.commitStrategy, todoId);
      return buildCommitPrompt(todo, commitEntry);
    }

    case 'code-review': {
      return buildCodeReviewPrompt();
    }

    case 'finalize-fix': {
      const { stepName, stepResult, issues } = inputData ?? {};
      return buildFinalizeFixPrompt(stepName, stepResult, issues ?? []);
    }

    case 'final-verify': {
      const commands = extractVerificationCommands(plan);
      return buildFinalVerifyPrompt(commands);
    }

    case 'report': {
      const mode = inputData?.mode ?? 'standard';
      return buildReportPrompt(mode, plan.todos.length);
    }

    default:
      throw new Error(`Unknown prompt type: '${type}'`);
  }
}
