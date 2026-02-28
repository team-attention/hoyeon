/**
 * handlers/loop-init.js — dev-cli loop-init --type rph|rv --session <id> [--count N] [--prompt <text>]
 *
 * Creates a new iterative loop.
 * stdout: JSON { loopId, type, config, dodPath? }
 */

import { generateLoopId, createLoop, findActiveLoop, dodPath } from '../core/loop-state.js';

export default async function handler(args) {
  const typeIdx = args.indexOf('--type');
  const type = typeIdx >= 0 ? args[typeIdx + 1] : undefined;

  const sessionIdx = args.indexOf('--session');
  const sessionId = sessionIdx >= 0 ? args[sessionIdx + 1] : undefined;

  if (!type || !sessionId) {
    console.error('Usage: dev-cli loop-init --type rph|rv --session <id> [--count N] [--prompt <text>]');
    process.exit(1);
  }

  if (type !== 'rph' && type !== 'rv') {
    console.error(`Error: Unknown loop type '${type}'. Must be 'rph' or 'rv'.`);
    process.exit(1);
  }

  // Check for existing active loop — cancel it (zombie cleanup)
  const existing = findActiveLoop(sessionId);
  if (existing) {
    const { updateLoop } = await import('../core/loop-state.js');
    updateLoop(existing.loopId, { status: 'abandoned' });
  }

  const loopId = generateLoopId();
  let config = {};

  if (type === 'rv') {
    const countIdx = args.indexOf('--count');
    const count = countIdx >= 0 ? parseInt(args[countIdx + 1], 10) : 1;
    config = { initialCount: count, remaining: count };
  }

  if (type === 'rph') {
    config = { dodPath: dodPath(loopId) };
  }

  const promptIdx = args.indexOf('--prompt');
  const prompt = promptIdx >= 0 ? args.slice(promptIdx + 1).filter(a => !a.startsWith('--')).join(' ') : '';

  const loop = createLoop(loopId, { sessionId, type, prompt, config });

  const result = { loopId: loop.loopId, type: loop.type, config: loop.config };
  if (type === 'rph') result.dodPath = dodPath(loopId);
  console.log(JSON.stringify(result, null, 2));
}
