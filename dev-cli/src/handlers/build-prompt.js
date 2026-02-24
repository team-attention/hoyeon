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
    console.error('Types: worker | verify | fix | commit | code-review | final-verify | finalize-fix | report');
    process.exit(1);
  }

  const todoIdx = args.indexOf('--todo');
  const todoId = todoIdx >= 0 ? args[todoIdx + 1] : undefined;

  const typeIdx = args.indexOf('--type');
  const type = typeIdx >= 0 ? args[typeIdx + 1] : undefined;

  if (!todoId || !type) {
    console.error('Usage: dev-cli build-prompt <name> --todo <todoId> --type <type>');
    console.error('Types: worker | verify | fix | commit | code-review | final-verify | finalize-fix | report');
    process.exit(1);
  }

  // --result-file: read from persisted file instead of stdin
  const useResultFile = args.includes('--result-file');

  let inputData = null;
  if (useResultFile) {
    // Determine which persisted file to read based on type
    // verify, fix → worker-result (needs the worker's output)
    // finalize-fix → verify-result or code-review/final-verify result
    const resultPrefix = (type === 'finalize-fix') ? 'verify-result' : 'worker-result';
    const persistedPath = join(contextDir(name), `${resultPrefix}-${todoId}.json`);
    if (existsSync(persistedPath)) {
      try {
        const envelope = JSON.parse(readFileSync(persistedPath, 'utf8'));
        inputData = envelope.result;
      } catch {
        console.error(`[result-file] Failed to read ${persistedPath}`);
      }
    } else {
      console.error(`[result-file] File not found: ${persistedPath}`);
    }
  } else if (!process.stdin.isTTY) {
    // Legacy: read from stdin
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
