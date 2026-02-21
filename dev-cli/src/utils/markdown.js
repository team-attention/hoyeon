/**
 * markdown.js — DRAFT.md section parser/updater using deterministic markers
 *
 * Uses <!-- BEGIN:section --> / <!-- END:section --> delimiters for parsing.
 */

// ---------------------------------------------------------------------------
// Regex helpers
// ---------------------------------------------------------------------------

/**
 * Build a regex that matches content between BEGIN and END markers for a section.
 * Captures the content between markers (may be empty).
 *
 * @param {string} sectionName
 * @returns {RegExp}
 */
function sectionRegex(sectionName) {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(<!-- BEGIN:${escaped} -->)([\\s\\S]*?)(<!-- END:${escaped} -->)`,
    'g',
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract content between <!-- BEGIN:sectionName --> and <!-- END:sectionName --> markers.
 *
 * @param {string} content - Full markdown content
 * @param {string} sectionName - Section identifier
 * @returns {string|null} Content between markers, or null if not found
 */
export function parseSection(content, sectionName) {
  const re = sectionRegex(sectionName);
  const match = re.exec(content);
  if (!match) return null;
  // match[2] is the captured group between begin and end markers
  return match[2];
}

/**
 * Replace content between <!-- BEGIN:sectionName --> and <!-- END:sectionName --> markers.
 * Returns the full updated markdown string.
 *
 * @param {string} content - Full markdown content
 * @param {string} sectionName - Section identifier
 * @param {string} newContent - New content to place between markers
 * @returns {string} Updated markdown content
 */
export function updateSection(content, sectionName, newContent) {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(<!-- BEGIN:${escaped} -->)([\\s\\S]*?)(<!-- END:${escaped} -->)`,
    'g',
  );

  let found = false;
  const updated = content.replace(re, (_match, begin, _old, end) => {
    found = true;
    return `${begin}\n${newContent}\n${end}`;
  });

  if (!found) {
    throw new Error(`Section '${sectionName}' not found in content`);
  }

  return updated;
}

/**
 * List all section names found in the markdown content.
 *
 * @param {string} content - Full markdown content
 * @returns {string[]} Array of section names in order of appearance
 */
export function listSections(content) {
  const re = /<!-- BEGIN:([^\s>]+) -->/g;
  const sections = [];
  let match;
  // eslint-disable-next-line no-cond-assign
  while ((match = re.exec(content)) !== null) {
    sections.push(match[1]);
  }
  return sections;
}
