/**
 * handlers/loop-complete.js — dev-cli loop-complete --session <id> [--force]
 *
 * Marks a loop as completed and cleans up.
 * --force: abandon regardless of state.
 *
 * stdout: JSON { loopId, status }
 */

import { findActiveLoop, completeLoop, updateLoop } from '../core/loop-state.js';

export default async function handler(args) {
  const sessionIdx = args.indexOf('--session');
  const sessionId = sessionIdx >= 0 ? args[sessionIdx + 1] : undefined;

  if (!sessionId) {
    console.error('Usage: dev-cli loop-complete --session <id> [--force]');
    process.exit(1);
  }

  const loop = findActiveLoop(sessionId);
  if (!loop) {
    console.error('No active loop for this session');
    process.exit(1);
  }

  const force = args.includes('--force');

  if (force) {
    const updated = updateLoop(loop.loopId, { status: 'abandoned' });
    console.log(JSON.stringify({ loopId: loop.loopId, status: updated.status }));
    return;
  }

  const updated = completeLoop(loop.loopId);
  console.log(JSON.stringify({ loopId: loop.loopId, status: updated.status }));
}
