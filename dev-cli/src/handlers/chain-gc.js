/**
 * handlers/chain-gc.js — dev-cli chain-gc [--max-age <hours>]
 *
 * Garbage collect old completed/failed/abandoned chains.
 * Also converts stale running chains to abandoned.
 *
 * Default max age: 24 hours.
 *
 * stdout: JSON { removed }
 */

import { gcChains } from '../core/chain-state.js';

export default async function handler(args) {
  const ageIdx = args.indexOf('--max-age');
  const hours = ageIdx >= 0 ? parseFloat(args[ageIdx + 1]) : 24;

  if (isNaN(hours) || hours <= 0) {
    console.error('Error: --max-age must be a positive number (hours)');
    process.exit(1);
  }

  const maxAgeMs = hours * 60 * 60 * 1000;
  const removed = gcChains(maxAgeMs);

  console.log(JSON.stringify({ removed }));
}
