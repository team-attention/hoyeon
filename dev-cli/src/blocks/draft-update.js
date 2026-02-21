/**
 * draft-update.js — dev-cli draft update <name> --section <section> --data '<json>'
 *
 * Updates a specific section in DRAFT.md with provided JSON data.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { parseSection, updateSection } from '../utils/markdown.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Atomic write: write to tmp, then rename.
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
 * Format JSON data as a markdown block for insertion into a section.
 *
 * @param {unknown} data - Parsed JSON data
 * @returns {string} Markdown-formatted content
 */
function formatDataAsMarkdown(data) {
  if (typeof data === 'string') {
    return data;
  }
  if (typeof data !== 'object' || data === null) {
    return String(data);
  }

  const lines = [];
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'object' && value !== null) {
      lines.push(`**${key}**: ${JSON.stringify(value)}`);
    } else {
      lines.push(`**${key}**: ${value}`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Update a section in DRAFT.md with the provided data.
 *
 * @param {string} name - Session name
 * @param {string} section - Section identifier (e.g. 'intent', 'criteria')
 * @param {unknown} data - Data to format and insert (string or parsed object)
 * @returns {string} Updated DRAFT.md content
 */
export function draftUpdate(name, section, data) {
  const draftPath = join(process.cwd(), '.dev', 'specs', name, 'DRAFT.md');
  const content = readFileSync(draftPath, 'utf8');

  // Verify the section exists
  const existing = parseSection(content, section);
  if (existing === null) {
    throw new Error(`Section '${section}' not found in DRAFT.md for session '${name}'`);
  }

  // Format the data as markdown
  const formatted = typeof data === 'string' ? data : formatDataAsMarkdown(data);

  // Update the section
  const updated = updateSection(content, section, formatted);

  // Write back atomically
  atomicWrite(draftPath, updated);

  return updated;
}
