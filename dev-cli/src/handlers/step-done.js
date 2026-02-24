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

  // Idempotent: already done -> no-op
  if (steps[stepId]?.status === 'done') {
    console.log(JSON.stringify({ ok: true, noop: true, step: stepId, message: `Step '${stepId}' already done` }));
    return;
  }

  const now = new Date().toISOString();
  steps[stepId] = { status: 'done', at: now };

  // Also track currentBlock for manifest recovery (CR-003)
  updateState(name, { steps, currentBlock: stepId });
  appendEvent(name, 'step.done', { step: stepId });

  console.log(JSON.stringify({ ok: true, noop: false, step: stepId }));
}
