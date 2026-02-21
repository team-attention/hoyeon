/**
 * auto-assume.js — dev-cli draft auto-assume <name>
 *
 * For quick/autopilot modes. Reads existing findings and direction from DRAFT.md,
 * then populates the Assumptions section with default decisions.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSection, updateSection } from '../utils/markdown.js';
import { loadState } from '../core/state.js';
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Atomic write helper.
 *
 * @param {string} targetPath
 * @param {string} content
 */
function atomicWrite(targetPath, content) {
  const dir = dirname(targetPath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = `${targetPath}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(tmpPath, content, 'utf8');
  renameSync(tmpPath, targetPath);
}

/**
 * Generate default assumptions based on mode and existing context.
 *
 * @param {object} state - Session state
 * @param {string|null} findingsContent - Current findings section content
 * @param {string|null} directionContent - Current direction section content
 * @returns {string} Markdown-formatted assumptions
 */
function generateAssumptions(state, findingsContent, directionContent) {
  const depth = state.mode?.depth ?? 'standard';
  const interaction = state.mode?.interaction ?? 'interactive';
  const now = new Date().toISOString();

  const lines = [
    `_Auto-generated assumptions (${depth}/${interaction} mode) at ${now}._`,
    '',
  ];

  // Default assumptions based on mode
  lines.push('**Default assumptions applied:**');
  lines.push('');
  lines.push('- No breaking changes to existing public APIs unless explicitly stated.');
  lines.push('- Implementation follows existing code patterns and conventions in the codebase.');
  lines.push('- Testing will follow the project\'s existing test strategy.');
  lines.push('- Performance requirements are not stricter than current baselines.');

  if (depth === 'quick') {
    lines.push('- Quick mode: minimal research performed; assumptions may need validation.');
    lines.push('- Scope is narrowly defined to the stated intent only.');
  }

  if (interaction === 'autopilot') {
    lines.push('- Autopilot mode: no interactive clarification; best-effort interpretation applied.');
    lines.push('- Ambiguities resolved by choosing the simpler/safer option.');
  }

  // Include context from findings if available
  const hasFindingsData =
    findingsContent &&
    findingsContent.trim() &&
    !findingsContent.trim().startsWith('_No findings');

  if (hasFindingsData) {
    lines.push('');
    lines.push('**Based on agent findings:**');
    lines.push('- Findings have been reviewed and incorporated into the direction.');
  }

  // Include context from direction if available
  const hasDirectionData =
    directionContent &&
    directionContent.trim() &&
    !directionContent.trim().startsWith('_Direction not yet');

  if (hasDirectionData) {
    lines.push('');
    lines.push('**Based on current direction:**');
    lines.push('- Direction has been set; implementation should follow the stated approach.');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Auto-populate the Assumptions section in DRAFT.md.
 *
 * @param {string} name - Session name
 * @returns {string} Updated DRAFT.md content
 */
export function autoAssume(name) {
  const draftPath = join(process.cwd(), '.dev', 'specs', name, 'DRAFT.md');
  const content = readFileSync(draftPath, 'utf8');

  // Load state for mode information
  let state = { mode: { depth: 'quick', interaction: 'autopilot' } };
  try {
    state = loadState(name);
  } catch {
    // Use defaults if state is unavailable
  }

  // Read existing context
  const findingsContent = parseSection(content, 'findings');
  const directionContent = parseSection(content, 'direction');

  // Generate assumptions
  const assumptionsText = generateAssumptions(state, findingsContent, directionContent);

  // Update the assumptions section
  const updated = updateSection(content, 'assumptions', assumptionsText);

  // Write back atomically
  atomicWrite(draftPath, updated);

  return updated;
}
