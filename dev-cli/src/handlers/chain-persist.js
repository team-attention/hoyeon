/**
 * handlers/chain-persist.js — dev-cli chain-persist <chainId> <stepId>
 *
 * Persists step result from stdin to disk.
 * Same stdin JSON pipe pattern as persist-result.js.
 *
 * stdin: JSON result (piped)
 * stdout: JSON { persisted, stepId, path }
 */

import { mkdirSync, renameSync, existsSync } from 'node:fs';
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { completeStep, chainResultsDir } from '../core/chain-state.js';

export default async function handler(args) {
  const positional = args.filter(a => !a.startsWith('--'));
  const chainId = positional[0];
  const stepId = positional[1];

  if (!chainId || !stepId) {
    console.error('Usage: dev-cli chain-persist <chainId> <stepId> < result.json');
    process.exit(1);
  }

  // Read stdin (same pattern as persist-result.js)
  let body;
  if (process.stdin.isTTY) {
    console.error('Error: chain-persist requires piped stdin (JSON result)');
    process.exit(1);
  }

  body = readFileSync(0, 'utf8').trim();
  if (!body) {
    console.error('Error: stdin is empty');
    process.exit(1);
  }

  let result;
  try {
    result = JSON.parse(body);
  } catch {
    // Allow plain text results
    result = { text: body };
  }

  // Write result file
  const resultsDir = chainResultsDir(chainId);
  mkdirSync(resultsDir, { recursive: true });
  const resultPath = join(resultsDir, `${stepId}.json`);
  const envelope = {
    stepId,
    result,
    persistedAt: new Date().toISOString(),
  };
  // Atomic write: write to temp file then rename (crash-safe)
  const tmpPath = `${resultPath}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(envelope, null, 2) + '\n');
  renameSync(tmpPath, resultPath);

  // Update chain state
  completeStep(chainId, stepId, `results/${stepId}.json`);

  console.log(JSON.stringify({ persisted: true, stepId, path: resultPath }));
}
