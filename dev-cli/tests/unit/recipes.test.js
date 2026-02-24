/**
 * recipes.test.js — Unit tests for the 4 specify recipe YAML files (pure data format)
 *
 * Specify recipes use the `steps` array (SKILL.md-centric model).
 * No instruction/prompts/block types — just step IDs, agent lists, and config.
 *
 * Uses node:test and node:assert (no external test frameworks).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { loadRecipe, parseRecipeYaml, recipesDir } from '../../src/core/recipe-loader.js';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function readRawYaml(recipeName) {
  const filePath = `${recipesDir('specify')}/${recipeName}.yaml`;
  return readFileSync(filePath, 'utf8');
}

const ALL_RECIPES = [
  'specify-standard-interactive',
  'specify-standard-autopilot',
  'specify-quick-interactive',
  'specify-quick-autopilot',
];

// ---------------------------------------------------------------------------
// Tests: All 4 recipes load without error
// ---------------------------------------------------------------------------

describe('loadRecipe() — all 4 recipes load without error', () => {
  for (const name of ALL_RECIPES) {
    test(`${name} loads successfully`, () => {
      assert.doesNotThrow(() => {
        loadRecipe(name, { name: 'test-session' }, 'specify');
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: Recipes have steps (not blocks)
// ---------------------------------------------------------------------------

describe('Specify recipes use steps format (not blocks)', () => {
  for (const name of ALL_RECIPES) {
    test(`${name} has steps array, no blocks`, () => {
      const recipe = loadRecipe(name, {}, 'specify');
      assert.ok(Array.isArray(recipe.steps), `${name} should have steps array`);
      assert.equal(recipe.blocks, undefined, `${name} should NOT have blocks`);
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: Step counts
// ---------------------------------------------------------------------------

describe('Step counts', () => {
  test('specify-standard-interactive has 10 steps', () => {
    const recipe = loadRecipe('specify-standard-interactive', {}, 'specify');
    assert.equal(recipe.steps.length, 10);
  });

  test('specify-standard-autopilot has 8 steps', () => {
    const recipe = loadRecipe('specify-standard-autopilot', {}, 'specify');
    assert.equal(recipe.steps.length, 8);
  });

  test('specify-quick-interactive has 6 steps', () => {
    const recipe = loadRecipe('specify-quick-interactive', {}, 'specify');
    assert.equal(recipe.steps.length, 6);
  });

  test('specify-quick-autopilot has 7 steps', () => {
    const recipe = loadRecipe('specify-quick-autopilot', {}, 'specify');
    assert.equal(recipe.steps.length, 7);
  });
});

// ---------------------------------------------------------------------------
// Tests: First step is 'classify', last step is 'cleanup'
// ---------------------------------------------------------------------------

describe('First step is classify, last step is cleanup', () => {
  for (const name of ALL_RECIPES) {
    test(`${name}: first step is 'classify'`, () => {
      const recipe = loadRecipe(name, {}, 'specify');
      assert.equal(recipe.steps[0].id, 'classify');
    });

    test(`${name}: last step is 'cleanup'`, () => {
      const recipe = loadRecipe(name, {}, 'specify');
      assert.equal(recipe.steps[recipe.steps.length - 1].id, 'cleanup');
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: Step IDs are unique within each recipe
// ---------------------------------------------------------------------------

describe('Step IDs are unique within each recipe', () => {
  for (const name of ALL_RECIPES) {
    test(`${name}: all step IDs are unique`, () => {
      const recipe = loadRecipe(name, {}, 'specify');
      const ids = recipe.steps.map((s) => s.id);
      const uniqueIds = new Set(ids);
      assert.equal(
        uniqueIds.size,
        ids.length,
        `Recipe '${name}' has duplicate step IDs: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: No instruction/command fields (pure data format)
// ---------------------------------------------------------------------------

describe('Specify recipes contain no instruction fields (pure data)', () => {
  for (const name of ALL_RECIPES) {
    test(`${name} has no instruction or command fields`, () => {
      const recipe = loadRecipe(name, {}, 'specify');
      const json = JSON.stringify(recipe);
      assert.ok(!json.includes('"instruction"'), `${name} should not contain instruction fields`);
      assert.ok(!json.includes('"command"'), `${name} should not contain command fields`);
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: Mode configuration
// ---------------------------------------------------------------------------

describe('Mode configuration', () => {
  test('standard-interactive: depth=standard, interaction=interactive', () => {
    const recipe = loadRecipe('specify-standard-interactive', {}, 'specify');
    assert.equal(recipe.mode.depth, 'standard');
    assert.equal(recipe.mode.interaction, 'interactive');
  });

  test('standard-autopilot: depth=standard, interaction=autopilot', () => {
    const recipe = loadRecipe('specify-standard-autopilot', {}, 'specify');
    assert.equal(recipe.mode.depth, 'standard');
    assert.equal(recipe.mode.interaction, 'autopilot');
  });

  test('quick-interactive: depth=quick, interaction=interactive', () => {
    const recipe = loadRecipe('specify-quick-interactive', {}, 'specify');
    assert.equal(recipe.mode.depth, 'quick');
    assert.equal(recipe.mode.interaction, 'interactive');
  });

  test('quick-autopilot: depth=quick, interaction=autopilot', () => {
    const recipe = loadRecipe('specify-quick-autopilot', {}, 'specify');
    assert.equal(recipe.mode.depth, 'quick');
    assert.equal(recipe.mode.interaction, 'autopilot');
  });
});

// ---------------------------------------------------------------------------
// Tests: YAML files are parseable by js-yaml without error
// ---------------------------------------------------------------------------

describe('YAML files parseable by js-yaml directly', () => {
  for (const name of ALL_RECIPES) {
    test(`${name}.yaml parses as valid YAML`, () => {
      const raw = readRawYaml(name);
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
  test('standard-interactive: parses and validates all 10 steps', () => {
    const raw = readRawYaml('specify-standard-interactive');
    const recipe = parseRecipeYaml(raw);
    assert.equal(recipe.steps.length, 10);
  });

  test('quick-autopilot: parses and validates all 7 steps', () => {
    const raw = readRawYaml('specify-quick-autopilot');
    const recipe = parseRecipeYaml(raw);
    assert.equal(recipe.steps.length, 7);
  });
});

// ---------------------------------------------------------------------------
// Tests: specify-standard-interactive step sequence and agents
// ---------------------------------------------------------------------------

describe('specify-standard-interactive step details', () => {
  test('contains all 10 expected step IDs in order', () => {
    const recipe = loadRecipe('specify-standard-interactive', {}, 'specify');
    const ids = recipe.steps.map((s) => s.id);
    const expected = [
      'classify',
      'explore',
      'interview',
      'decision-confirm',
      'analyze',
      'decision-checkpoint',
      'codex-synth',
      'generate-plan',
      'review',
      'cleanup',
    ];
    assert.deepEqual(ids, expected);
  });

  test('explore step has 4 agents with parallel=true', () => {
    const recipe = loadRecipe('specify-standard-interactive', {}, 'specify');
    const explore = recipe.steps.find((s) => s.id === 'explore');
    assert.ok(explore, 'explore step must exist');
    assert.equal(explore.agents.length, 4);
    assert.equal(explore.parallel, true);
  });

  test('explore agents include Explore, docs-researcher, ux-reviewer', () => {
    const recipe = loadRecipe('specify-standard-interactive', {}, 'specify');
    const explore = recipe.steps.find((s) => s.id === 'explore');
    const types = explore.agents.map((a) => a.type);
    assert.ok(types.filter((t) => t === 'Explore').length === 2, 'should have 2 Explore agents');
    assert.ok(types.includes('docs-researcher'), 'should have docs-researcher');
    assert.ok(types.includes('ux-reviewer'), 'should have ux-reviewer');
  });

  test('analyze step has 4 agents', () => {
    const recipe = loadRecipe('specify-standard-interactive', {}, 'specify');
    const analyze = recipe.steps.find((s) => s.id === 'analyze');
    assert.ok(analyze, 'analyze step must exist');
    assert.equal(analyze.agents.length, 4);
    assert.equal(analyze.parallel, true);
    const types = analyze.agents.map((a) => a.type);
    assert.ok(types.includes('tradeoff-analyzer'));
    assert.ok(types.includes('gap-analyzer'));
  });

  test('review step has maxRounds=3', () => {
    const recipe = loadRecipe('specify-standard-interactive', {}, 'specify');
    const review = recipe.steps.find((s) => s.id === 'review');
    assert.ok(review, 'review step must exist');
    assert.equal(review.maxRounds, 3);
  });

  test('codex-synth step has codex-strategist agent', () => {
    const recipe = loadRecipe('specify-standard-interactive', {}, 'specify');
    const codex = recipe.steps.find((s) => s.id === 'codex-synth');
    assert.ok(codex, 'codex-synth step must exist');
    assert.equal(codex.agents.length, 1);
    assert.equal(codex.agents[0].type, 'codex-strategist');
  });
});

// ---------------------------------------------------------------------------
// Tests: specify-quick-autopilot step details
// ---------------------------------------------------------------------------

describe('specify-quick-autopilot step details', () => {
  test('contains all 7 expected step IDs in order', () => {
    const recipe = loadRecipe('specify-quick-autopilot', {}, 'specify');
    const ids = recipe.steps.map((s) => s.id);
    const expected = [
      'classify',
      'explore',
      'auto-assume',
      'analyze',
      'generate-plan',
      'review',
      'cleanup',
    ];
    assert.deepEqual(ids, expected);
  });

  test('explore step has 2 agents', () => {
    const recipe = loadRecipe('specify-quick-autopilot', {}, 'specify');
    const explore = recipe.steps.find((s) => s.id === 'explore');
    assert.ok(explore, 'explore step must exist');
    assert.equal(explore.agents.length, 2);
  });

  test('analyze step has 1 agent (tradeoff-analyzer, lite variant)', () => {
    const recipe = loadRecipe('specify-quick-autopilot', {}, 'specify');
    const analyze = recipe.steps.find((s) => s.id === 'analyze');
    assert.ok(analyze, 'analyze step must exist');
    assert.equal(analyze.agents.length, 1);
    assert.equal(analyze.agents[0].type, 'tradeoff-analyzer');
    assert.equal(analyze.agents[0].variant, 'lite');
  });

  test('does not contain interview or decision-confirm steps', () => {
    const recipe = loadRecipe('specify-quick-autopilot', {}, 'specify');
    const ids = recipe.steps.map((s) => s.id);
    assert.ok(!ids.includes('interview'), 'quick-autopilot should not have interview');
    assert.ok(!ids.includes('decision-confirm'), 'quick-autopilot should not have decision-confirm');
  });

  test('review step has maxRounds=1', () => {
    const recipe = loadRecipe('specify-quick-autopilot', {}, 'specify');
    const review = recipe.steps.find((s) => s.id === 'review');
    assert.ok(review, 'review step must exist');
    assert.equal(review.maxRounds, 1);
  });
});

// ---------------------------------------------------------------------------
// Tests: specify-standard-autopilot step details
// ---------------------------------------------------------------------------

describe('specify-standard-autopilot step details', () => {
  test('contains all 8 expected step IDs in order', () => {
    const recipe = loadRecipe('specify-standard-autopilot', {}, 'specify');
    const ids = recipe.steps.map((s) => s.id);
    const expected = [
      'classify',
      'explore',
      'auto-assume',
      'analyze',
      'codex-synth',
      'generate-plan',
      'review',
      'cleanup',
    ];
    assert.deepEqual(ids, expected);
  });

  test('does not contain interview step', () => {
    const recipe = loadRecipe('specify-standard-autopilot', {}, 'specify');
    const ids = recipe.steps.map((s) => s.id);
    assert.ok(!ids.includes('interview'), 'standard-autopilot should not have interview');
  });

  test('does not contain decision-confirm step', () => {
    const recipe = loadRecipe('specify-standard-autopilot', {}, 'specify');
    const ids = recipe.steps.map((s) => s.id);
    assert.ok(!ids.includes('decision-confirm'), 'standard-autopilot should not have decision-confirm');
  });

  test('explore step has 4 agents (same as standard-interactive)', () => {
    const recipe = loadRecipe('specify-standard-autopilot', {}, 'specify');
    const explore = recipe.steps.find((s) => s.id === 'explore');
    assert.equal(explore.agents.length, 4);
  });

  test('review step has maxRounds=3', () => {
    const recipe = loadRecipe('specify-standard-autopilot', {}, 'specify');
    const review = recipe.steps.find((s) => s.id === 'review');
    assert.equal(review.maxRounds, 3);
  });
});

// ---------------------------------------------------------------------------
// Tests: specify-quick-interactive step details
// ---------------------------------------------------------------------------

describe('specify-quick-interactive step details', () => {
  test('contains all 6 expected step IDs in order', () => {
    const recipe = loadRecipe('specify-quick-interactive', {}, 'specify');
    const ids = recipe.steps.map((s) => s.id);
    const expected = [
      'classify',
      'explore',
      'interview',
      'generate-plan',
      'review',
      'cleanup',
    ];
    assert.deepEqual(ids, expected);
  });

  test('explore step has 2 agents', () => {
    const recipe = loadRecipe('specify-quick-interactive', {}, 'specify');
    const explore = recipe.steps.find((s) => s.id === 'explore');
    assert.ok(explore, 'explore step must exist');
    assert.equal(explore.agents.length, 2);
  });

  test('does not contain analyze or codex-synth steps', () => {
    const recipe = loadRecipe('specify-quick-interactive', {}, 'specify');
    const ids = recipe.steps.map((s) => s.id);
    assert.ok(!ids.includes('analyze'), 'quick-interactive should not have analyze');
    assert.ok(!ids.includes('codex-synth'), 'quick-interactive should not have codex-synth');
  });

  test('review step has maxRounds=1', () => {
    const recipe = loadRecipe('specify-quick-interactive', {}, 'specify');
    const review = recipe.steps.find((s) => s.id === 'review');
    assert.ok(review, 'review step must exist');
    assert.equal(review.maxRounds, 1);
  });
});

// ---------------------------------------------------------------------------
// Tests: Agent output paths use correct prefixes
// ---------------------------------------------------------------------------

describe('Agent output paths use findings/ or analysis/ prefix', () => {
  for (const name of ALL_RECIPES) {
    test(`${name}: all agent outputs have valid prefix`, () => {
      const recipe = loadRecipe(name, {}, 'specify');
      for (const step of recipe.steps) {
        if (!step.agents) continue;
        for (const agent of step.agents) {
          if (!agent.output) continue;
          assert.ok(
            agent.output.startsWith('findings/') || agent.output.startsWith('analysis/'),
            `Agent output '${agent.output}' in step '${step.id}' should start with findings/ or analysis/`,
          );
        }
      }
    });
  }
});
