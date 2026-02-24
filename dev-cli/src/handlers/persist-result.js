/**
 * handlers/persist-result.js — dev-cli persist-result <name> --todo <todoId>
 *
 * Persists worker result from stdin to disk for compact recovery.
 * stdin: JSON (worker result) — pipe only
 * stdout: { ok: true, todoId, path }
 * Storage: .dev/specs/{name}/context/worker-result-{todoId}.json
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { contextDir } from '../core/paths.js';

export default async function handler(args) {
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) {
    console.error('Usage: dev-cli persist-result <name> --todo <todoId>');
    process.exit(1);
  }

  const todoIdx = args.indexOf('--todo');
  const todoId = todoIdx >= 0 ? args[todoIdx + 1] : undefined;

  if (!todoId) {
    console.error('Usage: dev-cli persist-result <name> --todo <todoId>');
    process.exit(1);
  }

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
  const filePath = join(dir, `worker-result-${todoId}.json`);
  const tmpPath = join(dir, `.worker-result-${todoId}-${randomBytes(6).toString('hex')}.tmp`);
  writeFileSync(tmpPath, JSON.stringify(envelope, null, 2));
  renameSync(tmpPath, filePath);

  console.log(JSON.stringify({ ok: true, todoId, path: filePath }));
}
