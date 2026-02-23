/**
 * handlers/findings.js — dev-cli findings <name> aggregate [--include-analysis]
 *
 * Wraps findings operations from ../blocks/.
 */

import { findingsAggregate } from '../blocks/findings-aggregate.js';

export default async function handler(args) {
  const name = args[0];
  const action = args[1]; // 'aggregate'
  if (!name || !action) {
    console.error('Usage: dev-cli findings <name> aggregate [--include-analysis]');
    process.exit(1);
  }

  let result;
  if (action === 'aggregate') {
    const includeAnalysis = args.includes('--include-analysis');
    result = findingsAggregate(name, { includeAnalysis });
  } else {
    console.error(`Unknown findings action: '${action}'. Use 'aggregate'.`);
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}
