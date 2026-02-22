/**
 * plan-parser.js — Parse plan-content.json and PLAN.md checkbox status
 *
 * Reads structured plan data, validates it, and merges with
 * PLAN.md checkbox status to produce a normalized plan object.
 */

import { readFileSync } from 'node:fs';
import { validatePlanContent } from '../schemas/plan-content.schema.js';
import { planContentPath, planPath } from '../core/paths.js';

// ---------------------------------------------------------------------------
// PLAN.md checkbox parser
// ---------------------------------------------------------------------------

/**
 * Extract TODO checked status from PLAN.md.
 * Matches `### [x] TODO N` (checked) and `### [ ] TODO N` (unchecked).
 *
 * @param {string} name - Spec name
 * @returns {Map<number, boolean>} Map of TODO number → checked status
 */
export function loadCheckedStatus(name) {
  const filePath = planPath(name);
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return new Map();
  }

  const result = new Map();
  const pattern = /^###\s+\[([ xX])\]\s+TODO\s+(\d+)/gm;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const checked = match[1].toLowerCase() === 'x';
    const todoNum = parseInt(match[2], 10);
    result.set(todoNum, checked);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Plan parser
// ---------------------------------------------------------------------------

/**
 * Parse plan-content.json and return a normalized plan object.
 *
 * @param {string} name - Spec name
 * @returns {{ todos: object[], dependencyGraph: object[], commitStrategy: object[], verificationSummary: object, objectives: object, context: object, taskFlow: string }}
 * @throws {Error} If plan-content.json is missing, invalid JSON, or fails validation
 */
export function parsePlan(name) {
  const filePath = planContentPath(name);

  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read plan-content.json at '${filePath}': ${err.message}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in plan-content.json at '${filePath}': ${err.message}`);
  }

  const { valid, errors } = validatePlanContent(data);
  if (!valid) {
    const errorLines = errors
      .map((e) => `  - [${e.path || 'root'}] ${e.message} (expected: ${e.expected})`)
      .join('\n');
    throw new Error(
      `plan-content.json validation failed with ${errors.length} error(s):\n${errorLines}`,
    );
  }

  // Merge checked status from PLAN.md
  const checkedStatus = loadCheckedStatus(name);

  const todos = data.todos.map((todo, index) => {
    const todoNum = index + 1;
    return {
      id: todo.id,
      title: todo.title,
      type: todo.type,
      inputs: todo.inputs,
      outputs: todo.outputs,
      steps: todo.steps,
      acceptanceCriteria: todo.acceptanceCriteria,
      mustNotDo: todo.mustNotDo,
      references: todo.references,
      risk: todo.risk,
      checked: checkedStatus.get(todoNum) ?? false,
    };
  });

  return {
    todos,
    dependencyGraph: data.dependencyGraph,
    commitStrategy: data.commitStrategy,
    verificationSummary: data.verificationSummary,
    objectives: data.objectives,
    context: data.context,
    taskFlow: data.taskFlow,
  };
}
