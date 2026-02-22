/**
 * paths.js — Centralized path helpers for dev-cli sessions
 *
 * All session files live under: <cwd>/.dev/specs/<name>/
 * Use these helpers instead of constructing paths inline.
 */

import { join } from 'node:path';

/**
 * Returns the absolute path to the session directory for a given session name.
 *
 * @param {string} name - Session name
 * @returns {string} Absolute path to .dev/specs/<name>/
 */
export function specDir(name) {
  return join(process.cwd(), '.dev', 'specs', name);
}

/**
 * Returns the absolute path to the state.json for a given session name.
 *
 * @param {string} name - Session name
 * @returns {string} Absolute path to .dev/specs/<name>/state.json
 */
export function statePath(name) {
  return join(process.cwd(), '.dev', 'specs', name, 'state.json');
}

/**
 * Returns the absolute path to the DRAFT.md for a given session name.
 *
 * @param {string} name - Session name
 * @returns {string} Absolute path to .dev/specs/<name>/DRAFT.md
 */
export function draftPath(name) {
  return join(process.cwd(), '.dev', 'specs', name, 'DRAFT.md');
}

/**
 * Returns the absolute path to the PLAN.md for a given session name.
 *
 * @param {string} name - Session name
 * @returns {string} Absolute path to .dev/specs/<name>/PLAN.md
 */
export function planPath(name) {
  return join(process.cwd(), '.dev', 'specs', name, 'PLAN.md');
}

/**
 * Returns the absolute path to the plan-content.json for a given session name.
 *
 * @param {string} name - Session name
 * @returns {string} Absolute path to .dev/specs/<name>/plan-content.json
 */
export function planContentPath(name) {
  return join(process.cwd(), '.dev', 'specs', name, 'plan-content.json');
}

/**
 * Returns the absolute path to the findings directory for a given session name.
 *
 * @param {string} name - Session name
 * @returns {string} Absolute path to .dev/specs/<name>/findings/
 */
export function findingsDir(name) {
  return join(process.cwd(), '.dev', 'specs', name, 'findings');
}

/**
 * Returns the absolute path to the analysis directory for a given session name.
 *
 * @param {string} name - Session name
 * @returns {string} Absolute path to .dev/specs/<name>/analysis/
 */
export function analysisDir(name) {
  return join(process.cwd(), '.dev', 'specs', name, 'analysis');
}
