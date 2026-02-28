/**
 * findings-aggregate.js — dev-cli findings <name> aggregate [--include-analysis]
 *
 * Reads findings/*.md (and optionally analysis/*.md) files,
 * extracts frontmatter + full body content, and returns structured JSON.
 *
 * Unlike draft-import (which extracts summaries into DRAFT.md),
 * this returns the full content for AI consumption.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { extractFrontmatter, parseSimpleYaml } from '../utils/frontmatter.js';
import { computeHash } from '../utils/hash.js';
import { findingsDir as _findingsDir, analysisDir as _analysisDir } from '../core/paths.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read all .md files from a directory and parse them into structured entries.
 *
 * @param {string} dirPath - Directory to scan
 * @returns {Array<{ file: string, agentType: string, agentId: string, summary: string, content: string, hash: string }>}
 */
function readMdFiles(dirPath) {
  let files;
  try {
    files = readdirSync(dirPath).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }

  return files.map((file) => {
    const filePath = join(dirPath, file);
    const content = readFileSync(filePath, 'utf8');
    const rawFrontmatter = extractFrontmatter(content);

    let summary = '';
    let agentType = basename(file, '.md');
    let agentId = agentType;

    if (rawFrontmatter) {
      const parsed = parseSimpleYaml(rawFrontmatter);
      if (parsed.summary) summary = parsed.summary;
      if (parsed.type) agentType = parsed.type;
      if (parsed.id) agentId = parsed.id;
    }

    return {
      file,
      agentType,
      agentId,
      summary,
      content,
      hash: computeHash(content),
    };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Aggregate findings (and optionally analysis) into structured JSON.
 *
 * @param {string} name - Session name
 * @param {{ includeAnalysis?: boolean }} opts
 * @returns {{ findings: Array, analysis: Array, stats: object }}
 */
export function findingsAggregate(name, opts = {}) {
  const findings = readMdFiles(_findingsDir(name));
  const analysis = opts.includeAnalysis ? readMdFiles(_analysisDir(name)) : [];

  const agentTypes = new Set();
  for (const f of findings) agentTypes.add(f.agentType);
  for (const a of analysis) agentTypes.add(a.agentType);

  return {
    findings,
    analysis,
    stats: {
      totalFindings: findings.length,
      totalAnalysis: analysis.length,
      agentTypes: [...agentTypes],
    },
  };
}
