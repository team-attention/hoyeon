/**
 * step-invalidate.js — dev-cli step invalidate <name> --step <step>
 *
 * Delegates to sequencer.stepInvalidate(name, step).
 */

import { stepInvalidate as sequencerStepInvalidate } from '../core/sequencer.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Invalidate a step and all downstream steps (mark as "stale").
 *
 * @param {string} name - Session name
 * @param {string} step - Block id to invalidate (and all downstream)
 * @returns {object} Updated state object
 */
export function stepInvalidate(name, step) {
  return sequencerStepInvalidate(name, step);
}
