/**
 * handlers/finalize.js — dev-cli finalize <name>
 *
 * Marks engine finalize as done in state.json.
 * Called after the :Report substep completes to signal the stop hook
 * that orchestration is complete and the session can exit cleanly.
 */

import { loadState, updateState, appendEvent } from '../core/state.js';

export default async function handler(args) {
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) {
    console.error('Usage: dev-cli finalize <name>');
    console.error('       dev-cli finalize <name> --step <step> --set-iteration <N>');
    process.exit(1);
  }

  const stepIdx = args.indexOf('--step');
  const stepName = stepIdx >= 0 ? args[stepIdx + 1] : undefined;

  const iterIdx = args.indexOf('--set-iteration');
  const iterValue = iterIdx >= 0 ? parseInt(args[iterIdx + 1], 10) : undefined;

  if (iterValue !== undefined && isNaN(iterValue)) {
    console.error('--set-iteration requires a numeric value');
    process.exit(1);
  }

  const state = loadState(name);
  const engine = state.engine ?? {};

  // --step + --set-iteration: update iteration counter only
  if (stepName && iterValue !== undefined) {
    engine.finalize = engine.finalize ?? {};
    engine.finalize.iterations = engine.finalize.iterations ?? {};
    engine.finalize.iterations[stepName] = iterValue;

    updateState(name, { engine });
    appendEvent(name, 'engine.finalize.iteration', { step: stepName, iteration: iterValue });

    console.log(JSON.stringify({ ok: true, step: stepName, iteration: iterValue }));
    return;
  }

  // Default: mark finalize as done
  engine.finalize = { status: 'done', step: 'report' };

  updateState(name, { engine });
  appendEvent(name, 'engine.finalize', { status: 'done' });

  console.log(JSON.stringify({ ok: true, status: 'done' }));
}
