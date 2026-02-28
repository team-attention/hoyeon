/**
 * frontmatter.js — YAML frontmatter extraction utilities
 *
 * Extracted from draft-import.js for reuse across findings-aggregate and other blocks.
 */

/**
 * Extract YAML frontmatter from markdown file content.
 * Returns the raw frontmatter string (between --- markers) or null.
 *
 * @param {string} content - File content
 * @returns {string|null} Raw YAML frontmatter
 */
export function extractFrontmatter(content) {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) return null;

  const endIdx = trimmed.indexOf('---', 3);
  if (endIdx === -1) return null;

  return trimmed.slice(3, endIdx).trim();
}

/**
 * Parse a simple YAML frontmatter string into key/value pairs.
 * Supports only scalar values (strings, numbers, booleans).
 * Multi-line values and nested objects are not parsed.
 *
 * @param {string} yaml - Raw YAML string
 * @returns {Record<string, string>}
 */
export function parseSimpleYaml(yaml) {
  const result = {};
  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key) {
      // Remove surrounding quotes if present
      result[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  return result;
}
