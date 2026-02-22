/**
 * session.js — Session lifecycle module for dev-cli
 *
 * Manages per-session directories under .dev/.sessions/{sessionId}/
 * and session.ref pointer files under .dev/specs/{name}/session.ref.
 *
 * Session IDs are generated locally with crypto.randomUUID().
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { specDir } from './paths.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to the .dev/.sessions/ base directory.
 *
 * @returns {string}
 */
function sessionsBaseDir() {
  return join(process.cwd(), '.dev', '.sessions');
}

/**
 * Returns the absolute path to the session directory for a given sessionId.
 *
 * @param {string} sessionId - UUID session identifier
 * @returns {string}
 */
function sessionDirById(sessionId) {
  return join(sessionsBaseDir(), sessionId);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new session directory for the given spec name.
 *
 * Creates:
 *   .dev/.sessions/{sessionId}/
 *   .dev/.sessions/{sessionId}/findings/
 *   .dev/.sessions/{sessionId}/analysis/
 *
 * @param {string} _name - Spec name (reserved for future use / logging)
 * @returns {string} The generated sessionId (UUID)
 */
export function createSession(_name) {
  const sessionId = randomUUID();
  const sessionDir = sessionDirById(sessionId);

  mkdirSync(join(sessionDir, 'findings'), { recursive: true });
  mkdirSync(join(sessionDir, 'analysis'), { recursive: true });

  return sessionId;
}

/**
 * Read the session.ref pointer file for the given spec name.
 * Returns the sessionId string, or null if the file does not exist.
 *
 * @param {string} name - Spec name
 * @returns {string|null} sessionId or null
 */
export function resolveSessionId(name) {
  const refPath = join(specDir(name), 'session.ref');
  if (!existsSync(refPath)) return null;
  const content = readFileSync(refPath, 'utf8').trim();
  return content.length > 0 ? content : null;
}

/**
 * Write a session.ref pointer file in the spec directory.
 * The file contains only the sessionId (no paths, no newlines except trailing).
 *
 * @param {string} name - Spec name
 * @param {string} sessionId - UUID session identifier
 */
export function linkToSpec(name, sessionId) {
  const specDirPath = specDir(name);
  mkdirSync(specDirPath, { recursive: true });
  writeFileSync(join(specDirPath, 'session.ref'), sessionId + '\n', 'utf8');
}
