/**
 * handlers/init.js — dev-cli init <name> [--quick] [--autopilot] [--standard] [--interactive]
 *                     [--recipe <name>] [--skill <name>]
 *
 * Wraps initSpec() from ../blocks/init.js.
 *
 * When --recipe and --skill are provided, they override the default recipe
 * selection logic. This allows SKILL.md to control which recipe is used.
 */

import { initSpec } from '../blocks/init.js';
import { loadRecipe, validateAgentsExist } from '../core/recipe-loader.js';

/**
 * Extract a --flag value from args (e.g., --recipe foo → 'foo').
 * Returns null if the flag is not present or has no value.
 */
function getFlagValue(args, flagName) {
  const idx = args.indexOf(`--${flagName}`);
  if (idx === -1 || idx + 1 >= args.length) return null;
  const val = args[idx + 1];
  return val.startsWith('--') ? null : val;
}

export default async function handler(args) {
  // Name is always the first positional argument
  const name = args[0] && !args[0].startsWith('--') ? args[0] : null;
  if (!name) {
    console.error('Usage: dev-cli init <name> [--quick] [--autopilot] [--execute] [--recipe <name>] [--skill <name>]');
    process.exit(1);
  }
  const flags = new Set(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2)));
  const depth = flags.has('quick') ? 'quick' : 'standard';

  // Explicit recipe+skill override (used by SKILL.md)
  const explicitRecipe = getFlagValue(args, 'recipe');
  const explicitSkill = getFlagValue(args, 'skill');

  if (explicitRecipe && explicitSkill) {
    const interaction = flags.has('autopilot') ? 'autopilot' : 'interactive';
    const explicitIntent = getFlagValue(args, 'intent');
    let recipeSteps = [];
    let agentWarnings = [];
    try {
      const recipeObj = loadRecipe(explicitRecipe, {}, explicitSkill);
      recipeSteps = (recipeObj.steps || []).map((s) => s.id);
      const missingAgents = validateAgentsExist(recipeObj);
      if (missingAgents.length > 0) {
        agentWarnings = missingAgents.map((m) => `Agent '${m.agent}' (step '${m.step}') not found at ${m.path}`);
        for (const w of agentWarnings) console.warn(`Warning: ${w}`);
      }
    } catch (err) {
      console.warn(`Warning: could not load recipe '${explicitRecipe}' for step validation: ${err.message}`);
    }
    const result = await initSpec(name, { recipe: explicitRecipe, depth, interaction, skill: explicitSkill, intent: explicitIntent, recipeSteps });
    if (agentWarnings.length > 0) result.agentWarnings = agentWarnings;
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (flags.has('execute')) {
    const recipe = `execute-${depth}`;
    // Execute recipes use blocks, not steps — recipeSteps stays empty
    const recipeSteps = [];
    const result = await initSpec(name, { recipe, depth, interaction: 'autopilot', skill: 'execute', recipeSteps });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const interaction = flags.has('autopilot') ? 'autopilot' : 'interactive';
  const recipe = `specify-${depth}-${interaction}`;
  let recipeSteps = [];
  let agentWarnings = [];
  try {
    const recipeObj = loadRecipe(recipe, {}, 'specify');
    recipeSteps = (recipeObj.steps || []).map((s) => s.id);
    const missingAgents = validateAgentsExist(recipeObj);
    if (missingAgents.length > 0) {
      agentWarnings = missingAgents.map((m) => `Agent '${m.agent}' (step '${m.step}') not found at ${m.path}`);
      for (const w of agentWarnings) console.warn(`Warning: ${w}`);
    }
  } catch (err) {
    console.warn(`Warning: could not load recipe '${recipe}' for step validation: ${err.message}`);
  }
  const result = await initSpec(name, { recipe, depth, interaction, skill: 'specify', recipeSteps });
  if (agentWarnings.length > 0) result.agentWarnings = agentWarnings;
  console.log(JSON.stringify(result, null, 2));
}
