/**
 * handlers/step-done.js — dev-cli step-done <name> --step <stepId>
 *
 * Records step completion in state.json.
 * Idempotent: if step is already done, returns { ok: true, noop: true }.
 *
 * Validation gates (numbered per design spec):
 *   - Gate 2: steps with agents — hard error if expected output files are missing
 *   - Gate 3: interview step — requires DRAFT completeness (hard gate)
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadState, updateState, appendEvent } from '../core/state.js';
import { getStepAgents } from '../core/recipe-loader.js';
import { draftValidate } from '../blocks/draft-validate.js';
import { findingsDir as _findingsDir, analysisDir as _analysisDir, specDir as _specDir } from '../core/paths.js';

/**
 * Resolve the work directory for output file validation.
 * Delegates to paths.js helpers to avoid duplicating resolution logic.
 *
 * @param {string} name - Spec name
 * @param {string} outputPath - Relative output path (e.g. "findings/explore-1.md")
 * @returns {string} Absolute path to the output file
 */
function resolveOutputPath(name, outputPath) {
  // Output paths in recipes are relative to the session work dir.
  // Use paths.js findingsDir/analysisDir based on the output prefix.
  if (outputPath.startsWith('findings/')) {
    return join(_findingsDir(name), outputPath.replace('findings/', ''));
  }
  if (outputPath.startsWith('analysis/')) {
    return join(_analysisDir(name), outputPath.replace('analysis/', ''));
  }
  // Fallback: resolve relative to spec dir
  return join(_specDir(name), outputPath);
}

export default async function handler(args) {
  const name = args[0] && !args[0].startsWith('--') ? args[0] : null;
  if (!name) {
    console.error('Usage: dev-cli step-done <name> --step <stepId>');
    process.exit(1);
  }

  const stepIdx = args.indexOf('--step');
  if (stepIdx === -1 || stepIdx + 1 >= args.length) {
    console.error('Error: --step <stepId> is required');
    process.exit(1);
  }
  const stepId = args[stepIdx + 1];

  // CR-005: Guard against flag-like stepId values
  if (stepId.startsWith('--')) {
    console.error(`Error: --step value '${stepId}' looks like a flag, not a step ID`);
    process.exit(1);
  }

  const state = loadState(name);
  const steps = { ...(state.steps ?? {}) };

  // Idempotent: already done -> no-op (must run BEFORE recipeSteps check
  // to avoid spurious warnings for pre-recorded steps like 'init')
  if (steps[stepId]?.status === 'done') {
    console.log(JSON.stringify({ ok: true, noop: true, step: stepId, message: `Step '${stepId}' already done` }));
    return;
  }

  // recipeSteps가 있으면 유효성 검증 (하위 호환: 없으면 skip)
  // Meta steps like 'init' are pre-recorded at state construction and bypass this via idempotent check above.
  if (Array.isArray(state.recipeSteps) && state.recipeSteps.length > 0) {
    if (!state.recipeSteps.includes(stepId)) {
      console.warn(`Warning: step '${stepId}' is not in recipeSteps [${state.recipeSteps.join(', ')}]`);
    }
  }

  const warnings = [];

  // --- Gate 3: Interview completeness gate (hard error) ---
  if (stepId === 'interview') {
    try {
      const validation = draftValidate(name);
      if (!validation.ready) {
        const result = {
          ok: false,
          error: 'draft_incomplete',
          step: stepId,
          missing: validation.missing,
          message: `DRAFT is incomplete. Missing sections: ${validation.missing.join(', ')}. Fill these sections before marking interview as done.`,
        };
        console.error(JSON.stringify(result, null, 2));
        process.exit(1);
      }
    } catch (err) {
      // If draft-validate fails (e.g. DRAFT.md not found), warn but don't block
      warnings.push(`Could not validate DRAFT completeness: ${err.message}`);
    }
  }

  // --- Gate 2: Step output file validation (hard error) ---
  // Recipe declares which agents run in each step. If output files are missing,
  // it means agents were not launched — block step completion to enforce dispatch.
  if (state.recipe && state.skill) {
    const agents = getStepAgents(state.recipe, stepId, state.skill);
    if (agents && agents.length > 0) {
      const missingOutputs = [];
      for (const agent of agents) {
        if (!agent.output) continue; // agents without output path are not validated
        const outputPath = resolveOutputPath(name, agent.output);
        if (!existsSync(outputPath)) {
          missingOutputs.push({ agent: agent.type, output: agent.output });
        }
      }
      if (missingOutputs.length > 0) {
        const result = {
          ok: false,
          error: 'agent_outputs_missing',
          step: stepId,
          expected: agents.length,
          missing: missingOutputs,
          message: `Cannot complete step '${stepId}': ${missingOutputs.length}/${agents.length} agent output(s) missing. Launch ALL agents listed in recipe before calling step-done. Missing: ${missingOutputs.map(m => m.agent).join(', ')}`,
        };
        console.error(JSON.stringify(result, null, 2));
        process.exit(1);
      }
    }
  }

  const now = new Date().toISOString();
  steps[stepId] = { status: 'done', at: now };

  // Also track currentBlock for manifest recovery (CR-003)
  updateState(name, { steps, currentBlock: stepId });
  appendEvent(name, 'step.done', { step: stepId });

  const result = { ok: true, noop: false, step: stepId };
  if (warnings.length > 0) result.warnings = warnings;
  console.log(JSON.stringify(result, null, 2));
}
