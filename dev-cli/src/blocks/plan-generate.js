/**
 * plan-generate.js — dev-cli plan generate <name> --data <path>
 *
 * Reads plan-content.json, validates it, renders PLAN.md from a template,
 * and writes it atomically to PLAN.md in the session directory.
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { validatePlanContent } from '../schemas/plan-content.schema.js';
import { planPath as _planPath } from '../core/paths.js';

// ---------------------------------------------------------------------------
// Atomic write helper
// ---------------------------------------------------------------------------

function atomicWrite(targetPath, content) {
  const dir = dirname(targetPath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = `${targetPath}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    writeFileSync(tmpPath, content, 'utf8');
    renameSync(tmpPath, targetPath);
  } catch (err) {
    try {
      if (existsSync(tmpPath)) writeFileSync(tmpPath, '');
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// PLAN.md template rendering
// ---------------------------------------------------------------------------

/**
 * Render a list of string items as a Markdown bulleted list.
 * Returns a placeholder string if the array is empty.
 */
function renderList(items, placeholder = '_None_') {
  if (!items || items.length === 0) return placeholder;
  return items.map((item) => `- ${item}`).join('\n');
}

/**
 * Render a single TODO section block.
 */
function renderTodo(todo, index) {
  const num = index + 1;
  const typeLabel = todo.type === 'verification' ? 'Verification' : 'Work';

  const inputs =
    todo.inputs && todo.inputs.length > 0
      ? todo.inputs.map((i) => `  - **${i.name}** (${i.type}): \`${i.ref}\``).join('\n')
      : '  _None_';

  const outputs =
    todo.outputs && todo.outputs.length > 0
      ? todo.outputs
          .map((o) => `  - **${o.name}** (${o.type}): ${o.description} — \`${o.value}\``)
          .join('\n')
      : '  _None_';

  const steps =
    todo.steps && todo.steps.length > 0
      ? todo.steps.map((s, si) => `  ${si + 1}. ${s}`).join('\n')
      : '  _None_';

  const mustNotDo = renderList(todo.mustNotDo, '_None_');
  const references = renderList(todo.references, '_None_');

  const ac = todo.acceptanceCriteria || {};
  const acFunctional = renderList(ac.functional, '_None_');
  const acStatic = renderList(ac.static, '_None_');
  const acRuntime = renderList(ac.runtime, '_None_');
  const acCleanup = ac.cleanup && ac.cleanup.length > 0 ? renderList(ac.cleanup) : '_None_';

  return `### [ ] TODO ${num}: ${todo.title}

**Type**: ${typeLabel}
**Risk**: ${todo.risk}

**Inputs**:
${inputs}

**Outputs**:
${outputs}

**Steps**:
${steps}

**Must NOT Do**:
${mustNotDo}

**References**:
${references}

**Acceptance Criteria**:

- *Functional*:
${acFunctional
  .split('\n')
  .map((l) => `  ${l}`)
  .join('\n')}

- *Static*:
${acStatic
  .split('\n')
  .map((l) => `  ${l}`)
  .join('\n')}

- *Runtime*:
${acRuntime
  .split('\n')
  .map((l) => `  ${l}`)
  .join('\n')}

- *Cleanup*:
${acCleanup
  .split('\n')
  .map((l) => `  ${l}`)
  .join('\n')}`;
}

/**
 * Render the full PLAN.md content from validated plan-content data.
 *
 * @param {string} name - Plan name (used as title)
 * @param {object} data - Validated plan-content data
 * @returns {string} PLAN.md content
 */
function renderPlan(name, data) {
  const { context, objectives, todos, taskFlow, dependencyGraph, commitStrategy, verificationSummary } = data;

  // Verification Summary sections
  const aItems = renderList(verificationSummary.aItems, '_None_');
  const hItems = renderList(verificationSummary.hItems, '_None_');
  const sItems = renderList(verificationSummary.sItems, '_None_');
  const gaps = renderList(verificationSummary.gaps, '_None_');

  // Dependency graph
  const depGraph =
    dependencyGraph && dependencyGraph.length > 0
      ? dependencyGraph
          .map(
            (d) =>
              `- **${d.todo}**: requires [${d.requires.join(', ')}] → produces [${d.produces.join(', ')}]`,
          )
          .join('\n')
      : '_None_';

  // Commit strategy
  const commits =
    commitStrategy && commitStrategy.length > 0
      ? commitStrategy
          .map(
            (c) =>
              `- After \`${c.afterTodo}\`: \`${c.message}\`\n  - Files: ${c.files.join(', ')}\n  - Condition: ${c.condition}`,
          )
          .join('\n')
      : '_None_';

  // TODOs
  const todoSections = todos.map((todo, i) => renderTodo(todo, i)).join('\n\n---\n\n');

  // Assumptions
  const assumptions = context.assumptions ? context.assumptions : '_No explicit assumptions recorded._';

  return `# Plan: ${name}

> Generated plan for session: ${name}

## Verification Summary

### Agent-Verifiable (A-items)

${aItems}

### Human-Required (H-items)

${hItems}

### Sandbox Agent Testing (S-items)

${sItems}

### Verification Gaps

${gaps}

## External Dependencies Strategy

### Pre-work

_Review dependency graph and commit strategy before starting._

### During

_Follow commit strategy after each TODO completion._

### Post-work

_Run verification summary checks (A-items, H-items, S-items)._

## Context

### Original Request

${context.originalRequest}

### Interview Summary

${context.interviewSummary}

### Research Findings

${context.researchFindings}

### Assumptions

${assumptions}

## Work Objectives

### Core Objective

${objectives.core}

### Concrete Deliverables

${renderList(objectives.deliverables)}

### Definition of Done

${renderList(objectives.dod)}

### Must NOT Do

${renderList(objectives.mustNotDo)}

## Task Flow

${taskFlow}

## Dependency Graph

${depGraph}

## Commit Strategy

${commits}

## TODOs

${todoSections}
`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate PLAN.md from a plan-content.json file.
 *
 * @param {string} name - Session name
 * @param {string} dataPath - Path to plan-content.json
 * @returns {{ planPath: string }} Path to generated PLAN.md
 * @throws {Error} With actionable error messages if validation fails
 */
export function planGenerate(name, dataPath) {
  // Read plan-content.json
  let raw;
  try {
    raw = readFileSync(dataPath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read plan-content file at '${dataPath}': ${err.message}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in '${dataPath}': ${err.message}`);
  }

  // Validate against schema
  const { valid, errors } = validatePlanContent(data);
  if (!valid) {
    const errorLines = errors
      .map((e) => `  - [${e.path || 'root'}] ${e.message} (expected: ${e.expected})`)
      .join('\n');
    throw new Error(
      `plan-content.json validation failed with ${errors.length} error(s):\n${errorLines}\n\nFix the above errors in '${dataPath}' and retry.`,
    );
  }

  // Render PLAN.md
  const planContent = renderPlan(name, data);

  // Write PLAN.md atomically
  const planPath = _planPath(name);
  atomicWrite(planPath, planContent);

  return { planPath };
}
