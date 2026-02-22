/**
 * context-manager.js — Manages per-spec execution context files
 *
 * Context lives under: .dev/specs/<name>/context/
 *   outputs.json   — accumulated TODO output values (JSON object)
 *   learnings.md   — freeform learnings captured during execution
 *   issues.md      — open issues discovered during execution
 *   audit.md       — chronological audit trail of execution events
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { contextDir } from '../core/paths.js';

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Initialize the context directory and its four files for a given spec.
 * Idempotent — safe to call if the directory already exists.
 *
 * @param {string} name - Spec name
 */
export function initContext(name) {
  const dir = contextDir(name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'outputs.json'), '{}');
  writeFileSync(join(dir, 'learnings.md'), '');
  writeFileSync(join(dir, 'issues.md'), '');
  writeFileSync(join(dir, 'audit.md'), '');
}

// ---------------------------------------------------------------------------
// outputs.json helpers
// ---------------------------------------------------------------------------

/**
 * Read and parse outputs.json for a given spec.
 * Returns an empty object if the file does not exist.
 *
 * @param {string} name - Spec name
 * @returns {Object} Parsed outputs object
 */
export function readOutputs(name) {
  const filePath = join(contextDir(name), 'outputs.json');
  if (!existsSync(filePath)) {
    return {};
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/**
 * Atomically merge outputs for a specific TODO into outputs.json.
 * Existing fields for other TODOs are preserved. Fields within the
 * TODO's entry are shallow-merged (new fields win).
 *
 * @param {string} name    - Spec name
 * @param {string} todoId  - TODO identifier (e.g. "todo-1")
 * @param {Object} outputs - Key/value pairs to merge into the TODO entry
 */
export function writeOutput(name, todoId, outputs) {
  const dir = contextDir(name);
  const filePath = join(dir, 'outputs.json');

  // Read current state
  let current = {};
  if (existsSync(filePath)) {
    current = JSON.parse(readFileSync(filePath, 'utf8'));
  }

  // Merge
  current[todoId] = { ...current[todoId], ...outputs };

  // Atomic write: write to tmp then rename
  const tmpPath = join(dir, `.outputs-${randomBytes(6).toString('hex')}.tmp`);
  writeFileSync(tmpPath, JSON.stringify(current, null, 2));
  renameSync(tmpPath, filePath);
}

// ---------------------------------------------------------------------------
// Markdown append helpers
// ---------------------------------------------------------------------------

/**
 * Append a learning entry to learnings.md.
 *
 * @param {string} name   - Spec name
 * @param {string} todoId - TODO identifier
 * @param {string} text   - Learning text to append
 */
export function appendLearning(name, todoId, text) {
  const filePath = join(contextDir(name), 'learnings.md');
  const entry = `\n## TODO ${todoId}\n\n${text}\n`;
  const current = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  writeFileSync(filePath, current + entry);
}

/**
 * Append an issue entry to issues.md.
 *
 * @param {string} name   - Spec name
 * @param {string} todoId - TODO identifier
 * @param {string} text   - Issue description to append
 */
export function appendIssue(name, todoId, text) {
  const filePath = join(contextDir(name), 'issues.md');
  const entry = `\n## TODO ${todoId}\n\n- [ ] ${text}\n`;
  const current = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  writeFileSync(filePath, current + entry);
}

/**
 * Append an audit entry to audit.md.
 *
 * @param {string} name  - Spec name
 * @param {string} entry - Audit entry text to append
 */
export function appendAudit(name, entry) {
  const filePath = join(contextDir(name), 'audit.md');
  const block = `\n---\n\n${entry}\n`;
  const current = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  writeFileSync(filePath, current + block);
}
