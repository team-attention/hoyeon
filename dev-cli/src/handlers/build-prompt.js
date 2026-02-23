/**
 * handlers/build-prompt.js — dev-cli build-prompt <name> --todo <todoId> --type <type>
 *
 * Builds a prompt for a specific TODO and dispatch type.
 * stdin (optional): JSON input data (e.g. workerResult for verify)
 * stdout: prompt string
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildPromptForTodo } from '../engine/prompt-factory.js';
import { contextDir } from '../core/paths.js';

export default async function handler(args) {
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) {
    console.error('Usage: dev-cli build-prompt <name> --todo <todoId> --type <type>');
    process.exit(1);
  }

  const todoIdx = args.indexOf('--todo');
  const todoId = todoIdx >= 0 ? args[todoIdx + 1] : undefined;

  const typeIdx = args.indexOf('--type');
  const type = typeIdx >= 0 ? args[typeIdx + 1] : undefined;

  if (!todoId || !type) {
    console.error('Usage: dev-cli build-prompt <name> --todo <todoId> --type <type>');
    process.exit(1);
  }

  // Read optional input data from stdin
  let inputData = null;
  if (!process.stdin.isTTY) {
    try {
      const input = readFileSync(0, 'utf8').trim();
      if (input) inputData = JSON.parse(input);
    } catch {
      // Ignore parse errors — proceed without input data
    }
  }

  // Fallback: read persisted worker result for compact recovery
  if (!inputData && type === 'verify') {
    const persistedPath = join(contextDir(name), `worker-result-${todoId}.json`);
    if (existsSync(persistedPath)) {
      try {
        const envelope = JSON.parse(readFileSync(persistedPath, 'utf8'));
        inputData = envelope.result;
        console.error(`[recovery] Using persisted worker result for ${todoId}`);
      } catch { /* proceed without */ }
    }
  }

  const prompt = buildPromptForTodo(name, todoId, type, inputData);
  process.stdout.write(prompt);
}
