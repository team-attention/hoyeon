/**
 * recipe-loader.js — Load and validate YAML recipe files for dev-cli sessions
 *
 * Recipes live at: dev-cli/recipes/{name}.yaml (or .yml)
 * Uses js-yaml for parsing.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to the recipes directory.
 * Recipes are stored at dev-cli/recipes/ relative to the package root.
 */
const RECIPES_DIR = join(__dirname, '..', '..', 'recipes');

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

  if (!Object.prototype.hasOwnProperty.call(recipe, 'blocks') || !Array.isArray(recipe.blocks)) {
    throw new Error("Recipe is missing required field 'blocks' (must be an array)");
  }

  if (recipe.blocks.length === 0) {
    throw new Error("Recipe 'blocks' array must not be empty");
  }

  for (let i = 0; i < recipe.blocks.length; i++) {
    validateBlock(recipe.blocks[i], i);
  }

  // Validate execute recipe extensions if present
  validateExecuteExtensions(recipe);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and parse a named recipe from the recipes directory.
 * Template variables in block fields are resolved using the provided vars.
 *
 * @param {string} recipeName - Name of the recipe (without extension)
 * @param {Record<string, string>} [vars={}] - Template variables to substitute
 * @returns {object} Parsed and validated recipe object with resolved templates
 * @throws {Error} If the recipe file cannot be found, parsed, or validated
 */
export function loadRecipe(recipeName, vars = {}) {
  // Try .yaml first, then .yml
  const yamlPath = join(RECIPES_DIR, `${recipeName}.yaml`);
  const ymlPath = join(RECIPES_DIR, `${recipeName}.yml`);

  let filePath;
  if (existsSync(yamlPath)) {
    filePath = yamlPath;
  } else if (existsSync(ymlPath)) {
    filePath = ymlPath;
  } else {
    throw new Error(
      `Recipe '${recipeName}' not found. Looked for:\n  ${yamlPath}\n  ${ymlPath}`
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
  const recipe = {
    ...parsed,
    blocks: resolveTemplates(parsed.blocks, vars),
  };

  // Preserve and resolve execute extensions if present
  if (parsed.todo_substeps) {
    recipe.todo_substeps = resolveTemplates(parsed.todo_substeps, vars);
  }
  if (parsed.finalize) {
    recipe.finalize = resolveTemplates(parsed.finalize, vars);
  }

  return recipe;
}
