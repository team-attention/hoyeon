/**
 * draft-import.js — dev-cli draft import <name>
 *
 * Reads findings/*.md files, extracts YAML frontmatter summaries,
 * and populates the Agent Findings section in DRAFT.md.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { updateSection } from '../utils/markdown.js';
import { loadState, updateState } from '../core/state.js';
import { computeHash } from '../utils/hash.js';
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { specDir as _specDir, findingsDir as _findingsDir, draftPath as _draftPath } from '../core/paths.js';

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
 * Extract YAML frontmatter from markdown file content.
 * Returns the raw frontmatter string (between --- markers) or null.
 *
 * @param {string} content - File content
 * @returns {string|null} Raw YAML frontmatter
 */
function extractFrontmatter(content) {
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
function parseSimpleYaml(yaml) {
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Import findings from the session findings/ directory into DRAFT.md.
 *
 * For each findings file:
 *  - Extracts YAML frontmatter
 *  - Reads `summary` field
 *  - Computes output hash
 *  - Updates state.agents
 *
 * Populates the `findings` section in DRAFT.md.
 *
 * @param {string} name - Session name
 * @returns {{ imported: number, agents: object }} Summary of imported findings
 */
export function draftImport(name) {
  const specDir = _specDir(name);
  const findingsDir = _findingsDir(name);
  const draftPath = _draftPath(name);

  // Read all .md files from findings/
  let files;
  try {
    files = readdirSync(findingsDir).filter((f) => f.endsWith('.md'));
  } catch {
    files = [];
  }

  const agentSummaries = [];
  const agentsState = {};

  for (const file of files) {
    const filePath = join(findingsDir, file);
    const content = readFileSync(filePath, 'utf8');
    const rawFrontmatter = extractFrontmatter(content);

    let summary = `_(no summary in ${file})_`;
    let agentType = basename(file, '.md');
    let agentId = agentType;

    if (rawFrontmatter) {
      const parsed = parseSimpleYaml(rawFrontmatter);
      if (parsed.summary) {
        summary = parsed.summary;
      }
      if (parsed.type) {
        agentType = parsed.type;
      }
      if (parsed.id) {
        agentId = parsed.id;
      }
    }

    // Compute hash of file content
    const hash = computeHash(content);

    agentSummaries.push(`### ${agentType} (${file})\n\n${summary}`);

    agentsState[agentId] = {
      file,
      agentType,
      hash,
      importedAt: new Date().toISOString(),
    };
  }

  // Build findings markdown
  const findingsContent =
    agentSummaries.length > 0
      ? agentSummaries.join('\n\n')
      : '_No findings files found._';

  // Update DRAFT.md findings section
  const draftContent = readFileSync(draftPath, 'utf8');
  const updated = updateSection(draftContent, 'findings', findingsContent);
  atomicWrite(draftPath, updated);

  // Update state with agent info
  const state = loadState(name);
  const existingAgents = state.agents ?? {};
  updateState(name, {
    agents: { ...existingAgents, ...agentsState },
  });

  return { imported: files.length, agents: agentsState };
}
