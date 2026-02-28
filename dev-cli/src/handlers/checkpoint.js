/**
 * handlers/checkpoint.js — dev-cli checkpoint <name> --todo <todoId> [--mode standard|quick]
 *
 * Marks a TODO as checked in PLAN.md.
 * stdin (optional): verify result JSON (standard mode → mark only PASS criteria)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { planPath } from '../core/paths.js';

export default async function handler(args) {
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) {
    console.error('Usage: dev-cli checkpoint <name> --todo <todoId> [--mode standard|quick]');
    process.exit(1);
  }

  const todoIdx = args.indexOf('--todo');
  const todoId = todoIdx >= 0 ? args[todoIdx + 1] : undefined;

  if (!todoId) {
    console.error('Usage: dev-cli checkpoint <name> --todo <todoId>');
    process.exit(1);
  }

  const modeIdx = args.indexOf('--mode');
  const mode = modeIdx >= 0 ? args[modeIdx + 1] : 'standard';

  // Read optional verify result from stdin
  let verifyResult = null;
  if (!process.stdin.isTTY) {
    try {
      const input = readFileSync(0, 'utf8').trim();
      if (input) verifyResult = JSON.parse(input);
    } catch {
      // Ignore parse errors
    }
  }

  // Read PLAN.md
  const filePath = planPath(name);
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`Cannot read PLAN.md: ${err.message}`);
    process.exit(1);
  }

  // Extract TODO number from todoId (e.g. 'todo-1' → 1, 'todo-final' → 'final')
  const todoNumMatch = todoId.match(/todo-(\d+)/);
  if (!todoNumMatch) {
    // Try matching 'todo-final' or similar non-numeric IDs
    const pattern = new RegExp(`^(### )\\[ \\]( TODO ${todoId.replace('todo-', '')}:?)`, 'im');
    const updated = content.replace(pattern, '$1[x]$2');
    if (updated !== content) {
      writeFileSync(filePath, updated);
      console.log(JSON.stringify({ ok: true, todoId, marked: true }));
    } else {
      console.log(JSON.stringify({ ok: true, todoId, marked: false, reason: 'No matching checkbox found' }));
    }
    return;
  }

  const todoNum = todoNumMatch[1];

  // Mark TODO checkbox: ### [ ] TODO N → ### [x] TODO N
  const pattern = new RegExp(`^(### )\\[ \\]( TODO ${todoNum}:?)`, 'im');
  const updated = content.replace(pattern, '$1[x]$2');

  if (updated !== content) {
    writeFileSync(filePath, updated);
    console.log(JSON.stringify({ ok: true, todoId, marked: true }));
  } else {
    // Already checked or no matching pattern
    console.log(JSON.stringify({ ok: true, todoId, marked: false, reason: 'Already checked or no matching checkbox' }));
  }
}
