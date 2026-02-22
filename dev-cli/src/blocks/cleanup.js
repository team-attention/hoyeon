/**
 * cleanup.js — dev-cli cleanup <name>
 *
 * Deletes DRAFT.md from the session directory (resolved via session.ref),
 * deletes findings/ and analysis/ from the session directory,
 * removes .dev/active-spec pointer,
 * and updates state: phase → "completed", pendingAction → null.
 */

import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadState, updateState } from '../core/state.js';
import { draftPath as _draftPath, findingsDir as _findingsDir, analysisDir as _analysisDir } from '../core/paths.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Clean up a completed specify session.
 *
 * - Deletes DRAFT.md from the session directory (via dual-path resolution)
 * - Deletes findings/ directory from session dir
 * - Deletes analysis/ directory from session dir
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

  // Delete DRAFT.md from session dir (dual-path resolution via paths.js)
  const draftPath = _draftPath(name);
  if (existsSync(draftPath)) {
    rmSync(draftPath);
    removed.push(draftPath);
  }

  // Delete findings/ from session dir
  const findingsPath = _findingsDir(name);
  if (existsSync(findingsPath)) {
    rmSync(findingsPath, { recursive: true, force: true });
    removed.push(findingsPath);
  }

  // Delete analysis/ from session dir
  const analysisPath = _analysisDir(name);
  if (existsSync(analysisPath)) {
    rmSync(analysisPath, { recursive: true, force: true });
    removed.push(analysisPath);
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
