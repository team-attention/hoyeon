/**
 * handlers/loop-status.js — dev-cli loop-status --session <id>
 *
 * Returns active loop status for a session.
 * Exits with code 1 if no active loop.
 *
 * stdout: JSON { loopId, type, status, iteration, phase, config }
 */

import { findActiveLoop, dodPath, countDodItems } from '../core/loop-state.js';

export default async function handler(args) {
  const sessionIdx = args.indexOf('--session');
  const sessionId = sessionIdx >= 0 ? args[sessionIdx + 1] : undefined;

  if (!sessionId) {
    console.error('Usage: dev-cli loop-status --session <id>');
    process.exit(1);
  }

  const loop = findActiveLoop(sessionId);
  if (!loop) {
    process.exit(1);
  }

  const result = {
    loopId: loop.loopId,
    type: loop.type,
    status: loop.status,
    iteration: loop.iteration,
    maxIterations: loop.maxIterations,
    phase: loop.phase,
    config: loop.config,
  };

  if (loop.type === 'rph') {
    result.dodPath = dodPath(loop.loopId);
    result.dod = countDodItems(loop.loopId);
  }

  console.log(JSON.stringify(result, null, 2));
}
