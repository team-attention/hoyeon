/**
 * handlers/plan.js — dev-cli plan <name> generate|summary|validate [options]
 *
 * Wraps plan operations from ../blocks/.
 *
 * For 'generate': requires --data <path> pointing to a plan-content.json file.
 *   Default path: <sessionDir>/plan-content.json (see planContentPath())
 *
 * For 'validate': validates plan-content.json schema + semantic consistency.
 *   --data <path> to specify a custom path.
 */

import { planGenerate } from '../blocks/plan-generate.js';
import { planSummary } from '../blocks/plan-summary.js';
import { planValidate } from '../blocks/plan-validate.js';
import { planContentPath } from '../core/paths.js';

export default async function handler(args) {
  const name = args[0];
  const action = args[1]; // 'generate', 'summary', 'validate'
  if (!name || !action) {
    console.error('Usage: dev-cli plan <name> generate|summary|validate [options]');
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
  } else if (action === 'validate') {
    const dataIdx = args.indexOf('--data');
    const dataPath = dataIdx >= 0 ? args[dataIdx + 1] : undefined;
    result = planValidate(name, dataPath);
  } else {
    console.error(`Unknown plan action: ${action}. Use 'generate', 'summary', or 'validate'.`);
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}
