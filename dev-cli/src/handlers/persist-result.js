/**
 * handlers/persist-result.js — dev-cli persist-result <name> --todo <todoId> [--type worker|verify]
 *
 * Persists result from stdin to disk for file-based result passing.
 * stdin: JSON (result) — pipe only
 * stdout: { ok: true, todoId, path }
 * Storage:
 *   --type worker (default) → .dev/specs/{name}/context/worker-result-{todoId}.json
 *   --type verify           → .dev/specs/{name}/context/verify-result-{todoId}.json
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { contextDir } from '../core/paths.js';

export default async function handler(args) {
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) {
    console.error('Usage: dev-cli persist-result <name> --todo <todoId> [--type worker|verify]');
    process.exit(1);
  }

  const todoIdx = args.indexOf('--todo');
  const todoId = todoIdx >= 0 ? args[todoIdx + 1] : undefined;

  if (!todoId) {
    console.error('Usage: dev-cli persist-result <name> --todo <todoId> [--type worker|verify]');
    process.exit(1);
  }

  const typeIdx = args.indexOf('--type');
  const type = typeIdx >= 0 ? args[typeIdx + 1] : 'worker';

  // Require piped stdin
  if (process.stdin.isTTY) {
    console.error('Error: persist-result requires piped stdin (JSON worker result)');
    process.exit(1);
  }

  let result;
  try {
    const input = readFileSync(0, 'utf8').trim();
    if (!input) {
      console.error('Error: stdin is empty');
      process.exit(1);
    }
    result = JSON.parse(input);
  } catch (err) {
    console.error(`Error: Failed to parse stdin as JSON: ${err.message}`);
    process.exit(1);
  }

  // Ensure context dir exists
  const dir = contextDir(name);
  mkdirSync(dir, { recursive: true });

  // Build envelope
  const envelope = {
    todoId,
    result,
    persistedAt: new Date().toISOString(),
  };

  // Atomic write: tmp + rename
  const prefix = type === 'verify' ? 'verify-result' : 'worker-result';
  const filePath = join(dir, `${prefix}-${todoId}.json`);
  const tmpPath = join(dir, `.${prefix}-${todoId}-${randomBytes(6).toString('hex')}.tmp`);
  writeFileSync(tmpPath, JSON.stringify(envelope, null, 2));
  renameSync(tmpPath, filePath);

  console.log(JSON.stringify({ ok: true, todoId, path: filePath }));
}
