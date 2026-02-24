/**
 * handlers/triage.js — dev-cli triage <name> --todo <todoId> [--retries N] [--depth N] [--dynamic-count N]
 *
 * Triages a verify result into a disposition.
 * stdin: verify result JSON
 * stdout: { disposition, reason, auditEntry }
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { triage, triageFinalize, buildAuditEntry } from '../engine/reconciler.js';
import { parsePlan } from '../engine/plan-parser.js';
import { contextDir } from '../core/paths.js';

export default async function handler(args) {
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) {
    console.error('Usage: dev-cli triage <name> --todo <todoId> [--retries N] [--depth N] [--dynamic-count N]');
    console.error('       echo JSON | dev-cli triage <name> --phase finalize --step <step> --iteration <N>');
    process.exit(1);
  }

  // --result-file: read from persisted file instead of stdin
  const useResultFile = args.includes('--result-file');

  let inputResult = null;
  if (useResultFile) {
    // Determine todoId early for file lookup
    const todoIdxEarly = args.indexOf('--todo');
    const todoIdEarly = todoIdxEarly >= 0 ? args[todoIdxEarly + 1] : undefined;
    if (todoIdEarly) {
      const persistedPath = join(contextDir(name), `verify-result-${todoIdEarly}.json`);
      if (existsSync(persistedPath)) {
        try {
          const envelope = JSON.parse(readFileSync(persistedPath, 'utf8'));
          inputResult = envelope.result;
        } catch {
          console.error(`[result-file] Failed to read ${persistedPath}`);
        }
      } else {
        console.error(`[result-file] File not found: ${persistedPath}`);
      }
    }
  } else if (!process.stdin.isTTY) {
    // Legacy: read from stdin
    try {
      const input = readFileSync(0, 'utf8').trim();
      if (input) inputResult = JSON.parse(input);
    } catch {
      console.error('Failed to parse result from stdin');
      process.exit(1);
    }
  }

  // --phase finalize: route to triageFinalize
  const phaseIdx = args.indexOf('--phase');
  const phase = phaseIdx >= 0 ? args[phaseIdx + 1] : undefined;

  if (phase === 'finalize') {
    const stepIdx = args.indexOf('--step');
    const stepName = stepIdx >= 0 ? args[stepIdx + 1] : undefined;
    const iterIdx = args.indexOf('--iteration');
    const iteration = iterIdx >= 0 ? parseInt(args[iterIdx + 1], 10) : 0;

    if (isNaN(iteration)) {
      console.error('--iteration requires a numeric value');
      process.exit(1);
    }

    if (!stepName) {
      console.error('Usage: echo JSON | dev-cli triage <name> --phase finalize --step <step> --iteration <N>');
      process.exit(1);
    }

    if (!inputResult) {
      console.error('Finalize triage requires a JSON result on stdin');
      process.exit(1);
    }

    const result = triageFinalize(inputResult, stepName, iteration);

    const auditEntry = buildAuditEntry('triage', `finalize:${stepName}`, {
      disposition: result.disposition,
      iteration,
    });

    console.log(JSON.stringify({
      disposition: result.disposition,
      issues: result.issues,
      auditEntry,
    }, null, 2));
    return;
  }

  // --- Existing TODO triage path ---

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

  if (!inputResult) {
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
  const result = triage(inputResult, todoType, todoState, depth);

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
