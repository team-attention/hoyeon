/**
 * draft-show.js — dev-cli draft <name> show
 *
 * Returns DRAFT.md as structured JSON with all sections, content, and fill status.
 * Replaces manual Read → parse with a single CLI call.
 */

import { readFileSync } from 'node:fs';
import { parseSection, listSections } from '../utils/markdown.js';
import { loadState } from '../core/state.js';
import { draftPath as _draftPath } from '../core/paths.js';
import { isFilled } from './draft-validate.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse DRAFT.md into structured JSON with sections and fill status.
 *
 * @param {string} name - Session name
 * @returns {{ path: string, mode: string, sections: object, fillStatus: object }}
 */
export function draftShow(name) {
  const draftPath = _draftPath(name);
  const content = readFileSync(draftPath, 'utf8');

  // Determine mode from state
  let mode = 'standard';
  try {
    const state = loadState(name);
    mode = state.mode?.depth ?? 'standard';
  } catch {
    // Default to standard if state unavailable
  }

  // Parse all sections
  const sectionNames = listSections(content);
  const sections = {};
  const filled = [];
  const missing = [];

  for (const sectionName of sectionNames) {
    const sectionContent = parseSection(content, sectionName);
    const trimmed = sectionContent ? sectionContent.trim() : '';
    const sectionFilled = isFilled(sectionContent);

    sections[sectionName] = {
      filled: sectionFilled,
      content: trimmed,
    };

    if (sectionFilled) {
      filled.push(sectionName);
    } else {
      missing.push(sectionName);
    }
  }

  return {
    path: draftPath,
    mode,
    sections,
    fillStatus: {
      filled,
      missing,
      total: sectionNames.length,
      filledCount: filled.length,
      ready: missing.length === 0,
    },
  };
}
