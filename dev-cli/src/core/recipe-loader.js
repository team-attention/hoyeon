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

  return recipe;
}
