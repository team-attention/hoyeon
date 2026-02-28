/**
 * hash.js — SHA256 utility for dev-cli
 */

import { createHash } from 'node:crypto';

/**
 * Compute SHA256 hash of content string.
 *
 * @param {string} content - The content to hash
 * @returns {string} Hash in the format `sha256:<hex>`
 */
export function computeHash(content) {
  const hex = createHash('sha256').update(content, 'utf8').digest('hex');
  return `sha256:${hex}`;
}
