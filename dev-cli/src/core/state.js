/**
 * state.js — state.json CRUD for dev-cli sessions
 *
 * State files live at: <sessionDir>/state.json (see paths.js)
 * Writes are atomic: write to tmp file, then rename.
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { statePath as _statePath } from './paths.js';

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to the state.json for a given session name.
 * Resolves relative to process.cwd() so callers can control the working dir.
 */
export function statePath(name) {
  if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)) {
    throw new Error(`Invalid session name: "${name}". Must be 1-64 alphanumeric/dash/underscore characters.`);
  }
  return _statePath(name);
}

// ---------------------------------------------------------------------------
// Atomic write
// ---------------------------------------------------------------------------

/**
 * Atomically write JSON data to targetPath.
 * Writes to a tmp file first, then renames to targetPath.
 */
function atomicWriteJSON(targetPath, data) {
  const dir = dirname(targetPath);
  mkdirSync(dir, { recursive: true });

  const tmpPath = `${targetPath}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    renameSync(tmpPath, targetPath);
  } catch (err) {
    // Best-effort cleanup of tmp file on error
    try {
      if (existsSync(tmpPath)) {
        writeFileSync(tmpPath, ''); // truncate to allow OS cleanup
      }
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Schema factory
// ---------------------------------------------------------------------------

/**
 * Build a fresh state object for a new session.
 * @param {string} name - Session name (e.g. "add-auth")
 * @param {{ depth?: string, interaction?: string, recipe?: string, skill?: string, sessionId?: string }} opts
 */
function buildInitialState(name, opts = {}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    name,
    specName: name,
    sessionId: opts.sessionId ?? null,
    recipe: opts.recipe ?? null,
    mode: {
      depth: opts.depth ?? 'standard',
      interaction: opts.interaction ?? 'interactive',
    },
    skill: opts.skill ?? null,
    phase: 'init',
    currentBlock: null,
    blockIndex: 0,
    pendingAction: null,
    steps: {
      init: { status: 'done', at: now },
    },
    agents: {},
    reviewRounds: 0,
    events: [
      {
        type: 'init',
        at: now,
        data: {
          recipe: opts.recipe ?? null,
          depth: opts.depth ?? 'standard',
          interaction: opts.interaction ?? 'interactive',
        },
      },
    ],
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new session state.json.
 * Throws if a state.json already exists for this name.
 *
 * @param {string} name
 * @param {{ depth?: string, interaction?: string, recipe?: string, skill?: string }} opts
 * @returns {object} The created state object
 */
export function createState(name, opts = {}) {
  const target = statePath(name);
  if (existsSync(target)) {
    throw new Error(`State already exists for session '${name}' at ${target}`);
  }
  const state = buildInitialState(name, opts);
  atomicWriteJSON(target, state);
  return state;
}

/**
 * Load and parse state.json for a session.
 *
 * @param {string} name
 * @returns {object} Parsed state object
 */
export function loadState(name) {
  const target = statePath(name);
  if (!existsSync(target)) {
    throw new Error(`No state found for session '${name}' at ${target}`);
  }
  const raw = readFileSync(target, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Corrupted state file at ${target}: ${err.message}`);
  }
}

/**
 * Merge a patch object into the existing state and write atomically.
 *
 * @param {string} name
 * @param {object} patch - Shallow merge applied to state
 * @returns {object} Updated state object
 */
export function updateState(name, patch) {
  const current = loadState(name);
  const updated = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const target = statePath(name);
  atomicWriteJSON(target, updated);
  return updated;
}

/**
 * Advance blockIndex by 1.
 * Updates phase/currentBlock from recipe blocks if recipe provides them.
 * If no recipe blocks are available, only increments blockIndex.
 *
 * @param {string} name
 * @returns {object} Updated state object
 */
export function advanceBlock(name) {
  const current = loadState(name);
  const nextIndex = (current.blockIndex ?? 0) + 1;

  const patch = {
    blockIndex: nextIndex,
  };


  return updateState(name, patch);
}

// ---------------------------------------------------------------------------
// Pending action management
// ---------------------------------------------------------------------------

/**
 * Set a pending action on the state.
 *
 * @param {string} name
 * @param {{ block: string, action: string, instruction: string }} actionDef
 * @returns {object} Updated state object
 */
export function setPendingAction(name, actionDef) {
  const now = new Date().toISOString();
  const pendingAction = {
    block: actionDef.block,
    action: actionDef.action,
    instruction: actionDef.instruction,
    issuedAt: now,
    acknowledged: false,
  };
  const updated = updateState(name, { pendingAction });
  appendEvent(name, 'pendingAction.set', { action: actionDef.action, block: actionDef.block });
  return updated;
}

/**
 * Acknowledge the current pending action (mark as acknowledged).
 *
 * @param {string} name
 * @returns {object} Updated state object
 */
export function acknowledgePendingAction(name) {
  const current = loadState(name);
  if (!current.pendingAction) {
    throw new Error(`No pending action to acknowledge for session '${name}'`);
  }
  const pendingAction = { ...current.pendingAction, acknowledged: true };
  const updated = updateState(name, { pendingAction });
  appendEvent(name, 'pendingAction.acknowledged', { action: pendingAction.action });
  return updated;
}

/**
 * Check whether there is an unacknowledged pending action.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function hasPendingAction(name) {
  const current = loadState(name);
  return !!(current.pendingAction && !current.pendingAction.acknowledged);
}

// ---------------------------------------------------------------------------
// Event logging
// ---------------------------------------------------------------------------

/**
 * Append an event to the events array.
 *
 * @param {string} name
 * @param {string} type
 * @param {object} [data]
 * @returns {object} Updated state object
 */
export function appendEvent(name, type, data = {}) {
  const current = loadState(name);
  const event = {
    type,
    at: new Date().toISOString(),
    data,
  };
  const events = [...(current.events ?? []), event];
  return updateState(name, { events });
}
