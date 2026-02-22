/**
 * cleanup.js — dev-cli cleanup <name>
 *
 * Deletes DRAFT.md, removes .dev/active-spec pointer,
 * and updates state: phase → "completed", pendingAction → null.
 */

import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadState, updateState } from '../core/state.js';
import { specDir as _specDir, draftPath as _draftPath } from '../core/paths.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Clean up a completed specify session.
 *
 * - Deletes DRAFT.md from the session directory
 * - Removes .dev/active-spec pointer
 * - Updates state: phase = "completed", pendingAction = null
 *
 * @param {string} name - Session name
 * @returns {{ removed: string[], stateUpdated: boolean }} Summary of actions taken
 * @throws {Error} If session state does not exist
 */
export function cleanup(name) {
  // Verify state exists (throws if not found)
  loadState(name);

  const devDir = join(process.cwd(), '.dev');
  const removed = [];

  // Delete DRAFT.md
  const draftPath = _draftPath(name);
  if (existsSync(draftPath)) {
    rmSync(draftPath);
    removed.push(draftPath);
  }

  // Remove active-spec pointer
  const activeSpecPath = join(devDir, 'active-spec');
  if (existsSync(activeSpecPath)) {
    rmSync(activeSpecPath);
    removed.push(activeSpecPath);
  }

  // Update state: phase = completed, pendingAction = null
  updateState(name, {
    phase: 'completed',
    pendingAction: null,
  });

  return { removed, stateUpdated: true };
}
