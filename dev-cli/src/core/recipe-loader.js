/**
 * recipe-loader.js — Load and validate YAML recipe files for dev-cli sessions
 *
 * Recipes live at: .claude/skills/{skill}/recipes/{name}.yaml (or .yml)
 * Uses js-yaml for parsing.
 *
 * Two recipe formats coexist:
 *   - Sequencer format (execute): has 'blocks' array — consumed by sequencer.js/engine.js
 *   - Data format (specify): has 'steps' array — consumed by SKILL.md (LLM reads directly)
 * Execute recipes use blocks+todo_substeps+finalize. Specify recipes use steps+mode.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Project root: dev-cli/ parent directory */
const PROJECT_ROOT = join(__dirname, '..', '..', '..');

/** Built-in agent types that don't require .claude/agents/ files */
const BUILTIN_AGENT_TYPES = new Set(['Explore', 'Plan']);

/**
 * Resolve the absolute path to the recipes directory for a given skill.
 * Recipes are stored at .claude/skills/{skillName}/recipes/ relative to the plugin root.
 * Path traversal: src/core/ → dev-cli/ → project root (assumes dev-cli/ is a direct child of plugin root).
 *
 * @param {string} skillName - The skill name (e.g. 'specify', 'execute')
 * @returns {string} Absolute path to the skill's recipes directory
 */
export function recipesDir(skillName) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(skillName)) {
    throw new Error(`Invalid skillName '${skillName}': must match [a-z0-9][a-z0-9-]*`);
  }
  return join(__dirname, '..', '..', '..', '.claude', 'skills', skillName, 'recipes');
}

/**
 * Valid block types supported by the CLI.
 */
const VALID_BLOCK_TYPES = new Set([
  'cli',
  'llm',
  'llm-loop',
  'llm+cli',
  'subagent',
  'subagent-loop',
  'engine',
]);

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

/**
 * Replace all {variable} placeholders in a string with values from vars.
 * Only replaces known variables; unknown placeholders are left as-is.
 *
 * @param {string} str - The template string
 * @param {Record<string, string>} vars - Variable values
 * @returns {string}
 */
function resolveTemplateString(str, vars) {
  if (typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}

/**
 * Recursively resolve template variables in a value (string, array, or object).
 *
 * @param {unknown} value
 * @param {Record<string, string>} vars
 * @returns {unknown}
 */
function resolveTemplateValue(value, vars) {
  if (typeof value === 'string') {
    return resolveTemplateString(value, vars);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplateValue(item, vars));
  }
  if (value !== null && typeof value === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = resolveTemplateValue(v, vars);
    }
    return result;
  }
  return value;
}

/**
 * Apply template variable resolution to all string fields in each block.
 *
 * @param {object[]} blocks
 * @param {Record<string, string>} vars
 * @returns {object[]}
 */
function resolveTemplates(blocks, vars) {
  return blocks.map((block) => resolveTemplateValue(block, vars));
}

// ---------------------------------------------------------------------------
// Execute recipe substep/finalize validation
// ---------------------------------------------------------------------------

/**
 * Valid types for todo_substeps and finalize entries.
 */
const VALID_SUBSTEP_TYPES = new Set(['dispatch_llm', 'deterministic']);

/**
 * Validate a single substep entry in todo_substeps or finalize.
 *
 * @param {unknown} entry - The substep entry to validate
 * @param {number} index - Entry index for error messages
 * @param {string} section - 'todo_substeps' | 'finalize'
 * @throws {Error} If validation fails
 */
function validateSubstepEntry(entry, index, section) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`${section}[${index}] must be an object`);
  }

  if (!entry.suffix || typeof entry.suffix !== 'string') {
    throw new Error(`${section}[${index}] is missing required field 'suffix' (must be a non-empty string)`);
  }

  if (!entry.type || typeof entry.type !== 'string') {
    throw new Error(`${section}[${index}] is missing required field 'type'`);
  }

  if (!VALID_SUBSTEP_TYPES.has(entry.type)) {
    throw new Error(
      `${section}[${index}] has invalid type '${entry.type}'. ` +
      `Valid types: ${[...VALID_SUBSTEP_TYPES].join(', ')}`
    );
  }

  // dispatch_llm must have an agent
  if (entry.type === 'dispatch_llm' && !entry.agent) {
    throw new Error(`${section}[${index}] is type 'dispatch_llm' but missing 'agent' field`);
  }
}

/**
 * Validate execute recipe extensions (todo_substeps and finalize).
 * Only called when these fields are present.
 *
 * @param {object} recipe - The parsed recipe
 * @throws {Error} If validation fails
 */
function validateExecuteExtensions(recipe) {
  if (recipe.todo_substeps) {
    if (!Array.isArray(recipe.todo_substeps)) {
      throw new Error("Recipe 'todo_substeps' must be an array");
    }
    if (recipe.todo_substeps.length === 0) {
      throw new Error("Recipe 'todo_substeps' array must not be empty");
    }
    for (let i = 0; i < recipe.todo_substeps.length; i++) {
      validateSubstepEntry(recipe.todo_substeps[i], i, 'todo_substeps');
    }
  }

  if (recipe.finalize) {
    if (!Array.isArray(recipe.finalize)) {
      throw new Error("Recipe 'finalize' must be an array");
    }
    if (recipe.finalize.length === 0) {
      throw new Error("Recipe 'finalize' array must not be empty");
    }
    for (let i = 0; i < recipe.finalize.length; i++) {
      validateSubstepEntry(recipe.finalize[i], i, 'finalize');
    }
  }

  // If one is present, both must be
  if (recipe.todo_substeps && !recipe.finalize) {
    throw new Error("Recipe has 'todo_substeps' but missing 'finalize'");
  }
  if (recipe.finalize && !recipe.todo_substeps) {
    throw new Error("Recipe has 'finalize' but missing 'todo_substeps'");
  }
}

// ---------------------------------------------------------------------------
// Specify recipe step validation
// ---------------------------------------------------------------------------

/**
 * Valid fields for specify recipe steps.
 */
const VALID_STEP_FIELDS = new Set([
  'id',              // required, string
  'agents',          // optional, array of { type, output, variant? }
  'parallel',        // optional, boolean
  'maxRounds',       // optional, positive integer (review step용)
  'autoTransition',  // optional, boolean (사용자 확인 없이 다음 step)
  'confirmation',    // optional, "user" | "log-only" | "none"
  'summary',         // optional, "full" | "compact" | "none"
]);

const VALID_CONFIRMATION_VALUES = new Set(['user', 'log-only', 'none']);
const VALID_SUMMARY_VALUES = new Set(['full', 'compact', 'none']);

/**
 * Validate a single step object in a specify recipe.
 *
 * @param {unknown} step - The step to validate
 * @param {number} index - Step index for error messages
 * @throws {Error} If validation fails
 */
function validateStep(step, index) {
  if (step === null || typeof step !== 'object' || Array.isArray(step)) {
    throw new Error(`Step at index ${index} must be an object`);
  }

  // Required: id (string, non-empty)
  if (!Object.prototype.hasOwnProperty.call(step, 'id') || typeof step.id !== 'string' || step.id.trim() === '') {
    throw new Error(`Step at index ${index} is missing required field 'id' (must be a non-empty string)`);
  }

  const stepId = step.id;

  // Optional: agents (array, each item must have type and output)
  if (Object.prototype.hasOwnProperty.call(step, 'agents')) {
    if (!Array.isArray(step.agents)) {
      throw new Error(`Step '${stepId}' (index ${index}): 'agents' must be an array`);
    }
    for (let i = 0; i < step.agents.length; i++) {
      const agent = step.agents[i];
      if (agent === null || typeof agent !== 'object' || Array.isArray(agent)) {
        throw new Error(`Step '${stepId}' agents[${i}] must be an object`);
      }
      if (!agent.type || typeof agent.type !== 'string') {
        throw new Error(`Step '${stepId}' agents[${i}] is missing required field 'type' (must be a non-empty string)`);
      }
      if (!agent.output || typeof agent.output !== 'string') {
        throw new Error(`Step '${stepId}' agents[${i}] is missing required field 'output' (must be a non-empty string)`);
      }
    }
  }

  // Optional: maxRounds (positive integer)
  if (Object.prototype.hasOwnProperty.call(step, 'maxRounds')) {
    const mr = step.maxRounds;
    if (!Number.isInteger(mr) || mr <= 0) {
      throw new Error(`Step '${stepId}' (index ${index}): 'maxRounds' must be a positive integer`);
    }
  }

  // Optional: confirmation ("user" | "log-only" | "none")
  if (Object.prototype.hasOwnProperty.call(step, 'confirmation')) {
    if (!VALID_CONFIRMATION_VALUES.has(step.confirmation)) {
      throw new Error(
        `Step '${stepId}' (index ${index}): 'confirmation' must be one of: ${[...VALID_CONFIRMATION_VALUES].join(', ')}`
      );
    }
  }

  // Optional: summary ("full" | "compact" | "none")
  if (Object.prototype.hasOwnProperty.call(step, 'summary')) {
    if (!VALID_SUMMARY_VALUES.has(step.summary)) {
      throw new Error(
        `Step '${stepId}' (index ${index}): 'summary' must be one of: ${[...VALID_SUMMARY_VALUES].join(', ')}`
      );
    }
  }

  // Optional: autoTransition (boolean)
  if (Object.prototype.hasOwnProperty.call(step, 'autoTransition')) {
    if (typeof step.autoTransition !== 'boolean') {
      throw new Error(`Step '${stepId}' (index ${index}): 'autoTransition' must be a boolean`);
    }
  }

  // Optional: parallel (boolean)
  if (Object.prototype.hasOwnProperty.call(step, 'parallel')) {
    if (typeof step.parallel !== 'boolean') {
      throw new Error(`Step '${stepId}' (index ${index}): 'parallel' must be a boolean`);
    }
  }

  // Warn on unknown fields (backwards-compatible: warning only, not error)
  for (const field of Object.keys(step)) {
    if (!VALID_STEP_FIELDS.has(field)) {
      console.warn(`Step '${stepId}' (index ${index}): unknown field '${field}' (ignored)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a single block object.
 * Each block must have `id` (string) and `type` (valid block type).
 *
 * @param {unknown} block - The block to validate
 * @param {number} index - Block index for error messages
 * @throws {Error} If validation fails
 */
function validateBlock(block, index) {
  if (block === null || typeof block !== 'object' || Array.isArray(block)) {
    throw new Error(`Block at index ${index} must be an object`);
  }

  // Required: id
  if (!Object.prototype.hasOwnProperty.call(block, 'id') || typeof block.id !== 'string' || block.id.trim() === '') {
    throw new Error(`Block at index ${index} is missing required field 'id' (must be a non-empty string)`);
  }

  // Required: type
  if (!Object.prototype.hasOwnProperty.call(block, 'type') || typeof block.type !== 'string') {
    throw new Error(`Block '${block.id}' (index ${index}) is missing required field 'type'`);
  }

  if (!VALID_BLOCK_TYPES.has(block.type)) {
    throw new Error(
      `Block '${block.id}' (index ${index}) has invalid type '${block.type}'. ` +
      `Valid types: ${[...VALID_BLOCK_TYPES].join(', ')}`
    );
  }

  // llm+cli blocks require 'then' or 'command'
  if (block.type === 'llm+cli' && !block.then && !block.command) {
    throw new Error(
      `Block '${block.id}' (index ${index}) is type 'llm+cli' but missing 'then' or 'command' field`
    );
  }
}

/**
 * Validate the top-level recipe structure.
 *
 * @param {unknown} recipe - The parsed YAML object
 * @throws {Error} If validation fails
 */
function validateRecipe(recipe) {
  if (recipe === null || typeof recipe !== 'object' || Array.isArray(recipe)) {
    throw new Error('Recipe must be a YAML object (mapping)');
  }

  if (!Object.prototype.hasOwnProperty.call(recipe, 'name') || typeof recipe.name !== 'string' || recipe.name.trim() === '') {
    throw new Error("Recipe is missing required field 'name'");
  }

  // Two recipe formats:
  //   - Sequencer format (execute): has 'blocks' array with type/id/instruction
  //   - Data format (specify): has 'steps' array with id/agents/config only
  const hasBlocks = Object.prototype.hasOwnProperty.call(recipe, 'blocks') && Array.isArray(recipe.blocks);
  const hasSteps = Object.prototype.hasOwnProperty.call(recipe, 'steps') && Array.isArray(recipe.steps);

  if (!hasBlocks && !hasSteps) {
    throw new Error("Recipe is missing required field 'blocks' or 'steps' (must be an array)");
  }

  if (hasBlocks) {
    if (recipe.blocks.length === 0) {
      throw new Error("Recipe 'blocks' array must not be empty");
    }

    for (let i = 0; i < recipe.blocks.length; i++) {
      validateBlock(recipe.blocks[i], i);
    }

    // Validate execute recipe extensions if present
    validateExecuteExtensions(recipe);
  }

  if (hasSteps) {
    if (recipe.steps.length === 0) {
      throw new Error("Recipe 'steps' array must not be empty");
    }

    for (let i = 0; i < recipe.steps.length; i++) {
      validateStep(recipe.steps[i], i);
    }
  }
}

// ---------------------------------------------------------------------------
// Agent validation
// ---------------------------------------------------------------------------

/**
 * Check that all agent types referenced in recipe steps have corresponding
 * .claude/agents/{type}.md files. Built-in types (Explore, Plan) are skipped.
 *
 * @param {object} recipe - Parsed recipe object
 * @returns {Array<{step: string, agent: string, path: string}>} Missing agents
 */
export function validateAgentsExist(recipe) {
  const missing = [];
  if (!recipe.steps) return missing;

  for (const step of recipe.steps) {
    if (!step.agents) continue;
    for (const agent of step.agents) {
      if (BUILTIN_AGENT_TYPES.has(agent.type)) continue;
      // Guard against path traversal in agent type names
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(agent.type)) {
        missing.push({ step: step.id, agent: agent.type, path: 'invalid-agent-type' });
        continue;
      }
      const agentPath = join(PROJECT_ROOT, '.claude', 'agents', `${agent.type}.md`);
      if (!existsSync(agentPath)) {
        missing.push({ step: step.id, agent: agent.type, path: agentPath });
      }
    }
  }
  return missing;
}

/**
 * Get the agents array for a specific step in a recipe.
 *
 * @param {string} recipeName - Recipe name
 * @param {string} stepId - Step ID to look up
 * @param {string} skillName - Skill name
 * @returns {Array<{type: string, output: string}>|null} Agents array or null if step has no agents
 */
export function getStepAgents(recipeName, stepId, skillName) {
  try {
    const recipe = loadRecipe(recipeName, {}, skillName);
    if (!recipe.steps) return null;
    const step = recipe.steps.find((s) => s.id === stepId);
    if (!step || !step.agents) return null;
    return step.agents;
  } catch (err) {
    console.warn(`Warning: getStepAgents failed for recipe '${recipeName}': ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and parse a named recipe from the skill's recipes directory.
 * Template variables in block fields are resolved using the provided vars.
 *
 * @param {string} recipeName - Name of the recipe (without extension)
 * @param {Record<string, string>} [vars={}] - Template variables to substitute
 * @param {string} skillName - The skill name (e.g. 'specify', 'execute')
 * @returns {object} Parsed and validated recipe object with resolved templates
 * @throws {Error} If the recipe file cannot be found, parsed, or validated
 */
export function loadRecipe(recipeName, vars = {}, skillName) {
  if (!skillName || typeof skillName !== 'string') {
    throw new Error("loadRecipe() requires a skillName argument (e.g. specify, execute)");
  }

  const dir = recipesDir(skillName);

  // Try .yaml first, then .yml
  const yamlPath = join(dir, `${recipeName}.yaml`);
  const ymlPath = join(dir, `${recipeName}.yml`);

  let filePath;
  if (existsSync(yamlPath)) {
    filePath = yamlPath;
  } else if (existsSync(ymlPath)) {
    filePath = ymlPath;
  } else {
    throw new Error(
      `Recipe '${recipeName}' not found in ${dir}. Looked for:\n  ${yamlPath}\n  ${ymlPath}`
    );
  }

  const raw = readFileSync(filePath, 'utf8');
  return parseRecipeYaml(raw, vars);
}

/**
 * Parse a YAML string as a recipe (useful for tests with inline fixtures).
 * Template variables are resolved using the provided vars.
 *
 * @param {string} yamlString - Raw YAML content
 * @param {Record<string, string>} [vars={}] - Template variables to substitute
 * @returns {object} Parsed and validated recipe object with resolved templates
 * @throws {Error} If parsing or validation fails
 */
export function parseRecipeYaml(yamlString, vars = {}) {
  let parsed;
  try {
    parsed = yaml.load(yamlString);
  } catch (err) {
    throw new Error(`Failed to parse recipe YAML: ${err.message}`);
  }

  validateRecipe(parsed);

  // Deep-clone to avoid mutating parsed object, then resolve templates
  const recipe = { ...parsed };
  if (parsed.blocks) {
    recipe.blocks = resolveTemplates(parsed.blocks, vars);
  }
  if (parsed.steps) {
    recipe.steps = resolveTemplates(parsed.steps, vars);
  }

  // Preserve and resolve execute extensions if present
  if (parsed.todo_substeps) {
    recipe.todo_substeps = resolveTemplates(parsed.todo_substeps, vars);
  }
  if (parsed.finalize) {
    recipe.finalize = resolveTemplates(parsed.finalize, vars);
  }

  return recipe;
}
