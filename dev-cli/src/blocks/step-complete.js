/**
 * step-complete.js — dev-cli step complete <name> --step <step> [--result <ok|fail>]
 *
 * Delegates to sequencer.stepComplete(name, step, result).
 */

import { stepComplete as sequencerStepComplete } from '../core/sequencer.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Complete a step in the given session.
 *
 * Acknowledges the pending action and advances blockIndex.
 *
 * @param {string} name - Session name
 * @param {string} step - Block id that completed
 * @param {string|null} [result] - Optional result: 'ok', 'fail', or null
 * @returns {object} Updated state object
 */
export function stepComplete(name, step, result = null) {
  return sequencerStepComplete(name, step, result);
}
