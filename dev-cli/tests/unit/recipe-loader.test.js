/**
 * recipe-loader.test.js — Unit tests for dev-cli/src/core/recipe-loader.js
 * Uses node:test and node:assert (no external test frameworks).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseRecipeYaml } from '../../src/core/recipe-loader.js';

// ---------------------------------------------------------------------------
// Inline YAML fixtures
// ---------------------------------------------------------------------------

const VALID_RECIPE_YAML = `
name: specify-standard-interactive
type: sequential
description: Full planning with user interaction
blocks:
  - id: init
    type: cli
    command: "dev-cli init {name} --standard --interactive"
  - id: classify-intent
    type: llm
    instruction: "Classify user intent for {name}"
    save: "dev-cli draft update {name} --section intent"
  - id: explore-full
    type: subagent
    agents:
      - type: Explore
        promptHint: "Find patterns for {name}"
        output: "findings/explore-1.md"
    parallel: true
    onComplete: "dev-cli draft import {name}"
  - id: interview
    type: llm-loop
    instruction: "Present exploration summary to user"
    save: "dev-cli draft update {name} --section decisions"
    exitCheck: "dev-cli draft validate {name}"
`;

const MISSING_ID_YAML = `
name: bad-recipe
blocks:
  - type: cli
    command: "echo hello"
`;

const MISSING_TYPE_YAML = `
name: bad-recipe
blocks:
  - id: do-something
    command: "echo hello"
`;

const INVALID_TYPE_YAML = `
name: bad-recipe
blocks:
  - id: do-unknown-thing
    type: quantum
    command: "something"
`;

const MISSING_BLOCKS_YAML = `
name: no-blocks-recipe
type: sequential
`;

const MISSING_NAME_YAML = `
type: sequential
blocks:
  - id: init
    type: cli
    command: "echo hello"
`;

const EMPTY_BLOCKS_YAML = `
name: empty-blocks
blocks: []
`;

// ---------------------------------------------------------------------------
// Tests: loadRecipe (via parseRecipeYaml)
// ---------------------------------------------------------------------------

describe('parseRecipeYaml() — valid recipe', () => {
  test('parses a valid recipe YAML string', () => {
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML);

    assert.equal(recipe.name, 'specify-standard-interactive');
    assert.equal(recipe.type, 'sequential');
    assert.ok(Array.isArray(recipe.blocks));
    assert.equal(recipe.blocks.length, 4);
  });

  test('preserves block structure and fields', () => {
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML);
    const [init, classify, explore, interview] = recipe.blocks;

    assert.equal(init.id, 'init');
    assert.equal(init.type, 'cli');
    assert.equal(classify.id, 'classify-intent');
    assert.equal(classify.type, 'llm');
    assert.equal(explore.id, 'explore-full');
    assert.equal(explore.type, 'subagent');
    assert.equal(interview.id, 'interview');
    assert.equal(interview.type, 'llm-loop');
  });

  test('accepts all valid block types', () => {
    const yaml = `
name: all-types
blocks:
  - id: b1
    type: cli
    command: "echo"
  - id: b2
    type: llm
    instruction: "do something"
  - id: b3
    type: llm-loop
    instruction: "loop"
    exitCheck: "check"
  - id: b4
    type: llm+cli
    instruction: "write"
    then: "run"
  - id: b5
    type: subagent
    agents: []
  - id: b6
    type: subagent-loop
    agents: []
    exitWhen: "done"
`;
    const recipe = parseRecipeYaml(yaml);
    assert.equal(recipe.blocks.length, 6);
    assert.equal(recipe.blocks[0].type, 'cli');
    assert.equal(recipe.blocks[1].type, 'llm');
    assert.equal(recipe.blocks[2].type, 'llm-loop');
    assert.equal(recipe.blocks[3].type, 'llm+cli');
    assert.equal(recipe.blocks[4].type, 'subagent');
    assert.equal(recipe.blocks[5].type, 'subagent-loop');
  });
});

describe('parseRecipeYaml() — template variable substitution', () => {
  test('replaces {name} in command fields', () => {
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML, { name: 'add-auth' });
    assert.equal(recipe.blocks[0].command, 'dev-cli init add-auth --standard --interactive');
  });

  test('replaces {name} in instruction fields', () => {
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML, { name: 'add-auth' });
    assert.equal(recipe.blocks[1].instruction, 'Classify user intent for add-auth');
  });

  test('replaces {name} in save fields', () => {
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML, { name: 'add-auth' });
    assert.equal(recipe.blocks[1].save, 'dev-cli draft update add-auth --section intent');
  });

  test('replaces {name} in nested agent fields', () => {
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML, { name: 'my-feature' });
    assert.equal(recipe.blocks[2].agents[0].promptHint, 'Find patterns for my-feature');
  });

  test('replaces {name} in onComplete fields', () => {
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML, { name: 'my-feature' });
    assert.equal(recipe.blocks[2].onComplete, 'dev-cli draft import my-feature');
  });

  test('replaces {name} in exitCheck fields', () => {
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML, { name: 'my-feature' });
    assert.equal(recipe.blocks[3].exitCheck, 'dev-cli draft validate my-feature');
  });

  test('leaves unknown placeholders unchanged', () => {
    const yaml = `
name: test
blocks:
  - id: b1
    type: cli
    command: "run {unknown} {name}"
`;
    const recipe = parseRecipeYaml(yaml, { name: 'foo' });
    assert.equal(recipe.blocks[0].command, 'run {unknown} foo');
  });

  test('works with empty vars (no substitution)', () => {
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML);
    assert.equal(recipe.blocks[0].command, 'dev-cli init {name} --standard --interactive');
  });

  test('supports multiple template variables', () => {
    const yaml = `
name: multi-var
blocks:
  - id: b1
    type: llm
    instruction: "Process {name} with {mode} mode"
`;
    const recipe = parseRecipeYaml(yaml, { name: 'my-session', mode: 'quick' });
    assert.equal(recipe.blocks[0].instruction, 'Process my-session with quick mode');
  });
});

describe('parseRecipeYaml() — validation errors', () => {
  test('throws if block is missing id', () => {
    assert.throws(
      () => parseRecipeYaml(MISSING_ID_YAML),
      /missing required field 'id'/,
    );
  });

  test('throws if block is missing type', () => {
    assert.throws(
      () => parseRecipeYaml(MISSING_TYPE_YAML),
      /missing required field 'type'/,
    );
  });

  test('rejects invalid block type (quantum)', () => {
    assert.throws(
      () => parseRecipeYaml(INVALID_TYPE_YAML),
      /invalid type 'quantum'/,
    );
  });

  test('throws if blocks array is missing', () => {
    assert.throws(
      () => parseRecipeYaml(MISSING_BLOCKS_YAML),
      /missing required field 'blocks'/,
    );
  });

  test('throws if blocks array is empty', () => {
    assert.throws(
      () => parseRecipeYaml(EMPTY_BLOCKS_YAML),
      /must not be empty/,
    );
  });

  test('throws if recipe name is missing', () => {
    assert.throws(
      () => parseRecipeYaml(MISSING_NAME_YAML),
      /missing required field 'name'/,
    );
  });

  test('throws on invalid YAML syntax', () => {
    assert.throws(
      () => parseRecipeYaml('name: [unclosed bracket\nblocks:'),
      /Failed to parse recipe YAML/,
    );
  });

  test('throws on non-object YAML (e.g. plain string)', () => {
    assert.throws(
      () => parseRecipeYaml('"just a string"'),
      /must be a YAML object/,
    );
  });
});
