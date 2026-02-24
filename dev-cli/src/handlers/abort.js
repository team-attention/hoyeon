/**
 * handlers/abort.js — dev-cli abort <name> [--reason <reason>]
 *
 * Gracefully abort a session early. Marks state as aborted,
 * acknowledges any pending action, and returns { done: true, aborted: true }.
 */

import {
  loadState,
  updateState,
  acknowledgePendingAction,
  appendEvent,
} from '../core/state.js';

export default async function handler(args) {
  const name = args[0];
  if (!name) {
    console.error('Usage: dev-cli abort <name> [--reason <reason>]');
    process.exit(1);
  }

  const reasonIdx = args.indexOf('--reason');
  const reason = reasonIdx >= 0 ? args.slice(reasonIdx + 1).join(' ') : 'aborted by agent';

  const state = loadState(name);

  // Acknowledge pending action if any
  if (state.pendingAction && !state.pendingAction.acknowledged) {
    acknowledgePendingAction(name);
  }

  updateState(name, {
    phase: 'aborted',
    abortReason: reason,
    abortedAt: new Date().toISOString(),
  });

  appendEvent(name, 'session.abort', { reason });

  console.log(JSON.stringify({ done: true, aborted: true, reason }));
}
