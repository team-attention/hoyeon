/**
 * prompt-builder.js — Deterministic prompt builders for the execute pipeline
 *
 * Takes structured data (todo objects, results, etc.) and returns prompt strings.
 * No LLM calls. No hardcoded project-specific paths.
 *
 * All exported functions are pure: same input always produces the same output.
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Format a list of outputs into a readable bullet list.
 * @param {Array<{ name: string, type: string, value: string, description: string }>} outputs
 * @returns {string}
 */
function formatOutputs(outputs) {
  if (!outputs || outputs.length === 0) return '- (none)';
  return outputs
    .map((o) => `- **${o.name}** (${o.type}): \`${o.value}\` — ${o.description}`)
    .join('\n');
}

/**
 * Format acceptance criteria sections.
 * @param {{ functional?: string[], static?: string[], runtime?: string[], cleanup?: string[] }} ac
 * @returns {string}
 */
function formatAcceptanceCriteria(ac) {
  const lines = [];

  if (ac.functional && ac.functional.length > 0) {
    lines.push('**Functional:**');
    ac.functional.forEach((c) => lines.push(`- ${c}`));
  }
  if (ac.static && ac.static.length > 0) {
    lines.push('**Static:**');
    ac.static.forEach((c) => lines.push(`- ${c}`));
  }
  if (ac.runtime && ac.runtime.length > 0) {
    lines.push('**Runtime:**');
    ac.runtime.forEach((c) => lines.push(`- ${c}`));
  }
  if (ac.cleanup && ac.cleanup.length > 0) {
    lines.push('**Cleanup:**');
    ac.cleanup.forEach((c) => lines.push(`- ${c}`));
  }

  return lines.length > 0 ? lines.join('\n') : '- (none)';
}

/**
 * Format a string array as a bulleted list.
 * @param {string[]} items
 * @returns {string}
 */
function bulletList(items) {
  if (!items || items.length === 0) return '- (none)';
  return items.map((item) => `- ${item}`).join('\n');
}

/**
 * Format a numbered list.
 * @param {string[]} items
 * @returns {string}
 */
function numberedList(items) {
  if (!items || items.length === 0) return '1. (none)';
  return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
}

/**
 * Format resolved inputs as a list.
 * @param {Array<{ name: string, type: string, ref: string }>} resolvedInputs
 * @returns {string}
 */
function formatResolvedInputs(resolvedInputs) {
  if (!resolvedInputs || resolvedInputs.length === 0) return '- (none)';
  return resolvedInputs
    .map((inp) => `- **${inp.name}** (${inp.type}): \`${inp.ref}\``)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a worker prompt for a single TODO.
 *
 * @param {object} todo - TODO object from plan-parser output
 * @param {Array<{ name: string, type: string, ref: string }>} resolvedInputs - Resolved input variables
 * @param {{ learnings?: string, issues?: string }} context - Optional inherited context
 * @returns {string} The worker prompt string
 */
export function buildWorkerPrompt(todo, resolvedInputs, context) {
  const sections = [];

  // TASK section
  sections.push(`# TASK\n\n# TODO ${todo.id}: ${todo.title}\n\nType: ${todo.type} | Risk: ${todo.risk}`);

  // STEPS section
  sections.push(`# STEPS\n\n${numberedList(todo.steps)}`);

  // EXPECTED OUTCOME section
  const outputsBlock = formatOutputs(todo.outputs);
  const acBlock = formatAcceptanceCriteria(todo.acceptanceCriteria);
  sections.push(`# EXPECTED OUTCOME\n\n## Outputs\n${outputsBlock}\n\n## Acceptance Criteria\n${acBlock}`);

  // MUST NOT DO section
  sections.push(`# MUST NOT DO\n\n${bulletList(todo.mustNotDo)}`);

  // REFERENCES section
  sections.push(`# REFERENCES\n\n${bulletList(todo.references)}`);

  // CONTEXT section
  let contextContent = `## Resolved Inputs\n${formatResolvedInputs(resolvedInputs)}`;

  if (context && context.learnings && context.learnings.trim().length > 0) {
    contextContent += `\n\n### Inherited Learnings\n${context.learnings}`;
  }
  if (context && context.issues && context.issues.trim().length > 0) {
    contextContent += `\n\n### Known Issues\n${context.issues}`;
  }

  sections.push(`# CONTEXT\n\n${contextContent}`);

  return sections.join('\n\n');
}

/**
 * Build a verify prompt for a TODO with strict JSON output specification.
 *
 * @param {object} todo - TODO object from plan-parser output
 * @param {object} workerResult - The result object returned by the worker agent
 * @returns {string} The verify prompt string
 */
export function buildVerifyPrompt(todo, workerResult) {
  const acLines = [];

  const ac = todo.acceptanceCriteria || {};
  if (ac.functional && ac.functional.length > 0) {
    acLines.push('**Functional:**');
    ac.functional.forEach((c) => acLines.push(`- ${c}`));
  }
  if (ac.static && ac.static.length > 0) {
    acLines.push('**Static:**');
    ac.static.forEach((c) => acLines.push(`- ${c}`));
  }
  if (ac.runtime && ac.runtime.length > 0) {
    acLines.push('**Runtime:**');
    ac.runtime.forEach((c) => acLines.push(`- ${c}`));
  }

  const acBlock = acLines.length > 0 ? acLines.join('\n') : '- (none)';
  const mustNotDoBlock = bulletList(todo.mustNotDo);

  return `# Verify: TODO ${todo.id}

## Part 1: Acceptance Criteria Check
${acBlock}

## Part 2: Must-NOT-Do Violations
${mustNotDoBlock}

## Part 3: Side-Effect Audit
Check for unintended changes outside the TODO scope.

## Part 4: Sandbox Lifecycle
If sandbox tests are specified, verify they were executed.

## Part 5: Scope Blockage Detection
Detect if this TODO blocks other TODOs or requires adaptation.

## Worker Output
${JSON.stringify(workerResult, null, 2)}

## Required Output Format
Respond with ONLY a JSON object:
{
  "status": "VERIFIED" | "FAILED",
  "criteria": [{ "name": "...", "pass": true|false, "evidence": "..." }],
  "mustNotDoViolations": [{ "rule": "...", "violated": true|false, "evidence": "..." }],
  "sideEffects": [{ "description": "...", "severity": "info|warning|critical" }],
  "suggestedAdaptation": null | { "reason": "...", "newTodo": { "title": "...", "steps": [...], "outputs": [...] } },
  "summary": "..."
}`;
}

/**
 * Build a fix prompt listing specific failed criteria from a verify result.
 *
 * @param {object} todo - TODO object from plan-parser output
 * @param {object} verifyResult - The result object returned by the verify agent
 * @returns {string} The fix prompt string
 */
export function buildFixPrompt(todo, verifyResult) {
  const failedCriteria = (verifyResult.criteria || []).filter((c) => c.pass === false);
  const failedCriteriaBlock =
    failedCriteria.length > 0
      ? failedCriteria.map((c) => `- **${c.name}**: ${c.evidence}`).join('\n')
      : '- (none)';

  const violations = (verifyResult.mustNotDoViolations || []).filter((v) => v.violated === true);
  const violationsBlock =
    violations.length > 0
      ? violations.map((v) => `- **${v.rule}**: ${v.evidence}`).join('\n')
      : '- (none)';

  return `# Fix: TODO ${todo.id}

## Failed Criteria
${failedCriteriaBlock}

## Must-NOT-Do Violations
${violationsBlock}

## Instructions
Fix ONLY the issues listed above. Do not refactor or improve other code.`;
}

/**
 * Build a wrap-up prompt for a TODO.
 *
 * @param {object} todo - TODO object from plan-parser output
 * @returns {string} The wrapup prompt string
 */
export function buildWrapupPrompt(todo) {
  return `# Wrap-up: TODO ${todo.id}

Save the following context:
1. **Outputs**: Record output values to context/outputs.json
2. **Learnings**: Record any patterns, decisions, or discoveries to context/learnings.md
3. **Issues**: Record any unresolved blockers to context/issues.md

Then mark this TODO as [x] in PLAN.md.`;
}

/**
 * Build a commit prompt for a TODO.
 *
 * @param {object} todo - TODO object from plan-parser output
 * @param {{ message: string, files: string[], condition: string } | null} commitEntry - Commit strategy entry or null
 * @returns {string} The commit prompt string
 */
export function buildCommitPrompt(todo, commitEntry) {
  if (!commitEntry) {
    return `# Commit: TODO ${todo.id}

No commit strategy entry for this TODO. Skip commit.`;
  }

  return `# Commit: TODO ${todo.id}

Commit message: ${commitEntry.message}
Files: ${commitEntry.files.join(', ')}
Condition: ${commitEntry.condition}`;
}

/**
 * Build a code review prompt for the full execution session diff.
 *
 * @returns {string} The code review prompt string
 */
export function buildCodeReviewPrompt() {
  return `# Code Review

Review the full diff of all changes made during this execution session.
Check for:
1. Code quality and consistency
2. Security vulnerabilities
3. Missing error handling
4. Test coverage gaps

Respond with JSON:
{
  "verdict": "SHIP" | "NEEDS_FIXES",
  "issues": [{ "file": "...", "line": N, "severity": "...", "description": "..." }],
  "summary": "..."
}`;
}

/**
 * Build a final verification prompt with a list of commands to run.
 *
 * @param {Array<{ run: string, expect: string }>} verificationCommands - Commands to verify
 * @returns {string} The final verify prompt string
 */
export function buildFinalVerifyPrompt(verificationCommands) {
  const commandList =
    verificationCommands && verificationCommands.length > 0
      ? verificationCommands.map((c) => `- \`${c.run}\` (expect: ${c.expect})`).join('\n')
      : '- (none)';

  return `# Final Verification

Run the following verification commands:
${commandList}

Report results as JSON:
{
  "status": "PASS" | "FAIL",
  "results": [{ "command": "...", "exitCode": N, "pass": true|false }],
  "summary": "..."
}`;
}

/**
 * Build an execution report prompt.
 *
 * @param {string} mode - Execution mode ('standard' | 'quick')
 * @param {number} todoCount - Total number of TODOs in the plan
 * @returns {string} The report prompt string
 */
export function buildReportPrompt(mode, todoCount) {
  return `# Execution Report

Mode: ${mode}
Total TODOs: ${todoCount}

Generate a summary report of the execution session.`;
}
