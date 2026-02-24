/**
 * handlers/finalize.js — dev-cli finalize <name>
 *
 * Marks engine finalize as done in state.json.
 * Called after the :Report substep completes to signal the stop hook
 * that orchestration is complete and the session can exit cleanly.
 */

import { loadState, updateState, appendEvent } from '../core/state.js';

export default async function handler(args) {
  const name = args[0];
  if (!name) {
    console.error('Usage: dev-cli finalize <name>');
    process.exit(1);
  }

  const state = loadState(name);

  const engine = state.engine ?? {};
  engine.finalize = { status: 'done', step: 'report' };

  updateState(name, { engine });
  appendEvent(name, 'engine.finalize', { status: 'done' });

  console.log(JSON.stringify({ ok: true, status: 'done' }));
}
