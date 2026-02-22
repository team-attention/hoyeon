/**
 * handlers/triage.js — dev-cli triage <name> --todo <todoId> [--retries N] [--depth N] [--dynamic-count N]
 *
 * Triages a verify result into a disposition.
 * stdin: verify result JSON
 * stdout: { disposition, reason, auditEntry }
 */

import { readFileSync } from 'node:fs';
import { triage, buildAuditEntry } from '../engine/reconciler.js';
import { parsePlan } from '../engine/plan-parser.js';

export default async function handler(args) {
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) {
    console.error('Usage: dev-cli triage <name> --todo <todoId> [--retries N] [--depth N] [--dynamic-count N]');
    process.exit(1);
  }

  const todoIdx = args.indexOf('--todo');
  const todoId = todoIdx >= 0 ? args[todoIdx + 1] : undefined;

  if (!todoId) {
    console.error('Usage: dev-cli triage <name> --todo <todoId>');
    process.exit(1);
  }

  const retriesIdx = args.indexOf('--retries');
  const retries = retriesIdx >= 0 ? parseInt(args[retriesIdx + 1], 10) : 0;

  const depthIdx = args.indexOf('--depth');
  const depth = depthIdx >= 0 ? parseInt(args[depthIdx + 1], 10) : 0;

  const dynamicIdx = args.indexOf('--dynamic-count');
  const dynamicTodos = dynamicIdx >= 0 ? parseInt(args[dynamicIdx + 1], 10) : 0;

  // Read verify result from stdin
  let verifyResult = null;
  if (!process.stdin.isTTY) {
    try {
      const input = readFileSync(0, 'utf8').trim();
      if (input) verifyResult = JSON.parse(input);
    } catch {
      console.error('Failed to parse verify result from stdin');
      process.exit(1);
    }
  }

  if (!verifyResult) {
    console.error('No verify result provided on stdin');
    process.exit(1);
  }

  // Determine TODO type from plan
  let todoType = 'work';
  try {
    const plan = parsePlan(name);
    const todo = plan.todos.find((t) => t.id === todoId);
    if (todo) todoType = todo.type;
  } catch {
    // If plan can't be loaded, default to 'work'
  }

  const todoState = { retries, dynamicTodos };
  const result = triage(verifyResult, todoType, todoState, depth);

  const auditEntry = buildAuditEntry('triage', todoId, {
    disposition: result.disposition,
    reason: result.reason,
  });

  console.log(JSON.stringify({
    disposition: result.disposition,
    reason: result.reason,
    details: result.details,
    auditEntry,
  }, null, 2));
}
