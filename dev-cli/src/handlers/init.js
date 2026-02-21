/**
 * handlers/init.js — dev-cli init <name> [--quick] [--autopilot] [--standard] [--interactive]
 *
 * Wraps initSpec() from ../blocks/init.js.
 */

import { initSpec } from '../blocks/init.js';

export default async function handler(args) {
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) {
    console.error('Usage: dev-cli init <name> [--quick] [--autopilot]');
    process.exit(1);
  }
  const flags = new Set(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2)));
  const depth = flags.has('quick') ? 'quick' : 'standard';
  const interaction = flags.has('autopilot') ? 'autopilot' : 'interactive';
  const recipe = `specify-${depth}-${interaction}`;
  const result = await initSpec(name, { recipe, depth, interaction, skill: 'specify' });
  console.log(JSON.stringify(result, null, 2));
}
