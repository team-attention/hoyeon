/**
 * handlers/loop-tick.js — dev-cli loop-tick --session <id>
 *
 * Increments iteration and evaluates termination condition.
 * Returns { decision: "block"|"allow", reason, ... }
 *
 * Called by Stop hooks (rph-loop.sh, rv-validator.sh).
 */

import { findActiveLoop, tick } from '../core/loop-state.js';

export default async function handler(args) {
  const sessionIdx = args.indexOf('--session');
  const sessionId = sessionIdx >= 0 ? args[sessionIdx + 1] : undefined;

  if (!sessionId) {
    console.error('Usage: dev-cli loop-tick --session <id>');
    process.exit(1);
  }

  const loop = findActiveLoop(sessionId);
  if (!loop) {
    // No active loop — allow stop
    console.log(JSON.stringify({ decision: 'allow', reason: 'No active loop' }));
    return;
  }

  const result = tick(loop.loopId);
  console.log(JSON.stringify(result, null, 2));
}
