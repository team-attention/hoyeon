/**
 * handlers/chain-complete.js — dev-cli chain-complete <chainId> [--force]
 *
 * Marks a chain as completed.
 * --force: abandon chain regardless of pending steps.
 *
 * stdout: JSON { chainId, status }
 */

import { loadChain, completeChain, abandonChain } from '../core/chain-state.js';

export default async function handler(args) {
  const chainId = args.find(a => !a.startsWith('--'));
  if (!chainId) {
    console.error('Usage: dev-cli chain-complete <chainId> [--force]');
    process.exit(1);
  }

  const force = args.includes('--force');
  const chain = loadChain(chainId);

  if (force) {
    const updated = abandonChain(chainId, 'user --force');
    console.log(JSON.stringify({ chainId, status: updated.status }));
    return;
  }

  // Check all steps are done
  const pending = chain.steps.filter(s => s.status === 'pending' || s.status === 'running');
  if (pending.length > 0) {
    console.error(JSON.stringify({
      error: 'incomplete_steps',
      chainId,
      pendingSteps: pending.map(s => s.id),
      message: `${pending.length} steps not completed. Use --force to abandon.`,
    }));
    process.exit(1);
  }

  const updated = completeChain(chainId);
  console.log(JSON.stringify({ chainId, status: updated.status }));
}
