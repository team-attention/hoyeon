/**
 * handlers/step-done.js — dev-cli step-done <name> --step <stepId>
 *
 * Records step completion in state.json.
 * Idempotent: if step is already done, returns { ok: true, noop: true }.
 */

import { loadState, updateState, appendEvent } from '../core/state.js';

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

  const now = new Date().toISOString();
  steps[stepId] = { status: 'done', at: now };

  // Also track currentBlock for manifest recovery (CR-003)
  updateState(name, { steps, currentBlock: stepId });
  appendEvent(name, 'step.done', { step: stepId });

  console.log(JSON.stringify({ ok: true, noop: false, step: stepId }));
}
