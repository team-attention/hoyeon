/**
 * state-io.js — Shared utilities for reading/writing state.json
 *
 * Uses atomic write pattern: write to .tmp file first, then rename.
 */

import fs from 'fs';
import path from 'path';

/**
 * Read and parse state.json from the given path.
 * Returns the parsed object, or null if the file does not exist.
 *
 * @param {string} statePath - Absolute path to state.json
 * @returns {object|null}
 */
export function readState(statePath) {
  let raw;
  try {
    raw = fs.readFileSync(statePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in state file ${statePath}: ${err.message}`);
  }
}

/**
 * Write data to state.json atomically.
 * Writes to a .tmp file first, then renames to the target path.
 * Also creates a timestamped backup before overwriting.
 *
 * @param {string} statePath - Absolute path to state.json
 * @param {object} data - Data to serialize and write
 */
export function writeState(statePath, data) {
  const dir = path.dirname(statePath);
  const tmpPath = statePath + '.tmp';

  // Ensure the directory exists
  fs.mkdirSync(dir, { recursive: true });

  // Backup existing state if present
  if (fs.existsSync(statePath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = statePath + `.backup-${timestamp}`;
    fs.copyFileSync(statePath, backupPath);
  }

  // Atomic write: write to .tmp, then rename
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, json, 'utf8');
  fs.renameSync(tmpPath, statePath);

  // Retain only the last 3 backups
  const base = path.basename(statePath);
  const backups = fs.readdirSync(dir)
    .filter(f => f.startsWith(base + '.backup-'))
    .sort()
    .map(f => path.join(dir, f));
  while (backups.length > 3) {
    fs.unlinkSync(backups.shift());
  }
}
