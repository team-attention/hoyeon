/**
 * handlers/plan.js — dev-cli plan <name> generate|summary [options]
 *
 * Wraps plan operations from ../blocks/.
 *
 * For 'generate': requires --data <path> pointing to a plan-content.json file.
 *   Default path: <sessionDir>/plan-content.json (see planContentPath())
 */

import { planGenerate } from '../blocks/plan-generate.js';
import { planSummary } from '../blocks/plan-summary.js';
import { planContentPath } from '../core/paths.js';

export default async function handler(args) {
  const name = args[0];
  const action = args[1]; // 'generate', 'summary'
  if (!name || !action) {
    console.error('Usage: dev-cli plan <name> generate|summary [options]');
    process.exit(1);
  }

  let result;
  if (action === 'generate') {
    // Determine the data path: --data <path> or default to planContentPath(name)
    const dataIdx = args.indexOf('--data');
    const dataPath =
      dataIdx >= 0
        ? args[dataIdx + 1]
        : planContentPath(name);
    result = await planGenerate(name, dataPath);
  } else if (action === 'summary') {
    result = await planSummary(name);
  } else {
    console.error(`Unknown plan action: ${action}. Use 'generate' or 'summary'.`);
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}
