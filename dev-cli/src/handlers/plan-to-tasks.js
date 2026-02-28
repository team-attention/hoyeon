/**
 * handlers/plan-to-tasks.js — dev-cli plan-to-tasks <name> [--mode standard|quick]
 *
 * Converts a plan into TaskCreate-compatible JSON.
 * stdout: { tasks: TaskSpec[], dependencies: Dep[] }
 */

import { planToTasks } from '../engine/plan-to-tasks.js';

export default async function handler(args) {
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) {
    console.error('Usage: dev-cli plan-to-tasks <name> [--mode standard|quick]');
    process.exit(1);
  }

  const modeIdx = args.indexOf('--mode');
  const mode = modeIdx >= 0 ? args[modeIdx + 1] : 'standard';

  if (mode !== 'standard' && mode !== 'quick') {
    console.error(`Invalid mode: '${mode}'. Must be 'standard' or 'quick'.`);
    process.exit(1);
  }

  const result = planToTasks(name, mode);
  console.log(JSON.stringify(result, null, 2));
}
