/**
 * handlers/wrapup.js — dev-cli wrapup <name> --todo <todoId>
 *
 * Writes execution context from stdin JSON to context files.
 * stdin: JSON { outputs, learnings, issues, auditEntry }
 */

import { readFileSync } from 'node:fs';
import { initContext, writeOutput, appendLearning, appendIssue, appendAudit } from '../engine/context-manager.js';

export default async function handler(args) {
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) {
    console.error('Usage: dev-cli wrapup <name> --todo <todoId>');
    process.exit(1);
  }

  const todoIdx = args.indexOf('--todo');
  const todoId = todoIdx >= 0 ? args[todoIdx + 1] : undefined;

  if (!todoId) {
    console.error('Usage: dev-cli wrapup <name> --todo <todoId>');
    process.exit(1);
  }

  // Read context data from stdin
  let data = {};
  if (!process.stdin.isTTY) {
    try {
      const input = readFileSync(0, 'utf8').trim();
      if (input) data = JSON.parse(input);
    } catch {
      // Ignore parse errors — proceed with empty data
    }
  }

  // Ensure context dir exists
  initContext(name);

  // Write outputs
  if (data.outputs && typeof data.outputs === 'object') {
    writeOutput(name, todoId, data.outputs);
  }

  // Append learnings
  if (data.learnings && typeof data.learnings === 'string') {
    appendLearning(name, todoId, data.learnings);
  }

  // Append issues
  if (data.issues && typeof data.issues === 'string') {
    appendIssue(name, todoId, data.issues);
  }

  // Append audit entry
  if (data.auditEntry && typeof data.auditEntry === 'string') {
    appendAudit(name, data.auditEntry);
  }

  console.log(JSON.stringify({ ok: true, todoId }));
}
