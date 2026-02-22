/**
 * handlers/step.js — dev-cli step <name> complete|invalidate --step <blockId> [--reason <reason>]
 *
 * Wraps stepComplete() and stepInvalidate() from ../core/sequencer.js.
 */

import { readFileSync } from 'node:fs';
import { stepComplete, stepInvalidate } from '../core/sequencer.js';

export default async function handler(args) {
  const name = args[0];
  const action = args[1]; // 'complete' or 'invalidate'
  if (!name || !action) {
    console.error('Usage: dev-cli step <name> complete|invalidate --step <blockId>');
    process.exit(1);
  }
  const stepIdx = args.indexOf('--step');
  const blockId = stepIdx >= 0 ? args[stepIdx + 1] : undefined;

  if (action === 'complete') {
    // Read result data from stdin if piped
    let resultData = null;
    if (!process.stdin.isTTY) {
      try {
        const input = readFileSync(0, 'utf8').trim();
        if (input) resultData = JSON.parse(input);
      } catch {
        // Ignore parse errors — proceed without result data
      }
    }
    const result = await stepComplete(name, blockId, resultData);
    console.log(JSON.stringify(result, null, 2));
  } else if (action === 'invalidate') {
    const reasonIdx = args.indexOf('--reason');
    const reason = reasonIdx >= 0 ? args.slice(reasonIdx + 1).join(' ') : 'invalidated';
    const result = await stepInvalidate(name, blockId, reason);
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.error(`Unknown step action: ${action}. Use 'complete' or 'invalidate'.`);
    process.exit(1);
  }
}
