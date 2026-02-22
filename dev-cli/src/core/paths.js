/**
 * paths.js — Centralized path helpers for dev-cli sessions
 *
 * Spec deliverables (PLAN.md, context/) live under: <cwd>/.dev/specs/<name>/
 * Session work artifacts live under: <cwd>/.dev/.sessions/<sessionId>/
 *
 * Dual-path resolution: when .dev/specs/<name>/session.ref exists, work
 * artifacts (state.json, DRAFT.md, findings/, analysis/) are resolved via
 * the session directory. When session.ref is absent, the legacy spec dir
 * path is used for backward compatibility.
 *
 * Use these helpers instead of constructing paths inline.
 */

import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Spec dir (deliverables — always in spec dir)
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to the spec directory for a given spec name.
 * Spec deliverables (PLAN.md, plan-content.json, context/) live here.
 *
 * @param {string} name - Spec name
 * @returns {string} Absolute path to .dev/specs/<name>/
 */
export function specDir(name) {
  return join(process.cwd(), '.dev', 'specs', name);
}

// ---------------------------------------------------------------------------
// Session dir (work artifacts — routed via session.ref when present)
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to the .dev/.sessions/ base directory.
 *
 * @returns {string}
 */
export function sessionBaseDir() {
  return join(process.cwd(), '.dev', '.sessions');
}

/**
 * Returns the absolute path to the session directory for a given sessionId.
 *
 * @param {string} sessionId - UUID session identifier
 * @returns {string} Absolute path to .dev/.sessions/<sessionId>/
 */
export function sessionDir(sessionId) {
  return join(sessionBaseDir(), sessionId);
}

// ---------------------------------------------------------------------------
// Internal: dual-path resolution helper
// ---------------------------------------------------------------------------

/**
 * Resolve the work directory for a given spec name.
 * If .dev/specs/<name>/session.ref exists, returns the session dir.
 * Otherwise returns the spec dir (legacy fallback).
 *
 * @param {string} name - Spec name
 * @returns {string} Absolute path to the resolved work directory
 */
function resolveWorkDir(name) {
  const refPath = join(specDir(name), 'session.ref');
  if (existsSync(refPath)) {
    const sessionId = readFileSync(refPath, 'utf8').trim();
    if (sessionId.length > 0) {
      return join(sessionBaseDir(), sessionId);
    }
  }
  // Legacy fallback: work files in spec dir
  return specDir(name);
}

// ---------------------------------------------------------------------------
// Work artifact paths (dual-path resolved)
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to the state.json for a given spec name.
 * Resolves via session.ref when present, falls back to spec dir.
 *
 * @param {string} name - Spec name
 * @returns {string} Absolute path to state.json
 */
export function statePath(name) {
  return join(resolveWorkDir(name), 'state.json');
}

/**
 * Returns the absolute path to the DRAFT.md for a given spec name.
 * Resolves via session.ref when present, falls back to spec dir.
 *
 * @param {string} name - Spec name
 * @returns {string} Absolute path to DRAFT.md
 */
export function draftPath(name) {
  return join(resolveWorkDir(name), 'DRAFT.md');
}

/**
 * Returns the absolute path to the findings directory for a given spec name.
 * Resolves via session.ref when present, falls back to spec dir.
 *
 * @param {string} name - Spec name
 * @returns {string} Absolute path to findings/
 */
export function findingsDir(name) {
  return join(resolveWorkDir(name), 'findings');
}

/**
 * Returns the absolute path to the analysis directory for a given spec name.
 * Resolves via session.ref when present, falls back to spec dir.
 *
 * @param {string} name - Spec name
 * @returns {string} Absolute path to analysis/
 */
export function analysisDir(name) {
  return join(resolveWorkDir(name), 'analysis');
}

// ---------------------------------------------------------------------------
// Spec deliverable paths (always in spec dir)
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to the PLAN.md for a given spec name.
 * PLAN.md is a deliverable — always lives in spec dir.
 *
 * @param {string} name - Spec name
 * @returns {string} Absolute path to .dev/specs/<name>/PLAN.md
 */
export function planPath(name) {
  return join(specDir(name), 'PLAN.md');
}

/**
 * Returns the absolute path to the plan-content.json for a given spec name.
 * plan-content.json is a deliverable — always lives in spec dir.
 *
 * @param {string} name - Spec name
 * @returns {string} Absolute path to .dev/specs/<name>/plan-content.json
 */
export function planContentPath(name) {
  return join(specDir(name), 'plan-content.json');
}
