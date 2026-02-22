/**
 * draft-validate.js — dev-cli draft validate <name>
 *
 * Checks DRAFT.md completeness based on mode.
 * Standard mode requires more sections than quick mode.
 */

import { readFileSync } from 'node:fs';
import { parseSection, listSections } from '../utils/markdown.js';
import { loadState } from '../core/state.js';
import { draftPath as _draftPath } from '../core/paths.js';

// ---------------------------------------------------------------------------
// Required sections per mode
// ---------------------------------------------------------------------------

/** Sections required for standard mode */
const STANDARD_REQUIRED = ['intent', 'what-why', 'boundaries', 'criteria', 'decisions', 'findings'];

/** Sections required for quick mode */
const QUICK_REQUIRED = ['intent', 'what-why', 'findings'];

// Placeholder patterns — sections that have only the default template text
const PLACEHOLDER_PATTERNS = [
  /^_Not yet/i,
  /^_No /i,
  /^_Direction not yet/i,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether a section's content is considered "filled in"
 * (i.e., not just the default placeholder text).
 *
 * @param {string|null} content - Section content or null if not found
 * @returns {boolean}
 */
function isFilled(content) {
  if (content === null) return false;
  const trimmed = content.trim();
  if (!trimmed) return false;
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate DRAFT.md completeness for a session.
 *
 * @param {string} name - Session name
 * @returns {{ ready: boolean, missing: string[], sections: string[] }}
 */
export function draftValidate(name) {
  const draftPath = _draftPath(name);
  const content = readFileSync(draftPath, 'utf8');

  // Determine mode from state
  let depth = 'standard';
  try {
    const state = loadState(name);
    depth = state.mode?.depth ?? 'standard';
  } catch {
    // If state cannot be loaded, default to standard
  }

  const required = depth === 'quick' ? QUICK_REQUIRED : STANDARD_REQUIRED;
  const presentSections = listSections(content);

  const missing = [];
  for (const section of required) {
    const sectionContent = parseSection(content, section);
    if (!isFilled(sectionContent)) {
      missing.push(section);
    }
  }

  return {
    ready: missing.length === 0,
    missing,
    sections: presentSections,
  };
}
