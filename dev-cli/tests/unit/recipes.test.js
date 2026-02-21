/**
 * recipes.test.js — Unit tests for the 4 recipe YAML files
 * Verifies structure, block counts, block IDs, and YAML parseability.
 * Uses node:test and node:assert (no external test frameworks).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { loadRecipe, parseRecipeYaml } from '../../src/core/recipe-loader.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, '..', '..', 'recipes');

// Valid block types from recipe-loader
const VALID_BLOCK_TYPES = new Set([
  'cli',
  'llm',
  'llm-loop',
  'llm+cli',
  'subagent',
  'subagent-loop',
]);

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function readRawYaml(recipeName) {
  const filePath = join(RECIPES_DIR, `${recipeName}.yaml`);
  return readFileSync(filePath, 'utf8');
}

// ---------------------------------------------------------------------------
// Tests: All 4 recipes load without error
// ---------------------------------------------------------------------------

describe('loadRecipe() — all 4 recipes load without error', () => {
  test('specify-standard-interactive loads successfully', () => {
    assert.doesNotThrow(() => {
      loadRecipe('specify-standard-interactive', { name: 'test-session' });
    });
  });

  test('specify-standard-autopilot loads successfully', () => {
    assert.doesNotThrow(() => {
      loadRecipe('specify-standard-autopilot', { name: 'test-session' });
    });
  });

  test('specify-quick-interactive loads successfully', () => {
    assert.doesNotThrow(() => {
      loadRecipe('specify-quick-interactive', { name: 'test-session' });
    });
  });

  test('specify-quick-autopilot loads successfully', () => {
    assert.doesNotThrow(() => {
      loadRecipe('specify-quick-autopilot', { name: 'test-session' });
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Block counts
// ---------------------------------------------------------------------------

describe('Block counts', () => {
  test('specify-standard-interactive has 11 blocks', () => {
    const recipe = loadRecipe('specify-standard-interactive');
    assert.equal(recipe.blocks.length, 11, `Expected 11 blocks, got ${recipe.blocks.length}`);
  });

  test('specify-standard-autopilot has 10 blocks', () => {
    const recipe = loadRecipe('specify-standard-autopilot');
    assert.equal(recipe.blocks.length, 10, `Expected 10 blocks, got ${recipe.blocks.length}`);
  });

  test('specify-quick-interactive has 8 blocks', () => {
    const recipe = loadRecipe('specify-quick-interactive');
    assert.equal(recipe.blocks.length, 8, `Expected 8 blocks, got ${recipe.blocks.length}`);
  });

  test('specify-quick-autopilot has 9 blocks', () => {
    const recipe = loadRecipe('specify-quick-autopilot');
    assert.equal(recipe.blocks.length, 9, `Expected 9 blocks, got ${recipe.blocks.length}`);
  });
});

// ---------------------------------------------------------------------------
// Tests: First block is 'init', last block is 'cleanup'
// ---------------------------------------------------------------------------

describe('First block is init, last block is cleanup', () => {
  const recipeNames = [
    'specify-standard-interactive',
    'specify-standard-autopilot',
    'specify-quick-interactive',
    'specify-quick-autopilot',
  ];

  for (const recipeName of recipeNames) {
    test(`${recipeName}: first block is 'init'`, () => {
      const recipe = loadRecipe(recipeName);
      const first = recipe.blocks[0];
      assert.equal(first.id, 'init', `First block should be 'init', got '${first.id}'`);
    });

    test(`${recipeName}: last block is 'cleanup'`, () => {
      const recipe = loadRecipe(recipeName);
      const last = recipe.blocks[recipe.blocks.length - 1];
      assert.equal(last.id, 'cleanup', `Last block should be 'cleanup', got '${last.id}'`);
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: Block IDs are unique within each recipe
// ---------------------------------------------------------------------------

describe('Block IDs are unique within each recipe', () => {
  const recipeNames = [
    'specify-standard-interactive',
    'specify-standard-autopilot',
    'specify-quick-interactive',
    'specify-quick-autopilot',
  ];

  for (const recipeName of recipeNames) {
    test(`${recipeName}: all block IDs are unique`, () => {
      const recipe = loadRecipe(recipeName);
      const ids = recipe.blocks.map((b) => b.id);
      const uniqueIds = new Set(ids);
      assert.equal(
        uniqueIds.size,
        ids.length,
        `Recipe '${recipeName}' has duplicate block IDs: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: All block types are valid
// ---------------------------------------------------------------------------

describe('All block types are valid', () => {
  const recipeNames = [
    'specify-standard-interactive',
    'specify-standard-autopilot',
    'specify-quick-interactive',
    'specify-quick-autopilot',
  ];

  for (const recipeName of recipeNames) {
    test(`${recipeName}: all block types are valid`, () => {
      const recipe = loadRecipe(recipeName);
      for (const block of recipe.blocks) {
        assert.ok(
          VALID_BLOCK_TYPES.has(block.type),
          `Block '${block.id}' has invalid type '${block.type}' in '${recipeName}'`,
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: YAML files are parseable by js-yaml without error
// ---------------------------------------------------------------------------

describe('YAML files parseable by js-yaml directly', () => {
  const recipeNames = [
    'specify-standard-interactive',
    'specify-standard-autopilot',
    'specify-quick-interactive',
    'specify-quick-autopilot',
  ];

  for (const recipeName of recipeNames) {
    test(`${recipeName}.yaml parses as valid YAML`, () => {
      const raw = readRawYaml(recipeName);
      assert.doesNotThrow(() => {
        const parsed = yaml.load(raw);
        assert.ok(parsed !== null && typeof parsed === 'object', 'Parsed YAML must be an object');
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: parseRecipeYaml() with inline YAML from files (round-trip)
// ---------------------------------------------------------------------------

describe('parseRecipeYaml() round-trip from file content', () => {
  test('standard-interactive: parses and validates all 11 blocks', () => {
    const raw = readRawYaml('specify-standard-interactive');
    const recipe = parseRecipeYaml(raw);
    assert.equal(recipe.blocks.length, 11);
  });

  test('quick-autopilot: parses and validates all 9 blocks', () => {
    const raw = readRawYaml('specify-quick-autopilot');
    const recipe = parseRecipeYaml(raw);
    assert.equal(recipe.blocks.length, 9);
  });
});

// ---------------------------------------------------------------------------
// Tests: standard-interactive specific block IDs
// ---------------------------------------------------------------------------

describe('specify-standard-interactive block sequence', () => {
  test('contains all 11 expected block IDs in order', () => {
    const recipe = loadRecipe('specify-standard-interactive');
    const ids = recipe.blocks.map((b) => b.id);
    const expected = [
      'init',
      'classify-intent',
      'explore-full',
      'interview',
      'decision-confirm',
      'analyze-full',
      'codex-synth',
      'generate-plan',
      'review-full',
      'summary',
      'cleanup',
    ];
    assert.deepEqual(ids, expected);
  });

  test('interview block is llm-loop type', () => {
    const recipe = loadRecipe('specify-standard-interactive');
    const interview = recipe.blocks.find((b) => b.id === 'interview');
    assert.ok(interview, 'interview block must exist');
    assert.equal(interview.type, 'llm-loop');
  });

  test('interview instruction is rich (>100 words)', () => {
    const recipe = loadRecipe('specify-standard-interactive');
    const interview = recipe.blocks.find((b) => b.id === 'interview');
    assert.ok(interview, 'interview block must exist');
    assert.ok(typeof interview.instruction === 'string', 'instruction must be a string');
    const wordCount = interview.instruction.trim().split(/\s+/).length;
    assert.ok(
      wordCount > 100,
      `Interview instruction should be >100 words, got ${wordCount} words`,
    );
  });

  test('interview instruction contains question principles (ASK, INVESTIGATE, PROPOSE)', () => {
    const recipe = loadRecipe('specify-standard-interactive');
    const interview = recipe.blocks.find((b) => b.id === 'interview');
    const instr = interview.instruction;
    assert.ok(instr.includes('ASK'), 'instruction should mention what to ASK');
    assert.ok(instr.includes('INVESTIGATE'), 'instruction should mention what to INVESTIGATE');
    assert.ok(instr.includes('PROPOSE'), 'instruction should mention what to PROPOSE');
  });

  test('explore-full has 4 agents', () => {
    const recipe = loadRecipe('specify-standard-interactive');
    const explore = recipe.blocks.find((b) => b.id === 'explore-full');
    assert.ok(explore, 'explore-full block must exist');
    assert.equal(explore.agents.length, 4);
  });

  test('review-full is subagent-loop type', () => {
    const recipe = loadRecipe('specify-standard-interactive');
    const review = recipe.blocks.find((b) => b.id === 'review-full');
    assert.ok(review, 'review-full block must exist');
    assert.equal(review.type, 'subagent-loop');
  });
});

// ---------------------------------------------------------------------------
// Tests: quick-autopilot specific block IDs
// ---------------------------------------------------------------------------

describe('specify-quick-autopilot block sequence', () => {
  test('contains all 9 expected block IDs in order', () => {
    const recipe = loadRecipe('specify-quick-autopilot');
    const ids = recipe.blocks.map((b) => b.id);
    const expected = [
      'init',
      'classify-intent',
      'explore-lite',
      'auto-assume',
      'analyze-lite',
      'generate-plan',
      'review-once',
      'summary',
      'cleanup',
    ];
    assert.deepEqual(ids, expected);
  });

  test('explore-lite has 2 agents', () => {
    const recipe = loadRecipe('specify-quick-autopilot');
    const explore = recipe.blocks.find((b) => b.id === 'explore-lite');
    assert.ok(explore, 'explore-lite block must exist');
    assert.equal(explore.agents.length, 2);
  });

  test('analyze-lite has 1 agent (tradeoff-analyzer)', () => {
    const recipe = loadRecipe('specify-quick-autopilot');
    const analyze = recipe.blocks.find((b) => b.id === 'analyze-lite');
    assert.ok(analyze, 'analyze-lite block must exist');
    assert.equal(analyze.agents.length, 1);
    assert.equal(analyze.agents[0].type, 'tradeoff-analyzer');
  });

  test('does not contain interview or decision-confirm blocks', () => {
    const recipe = loadRecipe('specify-quick-autopilot');
    const ids = recipe.blocks.map((b) => b.id);
    assert.ok(!ids.includes('interview'), 'quick-autopilot should not have interview block');
    assert.ok(
      !ids.includes('decision-confirm'),
      'quick-autopilot should not have decision-confirm block',
    );
  });

  test('auto-assume block is cli type', () => {
    const recipe = loadRecipe('specify-quick-autopilot');
    const autoAssume = recipe.blocks.find((b) => b.id === 'auto-assume');
    assert.ok(autoAssume, 'auto-assume block must exist');
    assert.equal(autoAssume.type, 'cli');
  });
});

// ---------------------------------------------------------------------------
// Tests: standard-autopilot specific checks
// ---------------------------------------------------------------------------

describe('specify-standard-autopilot block sequence', () => {
  test('contains 10 expected block IDs', () => {
    const recipe = loadRecipe('specify-standard-autopilot');
    const ids = recipe.blocks.map((b) => b.id);
    const expected = [
      'init',
      'classify-intent',
      'explore-full',
      'auto-assume',
      'analyze-full',
      'codex-synth',
      'generate-plan',
      'review-full',
      'summary',
      'cleanup',
    ];
    assert.deepEqual(ids, expected);
  });

  test('does not contain interview block', () => {
    const recipe = loadRecipe('specify-standard-autopilot');
    const ids = recipe.blocks.map((b) => b.id);
    assert.ok(!ids.includes('interview'), 'standard-autopilot should not have interview block');
  });

  test('does not contain decision-confirm block', () => {
    const recipe = loadRecipe('specify-standard-autopilot');
    const ids = recipe.blocks.map((b) => b.id);
    assert.ok(
      !ids.includes('decision-confirm'),
      'standard-autopilot should not have decision-confirm block',
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: quick-interactive specific checks
// ---------------------------------------------------------------------------

describe('specify-quick-interactive block sequence', () => {
  test('contains 8 expected block IDs', () => {
    const recipe = loadRecipe('specify-quick-interactive');
    const ids = recipe.blocks.map((b) => b.id);
    const expected = [
      'init',
      'classify-intent',
      'explore-lite',
      'interview',
      'generate-plan',
      'review-once',
      'summary',
      'cleanup',
    ];
    assert.deepEqual(ids, expected);
  });

  test('explore-lite has 2 agents', () => {
    const recipe = loadRecipe('specify-quick-interactive');
    const explore = recipe.blocks.find((b) => b.id === 'explore-lite');
    assert.ok(explore, 'explore-lite block must exist');
    assert.equal(explore.agents.length, 2);
  });

  test('does not contain analyze-full or codex-synth', () => {
    const recipe = loadRecipe('specify-quick-interactive');
    const ids = recipe.blocks.map((b) => b.id);
    assert.ok(!ids.includes('analyze-full'), 'quick-interactive should not have analyze-full');
    assert.ok(!ids.includes('codex-synth'), 'quick-interactive should not have codex-synth');
  });

  test('review-once is subagent type', () => {
    const recipe = loadRecipe('specify-quick-interactive');
    const review = recipe.blocks.find((b) => b.id === 'review-once');
    assert.ok(review, 'review-once block must exist');
    assert.equal(review.type, 'subagent');
  });
});

// ---------------------------------------------------------------------------
// Tests: Template variable substitution in recipe files
// ---------------------------------------------------------------------------

describe('Template variable substitution in recipe files', () => {
  test('standard-interactive: {name} resolved in init command', () => {
    const recipe = loadRecipe('specify-standard-interactive', { name: 'my-feature' });
    const init = recipe.blocks.find((b) => b.id === 'init');
    assert.ok(init.command.includes('my-feature'), 'init command should contain resolved name');
    assert.ok(!init.command.includes('{name}'), 'init command should not contain unresolved {name}');
  });

  test('quick-autopilot: {name} resolved in auto-assume command', () => {
    const recipe = loadRecipe('specify-quick-autopilot', { name: 'add-login' });
    const autoAssume = recipe.blocks.find((b) => b.id === 'auto-assume');
    assert.ok(
      autoAssume.command.includes('add-login'),
      'auto-assume command should contain resolved name',
    );
  });
});
